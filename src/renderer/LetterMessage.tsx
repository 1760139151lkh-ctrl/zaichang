import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, X } from 'lucide-react';
import type { LetterFocusContext, ReflectiveLetterSourceView, ReflectiveLetterView } from '../shared/reflective-letter';
import { RichText } from './RichText';
import { LocalTextFocus } from './LocalTextFocus';
import { ConversationTextFocusContext } from './ConversationTextFocus';
import { uiError } from './ui';
import './letter.css';

function period(letter: ReflectiveLetterView) {
  try {
    const { from, before, timeZone } = letter.window;
    const end = new Date(Date.parse(letter.asOf) - (Date.parse(letter.asOf) === Date.parse(before) ? 1 : 0));
    const year = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' });
    const showYear = year.format(new Date(from)) !== year.format(end);
    const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone, ...(showYear ? { year: 'numeric' as const } : {}), month: 'long', day: 'numeric' });
    const startText = formatter.format(new Date(from)), endText = formatter.format(end);
    return startText === endText ? startText : `${startText}—${endText}`;
  } catch { return ''; }
}

/** A reading surface for the original prepared artifact. Body, sources and
 * exposure remain owned by that opportunity; this component keeps only local
 * reading/selection state and never changes a person's memory. */
export function LetterMessage({ letter, pending, onContinue, onDismiss, onOpenSource }: {
  letter: ReflectiveLetterView;
  pending?: boolean;
  onContinue: (text: string, context?: LetterFocusContext) => void;
  onDismiss: () => void | Promise<void>;
  onOpenSource?: () => void;
}) {
  const headingId = useId(), sourceHeadingId = useId();
  const activeReference = useContext(ConversationTextFocusContext).letterReference;
  const [sourcesOpen, setSourcesOpen] = useState(false),
    [source, setSource] = useState<ReflectiveLetterSourceView | null>(null),
    [sourceKey, setSourceKey] = useState(''),
    [sourcePending, setSourcePending] = useState(false),
    [sourceError, setSourceError] = useState(''),
    [closing, setClosing] = useState(false);
  const requestGeneration = useRef(0), paper = useRef<HTMLElement>(null), sourcePanel = useRef<HTMLDivElement>(null);
  const closingMotion = useRef<Animation | null>(null);
  const sourceMotion = useRef<Animation | null>(null);
  const citations = useMemo(() => letter.paragraphs.flatMap((paragraph, paragraphIndex) =>
    paragraph.sources.map((value, sourceIndex) => ({ ...value, paragraphIndex, sourceIndex })))
    .map((value, index) => ({ ...value, number: index + 1, key: `${value.paragraphIndex}:${value.sourceIndex}` })), [letter]);

  useEffect(() => {
    requestGeneration.current++;
    setSource(null); setSourceKey(''); setSourcesOpen(false); setSourcePending(false); setSourceError('');
    return () => { requestGeneration.current++; closingMotion.current?.cancel(); sourceMotion.current?.cancel(); };
  }, [letter.id, letter.revision]);
  useEffect(() => {
    if (!source && !sourceError) return;
    sourcePanel.current?.focus({ preventScroll: true });
    sourcePanel.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [source, sourceError]);

  async function openSource(paragraphIndex: number, sourceIndex: number) {
    const key = `${paragraphIndex}:${sourceIndex}`;
    sourceMotion.current?.cancel(); sourceMotion.current = null;
    const generation = ++requestGeneration.current;
    setSourcesOpen(true);
    if (sourceKey === key && source) return;
    setSourceKey(key); setSource(null); setSourceError(''); setSourcePending(true);
    onOpenSource?.();
    try {
      const value = await window.zaichang.letterSource({ opportunityId: letter.id, expectedRevision: letter.revision,
        paragraphIndex, sourceIndex });
      if (generation === requestGeneration.current) setSource(value);
    } catch (error) {
      if (generation === requestGeneration.current) setSourceError(uiError(error));
    } finally {
      if (generation === requestGeneration.current) setSourcePending(false);
    }
  }

  async function closeSource() {
    const generation = ++requestGeneration.current;
    sourceMotion.current?.cancel(); setSourcePending(false);
    const reduced = document.documentElement.dataset.motion === 'reduced'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motion = !reduced && sourcePanel.current ? sourcePanel.current.animate([
      { opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-3px)' },
    ], { duration: 150, easing: 'ease-in', fill: 'forwards' }) : null;
    sourceMotion.current = motion;
    try {
      if (motion) await motion.finished;
      if (generation === requestGeneration.current) { setSource(null); setSourceError(''); setSourceKey(''); }
    } catch { /* A newer source gesture owns the panel. */ }
    finally { motion?.cancel(); if (sourceMotion.current === motion) sourceMotion.current = null; }
  }

  async function dismiss() {
    if (pending || closing) return;
    setClosing(true);
    const reduced = document.documentElement.dataset.motion === 'reduced'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motion = !reduced && paper.current ? paper.current.animate([
      { opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(4px)' },
    ], { duration: 170, easing: 'ease-in', fill: 'forwards' }) : null;
    closingMotion.current = motion;
    try {
      if (motion) await motion.finished;
      await onDismiss();
    } catch { /* The owning shelf keeps its concrete failure and the letter. */ }
    finally { motion?.cancel(); closingMotion.current = null; setClosing(false); }
  }

  return (
    <article className="letter-message" ref={paper} aria-labelledby={headingId}>
      <header className="letter-heading">
        <div className="letter-dateline"><span>写给你</span><span>{period(letter)}</span></div>
        <h3 id={headingId}>{letter.title}</h3>
      </header>
      <div className="letter-prose">
        {letter.paragraphs.map((paragraph, paragraphIndex) => (
          <div className="letter-paragraph" key={paragraphIndex}>
            <LocalTextFocus key={`${letter.id}@${letter.revision}:${paragraphIndex}`} source={paragraph.text} label="这封信" disabled={!!pending || closing}
              activeRange={activeReference?.opportunityId === letter.id && activeReference.revision === letter.revision
                && 'paragraphIndex' in activeReference && activeReference.paragraphIndex === paragraphIndex ? activeReference : undefined} onFocus={range =>
              onContinue('', { letterReference: { opportunityId: letter.id, revision: letter.revision,
                paragraphIndex, start: range.start, end: range.end },
                focusLabel: `信里：「${Array.from(range.preview).slice(0, 64).join('')}${Array.from(range.preview).length > 64 ? '…' : ''}」` })}>
            <div className="letter-copy markdown"><RichText text={paragraph.text} sourceFocus /></div>
            {!!paragraph.sources.length && (
              <span className="letter-note-markers">
                {citations.filter(citation => citation.paragraphIndex === paragraphIndex).map(citation => (
                  <button key={citation.key} type="button" aria-label={`看第${citation.number}处原话`}
                    aria-expanded={sourcesOpen && sourceKey === citation.key}
                    onClick={() => void openSource(citation.paragraphIndex, citation.sourceIndex)}>{citation.number}</button>
                ))}
              </span>
            )}
            </LocalTextFocus>
          </div>
        ))}
      </div>
      <footer className="letter-footer">
        {!!citations.length && (
          <details className="letter-sources" open={sourcesOpen} onToggle={event => setSourcesOpen(event.currentTarget.open)}>
            <summary>那时的话<ChevronDown size={13} /></summary>
            <div className="letter-source-content">
              <div className="letter-source-index">
                {citations.map(citation => (
                  <button key={citation.key} type="button" aria-pressed={sourceKey === citation.key}
                    onClick={() => void openSource(citation.paragraphIndex, citation.sourceIndex)}>
                    <span>{citation.number}</span>{citation.label}
                  </button>
                ))}
              </div>
              {(source || sourcePending || sourceError) && (
                <div className="letter-source-paper" ref={sourcePanel} tabIndex={-1} aria-labelledby={sourceHeadingId}>
                  <div className="letter-source-heading">
                    <span id={sourceHeadingId}>{source?.heading || '那时的话'}</span>
                    <button type="button" aria-label="收起这段原话" onClick={() => void closeSource()}><X size={13} /></button>
                  </div>
                  {sourcePending && <p role="status">翻回那一页…</p>}
                  {sourceError && <p className="letter-source-error" role="alert">{sourceError}</p>}
                  {source?.excerpts.map((excerpt, index) => (
                    <blockquote key={index} className="letter-original">
                      <div className="markdown"><RichText text={excerpt.text} /></div>
                      {source.excerpts.length > 1 && <cite>{excerpt.label}</cite>}
                    </blockquote>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}
        <div className="letter-actions">
          <button type="button" disabled={pending || closing} onClick={() => onContinue(`接着这封「${letter.title}」，我想说：`, {
            letterReference: { opportunityId: letter.id, revision: letter.revision, scope: 'whole' },
            focusLabel: `这封信：「${letter.title}」`,
          })}>接着聊聊<ArrowUpRight size={13} /></button>
          <button type="button" disabled={pending || closing} onClick={() => void dismiss()}>先收起</button>
        </div>
      </footer>
    </article>
  );
}
