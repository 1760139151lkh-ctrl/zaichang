import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronDown, FileText, LoaderCircle, MoreHorizontal, X } from 'lucide-react';
import type { CompanionSceneProjection } from '../../shared/companion-session';
import type { CompanionFollowupReference, CompanionSourceTarget } from '../../shared/companion-source';
import type { LocalSearchLocator } from '../../shared/search';
import { RichText } from '../RichText';
import { uiError } from '../ui';
import { openCompanionSource, type CompanionOpenedSource } from './companion-session-source';
import './companion-session.css';

export interface CompanionSessionViewProps {
  projection: CompanionSceneProjection;
  /** Prepare normal conversation text. The parent retains the exact module
   * focus; this view never invokes a tool or changes the working record. */
  onContinue: (text: string, projection: CompanionSceneProjection, reference: CompanionFollowupReference) => void;
  onOpenDocument?: (locator: Extract<LocalSearchLocator, { kind: 'material' }>) => void;
  /** Real current UI intent, never inferred from a word in the transcript. */
  isResuming?: boolean;
  boundaryKey?: string;
  disabled?: boolean;
}

const helpNames: Record<CompanionSceneProjection['helpMode'], string> = {
  listen: '先听你说', organize: '一起理一理', hint: '一点提示', do: '直接帮忙',
};
const stateNames: Record<CompanionSceneProjection['state'], string> = {
  active: '一起接着做', held: '先留在这里', finished: '这一段先收好', stopped: '这次先放下',
};

/** A small continuation on the original discussion paper, not a new task or
 * timer. Every action returns to the ordinary composer with its owner focus. */
