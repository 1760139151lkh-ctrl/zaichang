import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown, Coffee, Footprints, GripHorizontal, Leaf } from 'lucide-react';
import type { PlanningComparisonView } from '../../shared/planning-conversation';
import type { PlanningBlock, PlanningScene, SemanticSelection } from '../../shared/scenes';
import './planning-comparison-timeline.css';
import { SpringLayoutButton } from '../motion/SpringLayoutButton';

type Branch = PlanningComparisonView['branches'][number];
export interface PlanningTrialMove {
  selection: SemanticSelection;
  toStart: string;
}
export interface PlanningComparisonTimelineProps {
  comparison: PlanningComparisonView;
  scenes: PlanningScene[];
  activeBranchId?: string;
  viewedDay?: string;
  onViewDay?: (day: string) => void;
  selection?: SemanticSelection | null;
  onSelect: (selection: SemanticSelection) => void;
  onDiscussBranch?: (branch: Branch) => void;
  /** Stage a user-authored trial in the ordinary composer. Never dispatch. */
  onTryMove?: (request: PlanningTrialMove) => void;
  disabled?: boolean;
}
type DisplayBlock = { key: string; block: PlanningBlock; start: number; end: number };
type TrialGesture = { mode: 'pointer' | 'keyboard'; sceneId: string; sceneRevision: number; day: string; blockId: string; active: boolean;
  origin: number; start: number; duration: number; pointerOrigin?: number; pointerId?: number; pointerX?: number; pointerY?: number;
  lastPointerX?: number; scrollLeft?: number; canvasWidth?: number; millisecondsPerPixel?: number };
