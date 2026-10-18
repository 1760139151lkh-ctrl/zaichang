import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ChevronRight, FileText, LoaderCircle, Pause, Pencil, RotateCcw, X } from 'lucide-react';
import type { Action, Bridge, Message, RuntimeOverview, State } from '../shared/types';
import type { Condition, EffectAction, EvidenceEvent, MemoryView } from '../shared/harness';
import { IconButton, Modal, Switch, uiError } from './ui';
import { formatDateTime, fromTimeInput, toTimeInput } from './time';
import './entrusted.css';
import { EntrustedPanel } from './EntrustedPanel';

const api = window.zaichang;
export const failureText = uiError;
const date = (v?: string) => (v ? formatDateTime(v) : '');
const localTime = toTimeInput;
const names: Record<string, string> = {
  schedule: '课程安排',
  exams: '考试',
  sports: '体育记录',
  weather: '天气',
  origin: '出发地点',
  precise_origin: '精确起点',
  financial_coverage: '可用资金',
  food_service_status: '供餐时间',
  independent_performance: '独立完成的证据',
  'destination.eligibility': '目的地入口',
  transport: '交通方式',
  device: '可用设备',
  location: '地点',
  'running.today_allowed': '今天是否跑步',
};
export const needName = (key: string) =>
  names[key] ||
  (/device|computer|equipment/.test(key)
    ? '可用设备'
    : /origin|location|route/.test(key)
      ? '地点与路线'
      : /weather/.test(key)
        ? '对应时段的天气'
        : /time|deadline/.test(key)
          ? '时间限制'
          : /permission|grant/.test(key)
            ? '使用授权'
            : '相关条件');
const knowledge: Record<string, string> = {
  fresh: '有可用的资料',
  stale: '这份资料可能有变化',
  partial: '只找到一部分',
  unknown: '还不能确定',
  not_queried: '这次没有查阅',
  not_found: '还没找到',
  unsupported: '暂时还不能查阅',
  forbidden: '这次没有允许使用',
  conflict: '不同资料的说法不一样',
  failed: '这次没能查到',
  known_absent: '查过了，没有这项记录',
  cancelled: '先不查了',
};
const operationReason = (reason: string) =>
  ({
    local_transaction_not_committed: '这次没能把安排留在设备上。',
    local_transaction_rolled_back: '这次修改没有留下，原来的安排保持不变。',
    receipt_unavailable: '还没有收到对方的确切结果。',
  })[reason] || reason;
const sourceName = (e: EvidenceEvent) =>
  e.fileName ||
  {
    'history:self': '对话原文',
    'profile:self': '你在记忆页的修改',
    'work:self': '你的反馈',
    'campus:zju-account': '浙大本人账号',
    'campus:local': '导入的校园资料',
    'local-agenda': '本地安排',
  }[e.sourceId] ||
  '资料原文';
