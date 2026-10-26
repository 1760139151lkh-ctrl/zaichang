import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { ArrowLeft, Check, ChevronRight, Download, LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import { IconButton, Modal, PagePanel, Switch, uiError } from './ui';
import { MemoryPanelSimple, SourcePermissions, type MemoryWorkspaceState } from './HarnessViews';
import type { SettingsUpdate, State } from '../shared/types';
import { useAppearance, type Appearance } from './appearance';
import { DEFAULT_INTERACTION } from '../shared/interaction';
import { PersonaEditor, type PersonaDraft, type PersonaPreviewDraft } from './PersonaEditor';
import { CompanionSettings, type CompanionSettingsDraft } from './CompanionSettings';
import { useCompanion, type CompanionMoment } from './companion';
import { RichText } from './RichText';
import { TiyiConnection, type TiyiConnectionFocus } from './TiyiConnection';
import './settings-refinement.css';

const api = window.zaichang;
type SettingsTab = '陪伴' | '交流' | '偏好' | '连接' | '记忆' | '资料';
export interface SettingsDraft {
  apiKey?: string;
  guidance?: string;
  persona?: PersonaDraft;
  personaPreview?: PersonaPreviewDraft;
  companion?: CompanionSettingsDraft;
  /** Navigation only; privacy changes still clear every editable/private field above. */
  navigation?: { entry: SettingsTab; tab: SettingsTab; tiyiFocus?: TiyiConnectionFocus; resume?: boolean;
    positions?: Partial<Record<SettingsTab, number>> };
}
interface Props {
  embedded?: boolean;
  initialTab?: SettingsTab;
  companionMoment?: CompanionMoment;
  state: State;
  busy: boolean;
  onState: (s: State) => void;
  onClose: () => void;
  notify: (s: string) => void;
  onClear: () => void;
  onBeforeForget?: () => boolean;
  draft: MutableRefObject<SettingsDraft>;
  memoryWorkspace: MemoryWorkspaceState;
  onMemoryWorkspace: Dispatch<SetStateAction<MemoryWorkspaceState>>;
}
type Feedback = { action: string; text: string; error?: boolean } | null;
const date = (v: string) =>
  new Date(v).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
const errorText = uiError;

export function SettingsPanel({
  state,
  busy,
  onState,
  onClose,
  notify,
  onClear,
  onBeforeForget,
  draft,
  memoryWorkspace,
  onMemoryWorkspace,
  embedded,
  initialTab = '连接',
  companionMoment,
}: Props) {
  const [appearance, setAppearance] = useAppearance();
  const { reset: resetCompanion, value: companion, update: updateCompanion } = useCompanion();
  const interaction = state.settings.interaction || DEFAULT_INTERACTION;
  const resumeNavigation = useRef(draft.current.navigation?.resume && draft.current.navigation.entry === initialTab
    ? draft.current.navigation : undefined);
  const [tab, setTab] = useState<SettingsTab>(resumeNavigation.current?.tab || initialTab);
  const tabs: SettingsTab[] = embedded ? ['陪伴', '交流', '偏好', '连接'] : ['陪伴', '交流', '偏好', '连接', '记忆'];
  const tabNames: Record<string, string> = { 陪伴: '陪伴', 交流: '相处', 偏好: '阅读', 连接: '连接', 记忆: '关于你' };
  const Frame = embedded ? PagePanel : Modal;
  const [key, setKey] = useState(draft.current.apiKey || '');
  const [keyExpanded, setKeyExpanded] = useState(!state.settings.hasKey || !!draft.current.apiKey);
  const [guidance, setGuidance] = useState(draft.current.guidance ?? state.settings.guidance);
  const [guidanceExpanded, setGuidanceExpanded] = useState(
    draft.current.guidance !== undefined && draft.current.guidance !== state.settings.guidance,
  );
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [memoryText, setMemoryText] = useState(''),
    [editId, setEditId] = useState<string>();
  const [sourceId, setSourceId] = useState(''),
    [clearConfirm, setClearConfirm] = useState(false);
  const testCancelled = useRef(false),
    pendingRef = useRef('');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sourceBackRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const positions = useRef<Partial<Record<SettingsTab, number>>>({ ...resumeNavigation.current?.positions });
  const previewRef = useRef<HTMLDivElement>(null);
  const previewAnchor = useRef<{ element: HTMLElement; offset: number } | undefined>(undefined);
  const disabled = busy || !!pending;
  const lunaSubstitute = state.modelRuntime?.temporaryTestSubstitute === true;
  useEffect(
    () => () => {
      if (pendingRef.current === 'test') void api.cancelConnection();
    },
    [],
  );
  useEffect(() => {
    if (tab !== '资料') return;
    if (resumeNavigation.current?.tiyiFocus) return;
    const frame = requestAnimationFrame(() => sourceBackRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  useEffect(() => {
    const previous = draft.current.navigation;
    draft.current.navigation = { entry: initialTab, tab, positions: positions.current, resume: true,
      ...(previous?.entry === initialTab && previous.tab === tab && previous.tiyiFocus ? { tiyiFocus: previous.tiyiFocus } : {}) };
  }, [draft, initialTab, tab]);
  function settingsViewport() {
    return embedded ? bodyRef.current?.closest<HTMLElement>('.page-panel') : bodyRef.current;
  }
  useLayoutEffect(() => {
    const viewport = settingsViewport();
    if (!viewport) return;
    viewport.scrollTop = positions.current[tab] || 0;
    const remember = () => { positions.current[tab] = viewport.scrollTop; };
    viewport.addEventListener('scroll', remember, { passive: true });
    return () => viewport.removeEventListener('scroll', remember);
  }, [tab, embedded]);
  useLayoutEffect(() => {
    const viewport = previewRef.current, anchor = previewAnchor.current;
    if (viewport && anchor?.element.isConnected)
      viewport.scrollTop += anchor.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
    previewAnchor.current = undefined;
  }, [appearance.readingScale, appearance.density]);
  function changeReadingLayout(patch: Pick<Partial<Appearance>, 'readingScale' | 'density'>) {
    const viewport = previewRef.current;
    if (viewport) {
      const top = viewport.getBoundingClientRect().top;
      const element = [...viewport.querySelectorAll<HTMLElement>('.markdown > p, .markdown > h2, .markdown > blockquote')]
        .find(item => item.getBoundingClientRect().bottom > top + 8);
      if (element) previewAnchor.current = { element, offset: element.getBoundingClientRect().top - top };
    }
    setAppearance(patch);
  }
  function changeTab(value: SettingsTab) {
    const viewport = settingsViewport();
    if (viewport) positions.current[tab] = viewport.scrollTop;
    if (pendingRef.current === 'test') {
      testCancelled.current = true;
      void api.cancelConnection();
    }
    resumeNavigation.current = undefined;
    draft.current.navigation = { entry: initialTab, tab: value, positions: positions.current, resume: true };
    setTab(value);
    setFeedback(null);
  }
  async function perform(action: string, fn: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = action;
    setPending(action);
    setFeedback(null);
    try {
      await fn();
    } catch (e) {
      setFeedback({
        action,
        text:
          action === 'test' && testCancelled.current
            ? '这次先不试了'
            : action === 'test' && errorText(e).includes('剩余事项')
              ? '连接暂时中断，请检查网络后重试'
              : errorText(e).replace(/[。.!！]+$/, ''),
        error: !(action === 'test' && testCancelled.current),
      });
    } finally {
      pendingRef.current = '';
      setPending('');
    }
  }
  function result(actions: string[]) {
    return feedback && actions.includes(feedback.action) ? (
      <div
        className={`inline-status ${feedback.error ? 'error' : ''}`}
        role={feedback.error ? 'alert' : 'status'}
      >
        {feedback.text}
      </div>
    ) : null;
  }
  async function update(action: string, settings: SettingsUpdate) {
    await perform(action, async () => {
      onState(await api.saveSettings(settings));
    });
  }
  const connector = state.campusConnector;
  const connectorReady =
    !!connector?.configured && !!connector.available && connector.authStatus === 'verified';
  const connectorStatus = !connector?.configured
    ? '尚未连接'
    : !connector.available
      ? '暂时无法连接'
      : connector.credentialsConfigured === false
        ? '需要登录'
        : connector.authStatus === 'verified'
          ? '已登录'
          : connector.authStatus === 'failed'
            ? '需要重试'
            : '再试一下登录';
  return (
    <Frame
      title={tab === '资料' ? '资料与权限' : initialTab === '记忆' ? '关于你' : '设置'}
      onClose={onClose}
      className={`settings-panel settings-refined ${initialTab === '记忆' ? 'memory-page' : ''} ${['陪伴', '交流', '偏好'].includes(tab) ? 'settings-wide' : ''} ${tab === '偏好' ? 'settings-rhythm' : tab === '交流' ? 'settings-conversation' : tab === '连接' ? 'settings-connect' : ''}`}
    >
      {tab === '资料' ? (
        <button ref={sourceBackRef} className="source-back text-button" onClick={() => changeTab('连接')}>
          <ArrowLeft size={14} />
          返回连接
        </button>
      ) : initialTab !== '记忆' ? (
        <div className="panel-tabs" role="tablist" aria-label="在场设置">
          {tabs.map((t, i) => (
            <button
              key={t}
              id={`settings-tab-${i}`}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`settings-panel-${i}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => changeTab(t)}
              onKeyDown={(e) => {
                let next: number | undefined;
                if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
                if (e.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
                if (e.key === 'Home') next = 0;
                if (e.key === 'End') next = tabs.length - 1;
                if (next !== undefined) {
                  e.preventDefault();
                  changeTab(tabs[next]);
                  tabRefs.current[next]?.focus();
                }
              }}
            >
              {tabNames[t]}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className="panel-body"
        ref={bodyRef}
        role={tab === '资料' || initialTab === '记忆' ? 'region' : 'tabpanel'}
        id={tab === '资料' ? 'settings-source-panel' : `settings-panel-${tabs.indexOf(tab)}`}
        aria-label={tab === '资料' ? '资料来源设置' : initialTab === '记忆' ? '关于你的内容' : undefined}
        aria-labelledby={
          tab === '资料' || initialTab === '记忆' ? undefined : `settings-tab-${tabs.indexOf(tab)}`
        }
      >
        {busy && tab === '连接' && <p className="busy-note">等这句话说完，就可以换一个连接。</p>}
        {tab === '陪伴' && <CompanionSettings persona={state.settings.persona} draft={draft} moment={companionMoment} onState={onState} busy={busy || !!pending} saving={pending === 'persona'} saveOperation={(operation) => perform('persona', operation)} onEditPersona={() => changeTab('交流')} />}
        {tab === '连接' && (
          <>
            <div className="section-heading">
              <div>
                <h3>{lunaSubstitute ? state.modelRuntime?.displayName : 'DeepSeek'}</h3>
                <p>{state.settings.mode === 'demo' ? '演示模式' : lunaSubstitute ? '使用当前登录的连接' : state.settings.hasKey ? '已保存密钥' : '尚未设置密钥'}</p>
              </div>
            </div>
            {lunaSubstitute ? (
              <div className="model-runtime-note">
                <div className="field-buttons">
                  {state.settings.mode === 'demo' && (
                    <button
                      className="primary-button"
                      disabled={disabled}
                      onClick={() => void update('enable-luna', { mode: 'deepseek' })}
                    >
                      使用这个连接
                    </button>
                  )}
                  <button
                    className={state.settings.mode === 'demo' ? 'subtle-button' : 'primary-button'}
                    disabled={disabled}
                    onClick={() => {
                      testCancelled.current = false;
                      void perform('test', async () => {
                        const text = await api.testConnection({});
                        setFeedback({ action: 'test', text: text.replace(/[。.!！]+$/, '') });
                      });
                    }}
                  >
                    {pending === 'test' && <LoaderCircle size={14} className="spin" />}
                    {pending === 'test' ? '正在检查…' : '检查连接'}
                  </button>
                  {pending === 'test' && (
                    <button
                      className="text-button"
                      onClick={() => {
                        testCancelled.current = true;
                        void api.cancelConnection();
                      }}
                    >
                      先不试了
                    </button>
                  )}
                </div>
                {result(['test'])}
                <details className="connection-technical">
                  <summary>关于这次连接</summary>
                  <p>
                    使用当前登录的 {state.modelRuntime?.displayName}；与 DeepSeek 分别记录使用情况。
                  </p>
                </details>
              </div>
            ) : (
              <>
                <details className="settings-disclosure connection-key" open={keyExpanded} onToggle={event => setKeyExpanded(event.currentTarget.open)}>
                  <summary>{state.settings.hasKey ? '管理密钥' : '设置密钥'}</summary>
                  <div className="settings-disclosure-body">
                    <label className="field-label">
                      DeepSeek 密钥
                      <input
                        type="password"
                        value={key}
                        autoComplete="off"
                        placeholder={state.settings.hasKey ? '已有密钥，想更换时在这里输入' : '粘贴你的 DeepSeek 密钥'}
                        onChange={(e) => {
                          setKey(e.target.value);
                          draft.current.apiKey = e.target.value;
                        }}
                        disabled={disabled}
                      />
                    </label>
                    <div className="field-buttons">
                      <button
                        className="primary-button"
                        disabled={disabled || !(key || state.settings.hasKey)}
                        onClick={() =>
                          void perform('save', async () => {
                            onState(
                              await api.saveSettings({ mode: 'deepseek', ...(key ? { apiKey: key } : {}) }),
                            );
                            setKey('');
                            draft.current.apiKey = '';
                            setFeedback({ action: 'save', text: '密钥已保存' });
                          })
                        }
                      >
                        {pending === 'save' && <LoaderCircle size={14} className="spin" />}保存密钥
                      </button>
                      {state.settings.hasKey && (
                        <button
                          className="text-button"
                          disabled={disabled}
                          onClick={() =>
                            void perform('remove', async () => {
                              onState(await api.deleteKey());
                              setKey('');
                              draft.current.apiKey = '';
                              setFeedback({ action: 'remove', text: '这把密钥已从电脑里移除' });
                            })
                          }
                        >
                          {pending === 'remove' && <LoaderCircle size={13} className="spin" />}移除密钥
                        </button>
                      )}
                    </div>
                  </div>
                </details>
                {result(['save', 'remove'])}
                <div className="connection-actions">
                  <div className="field-buttons">
                    <button
                      className="primary-button"
                      disabled={disabled || !(key || state.settings.hasKey)}
                      onClick={() => {
                        testCancelled.current = false;
                        void perform('test', async () => {
                          const text = await api.testConnection({ ...(key ? { apiKey: key } : {}) });
                          setFeedback({
                            action: 'test',
                            text: text.replace(/[。.!！]+$/, ''),
                          });
                        });
                      }}
                    >
                      {pending === 'test' && <LoaderCircle size={14} className="spin" />}
                      {pending === 'test' ? '正在检查…' : '检查连接'}
                    </button>
                    {pending === 'test' && (
                      <button
                        className="text-button"
                        onClick={() => {
                          testCancelled.current = true;
                          void api.cancelConnection();
                        }}
                      >
                        先不试了
                      </button>
                    )}
                  </div>
                  {result(['test'])}
                </div>
              </>
            )}
            {state.settings.mode === 'deepseek' && (
              <details className="settings-disclosure connection-extra">
                <summary>其他连接设置</summary>
                <div className="settings-disclosure-body">
                  <button
                    className="text-button use-demo"
                    disabled={disabled}
                    onClick={() =>
                      void perform('demo', async () => {
                        onState(await api.saveSettings({ mode: 'demo' }));
                        setFeedback({ action: 'demo', text: '现在可以先看看在场的样子' });
                      })
                    }
                  >
                    使用演示模式
                  </button>
                </div>
              </details>
            )}
            {result(['demo'])}
            <button className="settings-navigation" onClick={() => changeTab('资料')}>
              <span>
                <strong>校园资料与天气</strong>
                <small>{connectorReady ? '浙大账号已登录' : '需要时登录'}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          </>
        )}
        {tab === '资料' && (
          <>
            <details className="settings-disclosure source-permissions-entry">
              <summary>允许读取的资料</summary>
              <div className="settings-disclosure-body"><SourcePermissions onState={onState} /></div>
            </details>
            <section className="campus-source-block">
              <div className="connector connector-primary">
                <div>
                  <div className="connector-title-line">
                    <strong>浙大校园资料</strong>
                    <span
                      className={`source-status ${connectorReady ? 'connected' : connector?.credentialsConfigured === false ? 'needs-login' : 'unavailable'}`}
                    >
                      {connectorStatus}
                    </span>
                  </div>
                  <p>
                    {connectorReady
                      ? '需要课表或其他校园资料时，我会按你的允许范围去看。'
                      : connector?.credentialsConfigured
                        ? '登录信息还在，再试着登录一次吧。'
                        : '用浙大账号登录后，可以在聊天里看课表等校园资料。'}
                  </p>
                </div>
                <button
                  className="subtle-button"
                  disabled={disabled}
                  onClick={() =>
                    void perform('account-connect', async () => {
                      onState(await api.connectCampusAccount());
                      setFeedback({
                        action: 'account-connect',
                        text: '浙大账号已登录，可以按需读取校园资料',
                      });
                    })
                  }
                >
                  {pending === 'account-connect' ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : connectorReady ? (
                    '重新登录'
                  ) : connector?.credentialsConfigured ? (
                    '试着登录'
                  ) : (
                    '登录浙大'
                  )}
                </button>
              </div>
              {connector?.configured && (
                <details className="connector-more">
                  <summary>登录与来源详情</summary>
                  <div className="connector-actions" role="group" aria-label="校园资料连接设置">
                    <button
                      className="connector-action"
                      disabled={disabled}
                      onClick={() =>
                        void perform('credentials', async () => {
                          onState(await api.configureCampusCredentials());
                          setFeedback({ action: 'credentials', text: '现在可以按你的允许范围查看校园资料了' });
                        })
                      }
                    >
                      {connector.credentialsConfigured === false ? '输入登录信息' : '更新登录信息'}
                    </button>
                    {connector.credentialsConfigured && (
                      <button
                        className="connector-action connector-action-danger"
                        disabled={disabled}
                        onClick={() =>
                          void perform('credentials-forget', async () => {
                            onState(await api.forgetCampusCredentials());
                            setFeedback({
                              action: 'credentials-forget',
                              text: '本机保存的浙大登录信息已移除',
                            });
                          })
                        }
                      >
                        移除登录信息
                      </button>
                    )}
                    <button
                      className="connector-action connector-action-danger"
                      disabled={disabled}
                      onClick={() =>
                        void perform('connector-disconnect', async () => {
                          onState(await api.disconnectCampusConnector());
                          setFeedback({
                            action: 'connector-disconnect',
                            text: '这次先不看校园资料了。登录信息还留在这台电脑。',
                          });
                        })
                      }
                    >
                      断开连接
                    </button>
                  </div>
                  <small>
                    登录信息由 Windows
                    当前用户加密保存；回答模型只会收到当前问题所需的资料，不会收到账号或密码。
                    {connector.lastVerifiedAt ? ` 上次登录：${date(connector.lastVerifiedAt)}。` : ''}
                  </small>
                </details>
              )}
            </section>
            {result([
              'account-connect',
              'connector-disconnect',
              'credentials',
              'credentials-forget',
              'import',
              'template',
              'disconnect',
            ])}
            <details className="settings-disclosure" open={!!resumeNavigation.current?.tiyiFocus}>
              <summary>体艺记录</summary>
              <div className="settings-disclosure-body">
                <TiyiConnection disabled={disabled} restoreFocus={resumeNavigation.current?.tiyiFocus}
                  onControlFocus={tiyiFocus => { draft.current.navigation = { entry: initialTab, tab, tiyiFocus }; }} />
              </div>
            </details>
            {!connectorReady && (
              <details className="settings-disclosure campus-import-block">
                <summary>本地校园资料</summary>
                <div className="settings-disclosure-body">
                  <div className="connector">
                    <div>
                      <strong>{state.campus ? '已保存的资料' : '打开资料文件'}</strong>
                      <p>最新校园记录仍需登录后查看。</p>
                    </div>
                    <button
                      className="subtle-button"
                      disabled={disabled}
                      onClick={() =>
                        void perform('import', async () => {
                          const next = await api.importCampus();
                          if (next) {
                            onState(next);
                            setFeedback({
                              action: 'import',
                              text: '这份资料已打开。要看学校的最新消息，再登录账号。',
                            });
                          }
                        })
                      }
                    >
                      {pending === 'import' ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : state.campus ? (
                        '更新'
                      ) : (
                        '导入'
                      )}
                    </button>
                  </div>
                  {state.campus && (
                    <small className="campus-import-state">
                      这份资料保存于 {date(state.campus.updatedAt)}
                    </small>
                  )}
                  <details className="campus-more">
                    <summary>文件操作</summary>
                    <div className="field-buttons">
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() =>
                          void perform('template', async () => {
                            if (await api.campusTemplate())
                              setFeedback({ action: 'template', text: '空白资料文件已留好，可以按里面的格式填写' });
                          })
                        }
                      >
                        <Download size={14} />
                        下载空白格式
                      </button>
                      {state.campus && (
                        <button
                          className="text-button"
                          disabled={disabled}
                          onClick={() =>
                            void perform('disconnect', async () => {
                              onState(await api.disconnectCampus());
                              setFeedback({ action: 'disconnect', text: '这份旧资料已移除' });
                            })
                          }
                        >
                          移除这份资料
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              </details>
            )}
            <details className="settings-disclosure">
              <summary><span>天气资料</span><small>{state.settings.weatherEnabled ? '已允许' : '未允许'}</small></summary>
              <div className="settings-disclosure-body">
                <Switch
                  checked={state.settings.weatherEnabled}
                  onChange={(v) => void update('weather', { weatherEnabled: v })}
                  label="杭州天气"
                  detail="只查询杭州，不读取你的位置。"
                  disabled={!!pending || (busy && !state.settings.weatherEnabled)}
                />
              </div>
            </details>
            {result(['weather'])}
          </>
        )}
        {tab === '记忆' && (
          <MemoryPanelSimple
            key={`${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`}
            state={state}
            onState={onState}
            busy={busy}
            workspace={memoryWorkspace}
            onWorkspace={onMemoryWorkspace}
          />
        )}
        {(tab === '偏好' || tab === '交流') && (
          <>
            <div hidden={tab !== '交流'}>
              <PersonaEditor persona={state.settings.persona} legacyGuidance={state.settings.guidance} draft={draft} onState={onState} busy={busy || !!pending} saving={pending === 'persona'} perform={(operation) => perform('persona', operation)} />
              {result(['persona'])}
            </div>
            {tab === '偏好' && <>
              <div className="rhythm-layout">
                <div className="rhythm-controls">
                  <section className="preference-section">
                    <h3 className="section-title">排版</h3>
                    <label className="rhythm-choice-row"><span>正文字号</span><select aria-label="正文字号" value={appearance.readingScale} onChange={event => changeReadingLayout({ readingScale: Number(event.target.value) as Appearance['readingScale'] })}>
                      <option value={1}>标准</option><option value={1.15}>大一点</option><option value={1.3}>再大一点</option>
                    </select></label>
                    <label className="rhythm-choice-row"><span>内容间距</span><select aria-label="内容间距" value={appearance.density} onChange={event => changeReadingLayout({ density: event.target.value as Appearance['density'] })}>
                      <option value="comfortable">舒展</option><option value="compact">紧凑</option>
                    </select></label>
                  </section>
                  <details className="settings-disclosure initiative-section">
                    <summary>主动陪伴</summary>
                    <div className="settings-disclosure-body">
                      <label className="rhythm-choice-row"><span>主动帮助</span><select aria-label="主动帮助程度" value={interaction.initiative} disabled={!!pending} onChange={event => void update('initiative', { interaction: { ...interaction, initiative: event.target.value as typeof interaction.initiative } })}>
                        <option value="quiet">等你开口</option><option value="prepare">先把资料备好</option><option value="when_useful">有值得说的事，再告诉你</option>
                      </select></label>
                      <Switch label="留意你交给我的事" detail="关闭后，等你询问时再看。" checked={interaction.followup === 'meaningful_change'} disabled={!!pending} onChange={value => void update('followup', { interaction: { ...interaction, followup: value ? 'meaningful_change' : 'on_request' } })} />
                      <label className="rhythm-choice-row"><span>主动来聊</span><select aria-label="不为事情、只是来找你聊聊的频率" value={state.settings.companionCheckIns || 'sometimes'} disabled={!!pending} onChange={event => void update('checkins', { companionCheckIns: event.target.value as 'off' | 'sometimes' | 'often' })}>
                        <option value="off">不用</option><option value="sometimes">偶尔</option><option value="often">常来</option>
                      </select></label>
                      {interaction.initiative === 'quiet' && <p className="preference-scope-note">现在等你开口，主动来聊也先停下。</p>}
                    </div>
                  </details>
                  {result(['initiative', 'followup', 'checkins'])}
                  <details className="settings-disclosure">
                    <summary>动态与通知</summary>
                    <div className="settings-disclosure-body">
                      <Switch label="少一点动态" checked={companion.reducedMotion} onChange={reducedMotion => updateCompanion({ reducedMotion })} />
                      <Switch checked={state.settings.remindersEnabled} onChange={v => void update('reminders', { remindersEnabled: v })} label="用系统通知叫我" detail="约好的提醒，以及你离开窗口时允许通知的事。" disabled={!!pending || (busy && !state.settings.remindersEnabled)} />
                      <Switch checked={(state.settings.notificationPreview || 'words') === 'words'} onChange={v => void update('preview', { notificationPreview: v ? 'words' : 'private' })} label="通知显示内容" detail="关掉后，只显示“有件事想跟你说”。" disabled={!!pending} />
                    </div>
                  </details>
                  {result(['reminders', 'preview'])}
                  <details className="settings-disclosure">
                    <summary>后台与启动</summary>
                    <div className="settings-disclosure-body">
                      <Switch checked={(state.settings.backgroundPresence || 'tray') === 'tray'} onChange={v => void update('presence', { backgroundPresence: v ? 'tray' : 'quit' })} label="关掉窗口后留在托盘" detail="继续有效的提醒与托付；电脑睡眠或关机时暂停。" disabled={!!pending} />
                      <Switch checked={state.settings.launchAtLogin === true} onChange={v => void update('login', { launchAtLogin: v })} label="启动时留在托盘" detail="托盘不可用时打开窗口。" disabled={!!pending} />
                    </div>
                  </details>
                  {result(['presence', 'login'])}
                </div>
                <aside className="rhythm-preview-column" aria-label="阅读排版样例">
                  <div className="reading-feel-preview">
                    <h3>常数为什么可以变？</h3>
                    <div ref={previewRef} className="reading-preview-scroll" role="region" aria-label="长文排版预览" tabIndex={0}>
                      <div className="markdown reading-preview-text"><RichText text={'先从已经知道的解出发。对一阶方程 $x\u2032=a(t)x+b(t)$，暂时放下右边多出来的那一项，取齐次方程的一个非零解 $u(t)$。\n\n现在把新的解写成：\n\n$$x(t)=u(t)c(t)$$\n\n这一步还没有替原方程作出结论。我们只是换一种写法，让已知的 $u(t)$ 留在式子里，再问未知的 $c(t)$ 需要满足什么。\n\n沿着乘积求导，$u\u2032(t)c(t)$ 与右边的 $a(t)u(t)c(t)$ 正好抵消。剩下的是：\n\n$$u(t)c\u2032(t)=b(t)$$\n\n在 $u(t)$ 不为零的这个区间里，就能得到 $c\u2032(t)=b(t)/u(t)$。把这一项积分，再乘回 $u(t)$，便回到了原来的未知函数。\n\n所以，“常数变易”并不是先断言常数会变，而是借已知齐次解重新表达问题。真正需要检查的，是换写后的式子有没有仍然满足原方程。\n\n如果题目还给了一个初始值，最后再用它确定积分常数。每一步都有自己的位置：先认出已知结构，再找剩下的变化，最后回到条件核对。\n\n读到这里，可以停在刚才抵消的那一行，看看上下两边分别留下了什么。'} /></div>
                    </div>
                  </div>
                </aside>
              </div>
            </>}
            <details className="settings-disclosure" hidden={tab !== '交流'}>
              <summary>说话习惯</summary>
              <div className="settings-disclosure-body">
                <div className="preference-fields">
                  <label>
                    语气
                    <select
                      aria-label="交流语气"
                      value={interaction.tone}
                      disabled={!!pending}
                      onChange={(event) =>
                        void update('interaction', {
                          interaction: { ...interaction, tone: event.target.value as typeof interaction.tone },
                        })
                      }
                    >
                      <option value="natural">自然、清楚</option>
                      <option value="warm">更亲切一点</option>
                      <option value="direct">直接说重点</option>
                    </select>
                  </label>
                  <label>
                    解释
                    <select
                      aria-label="解释偏好"
                      value={interaction.depth}
                      disabled={!!pending}
                      onChange={(event) =>
                        void update('interaction', {
                          interaction: {
                            ...interaction,
                            depth: event.target.value as typeof interaction.depth,
                          },
                        })
                      }
                    >
                      <option value="adaptive">按问题需要展开</option>
                      <option value="concise">少枝节、少重复</option>
                      <option value="thorough">充分展开推导</option>
                    </select>
                  </label>
                  <label>
                    玩笑
                    <select
                      aria-label="幽默偏好"
                      value={interaction.humor}
                      disabled={!!pending}
                      onChange={(event) =>
                        void update('interaction', {
                          interaction: {
                            ...interaction,
                            humor: event.target.value as typeof interaction.humor,
                          },
                        })
                      }
                    >
                      <option value="character">跟随角色自然表达</option>
                      <option value="none">不主动开玩笑</option>
                      <option value="light">合适时轻松一点</option>
                    </select>
                  </label>
                </div>
              </div>
            </details>
            {tab === '交流' && result(['interaction'])}
            <details className="settings-disclosure" hidden={tab !== '交流'} open={guidanceExpanded} onToggle={event => setGuidanceExpanded(event.currentTarget.open)}>
              <summary><span>关于我的补充</span>{guidance !== state.settings.guidance && <small>未保存</small>}</summary>
              <div className="settings-disclosure-body">
                <label className="field-label behavior-label">
                  私人背景与回复偏好
                  <textarea
                    value={guidance}
                    onChange={(e) => {
                      setGuidance(e.target.value);
                      draft.current.guidance = e.target.value;
                    }}
                    rows={3}
                    maxLength={4000}
                    placeholder="例如：先给结论，再给推导；保留我要求的细节"
                  />
                </label>
                <p className="setting-note">你允许参考个人记忆时才使用这些内容。带走角色设置时，不会带上它们。</p>
                <div className="field-buttons">
                  <button
                    className="primary-button"
                    disabled={disabled || guidance === state.settings.guidance}
                    onClick={() =>
                      void perform('guidance', async () => {
                        onState(await api.saveSettings({ guidance }));
                        setFeedback({ action: 'guidance', text: '以后就按这个意思聊' });
                      })
                    }
                  >
                    {pending === 'guidance' && <LoaderCircle size={14} className="spin" />}留下这些话
                  </button>
                </div>
              </div>
            </details>
            {tab === '交流' && result(['guidance'])}
            <details className="data-controls" hidden={tab !== '偏好'}>
              <summary className="section-title">留在这台电脑里的</summary>
              <div className="data-controls-body">
                <details className="data-storage-detail"><summary>资料如何保留</summary><p>对话保存在这台电脑。聊天时，会把你允许使用的内容交给所连接的模型；本机数据库没有整体加密。导出的资料包含对话、笔记和安排等内容，不包含自选人物图片与阅读外观。</p></details>
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() =>
                    void perform('export', async () => {
                      if (await api.exportData()) setFeedback({ action: 'export', text: '资料已放到你选择的位置' });
                    })
                  }
                >
                  {pending === 'export' ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Download size={15} />
                  )}
                  带走我的资料
                </button>
                {result(['export'])}
                {clearConfirm ? (
                  <div className="clear-confirm">
                    <p>这台电脑里的对话、记忆、安排、笔记、连接信息和自选人物图片会被删除，无法找回。</p>
                    <button
                      className="danger-button"
                      disabled={disabled}
                      onClick={() =>
                        void perform('clear', async () => {
                          if (onBeforeForget?.() === false) return;
                          onState(await api.clearData());
                          resetCompanion();
                          draft.current = {};
                          onClear();
                          notify('这台电脑里的资料已经清空');
                        })
                      }
                    >
                      清空本机资料
                    </button>
                    <button className="text-button" onClick={() => setClearConfirm(false)}>
                      先留着
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-button danger-text"
                    disabled={disabled}
                    onClick={() => setClearConfirm(true)}
                  >
                    <Trash2 size={14} />
                    清空这台电脑里的资料
                  </button>
                )}
                {result(['clear'])}
              </div>
            </details>
          </>
        )}
      </div>
    </Frame>
  );
}
