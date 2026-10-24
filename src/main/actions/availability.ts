import { HarnessError } from '../../shared/harness';

/** Exact interval arithmetic; semantic truth of supplied evidence remains with its sources. */
export function availableIntervals(input: {
  from: string; to: string; busy: { start: string; end: string | null }[];
  transitionMinutes: { min: number; max: number }; minimumBlockMinutes: number;
  /** 1 preserves the original total-per-gap API; 2 means one cost on each side. */
  transitionBoundaryCount?: 1 | 2;
}) {
  const from = Date.parse(input.from), to = Date.parse(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new HarnessError('time_window', '时间范围不合法。');
  if (![input.transitionMinutes.min, input.transitionMinutes.max, input.minimumBlockMinutes].every(Number.isFinite) || input.transitionMinutes.min < 0 || input.transitionMinutes.max < input.transitionMinutes.min || input.minimumBlockMinutes < 0) throw new HarnessError('time_cost', '转换时间或工作块下限不合法。');
  const unknownEnds: string[] = [];
  const busy = input.busy.map(interval => {
    const start = Date.parse(interval.start), end = interval.end ? Date.parse(interval.end) : to;
    if (!Number.isFinite(start) || !Number.isFinite(end) || (interval.end && end <= start)) throw new HarnessError('busy_interval', '忙碌区间不合法。');
    if (!interval.end) unknownEnds.push(interval.start);
    return [Math.max(from, start), Math.min(to, end)] as const;
  }).filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of busy) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const windows = [];
  let cursor = from;
  for (const [start, end] of [...merged, [to, to] as [number, number]]) {
    if (start > cursor) {
      const minutes = (start - cursor) / 60000;
      const boundaryCount = input.transitionBoundaryCount || 1;
      const usable = { min: Math.max(0, minutes - boundaryCount * input.transitionMinutes.max), max: Math.max(0, minutes - boundaryCount * input.transitionMinutes.min) };
      windows.push({ start: new Date(cursor).toISOString(), end: new Date(start).toISOString(), wallMinutes: minutes, usableMinutes: usable,
        fitsMinimum: usable.min >= input.minimumBlockMinutes ? 'yes' : usable.max < input.minimumBlockMinutes ? 'no' : 'uncertain' });
    }
    cursor = Math.max(cursor, end);
  }
  return { windows, unknownEnds, status: unknownEnds.length ? 'conditional' : 'calculated', basis: 'supplied_intervals_and_costs', environmentVerified: false,
    meaning: '这些空当已经留出了每次转场需要的时间；还不知道何时结束的事，先给它多留了一些余地。这里依据的是带来的时间记录，相关设备能否使用、场所是否开放，仍要看各自的实际消息。' };
}
