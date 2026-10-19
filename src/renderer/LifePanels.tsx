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
import type { LetterFocusContext } from '../shared/reflective-letter';
import type {
  MatterSelectionInput,
  PreparationView,
  SharedMatterView,
  SurfaceView,
} from '../shared/presentation';
import { Modal, uiError } from './ui';
import { RichText } from './RichText';
import { LetterMessage } from './LetterMessage';
import {
  DEFAULT_TIME_ZONE,
  formatDateTime,
  fromTimeInput,
  timeZoneLabel,
  toTimeInput,
} from './time';

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
  const originalCivil = toTimeInput(original.startsAt, zone);
  const anchorDate = original.allDayDate || originalCivil.slice(0, 10);
  const [repeatScope, setRepeatScope] = useState<'once' | 'series'>(
    original.recurrence ? 'once' : 'series',
  );
  const [occurrenceDate, setOccurrenceDate] = useState(anchorDate);
  const firstException = original.exceptions?.find((item) => item.onDate === anchorDate);
  const [title, setTitle] = useState(original.title);
  const [detail, setDetail] = useState(firstException?.detail ?? original.detail);
  const [time, setTime] = useState(
    toTimeInput(firstException?.startsAt || original.startsAt, zone),
  );
  const [allDayDate, setAllDayDate] = useState(original.allDayDate || '');
  const [duration, setDuration] = useState(
    firstException?.durationMinutes === null
      ? ''
      : String(firstException?.durationMinutes ?? original.durationMinutes ?? ''),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [base] = useState(original);
  const once = !!original.recurrence && repeatScope === 'once';
  const previousException = original.exceptions?.find((item) => item.onDate === occurrenceDate);
  const cancelledOccurrence = once && !!previousException?.cancelled;
  const changed = !!current && (current.revision || 1) !== (base.revision || 1);

  const editDrafts = useRef<Record<string, { time: string; detail: string; duration: string }>>({});
  function rememberDraft() {
    editDrafts.current[once ? `once:${occurrenceDate}` : 'series'] = { time, detail, duration };
  }
  function restoreDraft(key: string, date?: string) {
    const exception = date ? original.exceptions?.find((item) => item.onDate === date) : undefined;
    const saved = editDrafts.current[key];
    setTime(
      saved?.time ??
        (exception?.startsAt
          ? toTimeInput(exception.startsAt, zone)
          : date && original.startsAt
            ? `${date}T${originalCivil.slice(11)}`
            : originalCivil),
    );
    setDetail(saved?.detail ?? exception?.detail ?? original.detail);
    setDuration(
      saved?.duration ??
        (exception?.durationMinutes === null
          ? ''
          : String(exception?.durationMinutes ?? original.durationMinutes ?? '')),
    );
  }
  function chooseOccurrence(date: string) {
    rememberDraft();
    setOccurrenceDate(date);
    restoreDraft(`once:${date}`, date);
    setError('');
  }
  function chooseScope(value: 'once' | 'series') {
    rememberDraft();
    setRepeatScope(value);
    restoreDraft(
      value === 'once' ? `once:${occurrenceDate}` : 'series',
      value === 'once' ? occurrenceDate : undefined,
    );
    setError('');
  }
  function timeDescription(civil: string, minutes?: number, date?: string) {
    if (date) return `${date.replaceAll('-', '.')} · 全天`;
    if (!civil) return '还没选时间';
    let end = '';
    try {
      const instant = fromTimeInput(civil, zone, original.startsAt);
      if (instant && minutes)
        end = ` — ${toTimeInput(new Date(Date.parse(instant) + minutes * 60000).toISOString(), zone).slice(11, 16)}`;
    } catch {
      /* An incomplete or ambiguous draft is explained by the existing save validation. */
    }
    return `${civil.slice(5, 10).replace('-', '月')}日 ${civil.slice(11, 16)}${end}`;
  }
  const beforeCivil =
    once && original.startsAt
      ? previousException?.startsAt
        ? toTimeInput(previousException.startsAt, zone)
        : `${occurrenceDate}T${originalCivil.slice(11)}`
      : originalCivil;
  const beforeDuration =
    once && previousException?.durationMinutes === null
      ? undefined
      : once
        ? (previousException?.durationMinutes ?? original.durationMinutes)
        : original.durationMinutes;
  async function save(retry = false) {
    setPending(true);
    setError('');
    try {
      const version = retry ? current : base;
      if (!version) throw new Error('这条安排已经移除。你写的内容还在这里。');
      if (cancelledOccurrence) throw new Error('这一次已经取消。想重新安排时，可以回到对话里说。');
      const startsAt = original.allDayDate
        ? undefined
        : fromTimeInput(time, zone, previousException?.startsAt || original.startsAt);
      let item: Action;
      if (once) {
        const exception = {
          ...(version.exceptions || []).find((entry) => entry.onDate === occurrenceDate),
          onDate: occurrenceDate,
          ...(startsAt ? { startsAt } : {}),
          ...(!original.allDayDate ? { durationMinutes: duration ? Number(duration) : null } : {}),
          detail,
        };
        item = {
          ...version,
          exceptions: [
            ...(version.exceptions || []).filter((entry) => entry.onDate !== occurrenceDate),
            exception,
          ],
        };
      } else {
        item = {
          ...version,
          title: title.trim(),
          detail,
          startsAt,
          timeZone: zone,
          ...(original.allDayDate ? { allDayDate } : {}),
          durationMinutes: duration ? Number(duration) : undefined,
        };
      }
      onState(await api.action({ action: 'save', item }));
      onClose();
    } catch (caught) {
      setError(errorText(caught));
      try {
        onState(await api.state());
      } catch {
        /* The edit remains available if refreshing is also unavailable. */
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title="把这件事，挪一挪。"
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
          这件事
          <input
            autoFocus
            aria-label="安排标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
            disabled={once}
          />
        </label>
        {!!original.recurrence && (
          <fieldset className="agenda-edit-repeat">
            <legend>想改哪一段？</legend>
            <label>
              <input
                type="radio"
                name="repeat-scope"
                checked={repeatScope === 'once'}
                onChange={() => chooseScope('once')}
              />
              只改这一次
            </label>
            <label>
              <input
                type="radio"
                name="repeat-scope"
                checked={repeatScope === 'series'}
                onChange={() => chooseScope('series')}
              />
              整个重复安排
            </label>
            {once ? (
              <label className="field-label">
                哪一次
                <input
                  type="date"
                  aria-label="选择重复安排的发生日期"
                  value={occurrenceDate}
                  onChange={(event) => chooseOccurrence(event.target.value)}
                  required
                />
              </label>
            ) : (
              <p>名称、起始时间和说明会用于整个系列，单独改过的那几次仍保留。</p>
            )}
          </fieldset>
        )}
        <div className="agenda-edit-comparison" aria-label="时间前后对照">
          <div>
            <small>原来</small>
            <strong>
              {timeDescription(
                beforeCivil,
                beforeDuration,
                original.allDayDate ? (once ? occurrenceDate : original.allDayDate) : undefined,
              )}
            </strong>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <small>现在</small>
            <strong>
              {timeDescription(
                time,
                duration ? Number(duration) : undefined,
                original.allDayDate ? (once ? occurrenceDate : allDayDate) : undefined,
              )}
            </strong>
          </div>
        </div>
        {original.allDayDate ? (
          once ? (
            <p className="agenda-all-day">这是一件全天的安排，可以单独改这次的说明。</p>
          ) : (
            <label className="field-label">
              日期
              <input
                type="date"
                aria-label="安排日期"
                value={allDayDate}
                onChange={(event) => setAllDayDate(event.target.value)}
                required
              />
            </label>
          )
        ) : (
          <div className="agenda-edit-time-fields">
            <label className="field-label">
              什么时候 · {timeZoneLabel(zone)}
              <input
                type="datetime-local"
                step="1"
                aria-label="安排开始时间"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required={!!original.startsAt}
              />
            </label>
            <label className="field-label">
              留多久 · 分钟
              <input
                type="number"
                aria-label="安排时长"
                min="1"
                max="1440"
                placeholder="不定"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                required={!once && !!original.durationMinutes}
              />
            </label>
          </div>
        )}
        <label className="field-label">
          想补充的话
          <textarea
            aria-label="安排说明"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={3}
            maxLength={1500}
          />
        </label>
        {(error || changed || cancelledOccurrence) && (
          <div className="inline-problem" role="alert">
            <p>
              {error ||
                (cancelledOccurrence
                  ? '这一次已经取消。想重新安排时，可以回到对话里说。'
                  : '这件事刚在别处改过。下面保留着你的想法。')}
            </p>
            {changed && current && (
              <p>
                现在的安排：{current.title} ·{' '}
                {current.allDayDate
                  ? `${current.allDayDate} · 全天`
                  : current.startsAt
                    ? formatDateTime(current.startsAt, current.timeZone || timeZone)
                    : '还没定时间'}
              </p>
            )}
          </div>
        )}
        <div className="field-buttons">
          <button
            className="primary-button"
            disabled={pending || !title.trim() || !current || cancelledOccurrence}
          >
            {pending ? '我记一下…' : changed ? '看过了，按这里改' : '就这样安排'}
          </button>
          <button type="button" className="text-button" onClick={onClose} disabled={pending}>
            先不改
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
  onContinue: (text: string, context?: LetterFocusContext) => void;
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
          .helpAction({
            id: current.id,
            expectedRevision: current.revision,
            operation: 'displayed',
          })
          .then(onState)
          .catch((error) => setError(errorText(error)));
      },
      { threshold: 0 },
    );
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [current?.id, current?.revision, expanded]);
  if (!items.length) return null;
  async function act(
    item: PreparationView,
    operation: 'opened' | 'dismiss' | 'once' | 'stop_topic',
  ) {
    setPending(operation);
    setError('');
    try {
      onState(
        await api.helpAction({
          id: item.id,
          expectedRevision: item.revision,
          operation,
        }),
      );
      if (operation === 'dismiss' || operation === 'stop_topic') setOpened(undefined);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setPending('');
    }
  }
  return (
    <section
      className={`preparation-shelf ${expanded ? 'is-open' : ''} ${inline ? 'is-inline' : ''} ${items.some(item => item.reflectiveLetter) ? 'has-letter' : ''}`}
      aria-label="为你准备的资料"
    >
      <button
        className="shelf-trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <BookOpen size={15} />
        <span>为你准备的</span>
        <ChevronDown size={14} />
      </button>
      {expanded && (
        <div className="shelf-list">
          {items.slice(0, visibleCount).map((item) => (
            <div className={`preparation-row ${item.reflectiveLetter ? 'is-letter' : ''}`} key={item.id}>
              {!(inline && item.reflectiveLetter && item.id === opened) && (
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
              )}
              {item.id === opened && (
                <div className="preparation-body" ref={content}>
                  {item.reflectiveLetter ? (
                    <LetterMessage letter={item.reflectiveLetter} pending={!!pending} onContinue={onContinue}
                      onDismiss={() => act(item, 'dismiss')} onOpenSource={() => void act(item, 'opened')} />
                  ) : (
                    <>
                  <div className="markdown">
                    <RichText text={item.body} />
                  </div>
                  <details className="material-detail">
                    <summary>这份准备，适合什么时候用</summary>
                    <p>
                      先放在这里供你参考，还没有加进安排。可以参考到{' '}
                      {new Date(item.expiresAt).toLocaleString('zh-CN', {
                        timeZone,
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      。如果情况变了，会重新看看是否还适合。
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
                      接着聊这件事
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
                      <summary>以后怎样陪你留意</summary>
                      <button disabled={!!pending} onClick={() => void act(item, 'once')}>
                        这件事只提醒一次
                      </button>
                      <button disabled={!!pending} onClick={() => void act(item, 'stop_topic')}>
                        不再主动提起这件事
                      </button>
                    </details>
                  </div>
                    </>
                  )}
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
export type MatterInteractionUpdate =
  MatterInteraction | ((current: MatterInteraction) => MatterInteraction);

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
  const changedElsewhere =
    interaction?.choice !== undefined && interaction.baseRevision !== matter.revision;
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
        notice: input.optionId
          ? '就先这样选。还没有加进安排。'
          : '这次先不选，其他内容还在。',
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
        <p className="matter-review-note">
          这件事有了新变化，原来的建议可能不再合适。你可以在下面重新选。
        </p>
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
              void change({
                id: matter.id,
                expectedRevision: matter.revision,
                optionId: choice || null,
              })
            }
          >
            {pending ? '正在记下选择…' : changedElsewhere ? '看过变化，就这样选' : '就这样选'}
          </button>
        )}
      </div>
      {changedElsewhere && !error && (
        <p className="inline-problem">
          这件事刚刚有了新的修改。你刚选的仍在这里，看一看变化后，再决定要不要留下。
        </p>
      )}
      {error ? (
        <p className="inline-problem" role="alert">
          {error.replace('这份安排', '当前选择')} 你刚选的仍在上面，想好后可以再试一次。
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
        <p className="panel-intro">
          开始后，私人对话和其他页面会退出当前画面。你随时可以结束展示。
        </p>
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
