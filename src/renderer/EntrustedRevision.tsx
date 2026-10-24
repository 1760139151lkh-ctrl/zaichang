import { useRef, useState } from 'react';
import type { AttentionControlItem } from '../shared/attention-control';
import { formatDateTime, fromTimeInput, timeZoneLabel, toTimeInput } from './time';
import { uiError } from './ui';

/** A local draft over one exact mandate. The host owns the saved agreement. */
export function EntrustedRevision({ item, timeZone, pending, sourceName, onSave, onCancel }: {
  item: AttentionControlItem;
  timeZone: string;
  pending: boolean;
  sourceName: (source: string) => string;
  onSave: (base: AttentionControlItem, changes: { sources: string[]; until: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [base, setBase] = useState(item);
  const [sources, setSources] = useState(item.sources.filter(source => item.availableSources.includes(source)));
  const [finite, setFinite] = useState(!!item.until);
  const [until, setUntil] = useState(toTimeInput(item.until || undefined, timeZone));
  const [problem, setProblem] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const changed = base.revision !== item.revision || base.controlVersion !== item.controlVersion;
  const options = [...new Set([...base.sourceBoundary, ...item.sourceBoundary])];
  let proposed: string | null | undefined;
  try { proposed = finite ? fromTimeInput(until, timeZone, base.until || undefined) : null; } catch { /* Preserve the exact civil draft until save. */ }
  const equal = proposed === base.until && [...sources].sort().join('\n') === [...base.sources].sort().join('\n');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending || changed) return;
    setProblem('');
    try {
      const nextUntil = finite ? fromTimeInput(until, timeZone, base.until || undefined) : null;
      if (finite && !nextUntil) throw new Error('选一下这件事留意到什么时候。');
      if (!sources.length) throw new Error('至少留下一种可参考的资料。想完全停止，可以取消编辑后选择“不再留意”。');
      if (sources.some(source => !item.availableSources.includes(source))) throw new Error('有些资料现在不能使用，请从这次范围里去掉。');
      await onSave(base, { sources, until: nextUntil || null });
    } catch (error) { setProblem(uiError(error)); }
  }

  return <form className="entrusted-revision" aria-labelledby="entrusted-revision-title" onSubmit={event => void save(event)} onKeyDown={event => {
    if (event.key === 'Escape' && !pending) { event.preventDefault(); event.stopPropagation(); onCancel(); }
  }}>
    <h3 id="entrusted-revision-title" ref={heading} tabIndex={-1}>改一改约定</h3>
    <fieldset disabled={pending}><legend>允许参考</legend>
      <div className="entrusted-source-choices">{options.map(source => <label key={source}>
        <input type="checkbox" checked={sources.includes(source)} disabled={!item.availableSources.includes(source) && !sources.includes(source)}
          onChange={event => setSources(current => event.target.checked ? [...current, source] : current.filter(value => value !== source))} />
        <span>{sourceName(source)}{!item.availableSources.includes(source) && <small>现在不能使用</small>}</span>
      </label>)}</div>
    </fieldset>
    <fieldset disabled={pending}><legend>到什么时候</legend>
      <label className="entrusted-deadline-choice"><input type="radio" name={`attention-until-${item.id}`} checked={finite} onChange={() => setFinite(true)} />指定时间</label>
      {finite && <div className="entrusted-deadline-input"><input type="datetime-local" step="1" aria-label="留意结束时间" value={until} onChange={event => setUntil(event.target.value)} /><span>{timeZoneLabel(timeZone)}</span></div>}
      <label className="entrusted-deadline-choice"><input type="radio" name={`attention-until-${item.id}`} checked={!finite} onChange={() => setFinite(false)} />不设结束时间</label>
      {item.maximumUntil && <p>所属约定到 {formatDateTime(item.maximumUntil, timeZone)} 为止。</p>}
    </fieldset>
    <div className="entrusted-revision-comparison"><span>{base.until ? formatDateTime(base.until, timeZone) : '不设结束时间'}</span><span aria-hidden="true">→</span><strong>{proposed ? formatDateTime(proposed, timeZone) : proposed === null ? '不设结束时间' : '选择结束时间'}</strong></div>
    {!!item.pauseRules.length && <p className="entrusted-contract-note">暂停的约定仍然保留。</p>}
    {changed && <div className="entrusted-revision-conflict" role="alert"><p>这件事刚有变化。你的修改还在这里，先核对现在的约定：{item.sources.map(sourceName).join('、')}；{item.until ? `到 ${formatDateTime(item.until, timeZone)}` : '不设结束时间'}。</p>
      {item.canRevise && <button type="button" className="text-button" onClick={() => { setBase(item); setProblem(''); }}>按现在的约定继续编辑</button>}</div>}
    {!item.canRevise && <p className="entrusted-problem" role="alert">这件事目前不能修改约定。编辑内容仍留在这里。</p>}
    {problem && <p className="entrusted-problem" role="alert">{problem}</p>}
    <div className="entrusted-revision-actions"><button type="submit" className="primary-button" disabled={pending || changed || !item.canRevise || equal}>{pending ? '正在保存…' : '保存约定'}</button><button type="button" className="subtle-button" disabled={pending} onClick={onCancel}>取消</button></div>
  </form>;
}
