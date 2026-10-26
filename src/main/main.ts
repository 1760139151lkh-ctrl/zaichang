import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  nativeImage,
  Notification,
  powerMonitor,
  protocol,
  safeStorage,
  session,
  shell,
  Tray,
} from 'electron';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Store } from './store';
import { LocalSearchService } from './search';
import { DraftStore } from './storage/drafts';
import { Harness } from './harness';
import { ZjuAdapter } from './zjuAdapter';
import { TiyiAdapter } from './tiyiAdapter';
import { TiyiSchoolSession } from './tiyiSchoolSession';
import { CampusMapAdapter } from './mapService';
import { MapLocationProvider } from './mapLocation';
import { CampusReferenceAdapter } from './capabilities/campus-reference';
const mapLocation = new MapLocationProvider();
import { friendlyError } from './provider';
import { createModelClient, usingLunaTestTransport } from './model-selection';
import { LUNA_MODEL, LUNA_DISPLAY_NAME } from './luna-provider';
import { actionCommandSchema, campusSchema, settingsSchema } from '../shared/schemas';
import { DEEPSEEK_MODEL, getDraftAttachments, withDraftAttachments, type Draft, type ImageAttachment, type Settings } from '../shared/types';
import campusExample from '../../examples/campus.example.json';
import { LIMITS } from '../shared/limits';
import { assertTestDataDirectory } from './testBoundary';
import { isEphemeral } from './runtime/policy';
import { conditionSchema } from '../shared/harness';
import { hasCredentials } from './runtime/redaction';
import { NativeControls } from './runtime/controls';
import { NativeCampusCalendar } from './runtime/campus-calendar';
import { agendaFocusSchema } from '../shared/agenda';
import { NativeStudyService } from './runtime/study-native';
import { NativeSourceBookmarkService } from './runtime/source-bookmark-native';
import { NativeKeepService } from './runtime/keep';
import { NativeAgendaOrigin } from './runtime/agenda-origin';
import { conversationBookmarkReferenceSchema } from '../shared/source-bookmark';
import { NativeRehearsalService } from './runtime/rehearsal-native';
import { NativeProgramLocalState } from './runtime/interactive-program-local-state';
import { NativeWorkoutService } from './runtime/workout-native';
import { rehearsalInteractionSchema } from '../shared/relationship-rehearsal';
import { configureNetwork } from './network';
import { materialReferenceSchema, materialTargetSchema, materialQuoteReferenceSchema } from '../shared/materials';
import { semanticSelectionSchema } from '../shared/scenes';
import { workspaceContextSchema } from '../shared/workspace-context';
import { studyInteractionSchema } from '../shared/study-presentation';
import { reflectiveLetterSourceInput, letterReferenceSchema, reflectiveLetterProjectInput } from '../shared/reflective-letter';
import { noteReferenceSchema } from '../shared/note-presentation';
import { preparationFocusReferenceSchema } from '../shared/presentation';
import { noteQuoteReferenceSchema } from '../shared/notes';
import { notebookQuoteReferenceSchema } from '../shared/notes';
import { sharedMapRouteSchema, mapRouteReferenceSchema } from '../shared/map-context';
import { companionSourceInputSchema, companionFollowupReferenceSchema } from '../shared/companion-source';
import { campusAcademicReadInputSchema } from '../shared/campus-academic';
import { curiosityFollowupReferenceSchema } from '../shared/curiosity-source';
import { interactiveProgramReferenceSchema } from '../shared/interactive-program';
import { createOpportunityScheduler } from './runtime/opportunity-scheduler';
import { calendarExportInput } from '../shared/calendar-export';
import { exportCalendarSnapshot } from './actions/calendar-export';

assertTestDataDirectory();
// The installed product owns a relocatable interpreter and pinned engine.
// Development and isolated tests can explicitly choose a runtime root.
if (app.isPackaged) process.env.ZAICHANG_RUNTIME_ROOT = path.join(process.resourcesPath, 'hermes-runtime');
else process.env.ZAICHANG_RUNTIME_ROOT ||= path.resolve(__dirname, '..');
if (app.isPackaged) process.env.ZAICHANG_MATERIAL_RUNTIME_ROOT = path.join(process.resourcesPath, 'material-runtime');
// Both development and the portable app use the same product-owned layout.
// No application request downloads a model or looks in a personal cache.
process.env.ZAICHANG_EMBEDDING_RUNTIME_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'embedding-runtime')
  : path.resolve(__dirname, 'embedding-runtime');
process.env.ZAICHANG_EMBEDDING_WORKER_PATH = path.join(process.env.ZAICHANG_EMBEDDING_RUNTIME_ROOT, 'worker.cjs');

// A repository command may inject the user's DPAPI-protected project credential
// for this process only. Capture it before Electron starts, then remove all model
// credentials from the inherited environment so unrelated child processes never
// receive them.
let projectDeepSeekKey = (process.env.ZAICHANG_PROJECT_DEEPSEEK_KEY || '').trim();
if (
  projectDeepSeekKey.length < 8 ||
  projectDeepSeekKey.length > 512 ||
  /\s/.test(projectDeepSeekKey)
)
  projectDeepSeekKey = '';
for (const name of [
  'ZAICHANG_PROJECT_DEEPSEEK_KEY',
  'ZAICHANG_TEST_DEEPSEEK_KEY',
  'ZAICHANG_ALLOW_LIVE_EVAL',
  'DEEPSEEK_API_KEY',
])
  delete process.env[name];

configureNetwork();

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
// Explicit profile override also makes packaged verification independent of personal data.
if (process.env.ZAICHANG_DATA_DIR) app.setPath('userData', path.resolve(process.env.ZAICHANG_DATA_DIR));
app.setName('在场');
// One companion per profile: a second launch brings the existing window back.
// The lock lives in the (possibly isolated) userData directory set above.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();
else app.on('second-instance', () => showWindow());
let window: BrowserWindow | undefined,
  store: Store,
  harness: Harness,
  zju: ZjuAdapter,
  map: CampusMapAdapter,
  keyPath = '';
let closing = false;
let draftCloseConfirmed = false;
let connectionController: AbortController | undefined;
let latestDeviceLocation: import('../shared/map-v2').LocationStatusResult | undefined;
let opportunityScheduler: ReturnType<typeof createOpportunityScheduler> | undefined;
let workouts: NativeWorkoutService | undefined;
let tiyiSchool: TiyiSchoolSession | undefined;
let tiyiConnectController: AbortController | undefined;
let workoutExitPending = false;
let workoutDisposed = false;
let tray: Tray | undefined;
const desktopNotifications = new Map<string, { cancel: () => void }>();
let quitting = false;
let trayNoticeShown = false;
/** Bring the one window back, wherever it went (tray, minimized, behind). */
function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function navigateTo(target?: import('./actions/reminders').DeliveryTarget) {
  showWindow();
  if (target?.preparationRef && store) store.runtime.presentation.focusPreparation(target.preparationRef);
  if (target && window && !window.isDestroyed()) window.webContents.send('zaichang:navigate', target);
}
/** Closing the window keeps her running in the tray unless the person chose
 * otherwise, so promised reminders and entrusted watches keep going. */
