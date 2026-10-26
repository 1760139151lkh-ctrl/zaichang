import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FileText, MessageCircle, Quote, X } from 'lucide-react';
import type { Message } from '../shared/types';
import type { SourceBookmarkReference } from '../shared/source-bookmark';
import { useBookmarkTray, writeBookmarkTransfer } from './SourceBookmarkTray';
import './source-bookmark.css';
import './keep-note-actions.css';

type Range = { start: number; end: number };
/** Display projection only. Bookmark qualification still receives the full
 * original Message and its host stamp, never a rewritten message body. */
export function authoredMessageContent(message: Message) {
  const stamp = message.authoredSource, points = Array.from(message.content);
  return message.role === 'user' && stamp?.eventId === message.id && stamp.displayStart === 0
    && Number.isInteger(stamp.displayEnd) && stamp.displayEnd >= 0 && stamp.displayEnd <= points.length
    ? points.slice(0, stamp.displayEnd).join('') : message.content;
}
function useMessageBookmark(message: Message, selected?: Range) {
  const stamp = message.authoredSource;
  const original = authoredMessageContent(message);
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
export function MessageBookmarkButton({ message, range, onNeedExcerpt, source }: {
  message: Message; range?: Range; onNeedExcerpt?: () => void; source?: () => HTMLElement | null;
}) {
  const tray = useBookmarkTray(), reference = useMessageBookmark(message, range);
  const transfer = useRef<SourceBookmarkReference | undefined>(undefined);
  const returnSource = (button: HTMLElement) => source?.()
    || button.closest('[data-message-id]')?.querySelector<HTMLElement>('.user-message-text');
  const release = () => { if (transfer.current) tray?.release(transfer.current); transfer.current = undefined; };
  useEffect(() => release, [tray]);
  if (!tray || message.role !== 'user' || message.retention === 'session_only' || !authoredMessageContent(message).trim()) return null;
  const canChoose = !!reference || Array.from(authoredMessageContent(message)).length > 4000 && !!onNeedExcerpt;
  return <div className="message-bookmark-actions" role="group" aria-label={range ? '选中原话的操作' : '这条原话的操作'}>
    <button type="button" className="message-bookmark-button" draggable={!!reference} disabled={!canChoose}
    aria-label={range ? '引用选中的这段原话' : '接着聊这条原话'} title="引用到输入框"
    onPointerDown={event => event.preventDefault()}
    onClick={event => reference ? void tray.cite(reference, returnSource(event.currentTarget)) : onNeedExcerpt?.()}
    onDragStart={event => {
      if (!reference) { event.preventDefault(); return; }
      transfer.current = reference; tray.stage(reference, returnSource(event.currentTarget));
      writeBookmarkTransfer(event.dataTransfer, reference);
    }} onDragEnd={release}>
    {range ? <Quote size={14} aria-hidden="true" /> : <MessageCircle size={14} aria-hidden="true" />}<span>{range ? '引用这段' : '接着聊'}</span>
  </button>
    <button type="button" className="message-bookmark-button" disabled={!canChoose} onPointerDown={event => event.preventDefault()}
      onClick={event => reference ? void tray.note(reference, returnSource(event.currentTarget)) : onNeedExcerpt?.()}>
      <FileText size={14} aria-hidden="true" /><span>留作笔记</span>
    </button>
  </div>;
}

/** User-message bodies are currently plain text. We invert a selection only
 * when its entire DOM still equals that exact original; changed rendering
 * cannot be quietly assigned guessed Unicode coordinates. */
export function MessageBookmarkSource({ message }: { message: Message }) {
  const body = useRef<HTMLDivElement>(null), textarea = useRef<HTMLTextAreaElement>(null), tray = useBookmarkTray();
  const transfer = useRef<SourceBookmarkReference | undefined>(undefined);
  const release = () => { if (transfer.current) tray?.release(transfer.current); transfer.current = undefined; };
  useEffect(() => release, [tray]);
  const original = authoredMessageContent(message), stamp = message.authoredSource;
  const stampKey = JSON.stringify([stamp?.eventId, stamp?.contentVersion, stamp?.sha256, stamp?.displayStart, stamp?.displayEnd]);
  const [selected, setSelected] = useState<{ content: string; original: string; stampKey: string; range: Range }>(), [excerptOpen, setExcerptOpen] = useState(false);
  const range = selected?.content === message.content && selected.original === original && selected.stampKey === stampKey ? selected.range : undefined;
  const reference = useMessageBookmark(message, range);
  const capture = () => {
    const selection = window.getSelection(), root = body.current;
    if (!root || root.textContent !== original || !selection?.rangeCount || selection.isCollapsed) { setSelected(undefined); return; }
    const value = selection.getRangeAt(0);
    if (!root.contains(value.startContainer) || !root.contains(value.endContainer)) { setSelected(undefined); return; }
    const before = value.cloneRange(); before.selectNodeContents(root); before.setEnd(value.startContainer, value.startOffset);
    const start = Array.from(before.toString()).length, length = Array.from(value.toString()).length;
    if (!length || length > 4000) { setSelected(undefined); return; }
    const chosen = { start, end: start + length }; setSelected({ content: message.content, original, stampKey, range: chosen }); return chosen;
  };
  const startTransfer = (event: DragEvent<HTMLDivElement>) => {
    const chosen = capture();
    // The native drag starts after pointer selection. If the browser starts
    // before that render, take the already-hashed same-message address and
    // replace only its proven current range.
    if (!reference || reference.kind !== 'conversation' || !chosen) { event.preventDefault(); return; }
    const address = { ...reference, reference: { ...reference.reference, ...chosen } };
    transfer.current = address; tray?.stage(address, body.current);
    writeBookmarkTransfer(event.dataTransfer, address);
  };
  const chooseNativeRange = (control: HTMLTextAreaElement) => {
    const start = Array.from(original.slice(0, control.selectionStart)).length,
      end = Array.from(original.slice(0, control.selectionEnd)).length;
    setSelected(end > start && end - start <= 4000 ? { content: message.content, original, stampKey, range: { start, end } } : undefined);
  };
  return <div className={`message-bookmark-source${range ? ' has-selection' : ''}`}>
    <div className="user-message-text" ref={body} tabIndex={-1} onPointerUp={capture} onKeyUp={capture} onDragStart={startTransfer} onDragEnd={release}>{original}</div>
    <MessageBookmarkButton message={message} range={range} source={() => body.current} onNeedExcerpt={() => {
      setExcerptOpen(true); requestAnimationFrame(() => textarea.current?.focus());
    }} />
    {excerptOpen && <div className="message-bookmark-excerpt" aria-label="从原话摘一段" onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setExcerptOpen(false); }
    }}><header><span>从原话摘一段</span><button type="button" className="icon-button" aria-label="收起原话选段" onClick={() => setExcerptOpen(false)}><X size={14} /></button></header>
      <textarea ref={textarea} readOnly value={original} aria-label="原话，只选择这一处" onSelect={event => chooseNativeRange(event.currentTarget)} />
      <div className="message-bookmark-excerpt-actions">
        <button type="button" className="text-button" disabled={!reference} onClick={() => { if (reference) void tray?.cite(reference, textarea.current); }}>引用这段</button>
        <button type="button" className="text-button" disabled={!reference} onClick={() => { if (reference) void tray?.note(reference, textarea.current); }}>留作笔记</button>
      </div>
    </div>}
  </div>;
}
