import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Bookmark, X } from 'lucide-react';
import type { Message } from '../shared/types';
import type { SourceBookmarkReference } from '../shared/source-bookmark';
import { useBookmarkTray, writeBookmarkTransfer } from './SourceBookmarkTray';
import './source-bookmark.css';

type Range = { start: number; end: number };
function useMessageBookmark(message: Message, selected?: Range) {
  const stamp = message.authoredSource;
  const points = Array.from(message.content), original = stamp?.eventId === message.id && stamp.displayStart === 0
    && Number.isInteger(stamp.displayEnd) && stamp.displayEnd >= 0 && stamp.displayEnd <= points.length
    ? points.slice(0, stamp.displayEnd).join('') : message.content;
  const [hash, setHash] = useState<{ content: string; candidate: string; stamp?: string; source: string; value: string }>();
  useEffect(() => {
    let live = true;
    if (!crypto.subtle) return;
    const digest = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, '0')).join('');
    void digest(original).then(async value => {
      // A source correction can retire the original attachment-label map.
      // Fall back to the visible plain original; main still refuses any
      // unproved label/body mixture rather than guessing its source offsets.
      const source = stamp && value !== stamp.sha256 ? message.content : original;
      if (source !== original) value = await digest(source);
      if (live) setHash({ content: message.content, candidate: original, stamp: stamp?.sha256, source, value });
    }).catch(() => { if (live) setHash(undefined); });
    return () => { live = false; };
  }, [original, message.content, stamp?.sha256]);
  const length = Array.from(hash?.source || original).length, range = selected || { start: 0, end: length };
  return hash?.content === message.content && hash.candidate === original && hash.stamp === stamp?.sha256
    && message.role === 'user' && message.retention !== 'session_only' && range.end > range.start
    && range.end - range.start <= 4000 && range.end <= length ? { kind: 'conversation', reference: {
      sessionId: message.sessionId, messageId: message.id, sha256: hash.value, start: range.start, end: range.end,
      // Only the native owner signs the current source version at preview.
    } } as SourceBookmarkReference : undefined;
}

/** The button can also live beside an existing original-message action row.
 * Its whole-message default uses the owner's plain original, never DOM math. */
export function MessageBookmarkButton({ message, range, onNeedExcerpt }: {
  message: Message; range?: Range; onNeedExcerpt?: () => void;
}) {
  const tray = useBookmarkTray(), reference = useMessageBookmark(message, range);
  const stamp = message.authoredSource;
  if (!tray || message.role !== 'user' || message.retention === 'session_only' || !message.content.trim()
    || stamp?.eventId === message.id && stamp.displayStart === 0 && stamp.displayEnd === 0) return null;
  return <button type="button" className="message-bookmark-button" draggable={!!reference}
    aria-label={range ? '拿起选中的这句原话' : '把这句原话拿到纸边'} title="拿到推导纸或笔记旁"
    onPointerDown={event => event.preventDefault()}
    onClick={() => reference ? void tray.pick(reference) : onNeedExcerpt?.()}
    onDragStart={event => { if (reference) writeBookmarkTransfer(event.dataTransfer, reference); else event.preventDefault(); }}>
    <Bookmark size={14} aria-hidden="true" /><span>{range ? '拿起这一段' : '放到纸边'}</span>
  </button>;
}

/** User-message bodies are currently plain text. We invert a selection only
 * when its entire DOM still equals that exact original; changed rendering
 * cannot be quietly assigned guessed Unicode coordinates. */
export function MessageBookmarkSource({ message }: { message: Message }) {
  const body = useRef<HTMLDivElement>(null), textarea = useRef<HTMLTextAreaElement>(null), tray = useBookmarkTray();
  const [selected, setSelected] = useState<{ content: string; range: Range }>(), [excerptOpen, setExcerptOpen] = useState(false);
  const range = selected?.content === message.content ? selected.range : undefined;
  const reference = useMessageBookmark(message, range);
  const capture = () => {
    const selection = window.getSelection(), root = body.current;
    if (!root || root.textContent !== message.content || !selection?.rangeCount || selection.isCollapsed) { setSelected(undefined); return; }
    const value = selection.getRangeAt(0);
    if (!root.contains(value.startContainer) || !root.contains(value.endContainer)) { setSelected(undefined); return; }
    const before = value.cloneRange(); before.selectNodeContents(root); before.setEnd(value.startContainer, value.startOffset);
    const start = Array.from(before.toString()).length, length = Array.from(value.toString()).length;
    if (!length || length > 4000) { setSelected(undefined); return; }
    const chosen = { start, end: start + length }; setSelected({ content: message.content, range: chosen }); return chosen;
  };
  const startTransfer = (event: DragEvent<HTMLDivElement>) => {
    const chosen = capture();
    // The native drag starts after pointer selection. If the browser starts
    // before that render, take the already-hashed same-message address and
    // replace only its proven current range.
    if (!reference || reference.kind !== 'conversation' || !chosen) { event.preventDefault(); return; }
    writeBookmarkTransfer(event.dataTransfer, { ...reference, reference: { ...reference.reference, ...chosen } });
  };
  const chooseNativeRange = (control: HTMLTextAreaElement) => {
    const start = Array.from(message.content.slice(0, control.selectionStart)).length,
      end = Array.from(message.content.slice(0, control.selectionEnd)).length;
    setSelected(end > start && end - start <= 4000 ? { content: message.content, range: { start, end } } : undefined);
  };
  return <div className={`message-bookmark-source${range ? ' has-selection' : ''}`}>
    <div className="user-message-text" ref={body} onPointerUp={capture} onKeyUp={capture} onDragStart={startTransfer}>{message.content}</div>
    <MessageBookmarkButton message={message} range={range} onNeedExcerpt={() => {
      setExcerptOpen(true); requestAnimationFrame(() => textarea.current?.focus());
    }} />
    {excerptOpen && <div className="message-bookmark-excerpt" aria-label="从原话摘一段" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setExcerptOpen(false); }
    }}><header><span>从原话摘一段</span><button type="button" className="icon-button" aria-label="收起原话选段" onClick={() => setExcerptOpen(false)}><X size={14} /></button></header>
      <textarea ref={textarea} readOnly value={message.content} aria-label="原话，只选择这一处" onSelect={event => chooseNativeRange(event.currentTarget)} />
      <button type="button" className="text-button" disabled={!reference} onClick={() => { if (reference) void tray?.pick(reference); }}>拿起选段</button>
    </div>}
  </div>;
}
