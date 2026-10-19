import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, RefreshCw } from 'lucide-react';
import type { CampusScheduleBlock, CampusScheduleResult } from '../shared/campus-calendar';
import { formatDateTime, fromTimeInput, toTimeInput } from './time';

type CampusRead =
  | { key: string; status: 'loading' | 'error' }
  | { key: string; status: 'ready'; result: CampusScheduleResult; readAt: string };

/** Private results belong only to this explicit selection and visible day. */
export function useCampusDaySchedule({ date, nextDate, timeZone, active, boundary }: {
  date: string; nextDate: string; timeZone: string; active: boolean; boundary: string;
}) {
  const [selection, setSelection] = useState({ boundary, enabled: false });
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<CampusRead>();
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const generation = useRef(0);
  const enabled = selection.boundary === boundary && selection.enabled;
  const key = enabled && active && visible ? JSON.stringify([boundary, date, nextDate, timeZone, attempt]) : '';
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const request = ++generation.current;
    setRead(undefined);
    if (!key) return;
    setRead({ key, status: 'loading' });
    void (async () => {
      try {
        const from = fromTimeInput(`${date}T00:00`, timeZone);
        const to = fromTimeInput(`${nextDate}T00:00`, timeZone);
        if (!from || !to) throw new Error('没有可读取的日期。');
        const result = await window.zaichang.campusSchedule({ from, to, timeZone });
        if (generation.current === request) setRead({ key, status: 'ready', result, readAt: new Date().toISOString() });
      } catch {
        if (generation.current === request) setRead({ key, status: 'error' });
      }
    })();
    return () => { generation.current++; };
  }, [key, date, nextDate, timeZone]);
  const current = key && read?.key === key ? read : undefined;
  return {
    enabled,
    loading: !!key && (!current || current.status === 'loading'),
    failed: current?.status === 'error',
    result: current?.status === 'ready' ? current.result : undefined,
    readAt: current?.status === 'ready' ? current.readAt : undefined,
    toggle: () => setSelection({ boundary, enabled: !enabled }),
    reload: () => setAttempt(value => value + 1),
  };
}

type CampusDayRead = ReturnType<typeof useCampusDaySchedule>;
const resourceLabels: Record<string, string> = {
  classes: '课程', exams: '考试', cancelled_classes: '停调课记录', calendar_pending: '待定安排',
};

function coverageLabel(coverage: unknown) {
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) return '覆盖范围尚未核清';
  const value = coverage as Record<string, unknown>;
  return value.complete === true ? '已读全这份保存记录' : '这份保存记录的覆盖范围仍不完整';
}

function gapLabel(result: CampusScheduleResult) {
  if (result.pendingCount) return `还有 ${result.pendingCount} 项校园安排的时间待公布或核清。`;
  if (result.scheduleQuality.some(quality => quality.status === 'unavailable' ||
    !quality.generatedAllResolvableRules || quality.unresolvedRuleCount > 0)) return '有课程时间尚待核清。';
  if (!result.coverage.completeForSavedSnapshot) return '课表还有未核清的范围。';
  if (!result.items.length) return '当前保存的课表未列出这一天的课程或考试。';
  return '';
}

