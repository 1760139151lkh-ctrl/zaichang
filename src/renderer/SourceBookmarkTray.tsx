import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Bookmark, FileText, MessageCircle, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SOURCE_BOOKMARK_MIME, sourceBookmarkAddress, sourceBookmarkReferenceSchema, type SourceBookmarkPreview,
  type SourceBookmarkReference } from '../shared/source-bookmark';
import { uiError } from './ui';
import { RichText } from './RichText';
import './source-bookmark.css';

export interface StudyBookmarkDestination {
  sessionId: string;
  studyId: string;
  messageId?: string;
}
export interface BookmarkTarget {
  key: string;
  label: string;
  location?: StudyBookmarkDestination;
  preview: (reference: SourceBookmarkReference) => Promise<SourceBookmarkPreview>;
  accept: (reference: SourceBookmarkReference) => Promise<void>;
}
interface BookmarkTray {
  pick: (reference: SourceBookmarkReference) => Promise<void>;
  offer: (reference: SourceBookmarkReference, key: string) => Promise<void>;
  register: (target: BookmarkTarget) => () => void;
  stage: (reference: SourceBookmarkReference) => void;
  release: (reference: SourceBookmarkReference) => void;
  getInteractionVersion: () => number | undefined;
}
const BookmarkTrayContext = createContext<BookmarkTray | undefined>(undefined);
export const useBookmarkTray = () => useContext(BookmarkTrayContext);
export function readBookmarkTransfer(transfer: DataTransfer): SourceBookmarkReference | undefined {
  const raw = transfer.getData(SOURCE_BOOKMARK_MIME);
  if (!raw || raw.length > 5000) return;
  try { const value = sourceBookmarkReferenceSchema.safeParse(JSON.parse(raw)); return value.success ? value.data : undefined; }
  catch { return; }
}
export function writeBookmarkTransfer(transfer: DataTransfer, reference: SourceBookmarkReference) {
  // Pending-file bearer tickets stay in this renderer's live hand-off, never
  // in a drag payload another application could receive.
  transfer.clearData();
  transfer.setData(SOURCE_BOOKMARK_MIME, JSON.stringify(sourceBookmarkAddress(reference))); transfer.effectAllowed = 'copy';
}

/** Only the small paper currently in the hand lives here. Material, notebook,
 * and study truth remain in their original owners; closing drops this address. */
