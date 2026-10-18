import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Monitor,
  RotateCcw,
  X,
} from 'lucide-react';
import type { Action, State } from '../shared/types';
import type {
  MatterSelectionInput,
  PreparationView,
  SharedMatterView,
  SurfaceView,
} from '../shared/presentation';
import { Modal, uiError } from './ui';
import { RichText } from './RichText';
import { DEFAULT_TIME_ZONE, formatDateTime, fromTimeInput, timeZoneLabel, toTimeInput } from './time';

const api = window.zaichang;
const errorText = uiError;

export function AgendaEditor({
  original,
  current,
  timeZone = DEFAULT_TIME_ZONE,
  onState,
  onClose,
}: {
  original: Action;
  current?: Action;
  timeZone?: string;
  onState: (state: State) => void;
  onClose: () => void;
}) {
  const zone = original.timeZone || timeZone;
  const [title, setTitle] = useState(original.title),
    [detail, setDetail] = useState(original.detail),
    [time, setTime] = useState(toTimeInput(original.startsAt, zone)),
    [duration, setDuration] = useState(original.durationMinutes ? String(original.durationMinutes) : ''),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [base, setBase] = useState(original);
  async function save(retry = false) {
    setPending(true);
    setError('');
    try {
      const version = retry ? current : base;
      if (!version) throw new Error('这条安排已经移除。你的修改仍保留，可以复制后另作处理。');
      onState(
        await api.action({
          action: 'save',
          item: {
            ...version,
            title,
            detail,
            startsAt: fromTimeInput(time, zone, original.startsAt),
            timeZone: zone,
            durationMinutes: duration ? Number(duration) : undefined,
          },
        }),
      );
      onClose();
    } catch (error) {
      setError(errorText(error));
      onState(await api.state());
    } finally {
      setPending(false);
    }
  }
  const changed = !!current && (current.revision || 1) !== (base.revision || 1);
  return (
    <Modal
      title="修改这条安排"
      onClose={() => {
        if (!pending) onClose();
      }}
      className="agenda-editor"
    >
      <form
        className="panel-body"
        onSubmit={(event) => {
          event.preventDefault();
          void save(changed);
        }}
      >
        <label className="field-label">
          事项标题
          <input
            autoFocus
            aria-label="安排标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label className="field-label">
          开始时间（{timeZoneLabel(zone)}）
          <input
            type="datetime-local"
            step="1"
            aria-label="安排开始时间"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <label className="field-label">
          时长（分钟）
          <input
            type="number"
            aria-label="安排时长"
            min="1"
            max="10080"
            placeholder="尚未确定，留空即可"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
        <label className="field-label">
          补充说明
          <textarea
            aria-label="安排说明"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={3}
          />
        </label>
        {(error || changed) && (
          <div className="inline-problem" role="alert">
            <p>{error || '这条安排已在别处修改，你正在编辑的文字仍保留。'}</p>
            {current && (
              <p>
                现在保存的是：{current.title} ·{' '}
                {current.startsAt
                  ? formatDateTime(current.startsAt, current.timeZone || timeZone)
                  : '时间未定'}
              </p>
            )}
          </div>
        )}
        <div className="field-buttons">
          <button className="primary-button" disabled={pending || !title.trim() || !current}>
            {pending ? '正在保存…' : changed ? '核对后，保存我的修改' : '保存安排修改'}
          </button>
          <button type="button" className="text-button" onClick={onClose} disabled={pending}>
            取消
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PreparationShelf({
  items,
  inline = false,
  timeZone = DEFAULT_TIME_ZONE,
  onState,
  onContinue,
}: {
  items: PreparationView[];
  inline?: boolean;
  timeZone?: string;
  onState: (state: State) => void;
  onContinue: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(inline),
    [visibleCount, setVisibleCount] = useState(5),
    [opened, setOpened] = useState<string | undefined>(inline ? items[0]?.id : undefined),
    [pending, setPending] = useState(''),
    [error, setError] = useState('');
  const shown = useRef(new Set<string>()),
    content = useRef<HTMLDivElement>(null);
  const current = items.find((item) => item.id === opened);
  useEffect(() => {
    if (!expanded || !current || !content.current) return;
    const key = `${current.id}:${current.revision}`;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || shown.current.has(key)) return;
        shown.current.add(key);
        void api
          .helpAction({ id: current.id, expectedRevision: current.revision, operation: 'displayed' })
          .then(onState)
          .catch((error) => setError(errorText(error)));
      },
      { threshold: 0 },
    );
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [current?.id, current?.revision, expanded]);
  if (!items.length) return null;
  async function act(item: PreparationView, operation: 'opened' | 'dismiss' | 'once' | 'stop_topic') {
    setPending(operation);
    setError('');
    try {
      onState(await api.helpAction({ id: item.id, expectedRevision: item.revision, operation }));
      if (operation === 'dismiss' || operation === 'stop_topic') setOpened(undefined);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setPending('');
    }
  }
  return (
    <section className={`preparation-shelf ${expanded ? 'is-open' : ''}`} aria-label="可用帮助">
      <button className="shelf-trigger" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <BookOpen size={15} />
        <span>可用的资料</span>
        <ChevronDown size={14} />
      </button>
      {expanded && (
        <div className="shelf-list">
          {items.slice(0, visibleCount).map((item) => (
            <div className="preparation-row" key={item.id}>
              <button
                className="preparation-title"
                aria-expanded={item.id === opened}
                onClick={() => {
                  const next = item.id !== opened;
                  setOpened(next ? item.id : undefined);
                  if (next) void act(item, 'opened');
                }}
              >
                <span>{item.title}</span>
                <ChevronRight size={15} />
              </button>
              {item.id === opened && (
                <div className="preparation-body" ref={content}>
                  <div className="markdown">
                    <RichText text={item.body} />
                  </div>
                  <details className="material-detail">
                    <summary>适用范围与来源</summary>
                    <p>
                      这是一份准备材料，没有新增日程。有效至{' '}
                      {new Date(item.expiresAt).toLocaleString('zh-CN', {
                        timeZone,
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      ；条件变化时会重新核对。
                    </p>
                    {item.sources?.map((source, i) => (
                      <p key={i}>
                        {source.label}
                        {source.at ? ` · ${formatDateTime(source.at, timeZone)}` : ''}
                      </p>
                    ))}
                  </details>
                  <div className="preparation-actions">
                    <button
                      className="text-button"
                      onClick={() => onContinue(`接着这份「${item.title}」资料，我想说：`)}
                    >
                      接着讨论
                      <ArrowUpRight size={13} />
                    </button>
                    <button
                      className="text-button"
                      disabled={!!pending}
                      onClick={() => void act(item, 'dismiss')}
                    >
                      这份先收起
                    </button>
                    <details className="quiet-menu">
                      <summary>跟进方式</summary>
                      <button disabled={!!pending} onClick={() => void act(item, 'once')}>
                        这件事只提醒一次
                      </button>
                      <button disabled={!!pending} onClick={() => void act(item, 'stop_topic')}>
                        不再主动关注这件事
                      </button>
                    </details>
                  </div>
                </div>
              )}
            </div>
          ))}
          {items.length > visibleCount && (
            <button className="text-button" onClick={() => setVisibleCount((count) => count + 5)}>
              更多资料
            </button>
          )}
          {error && (
            <p className="inline-problem" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export interface MatterInteraction {
  choice?: string;
  baseRevision?: number;
  undo?: MatterSelectionInput;
  notice?: string;
  pending?: boolean;
  error?: string;
}
export type MatterInteractionUpdate = MatterInteraction | ((current: MatterInteraction) => MatterInteraction);

export function MatterCard({
  matter,
  onState,
  onPresent,
  onMap,
  interaction,
  onInteraction,
}: {
  matter: SharedMatterView;
  onState: (state: State) => void;
  onPresent: () => void;
  onMap?: (id: string) => void;
  interaction?: MatterInteraction;
  onInteraction: (value: MatterInteractionUpdate) => void;
}) {
  const choice = interaction?.choice ?? matter.selectedOptionId ?? '';
  const { undo, notice, pending, error } = interaction || {};
  const changedElsewhere = interaction?.choice !== undefined && interaction.baseRevision !== matter.revision;
  const selection = matter.options.find((option) => option.id === matter.selectedOptionId);
  async function change(input: MatterSelectionInput) {
    if (pending) return;
    onInteraction((current) => ({ ...current, pending: true, error: '' }));
    try {
      const result = await api.changeMatterSelection(input);
      onState(result.state);
      onInteraction({
        pending: true,
        undo: result.undo,
        notice: input.optionId ? '选择已更新，没有新增日程。' : '已撤销这次选择，其他内容保留。',
      });
    } catch (error) {
      onInteraction((current) => ({ ...current, error: errorText(error) }));
      onState(await api.state());
    } finally {
      onInteraction((current) => ({ ...current, pending: false }));
    }
  }
  return (
    <section className="matter-card" aria-label={`正在商量：${matter.title}`}>
      <div className="matter-heading">
        <span>正在商量</span>
        <strong>{matter.title}</strong>
      </div>
      {matter.needsReview && (
        <p className="matter-review-note">这件事刚有改动，旧建议需要重新核对。你仍可直接修改当前选择。</p>
      )}
      <div className="matter-choice">
        <label>
          当前选择
          <select
            aria-label={`${matter.title}的选择`}
            value={choice}
            disabled={pending}
            onChange={(event) =>
              onInteraction({
                ...interaction,
                choice: event.target.value,
                baseRevision: matter.revision,
                error: '',
              })
            }
          >
            <option value="">还没决定</option>
            {matter.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.placeLabel || option.title}
              </option>
            ))}
          </select>
        </label>
        {choice !== (matter.selectedOptionId || '') && (
          <button
            className="primary-button"
            disabled={pending}
            onClick={() =>
              void change({ id: matter.id, expectedRevision: matter.revision, optionId: choice || null })
            }
          >
            {pending ? '正在保存…' : changedElsewhere ? '核对后，保存选择' : '保存选择'}
          </button>
        )}
      </div>
      {changedElsewhere && !error && (
        <p className="inline-problem">这件事有了新的修改。你尚未保存的选择仍保留，请核对后再保存。</p>
      )}
      {error ? (
        <p className="inline-problem" role="alert">
          {error.replace('这份安排', '当前选择')} 你的选择仍在上面；核对后可再次保存。
        </p>
      ) : (
        notice && (
          <div className="inline-receipt" role="status">
            <Check size={13} />
            <span>{notice}</span>
            {undo && (
              <button onClick={() => void change(undo)} disabled={pending}>
                <RotateCcw size={12} />
                撤销
              </button>
            )}
          </div>
        )
      )}
      <div className="matter-actions">
        {selection?.placeId && onMap && (
          <button className="text-button" onClick={() => onMap(selection.placeId!)}>
            在地图中查看
            <ArrowUpRight size={13} />
          </button>
        )}
        <button className="text-button" disabled={pending} onClick={onPresent}>
          <Monitor size={14} />
          展示这份选择
        </button>
      </div>
    </section>
  );
}

export function DisplayReview({
  surface,
  onStart,
  onClose,
}: {
  surface: SurfaceView;
  onStart: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="只展示下面这份内容" onClose={onClose} className="display-review">
      <div className="panel-body">
        <p className="panel-intro">开始后，私人对话和其他页面会退出当前画面。你随时可以结束展示。</p>
        <div className="display-review-content markdown">
          {surface.artifacts.map((item) => (
            <RichText key={item.id} text={item.body} publicSurface />
          ))}
        </div>
        {surface.notice && <p role="alert">{surface.notice}</p>}
        {error && (
          <p className="inline-problem" role="alert">
            {error}
          </p>
        )}
        <div className="field-buttons">
          <button
            className="primary-button"
            disabled={pending || !surface.artifacts.length}
            onClick={() => {
              setPending(true);
              void onStart()
                .catch((error) => setError(errorText(error)))
                .finally(() => setPending(false));
            }}
          >
            {pending ? '正在切换…' : '开始展示'}
          </button>
          <button className="text-button" onClick={onClose}>
            返回私聊
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function PublicDisplay({
  surface,
  onEnd,
  notice,
}: {
  surface: SurfaceView;
  onEnd: () => Promise<void>;
  notice?: string;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="public-display">
      <header>
        <span>
          <Monitor size={16} />
          正在展示
        </span>
        <button
          className="subtle-button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void onEnd()
              .catch((error) => setError(errorText(error)))
              .finally(() => setPending(false));
          }}
        >
          <X size={16} />
          结束展示
        </button>
      </header>
      <main tabIndex={-1}>
        {notice && <p role="status">{notice}</p>}
        <div className="public-paper markdown">
          {surface.artifacts.map((item) => (
            <RichText key={item.id} text={item.body} publicSurface />
          ))}
          {!surface.artifacts.length && (
            <p>{surface.notice || '还没有选择展示内容。请结束展示后选择一份内容。'}</p>
          )}
        </div>
        {!!surface.artifacts.length && (
          <button
            className="text-button"
            onClick={() =>
              void api
                .copyText(surface.artifacts.map((item) => item.body).join('\n\n'))
                .catch((error) => setError(errorText(error)))
            }
          >
            <Copy size={14} />
            复制展示内容
          </button>
        )}
        {error && (
          <p className="inline-problem" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
