import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Bridge, Message } from '../shared/types';
import type { PreparationView } from '../shared/presentation';
import type { LetterFocusContext } from '../shared/reflective-letter';
import { LetterMessage } from './LetterMessage';
import { uiError } from './ui';
import './letter.css';

export type LetterHistoryReference = NonNullable<Message['helpRefs']>[number];

/** A folded address in the original message. Each opening asks the same
 * letter owner again; local closing neither rewrites nor reoffers its help. */
export function LetterHistoryCard({ reference, sessionId, messageId, boundaryKey, onContinue,
  api = window.zaichang }: {
  reference: LetterHistoryReference;
  sessionId: string;
  messageId: string;
  boundaryKey: string;
  onContinue: (text: string, context?: LetterFocusContext) => void;
  api?: Pick<Bridge, 'letterProject'>;
}) {
  const headingId = useId(), generation = useRef(0);
  const key = `${sessionId}:${messageId}:${reference.id}@${reference.revision}:${reference.helpRecordId}:${boundaryKey}`;
  const liveKey = useRef(key); liveKey.current = key;
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [loaded, setLoaded] = useState<{ key: string; value: PreparationView }>();
  const current = loaded?.key === key ? loaded.value : undefined;
  useEffect(() => {
    generation.current++; setOpen(false); setLoaded(undefined); setPending(false); setError('');
    return () => { generation.current++; };
  }, [key]);
  const close = () => {
    generation.current++; setOpen(false); setLoaded(undefined); setPending(false); setError('');
  };
  const show = async () => {
    const request = ++generation.current, expectedKey = key;
    setOpen(true); setPending(true); setError(''); setLoaded(undefined);
    try {
      const value = await api.letterProject({ sessionId, messageId, ref: {
        id: reference.id, revision: reference.revision, helpRecordId: reference.helpRecordId,
      } });
      if (request === generation.current && expectedKey === liveKey.current) setLoaded({ key: expectedKey, value });
    } catch (problem) {
      if (request === generation.current && expectedKey === liveKey.current) setError(uiError(problem));
    } finally {
      if (request === generation.current && expectedKey === liveKey.current) setPending(false);
    }
  };
  return <section className="letter-history" aria-labelledby={headingId}>
    <button type="button" className="letter-history-trigger" id={headingId} aria-expanded={open}
      onClick={() => open ? close() : void show()}><span>{current?.title || '那封写给你的信'}</span><ChevronDown size={14} aria-hidden="true" /></button>
    {open && <div className="letter-history-body">
      {pending && <p className="letter-history-status" role="status">正在翻开…</p>}
      {current?.reflectiveLetter && <LetterMessage letter={current.reflectiveLetter}
        onContinue={onContinue} onDismiss={close} />}
      {error && <div className="letter-history-status" role="status"><p>{error}</p><button type="button" onClick={() => void show()}>再翻开看看</button></div>}
    </div>}
  </section>;
}
