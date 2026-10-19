import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { PlanningComparisonView, PlanningWorkRhythm } from '../../shared/planning-conversation';
import './planning-comparison.css';

type Branch = PlanningComparisonView['branches'][number];
export interface PlanningComparisonHeaderProps {
  comparison: PlanningComparisonView;
  activeBranchId?: string;
  onPreviewBranch: (branchId: string) => void;
  disabled?: boolean;
}
function duration(value: number) {
  const minutes = Math.round(value);
  if (minutes < 1) return '不到1分钟';
  return minutes < 60 ? `${minutes}分钟` : `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`;
}
function windowName(comparison: PlanningComparisonView) {
  const format = (value: string) => new Date(value).toLocaleDateString('zh-CN', {
    timeZone: comparison.window.timeZone, month: 'long', day: 'numeric',
  });
  const start = format(comparison.window.from), end = format(new Date(Date.parse(comparison.window.to) - 1).toISOString());
  return start === end ? start : `${start} — ${end}`;
}

/** One shared day can be viewed in several ways. The branches return to one
 * composer; the scene stack owns the actual timeline and all time arithmetic. */
export function PlanningComparisonHeader({ comparison, activeBranchId, onPreviewBranch,
  disabled = false }: PlanningComparisonHeaderProps) {
  const headingId = useId();
  const [local, setLocal] = useState<{ comparisonId: string; branchId: string }>();
  const active = comparison.branches.find(branch => branch.branchId === activeBranchId)
    || comparison.branches.find(branch => local?.comparisonId === comparison.comparisonId && branch.branchId === local.branchId)
    || comparison.branches[0];
  if (!active || comparison.branches.length < 2) return null;
  const preview = (branch: Branch) => {
    setLocal({ comparisonId: comparison.comparisonId, branchId: branch.branchId });
    onPreviewBranch(branch.branchId);
  };
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const choices = [...event.currentTarget.closest('.planning-comparison-branches')!.querySelectorAll<HTMLButtonElement>('[data-preview-branch]')];
    const current = choices.indexOf(event.currentTarget), next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
      : Math.max(0, Math.min(choices.length - 1, current + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault();
    choices[next]?.focus({ preventScroll: true }); choices[next]?.click();
  };
  const showChanges = comparison.branches.some(branch => branch.metrics.changedObjects > 0);
  const showFree = new Set(comparison.branches.map(branch => branch.metrics.largestFreeWindowMinutes)).size > 1;
  const showWork = new Set(comparison.branches.map(branch => branch.metrics.longestWorkMinutes)).size > 1;
  const rhythmFacts = (rhythm: PlanningWorkRhythm) => {
    const setupDiffers = new Set(comparison.branches.flatMap(branch => branch.workRhythms?.filter(value => value.taskId === rhythm.taskId)
      .map(value => value.setupCleanupMinutes) || [])).size > 1;
    return <div className="planning-comparison-rhythm" key={rhythm.taskId}>
      <span>{rhythm.title}</span>
      <p>{!rhythm.complete || !rhythm.matchesRequest
        ? `已试排${duration(rhythm.scheduledMinutes)}，还没排成完整的${duration(rhythm.requestedMinutes)}`
        : rhythm.segments.length > 3 ? <>共{duration(rhythm.scheduledMinutes)}，分成{rhythm.segments.length}段</>
          : <>{rhythm.segments.map(segment => duration(segment.workMinutes)).join(' + ')}{rhythm.segments.length === 1 ? '连着做' : '分开做'}</>}
        {setupDiffers && <small>准备与收尾共{duration(rhythm.setupCleanupMinutes)}</small>}
      </p>
    </div>;
  };
  const singleDay = !windowName(comparison).includes(' — ');
  const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: comparison.window.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = singleDay && dateKey.format(new Date(comparison.window.from)) === dateKey.format(new Date());
  const distinctUnscheduled = new Set(comparison.branches.map(branch => JSON.stringify(branch.unscheduled || []))).size > 1;
  return <section className="planning-comparison-header" aria-labelledby={headingId}
    data-comparison-id={comparison.comparisonId} style={{ '--planning-branch-count': comparison.branches.length } as CSSProperties}>
    <header className="planning-comparison-heading">
      <h3 id={headingId}>{singleDay ? `${today ? '同一条今天' : '同一天'}，${comparison.branches.length === 2 ? '两种' : '几种'}改法` : '同样的几天，几种过法'}</h3><span>{windowName(comparison)}</span>
    </header>
    <div className="planning-comparison-branches" role="group" aria-label="看看哪一版">
      {comparison.branches.map(branch => <article className={`planning-comparison-branch${active.branchId === branch.branchId ? ' is-active' : ''}`}
        key={branch.branchId}>
        <button type="button" data-preview-branch={branch.branchId} aria-pressed={active.branchId === branch.branchId}
          disabled={disabled} onKeyDown={move} onClick={() => preview(branch)} className="planning-comparison-preview">
          <strong><span className="planning-comparison-choice" aria-hidden="true" />{branch.title}</strong><span className="planning-comparison-intent">{branch.intent}</span>
        </button>
        {(showChanges || showFree || showWork && !branch.workRhythms?.length) && <dl className="planning-comparison-differences">
          {showChanges && <div><dt>原来的安排</dt><dd>{branch.metrics.changedObjects
            ? [branch.metrics.changedObjects > branch.metrics.removedObjects ? `调整 ${branch.metrics.changedObjects - branch.metrics.removedObjects} 处` : '',
              branch.metrics.removedObjects ? `不保留 ${branch.metrics.removedObjects} 处` : ''].filter(Boolean).join(' · ') : '都留着'}</dd></div>}
          {showFree && <div><dt>最长的一段空白</dt><dd>{branch.metrics.largestFreeWindowMinutes > 0 ? `最长空白 ${duration(branch.metrics.largestFreeWindowMinutes)}` : '这版暂没空段'}</dd></div>}
          {showWork && !branch.workRhythms?.length && <div><dt>连着做一件事</dt><dd>{branch.metrics.longestWorkMinutes > 0 ? `连续 ${duration(branch.metrics.longestWorkMinutes)}` : '这一版没有新增'}</dd></div>}
        </dl>}
        {!!branch.workRhythms?.length && <div className="planning-comparison-rhythms">
          {branch.workRhythms.slice(0, 2).map(rhythmFacts)}
          {branch.workRhythms.length > 2 && <details><summary>还有{branch.workRhythms.length - 2}件事的做法</summary>
            {branch.workRhythms.slice(2).map(rhythmFacts)}
          </details>}
        </div>}
        {!!branch.removed?.length && <p className="planning-comparison-left-for-later">这版不保留：{branch.removed.map(item => `${item.title}${item.occurrenceDate ? `（${item.occurrenceDate}这次）` : ''}`).join('、')}</p>}
        {distinctUnscheduled && !!branch.unscheduled?.length && <p className="planning-comparison-left-for-later">
          {branch.unscheduled.length <= 2 ? branch.unscheduled.map(item => item.title).join('、') : `${branch.unscheduled.length} 件事`}，留着再商量
        </p>}
      </article>)}
    </div>
    <svg className="planning-comparison-joining" viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden="true">
        {comparison.branches.map((branch, index) => {
          const start = (index + .5) * 1000 / comparison.branches.length;
          return <path key={branch.branchId} d={`M ${start} 0 C ${start} 30, 500 8, 500 44`}
            className={branch.branchId === active.branchId ? 'is-active' : undefined} />;
        })}
    </svg>
  </section>;
}
