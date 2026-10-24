import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bookmark, X } from 'lucide-react';
import { uiError } from './ui';
import './life-continuity.css';

/** The caller reads each real owner and restores it. This view keeps neither
 * a second draft nor a copy of a session, document, proposal, or source. */
export interface ReturnPoint {
  id: string;
  title: string;
  detail?: string;
  excerpt?: string;
  onResume: () => void | Promise<void>;
}
export function ReturnBookmark({ point, onDismiss, disabled = false }: {
  point: ReturnPoint;
  onDismiss?: () => void;
  disabled?: boolean;
}) {
  const [dismissed, setDismissed] = useState<string>(), [opening, setOpening] = useState(false), [error, setError] = useState('');
  const request = useRef(0), activePoint = useRef(point.id);
  activePoint.current = point.id;
  useEffect(() => { request.current++; setOpening(false); setError(''); return () => { request.current++; }; }, [point.id]);
  if (dismissed === point.id) return null;
  return <aside className="return-bookmark" aria-label="上次留在这里的书签">
    <Bookmark className="return-bookmark-mark" size={19} aria-hidden="true" />
    <div className="return-bookmark-copy"><strong>{point.title}</strong>{point.detail && <span>{point.detail}</span>}
      {point.excerpt && <p>{point.excerpt}</p>}
      {error && <span role="status">{error}</span>}
    </div>
    <button type="button" className="return-bookmark-resume" disabled={disabled || opening} onClick={() => {
      const ticket = ++request.current, pointId = point.id;
      setOpening(true); setError('');
      const current = () => ticket === request.current && activePoint.current === pointId;
      void Promise.resolve().then(point.onResume).catch(problem => { if (current()) setError(uiError(problem) || '这次没打开，再试一次。'); })
        .finally(() => { if (current()) setOpening(false); });
    }}>接着这里<ArrowUpRight size={14} aria-hidden="true" /></button>
    <button type="button" className="return-bookmark-dismiss" aria-label="先收起书签" onClick={() => { request.current++; setDismissed(point.id); onDismiss?.(); }}><X size={14} /></button>
  </aside>;
}