export function CompanionSessionView({ projection, onContinue, onOpenDocument, isResuming = false, boundaryKey,
  disabled = false }: CompanionSessionViewProps) {
  const headingId = useId(), sourceId = useId(), point = projection.returnPoint.trim();
  const explanation = projection.workingExplanation.trim();
  const obstacle = projection.currentObstacle?.trim();
  const next = projection.nextStep?.trim();
  const closed = projection.state === 'finished' || projection.state === 'stopped';
  const canChange = projection.controls.canFinish || projection.controls.canStop;
  const [readingTarget, setReadingTarget] = useState<CompanionSourceTarget>();
  const [original, setOriginal] = useState<CompanionOpenedSource>();
  const [opening, setOpening] = useState(false), [sourceError, setSourceError] = useState('');
  const request = useRef(0), sourcePanel = useRef<HTMLElement>(null), originalButton = useRef<HTMLButtonElement | undefined>(undefined);
  const seenBoundary = useRef<string | undefined>(undefined);
  const resetReading = () => { request.current++; setReadingTarget(undefined); setOriginal(undefined); setOpening(false); setSourceError(''); };
  useEffect(() => {
    resetReading();
    return () => { request.current++; };
  }, [projection.id, projection.revision, boundaryKey]);
  useEffect(() => window.zaichang.onEvent(event => {
    if (event.type !== 'state') return;
    const next = `${event.state.privacyEpoch}:${event.state.policyRevision}:${event.state.presentation?.mode || 'private'}`;
    if (seenBoundary.current === undefined || seenBoundary.current !== next || event.state.presentation?.mode === 'public') resetReading();
    seenBoundary.current = next;
  }), []);
  const continueWith = (text: string, target?: CompanionSourceTarget) => onContinue(text, projection, {
    kind: 'co_work', id: projection.id, revision: projection.revision, matterId: projection.matterId,
    ...(projection.historySource ? { snapshot: projection.historySource } : {}),
    ...(target ? { target } : {}),
  });
  const sourceSelected = (kind: CompanionSourceTarget['kind'], index: number) => readingTarget?.kind === kind && readingTarget.index === index;
  async function openSource(target: CompanionSourceTarget, trigger?: HTMLButtonElement) {
    const current = ++request.current;
    if (trigger) originalButton.current = trigger;
    setReadingTarget(target); setOriginal(undefined); setOpening(true); setSourceError('');
    requestAnimationFrame(() => { if (current === request.current) sourcePanel.current?.focus({ preventScroll: true }); });
    try {
      const value = await openCompanionSource(window.zaichang, { id: projection.id, revision: projection.revision,
        matterId: projection.matterId, target, ...(projection.historySource ? { snapshot: projection.historySource } : {}) });
      if (current === request.current) setOriginal(value);
    } catch (error) { if (current === request.current) setSourceError(uiError(error)); }
    finally { if (current === request.current) setOpening(false); }
  }
  function closeSource() { resetReading(); originalButton.current?.focus({ preventScroll: true }); }
  return <section className="companion-session" aria-labelledby={headingId}
    data-companion-id={projection.id} data-companion-state={projection.state} data-resuming={isResuming || undefined}>
    <header className="companion-session-heading">
      <div className="companion-session-heading-copy">
        <h4 id={headingId}>{stateNames[projection.state]}</h4>
        {!closed && <span className="companion-session-help">{helpNames[projection.helpMode]}</span>}
      </div>
      {canChange && <details className="companion-session-more"
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}
        onKeyDown={event => {
          if (event.key !== 'Escape') return;
          event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }}>
        <summary aria-label="这次一起做的其他选择"><MoreHorizontal size={17} aria-hidden="true" /></summary>
        <div>
          {projection.controls.canFinish && <button type="button" disabled={disabled}
            onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open');
              continueWith('这一段先收好，结束这次一起做的过程。'); }}>收好这一段</button>}
          {projection.controls.canStop && <button type="button" disabled={disabled}
            onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open');
              continueWith('这次先停下，把上次的材料留在原处。'); }}>这次先停下</button>}
        </div>
      </details>}
    </header>

    <div className={`companion-session-desk${readingTarget ? ' is-reading' : ''}`}>
    <div className="companion-session-working">
    {explanation && explanation !== point && <div className="companion-session-context"><RichText text={explanation} /></div>}
    {obstacle && obstacle !== explanation && obstacle !== point
      && <div className="companion-session-obstacle"><RichText text={obstacle} /></div>}
    <blockquote className="companion-session-return"><RichText text={point} /></blockquote>
    {next && next !== point && next !== explanation && next !== obstacle
      && <div className="companion-session-next"><RichText text={next} /></div>}

    {projection.materials.length > 0 && <details className="companion-session-materials">
      <summary>原来的资料<ChevronDown size={14} aria-hidden="true" /></summary>
      <ul>{projection.materials.map((material, index) => <li key={`${material.kind}:${index}`}>
        <button type="button" aria-expanded={sourceSelected('material', index)} aria-controls={sourceId}
          onClick={event => void openSource({ kind: 'material', index }, event.currentTarget)}>
          <FileText size={16} aria-hidden="true" /><span>{material.label}</span><ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </li>)}</ul>
    </details>}

    {(projection.attempts.length > 0 || projection.learningProcessRefs.length > 0) && <details className="companion-session-attempts">
      <summary>刚才试过的地方<ChevronDown size={14} aria-hidden="true" /></summary>
      <div>
        {projection.attempts.map((attempt, index) => <button type="button" key={`${attempt.source.eventId}:${attempt.source.start}:${attempt.source.end}`}
          aria-expanded={sourceSelected('attempt', index)} aria-controls={sourceId}
          onClick={event => void openSource({ kind: 'attempt', index }, event.currentTarget)}>
          <BookOpen size={15} aria-hidden="true" />{projection.attempts.length === 1 ? '回看那一步' : `第${index + 1}段尝试`}
        </button>)}
        {projection.learningProcessRefs.length > 0 && <button type="button" disabled={disabled}
          onClick={() => continueWith('看看这件事之前的学习尝试和当时用过的帮助。')}>
          <BookOpen size={15} aria-hidden="true" />看看之前的尝试
        </button>}
      </div>
    </details>}

    {!closed && (projection.controls.canResume || projection.controls.canHold) && <footer className="companion-session-actions">
      {projection.controls.canResume && <button type="button" className={`companion-session-continue${isResuming ? ' is-prominent' : ''}`} disabled={disabled}
        onClick={() => continueWith('想接着这件事一起做，请先找回上次的起点。')}>接着这里<ArrowUpRight size={15} aria-hidden="true" /></button>}
      {projection.controls.canHold && <button type="button" className="companion-session-hold" disabled={disabled}
        onClick={() => continueWith('先暂停这次一起做的事，保留刚才的起点。')}>先放一放</button>}
    </footer>}
    {projection.history && projection.historySource && <footer className="companion-session-actions">
      <button type="button" className="companion-session-hold" disabled={disabled}
        onClick={() => continueWith('我想从这页当时留住的位置接着聊，请先回读现在的事项，再一起看下一步。')}>
        从当时这里接着聊<ArrowUpRight size={15} aria-hidden="true" />
      </button>
    </footer>}
    </div>
    {readingTarget && <aside className="companion-session-source" id={sourceId} tabIndex={-1} ref={sourcePanel}
      aria-label={original?.title || '打开原来的材料'} aria-busy={opening}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSource(); } }}>
      <header><div><span>{original?.origin === 'user_statement' ? '你当时写的' : original?.origin === 'assistant_history' ? '当时的讲解' : '原资料'}</span>
        {original && <h5>{original.title}{original.page ? ` · 第 ${original.page} 页` : ''}</h5>}</div>
        <button type="button" className="companion-session-source-close" aria-label="收起原文，回到停点" onClick={closeSource}><X size={16} aria-hidden="true" /></button>
      </header>
      {opening && <div className="companion-session-source-loading" role="status"><LoaderCircle size={17} aria-hidden="true" />正在打开原文…</div>}
      {sourceError && <div className="companion-session-source-error"><p role="alert">{sourceError}</p>
        <button type="button" onClick={() => void openSource(readingTarget)}>重新打开</button></div>}
      {original && <>
        <div className="companion-session-source-body">
          {original.image && <img src={original.image.dataUrl} width={original.image.width} height={original.image.height} alt={`${original.title}${original.page ? `第${original.page}页` : ''}原页`} />}
          {original.text && <pre>{original.text}</pre>}
        </div>
        <footer>
          <button type="button" disabled={disabled} onClick={() => continueWith('想围绕刚打开的这段原材料继续。', readingTarget)}>从这段接着<ArrowUpRight size={14} aria-hidden="true" /></button>
          {original.document && onOpenDocument && <button type="button" onClick={() => onOpenDocument(original.document!)}>打开完整资料</button>}
        </footer>
      </>}
    </aside>}
    </div>
  </section>;
}