export function EvidencePreview({ eventId }: { eventId: string }) {
  const [e, setEvidence] = useState<EvidenceEvent | null>(),
    [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    api
      .evidence(eventId)
      .then((v) => {
        if (current) setEvidence(v);
      })
      .catch((e) => {
        if (current) setError(failureText(e));
      });
    return () => {
      current = false;
    };
  }, [eventId]);
  if (error)
    return (
      <p className="harness-inline-error" role="alert">
        {error}
      </p>
    );
  if (e === undefined) return <p className="harness-muted">正在打开原文…</p>;
  if (!e) return <p className="harness-muted">这份原文已删除或不在可查看范围内。</p>;
  return (
    <div className="evidence-preview">
      <div>
        <FileText size={14} />
        <strong>{sourceName(e)}</strong>
        <time>{date(e.receivedAt)}</time>
      </div>
      <p>{e.text || '内容已删除'}</p>
      {e.status === 'redacted' && <small>已删除的段落不再显示</small>}
    </div>
  );
}
export function ReplyEvidence({ message }: { message: Message }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState('');
  const r = message.contextReceipt,
    s = message.scopeSummary;
  if (!r && !s) return null;
  const scope =
    s?.retention === 'session_only'
      ? '本轮不保存'
      : s?.memoryMode === 'current_sources_only'
        ? '只用本条与附件'
        : s?.memoryMode === 'none'
          ? '未参考记忆'
          : '按需参考资料';
  const interpretationLabel = s?.interpretation
    ? {
        listen: '先听你说',
        listen_and_local: '先听你说，同时记一件本地安排',
        analyze: '分析并按需核对',
        act: '记下你说的安排',
        mixed: '分别处理这几件事',
      }[s.interpretation.posture]
    : '';
  const surfaceLabel = s?.audience === 'group' ? '群消息草稿' : s?.audience === 'public' ? '公开草稿' : scope;
  return (
    <div className="reply-evidence">
      <button className="text-button evidence-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{surfaceLabel}</span>
        <ChevronRight size={13} className={open ? 'rotated' : ''} />
      </button>
      {open && (
        <div className="evidence-detail">
          <p className="harness-muted">
            这次回答参考了什么。
            {s?.release ? '这份草稿留给你决定怎么发送。' : ''}
            {r
              ? ` ${r.coverage === 'blocked' ? '还有必要的信息没找到。' : r.coverage === 'conditional' ? '有些资料还需要再看一看。' : `共 ${r.providedEvidenceIds.length} 处来源。`}`
              : ''}
          </p>
          {s?.interpretation && (
            <div className="interpretation-summary">
              <strong>我是这样理解的</strong>
              <p>{interpretationLabel}</p>
              {!!s.interpretation.unresolvedReferences.length && (
                <p className="harness-inline-warning">
                  这几处还想和你说清楚：
                  {s.interpretation.unresolvedReferences.join('、')}
                </p>
              )}
            </div>
          )}
          {s?.release && (
            <div className="release-summary">
              <strong>{s.release.mode === 'send' ? '想发送的话，先看看这份草稿' : '写给你过目的草稿'}</strong>
              <p>
                收件人：{s.release.recipient} · 目的：{s.release.purpose}
              </p>
              <p>
                语气：{s.release.tone}
                。在场还不能替你发送；你可以复制到原来的应用里。
              </p>
              {!!s.release.allowedFacts.length && <p>允许写入：{s.release.allowedFacts.join('、')}</p>}
            </div>
          )}
          {r?.needResults.length ? (
            <ul className="need-list">
              {r.needResults.map((n, i) => (
                <li key={n.key + i}>
                  <span>{needName(n.key)}</span>
                  <span>{knowledge[n.status] || '还需要再看一看'}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {s?.retention !== 'session_only' &&
            r?.providedEvidenceIds.map((id, i) => (
              <div key={id}>
                <button
                  className="text-button evidence-source-button"
                  onClick={() => setSelected(selected === id ? '' : id)}
                >
                  <FileText size={13} />
                  查看来源 {i + 1}
                  <ChevronRight size={12} />
                </button>
                {selected === id && <EvidencePreview eventId={id} />}
              </div>
            ))}
          {(!r?.providedEvidenceIds.length || s?.retention === 'session_only') && (
            <p className="harness-muted">
              {s?.retention === 'session_only'
                ? '仅在本轮使用，关闭对话后不留原文。'
                : '这次没有可供回看的原文。'}
            </p>
          )}
          {r && r.watermarks.extractionGaps.length > 0 && (
            <p className="harness-muted">有些原话还没整理清楚；在你允许的范围内，仍可直接参考原文。</p>
          )}
        </div>
      )}
    </div>
  );
}
export type TurnControls = NonNullable<Parameters<Bridge['send']>[0]['controls']>;
export function ScopeSettings({
  value,
  onChange,
  onClose,
}: {
  value: TurnControls;
  onChange: (v: TurnControls) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="这次，按你的边界来" onClose={onClose} className="scope-panel">
      <div className="panel-body">
        <p className="panel-intro">下一句话想让在场了解多少、留下多少，都由你决定。</p>
        <label className="field-label">
          这句话交给谁来回答
          <select
            aria-label="本轮处理方式"
            value={value.transmission || 'cloud_allowed'}
            onChange={(e) =>
              onChange({
                ...value,
                transmission: e.target.value as TurnControls['transmission'],
              })
            }
          >
            <option value="cloud_allowed">交给我选择的联网模型回答</option>
            <option value="local_only">仅留在本机，不发送给模型</option>
          </select>
        </label>
        {value.transmission === 'local_only' && (
          <p className="scope-explanation">本机还没有离线回答模型。这条内容不会上传，也不会生成模型回答。</p>
        )}
        <label className="field-label">
          可以参考什么
          <select
            aria-label="本轮参考范围"
            value={value.memoryMode || 'relevant'}
            onChange={(e) =>
              onChange({
                ...value,
                memoryMode: e.target.value as TurnControls['memoryMode'],
              })
            }
          >
            <option value="relevant">按需参考相关资料</option>
            <option value="current_sources_only">只看本条消息与附件</option>
            <option value="none">不参考个人记忆与历史</option>
          </select>
        </label>
        <label className="field-label">
          这条消息怎样保留
          <select
            aria-label="本轮保留方式"
            value={value.retention || 'purpose_scoped'}
            onChange={(e) =>
              onChange({
                ...value,
                retention: e.target.value as TurnControls['retention'],
              })
            }
          >
            <option value="purpose_scoped">留下对话，也慢慢了解我</option>
            <option value="history_no_inference">留下对话，不记成长期偏好</option>
            <option value="session_only">本轮不保存</option>
          </select>
        </label>
        <label className="field-label">
          回复准备给谁看
          <select
            aria-label="本轮回复受众"
            value={value.audience || 'self'}
            onChange={(e) =>
              onChange({
                ...value,
                audience: e.target.value as TurnControls['audience'],
              })
            }
          >
            <option value="self">只给我看</option>
            <option value="group">准备给群里看的草稿</option>
            <option value="public">准备公开的草稿</option>
          </select>
        </label>
        {value.retention === 'session_only' && (
          <p className="scope-explanation">
            这句话和附件不会留下历史，也不会记成长期偏好。你明确让在场记下的安排仍会留在这台设备上；如果选择联网回答，你允许的内容仍会发送给模型。
          </p>
        )}
        {value.audience && value.audience !== 'self' && (
          <p className="scope-explanation">只使用你允许公开的内容；不会自动发送。</p>
        )}
        <button className="primary-button" onClick={onClose}>
          用于下一条消息
        </button>
      </div>
    </Modal>
  );
}
function describeCondition(c: Condition): string {
  if (c.op === 'all' && !c.terms.length) return '通常适用';
  if (c.op === 'unknown') return '还有条件没说清楚';
  if (c.op === 'all' || c.op === 'any')
    return c.terms.map(describeCondition).join(c.op === 'all' ? '，并且' : '，或');
  if (c.op === 'not') return '不满足：' + describeCondition(c.term);
  if (c.op === 'compare') {
    const v = c.value;
    return `${needName(c.predicate)} ${({ eq: '为', ne: '不为', lt: '少于', lte: '不超过', gt: '超过', gte: '不少于' } as Record<string, string>)[c.comparator] || c.comparator} ${'value' in v ? String(v.value) : '还不清楚'}${'unit' in v ? ' ' + v.unit : ''}`;
  }
  return '有附加条件';
}
export function UnderstandingPanel({
  state,
  onState,
  busy,
}: {
  state: State;
  onState: (s: State) => void;
  busy: boolean;
}) {
  const editForm = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<RuntimeOverview>(),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [pending, setPending] = useState('');
  const [text, setText] = useState(''),
    [edit, setEdit] = useState<MemoryView>(),
    [operation, setOperation] = useState<'CORRECT' | 'SUPERSEDE' | 'ADD_EXCEPTION'>('CORRECT'),
    [from, setFrom] = useState(''),
    [until, setUntil] = useState(''),
    [filter, setFilter] = useState('all'),
    [source, setSource] = useState('');
  useEffect(() => {
    let mounted = true;
    api
      .runtimeOverview()
      .then((v) => {
        if (mounted) setData(v);
      })
      .catch((e) => {
        if (mounted) setError(failureText(e));
      });
    return () => {
      mounted = false;
    };
  }, [state]);
  async function act(name: string, fn: () => Promise<void>) {
    if (pending) return;
    setPending(name);
    setError('');
    setStatus('');
    try {
      await fn();
      setData(await api.runtimeOverview());
    } catch (e) {
      setError(failureText(e));
    } finally {
      setPending('');
    }
  }
  function editMemory(m: MemoryView) {
    setEdit(m);
    setText(m.text);
    setOperation('CORRECT');
    setFrom(localTime(m.validFrom));
    setUntil(localTime(m.validTo));
    setError('');
    requestAnimationFrame(() => editForm.current?.querySelector('textarea')?.focus());
  }
  const priority: Record<string, number> = {
    active: 0,
    candidate: 1,
    disputed: 1,
    inactive: 2,
    expired: 3,
  };
  const memories = [...(data?.memories || [])].sort(
      (a, b) => (priority[a.status] ?? 4) - (priority[b.status] ?? 4),
    ),
    visible = memories.filter(
      (m) =>
        filter === 'all' ||
        (filter === 'active' && m.status === 'active') ||
        (filter === 'pending' && ['candidate', 'disputed'].includes(m.status)) ||
        (filter === 'inactive' && ['inactive', 'expired'].includes(m.status)),
    );
  return (
    <section className="understanding-panel">
      <div className="settings-lede">
        <p className="panel-intro">会影响之后对话的内容，都在这里。你可以随时改正、停用或删除。</p>
      </div>
      <Switch
        checked={state.settings.memoryEnabled}
        label="记住我明确说出的偏好"
        detail="关闭后，不再参考记忆与历史，也不形成新的个人理解"
        disabled={!!pending || (busy && !state.settings.memoryEnabled)}
        onChange={(v) =>
          void act('toggle', async () => {
            onState(await api.saveSettings({ memoryEnabled: v }));
          })
        }
      />
      <div className="understanding-heading">
        <div>
          <strong>已保存的理解</strong>
          <small>{memories.length ? `${memories.length} 条` : '还没有记录'}</small>
        </div>
        <select aria-label="筛选理解状态" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="active">正在使用</option>
          <option value="pending">待确认</option>
          <option value="inactive">已停用或过期</option>
        </select>
      </div>
      <div className="memory-list">
        {visible.map((m) => (
          <div className={`memory-item understanding-item ${m.status}`} key={m.id}>
            <div className="understanding-content">
              <div className="understanding-meta">
                <span>
                  {(
                    {
                      active: '正在使用',
                      candidate: '待确认',
                      disputed: '有待核对',
                      inactive: '已停用',
                      expired: '已过期',
                    } as Record<string, string>
                  )[m.status] || '不再使用'}
                </span>
                <small>
                  {m.verification === 'verified'
                    ? '有原文依据'
                    : m.verification === 'unverified'
                      ? '旧记录 · 原文未核实'
                      : '尚未核验'}
                </small>
              </div>
              <p>{m.text}</p>
              <div className="understanding-limits">
                {m.status === 'candidate' || m.status === 'disputed'
                  ? '适用范围待确认'
                  : m.status === 'inactive'
                    ? '原条件已保留，当前不使用'
                    : describeCondition(JSON.parse(m.conditions))}
                {m.validFrom ? ` · ${date(m.validFrom)} 起` : ''}
                {m.validTo ? ` · 至 ${date(m.validTo)}` : ''}
              </div>
              <div className="understanding-buttons">
                <button className="memory-source" onClick={() => setSource(source === m.id ? '' : m.id)}>
                  查看原话
                  <ChevronRight size={12} />
                </button>
                <button
                  className="text-button"
                  aria-label={`修改记忆：${m.text}`}
                  onClick={() => editMemory(m)}
                >
                  <Pencil size={13} />
                  改正
                </button>
                {m.status !== 'inactive' && (
                  <button
                    className="text-button"
                    disabled={!!pending}
                    onClick={() =>
                      void act('deactivate', async () => {
                        onState(await api.memory({ action: 'deactivate', id: m.id }));
                        setStatus('已停用，保留原话供你查看。');
                      })
                    }
                  >
                    <Pause size={12} />
                    停用
                  </button>
                )}
                <IconButton
                  label={`删除记忆：${m.text}`}
                  disabled={!!pending}
                  onClick={() =>
                    void act('delete', async () => {
                      onState(await api.memory({ action: 'delete', id: m.id }));
                      setStatus('已清理这条理解与相关派生内容。旧建议需重新核对。');
                    })
                  }
                >
                  <X size={14} />
                </IconButton>
              </div>
              {source === m.id &&
                (m.evidenceIds.length ? (
                  m.evidenceIds.map((id) => <EvidencePreview key={id} eventId={id} />)
                ) : (
                  <p className="memory-quote">原话无法定位，这条记录尚不作为已核实理解。</p>
                ))}
            </div>
          </div>
        ))}
      </div>
      {!visible.length && (
        <p className="memory-empty">
          {memories.length ? '这个状态下没有记录。' : '可以先聊起来，需要时再逐渐了解。'}
        </p>
      )}
      <form
        ref={editForm}
        className="memory-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act('save', async () => {
            onState(
              await api.memory({
                action: 'save',
                id: edit?.id,
                expectedRevision: edit?.revision,
                text: text.trim(),
                operation: edit ? operation : undefined,
                conditions: edit ? JSON.parse(edit.conditions) : undefined,
                validFrom: fromTimeInput(from),
                validTo: fromTimeInput(until),
              }),
            );
            setText('');
            setEdit(undefined);
            setFrom('');
            setUntil('');
            setStatus('已保存，下一轮将按更新后的理解处理。');
          });
        }}
      >
        <div className="form-heading">
          <strong>{edit ? '修改理解' : '添加一条理解'}</strong>
          <small>{edit ? '这次修改会从下一轮开始生效' : '只保存你明确说出的内容'}</small>
        </div>
        <label className="field-label">
          {edit ? '修改这条理解' : '告诉在场一件小事'}
          <textarea
            aria-label="偏好内容"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="例如：我通常喜欢连续学习，但今天只想休息"
          />
        </label>
        {edit && (
          <label className="field-label">
            这次是什么变化
            <select
              aria-label="理解修改方式"
              value={operation}
              onChange={(e) => setOperation(e.target.value as typeof operation)}
            >
              <option value="CORRECT">之前说错了，改正原理解</option>
              <option value="SUPERSEDE">现实有变化，从指定时间开始</option>
              <option value="ADD_EXCEPTION">原理解保留，补充这次例外</option>
            </select>
          </label>
        )}
        <details className="understanding-time" open={!!edit || undefined}>
          <summary>
            适用时间 <span>可选；当日例外需要结束时间</span>
          </summary>
          <div className="understanding-dates">
            <label className="field-label">
              开始时间
              <input
                aria-label="理解开始时间"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required={operation === 'SUPERSEDE' && !!edit}
              />
            </label>
            <label className="field-label">
              结束时间
              <input
                aria-label="理解结束时间"
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                min={from || undefined}
                required={operation === 'ADD_EXCEPTION' && !!edit}
              />
            </label>
          </div>
        </details>
        <div className="field-buttons">
          <button className="primary-button" disabled={!!pending || !text.trim()}>
            {pending === 'save' && <LoaderCircle size={14} className="spin" />}
            {edit ? '保存修改' : '记住这件事'}
          </button>
          {edit && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setEdit(undefined);
                setText('');
                setFrom('');
                setUntil('');
                setError('');
              }}
            >
              取消修改
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
          <button className="text-button" onClick={() => void api.runtimeOverview().then(setData)}>
            刷新记录
          </button>
        </p>
      )}
      {status && (
        <p role="status" className="harness-inline-status">
          {status}
        </p>
      )}
      {!!data?.processing.length && (
        <details className="processing-overview">
          <summary>
            还有原文待整理 <span>{data.processing.length} 条</span>
          </summary>
          <p className="harness-muted">按段保留处理状态。重试只使用有权保留和整理的原文。</p>
          {data.processing.map((p) => (
            <div className="processing-row" key={p.eventId}>
              <div>
                <span>{p.fileName || date(p.receivedAt)}</span>
                <small>
                  {p.pending ? `${p.pending} 段待处理` : '有内容待确认'}
                  {p.failed ? ` · ${p.failed} 段需重试或补充` : ''}
                </small>
              </div>
              <button
                className="text-button"
                disabled={!!pending || busy || state.settings.mode !== 'deepseek'}
                onClick={() =>
                  void act('retry', async () => {
                    setData(await api.retryProcessing(p.eventId));
                    setStatus('本次整理已检查；尚不明确的内容仍保留待确认。');
                  })
                }
              >
                <RotateCcw size={13} />
                重试整理
              </button>
            </div>
          ))}
          {state.settings.mode !== 'deepseek' && (
            <p className="harness-muted">连接 DeepSeek 后可整理，本地示例不会猜测个人事实。</p>
          )}
        </details>
      )}
    </section>
  );
}
export function FeedbackControl({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [response, setResponse] = useState<'accepted' | 'declined'>('declined'),
    [status, setStatus] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <div className="feedback-control">
      <button className="text-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        反馈这条回复
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              await api.feedback({
                recommendationId: messageId,
                response,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              });
              setStatus('记下了，谢谢你告诉我。');
              setOpen(false);
            } catch (error) {
              setStatus(failureText(error));
            } finally {
              setPending(false);
            }
          }}
        >
          <label className="field-label">
            这次是否合适
            <select value={response} onChange={(e) => setResponse(e.target.value as typeof response)}>
              <option value="declined">不太适合我</option>
              <option value="accepted">对我有帮助</option>
            </select>
          </label>
          <label className="field-label">
            原因 <small>可选</small>
            <input
              aria-label="建议反馈原因"
              value={reason}
              maxLength={1200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：今天更想留点空白"
            />
          </label>
          <button className="subtle-button" disabled={pending}>
            告诉在场
          </button>
        </form>
      )}
      {status && (
        <span className="harness-muted" role="status">
          {status}
        </span>
      )}
    </div>
  );
}
export function WorkAndReceipts({
  onResume,
  onChanged,
  onAttention,
  currentActionIds,
  preparations,
  onState,
  onContinue,
  timeZone,
}: {
  onResume: (sessionId: string) => void;
  onChanged: () => void;
  onAttention?: (count: number) => void;
  currentActionIds?: string[];
  preparations: import('../shared/presentation').PreparationView[];
  onState: (state: State) => void;
  onContinue: (text: string) => void;
  timeZone: string;
}) {
  const [data, setData] = useState<RuntimeOverview>(),
    [error, setError] = useState(''),
    [pending, setPending] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  useEffect(() => {
    if (data)
      onAttention?.(
        data.actions.filter((a) =>
          [
            'outcome_unknown',
            'unresolved',
            'cancel_requested',
            'cannot_cancel',
            'cancellation_unknown',
            'failed_confirmed',
          ].includes(a.action.status),
        ).length,
      );
  }, [data, onAttention]);
  useEffect(() => {
    api
      .runtimeOverview()
      .then(setData)
      .catch((e) => setError(failureText(e)));
  }, []);
  async function action(id: string, fn: () => Promise<RuntimeOverview>) {
    setPending(id);
    setError('');
    try {
      setData(await fn());
      onChanged();
    } catch (e) {
      setError(failureText(e));
    } finally {
      setPending('');
    }
  }
  const goals = data?.work.filter((w) => w.kind === 'goal') || [],
    episodes =
      data?.work.filter(
        (w) =>
          w.kind === 'episode' &&
          (w.data.sessionId || w.data.lastSessionId) &&
          (w.data.nextSmallQuestion || w.data.type === 'collaboration_frame'),
      ) || [],
    unknown =
      data?.actions.filter((a) =>
        [
          'outcome_unknown',
          'unresolved',
          'cancel_requested',
          'cannot_cancel',
          'cancellation_unknown',
        ].includes(a.action.status),
      ) || [],
    localSaved =
      data?.actions.filter(
        ({ action: a, receipts }) =>
          (!currentActionIds || currentActionIds.includes(a.id)) &&
          a.executionTier === 'direct_local' &&
          a.status === 'succeeded' &&
          receipts.at(-1)?.status === 'confirmed_success' &&
          receipts.at(-1)?.localStatus === 'local_saved',
      ) || [],
    failed = data?.actions.filter(({ action: a }) => a.status === 'failed_confirmed') || [];
  const adoptedPreparations = data?.work.filter((w) => w.kind === 'task' && w.data.adoptionItemId) || [];
  return (
    <div className="work-receipts">
      <EntrustedPanel onResume={onResume} onChanged={onChanged} preparations={preparations} onState={onState} onContinue={onContinue} timeZone={timeZone} />
      {!!goals.length && (
        <section className="entrusted-goals">
          <h3>一起慢慢往前</h3>
          {goals.map((g) => (
            <div className={`work-row entrusted-goal entrusted-goal-${g.status}`} key={g.id}>
              <div className="work-row-heading">
                <strong>{g.title}</strong>
                <span>
                  {(
                    {
                      proposed: '你愿意的话',
                      active: '继续陪你往前',
                      paused: '先歇一歇',
                      cancelled: '不再跟进',
                    } as Record<string, string>
                  )[g.status] || '需要再看一看'}
                </span>
              </div>
              {typeof g.data.reason === 'string' && <p>{g.data.reason}</p>}
              {g.status !== 'cancelled' && (
                <div className="field-buttons">
                  <button
                    className="subtle-button"
                    disabled={!!pending}
                    onClick={() =>
                      void action(g.id, () =>
                        api.goal({
                          id: g.id,
                          expectedRevision: g.revision,
                          status: g.status === 'active' ? 'paused' : 'active',
                        }),
                      )
                    }
                  >
                    {g.status === 'active'
                      ? '先歇一歇'
                      : g.status === 'proposed'
                        ? '一起做这件事'
                        : '继续这件事'}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!pending}
                    onClick={() =>
                      void action(g.id, () =>
                        api.goal({
                          id: g.id,
                          expectedRevision: g.revision,
                          status: 'cancelled',
                        }),
                      )
                    }
                  >
                    不再跟进
                  </button>
                </div>
              )}
              {g.status === 'paused' && (
                <small>你想继续时，再一起看看现在的安排。以前的提醒不会自行开启。</small>
              )}
              {!!g.evidenceIds.length && (
                <details className="entrusted-source">
                  <summary>这件事，从哪里说起</summary>
                  {g.evidenceIds.map((id) => (
                    <EvidencePreview key={id} eventId={id} />
                  ))}
                </details>
              )}
            </div>
          ))}
        </section>
      )}
      {!!episodes.length && (
        <section>
          <h3>可以接着聊</h3>
          {episodes.map((e) => {
            const sessionIds = Array.isArray(e.data.sessionIds)
              ? e.data.sessionIds.filter((value): value is string => typeof value === 'string')
              : [];
            const resumeSession =
              (typeof e.data.lastSessionId === 'string' && e.data.lastSessionId) ||
              sessionIds.at(-1) ||
              String(e.data.sessionId);
            return (
              <button key={e.id} className="resume-work" onClick={() => onResume(resumeSession)}>
                <span>
                  <strong>{e.title}</strong>
                  <small>
                    {String(
                      e.data.nextSmallQuestion || e.data.nextStep || e.data.question || '回到上次的对话',
                    )}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </section>
      )}
      {!!unknown.length && (
        <section className="work-needs-care">
          <h3>有几件事，想再看清楚</h3>
          {unknown.map(({ action: a, receipts }) => (
            <div className="work-row" key={a.id}>
              <strong>{String(a.arguments.title || '这次托付')}</strong>
              <p>
                {a.status === 'cannot_cancel'
                  ? '对方的服务无法撤回这次操作，之前发生的变化可能还在。请到原来的应用看看。'
                  : a.status === 'unresolved'
                    ? '在场还没能确定这次有没有完成。请先到原来的应用看看，再决定是否重试，以免重复。'
                    : ['cancel_requested', 'cancellation_unknown'].includes(a.status)
                      ? '还没能确定这次是否撤回。先看看原来的结果，再决定下一步，以免重复。'
                      : '还没能确定这次有没有完成。先看看结果，再决定是否重试，以免重复。'}
              </p>
              {['outcome_unknown', 'cancel_requested'].includes(a.status) ? (
                <button
                  className="subtle-button"
                  disabled={!!pending}
                  onClick={() => void action(a.id, () => api.reconcileAction(a.id))}
                >
                  {pending === a.id ? '正在看看结果…' : '看看结果'}
                </button>
              ) : (
                <span className="receipt-manual-check">需要你到原来的应用里看一看</span>
              )}
              <small>
                {receipts.at(-1)?.observedAt
                  ? `上次查看：${date(receipts.at(-1)?.observedAt)}`
                  : '还没有收到确切的结果'}
                {a.simulated ? ' · 这条来自练习环境' : ''}
              </small>
            </div>
          ))}
        </section>
      )}
      {!!failed.length && (
        <section className="work-needs-care">
          <h3>这几件事还没能办好</h3>
          {failed.map(({ action: a, receipts }) => (
            <div className="work-row action-receipt-row" key={a.id}>
              <div className="work-row-heading">
                <strong>{String(a.arguments.title || '这次托付')}</strong>
                <span>还没有完成</span>
              </div>
              <p>
                这次没能完成，你交代的事还没有办成。
                {receipts.at(-1)?.reason ? ` ${operationReason(receipts.at(-1)!.reason!)}` : ''}
              </p>
              <small>{a.simulated ? '这条来自练习环境。' : '回到当时的对话，我们可以再试一次。'}</small>
            </div>
          ))}
        </section>
      )}
      {!!data?.worlds.length && (
        <section className="world-review">
          <h3>把设想变成准备</h3>
          <p className="harness-muted">挑出你愿意尝试的部分，先放进准备里。还不会替你做决定或对外行动。</p>
          {data.worlds.map((w) => (
            <details key={w.worldId}>
              <summary>
                {w.status === 'stale' ? '情况有了变化，先重新看看这份设想' : '从这份设想里，挑几件小事'}
              </summary>
              {w.items.map((item) => (
                <label className="world-item" key={item.id}>
                  <input
                    type="checkbox"
                    aria-label="选择这项设想作为准备事项"
                    checked={selectedItems.includes(item.id)}
                    disabled={w.status === 'stale' || !!pending}
                    onChange={(e) =>
                      setSelectedItems((ids) =>
                        e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span>
                    <strong>
                      {typeof item.proposed === 'string' ? item.proposed : JSON.stringify(item.proposed)}
                    </strong>
                    <small>选中后，放进准备里</small>
                  </span>
                </label>
              ))}
              <button
                className="subtle-button"
                disabled={
                  w.status === 'stale' || !!pending || !w.items.some((i) => selectedItems.includes(i.id))
                }
                onClick={() =>
                  void action(w.worldId, async () => {
                    const result = await api.adoptWorld({
                      id: w.worldId,
                      itemIds: w.items.filter((i) => selectedItems.includes(i.id)).map((i) => i.id),
                      expectedBaseRevision: w.baseRevision,
                      expectedPrivacyEpoch: data.privacyEpoch,
                    });
                    setSelectedItems([]);
                    return result;
                  })
                }
              >
                先为这些做准备
              </button>
            </details>
          ))}
        </section>
      )}
      {!!adoptedPreparations.length && (
        <section>
          <h3>先准备着</h3>
          {adoptedPreparations.map((w) => (
            <div className="work-row" key={w.id}>
              <strong>{w.title}</strong>
              <small>从你的设想中留下，还没有开始行动</small>
            </div>
          ))}
        </section>
      )}
      {!!localSaved.length && (
        <details className="work-history">
          <summary>
            最近记下的安排 <span>{localSaved.length} 件</span>
          </summary>
          {localSaved.map(({ action: a, receipts }) => {
            const item = localActionItem(a);
            const observedAt = receipts.at(-1)?.observedAt;
            return (
              <div className="work-row action-receipt-row" key={a.id}>
                <div className="work-row-heading">
                  <strong>{String(a.arguments.title || '本机安排')}</strong>
                  <span>留在这台设备上</span>
                </div>
                <p>
                  {observedAt ? `${date(observedAt)}记下。` : '这件安排已经记下。'}
                  还没有替你在其他应用里添加或发送。
                </p>
                <div className="field-buttons">
                  <button
                    className="text-button"
                    disabled={!!pending}
                    onClick={() =>
                      void action(a.id, async () => {
                        await api.action({ action: 'delete', item });
                        return api.runtimeOverview();
                      })
                    }
                  >
                    {pending === a.id ? '正在移出安排…' : '从安排中移除'}
                  </button>
                </div>
                {a.simulated && <small>这条来自练习环境。</small>}
              </div>
            );
          })}
        </details>
      )}
      <details className="delivery-details">
        <summary>提醒怎样来到你身边 · 资料怎样留下</summary>
        <p>
          在场打开时才会检查提醒。
          {data?.notifications.submitted
            ? '这台设备可以发出系统通知，但在场无法知道你是否看到了。'
            : '这台设备暂时不能发出系统通知。'}
        </p>
        <p>聊天数据库暂未整体加密；密钥由操作系统保护。导出文件也需由你妥善保管。</p>
      </details>
      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
        </p>
      )}
    </div>
  );
}

function localActionItem(action: EffectAction): Action {
  const args = action.arguments;
  return {
    id: action.id,
    title: typeof args.title === 'string' && args.title.trim() ? args.title : '本机安排',
    detail: typeof args.detail === 'string' ? args.detail : '',
    startsAt: typeof args.startsAt === 'string' ? args.startsAt : undefined,
    durationMinutes: typeof args.durationMinutes === 'number' ? args.durationMinutes : undefined,
    saved: true,
    revision: action.revision,
    approvalDigest: action.digest,
    coverage: 'verified',
  };
}

export function SourcePermissions({ onState }: { onState: (s: State) => void }) {
  const [revoked, setRevoked] = useState<string[]>(),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    api
      .runtimeOverview()
      .then((v) => setRevoked(v.revoked))
      .catch((e) => setError(failureText(e)));
  }, []);
  async function change(enabled: boolean) {
    setPending(true);
    setError('');
    try {
      const next = await api.permission({ scope: 'campus:read', enabled });
      setRevoked(next.revoked);
      onState(await api.state());
    } catch (e) {
      setError(failureText(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="source-permissions">
      <Switch
        checked={revoked ? !revoked.includes('campus:read') : false}
        onChange={(v) => void change(v)}
        label="需要时，帮我看看校园资料"
        detail="关闭后，会立即停下这次查阅。校园账号的登录信息会加密留在这台设备上，不会交给回答模型。"
        disabled={pending || !revoked}
      />
      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
        </p>
      )}
    </section>
  );
}

/** User-facing memory view. Internal lifecycle/verification labels stay behind
 * the source disclosure; the first scan answers only what can change a reply. */
export function MemoryPanel({
  state,
  onState,
  busy,
}: {
  state: State;
  onState: (s: State) => void;
  busy: boolean;
}) {
  const editForm = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<RuntimeOverview>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<MemoryView>();
  const [operation, setOperation] = useState<'CORRECT' | 'SUPERSEDE' | 'ADD_EXCEPTION'>('CORRECT');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');

  useEffect(() => {
    let mounted = true;
    api
      .runtimeOverview()
      .then((value) => {
        if (mounted) setData(value);
      })
      .catch((value) => {
        if (mounted) setError(failureText(value));
      });
    return () => {
      mounted = false;
    };
  }, [state]);

  async function act(name: string, fn: () => Promise<void>) {
    if (pending) return;
    setPending(name);
    setError('');
    setNotice('');
    try {
      await fn();
      setData(await api.runtimeOverview());
    } catch (value) {
      setError(failureText(value));
    } finally {
      setPending('');
    }
  }

  function editMemory(memory: MemoryView) {
    setEdit(memory);
    setText(memory.text);
    setOperation('CORRECT');
    setFrom(localTime(memory.validFrom));
    setUntil(localTime(memory.validTo));
    setEditorOpen(true);
    setError('');
    requestAnimationFrame(() => editForm.current?.querySelector('textarea')?.focus());
  }

  function clearEditor() {
    setEdit(undefined);
    setText('');
    setFrom('');
    setUntil('');
    setEditorOpen(false);
  }

  const memories = data?.memories || [];
  const current = memories.filter((memory) => memory.status === 'active');
  const needsDecision = memories.filter((memory) => ['candidate', 'disputed'].includes(memory.status));
  const archived = memories.filter((memory) => !['active', 'candidate', 'disputed'].includes(memory.status));

  function renderMemory(memory: MemoryView, group: 'current' | 'decision' | 'archived') {
    const temporal = [
      memory.validFrom ? `从 ${date(memory.validFrom)}` : '',
      memory.validTo ? `到 ${date(memory.validTo)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const condition = (() => {
      try {
        const parsed = JSON.parse(memory.conditions) as Condition;
        return parsed.op === 'all' && !parsed.terms.length ? '' : describeCondition(parsed);
      } catch {
        return '';
      }
    })();
    return (
      <article className={`memory-item memory-item-${group}`} key={memory.id}>
        <div className="memory-item-main">
          {group === 'decision' && <div className="memory-item-kicker">需要你决定</div>}
          <p className="memory-item-text">{memory.text}</p>
          {(condition || temporal) && (
            <p className="memory-item-context">
              {condition || '在指定时间内适用'}
              {temporal ? ` · ${temporal}` : ''}
            </p>
          )}
          <div className="memory-item-actions">
            <button
              className="memory-source"
              onClick={() => setSource(source === memory.id ? '' : memory.id)}
            >
              为什么这样理解
              <ChevronRight size={12} />
            </button>
            {group === 'decision' && (
              <button
                className="text-button"
                disabled={!!pending}
                onClick={() =>
                  void act('keep', async () => {
                    onState(
                      await api.memory({
                        action: 'save',
                        id: memory.id,
                        expectedRevision: memory.revision,
                        text: memory.text,
                        operation: 'CORRECT',
                        conditions: JSON.parse(memory.conditions),
                        validFrom: memory.validFrom,
                        validTo: memory.validTo,
                      }),
                    );
                    setNotice('已保留；之后只在相关问题中参考。');
                  })
                }
              >
                保留并使用
              </button>
            )}
            {group !== 'archived' && (
              <button className="text-button" onClick={() => editMemory(memory)}>
                <Pencil size={13} />
                改正
              </button>
            )}
            {group === 'current' && (
              <button
                className="text-button"
                disabled={!!pending}
                onClick={() =>
                  void act('deactivate', async () => {
                    onState(await api.memory({ action: 'deactivate', id: memory.id }));
                    setNotice('已停用；原话仍可在已停用内容中查看。');
                  })
                }
              >
                暂时停用
              </button>
            )}
            {group === 'decision' && (
              <button
                className="text-button"
                disabled={!!pending}
                onClick={() =>
                  void act('deactivate', async () => {
                    onState(await api.memory({ action: 'deactivate', id: memory.id }));
                    setNotice('已先停用，不会作为确定理解使用。');
                  })
                }
              >
                先不使用
              </button>
            )}
            <IconButton
              label={`删除：${memory.text}`}
              disabled={!!pending}
              onClick={() =>
                void act('delete', async () => {
                  onState(await api.memory({ action: 'delete', id: memory.id }));
                  setNotice('已删除这条理解及相关的本机派生内容。');
                })
              }
            >
              <X size={14} />
            </IconButton>
          </div>
          {source === memory.id && (
            <div className="memory-source-reveal">
              {memory.evidenceIds.length ? (
                memory.evidenceIds.map((id) => <EvidencePreview key={id} eventId={id} />)
              ) : (
                <p className="memory-quote">暂时没有可定位的原话；这条内容不会被当作已核实依据。</p>
              )}
              <p className="memory-source-meta">
                {memory.verification === 'verified' ? '来源已核验' : '来源仍待核对'} · 记录于{' '}
                {date(memory.createdAt)}
              </p>
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="memory-panel-v2">
      <p className="panel-intro">这里只放会影响之后对话的内容。你可以随时改变它。</p>
      <Switch
        checked={state.settings.memoryEnabled}
        label="让在场参考这些理解"
        detail="关闭后，不再读取或保存长期理解"
        disabled={!!pending || (busy && !state.settings.memoryEnabled)}
        onChange={(value) =>
          void act('toggle', async () => {
            onState(await api.saveSettings({ memoryEnabled: value }));
          })
        }
      />

      {current.length > 0 && (
        <section className="memory-group memory-group-current">
          <div className="memory-group-heading">
            <h3>现在会影响回答</h3>
            <small>{current.length} 条</small>
          </div>
          <div className="memory-list">{current.map((memory) => renderMemory(memory, 'current'))}</div>
        </section>
      )}

      {needsDecision.length > 0 && (
        <section className="memory-group memory-group-decision">
          <div className="memory-group-heading">
            <h3>需要你决定</h3>
            <small>暂不作为确定理解</small>
          </div>
          <div className="memory-list">{needsDecision.map((memory) => renderMemory(memory, 'decision'))}</div>
        </section>
      )}

      {archived.length > 0 && (
        <details className="memory-group memory-group-archived">
          <summary className="memory-group-heading">
            <h3>已停用的内容</h3>
            <small>{archived.length} 条</small>
          </summary>
          <div className="memory-list">{archived.map((memory) => renderMemory(memory, 'archived'))}</div>
        </details>
      )}

      {!memories.length && (
        <p className="memory-empty">还没有需要管理的理解。可以先聊起来，需要时再逐渐了解。</p>
      )}

      <details
        className="memory-editor"
        open={editorOpen}
        onClick={(event) => {
          if ((event.target as HTMLElement).tagName === 'SUMMARY') {
            event.preventDefault();
            setEditorOpen((open) => !open);
          }
        }}
      >
        <summary>
          <span>{edit ? '修改理解' : '添加一条理解'}</span>
          <small>{edit ? '保存后从下一轮开始生效' : '只保存你明确说出的内容'}</small>
        </summary>
        <form
          ref={editForm}
          onSubmit={(event) => {
            event.preventDefault();
            void act('save', async () => {
              onState(
                await api.memory({
                  action: 'save',
                  id: edit?.id,
                  expectedRevision: edit?.revision,
                  text: text.trim(),
                  operation: edit ? operation : undefined,
                  conditions: edit ? JSON.parse(edit.conditions) : undefined,
                  validFrom: fromTimeInput(from),
                  validTo: fromTimeInput(until),
                }),
              );
              clearEditor();
              setNotice('已保存；下一轮会按更新后的理解处理。');
            });
          }}
        >
          <label className="field-label">
            {edit ? '改成什么' : '告诉在场一件小事'}
            <textarea
              aria-label="偏好内容"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="例如：我通常喜欢连续学习，但今天只想休息"
            />
          </label>
          {edit && (
            <label className="field-label">
              变化方式
              <select
                aria-label="理解修改方式"
                value={operation}
                onChange={(event) => setOperation(event.target.value as typeof operation)}
              >
                <option value="CORRECT">之前说错了，改正原理解</option>
                <option value="SUPERSEDE">现实有变化，从指定时间开始</option>
                <option value="ADD_EXCEPTION">原理解保留，补充这次例外</option>
              </select>
            </label>
          )}
          <details className="understanding-time" open={!!edit || undefined}>
            <summary>
              适用时间 <span>可选</span>
            </summary>
            <div className="understanding-dates">
              <label className="field-label">
                开始时间
                <input
                  aria-label="理解开始时间"
                  type="datetime-local"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  required={operation === 'SUPERSEDE' && !!edit}
                />
              </label>
              <label className="field-label">
                结束时间
                <input
                  aria-label="理解结束时间"
                  type="datetime-local"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                  min={from || undefined}
                  required={operation === 'ADD_EXCEPTION' && !!edit}
                />
              </label>
            </div>
          </details>
          <div className="field-buttons">
            <button className="primary-button" disabled={!!pending || !text.trim()}>
              {pending === 'save' && <LoaderCircle size={14} className="spin" />}
              {edit ? '保存修改' : '记住这件事'}
            </button>
            {edit && (
              <button className="text-button" type="button" onClick={clearEditor}>
                取消
              </button>
            )}
          </div>
        </form>
      </details>

      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
          <button className="text-button" onClick={() => void api.runtimeOverview().then(setData)}>
            刷新
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="harness-inline-status">
          {notice}
        </p>
      )}
      {!!data?.processing.length && (
        <details className="processing-overview">
          <summary>
            还有内容待整理 <span>{data.processing.length} 条</span>
          </summary>
          <p className="harness-muted">处理状态只在需要时显示；未整理的原文不会被默认为长期理解。</p>
          {data.processing.map((item) => (
            <div className="processing-row" key={item.eventId}>
              <div>
                <span>{item.fileName || date(item.receivedAt)}</span>
                <small>{item.pending ? `${item.pending} 段待处理` : '有内容待确认'}</small>
              </div>
              <button
                className="text-button"
                disabled={!!pending || busy || state.settings.mode !== 'deepseek'}
                onClick={() =>
                  void act('retry', async () => {
                    setData(await api.retryProcessing(item.eventId));
                    setNotice('已重新检查；仍不明确的内容会保留待确认。');
                  })
                }
              >
                <RotateCcw size={13} />
                重试
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

/** A deliberately quiet memory surface: one question per view, one expanded
 * item at a time. Lifecycle terminology belongs in the detail action, not in
 * the first scan. */
export interface MemoryWorkspaceState {
  editorOpen: boolean;
  text: string;
  edit?: MemoryView;
  previous?: string;
  operation: 'CORRECT' | 'SUPERSEDE' | 'ADD_EXCEPTION';
  from: string;
  until: string;
  error: string;
  notice: string;
  pending: string;
}

export const emptyMemoryWorkspace = (): MemoryWorkspaceState => ({
  editorOpen: false,
  text: '',
  operation: 'CORRECT',
  from: '',
  until: '',
  error: '',
  notice: '',
  pending: '',
});

export function MemoryPanelSimple({
  state,
  onState,
  busy,
  workspace,
  onWorkspace,
}: {
  state: State;
  onState: (s: State) => void;
  busy: boolean;
  workspace: MemoryWorkspaceState;
  onWorkspace: Dispatch<SetStateAction<MemoryWorkspaceState>>;
}) {
  const editForm = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<RuntimeOverview>();
  const [expandedId, setExpandedId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const { error, notice, pending, editorOpen, text, edit, previous, operation, from, until } = workspace;
  const change = <K extends keyof MemoryWorkspaceState>(key: K, value: MemoryWorkspaceState[K]) =>
    onWorkspace((current) => ({ ...current, [key]: value }));
  const setError = (value: string) => change('error', value);
  const setNotice = (value: string) => change('notice', value);
  const setPending = (value: string) => change('pending', value);

  useEffect(() => {
    let mounted = true;
    api
      .runtimeOverview()
      .then((value) => mounted && setData(value))
      .catch((value) => mounted && setError(failureText(value)));
    return () => {
      mounted = false;
    };
  }, [state]);

  async function act(name: string, fn: () => Promise<void>) {
    if (pending) return;
    setPending(name);
    setError('');
    setNotice('');
    try {
      await fn();
      setData(await api.runtimeOverview());
    } catch (value) {
      setError(failureText(value));
    } finally {
      setPending('');
    }
  }

  function openEditor(memory?: MemoryView, sayAgain = false) {
    onWorkspace((current) => ({
      ...current,
      edit: sayAgain ? undefined : memory,
      previous: sayAgain ? memory?.text : undefined,
      text: sayAgain ? '' : memory?.text || '',
      operation: 'CORRECT',
      from: sayAgain ? '' : localTime(memory?.validFrom),
      until: sayAgain ? '' : localTime(memory?.validTo),
      editorOpen: true,
      error: '',
      notice: '',
    }));
    setExpandedId('');
    requestAnimationFrame(() => editForm.current?.querySelector('textarea')?.focus());
  }
  function closeEditor() {
    onWorkspace((current) => ({
      ...current,
      edit: undefined,
      previous: undefined,
      text: '',
      from: '',
      until: '',
      editorOpen: false,
    }));
  }

  const memories = data?.memories || [];
  const current = memories.filter((memory) => memory.status === 'active');
  const decision = memories.filter((memory) => ['candidate', 'disputed'].includes(memory.status));
  const archived = memories.filter((memory) => !['active', 'candidate', 'disputed'].includes(memory.status));

  function contextLine(memory: MemoryView) {
    let condition = '';
    try {
      const parsed = JSON.parse(memory.conditions) as Condition;
      condition = parsed.op === 'all' && !parsed.terms.length ? '' : describeCondition(parsed);
    } catch {
      /* keep the first scan quiet when old data has no condition */
    }
    const times = [
      memory.validFrom ? `从 ${date(memory.validFrom)}` : '',
      memory.validTo ? `到 ${date(memory.validTo)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return [condition, times].filter(Boolean).join(' · ');
  }

  function row(memory: MemoryView, kind: 'current' | 'decision' | 'archived') {
    const expanded = expandedId === memory.id;
    const sourceOpen = sourceId === memory.id;
    const line = contextLine(memory);
    return (
      <article className={`memory-row memory-row-${kind}`} key={memory.id}>
        <button
          type="button"
          className="memory-row-summary"
          aria-expanded={expanded}
          onClick={() => {
            setExpandedId(expanded ? '' : memory.id);
            setSourceId('');
          }}
        >
          <span className="memory-row-copy">
            <strong>{memory.text}</strong>
            {kind === 'archived' && <small>{memory.status === 'expired' ? '这段时间已经过去了' : '先放在一旁，不用来回答'}</small>}
            {kind === 'current' && memory.validTo && <small>到 {date(memory.validTo)} 为止</small>}
          </span>
          <ChevronRight size={15} className={expanded ? 'rotated' : ''} />
        </button>
        {expanded && (
          <div className="memory-row-detail">
            {line && <p className="memory-row-context">{line}</p>}
            <button
              className="memory-detail-source"
              type="button"
              onClick={() => setSourceId(sourceOpen ? '' : memory.id)}
            >
              {sourceOpen ? '收起来源' : '查看来源'}
              <ChevronRight size={13} className={sourceOpen ? 'rotated' : ''} />
            </button>
            {sourceOpen && (
              <div className="memory-source-reveal">
                {memory.evidenceIds.length ? (
                  memory.evidenceIds.map((id) => <EvidencePreview key={id} eventId={id} />)
                ) : (
                  <p className="memory-quote">还找不到当时的原话，所以不会把它当作确定的依据。</p>
                )}
                <p className="memory-source-meta">
                  {memory.verification === 'verified' ? '能找到当时的依据' : '还需要回看原话'} · 留下于{' '}
                  {date(memory.createdAt)}
                </p>
              </div>
            )}
            <div className="memory-detail-actions">
              {kind === 'archived' && (
                <button className="memory-detail-action" disabled={!!pending} onClick={() => openEditor(memory, true)}>
                  <Pencil size={13} />重新说一遍
                </button>
              )}
              {kind === 'decision' && (
                <button
                  className="memory-detail-action primary"
                  disabled={!!pending}
                  onClick={() =>
                    void act('keep', async () => {
                      onState(
                        await api.memory({
                          action: 'save',
                          id: memory.id,
                          expectedRevision: memory.revision,
                          text: memory.text,
                          operation: 'CORRECT',
                          conditions: JSON.parse(memory.conditions),
                          validFrom: memory.validFrom,
                          validTo: memory.validTo,
                        }),
                      );
                      setNotice('记住了，聊到相关的事时再参考。');
                      setExpandedId('');
                    })
                  }
                >
                  就这样记住
                </button>
              )}
              {kind !== 'archived' && (
                <button
                  className="memory-detail-action"
                  onClick={() => openEditor(memory)}
                  disabled={!!pending}
                >
                  <Pencil size={13} />
                  换个说法
                </button>
              )}
              {kind === 'current' && (
                <button
                  className="memory-detail-action"
                  disabled={!!pending}
                  onClick={() =>
                    void act('deactivate', async () => {
                      onState(
                        await api.memory({
                          action: 'deactivate',
                          id: memory.id,
                        }),
                      );
                      setNotice('先放在一旁，之后回答时不会再参考它。');
                      setExpandedId('');
                    })
                  }
                >
                  先别参考这条
                </button>
              )}
              {kind === 'decision' && (
                <button
                  className="memory-detail-action"
                  disabled={!!pending}
                  onClick={() =>
                    void act('deactivate', async () => {
                      onState(
                        await api.memory({
                          action: 'deactivate',
                          id: memory.id,
                        }),
                      );
                      setNotice('先放在一旁，不会把它当作确定的理解。');
                      setExpandedId('');
                    })
                  }
                >
                  先不使用
                </button>
              )}
              <button
                className="memory-detail-action danger"
                disabled={!!pending}
                onClick={() =>
                  void act('delete', async () => {
                    onState(await api.memory({ action: 'delete', id: memory.id }));
                    setNotice('这条理解和由它整理出的本机内容，已经一起删掉了。');
                    setExpandedId('');
                  })
                }
              >
                删除
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="memory-panel-simple">
      <p className="panel-intro">只保留会帮到你的几件事。需要时可以改，也可以删掉。</p>
      <Switch
        checked={state.settings.memoryEnabled}
        label="让在场慢慢了解我"
        detail="开启时，只在相关的话题里参考；关闭后不再参考，也不再记住聊天里提到的事"
        disabled={!!pending || (busy && !state.settings.memoryEnabled)}
        onChange={(value) =>
          void act('toggle', async () => {
            onState(await api.saveSettings({ memoryEnabled: value }));
          })
        }
      />
      <div className={`memory-layout ${editorOpen ? 'is-editing' : ''}`}>
      <div className="memory-records">
      {!!current.length && (
        <section className="memory-group-simple">
          <div className="memory-group-heading">
            <h3>关于你，记住的几件事</h3>
            <small>{current.length} 条</small>
          </div>
          {current.map((memory) => row(memory, 'current'))}
        </section>
      )}
      {!!(decision.length || archived.length || data?.processing.length) && (
        <details className="memory-more-simple">
          <summary>
            <span>其他内容</span>
            <small>{decision.length + archived.length + (data?.processing.length || 0)} 条</small>
          </summary>
          <div className="memory-more-content">
            {!!decision.length && (
              <section className="memory-subgroup memory-review-simple">
                <h3>这样理解你，对吗</h3>
                <p className="memory-subgroup-intro">你点头之后，才会在之后的回答里参考。</p>
                <div>{decision.map((memory) => row(memory, 'decision'))}</div>
              </section>
            )}
            {!!archived.length && (
              <section className="memory-subgroup memory-archive-simple">
                <h3>先放在一旁的</h3>
                <div>{archived.map((memory) => row(memory, 'archived'))}</div>
              </section>
            )}
            {!!data?.processing.length && (
              <section className="memory-subgroup processing-overview">
                <h3>还没整理完</h3>
                <p className="harness-muted">不明确的原话不会自动变成长期理解。</p>
                {data.processing.map((item) => (
                  <div className="processing-row" key={item.eventId}>
                    <div>
                      <span>{item.fileName || date(item.receivedAt)}</span>
                      <small>
                        {item.pending ? `还有 ${item.pending} 段没整理清楚` : '有些原话还需要再看一看'}
                      </small>
                    </div>
                    <button
                      className="text-button"
                      disabled={!!pending || busy || state.settings.mode !== 'deepseek'}
                      onClick={() =>
                        void act('retry', async () => {
                          setData(await api.retryProcessing(item.eventId));
                          setNotice('没读清楚的地方，会继续留在这里，等你来决定。');
                        })
                      }
                    >
                      <RotateCcw size={13} />
                      再读一遍
                    </button>
                  </div>
                ))}
              </section>
            )}
          </div>
        </details>
      )}
      {!memories.length && <p className="memory-empty">我们可以从一句话开始，慢慢了解彼此。</p>}
      </div>
      <div className={`memory-editor-simple ${editorOpen ? 'open' : ''}`}>
        {!editorOpen ? (
          <button
            type="button"
            className="memory-add-trigger"
            onClick={() => openEditor()}
            disabled={!!pending}
          >
            <span>告诉在场一件事</span>
            <small>只保存你明确说出的内容</small>
            <ChevronRight size={15} />
          </button>
        ) : (
          <form
            ref={editForm}
            onSubmit={(event) => {
              event.preventDefault();
              void act('save', async () => {
                onState(
                  await api.memory({
                    action: 'save',
                    id: edit?.id,
                    expectedRevision: edit?.revision,
                    text: text.trim(),
                    operation: edit ? operation : undefined,
                    conditions: edit ? JSON.parse(edit.conditions) : undefined,
                    validFrom: fromTimeInput(from),
                    validTo: fromTimeInput(until),
                  }),
                );
                closeEditor();
                setNotice('这条理解已经留下。需要时，你仍可以改。');
              });
            }}
          >
            <div className="memory-editor-heading">
              <strong>{edit ? '让这份理解，更贴近你。' : '想让我记住什么'}</strong>
              <button type="button" className="text-button" onClick={closeEditor} disabled={!!pending}>
                取消
              </button>
            </div>
            {previous && <div className="memory-previous"><small>以前，你说过</small><p>{previous}</p><span>如果现在仍然重要，可以用今天的话重新告诉我。</span></div>}
            <label className="field-label">
              {edit ? '你现在想说的是' : '告诉在场一件小事'}
              <textarea
                aria-label="偏好内容"
                value={text}
                onChange={(event) => change('text', event.target.value)}
                disabled={!!pending}
                maxLength={4000}
                rows={3}
                placeholder="例如：我通常喜欢连续学习，但今天只想休息"
              />
            </label>
            {edit && (
              <fieldset className="memory-change-options" disabled={!!pending}>
                <legend>这次，是什么样的变化？</legend>
                {([
                  ['CORRECT', '之前理解错了', '用这句话改正之前的理解。'],
                  ['SUPERSEDE', '从现在起，有些不同', '保留过去，从你选的时间开始改变。'],
                  ['ADD_EXCEPTION', '只是这一次', '平时的偏好保留，这次例外有自己的期限。'],
                ] as const).map(([value, label, detail]) => (
                  <label key={value} className={operation === value ? 'selected' : ''}>
                    <input type="radio" name="memory-change" value={value} checked={operation === value}
                      onChange={() => change('operation', value)} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </fieldset>
            )}
            <details className="understanding-time" open={!!edit || undefined}>
              <summary>
                {edit && operation === 'ADD_EXCEPTION' ? '这次例外，到什么时候' : edit && operation === 'SUPERSEDE' ? '从什么时候开始' : '适用时间'}
                {(!edit || operation === 'CORRECT') && <span>可选</span>}
              </summary>
              <div className="understanding-dates">
                <label className="field-label">
                  开始时间
                  <input
                    aria-label="理解开始时间"
                    type="datetime-local"
                    value={from}
                    onChange={(event) => change('from', event.target.value)}
                    disabled={!!pending}
                    required={operation === 'SUPERSEDE' && !!edit}
                  />
                </label>
                <label className="field-label">
                  结束时间
                  <input
                    aria-label="理解结束时间"
                    type="datetime-local"
                    value={until}
                    onChange={(event) => change('until', event.target.value)}
                    disabled={!!pending}
                    min={from || undefined}
                    required={operation === 'ADD_EXCEPTION' && !!edit}
                  />
                </label>
              </div>
            </details>
            <button className="primary-button" disabled={!!pending || !text.trim()}>
              {pending === 'save' && <LoaderCircle size={14} className="spin" />}
              {edit ? operation === 'ADD_EXCEPTION' ? '记住这次例外' : '按新的理解来' : '记住这件事'}
            </button>
          </form>
        )}
      </div>
      </div>
      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
          <button className="text-button" onClick={() => void api.runtimeOverview().then(setData)}>
            刷新
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="harness-inline-status">
          {notice}
        </p>
      )}
    </section>
  );
}