function keepsRunningInTray() {
  return process.env.ZAICHANG_TEST !== '1' && store?.settings().backgroundPresence !== 'quit';
}
function applyLoginItem() {
  if (process.env.ZAICHANG_TEST === '1' || !app.isPackaged) return;
  try {
    // The portable launcher removes its extracted process.execPath on exit.
    // Windows must start the enduring launcher, not that temporary child.
    const portable = process.env.PORTABLE_EXECUTABLE_FILE;
    const executable = process.platform === 'win32' && portable && path.isAbsolute(portable)
      && existsSync(portable) && statSync(portable).isFile() ? portable : process.execPath;
    app.setLoginItemSettings({ openAtLogin: store.settings().launchAtLogin === true, path: executable, args: ['--hidden'] });
  } catch { /* A platform without login items keeps the manual start. */ }
}
function ensureTray(): boolean {
  if (tray && !tray.isDestroyed()) return true;
  tray = undefined;
  if (process.env.ZAICHANG_TEST === '1') return false;
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), '前端视觉创新设计/运行素材/brand/window-gold.png')).resize({ width: 16, height: 16 }));
    const name = () => store.settings().persona.core.name.trim() || '在场';
    const menu = () => Menu.buildFromTemplate([
      { label: `打开在场`, click: () => showWindow() },
      { type: 'separator' },
      { label: '退出在场', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.setToolTip(`${name()} 在这儿`);
    tray.setContextMenu(menu());
    tray.on('click', () => showWindow());
    return true;
  } catch {
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = undefined;
    return false;
  }
}
function getKey() {
  if (projectDeepSeekKey) return projectDeepSeekKey;
  if (existsSync(keyPath)) {
    try {
      return safeStorage.decryptString(readFileSync(keyPath));
    } catch {
      // A corrupt local app key falls back to no credential.
    }
  }
  return '';
}
function saveKey(key: string) {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
  )
    throw new Error('系统密钥保护暂不可用，API Key 未保存。');
  writeFileSync(keyPath, safeStorage.encryptString(key), { mode: 0o600 });
}
function deleteKey() {
  if (existsSync(keyPath)) unlinkSync(keyPath);
  projectDeepSeekKey = '';
}
function state() {
  return decorateState(store.state(!!getKey()));
}
function decorateState(value: ReturnType<Store['state']>) {
  const luna = usingLunaTestTransport();
  return store.runtime.presentation.state({
    ...value,
    environment: store.runtime.environment.snapshot(),
    campusConnector: zju.describe(),
    modelRuntime: luna
      ? { displayName: LUNA_DISPLAY_NAME, model: LUNA_MODEL, providerId: 'openai-app-server', temporaryTestSubstitute: true as const, status: 'enabled' as const, productionDefault: 'DeepSeek' as const }
      : { displayName: 'DeepSeek', model: DEEPSEEK_MODEL, providerId: 'deepseek', temporaryTestSubstitute: false as const, status: (getKey() ? 'connected' : 'not_connected') as 'connected' | 'not_connected', productionDefault: 'DeepSeek' as const },
  });
}
function trusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
    throw new Error('无效的请求来源。');
  const url = new URL(event.senderFrame.url);
  if (
    !(url.protocol === 'app:' && url.hostname === 'zaichang') &&
    !(process.env.ZAICHANG_DEV === '1' && url.origin === 'http://127.0.0.1:5173')
  )
    throw new Error('无效的请求来源。');
}
function handle(name: string, fn: (data: any) => unknown | Promise<unknown>) {
  ipcMain.handle(name, async (event, data) => {
    trusted(event);
    const boundary = store ? `${store.kernel.epoch}:${store.kernel.policyRevision}:${store.runtime.policy.sourceBoundary}` : undefined;
    try {
      if (store && !store.runtime.presentation.permitsIpc(name)) throw new Error('当前为公开展示，请先回到私人视图操作个人内容。');
      const result = await fn(data);
      if (store && !store.runtime.presentation.permitsIpc(name)) throw new Error('展示范围已改变，这项私人结果没有交付到当前视图。');
      return result;
    } catch (error) {
      if (store && !store.runtime.presentation.permitsIpc(name)) throw new Error('当前为公开展示，这项私人操作的结果未交付。');
      if (error instanceof z.ZodError) throw new Error('请检查填写内容、长度和时间格式后重试。');
      throw error;
    } finally {
      opportunityScheduler?.wake();
      // A withdrawal may have taken effect even if a later part of the request
      // failed. Let every open view discard its old boundary in either case.
      if (store && boundary !== undefined && boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${store.runtime.policy.sourceBoundary}` &&
        window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('zaichang:event', { type: 'state', state: state() });
      }
    }
  });
}
let pendingSendSubmission: string | undefined;
let pendingSendController: AbortController | undefined;
function noRun() {
  if (harness.running || pendingSendSubmission) throw new Error('请先停止当前处理，再修改连接或资料。');
}
const id = z.string().min(1).max(100);
const attachmentIdSchema = z.string().uuid();
const textAttachmentSchema = z.union([
  z
    .object({
      kind: z.literal('text'),
      attachmentId: attachmentIdSchema.optional(),
      name: z.string().max(LIMITS.fileName),
      text: z.string().max(LIMITS.attachmentText),
      resource: materialReferenceSchema.optional(),
    })
    .strict(),
  z
    .object({
      name: z.string().max(LIMITS.fileName),
      attachmentId: attachmentIdSchema.optional(),
      text: z.string().max(LIMITS.attachmentText),
      resource: materialReferenceSchema.optional(),
    })
    .strict()
    .transform((value) => ({ kind: 'text' as const, ...value })),
]);
const imageAttachmentSchema = z
  .object({
    kind: z.literal('image'),
    attachmentId: attachmentIdSchema.optional(),
    name: z.string().max(LIMITS.fileName),
    mimeType: z.literal('image/jpeg'),
    dataUrl: z
      .string()
      .max(LIMITS.imageDataUrl)
      .refine((value) => value.startsWith('data:image/jpeg;base64,')),
    width: z.number().int().min(1).max(1600),
    height: z.number().int().min(1).max(1600),
  })
  .strict();
const draftSchema = z
  .object({
    text: z.string().max(LIMITS.draftText),
    attachment: z.union([textAttachmentSchema, imageAttachmentSchema]).nullable(),
    attachments: z.array(z.union([textAttachmentSchema, imageAttachmentSchema])).max(LIMITS.attachments).optional(),
    submission: z.object({ id: attachmentIdSchema, draftKey: id, controls: z.object({
      transmission: z.enum(['cloud_allowed', 'local_only']).optional(), memoryMode: z.enum(['relevant', 'current_sources_only', 'session_only', 'none']).optional(),
      retention: z.enum(['purpose_scoped', 'history_no_inference', 'session_only']).optional(), audience: z.enum(['self', 'group', 'public']).optional(),
    }).strict().optional(), materialDocument: z.object({
      resourceId: materialReferenceSchema.shape.resourceId, sha256: materialReferenceSchema.shape.sha256 }).strict().optional() }).strict().optional(),
  })
  .strict().superRefine((value, context) => {
    const attachments = getDraftAttachments(value);
    if (attachments.filter(item => item.kind === 'image').reduce((n, item) => n + (item.kind === 'image' ? item.dataUrl.length : 0), 0) > LIMITS.imageDataUrls)
      context.addIssue({ code: 'custom', message: '这几张图片合起来较大，请先留两张再继续。' });
    const ids = attachments.flatMap(item => item.attachmentId ? [item.attachmentId] : []);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: '同一份附件出现了两次，请移除重复的一份。' });
  }).transform(value => value.attachments ? withDraftAttachments(value, value.attachments) : value);
function draft(value: unknown): Draft {
  const parsed = draftSchema.safeParse(value);
  return parsed.success ? parsed.data : { text: '', attachment: null };
}

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  Menu.setApplicationMenu(null);
  const dataDir = app.getPath('userData');
  mkdirSync(dataDir, { recursive: true });
  keyPath = path.join(dataDir, 'deepseek-key.bin');
  store = new Store(path.join(dataDir, 'zaichang.sqlite'));
  const stopEnvironmentState = store.runtime.environment.onChanged(() => {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('zaichang:event', { type: 'state', state: state() });
  });
  store.onClose(stopEnvironmentState);
  const localSearch = new LocalSearchService(store);
  // The explicit project entry point means this app session should use the
  // project model rather than silently falling back to the demo responder.
  // No request is sent until the user starts a conversation.
  if (projectDeepSeekKey || usingLunaTestTransport()) store.saveSettings({ mode: 'deepseek' });
  zju = new ZjuAdapter(store);
  tiyiSchool = new TiyiSchoolSession({ parent: () => window });
  const savedTiyiVia = store.kernel.getMeta<unknown>('tiyi_connection_via', 'direct');
  let tiyiVia: 'direct' | 'webvpn' = savedTiyiVia === 'webvpn' ? 'webvpn' : 'direct';
  const tiyi = new TiyiAdapter(path.join(dataDir, 'tiyi'), {
    getTransport: () => tiyiVia === 'webvpn' ? (request, signal) => tiyiSchool!.request(request, signal) : undefined,
    connectorPath: app.isPackaged ? path.join(process.resourcesPath, 'tiyi-runtime', 'connector.py')
      : path.join(app.getAppPath(), 'dist-electron', 'tiyi-runtime', 'connector.py'),
    ...(app.isPackaged ? { python: path.join(process.env.ZAICHANG_RUNTIME_ROOT!, '.runtime', 'python', 'python.exe') } : {}),
  });
  store.runtime.connect({ tiyi });
  const mapProfileDirectory=path.join(homedir(), '.codex', 'skills', 'zju-campus-locator', 'data');
  let mapDirectory=path.join(app.getAppPath(), 'assets', 'map-v2');
  const mapLink=path.join(mapProfileDirectory,'shared-map.json');
  if(process.env.ZAICHANG_TEST!=='1'&&existsSync(mapLink)){
    try{const link=JSON.parse(readFileSync(mapLink,'utf8'));if(link.schema!=='zju-shared-map-link/v3'||typeof link.directory!=='string')throw new Error('map link');mapDirectory=path.resolve(link.directory);}
    catch{mapDirectory=path.join(mapProfileDirectory,'invalid-shared-map-link');}
  }
  map = new CampusMapAdapter(mapDirectory, {
    profileDirectory: process.env.ZAICHANG_TEST === '1' ? undefined : path.join(homedir(), '.codex', 'skills', 'zju-campus-locator', 'data'),
  });
  harness = new Harness(
    store,
    getKey,
    (event) => {
      if (event.type === 'state') opportunityScheduler?.wake();
      if (!window || window.isDestroyed()) return;
      if (event.type === 'state') window.webContents.send('zaichang:event', { ...event, state: decorateState(event.state) });
      else if (event.type === 'message') {
        if (event.message.role === 'user' && event.message.authoredSource && event.message.submissionId)
          drafts.admitSubmission(event.message);
        const message = store.runtime.presentation.message(event.message, { liveCuriosity: true, liveRehearsal: true, liveNote: true, liveCampus: true, liveProgram: true, liveAttachments: true }); if (message) window.webContents.send('zaichang:event', { ...event, message });
      }
      else if (!store.runtime.presentation.public) window.webContents.send('zaichang:event', event);
    },
    undefined,
    zju,
    map,
  );
  const controls = new NativeControls(store, harness);
  workouts = new NativeWorkoutService(store, map, mapLocation, safeStorage, value => {
    if (window && !window.isDestroyed() && !store.closed && !store.runtime.presentation.public)
      window.webContents.send('zaichang:workout', value);
  });
  store.runtime.connect({ workout: workouts });
  handle('workout:devices', () => workouts!.devices());
  handle('workout:state', () => workouts!.state());
  handle('workout:restore', () => workouts!.restore());
  handle('workout:start', value => workouts!.start(value));
  handle('workout:pause', value => workouts!.pause(value));
  handle('workout:resume', value => workouts!.resume(value));
  handle('workout:finish', value => workouts!.finish(value));
  handle('workout:cancel', async value => {
    try { return await workouts!.cancel(value); }
    finally { harness.stateChanged(); }
  });
  handle('workout:discard-recovery', async () => {
    try { return await workouts!.discardRecovery(); }
    finally { harness.stateChanged(); }
  });
  const tiyiGrantAllowed = (grant: 'campus:read' | 'campus:tiyi:read') =>
    store.runtime.policy.grants().includes(grant) && !store.runtime.policy.revoked().includes(grant);
  const tiyiStatus = () => ({ ...tiyi.describe(), via: tiyiVia, gateway: tiyiSchool!.state(),
    campusReadAllowed: tiyiGrantAllowed('campus:read'),
    readAllowed: tiyiGrantAllowed('campus:read') && tiyiGrantAllowed('campus:tiyi:read') });
  store.runtime.policy.onBarrier(() => {
    if (store.runtime.policy.revoked().some(grant => grant === 'campus:read' || grant === 'campus:tiyi:read')) {
      tiyiConnectController?.abort(); tiyiSchool?.cancelRequests(); tiyiSchool?.closeLogin();
    }
  });
  handle('tiyi:status', async raw => {
    const input = z.object({ refreshGateway: z.boolean().default(false) }).strict().parse(raw || {});
    if (input.refreshGateway) await tiyiSchool!.inspect(AbortSignal.timeout(25_000));
    return tiyiStatus();
  });
  handle('tiyi:connect', async raw => {
    const input = z.object({ via: z.enum(['direct', 'webvpn']).default('direct'), accountLogin: z.boolean().default(false) }).strict().parse(raw || {});
    tiyiConnectController?.abort(); tiyiSchool!.cancelRequests();
    const controller = new AbortController(); tiyiConnectController = controller;
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      store.kernel.write(() => store.kernel.setMeta('tiyi_connection_via', input.via));
      tiyiVia = input.via;
      if (!tiyiGrantAllowed('campus:read')) return { ...tiyiStatus(), check: { status: 'unavailable' as const,
        observedAt: new Date().toISOString(), reason: '校园资料的读取已关闭。在当前页面开启后，就能继续检查体艺连接。' } };
      if (tiyiVia === 'webvpn') {
        const gateway = await tiyiSchool!.inspect(controller.signal);
        controller.signal.throwIfAborted();
        if (gateway.gatewayStatus === 'unavailable') return { ...tiyiStatus(), check: { status: 'unavailable' as const,
          observedAt: new Date().toISOString(), reason: gateway.reason || '学校校园连接这次没有完整答复，可以稍后重试。' } };
        if (!gateway.gatewayAuthenticated || input.accountLogin) {
          await tiyiSchool!.openLogin(gateway.gatewayAuthenticated && input.accountLogin);
          return { ...tiyiStatus(), check: { status: 'auth_required' as const, observedAt: new Date().toISOString(),
            reason: gateway.gatewayAuthenticated ? '校园连接窗口已打开，请在校方页面完成体艺登录后继续。' : '校园连接窗口已打开，登录学校 WebVPN 后可继续。' } };
        }
      }
      const result = await tiyi.authenticate(controller.signal);
      controller.signal.throwIfAborted();
      if (result.status === 'fresh') {
        store.runtime.policy.grant('campus:tiyi:read');
        harness.stateChanged();
      }
      return { ...tiyiStatus(), check: { status: result.status, observedAt: result.observedAt,
        reason: result.error?.message || result.note } };
    } finally {
      clearTimeout(timer);
      if (tiyiConnectController === controller) tiyiConnectController = undefined;
    }
  });
  handle('tiyi:disconnect', () => {
    tiyiConnectController?.abort(); tiyiSchool!.cancelRequests(); tiyiSchool!.closeLogin();
    store.runtime.policy.revoke('campus:tiyi:read'); harness.stateChanged(); return tiyiStatus();
  });
  const campusCalendar = new NativeCampusCalendar(store);
  const agenda = store.runtime.nativeAgenda;
  const study = new NativeStudyService(store, store.runtime.studyPresentation);
  const sourceBookmarks = new NativeSourceBookmarkService(store);
  const kept = new NativeKeepService(store);
  handle('keep:snapshot', value => kept.snapshot(value));
  const agendaOrigin = new NativeAgendaOrigin(store, localSearch);
  handle('agenda:origin', value => agendaOrigin.resolve(value));
  const rehearsal = new NativeRehearsalService(store, store.runtime.rehearsals);
  handle('rehearsal:project', value => rehearsal.project(value));
  handle('note:project', value => {
    const runtime = store.runtime, operation = new AbortController(), remove = runtime.policy.onBarrier(() => operation.abort());
    try { return runtime.notePresentation.project(value, operation.signal); }
    finally { remove(); }
  });
  handle('study:project', value => study.project(value));
  handle('study:read', value => study.read(value));
  handle('study:bookmark-preview', value => study.previewBookmark(value));
  handle('study:bookmark-accept', value => study.acceptBookmark(value));
  handle('source-bookmark:preview', value => sourceBookmarks.preview(value));
  handle('source-bookmark:keep', value => sourceBookmarks.keep(value));
  handle('letter:project', value => {
    const runtime = store.runtime, boundary = `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`;
    if (runtime.presentation.public) throw new Error('先回到自己的对话，再打开那封信。');
    const scope = runtime.policy.hostScope(), operation = new AbortController();
    const remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const result = runtime.presentation.letterProject(scope, reflectiveLetterProjectInput.parse(value));
      operation.signal.throwIfAborted(); runtime.policy.validate(scope);
      if (runtime.presentation.public || boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new Error('资料或展示范围刚有变化，请从当前对话重新打开这封信。');
      return result;
    } finally { remove(); }
  });
  handle('letter:source', async value => {
    const runtime = store.runtime, boundary = `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`;
    if (runtime.presentation.public) throw new Error('先回到自己的对话，再看看那时的原话。');
    const scope = runtime.policy.hostScope(), operation = new AbortController();
    const remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const result = await runtime.reflectiveLetters.source(scope, reflectiveLetterSourceInput.parse(value), operation.signal);
      operation.signal.throwIfAborted(); runtime.policy.validate(scope);
      if (runtime.presentation.public || boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new Error('资料或展示范围刚有变化，请从当前这封信重新打开原话。');
      return result;
    } finally { remove(); }
  });
  handle('companion:source', async value => {
    const runtime = store.runtime, boundary = `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`;
    if (runtime.presentation.public) throw new Error('先回到自己的对话，再打开原来的材料。');
    const scope = runtime.policy.hostScope(), operation = new AbortController();
    const remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const result = runtime.companionSessions.source(scope, companionSourceInputSchema.parse(value));
      operation.signal.throwIfAborted(); runtime.policy.validate(scope);
      if (runtime.presentation.public || boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new Error('资料或展示范围刚有变化，请从当前停点重新打开原话。');
      return result;
    } finally { remove(); }
  });
  handle('campus:academic', async raw => {
    const runtime = store.runtime, boundary = `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`;
    if (runtime.presentation.public) throw new Error('先回到自己的对话，再打开成绩资料。');
    const input = campusAcademicReadInputSchema.parse(raw), operation = new AbortController(), remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const scene = await runtime.readCampusAcademic(input, operation.signal);
      operation.signal.throwIfAborted();
      if (runtime.presentation.public || boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new Error('资料或展示范围刚有变化，请从当前成绩地址重新打开。');
      return scene;
    } finally { remove(); }
  });
  handle('campus:schedule', value => campusCalendar.read(value));
  handle('agenda:day', async value => {
    const operation = new AbortController(), remove = store.runtime.policy.onBarrier(() => operation.abort());
    try { return await agenda.day(value, operation.signal); }
    finally { remove(); }
  });
  handle('agenda:preview-change', async value => {
    const operation = new AbortController(), remove = store.runtime.policy.onBarrier(() => operation.abort());
    try { return await agenda.preview(value, operation.signal); }
    finally { remove(); }
  });
  const programLocalState = new NativeProgramLocalState(store);
  handle('program:local-state:read', value => programLocalState.read(value));
  handle('program:local-state:save', value => programLocalState.save(value));
  store.runtime.policy.onBarrier(() => {
    mapLocation.cancel(); latestDeviceLocation = undefined; store.runtime.spatial.share({ enabled: false });
    queueMicrotask(() => { if (!store.closed) void store.runtime.reminders.retireInvalidNotifications().catch(() => {}); });
  });
  if (process.env.ZAICHANG_TEST !== '1') store.runtime.spatial.reference = new CampusReferenceAdapter(path.join(homedir(), '.codex', 'skills', 'zju-campus-locator'), (file, crop) => {
    let source = nativeImage.createFromBuffer(readFileSync(file));
    if (source.isEmpty()) throw new Error('俯瞰图像素不可读取。');
    let size = source.getSize();
    if (crop) { source = source.crop({ x: Math.floor(crop.x * size.width), y: Math.floor(crop.y * size.height), width: Math.max(1, Math.floor(crop.width * size.width)), height: Math.max(1, Math.floor(crop.height * size.height)) }); size = source.getSize(); }
    const scale = Math.min(1, 1600 / Math.max(size.width, size.height));
    if (scale < 1) source = source.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' });
    size = source.getSize();
    const dataUrl = 'data:image/jpeg;base64,' + source.toJPEG(85).toString('base64');
    if (dataUrl.length > LIMITS.imageDataUrl) throw new Error('当前图像范围超出输入上限，请选择局部。');
    return { kind: 'image', name: '官方俯瞰图', mimeType: 'image/jpeg', width: size.width, height: size.height, dataUrl };
  });
  handle('runtime:overview', () => controls.overview());
  handle('search:local', value => localSearch.search(value));
  handle('search:resolve', value => localSearch.resolve(value));
  handle('search:cancel', () => localSearch.cancel());
  handle('attention:list', value => controls.attentionList(value));
  handle('attention:change', value => controls.attentionChange(value));
  handle('runtime:adopt-world', (value) => controls.adoptWorld(value));
  handle('runtime:evidence', (value) => controls.evidence(value));
  handle('runtime:reply-sources', value => controls.replySources(value));
  handle('runtime:goal', (value) => controls.goal(value));
  handle('runtime:feedback', (value) => controls.feedback(value));
  handle('runtime:retry', (value) => controls.retry(value));
  handle('runtime:reconcile', (value) => controls.reconcile(value));
  handle('runtime:action', (value) => {
    const actionId = id.parse(value),
      scope = store.runtime.policy.hostScope();
    const action = store.runtime.actions.get(scope, actionId) || null;
    const recordId = action?.capability === 'local.agenda.change' ? action.arguments.targetId : action?.id;
    return {
      action,
      ...(action?.planningOffer ? { planningOffer: store.runtime.planningOffers.state(scope, action) } : {}),
      receipts: store.runtime.actions.receipts(scope, actionId),
      ...(action && ['local.agenda.save', 'local.agenda.change'].includes(action.capability) && typeof recordId === 'string'
        ? { localRecord: store.runtime.calendar.read(recordId) || null } : {}),
    };
  });
  handle('runtime:permission', (value) => controls.permission(value));
  const root = path.join(app.getAppPath(), 'dist');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'zaichang') return new Response('Forbidden', { status: 403 });
    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Invalid path', { status: 400 });
    }
    const file = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile())
      return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_w, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  handle('state', state);
  handle('environment:read', value => {
    z.undefined().parse(value);
    return store.runtime.environment.read();
  });
  handle('notes:list', value => store.notes.list(value));
  handle('notes:draft', value => store.notes.nativeDraft(value));
  handle('notes:read', value => store.notes.read(value));
  handle('notes:create', value => store.notes.create(value));
  handle('notes:update', value => store.notes.update(value));
  handle('notes:state', value => store.notes.changeState(value));
  handle('notes:undo', value => store.notes.undo(value));
  handle('notes:history', value => store.notes.history(value));
  handle('notes:quote', value => value && typeof value === 'object' && 'noteId' in value
    ? store.notes.notebookQuote(value) : store.notes.quote(noteQuoteReferenceSchema.parse(value)));
  handle('messages', (value) => store.runtime.presentation.public ? [] : store.messages(id.parse(value)).flatMap(message => { const safe = store.runtime.presentation.message(message); return safe ? [safe] : []; }));
  handle('presentation:surface', async value => {
    const mode = z.enum(['private', 'public']).parse(value);
    store.runtime.presentation.setSurface(mode);
    if (mode === 'public') { localSearch.cancel(); mapLocation.cancel(); latestDeviceLocation = undefined; connectionController?.abort(); tiyiConnectController?.abort(); tiyiSchool?.cancelRequests(); tiyiSchool?.closeLogin(); store.runtime.spatial.share({ enabled: false }); await workouts?.suspend().catch(() => undefined); await harness.stop(); store.runtime.materials.endConversation(); }
    return state();
  });
  handle('presentation:select', value => {
    const input = z.object({ sessionId: id, id: z.string().max(160), revision: z.number().int().positive() }).strict().parse(value);
    store.runtime.presentation.selectArtifact(input.sessionId, input.id, input.revision); return state();
  });
  handle('presentation:clear', () => { store.runtime.presentation.clearSelection(); return state(); });
  handle('presentation:select-matter', value => {
    const input = z.object({ id: z.string().min(1).max(160), revision: z.number().int().positive() }).strict().parse(value);
    store.runtime.presentation.selectMatter(input.id, input.revision); return state();
  });
  handle('matter:selection', value => { const changed = controls.matterSelection(value); return { ...changed, state: state() }; });
  handle('preparation:open', value => {
    if (!store.runtime.presentation.focusPreparation(preparationFocusReferenceSchema.parse(value)))
      throw new Error('这份准备已经变化或收起来了，请回到现在的那一份。');
    return state();
  });
  handle('help:action', value => { controls.help(value); return state(); });
  handle('response:exposure', value => controls.responseExposure(value));
  handle('release:edit', value => { const message = controls.editRelease(value); harness.invalidateConversation(message.sessionId); return message; });
  const drafts = new DraftStore(store);
  handle('draft', (value) => draft(drafts.get(id.parse(value))));
  handle('draft:info', value => drafts.info(id.parse(value)));
  handle('draft:unsaved', () => drafts.unsaved());
  handle('draft:submissions', () => drafts.submissions().map(item => {
    const admitted = drafts.submissionAdmission(item.id);
    return { ...item, processing: pendingSendSubmission === item.draft.submission!.id || harness.submissionPending(item.draft.submission!.id),
      ...(admitted ? { admitted } : {}) };
  }));
  handle('draft:persist', value => {
    const input = z.object({ id, digest: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict().parse(value);
    drafts.persist(input.id, input.digest);
    if (!store.runtime.presentation.public && window && !window.isDestroyed())
      window.webContents.send('zaichang:event', { type: 'conversations', conversations: store.conversations() });
  });
  handle('draft:save', (value) => {
    const input = z
      .object({
        id,
        retention: z.literal('session_only').optional(),
        privacyEpoch: z.number().int().positive().optional(),
        draft: draftSchema,
      })
      .parse(value);
    drafts.save(input.id, input.draft, input.retention === 'session_only', input.privacyEpoch);
  });
  handle('send', async (value) => {
    const input = z
      .object({
        sessionId: id.optional(),
        submissionId: attachmentIdSchema.optional(),
        content: z.string().min(1).max(LIMITS.message).refine(text => text.trim().length > 0, '先写一句话再发送。'),
        workspaceContext: workspaceContextSchema.optional(),
        attachment: z.object({ name: z.string().max(LIMITS.fileName), text: z.string().max(LIMITS.attachmentText) }).strict().optional(),
        image: imageAttachmentSchema.optional(),
        material: materialReferenceSchema.optional(),
        attachments: z.array(z.union([textAttachmentSchema, imageAttachmentSchema])).max(LIMITS.attachments).optional(),
        materialDocument: z.object({ resourceId: materialReferenceSchema.shape.resourceId,
          sha256: materialReferenceSchema.shape.sha256 }).strict().optional(),
        materialQuote: materialQuoteReferenceSchema.optional(),
        noteQuote: noteQuoteReferenceSchema.optional(),
        conversationQuote: conversationBookmarkReferenceSchema.optional(),
        selection: semanticSelectionSchema.optional(),
        studyInteraction: studyInteractionSchema.optional(),
        companionReference: companionFollowupReferenceSchema.optional(),
        curiosityReference: curiosityFollowupReferenceSchema.optional(),
        programReference: interactiveProgramReferenceSchema.optional(),
        preparationReference: preparationFocusReferenceSchema.optional(),
        letterReference: letterReferenceSchema.optional(),
        noteReference: noteReferenceSchema.optional(),
        notebookQuote: notebookQuoteReferenceSchema.optional(),
        mapRouteReference: mapRouteReferenceSchema.optional(),
        agendaFocus: agendaFocusSchema.optional(),
        rehearsalInteraction: rehearsalInteractionSchema.optional(),
        controls: z
          .object({
            transmission: z.enum(['cloud_allowed', 'local_only']).optional(),
            memoryMode: z.enum(['relevant', 'current_sources_only', 'session_only', 'none']).optional(),
            retention: z.enum(['purpose_scoped', 'history_no_inference', 'session_only']).optional(),
            audience: z.enum(['self', 'group', 'public']).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .refine(input => !input.attachments || !input.attachment && !input.image && !input.material, '新附件队列不能与旧附件入口同时发送。')
      .refine(input => !input.attachment || !input.material && !input.materialDocument && !input.image, '这次只附一份文件或图片，再继续发送。')
      .refine(input => !input.materialDocument || !input.image && (!input.material
        || input.material.resourceId === input.materialDocument.resourceId && input.material.sha256 === input.materialDocument.sha256),
        '这次拿起了不同的文件，先保留想一起看的那一份再发送。')
      .refine(input => input.content.length + (input.attachment ? input.attachment.name.length + input.attachment.text.length : 0) <= LIMITS.message, '这段话和附件合起来太长了，可以先选出需要一起看的部分。')
      .superRefine((input, context) => {
        const items = input.attachments || [];
        const documentInQueue = !!input.materialDocument && items.some(item => item.kind === 'text'
          && item.resource?.resourceId === input.materialDocument!.resourceId && item.resource.sha256 === input.materialDocument!.sha256);
        if (items.length + (input.materialDocument && !documentInQueue ? 1 : 0) > LIMITS.attachments)
          context.addIssue({ code: 'custom', message: '一次最多一起看三份文件或图片。' });
        if (input.content.length + items.reduce((n, item) => n + item.name.length + (item.kind === 'text' && !item.resource ? item.text.length : 0), 0) > LIMITS.message)
          context.addIssue({ code: 'custom', message: '这句话和附件文字合起来太长了，请先选出需要一起看的部分。' });
        if (items.reduce((n, item) => n + (item.kind === 'image' ? item.dataUrl.length : 0), 0) > LIMITS.imageDataUrls)
          context.addIssue({ code: 'custom', message: '这些图片合起来较大，请先留两张再继续。' });
        const keys = items.map(item => item.kind === 'text' && item.resource ? 'material:' + item.resource.resourceId
          : item.kind === 'image' ? 'image:' + createHash('sha256').update(Buffer.from(item.dataUrl.split(',')[1], 'base64')).digest('hex') : 'text:' + item.name + '\n' + item.text);
        const ids = items.flatMap(item => item.attachmentId ? [item.attachmentId] : []);
        if (new Set(keys).size !== keys.length || new Set(ids).size !== ids.length)
          context.addIssue({ code: 'custom', message: '同一份附件出现了两次，请移除重复的一份。' });
      })
      .refine(input => [input.materialQuote, input.noteQuote, input.noteReference, input.notebookQuote, input.conversationQuote].filter(Boolean).length <= 1, '这次拿起了几处原文，请先留一处再发送。')
      .parse(value);
    noRun();
    pendingSendSubmission = input.submissionId || crypto.randomUUID();
    const admissionController = new AbortController(); pendingSendController = admissionController;
    try {
    // Only this explicit send boundary can prepare an unsubmitted original
    // kept by its native owner. Reuse the standard material ingress so the
    // eventual file event belongs to the real user message and current run.
    // A durably bound original returns no new material: its existing source
    // remains. An explicit temporary delivery needs this turn's real event.
    const queuedDocument = input.attachments?.some(item => item.kind === 'text' && item.resource?.resourceId === input.materialDocument?.resourceId
      && item.resource?.sha256 === input.materialDocument?.sha256);
    const documentDraftOwnerId = input.sessionId || 'new';
    const draftDocument = input.materialDocument && !queuedDocument ? getDraftAttachments(drafts.get(documentDraftOwnerId))
      .find(item => item.kind === 'text' && item.resource?.resourceId === input.materialDocument!.resourceId
        && item.resource.sha256 === input.materialDocument!.sha256) : undefined;
    const preparedDocument = !input.material && input.materialDocument && !queuedDocument
      ? store.runtime.materials.prepareDocumentSend(input.materialDocument, draftDocument?.kind === 'text' && draftDocument.resource
        ? { draftOwnerId: documentDraftOwnerId, reference: draftDocument.resource } : undefined) : undefined;
    // A host-qualified pending draft original keeps its canonical upload ID.
    // No other draft words or attachments enter this explicit delivery.
    const draftUpload = preparedDocument?.kind === 'draft' ? { kind: 'text' as const,
      name: preparedDocument.reference.name, text: '', resource: preparedDocument.reference,
      ...(draftDocument?.attachmentId ? { attachmentId: draftDocument.attachmentId } : {}) } : undefined;
    const uploads = draftUpload ? [draftUpload, ...(input.attachments || [])] : input.attachments;
    if (draftUpload && (uploads!.length > LIMITS.attachments
      || draftUpload.attachmentId && input.attachments?.some(item => item.attachmentId === draftUpload.attachmentId)))
      throw new Error('这次的附件地址有重复，请重新选择要一起看的原件。');
    if (draftUpload && input.content.length + uploads!.reduce((n, item) => n + item.name.length
      + (item.kind === 'text' && !item.resource ? item.text.length : 0), 0) > LIMITS.message)
      throw new Error('这句话和附件文字合起来太长了，请先选出需要一起看的部分。');
    const material = input.material || (preparedDocument?.kind === 'notebook' ? preparedDocument.reference : undefined);
    const quoteMaterial = preparedDocument && preparedDocument.reference.resourceId === input.materialQuote?.resourceId ? preparedDocument.reference
      : material?.resourceId === input.materialQuote?.resourceId ? material
      : input.attachments?.flatMap(item => item.kind === 'text' && item.resource?.resourceId === input.materialQuote?.resourceId ? [item.resource] : [])[0];
    if (input.materialQuote) await store.runtime.materials.nativeQuote({
      target: quoteMaterial ? { kind: 'pending', reference: quoteMaterial } : { kind: 'saved', resourceId: input.materialQuote.resourceId },
      quote: input.materialQuote,
    }, admissionController.signal);
    admissionController.signal.throwIfAborted();
    if (preparedDocument?.kind === 'draft' && store.runtime.materials.prepareDocumentSend(input.materialDocument!,
      { draftOwnerId: documentDraftOwnerId, reference: preparedDocument.reference })?.kind !== 'draft')
      throw new Error('这份原件已经离开刚才的草稿，请重新选择要看的文件。');
    if (input.noteQuote) store.notes.quote(input.noteQuote);
    return harness.start(input.sessionId, input.content, { ...input.controls, submissionId: input.submissionId, submittedMaterialDocument: input.materialDocument,
      attachment: input.attachment ? { id: crypto.randomUUID(), ...input.attachment } : undefined,
      material, uploads, selection: input.selection, workspaceContext: input.workspaceContext,
      studyInteraction: input.studyInteraction, companionReference: input.companionReference,
      curiosityReference: input.curiosityReference, letterReference: input.letterReference, noteReference: input.noteReference,
      notebookQuote: input.notebookQuote, mapRouteReference: input.mapRouteReference, agendaFocus: input.agendaFocus,
      programReference: input.programReference, preparationReference: input.preparationReference,
      rehearsalInteraction: input.rehearsalInteraction, materialQuote: input.materialQuote, noteQuote: input.noteQuote,
      conversationQuote: input.conversationQuote }, input.image);
    } finally { pendingSendSubmission = undefined; if (pendingSendController === admissionController) pendingSendController = undefined; }
  });
  handle('stop', () => { pendingSendController?.abort(new DOMException('用户停止', 'AbortError')); return harness.stop(); });
  handle('persona:follow-default', value => {
    noRun();
    store.followDefaultCompanion(z.string().min(1).max(100).parse(value));
    return state();
  });
  handle('settings:save', (value) => {
    const { apiKey, ...settings } = settingsSchema.parse(value);
    const disablingOnly =
      !apiKey &&
      Object.entries(settings).every(
        ([key, val]) =>
          ['memoryEnabled', 'weatherEnabled', 'remindersEnabled'].includes(key) && val === false
          // How notices look and whether she stays in the tray never change a
          // reply already in progress, so they can be saved at any time.
          || ['notificationPreview', 'backgroundPresence', 'launchAtLogin', 'companionCheckIns'].includes(key),
      );
    if (!disablingOnly) noRun();
    if (settings.mode === 'deepseek' && !(apiKey || getKey()) && !usingLunaTestTransport())
      throw new Error('先填写 DeepSeek API Key，再开始连接。');
    if (apiKey) saveKey(apiKey);
    store.saveSettings(settings as Partial<Settings>);
    if (settings.launchAtLogin !== undefined) applyLoginItem();
    if (settings.backgroundPresence === 'tray') ensureTray();
    return state();
  });
  handle('connection:test', async (value) => {
    noRun();
    const input = z.object({ apiKey: z.string().trim().max(512).optional() }).strict().parse(value);
    connectionController?.abort();
    const controller = new AbortController();
    connectionController = controller;
    try {
      await createModelClient(input.apiKey || getKey(), DEEPSEEK_MODEL).complete(
        [{ role: 'user', content: '请只回复：连接成功。' }],
        [],
        AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      );
      return usingLunaTestTransport() ? LUNA_DISPLAY_NAME + ' 临时代测已响应。' : 'DeepSeek 已响应。';
    } catch (e) {
      throw new Error(friendlyError(e));
    } finally {
      if (connectionController === controller) connectionController = undefined;
    }
  });
  handle('connection:cancel', () => {
    connectionController?.abort();
  });
  handle('key:delete', () => {
    noRun();
    deleteKey();
    store.saveSettings({ mode: 'demo' });
    return state();
  });
  handle('memory', (value) => {
    const input = z
      .object({
        action: z.enum(['save', 'delete', 'deactivate']),
        id: id.optional(),
        text: z.string().trim().min(1).max(4000).optional(),
        expectedRevision: z.number().int().positive().optional(),
        operation: z.enum(['CORRECT', 'SUPERSEDE', 'ADD_EXCEPTION', 'REFINE']).optional(),
        validFrom: z.string().datetime({ offset: true }).optional(),
        validTo: z.string().datetime({ offset: true }).optional(),
        conditions: conditionSchema.optional(),
      })
      .parse(value);
    if (input.action === 'delete' && input.id) store.deleteMemory(input.id);
    else if (input.action === 'deactivate' && input.id) store.runtime.memory.deactivate(input.id);
    else if (input.action === 'save' && input.text)
      store.runtime.memory.saveControl(input.text, input.id, input);
    else throw new Error('请填写记忆内容。');
    return state();
  });
  handle('conversation:delete', (value) => {
    noRun();
    const sessionId = id.parse(value);
    drafts.clear(sessionId);
    store.deleteSession(sessionId);
    harness.invalidateCampusCache(sessionId);
    return state();
  });
  handle('conversation:end', (value) => {
    noRun();
    const sessionId = id.parse(value);
    harness.endConversation(sessionId);
    if (store.conversationPolicy(sessionId)?.retention === 'session_only') drafts.clear(sessionId);
    return state();
  });
  handle('data:clear', async () => {
    noRun();
    await zju.forgetCredentials(AbortSignal.timeout(20_000)).catch(() => {});
    store.clear();
    drafts.clear();
    deleteKey();
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:import', async () => {
    noRun();
    const result = await dialog.showOpenDialog(window!, {
      title: '导入校园资料',
      filters: [{ name: '校园资料 JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (statSync(file).size > 8_000_000) throw new Error('资料文件过大，请使用 8 MB 以内的 JSON 文件。');
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('这不是有效的 JSON 文件。');
    }
    const data = campusSchema.safeParse(parsed);
    if (!data.success)
      throw new Error('资料格式不匹配：请包含来源、更新时间和含时区的逐次日程。项目 examples 中有模板。');
    // Last occurrence wins when an exported event is rescheduled or cancelled.
    data.data.schedule = [...new Map(data.data.schedule.map((e) => [e.id, e])).values()];
    data.data.exams = [...new Map(data.data.exams.map((e) => [e.id, e])).values()];
    store.runtime.domains.importSnapshot(data.data, Object.keys(parsed as object));
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:disconnect', () => {
    noRun();
    store.putMeta('campus', null);
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:template', async () => {
    const result = await dialog.showSaveDialog(window!, {
      title: '保存校园资料模板',
      defaultPath: '校园资料-格式示例.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, JSON.stringify(campusExample, null, 2), 'utf8');
    return true;
  });
  handle('campus:connector:configure', async () => {
    noRun();
    const result = await dialog.showOpenDialog(window!, {
      title: '选择浙大个人信息连接器目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return state();
    zju.configure(result.filePaths[0]);
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:account:connect', async () => {
    noRun();
    harness.invalidateCampusCache();
    harness.stateChanged();
    try {
      zju.connectInstalled();
    } catch {
      const result = await dialog.showOpenDialog(window!, {
        title: '选择浙大个人信息技能目录',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return state();
      zju.configure(result.filePaths[0]);
    }
    if (!zju.describe().credentialsConfigured) await zju.configureCredentials();
    const verified = await zju.verifyAccount(AbortSignal.timeout(75_000));
    if (verified.status !== 'ok')
      throw new Error(
        verified.error?.message || verified.reason || '没有完成浙大统一身份认证，请检查网络或登录信息。',
      );
    return state();
  });
  handle('campus:connector:disconnect', () => {
    noRun();
    zju.disconnect();
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:connector:credentials', async () => {
    noRun();
    harness.invalidateCampusCache();
    harness.stateChanged();
    await zju.configureCredentials();
    const verified = await zju.verifyAccount(AbortSignal.timeout(75_000));
    if (verified.status !== 'ok')
      throw new Error(
        verified.error?.message || verified.reason || '登录信息已加密保存，但浙大统一身份认证没有完成。',
      );
    return state();
  });
  handle('campus:connector:forget-credentials', async () => {
    noRun();
    harness.invalidateCampusCache();
    harness.stateChanged();
    const result = await zju.forgetCredentials(AbortSignal.timeout(20_000));
    if (result.status !== 'ok')
      throw new Error(result.error?.message || result.reason || '没有移除本机登录信息。');
    return state();
  });
  const mapView = (raw: unknown) => z.object({ publicOnly: z.boolean().optional() }).strict().parse(raw || {}).publicOnly ? map.publicView() : map;
  handle('map:overview', raw => mapView(raw).overview());
  handle('map:places', raw => mapView(raw).allPoints());
  handle('map:data', raw => mapView(raw).dataset());
  handle('map:data-json', raw => mapView(raw).serializedDataset());
  handle('map:search', (value) => {
    const input = z
      .object({ query: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(50).optional() })
      .parse(value);
    return map.search(input.query, input.limit || 20);
  });
  handle('map:location-status', () => map.locationStatus());
  handle('map:locate', async () => { latestDeviceLocation = await mapLocation.read(map.overview()); return latestDeviceLocation; });
  handle('map:share-context', value => {
    const input = z.object({ enabled: z.boolean(), fromId: z.string().max(160).optional(), includeDevice: z.boolean().optional(),
      route: sharedMapRouteSchema.optional(), expectedSelectionId: z.string().uuid().optional() }).strict().parse(value);
    if (input.fromId && !map.point(input.fromId)) throw new Error('起点不在当前地图中。');
    return store.runtime.spatial.share({ enabled: input.enabled, fromId: input.fromId, route: input.route,
      expectedSelectionId: input.expectedSelectionId,
      ...(input.includeDevice ? { device: latestDeviceLocation } : {}) });
  });
  handle('map:context-status', () => store.runtime.spatial.sharedStatus());
  handle('map:location-stop', value => { const input = z.object({ keepSharedContext: z.boolean().optional() }).strict().parse(value || {}); mapLocation.cancel(); latestDeviceLocation = undefined; if (!input.keepSharedContext) store.runtime.spatial.share({ enabled: false }); });
  handle('map:route', (value) => {
    const place = z.object({ kind: z.enum(['place', 'node']), id: z.string().min(1).max(100) });
    const input = z
      .object({
        from: z.union([place, z.object({ kind: z.literal('current') })]).optional(),
        to: place.optional(),
        avoidStairs: z.boolean().optional(),
        version: z.string().max(100).optional(),
        profileRevision: z.string().max(100).optional(),
        allowConditional: z.boolean().optional(),
        originAccessId: z.string().max(200).optional(),
        destinationAccessId: z.string().max(200).optional(),
        publicOnly: z.boolean().optional(),
      })
      .parse(value);
    const { publicOnly, ...query } = input;
    if (publicOnly && query.from?.kind === 'current') throw new Error('在公共地图上选一处取景，不使用设备位置。');
    return (publicOnly ? map.publicView() : map).route(query.from?.kind==='current' ? {...query,from:{kind:'current',fix:latestDeviceLocation?.fix}} : query);
  });
  handle('action', async (value) => {
    const input = actionCommandSchema.parse(value);
    if (input.action === 'undo')
      await store.runtime.actions.cancel(store.runtime.policy.hostScope(), input.effect.id, new AbortController().signal, input.effect);
    else if (input.action === 'delete')
      await store.runtime.changeLocalFromUI(input.item, 'delete');
    else
      await store.runtime.acceptLocal({ ...input.item, done: input.action === 'done' || input.item.done });
    return state();
  });
  handle('text:attach', async () => {
    const epoch = store.kernel.epoch;
    const result = await dialog.showOpenDialog(window!, {
      title: '添加文件资料',
      filters: [{ name: '文字、Markdown或PDF', extensions: ['txt', 'md', 'pdf'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    if (epoch !== store.kernel.epoch) throw new Error('资料使用范围已改变，请重新选择文件。');
    const file = result.filePaths[0];
    return store.runtime.materials.stageFile(file);
  });
  handle('materials:list', value => {
    const input = z.object({ sessionId: id.optional() }).strict().parse(value || {});
    return store.runtime.materials.nativeList(input.sessionId);
  });
  handle('materials:read', value => store.runtime.materials.nativeReadPage(value));
  handle('materials:quote', value => store.runtime.materials.nativeQuote(value));
  const materialCommitGate = () => {
    const runtime = store.runtime, epoch = store.kernel.epoch, revision = store.kernel.policyRevision, boundary = runtime.policy.sourceBoundary;
    if (runtime.presentation.public) throw new Error('先回到自己的对话，再保存这段笔记。');
    return () => {
      if (runtime.presentation.public || epoch !== store.kernel.epoch || revision !== store.kernel.policyRevision || boundary !== runtime.policy.sourceBoundary)
        throw new Error('资料或展示范围刚有变化，笔记还没有保存。请回到原处核对后再继续。');
    };
  };
  handle('materials:keep-quote', value => store.runtime.materials.nativeKeepQuote(value, store.notes, materialCommitGate()));
  handle('materials:move-note', value => store.runtime.materials.nativeMoveNote(value, store.notes, materialCommitGate()));
  handle('materials:notes', value => store.runtime.materials.nativeNotes(value, store.notes));
  handle('materials:cancel', value => {
    const input = z.object({ readerId: z.string().min(1).max(100).optional() }).strict().parse(value || {});
    store.runtime.materials.cancelNativeRead(input.readerId);
  });
  handle('materials:discard', value => {
    const input = z.object({ reference: materialReferenceSchema }).strict().parse(value);
    store.runtime.materials.releasePending(input.reference);
  });
  handle('materials:export', async value => {
    const input = z.object({ target: materialTargetSchema }).strict().parse(value);
    const epoch = store.kernel.epoch, revision = store.kernel.policyRevision;
    const original = store.runtime.materials.nativeOriginal(input.target);
    const selected = await dialog.showSaveDialog(window!, { title: '带走这份原文', defaultPath: original.item.name });
    if (selected.canceled || !selected.filePath) return false;
    if (epoch !== store.kernel.epoch || revision !== store.kernel.policyRevision || store.runtime.presentation.public)
      throw new Error('资料使用范围变了，请重新打开后再带走。');
    const current = store.runtime.materials.nativeOriginal(input.target);
    writeFileSync(selected.filePath, current.bytes);
    return true;
  });
  handle('image:attach', async (): Promise<ImageAttachment | null> => {
    const result = await dialog.showOpenDialog(window!, {
      title: '添加图片',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (statSync(file).size > 8_000_000) throw new Error('请选取 8 MB 以内的图片。');
    const source = nativeImage.createFromBuffer(readFileSync(file));
    if (source.isEmpty()) throw new Error('这张图片无法读取，请换一张。');
    const original = source.getSize();
    if (!original.width || !original.height || original.width > 12_000 || original.height > 12_000)
      throw new Error('这张图片尺寸过大，请换一张。');
    const scale = Math.min(1, 1600 / original.width, 1600 / original.height);
    const prepared =
      scale < 1
        ? source.resize({
            width: Math.max(1, Math.round(original.width * scale)),
            height: Math.max(1, Math.round(original.height * scale)),
            quality: 'best',
          })
        : source;
    let bytes = prepared.toJPEG(90),
      size = prepared.getSize();
    if (bytes.length * 1.34 > LIMITS.imageDataUrl) {
      const smallerScale = Math.min(1, 1280 / size.width, 1280 / size.height);
      const smaller = prepared.resize({
        width: Math.max(1, Math.round(size.width * smallerScale)),
        height: Math.max(1, Math.round(size.height * smallerScale)),
        quality: 'good',
      });
      bytes = smaller.toJPEG(82);
      size = smaller.getSize();
    }
    const dataUrl = 'data:image/jpeg;base64,' + bytes.toString('base64');
    if (dataUrl.length > LIMITS.imageDataUrl) throw new Error('这张图片处理后仍然过大，请换一张。');
    return {
      kind: 'image',
      attachmentId: crypto.randomUUID(),
      name: path.basename(file),
      mimeType: 'image/jpeg',
      dataUrl,
      width: size.width,
      height: size.height,
    };
  });
  handle('calendar:export', async value => {
    const input = calendarExportInput.parse(value);
    const epoch = store.kernel.epoch, revision = store.kernel.policyRevision;
    // Validate the requested interval before opening the native picker; re-read after it closes.
    exportCalendarSnapshot([], input, store.kernel.clock.now());
    const result = await dialog.showSaveDialog(window!, {
      title: '把安排带到日历里', defaultPath: '在场-我的安排.ics',
      filters: [{ name: '日历文件', extensions: ['ics'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false, count: 0, omitted: 0, reasons: [] };
    if (epoch !== store.kernel.epoch || revision !== store.kernel.policyRevision || store.runtime.presentation.public)
      throw new Error('资料范围刚刚变了，请回到私人视图重新选择。');
    const snapshot = exportCalendarSnapshot(store.agenda(), input, store.kernel.clock.now());
    if (!snapshot.count) return { saved: false, count: 0, omitted: snapshot.omitted, reasons: snapshot.reasons.length ? snapshot.reasons : ['这段时间还没有可以带走的安排。'] };
    writeFileSync(result.filePath, snapshot.content, { encoding: 'utf8', mode: 0o600 });
    return { saved: true, count: snapshot.count, omitted: snapshot.omitted, reasons: snapshot.reasons };
  });
  handle('data:export', async () => {
    const result = await dialog.showSaveDialog(window!, {
      title: '导出我的资料',
      defaultPath: '在场-我的资料.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, JSON.stringify(store.export(), null, 2), 'utf8');
    return true;
  });
  handle('link:open', async (value) => {
    const url = new URL(z.string().max(2500).parse(value));
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname)
      throw new Error('仅支持打开安全的 HTTPS 来源链接。');
    await shell.openExternal(url.toString());
  });
  handle('text:copy', (value) => {
    clipboard.writeText(z.string().max(100000).parse(value));
  });
  ipcMain.on('window', (event, value) => {
    trusted(event);
    if (value === 'close') window?.close();
    if (value === 'close-confirmed') { draftCloseConfirmed = true; window?.close(); }
    if (value === 'minimize') window?.minimize();
    if (value === 'maximize') window?.isMaximized() ? window.unmaximize() : window?.maximize();
  });
  window = new BrowserWindow({
    title: '在场',
    width: 1220,
    height: 850,
    minWidth: 420,
    minHeight: 570,
    backgroundColor: '#171918',
    frame: false,
    show: false,
    icon: path.join(app.getAppPath(), '前端视觉创新设计/运行素材/brand/window-gold.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  const noteChangeWindow = window;
  const stopNoteChanges = store.notes.onChanged(change => {
    if (store.runtime.presentation.public || noteChangeWindow.isDestroyed() || noteChangeWindow.webContents.isDestroyed()) return;
    const current = store.notes.read({ id: change.id, revision: change.revision, offset: 0, limit: 1 }).note;
    if (store.runtime.presentation.public) return;
    noteChangeWindow.webContents.send('zaichang:event', { type: 'note_changed', note: {
      id: current.id, revision: current.revision, sha256: current.sha256, state: current.state,
    } } satisfies import('../shared/types').RunEvent);
  });
  noteChangeWindow.once('closed', stopNoteChanges);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  let environmentLocked = false, environmentSuspended = false;
  const syncEnvironmentActivity = () => {
    const active = !!window && !window.isDestroyed() && window.isVisible() && !window.isMinimized()
      && !quitting && !environmentLocked && !environmentSuspended;
    store.runtime.environment.setActive(active);
    return active;
  };
  const refreshVisibleEnvironment = () => {
    if (syncEnvironmentActivity()) void store.runtime.environment.read();
  };
  window.on('show', syncEnvironmentActivity);
  window.on('restore', refreshVisibleEnvironment);
  window.on('focus', refreshVisibleEnvironment);
  window.on('hide', syncEnvironmentActivity);
  window.on('minimize', () => store.runtime.environment.setActive(false));
  // Track lock/sleep before loading the renderer: a load or focus event must
  // not restart weather while the desktop is still locked or suspended.
  powerMonitor.on('suspend', () => { environmentSuspended = true; store.runtime.environment.setActive(false); });
  powerMonitor.on('lock-screen', () => { environmentLocked = true; store.runtime.environment.setActive(false); });
  powerMonitor.on('resume', () => { environmentSuspended = false; refreshVisibleEnvironment(); });
  powerMonitor.on('unlock-screen', () => { environmentLocked = false; refreshVisibleEnvironment(); });
  window.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden') || !ensureTray()) window?.show();
  });
  window.on('close', (event) => {
    if (!quitting && keepsRunningInTray() && ensureTray()) {
      // The renderer keeps its drafts; nothing is lost by hiding.
      event.preventDefault();
      window?.hide();
      if (!trayNoticeShown && Notification.isSupported()) {
        trayNoticeShown = true;
        new Notification({ title: '在场仍在运行', body: '窗口收在右下角的托盘里。点图标可以回来；在托盘菜单选“退出在场”会完全退出。', silent: true }).show();
      }
      return;
    }
    // The renderer also owns notebook edits that have not been saved yet.
    if (!draftCloseConfirmed && !window?.webContents.isDestroyed() && !window?.webContents.isCrashed() && !window?.webContents.isLoadingMainFrame()) {
      event.preventDefault();
      window?.webContents.send('zaichang:close-request');
      return;
    }
    if (!closing && harness.running) {
      event.preventDefault();
      closing = true;
      void harness.stop().finally(() => window?.close());
    }
  });
  window.on('closed', () => {
    store.runtime.environment.setActive(false);
    harness.endConversations();
    window = undefined;
  });
  await window.loadURL(
    process.env.ZAICHANG_DEV === '1' ? 'http://127.0.0.1:5173' : 'app://zaichang/index.html',
  );
  store.runtime.reminders.port = {
    capabilities: {
      submitted: Notification.isSupported(),
      delivered: false,
      seen: false,
      stableId: false,
      closedApp: false,
    },
    submit: async (input, signal) => {
      signal.throwIfAborted();
      const leaseEnd = Date.parse(input.leaseUntil);
      const leaseMs = leaseEnd - Date.parse(store.kernel.clock.now());
      if (!Number.isFinite(leaseMs) || leaseMs <= 0) return { status: 'unknown' };
      const notice = new Notification({ title: input.title, body: input.body, silent: input.silent === true });
      return new Promise<{ status: 'submitted_to_os' | 'unknown' }>(resolve => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const settle = (status: 'submitted_to_os' | 'unknown') => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
          notice.removeListener('show', shown);
          resolve({ status: status === 'submitted_to_os'
            && (signal.aborted || Date.parse(store.kernel.clock.now()) >= leaseEnd) ? 'unknown' : status });
        };
        const release = () => {
          notice.removeListener('click', clicked);
          notice.removeListener('close', closed);
          notice.removeListener('failed', failed);
          desktopNotifications.delete(input.id);
        };
        const cancel = () => {
          settle('unknown');
          release();
          notice.close();
        };
        const shown = () => {
          if (signal.aborted || Date.parse(store.kernel.clock.now()) >= leaseEnd) cancel();
          else settle('submitted_to_os');
        };
        const failed = () => { settle('unknown'); release(); };
        const clicked = () => {
          settle('submitted_to_os');
          release();
          navigateTo(input.target);
        };
        const closed = (event: Electron.Event<{ reason?: string }>) => {
          const confirmed = settled;
          settle('unknown');
          // Windows can hide the toast while retaining it in Action Center.
          // Keep its original click route until the person acts or cancels it.
          if (!confirmed || event.reason !== 'timedOut') release();
        };
        desktopNotifications.get(input.id)?.cancel();
        desktopNotifications.set(input.id, { cancel });
        notice.once('show', shown);
        notice.once('failed', failed);
        notice.on('close', closed);
        notice.once('click', clicked);
        signal.addEventListener('abort', cancel, { once: true });
        // The original leased occurrence bounds this acknowledgement wait.
        // No native reply leaves the durable intent unknown; it is not retried.
        const remaining = leaseEnd - Date.parse(store.kernel.clock.now());
        if (signal.aborted || remaining <= 0) cancel();
        else {
          timer = setTimeout(cancel, remaining);
          try { notice.show(); } catch { cancel(); }
        }
      });
    },
    cancel: async id => { desktopNotifications.get(id)?.cancel(); },
  };
  store.runtime.reminders.canSubmitSuggestion = () => !store.runtime.presentation.public && !window?.isFocused();
  store.runtime.reminders.configure({ enabled: store.settings().remindersEnabled });
  const reminderTimer = setInterval(() => {
    void store.runtime.reminders.runDue();
  }, 30000);
  const recoveryTimer = setInterval(() => {
    if (process.env.ZAICHANG_TEST !== '1') void harness.recoverPending();
  }, 30000);
  if (process.env.ZAICHANG_TEST !== '1') {
    opportunityScheduler = createOpportunityScheduler({
      nextReviewAt: () => store.runtime.attention.nextReviewAt(),
      review: () => harness.reviewOpportunities(),
      available: () => !harness.running && store.settings().mode === 'deepseek' && (usingLunaTestTransport() || !!getKey()),
      // State changes bring forward newly registered deadlines; periodic
      // reconciliation remains a recovery path for external source changes.
    });
    store.notes.onChanged(() => opportunityScheduler?.wake());
    store.onAgendaChanged(() => opportunityScheduler?.wake());
    // Every ten minutes the host asks whether this is a gentle moment for her
    // to drop by; most of the time the answer is no and no model is called.
    const presenceTimer = setInterval(() => { void harness.considerCheckIn(); }, 10 * 60000);
    app.on('will-quit', () => clearInterval(presenceTimer));
  }
  void store.runtime.reminders.runDue();
  // After sleep or a locked screen, catch up at once instead of waiting for
  // the next 30-second tick: due reminders first, then entrusted reviews.
  const catchUp = () => { void store.runtime.reminders.runDue(); opportunityScheduler?.wake(); };
  powerMonitor.on('resume', catchUp);
  powerMonitor.on('unlock-screen', catchUp);
  applyLoginItem();
  if (keepsRunningInTray()) ensureTray();
  app.on('will-quit', () => {
    tiyiConnectController?.abort(); tiyiSchool?.dispose();
    clearInterval(reminderTimer);
    clearInterval(recoveryTimer);
    opportunityScheduler?.stop();
    for (const notice of desktopNotifications.values()) notice.cancel();
    store.close();
  });
});
app.on('before-quit', event => {
  quitting = true;
  store?.runtime.environment.setActive(false);
  if (workouts && !workoutDisposed) {
    event.preventDefault();
    if (!workoutExitPending) {
      workoutExitPending = true;
      void workouts.dispose().catch(() => undefined).finally(() => { workoutDisposed = true; app.quit(); });
    }
  }
});
app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => mapLocation.cancel());