export function CampusDayControls({ campus, dayVisible, timeZone }: {
  campus: CampusDayRead; dayVisible: boolean; timeZone: string;
}) {
  const result = campus.result;
  const unread = result?.status === 'not_read';
  const note = !campus.enabled ? '' : !dayVisible ? '课表已选中，只在「当天」中一起看。'
    : campus.loading ? '正在读取这一天的课表…' : campus.failed || unread ? '课表暂时没读到。'
    : result ? gapLabel(result) : '';
  return (
    <div className="today-campus-tools">
      <div className="today-campus-controls">
        <button type="button" className="today-campus-toggle" aria-pressed={campus.enabled} onClick={campus.toggle}>
          <BookOpen size={16} strokeWidth={1.6} />课表一起看
          {campus.enabled && <span className="today-campus-selected" aria-hidden="true" />}
        </button>
        {result && result.snapshots.length > 0 && (
          <details className="today-campus-source">
            <summary>看来源<ChevronDown size={13} /></summary>
            <div className="today-campus-source-body">
              <p className="today-campus-source-title">浙江大学本人账号 · 保存的课表</p>
              {campus.readAt && <p>这次查看于 {formatDateTime(campus.readAt, timeZone, { year: 'numeric' })}</p>}
              {result.snapshots.map(snapshot => (
                <div className="today-campus-source-entry" key={`${snapshot.bundleId}:${snapshot.resource}:${snapshot.version}`}>
                  <strong>{resourceLabels[snapshot.resource] || '校园安排'}</strong>
                  <span>{snapshot.collectedAt ? `采集于 ${formatDateTime(snapshot.collectedAt, timeZone, { year: 'numeric' })}` : '采集时间未提供'}{snapshot.selection === 'historical' ? ' · 历史保存记录' : ''}</span>
                  <span>{coverageLabel(snapshot.coverage)}</span>
                </div>
              ))}
              {result.scheduleQuality.map(quality => (
                <p className="today-campus-quality" key={quality.bundleId}>
                  {quality.status === 'unavailable' ? '课次是否齐全暂未核清。' : <>
                    {quality.generatedAllResolvableRules && quality.unresolvedRuleCount === 0 ? '已列出可确定时间的课次。' : `部分课表规则尚未确定时间${quality.unresolvedRuleCount > 0 ? `（${quality.unresolvedRuleCount} 项）` : ''}。`}
                    {quality.calendarOfficiallyCrosschecked ? ' 已与官方校历核对。' : ' 尚未与官方校历核对。'}
                    {!quality.allFutureDatesFinal && ' 后续日期仍可能调课。'}
                  </>}
                </p>
              ))}
              <p>{result.coverage.completeForSavedSnapshot ? '本次已读全保存记录中这一天的安排。' : '本次读取仍有未核清的范围。'}保存记录不代表实时校方确认或实际出席，未列出的时段也不代表有空。</p>
              {result.cancelledCount != null && result.cancelledCount > 0 && <p>已按保存的停调课记录排除 {result.cancelledCount} 项。</p>}
              <button type="button" className="text-button" onClick={campus.reload}><RefreshCw size={12} />重新读取</button>
            </div>
          </details>
        )}
      </div>
      {note && <p className="today-campus-note" role="status">{note}{dayVisible && (campus.failed || unread) && <button type="button" className="text-button" onClick={campus.reload}>重试</button>}</p>}
    </div>
  );
}

export function CampusScheduleRow({ item, date, timeZone }: {
  item: CampusScheduleBlock; date: string; timeZone: string;
}) {
  const start = toTimeInput(item.start, timeZone);
  const end = item.end ? toTimeInput(item.end, timeZone) : '';
  const clock = (value: string) => <>
    {value.slice(0, 10) !== date && <span className="today-campus-time-date">
      {value.slice(0, 4) !== date.slice(0, 4) ? `${value.slice(0, 4)}年` : ''}{Number(value.slice(5, 7))}月{Number(value.slice(8, 10))}日
    </span>}
    {value.slice(11, 16)}
  </>;
  return (
    <article className="today-item is-campus">
      <div className="today-item-time">
        <span>{clock(start)}</span>
        <small>{end ? clock(end) : '结束未定'}</small>
      </div>
      <div className="today-item-paper">
        <span className="today-campus-book" aria-hidden="true"><BookOpen size={18} strokeWidth={1.5} /></span>
        <div className="today-item-content">
          <strong>{item.title}</strong>
          {item.location && <span className="today-item-detail">{item.location}</span>}
        </div>
        <span className="today-campus-kind">{item.kind === 'exam' ? '考试' : '课程'}</span>
      </div>
    </article>
  );
}
