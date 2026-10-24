import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CalendarArrowUp, Check, ChevronDown, X } from 'lucide-react';
import type { CalendarExportResult } from '../shared/calendar-export';
import { fromTimeInput, timeZoneLabel } from './time';
import { uiError } from './ui';

function nextDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The native picker writes a finite snapshot; opening this sheet does not read an account. */
export function CalendarHandoff({ date, timeZone }: { date: string; timeZone: string }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  const returnAfterSave = useRef(false);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(date);
  const [through, setThrough] = useState(() => nextDate(date, 6));
  const [includeDetails, setIncludeDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CalendarExportResult>();
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!open && !busy && returnAfterSave.current) { returnAfterSave.current = false; trigger.current?.focus(); }
  }, [open, busy]);
  function close(returnFocus = false) {
    if (busy) return;
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }
  useEffect(() => { if (open) firstField.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!busy && !root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!busy) { setOpen(false); trigger.current?.focus(); }
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open, busy]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setResult(undefined);
    try {
      if (!from || !through || from > through) throw new Error('选好开始和结束日期，就可以带走这段安排。');
      const start = fromTimeInput(`${from}T00:00`, timeZone)!;
      const end = fromTimeInput(`${nextDate(through, 1)}T00:00`, timeZone)!;
      if (Date.parse(end) - Date.parse(start) > 366 * 86400000) throw new Error('一次可以带走一年内的安排，选一段短些的日期吧。');
      setBusy(true);
      const response = await window.zaichang.exportCalendar({ from: start, to: end, timeZone, includeDetails });
      if (!live.current) return;
      if (response.saved) {
        returnAfterSave.current = true; setResult(response); setOpen(false);
      } else if (response.omitted || response.reasons.length) {
        setError(response.reasons.join(' '));
      }
    } catch (problem) { if (live.current) setError(uiError(problem)); }
    finally { if (live.current) setBusy(false); }
  }
  return <div className="calendar-handoff" ref={root}>
    <button ref={trigger} type="button" className="text-button calendar-handoff-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} disabled={busy} onClick={() => {
      if (open) { close(); return; }
      setFrom(date); setThrough(nextDate(date, 6)); setError(''); setResult(undefined); setOpen(true);
    }}><CalendarArrowUp size={16} />带到日历里<ChevronDown size={13} /></button>
    {open && <section className="calendar-handoff-sheet" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} id={id}>
      <div className="calendar-handoff-heading"><h2 id={`${id}-title`}>把安排带在身边</h2><button type="button" className="icon-button" aria-label="收起日历导出" disabled={busy} onClick={() => close(true)}><X size={17} /></button></div>
      <p>选一段日期，把自己记下的安排放进常用的日历。</p>
      <form onSubmit={event => void save(event)}>
        <div className="calendar-handoff-dates">
          <label>从<input ref={firstField} type="date" aria-label="日历导出开始日期" value={from} onChange={event => setFrom(event.target.value)} required disabled={busy} /></label>
          <label>到<input type="date" aria-label="日历导出结束日期" value={through} min={from || undefined} onChange={event => setThrough(event.target.value)} required disabled={busy} /></label>
        </div>
        <small className="calendar-handoff-zone">{timeZoneLabel(timeZone)} · 包括结束这一天</small>
        <label className="calendar-handoff-details"><input type="checkbox" checked={includeDetails} onChange={event => setIncludeDetails(event.target.checked)} disabled={busy} />包括我写的备注</label>
        <p className="calendar-handoff-copy">这是一份当前安排的副本。以后有调整，可以再导出。</p>
        {error && <p className="calendar-handoff-error" role="alert">{error}</p>}
        <div className="calendar-handoff-actions"><button type="submit" className="primary-button" disabled={busy}>{busy ? '选择放在哪里…' : '保存日历文件'}</button><button type="button" className="text-button" disabled={busy} onClick={() => close(true)}>先不带走</button></div>
      </form>
    </section>}
    {result?.saved && <div className="calendar-handoff-result" role="status"><Check size={16} /><div><p>日历文件放好了，共 {result.count} 项安排。</p>{result.omitted > 0 && <small>{result.reasons.join(' ') || `还有 ${result.omitted} 项时间未确定，暂时没有放入。`}</small>}</div><button type="button" className="icon-button" aria-label="收起日历文件提示" onClick={() => setResult(undefined)}><X size={14} /></button></div>}
  </div>;
}