export function SourceBookmarkProvider({ boundaryKey, onDiscuss, onOpenNote, onOpenStudy, getInteractionVersion, children }: {
  boundaryKey: string;
  onDiscuss: (reference: SourceBookmarkReference) => boolean | Promise<boolean>;
  onOpenNote?: (id: string, revision: number) => void;
  onOpenStudy?: (location: StudyBookmarkDestination) => void;
  getInteractionVersion?: () => number;
  children: ReactNode;
}) {
  const targets = useRef(new Map<string, BookmarkTarget>());
  const staged = useRef<SourceBookmarkReference | undefined>(undefined);
  const sameAddress = (left: SourceBookmarkReference, right: SourceBookmarkReference) =>
    JSON.stringify(sourceBookmarkAddress(left)) === JSON.stringify(sourceBookmarkAddress(right));
  const [targetRevision, changed] = useState(0), [loadedPaper, setPaper] = useState<SourceBookmarkPreview>();
  const liveBoundary = useRef(boundaryKey); liveBoundary.current = boundaryKey;
  const paperBoundary = useRef(boundaryKey);
  const paper = paperBoundary.current === boundaryKey ? loadedPaper : undefined;
  const [destination, setDestination] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const previewTarget = useRef<BookmarkTarget | undefined>(undefined);
  const operation = useRef(0), returnFocus = useRef<HTMLElement | null>(null), tray = useRef<HTMLElement>(null);
  const onDiscussRef = useRef(onDiscuss); onDiscussRef.current = onDiscuss;
  const interactionVersion = useRef(getInteractionVersion); interactionVersion.current = getInteractionVersion;
  const clear = useCallback((restoreFocus = true) => {
    operation.current++; setPaper(undefined); setDestination(undefined); setError(''); setBusy(false);
    staged.current = undefined; previewTarget.current = undefined;
    const request = operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    if (restoreFocus) requestAnimationFrame(() => {
      if (request === operation.current && boundary === liveBoundary.current
        && interaction === interactionVersion.current?.() && returnFocus.current?.isConnected)
        returnFocus.current.focus({ preventScroll: true });
    });
  }, []);
  useEffect(() => { clear(false); }, [boundaryKey, clear]);
  useEffect(() => () => { operation.current++; }, []);
  const register = useCallback((target: BookmarkTarget) => {
    targets.current.set(target.key, target); changed(value => value + 1);
    return () => { if (targets.current.get(target.key) === target) { targets.current.delete(target.key); changed(value => value + 1); } };
  }, []);
  const stage = useCallback((reference: SourceBookmarkReference) => { staged.current = reference; }, []);
  const release = useCallback((reference: SourceBookmarkReference) => {
    if (staged.current && sameAddress(staged.current, reference)) staged.current = undefined;
  }, []);
  const offer = useCallback(async (reference: SourceBookmarkReference, key?: string) => {
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && interaction === interactionVersion.current?.();
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(true); setError(''); setDestination(key); setPaper(undefined); previewTarget.current = undefined;
    try {
      const source = staged.current && sameAddress(staged.current, reference) ? staged.current : reference;
      const target = key && !['chat', 'note'].includes(key) ? targets.current.get(key) : undefined;
      if (key && !['chat', 'note'].includes(key) && !target) throw new Error('这张推导纸刚收起来了，可以把这一段先留在对话或笔记里。');
      const preview = target ? await target.preview(source) : await window.zaichang.sourceBookmarkPreview(source);
      if (!current()) return;
      paperBoundary.current = boundary;
      previewTarget.current = target; setPaper(preview);
      requestAnimationFrame(() => { if (current()) tray.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); });
    } catch (problem) { if (current()) setError(uiError(problem)); }
    finally { if (owns()) setBusy(false); }
  }, []);
  const pick = useCallback((reference: SourceBookmarkReference) => offer(reference), [offer]);
  const getCurrentInteractionVersion = useCallback(() => interactionVersion.current?.(), []);
  const value = useMemo(() => ({ register, pick, offer, stage, release, getInteractionVersion: getCurrentInteractionVersion }),
    [register, pick, offer, stage, release, getCurrentInteractionVersion]);
  const choose = async (key: string) => {
    if (!paper || busy) return;
    if (key === 'note' || key === 'chat') { previewTarget.current = undefined; setDestination(key); setError(''); return; }
    await offer(paper.reference, key);
  };
  const accept = async () => {
    if (!paper || !destination || busy) return;
    const request = ++operation.current, reference = paper.reference, boundary = liveBoundary.current,
      interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && interaction === interactionVersion.current?.();
    let accepted = false;
    setBusy(true); setError('');
    try {
      if (destination === 'chat') { if (!await onDiscussRef.current(reference)) return; accepted = true; }
      else if (destination === 'note') {
        const result = await window.zaichang.sourceBookmarkKeep({ bookmark: reference });
        if (result.status !== 'saved') throw new Error('这页笔记刚在别处改过，原来的文字还在。');
        accepted = true;
        if (current()) onOpenNote?.(result.note.id, result.note.revision);
      } else {
        const target = targets.current.get(destination);
        if (!target) throw new Error('这张推导纸刚收起来了，原文仍在，可以重新打开再放。');
        if (target !== previewTarget.current) throw new Error('这张推导纸又往下写了一步，重新选一下它，就能看着现在的位置放。');
        await target.accept(reference);
        accepted = true;
        if (current() && target.location) onOpenStudy?.(target.location);
      }
    } catch (problem) { if (current()) setError(uiError(problem)); }
    finally {
      // A real acceptance is finished even when a later gesture vetoes only
      // its navigation. Retire this paper without focus or duplicate writes.
      if (accepted && owns()) clear(false);
      else if (owns()) setBusy(false);
    }
  };
  const studyTargets = useMemo(() => [...targets.current.values()], [targetRevision]);
  return <BookmarkTrayContext.Provider value={value}>{children}
    {(paper || error || busy) && createPortal(<aside ref={tray} className="source-bookmark-tray" aria-label="桌边书签托盘"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); clear(); } }}>
      <header><Bookmark size={16} aria-hidden="true" /><strong>书签夹</strong><button type="button" className="icon-button" aria-label="放回原处" onClick={() => clear()}><X size={16} /></button></header>
      {paper && <><div className="source-bookmark-paper" draggable onDragStart={event => { stage(paper.reference); writeBookmarkTransfer(event.dataTransfer, paper.reference); }} onDragEnd={() => release(paper.reference)}>
        <span>{paper.title}{paper.page ? ` · 第 ${paper.page} 页` : ''}</span><blockquote><RichText text={paper.text} /></blockquote></div>
        <div className="source-bookmark-destinations" role="group" aria-label="把这一段放在哪里">
          {studyTargets.map(target => <button type="button" key={target.key} aria-pressed={destination === target.key} disabled={busy} onClick={() => void choose(target.key)}><BookOpen size={16} />{studyTargets.length > 1 ? target.label : '推导纸'}</button>)}
          <button type="button" aria-pressed={destination === 'note'} disabled={busy} onClick={() => void choose('note')}><FileText size={16} />笔记</button>
          <button type="button" aria-pressed={destination === 'chat'} disabled={busy} onClick={() => void choose('chat')}><MessageCircle size={16} />对话</button>
        </div>
        {destination && <footer><span>{destination === 'note' ? '留下新的一页' : destination === 'chat' ? '放到刚才那句话旁' : '放在这道题旁'}</span>
          <button type="button" className="text-button" disabled={busy} onClick={() => clear()}>放回</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void accept()}>{busy ? '接过来…' : '收下'}</button></footer>}
      </>}
      {error && <p role="status">{error}</p>}{busy && !paper && <p role="status">翻回这一段原文…</p>}
    </aside>, document.body)}
  </BookmarkTrayContext.Provider>;
}
