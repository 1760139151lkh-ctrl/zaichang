import {
  useEffect,
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
import { useAppearance } from './appearance';
import { DEFAULT_INTERACTION } from '../shared/interaction';
import { PersonaEditor, type PersonaDraft } from './PersonaEditor';
import { CompanionSettings } from './CompanionSettings';
import { useCompanion } from './companion';
import './settings-refinement.css';

const api = window.zaichang;
export interface SettingsDraft {
  apiKey?: string;
  guidance?: string;
  persona?: PersonaDraft;
}
interface Props {
  embedded?: boolean;
  initialTab?: string;
  state: State;
  busy: boolean;
  onState: (s: State) => void;
  onClose: () => void;
  notify: (s: string) => void;
  onClear: () => void;
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
  draft,
  memoryWorkspace,
  onMemoryWorkspace,
  embedded,
  initialTab = '连接',
}: Props) {
  const [appearance, setAppearance] = useAppearance();
  const { reset: resetCompanion, value: companion, update: updateCompanion } = useCompanion();
  const interaction = state.settings.interaction || DEFAULT_INTERACTION;
  const [tab, setTab] = useState(initialTab);
  const tabs = embedded ? ['陪伴', '交流', '偏好', '连接'] : ['陪伴', '交流', '偏好', '连接', '记忆'];
  const tabNames: Record<string, string> = { 陪伴: '陪伴的样子', 交流: '怎么相处', 偏好: '阅读与节奏', 连接: '连接与资料', 记忆: '关于你' };
  const Frame = embedded ? PagePanel : Modal;
  const [key, setKey] = useState(draft.current.apiKey || '');
  const [guidance, setGuidance] = useState(draft.current.guidance ?? state.settings.guidance);
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
    const frame = requestAnimationFrame(() => sourceBackRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  function changeTab(value: string) {
    if (pendingRef.current === 'test') {
      testCancelled.current = true;
      void api.cancelConnection();
    }
    setTab(value);
    setFeedback(null);
    bodyRef.current?.scrollTo({ top: 0 });
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
      title={tab === '资料' ? '校园资料' : tab === '记忆' ? '关于你' : tab === '陪伴' ? '让这里，更像你喜欢的地方。' : tab === '交流' ? '怎么相处' : tab === '偏好' ? '按你的节奏来。' : state.settings.hasKey || lunaSubstitute ? '连接与资料' : '让我们聊起来。'}
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
        {tab === '陪伴' && <CompanionSettings persona={state.settings.persona} draft={draft} onState={onState} busy={busy || !!pending} saving={pending === 'persona'} saveOperation={(operation) => perform('persona', operation)} onEditPersona={() => changeTab('交流')} />}
        {tab === '连接' && (
          <>
            <div className="section-heading">
              <div>
                <h3>{lunaSubstitute ? state.modelRuntime?.displayName : 'DeepSeek'}</h3>
                <p>
                  {lunaSubstitute
                    ? '当前使用 Luna，日常连接仍是 DeepSeek'
                    : state.settings.mode === 'deepseek' && state.settings.hasKey
                      ? '密钥留好了。可以试着连接。'
                      : '留下一把密钥，我们就可以聊起来。'}
                </p>
              </div>
            </div>
            {lunaSubstitute ? (
              <div className="model-runtime-note">
                <p>这次使用 Luna。你选择的资料范围和保留方式仍然有效。</p>
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
                    {pending === 'test' ? '正在检查…' : '试着连接'}
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
                    通过 App Server 使用当前登录的 {state.modelRuntime?.displayName}。生产默认仍为
                    DeepSeek；两种连接各自记录使用情况。
                  </p>
                </details>
              </div>
            ) : (
              <>
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
                        setFeedback({ action: 'save', text: '密钥留好了。可以试着连接。' });
                      })
                    }
                  >
                    {pending === 'save' && <LoaderCircle size={14} className="spin" />}留下密钥
                  </button>
                </div>
                {result(['save', 'remove'])}
                <details className="advanced connection-advanced" open={!state.settings.hasKey}>
                  <summary>试一试，或换一把密钥</summary>
                  <div className="advanced-body">
                    <div className="field-buttons">
                      <button
                        className="subtle-button"
                        disabled={disabled || !(key || state.settings.hasKey)}
                        onClick={() => {
                          testCancelled.current = false;
                          void perform('test', async () => {
                            const text = await api.testConnection({ ...(key ? { apiKey: key } : {}) });
                            setFeedback({
                              action: 'test',
                              text:
                                key || state.settings.mode !== 'deepseek'
                                  ? '可以聊起来了'
                                  : `${text.replace(/[。.!！]+$/, '')}，可以聊起来了`,
                            });
                          });
                        }}
                      >
                        {pending === 'test' && <LoaderCircle size={14} className="spin" />}
                        {pending === 'test' ? '正在试着连接…' : '试着连接'}
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
                    {result(['test'])}
                  </div>
                </details>
              </>
            )}
            {state.settings.mode === 'deepseek' && (
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
                先看看在场的样子
              </button>
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
            <SourcePermissions onState={onState} />
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
            {!connectorReady && (
              <section className="campus-import-block">
                <div className="connector">
                  <div>
                    <strong>手边已有一份校园资料</strong>
                    <p>也可以打开以前保存的文件。学校的最新消息仍需登录后查看。</p>
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
                  <summary>这份资料的其他操作</summary>
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
                      带走一份空白格式
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
              </section>
            )}
            <Switch
              checked={state.settings.weatherEnabled}
              onChange={(v) => void update('weather', { weatherEnabled: v })}
              label="杭州天气"
              detail="查看杭州的天气，不读取你的位置。"
              disabled={!!pending || (busy && !state.settings.weatherEnabled)}
            />
            {result(['weather'])}
          </>
        )}
        {tab === '记忆' && (
          <MemoryPanelSimple
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
              <p className="settings-lede">读得舒服，也聊得自在。</p>
              <div className="rhythm-layout">
                <div className="rhythm-controls">
                  <section className="preference-section">
                    <h3 className="section-title">阅读的样子</h3>
                    <div className="rhythm-choice-row"><span>外观</span><div className="rhythm-segmented" role="group" aria-label="外观主题">
                      {([['light', '晨光'], ['dark', '夜色'], ['system', '跟随系统']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={appearance.theme === value} onClick={() => setAppearance({ theme: value })}>{label}</button>)}
                    </div></div>
                    <div className="rhythm-choice-row"><span>正文字号</span><div className="rhythm-segmented" role="group" aria-label="正文字号">
                      {([[1, '标准'], [1.15, '大一点'], [1.3, '再大一点']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={appearance.readingScale === value} onClick={() => setAppearance({ readingScale: value })}>{label}</button>)}
                    </div></div>
                    <div className="rhythm-choice-row"><span>内容间距</span><div className="rhythm-segmented" role="group" aria-label="内容间距">
                      {([['comfortable', '舒展'], ['compact', '紧凑']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={appearance.density === value} onClick={() => setAppearance({ density: value })}>{label}</button>)}
                    </div></div>
                    <Switch label="少一点动态" detail="让画面安静一点。" checked={companion.reducedMotion} onChange={reducedMotion => updateCompanion({ reducedMotion })} />
                  </section>
                  <section className="preference-section initiative-section">
                    <h3 className="section-title">希望我怎样陪着你</h3>
                    <div className="initiative-choices" role="group" aria-label="主动帮助程度">
                      {([
                        ['quiet', '等你开口', '你想聊的时候，我们再接着说。'],
                        ['prepare', '先把资料备好', '安静整理，等你想看时再打开。'],
                        ['when_useful', '有值得说的事，再告诉你', '遇到与你有关的变化，再来和你商量。'],
                      ] as const).map(([value, label, description]) => <button type="button" key={value} aria-pressed={interaction.initiative === value} disabled={!!pending} onClick={() => void update('initiative', { interaction: { ...interaction, initiative: value } })}>
                        <span><strong>{label}</strong><small>{description}</small></span><span className="initiative-radio" aria-hidden="true" />
                      </button>)}
                    </div>
                    <Switch label="留意你交给我的事" detail="关闭后，等你询问时再看。" checked={interaction.followup === 'meaningful_change'} disabled={!!pending} onChange={value => void update('followup', { interaction: { ...interaction, followup: value ? 'meaningful_change' : 'on_request' } })} />
                    <div className="rhythm-choice-row"><span>主动来聊</span><div className="rhythm-segmented" role="group" aria-label="不为事情、只是来找你聊聊的频率">
                      {([['off', '不用'], ['sometimes', '偶尔'], ['often', '常来']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={(state.settings.companionCheckIns || 'sometimes') === value} disabled={!!pending} onClick={() => void update('checkins', { companionCheckIns: value })}>{label}</button>)}
                    </div></div>
                    {result(['initiative', 'followup', 'checkins'])}
                  </section>
                </div>
                <aside className="rhythm-preview-column" aria-label="阅读预览与提醒">
                  <div className={`reading-feel-preview ${appearance.density === 'compact' ? 'is-compact' : ''}`} style={{ fontSize: `${16 * appearance.readingScale}px` }}>
                    <span className="reading-preview-label">此刻的阅读感觉</span>
                    <h3>从一个想法，<br />慢慢说起。</h3>
                    <p>有时，先把问题留在纸上，也是一种继续。</p>
                    <p>你可以慢慢想，我会在这里。等你想说的时候，我们再接着聊。</p>
                    <div className="reading-preview-formula" aria-label="x(t)等于u(t)乘以c(t)">x(t) = u(t)c(t)</div>
                  </div>
                  <section className="preference-section reminder-preference">
                    <h3 className="section-title">提醒与通知</h3>
                    <Switch checked={state.settings.remindersEnabled} onChange={v => void update('reminders', { remindersEnabled: v })} label="用系统通知叫我" detail="约好的提醒会准时响；你不在窗口前时，想告诉你的事也会轻轻提一下。" disabled={!!pending || (busy && !state.settings.remindersEnabled)} />
                    <Switch checked={(state.settings.notificationPreview || 'words') === 'words'} onChange={v => void update('preview', { notificationPreview: v ? 'words' : 'private' })} label="通知里显示说的话" detail="关掉后，通知只写“有件事想跟你说”。" disabled={!!pending} />
                    <Switch checked={(state.settings.backgroundPresence || 'tray') === 'tray'} onChange={v => void update('presence', { backgroundPresence: v ? 'tray' : 'quit' })} label="关掉窗口后留在托盘" detail="按当前设置，继续处理仍有效的提醒与托付；电脑睡眠或关机时暂停。" disabled={!!pending} />
                    <Switch checked={state.settings.launchAtLogin === true} onChange={v => void update('login', { launchAtLogin: v })} label="开机后优先留在托盘" detail="启动时先收在托盘；托盘暂时不可用时，会打开窗口。" disabled={!!pending} />
                    {result(['reminders', 'preview', 'presence', 'login'])}
                  </section>
                </aside>
              </div>
            </>}
            <section className="preference-section" hidden={tab !== '交流'}>
              <h3 className="section-title">怎么交流</h3>
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
              {result(['interaction'])}
            </section>
            <section className="preference-section" hidden={tab !== '交流'}>
              <h3 className="section-title">关于你的补充</h3>
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
                {guidance !== state.settings.guidance && <small className="setting-hint">这段话还没留下</small>}
              </div>
              {result(['guidance'])}
            </section>
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
