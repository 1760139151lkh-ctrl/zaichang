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
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { Store } from './store';
import { LocalSearchService } from './search';
import { DraftStore } from './storage/drafts';
import { Harness } from './harness';
import { ZjuAdapter } from './zjuAdapter';
import { CampusMapAdapter } from './mapService';
import { MapLocationProvider } from './mapLocation';
import { CampusReferenceAdapter } from './capabilities/campus-reference';
const mapLocation = new MapLocationProvider();
import { friendlyError } from './provider';
import { createModelClient, usingLunaTestTransport } from './model-selection';
import { LUNA_MODEL, LUNA_DISPLAY_NAME } from './luna-provider';
import { actionSchema, campusSchema, settingsSchema } from '../shared/schemas';
import { DEEPSEEK_MODEL, type Draft, type ImageAttachment, type Settings } from '../shared/types';
import campusExample from '../../examples/campus.example.json';
import { LIMITS } from '../shared/limits';
import { assertTestDataDirectory } from './testBoundary';
import { isEphemeral } from './runtime/policy';
import { conditionSchema } from '../shared/harness';
import { hasCredentials } from './runtime/redaction';
import { NativeControls } from './runtime/controls';
import { NativeCampusCalendar } from './runtime/campus-calendar';
import { NativeStudyService } from './runtime/study-native';
import { NativeRehearsalService } from './runtime/rehearsal-native';
import { rehearsalInteractionSchema } from '../shared/relationship-rehearsal';
import { configureNetwork } from './network';
import { materialReferenceSchema, materialTargetSchema } from '../shared/materials';
import { semanticSelectionSchema } from '../shared/scenes';
import { studyInteractionSchema } from '../shared/study-presentation';
import { reflectiveLetterSourceInput, letterReferenceSchema, reflectiveLetterProjectInput } from '../shared/reflective-letter';
import { noteReferenceSchema } from '../shared/note-presentation';
import { companionSourceInputSchema, companionFollowupReferenceSchema } from '../shared/companion-source';
import { campusAcademicReadInputSchema } from '../shared/campus-academic';
import { curiosityFollowupReferenceSchema } from '../shared/curiosity-source';
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
function noRun() {
  if (harness.running) throw new Error('请先停止当前处理，再修改连接或资料。');
}
const id = z.string().min(1).max(100);
const textAttachmentSchema = z.union([
  z
    .object({
      kind: z.literal('text'),
      name: z.string().max(LIMITS.fileName),
      text: z.string().max(LIMITS.attachmentText),
      resource: materialReferenceSchema.optional(),
    })
    .strict(),
  z
    .object({
      name: z.string().max(LIMITS.fileName),
      text: z.string().max(LIMITS.attachmentText),
      resource: materialReferenceSchema.optional(),
    })
    .strict()
    .transform((value) => ({ kind: 'text' as const, ...value })),
]);
const imageAttachmentSchema = z
  .object({
    kind: z.literal('image'),
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
  })
  .strict();