const icons = { busy: CalendarDays, work: BookOpen, setup: Coffee, cleanup: Check, transition: Footprints, protected: Leaf, free: Leaf };
const names: Record<PlanningBlock['kind'], string> = {
  busy: '原来的安排', work: '这版的安排', setup: '准备', cleanup: '收尾', transition: '转场与休息', protected: '特意留白', free: '留给自己',
};
function time(value: string | number, zone: string, withDate = false) {
  return new Date(value).toLocaleString('zh-CN', { timeZone: zone, ...(withDate ? { month: 'numeric', day: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit', hour12: false });
}
function dateKey(value: string, zone: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function dateName(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('zh-CN', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' });
}
function interval(block: PlanningBlock, zone: string) {
  const original = block.originalRange || block;
  const crossDay = !!original.end && dateKey(original.start, zone) !== dateKey(original.end, zone);
  return `${time(original.start, zone, !!block.originalRange || crossDay)}${original.end ? ` — ${time(original.end, zone, crossDay)}` : ' 起 · 结束待定'}`;
}
function minutes(value: number) {
  const rounded = Math.round(value);
  return rounded >= 60 ? `${Math.floor(rounded / 60)}小时${rounded % 60 ? `${rounded % 60}分` : ''}` : `${rounded}分钟`;
}
function identity(scene: PlanningScene, block: PlanningBlock, day: string) {
  // Cross-branch movement is possible only for a real host identity. Matching
  // labels or positions would merge independent events and invent continuity.
  return `${day}:${block.sourceObjectId ? `${block.kind}:${block.sourceObjectId}` : `${scene.id}:${block.id}`}`;
}
function displayBlocks(scene: PlanningScene, day: string, from: number, to: number): DisplayBlock[] {
  return scene.blocks.flatMap(block => {
    const start = Math.max(from, Date.parse(block.start)), end = Math.min(to, Date.parse(block.end || scene.window.to));
    return end > start ? [{ key: identity(scene, block, day), block, start, end }] : [];
  });
}

/** A single mounted time band, even while its source scene changes. Positions
 * animate from actual host intervals; day totals and free time remain the
 * planner's values. This component has no calendar or action endpoint. */
export function PlanningComparisonTimeline({ comparison, scenes, activeBranchId, viewedDay, onViewDay,
  selection, onSelect, onDiscussBranch, onTryMove, disabled = false }: PlanningComparisonTimelineProps) {
  const headingId = useId(), viewport = useRef<HTMLDivElement>(null);
  const viewedAxis = useRef<string | undefined>(undefined);
  const [localDay, setLocalDay] = useState<{ id: string; date: string }>();
  const [focusedKey, setFocusedKey] = useState<string>();
  const [trial, setTrial] = useState<TrialGesture>();
  const trialRef = useRef<TrialGesture | undefined>(undefined), skipClick = useRef(false);
  const captured = useRef<{ node: HTMLButtonElement; pointerId: number } | undefined>(undefined);
  const updateTrial = (value: TrialGesture | undefined) => { trialRef.current = value; setTrial(value); };
  const cancelTrial = () => {
    const pending = trialRef.current, capture = captured.current;
    captured.current = undefined;
    updateTrial(undefined);
    if (pending?.mode === 'pointer' && pending.active) {
      skipClick.current = true;
      window.setTimeout(() => { skipClick.current = false; }, 0);
    }
    if (capture?.node.hasPointerCapture(capture.pointerId)) capture.node.releasePointerCapture(capture.pointerId);
  };
  const choices = useMemo(() => comparison.branches.flatMap(branch => {
    const ref = branch.sceneRef; if (!ref) return [];
    const scene = scenes.find(value => value.id === ref.id && value.revision === ref.revision);
    return scene ? [{ branch, scene }] : [];
  }), [comparison, scenes]);
  const active = choices.find(value => value.branch.branchId === activeBranchId) || choices[0];
  const zone = comparison.window.timeZone;
  const days = active?.scene.daySummaries?.length ? active.scene.daySummaries.map(day => ({ date: day.date, from: day.from, to: day.to }))
    : [{ date: dateKey(comparison.window.from, zone), from: comparison.window.from, to: comparison.window.to }];
  const requestedDay = viewedDay || (localDay?.id === comparison.comparisonId ? localDay.date : undefined);
  const day = days.find(value => value.date === requestedDay) || days[0];
  const from = Date.parse(day.from), to = Date.parse(day.to), span = to - from;
  const all = useMemo(() => choices.map(choice => ({ ...choice, blocks: displayBlocks(choice.scene, day.date, from, to) })),
    [choices, day.date, from, to]);
  const current = all.find(value => value.branch.branchId === active?.branch.branchId);
  useLayoutEffect(() => {
    const pending = trialRef.current;
    const block = current?.blocks.find(value => value.block.id === pending?.blockId);
    if (pending && (pending.sceneId !== current?.scene.id || pending.sceneRevision !== current?.scene.revision
      || pending.day !== day.date || disabled || !onTryMove || !block || block.start !== pending.origin
      || block.end - block.start !== pending.duration)) cancelTrial();
  }, [current?.scene.id, current?.scene.revision, current?.blocks, day.date, disabled, onTryMove]);
  useEffect(() => {
    const cancel = () => cancelTrial();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !trialRef.current) return;
      event.preventDefault();
      cancelTrial();
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('keydown', escape);
      const capture = captured.current;
      captured.current = undefined;
      trialRef.current = undefined;
      if (capture?.node.hasPointerCapture(capture.pointerId)) capture.node.releasePointerCapture(capture.pointerId);
    };
  }, []);
  // Partition only visual overlaps. Use every branch to keep the row of an
  // existing object stable as another arrangement is previewed.
  const lanes = useMemo(() => {
    const edges = new Map<string, Set<string>>(), starts = new Map<string, number>();
    for (const choice of all) for (const value of choice.blocks) {
      if (!edges.has(value.key)) edges.set(value.key, new Set());
      starts.set(value.key, Math.min(starts.get(value.key) ?? Infinity, value.start));
      for (const other of choice.blocks) if (value.key !== other.key && value.start < other.end && other.start < value.end) {
        edges.get(value.key)!.add(other.key);
      }
    }
    const result = new Map<string, number>();
    for (const key of [...edges.keys()].sort((a, b) => starts.get(a)! - starts.get(b)! || a.localeCompare(b))) {
      const occupied = new Set([...edges.get(key)!].map(other => result.get(other)));
      let lane = 0; while (occupied.has(lane)) lane++;
      result.set(key, lane);
    }
    return result;
  }, [all]);
  useLayoutEffect(() => {
    const key = `${comparison.comparisonId}:${day.date}:${from}:${to}`, frame = viewport.current;
    if (!frame || !current || viewedAxis.current === key || !(span > 0)) return;
    viewedAxis.current = key;
    const changed = current.blocks.find(value => value.block.comparisonChange || all.some(choice =>
      choice.blocks.some(other => other.key === value.key && (other.start !== value.start || other.end !== value.end))))
      || current.blocks.find(value => value.block.kind === 'work' || value.block.kind === 'busy');
    if (!changed) { frame.scrollLeft = 0; return; }
    const before = changed.block.comparisonChange?.before;
    const start = Math.max(from, Math.min(changed.start, before ? Date.parse(before.start) : changed.start));
    const canvas = frame.firstElementChild as HTMLElement;
    frame.scrollLeft = Math.max(0, (start - from) / span * canvas.offsetWidth - 35);
  }, [comparison.comparisonId, day.date, from, to, span, current, all]);
  if (!active || !current || !(span > 0)) return null;
  const { scene, branch } = current, blocks = current.blocks;
  // Absolute positions follow this branch's real time. Keep the DOM sibling
  // order fixed across the union of all branches: moving a keyed existing node
  // in the DOM can restart its arrival animation, even with the same source ID.
  const siblingOrder = new Map([...lanes.keys()].map((key, index) => [key, index]));
  const renderedBlocks = [...blocks].sort((a, b) => siblingOrder.get(a.key)! - siblingOrder.get(b.key)!);
  const summary = scene.daySummaries?.find(value => value.date === day.date);
  const selectedId = selection?.kind === 'time_block' && selection.sceneId === scene.id && selection.sceneRevision === scene.revision ? selection.blockId : undefined;
  const counterpart = (value: DisplayBlock) => all.filter(choice => choice.branch.branchId !== branch.branchId)
    .flatMap(choice => choice.blocks.filter(other => other.key === value.key).map(other => ({ ...other, title: choice.branch.title })))
    .find(other => other.start !== value.start || other.end !== value.end);
  const isDifferent = (value: DisplayBlock) => !!value.block.comparisonChange || !!counterpart(value)
    || !!value.block.sourceObjectId && ['work', 'setup', 'cleanup', 'transition'].includes(value.block.kind)
      && !all.every(choice => choice.blocks.some(otherBlock => otherBlock.key === value.key))
    || value.block.kind === 'protected' && !all.every(choice => choice.blocks.some(otherBlock => otherBlock.block.kind === 'protected'
      && otherBlock.start === value.start && otherBlock.end === value.end && otherBlock.block.reason === value.block.reason));
  const detail = blocks.find(value => value.block.id === selectedId) || blocks.find(value => value.key === focusedKey)
    || blocks.find(value => ['work', 'busy'].includes(value.block.kind) && isDifferent(value)) || blocks.find(isDifferent);
  const other = detail ? counterpart(detail) : undefined;
  const before = detail?.block.comparisonChange?.before;
  const moved = !!detail && (before ? Date.parse(before.start) !== Date.parse(detail.block.originalRange?.start || detail.block.start) : !!other && other.start !== detail.start);
  const movementStart = before ? Date.parse(before.start) : other?.start ?? detail?.start ?? from;
  const movementLeft = (Math.max(from, Math.min(to, movementStart, detail?.start ?? from)) - from) * 100 / span;
  const movementRight = (Math.min(to, Math.max(from, movementStart, detail?.start ?? from)) - from) * 100 / span;
  const movementWidth = movementRight - movementLeft;
  const laneCount = Math.max(1, ...[...lanes.values()].map(value => value + 1));
  const hasMovement = all.some(choice => choice.blocks.some(value => {
    const original = value.block.comparisonChange?.before;
    return original && Date.parse(original.start) !== Date.parse(value.block.originalRange?.start || value.block.start)
      || all.some(otherChoice => otherChoice.blocks.some(otherBlock => otherBlock.key === value.key && otherBlock.start !== value.start));
  }));
  const canvasWidth = Math.max(780, span / 3_600_000 * 112);
  const pos = (value: number) => (value - from) * 100 / span;
  // Ticks measure elapsed time, including real 23/25-hour days. Local labels
  // come from the scene's declared timezone, never the browser timezone.
  const tickStep = span > 12 * 3_600_000 ? 2 * 3_600_000 : 3_600_000;
  const ticks = [from];
  for (let tick = Math.ceil(from / tickStep) * tickStep; tick < to; tick += tickStep) if (tick > from + tickStep * .2) ticks.push(tick);
  if (to - ticks.at(-1)! < tickStep * .3 && ticks.length > 1) ticks.pop();
  ticks.push(to);
  const declared = scene.scheduleCoverage?.mode === 'provided_windows';
  const eligible = declared ? summary?.eligibleWindows || scene.scheduleCoverage?.windows || [] : undefined;
  const outside: { start: number; end: number }[] = [];
  if (eligible) {
    let cursor = from;
    for (const range of eligible) {
      const start = Math.max(from, Date.parse(range.start)), end = Math.min(to, Date.parse(range.end));
      if (end <= from || start >= to || end <= start) continue;
      if (start > cursor) outside.push({ start: cursor, end: start });
      cursor = Math.max(cursor, end);
    }
    if (cursor < to) outside.push({ start: cursor, end: to });
  }
  const focus = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const chronology = new Map(blocks.map((value, index) => [value.block.id, index]));
    const items = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[data-timeline-block]')]
      .sort((a, b) => chronology.get(a.dataset.timelineBlock!)! - chronology.get(b.dataset.timelineBlock!)!);
    const index = items.indexOf(event.currentTarget), next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    event.preventDefault(); items[next]?.focus({ preventScroll: true });
  };
  const reveal = (element: HTMLElement) => {
    const frame = viewport.current; if (!frame) return;
    const item = element.getBoundingClientRect(), bounds = frame.getBoundingClientRect();
    if (item.left < bounds.left + 20) frame.scrollLeft -= bounds.left + 20 - item.left;
    else if (item.right > bounds.right - 20) frame.scrollLeft += item.right - bounds.right + 20;
  };
  const conditions = [...new Set(scene.conditions)];
  const canTry = (value: DisplayBlock) => !!onTryMove && !disabled
    && (value.block.kind === 'work' && !!value.block.taskId || value.block.kind === 'busy' && ['moved', 'added'].includes(value.block.comparisonChange?.kind || ''))
    && !!value.block.end && !value.block.originalRange && Date.parse(value.block.start) >= from && Date.parse(value.block.end) <= to;
  const boundTrial = (value: number, length: number) => Math.max(from, Math.min(to - length, value));
  const trialStart = (value: number, length: number) => boundTrial(Math.round(value / 300_000) * 300_000, length);
  const pointerTrialStart = (pending: TrialGesture, clientX: number) => {
    const frame = viewport.current, canvas = frame?.firstElementChild as HTMLElement | null;
    if (!frame || !canvas || canvas.offsetWidth !== pending.canvasWidth) return undefined;
    const delta = clientX - pending.pointerX! + frame.scrollLeft - pending.scrollLeft!;
    return trialStart((pending.pointerOrigin ?? pending.origin) + delta * pending.millisecondsPerPixel!, pending.duration);
  };
  const commitTrial = (value: DisplayBlock) => {
    const pending = trialRef.current; updateTrial(undefined);
    if (!pending?.active || pending.sceneId !== scene.id || pending.sceneRevision !== scene.revision
      || pending.day !== day.date || pending.blockId !== value.block.id || pending.origin !== value.start
      || pending.duration !== value.end - value.start || !canTry(value) || pending.start === pending.origin) return;
    if (pending.mode === 'pointer') {
      skipClick.current = true;
      window.setTimeout(() => { skipClick.current = false; }, 0);
    }
    onTryMove?.({ selection: { kind: 'time_block', sceneId: scene.id, sceneRevision: scene.revision, blockId: value.block.id },
      toStart: new Date(pending.start).toISOString() });
  };
  const pointerDown = (event: PointerEvent<HTMLButtonElement>, value: DisplayBlock) => {
    if (!canTry(value) || event.button !== 0 || !event.isPrimary) return;
    const canvas = viewport.current?.firstElementChild as HTMLElement | null;
    if (!canvas?.offsetWidth) return;
    cancelTrial();
    const pointerOrigin = from + (event.currentTarget.getBoundingClientRect().left - canvas.getBoundingClientRect().left) / canvas.offsetWidth * span;
    updateTrial({ mode: 'pointer', sceneId: scene.id, sceneRevision: scene.revision, day: day.date, blockId: value.block.id, active: false,
      origin: value.start, pointerOrigin, start: value.start, duration: value.end - value.start, pointerId: event.pointerId,
      pointerX: event.clientX, pointerY: event.clientY, lastPointerX: event.clientX,
      scrollLeft: viewport.current!.scrollLeft, canvasWidth: canvas.offsetWidth, millisecondsPerPixel: span / canvas.offsetWidth });
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>, value: DisplayBlock) => {
    const pending = trialRef.current;
    if (!pending || pending.mode !== 'pointer' || pending.pointerId !== event.pointerId || pending.sceneId !== scene.id || pending.blockId !== value.block.id) return;
    if (pending.sceneRevision !== scene.revision || pending.day !== day.date || pending.origin !== value.start
      || pending.duration !== value.end - value.start || !canTry(value)) { cancelTrial(); return; }
    const delta = event.clientX - pending.pointerX!, vertical = event.clientY - pending.pointerY!;
    if (!pending.active && Math.abs(vertical) > 8 && Math.abs(vertical) > Math.abs(delta)) { cancelTrial(); return; }
    if (!pending.active && Math.abs(delta) < 7) return;
    event.preventDefault();
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      captured.current = { node: event.currentTarget, pointerId: event.pointerId };
    }
    const start = pointerTrialStart(pending, event.clientX);
    if (start === undefined) { cancelTrial(); return; }
    updateTrial({ ...pending, active: true, lastPointerX: event.clientX, start });
  };
  const blockKey = (event: KeyboardEvent<HTMLButtonElement>, value: DisplayBlock) => {
    const pending = trialRef.current;
    if (canTry(value) && event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const previous = pending?.mode === 'keyboard' && pending.sceneId === scene.id && pending.sceneRevision === scene.revision && pending.blockId === value.block.id ? pending.start : value.start;
      updateTrial({ mode: 'keyboard', sceneId: scene.id, sceneRevision: scene.revision, day: day.date, blockId: value.block.id, active: true, origin: value.start,
        start: boundTrial(previous + (event.key === 'ArrowRight' ? 1 : -1) * 300_000, value.end - value.start), duration: value.end - value.start });
      return;
    }
    if (pending?.active && pending.sceneId === scene.id && pending.blockId === value.block.id) {
      if (event.key === 'Escape') { event.preventDefault(); cancelTrial(); return; }
      if (pending.mode === 'keyboard' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); commitTrial(value); return; }
    }
    focus(event);
  };
  const ghost = trial?.active && trial.sceneId === scene.id ? blocks.find(value => value.block.id === trial.blockId) : undefined;
  return <section className="planning-comparison-time" aria-labelledby={headingId} data-scene-id={scene.id}>
    <header className="comparison-time-heading"><h4 className="sr-only" id={headingId}>{dateName(day.date)}，{branch.title}的完整时间安排</h4>
      {onDiscussBranch && branch.optionRef && branch.sceneRef && <button type="button" className="comparison-time-discuss" disabled={disabled}
        onClick={() => onDiscussBranch(branch)}>从这版接着聊<ArrowUpRight size={15} aria-hidden="true" /></button>}
    </header>
    {days.length > 1 ? <div className="comparison-time-days" role="group" aria-label="查看哪一天">
      {days.map(value => <button type="button" key={value.date} aria-pressed={day.date === value.date}
        onClick={() => { setLocalDay({ id: comparison.comparisonId, date: value.date }); onViewDay?.(value.date); }}>
        {dateName(value.date)}</button>)}
    </div> : null}
    <div className="comparison-time-viewport" ref={viewport} tabIndex={0} aria-label="同一条时间带，可横向浏览"
      onScroll={() => {
        const pending = trialRef.current;
        if (pending?.mode !== 'pointer') return;
        if (!pending.active) { updateTrial({ ...pending, scrollLeft: viewport.current!.scrollLeft }); return; }
        const start = pointerTrialStart(pending, pending.lastPointerX!);
        if (start === undefined) cancelTrial(); else updateTrial({ ...pending, start });
      }}>
      <div className="comparison-time-canvas" style={{ minWidth: canvasWidth, height: 36 + laneCount * 88 + (hasMovement ? 43 : 10) } as CSSProperties}>
        <div className="comparison-time-axis" aria-hidden="true">{ticks.map((tick, index) => <span key={tick}
          className={`${index === 0 ? 'is-first' : index === ticks.length - 1 ? 'is-last' : ''}`} style={{ left: `${pos(tick)}%` }}>
          <time dateTime={new Date(tick).toISOString()}>{time(tick, zone)}</time></span>)}</div>
        {outside.map(range => <div key={range.start} className="comparison-time-outside" style={{ left: `${pos(range.start)}%`, width: `${(range.end - range.start) * 100 / span}%`, height: laneCount * 88 - 7 }}>
          <span>这段先不安排</span></div>)}
        <div className="comparison-time-blocks" role="group" aria-label={`${branch.title}的完整占用`}>
          {renderedBlocks.map(value => {
            const { block } = value, different = isDifferent(value), Icon = icons[block.kind];
            const anchor = block.kind === 'busy' && !different && !!block.sourceObjectId && all.every(choice => choice.blocks.some(otherBlock => otherBlock.key === value.key
              && otherBlock.start === value.start && otherBlock.end === value.end && !otherBlock.block.comparisonChange));
            const width = (value.end - value.start) * 100 / span, compact = width * canvasWidth / 100 < 106;
            const label = block.kind === 'free' ? '留给自己' : block.label;
            const conditional = block.comparisonChange?.kind === 'added', movable = canTry(value);
            return <SpringLayoutButton type="button" key={value.key} data-timeline-block={block.id}
              layoutKey={`${day.date}:${from}:${to}`} active={!disabled}
              verticalBounds={[0, 36 + (laneCount - 1) * 88]}
              className={`comparison-time-block is-${block.kind}${different ? ' is-different' : ''}${anchor ? ' is-anchor' : ''}${compact ? ' is-compact' : ''}${block.end === null ? ' is-unknown' : ''}${conditional ? ' is-conditional' : ''}${selectedId === block.id ? ' is-selected' : ''}${movable ? ' can-try-move' : ''}${ghost?.key === value.key ? ' is-being-tried' : ''}`}
              style={{ left: `${pos(value.start)}%`, width: `${width}%`, top: 36 + (lanes.get(value.key) || 0) * 88 } as CSSProperties}
              title={`${conditional ? '如果这样安排：' : ''}${label} · ${interval(block, zone)}${anchor ? ' · 原安排保留' : ''}${movable ? ' · 拖动试着换个时间' : ''}`}
              aria-label={`${interval(block, zone)}，${conditional ? '如果这样安排，' : ''}${label}，${names[block.kind]}${anchor ? '，原安排保留' : ''}，选择后接着聊`}
              aria-pressed={selectedId === block.id} disabled={disabled} onKeyDown={event => blockKey(event, value)}
              aria-keyshortcuts={movable ? 'Shift+ArrowLeft Shift+ArrowRight' : undefined}
              aria-description={movable ? 'Shift加左右方向键试挪五分钟，回车带到输入里，Escape取消。' : undefined}
              onPointerDown={event => pointerDown(event, value)} onPointerMove={event => pointerMove(event, value)}
              onPointerUp={event => {
                if (trialRef.current?.mode !== 'pointer' || trialRef.current.pointerId !== event.pointerId) return;
                if (trialRef.current.active) {
                  const start = pointerTrialStart(trialRef.current, event.clientX);
                  if (start === undefined) { cancelTrial(); return; }
                  updateTrial({ ...trialRef.current, lastPointerX: event.clientX, start });
                }
                commitTrial(value);
                captured.current = undefined;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              }} onPointerCancel={cancelTrial}
              onLostPointerCapture={() => { if (trialRef.current?.mode === 'pointer') cancelTrial(); }}
              onBlur={() => { if (trialRef.current?.blockId === value.block.id) cancelTrial(); }}
              onFocus={event => { setFocusedKey(value.key); reveal(event.currentTarget); }}
              onClick={() => { if (skipClick.current) { skipClick.current = false; return; }
                setFocusedKey(value.key); onSelect({ kind: 'time_block', sceneId: scene.id, sceneRevision: scene.revision, blockId: block.id }); }}>
              {movable && <GripHorizontal className="comparison-time-grip" size={14} aria-hidden="true" />}
              <span className="comparison-time-block-name"><Icon size={20} strokeWidth={1.65} aria-hidden="true" /><strong>{label}</strong></span>
              <span className="comparison-time-block-clock">{block.end === null ? '结束待定' : `${time(value.start, zone)} — ${time(value.end, zone)}`}</span>
              {anchor && <span className="comparison-time-anchor" aria-hidden="true">留在这里</span>}
              {conditional && <span className="comparison-time-conditional">如果这样安排</span>}
            </SpringLayoutButton>;
          })}
        </div>
        {ghost && trial && <div className="comparison-time-trial" role="status" style={{ left: `${pos(trial.start)}%`, width: `${trial.duration * 100 / span}%`,
          top: 36 + (lanes.get(ghost.key) || 0) * 88 } as CSSProperties}>
          <span>试放 {time(trial.start, zone)}</span><strong>{ghost.block.label}</strong>
          {trial.mode === 'keyboard' && <small>回车带到输入里 · Esc取消</small>}
        </div>}
        {detail && moved && <div className={`comparison-time-move${movementLeft + movementWidth / 2 < 10 ? ' is-near-start' : movementLeft + movementWidth / 2 > 90 ? ' is-near-end' : ''}`} style={{ top: 36 + laneCount * 88,
          left: `${movementLeft}%`, width: `${movementWidth}%` } as CSSProperties} aria-hidden="true">
          <span>{!before && <small>另一版</small>}{time(before ? before.start : other!.start, zone, !!before && dateKey(before.start, zone) !== day.date)}<ArrowRight size={16} />{time(detail.block.originalRange?.start || detail.start, zone, !!detail.block.originalRange)}</span>
        </div>}
      </div>
    </div>
    {detail && (!!selectedId || !!focusedKey) && <div className="comparison-time-detail" aria-live="polite"><div><strong>{detail.block.kind === 'free' ? '留给自己' : detail.block.label}</strong>
      <span>{interval(detail.block, zone)}</span></div>
      {before && <p>原来 {time(before.start, zone, dateKey(before.start, zone) !== day.date)}{before.end ? ` — ${time(before.end, zone, dateKey(before.start, zone) !== dateKey(before.end, zone))}` : ' 起，结束待定'}<ArrowRight size={13} aria-hidden="true" /><span>这一版 {interval(detail.block, zone)}</span></p>}
      {!before && other && <p>「{other.title}」里 {interval(other.block, zone)}<ArrowRight size={13} aria-hidden="true" /><span>这一版 {interval(detail.block, zone)}</span></p>}
      {detail.block.comparisonChange?.kind === 'added' && <p>如果这样安排，尚未变成已答应的事。</p>}
      {detail.block.kind !== 'free' && detail.block.reason && <p>{detail.block.reason}</p>}
    </div>}
    {!!scene.unscheduled.length && <details className="comparison-time-notes"><summary><ChevronDown size={15} aria-hidden="true" />
      {scene.unscheduled.length === 1 ? '还有一件事，留着再商量' : `还有 ${scene.unscheduled.length} 件事，留着再商量`}</summary>
      <ul>{scene.unscheduled.map((item, index) => <li key={index}><strong>{item.title}</strong><span>{item.reason}</span></li>)}</ul>
    </details>}
    <footer className="comparison-time-source"><details><summary>安排与依据<ChevronDown size={12} aria-hidden="true" /></summary><div>
      <p>{time(scene.window.from, zone, true)} 至 {time(scene.window.to, zone, true)} · {zone}</p>
      {summary && <p>{declared ? '指定时段内，' : ''}连同原有安排、准备和休息，共占 {minutes(summary.occupiedMinutes)}，{minutes(summary.freeMinutes)} 留给自己。
        {summary.reserveShortfallMinutes > 0 ? `比原先想留的空白少 ${minutes(summary.reserveShortfallMinutes)}。` : ''}</p>}
      {scene.sourceCoverage.map((source, index) => <p key={index}>{source.sourceId === 'local-agenda' ? '本机日历' : source.sourceId.startsWith('campus:') ? '校园资料' : '相关资料'}{source.status === 'complete' ? '' : ' · 范围还不完整'}{source.reason ? `：${source.reason}` : ''}</p>)}
      {conditions.map((condition, index) => <p key={index}>{condition}</p>)}
    </div></details></footer>
  </section>;
}
