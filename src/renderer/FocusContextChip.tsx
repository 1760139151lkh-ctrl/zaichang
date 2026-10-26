import { Columns2, RotateCcw, X } from 'lucide-react';
import './local-text-focus.css';

export interface FocusContextTrial {
  label: string;
  value: string;
  detail?: string;
  onChange: (localTime: string) => void;
  onCancelTrial?: () => void;
}

function writerFor(element: HTMLElement) {
  return element.closest('.composer-area')?.querySelector<HTMLTextAreaElement>('textarea');
}
function returnToWriter(input: HTMLTextAreaElement | null | undefined) {
  requestAnimationFrame(() => { if (input?.isConnected) input.focus({ preventScroll: true }); });
}

/** The same temporary cue for a real line, passage, option or scene object.
 * Its owner reference travels separately; this label is never evidence. */
export function FocusContextChip({ label, onClear, trial, onOpen, onCompare, targetKey }: { label: string; onClear: () => void; trial?: FocusContextTrial; onOpen?: () => void; onCompare?: () => void; targetKey?: string }) {
  return <div className="shared-map-context scene-reference conversation-focus-chip" role="status" data-workspace-target={targetKey}>
    {trial ? <span className="conversation-focus-trial" title={label}>
      <span className="conversation-focus-trial-label">{trial.label}</span><span aria-hidden="true">→</span>
      <input type="time" lang="zh-CN" step={60} value={trial.value} aria-label="试放开始时间"
        onChange={event => { if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) trial.onChange(event.target.value); }}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          event.preventDefault(); event.stopPropagation();
          const input = writerFor(event.currentTarget);
          if (event.key === 'Escape') trial.onCancelTrial?.();
          returnToWriter(input);
        }} />
      {trial.detail && <span className="conversation-focus-trial-detail">，{trial.detail}</span>}
    </span> : onOpen ? <button type="button" className="conversation-focus-source" title={label} onClick={onOpen}>
      {Array.from(label).slice(0, 180).join('')}{Array.from(label).length > 180 ? '…' : ''}
    </button> : <span title={label}>{Array.from(label).slice(0, 180).join('')}{Array.from(label).length > 180 ? '…' : ''}</span>}
    {onCompare && <button type="button" aria-label="留作对照，再选另一处" title="留作对照，再选另一处"
      onPointerDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={event => {
        const input = writerFor(event.currentTarget); onCompare(); returnToWriter(input);
      }}><Columns2 size={13} /></button>}
    {trial?.onCancelTrial && <button type="button" aria-label="只取消这次试放" title="只取消这次试放"
      onPointerDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={event => {
        const input = writerFor(event.currentTarget); trial.onCancelTrial?.(); returnToWriter(input);
      }}><RotateCcw size={12} /></button>}
    <button type="button" aria-label="取消这处引用" onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
      onClick={event => {
        const input = writerFor(event.currentTarget); onClear(); returnToWriter(input);
      }}><X size={13} /></button>
  </div>;
}