function draft(value: unknown): Draft {
  const parsed = draftSchema.safeParse(value);
  return parsed.success ? parsed.data : { text: '', attachment: null };
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const dataDir = app.getPath('userData');
  mkdirSync(dataDir, { recursive: true });
  keyPath = path.join(dataDir, 'deepseek-key.bin');
  store = new Store(path.join(dataDir, 'zaichang.sqlite'));
  const localSearch = new LocalSearchService(store);
  // The explicit project entry point means this app session should use the
  // project model rather than silently falling back to the demo responder.
  // No request is sent until the user starts a conversation.
  if (projectDeepSeekKey || usingLunaTestTransport()) store.saveSettings({ mode: 'deepseek' });
  zju = new ZjuAdapter(store);
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
      else if (event.type === 'message') { const message = store.runtime.presentation.message(event.message, { liveCuriosity: true, liveRehearsal: true, liveNote: true, liveCampus: true }); if (message) window.webContents.send('zaichang:event', { ...event, message }); }
      else if (!store.runtime.presentation.public) window.webContents.send('zaichang:event', event);
    },
    undefined,
    zju,
    map,
  );
  const controls = new NativeControls(store, harness);
  const campusCalendar = new NativeCampusCalendar(store);
  const study = new NativeStudyService(store, store.runtime.studyPresentation);
  const rehearsal = new NativeRehearsalService(store, store.runtime.rehearsals);
  handle('rehearsal:project', value => rehearsal.project(value));
  handle('note:project', value => {
    const runtime = store.runtime, operation = new AbortController(), remove = runtime.policy.onBarrier(() => operation.abort());
    try { return runtime.notePresentation.project(value, operation.signal); }
    finally { remove(); }
  });
  handle('study:project', value => study.project(value));
  handle('study:read', value => study.read(value));
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
  store.runtime.policy.onBarrier(() => { mapLocation.cancel(); latestDeviceLocation = undefined; store.runtime.spatial.share({ enabled: false }); });
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
  handle('notes:list', value => store.notes.list(value));
  handle('notes:read', value => store.notes.read(value));
  handle('notes:create', value => store.notes.create(value));
  handle('notes:update', value => store.notes.update(value));
  handle('notes:state', value => store.notes.changeState(value));
  handle('notes:undo', value => store.notes.undo(value));
  handle('notes:history', value => store.notes.history(value));
  handle('messages', (value) => store.runtime.presentation.public ? [] : store.messages(id.parse(value)).flatMap(message => { const safe = store.runtime.presentation.message(message); return safe ? [safe] : []; }));
  handle('presentation:surface', async value => {
    const mode = z.enum(['private', 'public']).parse(value);
    store.runtime.presentation.setSurface(mode);
    if (mode === 'public') { localSearch.cancel(); mapLocation.cancel(); latestDeviceLocation = undefined; connectionController?.abort(); store.runtime.spatial.share({ enabled: false }); await harness.stop(); store.runtime.materials.endConversation(); }
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
  handle('help:action', value => { controls.help(value); return state(); });
  handle('response:exposure', value => controls.responseExposure(value));
  handle('release:edit', value => { const message = controls.editRelease(value); harness.invalidateConversation(message.sessionId); return message; });
  const drafts = new DraftStore(store);
  handle('draft', (value) => draft(drafts.get(id.parse(value))));
  handle('draft:info', value => drafts.info(id.parse(value)));
  handle('draft:unsaved', () => drafts.unsaved());
  handle('draft:persist', value => {
    const input = z.object({ id, digest: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict().parse(value);
    const attachment = drafts.get(input.id).attachment;
    if (attachment?.kind === 'text' && attachment.resource) store.runtime.materials.assertPendingPersistable(attachment.resource);
    drafts.persist(input.id, input.digest);
    if (attachment?.kind === 'text' && attachment.resource) store.runtime.materials.persistPending(attachment.resource);
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
  handle('send', (value) => {
    const input = z
      .object({
        sessionId: id.optional(),
        content: z.string().trim().min(1).max(LIMITS.message),
        image: imageAttachmentSchema.optional(),
        material: materialReferenceSchema.optional(),
        selection: semanticSelectionSchema.optional(),
        studyInteraction: studyInteractionSchema.optional(),
        companionReference: companionFollowupReferenceSchema.optional(),
        curiosityReference: curiosityFollowupReferenceSchema.optional(),
        letterReference: letterReferenceSchema.optional(),
        noteReference: noteReferenceSchema.optional(),
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
      .parse(value);
    return harness.start(input.sessionId, input.content, { ...input.controls, material: input.material, selection: input.selection,
      studyInteraction: input.studyInteraction, companionReference: input.companionReference,
      curiosityReference: input.curiosityReference, letterReference: input.letterReference, noteReference: input.noteReference,
      rehearsalInteraction: input.rehearsalInteraction }, input.image);
  });
  handle('stop', () => harness.stop());
  handle('settings:save', (value) => {
    const { apiKey, ...settings } = settingsSchema.parse(value);
    const disablingOnly =
      !apiKey &&
      Object.entries(settings).every(
        ([key, val]) =>
          ['memoryEnabled', 'weatherEnabled', 'remindersEnabled'].includes(key) && val === false,
      );
    if (!disablingOnly) noRun();
    if (settings.mode === 'deepseek' && !(apiKey || getKey()) && !usingLunaTestTransport())
      throw new Error('先填写 DeepSeek API Key，再开始连接。');
    if (apiKey) saveKey(apiKey);
    store.saveSettings(settings as Partial<Settings>);
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
  handle('map:overview', () => map.overview());
  handle('map:places', () => map.allPoints());
  handle('map:data', () => map.dataset());
  handle('map:data-json', () => map.serializedDataset());
  handle('map:search', (value) => {
    const input = z
      .object({ query: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(50).optional() })
      .parse(value);
    return map.search(input.query, input.limit || 20);
  });
  handle('map:location-status', () => map.locationStatus());
  handle('map:locate', async () => { latestDeviceLocation = await mapLocation.read(map.overview()); return latestDeviceLocation; });
  handle('map:share-context', value => {
    const input = z.object({ enabled: z.boolean(), fromId: z.string().max(160).optional(), includeDevice: z.boolean().optional() }).strict().parse(value);
    if (input.fromId && !map.point(input.fromId)) throw new Error('起点不在当前地图中。');
    return store.runtime.spatial.share({ enabled: input.enabled, fromId: input.fromId, ...(input.includeDevice ? { device: latestDeviceLocation } : {}) });
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
      })
      .parse(value);
    return map.route(input.from?.kind==='current' ? {...input,from:{kind:'current',fix:latestDeviceLocation?.fix}} : input);
  });
  handle('action', async (value) => {
    const input = z.object({ action: z.enum(['save', 'delete', 'done']), item: actionSchema }).parse(value);
    if (input.action === 'delete') {
      if (store.runtime.calendar.read(input.item.id)) await store.runtime.changeLocalFromUI(input.item, 'delete');
      else await store.runtime.actions.cancel(store.runtime.policy.hostScope(), input.item.effectActionId || input.item.id);
    } else
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
  handle('materials:cancel', () => store.runtime.materials.cancelNativeRead());
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
    icon: path.join(app.getAppPath(), 'assets/brand/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('close', (event) => {
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
      const notice = new Notification({ title: input.title, body: input.body, silent: true });
      notice.on('click', () => {
        window?.restore();
        window?.show();
        window?.focus();
      });
      notice.show();
      return { status: 'submitted_to_os' };
    },
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
  }
  void store.runtime.reminders.runDue();
  app.on('will-quit', () => {
    clearInterval(reminderTimer);
    clearInterval(recoveryTimer);
    opportunityScheduler?.stop();
    store.close();
  });
});
app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => mapLocation.cancel());
