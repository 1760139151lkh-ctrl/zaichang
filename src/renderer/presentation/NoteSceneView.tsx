import { useContext, useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { NoteHistoryReference, NoteNativeBridge, NoteNativeInput, NoteReference, NoteScene } from '../../shared/note-presentation';
import { ConversationTextFocusContext } from '../ConversationTextFocus';
import { LocalTextFocus } from '../LocalTextFocus';
import { RichText } from '../RichText';
import { DEFAULT_TIME_ZONE, formatDateTime } from '../time';
import { uiError } from '../ui';
import './note-scene.css';

export interface NoteFollowup { text: string; noteReference?: NoteReference; focusOnly?: boolean; focusLabel?: string }

export function NoteSceneView({ scene, sessionId, messageId, boundaryKey, api, onFollowup, onOpenNote, timeZone = DEFAULT_TIME_ZONE }: {
  scene: NoteScene | NoteHistoryReference; sessionId: string; messageId?: string; boundaryKey: string;
  api: NoteNativeBridge; onFollowup?: (value: NoteFollowup) => void; onOpenNote?: (input: NoteNativeInput) => void;
  timeZone?: string;
}) {
  const key = `${sessionId}:${messageId || ''}:${scene.id}@${scene.revision}:${boundaryKey}`;
  const generation = useRef(0), liveKey = useRef(key); liveKey.current = key;
  const [open, setOpen] = useState(scene.kind === 'note'), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [loaded, setLoaded] = useState<{ key: string; scene: NoteScene }>();
  const selected = useContext(ConversationTextFocusContext).noteReference;
  const current = scene.kind === 'note' && scene.sourceBoundary === boundaryKey ? scene : loaded?.key === key ? loaded.scene : undefined;
  const address = (): NoteNativeInput | undefined => messageId ? { sessionId, messageId, sceneId: scene.id, sceneRevision: scene.revision } : undefined;
  async function show() {
    const input = address(); if (!input) return;
    const request = ++generation.current, expectedKey = key;
    setOpen(true); setPending(true); setError(''); setLoaded(undefined);
    try {
      const next = await api.noteProject(input);
      if (request === generation.current && liveKey.current === expectedKey) setLoaded({ key: expectedKey, scene: next });
    } catch (problem) {
      if (request === generation.current && liveKey.current === expectedKey) setError(uiError(problem));
    } finally { if (request === generation.current && liveKey.current === expectedKey) setPending(false); }
  }
  useEffect(() => {
    generation.current++; setLoaded(undefined); setPending(false); setError(''); setOpen(scene.kind === 'note');
    if (scene.kind === 'note' && scene.sourceBoundary !== boundaryKey) void show();
    return () => { generation.current++; };
  }, [key]);
  const activeRange = current && selected && !selected.intent && selected.messageId === messageId && selected.sceneId === scene.id
    && selected.sceneRevision === scene.revision && selected.noteId === current.proof.id && selected.revision === current.proof.revision
    && selected.start >= current.proof.start && selected.end <= current.proof.end
    ? { start: selected.start - current.proof.start, end: selected.end - current.proof.start } : undefined;

  return <div className="note-reading-scene">
    {scene.kind === 'note_reference' && <button className="note-reading-history" type="button" disabled={!messageId || pending}
      aria-expanded={open} onClick={() => { if (open) { generation.current++; setOpen(false); setLoaded(undefined); } else void show(); }}>
      {scene.label}<ArrowUpRight size={13} aria-hidden="true" /></button>}
    {open && <>{current && <article className="note-reading-paper" aria-label={`笔记原文：${current.title}`}
      data-note-id={current.proof.id} data-note-revision={current.proof.revision} data-note-sha256={current.proof.sha256}
      data-note-start={current.proof.start} data-note-end={current.proof.end}
      data-note-scene-id={scene.id} data-note-scene-revision={scene.revision}>
      <header className="note-reading-heading"><div className="note-reading-meta"><span>笔记原文</span>
        <time dateTime={current.updatedAt}>{formatDateTime(current.updatedAt, timeZone)}</time></div>
        <h3>{current.title}</h3></header>
      {current.body ? <LocalTextFocus key={`${key}:${current.proof.start}:${current.proof.end}`} source={current.body}
        label="笔记中的这一句" disabled={!onFollowup || !messageId || pending} activeRange={activeRange}
        onFocus={range => {
          if (!messageId) return;
          const preview = Array.from(range.preview), short = preview.slice(0, 64).join('') + (preview.length > 64 ? '…' : '');
          onFollowup?.({ text: '', focusLabel: `笔记里：「${short}」`, noteReference: {
            messageId, sceneId: scene.id, sceneRevision: scene.revision, noteId: current.proof.id, revision: current.proof.revision,
            start: current.proof.start + range.start, end: current.proof.start + range.end } });
        }}><div className="note-reading-body markdown"><RichText text={current.body} sourceFocus /></div></LocalTextFocus>
        : <p className="note-reading-empty">这一页还没有正文。</p>}
      <footer className="note-reading-footer"><button type="button" disabled={!onOpenNote || !messageId || pending}
        onClick={() => { const input = address(); if (input) onOpenNote?.(input); }}>打开原笔记<ArrowUpRight size={13} aria-hidden="true" /></button>
        <span className="note-reading-coverage">{current.coverage.start > 0 && <span>前面还有原文</span>}
          {current.coverage.hasMore && <button type="button" disabled={!onFollowup || !messageId || pending} onClick={() => {
            if (!messageId) return;
            onFollowup?.({ text: '接着读这页笔记后面的内容。', focusLabel: `接着「${current.title}」`, noteReference: {
              messageId, sceneId: scene.id, sceneRevision: scene.revision, noteId: current.proof.id, revision: current.proof.revision,
              start: current.proof.end, end: current.proof.end, intent: 'continue_reading' } });
          }}>接着读后面<ArrowUpRight size={13} aria-hidden="true" /></button>}</span></footer>
    </article>}
      {pending && <p className="note-reading-status" role="status">翻回原来那页…</p>}
      {error && <div className="note-reading-status" role="status"><p>{error}</p><button type="button" onClick={() => void show()}>再翻开看看</button></div>}</>}
  </div>;
}
