import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { rehearsalFollowup, type RehearsalInteraction, type RehearsalView } from '../../shared/relationship-rehearsal';
import { RichText } from '../RichText';
import { uiError } from '../ui';
import './rehearsal.css';

export interface RehearsalFollowup {
  text: string;
  rehearsalInteraction: RehearsalInteraction;
  focusOnly?: boolean;
  focusLabel?: string;
}

/** One paper from the original Work owner. These are practice turns, not an
 * inbox from another person; a gesture only returns to the main composer. */
export function RehearsalMessage({ view, onFollowup, disabled = false }: {
  view: RehearsalView;
  onFollowup?: (value: RehearsalFollowup) => void;
  disabled?: boolean;
}) {
  const headingId = useId(), root = useRef<HTMLElement>(null);
  const previous = useRef<{ owner: string; positions: Map<string, number> } | undefined>(undefined);
  const [copied, setCopied] = useState<string>(), [copyError, setCopyError] = useState('');
  const current = view.state === 'active', unavailable = disabled || !onFollowup;
  const expressionKey = view.expression ? `${view.expression.optionId}@${view.expression.revision}` : '';
  const continueWith = (kind: RehearsalInteraction['kind'], text?: string) => {
    if (unavailable) return;
    onFollowup?.({ ...rehearsalFollowup(view, kind), ...(text === undefined ? {} : { text }), focusLabel: '接着这段试说' });
  };

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const rows = [...node.querySelectorAll<HTMLElement>('[data-turn-id]')], positions = new Map(rows.map(row =>
      [row.dataset.turnId!, row.offsetTop]));
    const prior = previous.current;
    previous.current = { owner: view.id, positions };
    if (document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animations: Animation[] = [];
    let arriving = 0;
    for (const row of rows) {
      const old = prior?.owner === view.id ? prior.positions.get(row.dataset.turnId!) : undefined;
      if (old === undefined) {
        animations.push(row.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 260, delay: Math.min(arriving++ * 65, 195), easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'backwards' }));
      } else if (old !== row.offsetTop) {
        animations.push(row.animate([{ transform: `translateY(${old - row.offsetTop}px)` }, { transform: 'translateY(0)' }],
          { duration: 240, easing: 'cubic-bezier(.2,.65,.25,1)' }));
      }
    }
    return () => animations.forEach(animation => animation.cancel());
  }, [view.id, view.revision, view.turns]);

  return <section className="rehearsal-message" ref={root} data-rehearsal-id={view.id} data-rehearsal-state={view.state}>
    <article className="rehearsal-paper" aria-labelledby={headingId}>
      <header className="rehearsal-heading">
        <span className="rehearsal-caption">{current ? '先试着说' : '留在这里的一段试说'}</span>
        <h3 id={headingId}>{view.intention}</h3>
      </header>
      {!!view.boundaries.length && <details className="rehearsal-boundaries">
        <summary>想守住的意思</summary>
        {view.boundaries.map((boundary, index) => <p key={index}>{boundary}</p>)}
      </details>}
      {view.coverage.nextOffset !== null && <button className="rehearsal-earlier" type="button" disabled={unavailable}
        onClick={() => continueWith('utterance', '先回看这段试说前面的几句。')}>前面的几句<ArrowUpRight size={12} aria-hidden="true" /></button>}
      <div className="rehearsal-dialogue">
        {view.turns.map(turn => <div key={turn.id} className={`rehearsal-turn is-${turn.actor}`} data-turn-id={turn.id}>
          <span className="rehearsal-speaker">{turn.actor === 'you' ? '你' : `${view.counterpart.label}，也许会说`}</span>
          <div className="rehearsal-spoken"><RichText text={turn.text} /></div>
          {current && turn.actor === 'possible_other' && turn.id === view.ref.activeTurnId && <button type="button" className="rehearsal-alternative"
            disabled={unavailable} onClick={() => continueWith('alternative')}>换一种可能<ArrowUpRight size={13} aria-hidden="true" /></button>}
        </div>)}
      </div>
      {!view.turns.length && current && <button type="button" className="rehearsal-first-line" disabled={unavailable}
        onClick={() => continueWith('utterance')}>我先试着说一句<ArrowUpRight size={14} aria-hidden="true" /></button>}
      {view.expression && <section className="rehearsal-expression" aria-label="现在想说的">
        <div className="rehearsal-expression-heading"><span>现在想说的</span><button type="button" disabled={disabled}
          onClick={() => {
            const key = expressionKey; setCopyError('');
            void window.zaichang.copyText(view.expression!.text).then(() => setCopied(key)).catch(error => setCopyError(uiError(error)));
          }}>{copied === expressionKey ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied === expressionKey ? '已复制' : '复制这段'}</button></div>
        <div className="rehearsal-expression-copy"><RichText text={view.expression.text} /></div>
        {copyError && <p role="status" className="rehearsal-copy-error">{copyError}</p>}
      </section>}
      <footer className="rehearsal-actions">
        {current ? <><button type="button" className="rehearsal-collect" disabled={unavailable}
          onClick={() => continueWith('collect')}>{view.expression ? '再换一下说法' : '先整理成一句'}<ArrowUpRight size={14} aria-hidden="true" /></button>
          <button type="button" disabled={unavailable} onClick={() => continueWith('pause')}>先停在这里</button></>
          : <>{view.expression && <button type="button" className="rehearsal-collect" disabled={unavailable}
              onClick={() => continueWith('collect')}>再换一下说法<ArrowUpRight size={14} aria-hidden="true" /></button>}
            <button type="button" disabled={unavailable}
              onClick={() => continueWith('resume')}>接着试一试<ArrowUpRight size={14} aria-hidden="true" /></button></>}
      </footer>
    </article>
    {view.aside && <div className="rehearsal-aside"><RichText text={view.aside} /></div>}
  </section>;
}
