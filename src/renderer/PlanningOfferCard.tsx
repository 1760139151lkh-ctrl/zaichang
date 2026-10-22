import { useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, LoaderCircle } from 'lucide-react';
import type { Action, Bridge } from '../shared/types';
import { formatDateTime, timeZoneLabel } from './time';
import './planning-offer.css';

export function PlanningOfferCard({ action, effect, disabled, onSave, onView, onRefresh }: {
  action: Action;
  effect: Awaited<ReturnType<Bridge['actionState']>> | undefined;
  disabled: boolean;
  onSave: (item: Action) => Promise<{ ok: boolean; error?: string }>;
  onView: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const offer = effect?.action?.planningOffer || action.planningOffer!;
  const progress = effect?.planningOffer;
  const titles = [...new Set(offer.units.filter(unit => unit.kind === 'work').map(unit => unit.arguments.title))];
  const ready = progress?.status === 'ready' || progress?.status === 'partially_saved';
  const saved = progress?.status === 'saved';
  const clock = (at: string, zone: string) => formatDateTime(at, zone, { month: undefined, day: undefined });
  async function accept() {
    if (saving || !ready) return;
    setSaving(true); setError('');
    try { const result = await onSave(action); if (!result.ok) setError(result.error || '这次还没有保存完整。'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { try { await onRefresh(); } finally { setSaving(false); } }
  }
  return <section className={`action-card planning-offer${saved ? ' is-saved' : ''}`} aria-label="整份安排">
    <div className="action-eyebrow">{saved ? <Check size={14} aria-hidden="true" /> : <span className="status-dot suggestion" aria-hidden="true" />}
      {saved ? '这份安排已留下' : progress?.saved ? `已留下 ${progress.saved} / ${progress.total} 段` : '这一版安排'}</div>
    <h3>{titles.join(' · ')}</h3>
    <ol className="planning-offer-units">
      {offer.units.map(unit => {
        const args = unit.arguments, zone = args.timeZone;
        const end = new Date(Date.parse(args.startsAt) + args.durationMinutes * 60000).toISOString();
        return <li key={unit.blockId} className={`planning-offer-${unit.kind}`}>
          <div className="planning-offer-time"><span>{formatDateTime(args.startsAt, zone, { hour: undefined, minute: undefined })}</span>
            <time>{clock(args.startsAt, zone)} — {clock(end, zone)}</time></div>
          <div className="planning-offer-content"><strong>{args.title}</strong>
            {unit.work ? <p>{unit.work.minutes} 分钟{unit.work.setupMinutes || unit.work.cleanupMinutes ? '工作' : ''}
              {unit.work.setupMinutes > 0 ? ` · 准备 ${unit.work.setupMinutes} 分钟` : ''}
              {unit.work.cleanupMinutes > 0 ? ` · 收尾 ${unit.work.cleanupMinutes} 分钟` : ''}</p>
              : <p>{args.durationMinutes} 分钟{args.detail ? ` · ${args.detail}` : ''}</p>}
          </div>
        </li>;
      })}
    </ol>
    <div className="planning-offer-footer"><small>{timeZoneLabel(offer.units[0].arguments.timeZone)}</small>
      <div className="action-buttons">
        {ready && <button className="primary-button" disabled={disabled || saving} onClick={() => void accept()}>
          {saving ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}
          {saving ? '正在留下安排…' : progress?.saved ? '继续采用剩余安排' : '采用这份安排'}
        </button>}
        {(saved || !!progress?.saved) && <button className="text-button" onClick={onView}>查看安排<ChevronRight size={14} /></button>}
      </div>
    </div>
    {!progress && <p className="planning-offer-status" aria-live="polite">{effect === undefined ? '正在看看这份安排…' : '这份安排的当前状态暂时没有读到。'}</p>}
    {progress?.status === 'recompute_required' && <div className="planning-offer-status">
      <p>{progress.saved ? '留下的安排仍在，余下部分需要重新商量。' : '时间或安排有了变化，这一版需要重新试排。'}</p>
      {progress.reason && <details><summary>看看变化</summary><p>{progress.reason}</p></details>}
    </div>}
    {progress?.status === 'unknown' && <p className="planning-offer-status">{progress.reason}</p>}
    {progress?.status === 'stopped' && <p className="planning-offer-status">这份提议已经收起。</p>}
    {error && <p className="inline-problem" role="alert">{error}</p>}
  </section>;
}
