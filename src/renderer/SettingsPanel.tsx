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
  const { reset: resetCompanion } = useCompanion();
  const interaction = state.settings.interaction || DEFAULT_INTERACTION;
  const [tab, setTab] = useState(initialTab);
  const tabs = embedded ? ['陪伴', '交流', '偏好', '连接'] : ['陪伴', '交流', '偏好', '连接', '记忆'];
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
            ? '已取消测试'
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
            : '待验证';
  return (
    <Frame
      title={tab === '资料' ? '校园资料' : tab === '记忆' ? '关于你' : tab === '陪伴' ? '让这里，更像你喜欢的地方。' : tab === '交流' ? '怎么相处' : tab === '偏好' ? '按你的节奏来。' : '连接与资料'}
      onClose={onClose}
      className={`settings-panel ${initialTab === '记忆' ? 'memory-page' : ''} ${tab === '陪伴' || tab === '交流' ? 'settings-wide' : ''}`}
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
              {t}
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
        {tab === '陪伴' && <CompanionSettings />}
        {tab === '连接' && (
          <>
            <div className="section-heading">
              <div>
                <h3>{lunaSubstitute ? state.modelRuntime?.displayName : 'DeepSeek'}</h3>
                <p>
                  {lunaSubstitute
                    ? '临时代测 · 生产默认仍为 DeepSeek'
                    : state.settings.mode === 'deepseek' && state.settings.hasKey
                      ? '连接配置已保存'
                      : '连接后即可开始对话'}
                </p>
              </div>
            </div>
            {lunaSubstitute ? (
              <div className="model-runtime-note">
                <p>当前使用临时代测模型。你的资料范围、保存选择与操作权限保持一致。</p>
                <div className="field-buttons">
                  {state.settings.mode === 'demo' && (
                    <button
                      className="primary-button"
                      disabled={disabled}
                      onClick={() => void update('enable-luna', { mode: 'deepseek' })}
                    >
                      启用 Luna 临时代测
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
                    {pending === 'test' ? '正在检查…' : '检查临时代测连接'}
                  </button>
                  {pending === 'test' && (
                    <button
                      className="text-button"
                      onClick={() => {
                        testCancelled.current = true;
                        void api.cancelConnection();
                      }}
                    >
                      取消检查
                    </button>
                  )}
                </div>
                {result(['test'])}
                <details className="connection-technical">
                  <summary>临时代测说明</summary>
                  <p>
                    通过 App Server 使用当前登录的 {state.modelRuntime?.displayName}。生产默认仍为
                    DeepSeek；两者的测试记录与账户用量分开保存。
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
                    placeholder={state.settings.hasKey ? '已保存' : '输入密钥'}
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
                        setFeedback({ action: 'save', text: '连接配置已保存' });
                      })
                    }
                  >
                    {pending === 'save' && <LoaderCircle size={14} className="spin" />}连接 DeepSeek
                  </button>
                </div>
                {result(['save', 'remove'])}
                <details className="advanced connection-advanced">
                  <summary>更多连接设置</summary>
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
                                  ? '连接可用'
                                  : `${text.replace(/[。.!！]+$/, '')}，连接可用`,
                            });
                          });
                        }}
                      >
                        {pending === 'test' && <LoaderCircle size={14} className="spin" />}
                        {pending === 'test' ? '正在测试…' : '测试连接'}
                      </button>
                      {pending === 'test' && (
                        <button
                          className="text-button"
                          onClick={() => {
                            testCancelled.current = true;
                            void api.cancelConnection();
                          }}
                        >
                          取消测试
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
                              setFeedback({ action: 'remove', text: '连接密钥已移除' });
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
                    setFeedback({ action: 'demo', text: '已切换到本地示例' });
                  })
                }
              >
                使用本地示例
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
                      ? '已用浙大账号连接，提问时会按需读取'
                      : connector?.credentialsConfigured
                        ? '登录信息已安全保存，再验证一次即可使用'
                        : '使用浙大统一身份认证，不需要导入资料文件'}
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
                    '重新验证'
                  ) : connector?.credentialsConfigured ? (
                    '验证登录'
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
                          setFeedback({ action: 'credentials', text: '登录信息已更新并通过验证' });
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
                            text: '校园资料已断开；登录信息仍安全保存在本机',
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
                    {connector.lastVerifiedAt ? ` 上次验证：${date(connector.lastVerifiedAt)}。` : ''}
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
                    <strong>备用：导入旧快照</strong>
                    <p>只用于迁移或离线查看，不会冒充浙大账号资料</p>
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
                            text: '离线快照已导入；登录浙大账号后才会用于账号查询',
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
                    离线快照 · 更新于 {date(state.campus.updatedAt)}
                  </small>
                )}
                <details className="campus-more">
                  <summary>更多离线资料操作</summary>
                  <div className="field-buttons">
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() =>
                        void perform('template', async () => {
                          if (await api.campusTemplate())
                            setFeedback({ action: 'template', text: '模板已保存' });
                        })
                      }
                    >
                      <Download size={14} />
                      下载导入模板
                    </button>
                    {state.campus && (
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() =>
                          void perform('disconnect', async () => {
                            onState(await api.disconnectCampus());
                            setFeedback({ action: 'disconnect', text: '离线快照已移除' });
                          })
                        }
                      >
                        移除快照
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
              detail="使用杭州城市参考坐标，不代表你的精确位置"
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
            <section className="preference-section" hidden={tab !== '偏好'}>
              <h3 className="section-title">阅读与外观</h3>
              <div className="preference-fields">
                <label>
                  外观
                  <select
                    aria-label="外观主题"
                    value={appearance.theme}
                    onChange={(event) =>
                      setAppearance({ theme: event.target.value as typeof appearance.theme })
                    }
                  >
                    <option value="system">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </label>
                <label>
                  正文字号
                  <select
                    aria-label="正文字号"
                    value={appearance.readingScale}
                    onChange={(event) => setAppearance({ readingScale: Number(event.target.value) })}
                  >
                    <option value="1">标准</option>
                    <option value="1.15">较大</option>
                    <option value="1.3">更大</option>
                  </select>
                </label>
                <label>
                  内容间距
                  <select
                    aria-label="内容间距"
                    value={appearance.density}
                    onChange={(event) =>
                      setAppearance({ density: event.target.value as typeof appearance.density })
                    }
                  >
                    <option value="comfortable">舒展</option>
                    <option value="compact">紧凑</option>
                  </select>
                </label>
              </div>
            </section>
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
                    <option value="none">不主动开玩笑</option>
                    <option value="light">合适时轻松一点</option>
                  </select>
                </label>
              </div>
              {result(['interaction'])}
            </section>
            <section className="preference-section" hidden={tab !== '偏好'}>
              <h3 className="section-title">主动帮助</h3>
              <div className="preference-fields">
                <label>
                  参与程度
                  <select
                    aria-label="主动帮助程度"
                    value={interaction.initiative}
                    disabled={!!pending}
                    onChange={(event) =>
                      void update('initiative', {
                        interaction: {
                          ...interaction,
                          initiative: event.target.value as typeof interaction.initiative,
                        },
                      })
                    }
                  >
                    <option value="quiet">等我开口</option>
                    <option value="prepare">只备好资料，等我来看</option>
                    <option value="when_useful">有实际价值时可以提醒</option>
                  </select>
                </label>
                <label>
                  什么时候留意
                  <select
                    aria-label="定期检查更新"
                    value={interaction.followup}
                    disabled={!!pending}
                    onChange={(event) =>
                      void update('followup', {
                        interaction: {
                          ...interaction,
                          followup: event.target.value as typeof interaction.followup,
                        },
                      })
                    }
                  >
                    <option value="on_request">我询问时再查</option>
                    <option value="meaningful_change">留意我交给你的事</option>
                  </select>
                </label>
              </div>
              {result(['initiative', 'followup'])}
            </section>
            <section className="preference-section" hidden={tab !== '偏好'}>
              <h3 className="section-title">提醒</h3>
              <Switch
                checked={state.settings.remindersEnabled}
                onChange={(v) => void update('reminders', { remindersEnabled: v })}
                label="提醒安排"
                detail="仅在应用运行时提醒已设定时间的安排"
                disabled={!!pending || (busy && !state.settings.remindersEnabled)}
              />
              {result(['reminders'])}
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
              <p className="setting-note">随个性记忆权限使用，不会写入角色模板。</p>
              <div className="field-buttons">
                <button
                  className="primary-button"
                  disabled={disabled || guidance === state.settings.guidance}
                  onClick={() =>
                    void perform('guidance', async () => {
                      onState(await api.saveSettings({ guidance }));
                      setFeedback({ action: 'guidance', text: '回复偏好已保存' });
                    })
                  }
                >
                  {pending === 'guidance' && <LoaderCircle size={14} className="spin" />}保存偏好
                </button>
                {guidance !== state.settings.guidance && <small className="setting-hint">未保存的修改</small>}
              </div>
              {result(['guidance'])}
            </section>
            <details className="data-controls" hidden={tab !== '偏好'}>
              <summary className="section-title">留在这台电脑里的</summary>
              <div className="data-controls-body">
                <details className="data-storage-detail"><summary>资料如何保留</summary><p>对话保存在这台电脑。聊天时，会把你允许使用的内容交给所连接的模型；本机数据库没有整体加密。</p></details>
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() =>
                    void perform('export', async () => {
                      if (await api.exportData()) setFeedback({ action: 'export', text: '资料已导出' });
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
                    <p>这台电脑里的对话、记忆、安排、笔记和连接信息会被删除，无法找回。</p>
                    <button
                      className="danger-button"
                      disabled={disabled}
                      onClick={() =>
                        void perform('clear', async () => {
                          onState(await api.clearData());
                          resetCompanion();
                          draft.current = {};
                          onClear();
                          notify('这里的资料已清空');
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
                    清空本地资料
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
