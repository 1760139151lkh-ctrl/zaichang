import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { RehearsalHistoryReference, RehearsalNativeBridge, RehearsalScene } from '../../shared/relationship-rehearsal';
import { RehearsalMessage, type RehearsalFollowup } from './RehearsalMessage';
import { uiError } from '../ui';

/** A current factory body can open directly; old conversation addresses only
 * unfold after the original Work owner has been read again. */
export function RehearsalSceneView({ scene, sessionId, messageId, boundaryKey, presentationRevision, api, onFollowup }: {
  scene: RehearsalScene | RehearsalHistoryReference;
  sessionId: string;
  messageId?: string;
  boundaryKey: string;
  presentationRevision?: number;
  api: RehearsalNativeBridge;
  onFollowup?: (value: RehearsalFollowup) => void;
}) {
  const key = `${sessionId}:${messageId || ''}:${scene.id}@${scene.revision}:${presentationRevision || scene.revision}:${boundaryKey}`;
  const generation = useRef(0), liveKey = useRef(key); liveKey.current = key;
  const focused = useRef<string | undefined>(undefined);
  const [open, setOpen] = useState(scene.kind === 'rehearsal');
  const [loaded, setLoaded] = useState<{ key: string; scene: RehearsalScene }>();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const rawCurrent = scene.kind === 'rehearsal' && scene.sourceBoundary === boundaryKey;
  const current: RehearsalScene | undefined = scene.kind === 'rehearsal' && rawCurrent ? scene : loaded?.key === key ? loaded.scene : undefined;
  const show = useCallback(async () => {
    if (!messageId) return;
    const request = ++generation.current, expectedKey = key;
    setOpen(true); setPending(true); setLoaded(undefined); setError('');
    try {
      const next = await api.rehearsalProject({ sessionId, messageId, id: scene.id, sceneRevision: scene.revision });
      if (generation.current === request && liveKey.current === expectedKey) setLoaded({ key: expectedKey, scene: next });
    } catch (problem) {
      if (generation.current === request && liveKey.current === expectedKey) setError(uiError(problem));
    } finally {
      if (generation.current === request && liveKey.current === expectedKey) setPending(false);
    }
  }, [api, key, messageId, scene.id, scene.revision, sessionId]);
  useEffect(() => {
    generation.current++; setLoaded(undefined); setPending(false); setError(''); setOpen(scene.kind === 'rehearsal');
    if (scene.kind === 'rehearsal' && !rawCurrent && messageId) void show();
    return () => { generation.current++; };
  }, [key, rawCurrent, scene.kind, messageId, show]);
  useEffect(() => {
    if (!open || !current || !onFollowup) return;
    const kind = current.state === 'active' ? 'utterance' : current.state === 'held' && current.expression ? 'collect' : undefined;
    if (!kind) return;
    const focusKey = `${current.id}@${current.revision}:${boundaryKey}:${kind}`;
    if (focused.current === focusKey) return;
    focused.current = focusKey;
    onFollowup({ text: '', rehearsalInteraction: { kind, ref: current.ref }, focusOnly: true,
      focusLabel: kind === 'collect' ? '接着这句说法' : '接着这段试说' });
  }, [boundaryKey, current, onFollowup, open]);

  return <div className="rehearsal-scene">
    {scene.kind === 'rehearsal_reference' && <button type="button" className="rehearsal-history-open" aria-expanded={open}
      disabled={!messageId || pending} onClick={() => {
        if (open) { generation.current++; setOpen(false); setLoaded(undefined); setError(''); }
        else void show();
      }}>{scene.label}<ArrowUpRight size={14} aria-hidden="true" /></button>}
    {open && <>{current && <RehearsalMessage view={current} onFollowup={onFollowup} disabled={pending} />}
      {pending && <p className="rehearsal-read-status" role="status">接回刚才那一段…</p>}
      {error && <div className="rehearsal-read-status" role="status"><p>{error}</p><button type="button" onClick={() => void show()}>再打开看看</button></div>}</>}
  </div>;
}
