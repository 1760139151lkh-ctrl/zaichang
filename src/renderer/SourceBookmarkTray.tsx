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
  pick: (reference: SourceBookmarkReference, source?: HTMLElement | null) => Promise<void>;
  offer: (reference: SourceBookmarkReference, key: string, source?: HTMLElement | null) => Promise<void>;
  register: (target: BookmarkTarget) => () => void;
  stage: (reference: SourceBookmarkReference, source?: HTMLElement | null) => void;
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

interface BookmarkReturnFocus {
  element: HTMLElement | null;
  input?: { length: number; text: string; start: number; end: number; direction: 'forward' | 'backward' | 'none' };
  passage?: { range: Range; text: string };
}
function bookmarkReturnFocus(source?: HTMLElement | null): BookmarkReturnFocus {
  const element = source || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if ((element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)
    && element.selectionStart !== null && element.selectionEnd !== null)
    return { element, input: { length: element.value.length, text: element.value.slice(element.selectionStart, element.selectionEnd),
      start: element.selectionStart, end: element.selectionEnd,
      direction: element.selectionDirection || 'none' } };
  const selection = window.getSelection();
  const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : undefined;
  return { element, ...(range && (!source || source.contains(range.startContainer) && source.contains(range.endContainer))
    ? { passage: { range, text: range.toString() } } : {}) };
}
function restoreBookmarkFocus(place?: BookmarkReturnFocus) {
  if (!place?.element?.isConnected || !place.element.getClientRects().length) return;
  place.element.focus({ preventScroll: true });
  const { input, passage } = place;
  if (input && (place.element instanceof HTMLTextAreaElement || place.element instanceof HTMLInputElement)
    && place.element.value.length === input.length && place.element.value.slice(input.start, input.end) === input.text)
    place.element.setSelectionRange(input.start, input.end, input.direction);
  if (passage && passage.range.startContainer.isConnected && passage.range.endContainer.isConnected
    && passage.range.toString() === passage.text) {
    const selection = window.getSelection();
    selection?.removeAllRanges(); selection?.addRange(passage.range);
  }
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
  const staged = useRef<SourceBookmarkReference | undefined>(undefined), stagedFocus = useRef<BookmarkReturnFocus | undefined>(undefined);
  const sameAddress = (left: SourceBookmarkReference, right: SourceBookmarkReference) =>
    JSON.stringify(sourceBookmarkAddress(left)) === JSON.stringify(sourceBookmarkAddress(right));
  const [targetRevision, changed] = useState(0), [loadedPaper, setPaper] = useState<SourceBookmarkPreview>();
  const liveBoundary = useRef(boundaryKey); liveBoundary.current = boundaryKey;
  const paperBoundary = useRef(boundaryKey);
  const paper = paperBoundary.current === boundaryKey ? loadedPaper : undefined;
  const [destination, setDestination] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const previewTarget = useRef<BookmarkTarget | undefined>(undefined);
  const operation = useRef(0), returnFocus = useRef<BookmarkReturnFocus | undefined>(undefined), tray = useRef<HTMLElement>(null);
  const carriedReference = useRef<SourceBookmarkReference | undefined>(undefined), committing = useRef<number | undefined>(undefined);
  const [accepting, setAccepting] = useState(false);
  const onDiscussRef = useRef(onDiscuss); onDiscussRef.current = onDiscuss;
  const interactionVersion = useRef(getInteractionVersion); interactionVersion.current = getInteractionVersion;
  const clear = useCallback((restoreFocus = true) => {
    operation.current++; setPaper(undefined); setDestination(undefined); setError(''); setBusy(false); setAccepting(false);
    staged.current = undefined; stagedFocus.current = undefined; previewTarget.current = undefined; carriedReference.current = undefined;
    const focus = returnFocus.current; returnFocus.current = undefined;
    const request = operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    if (restoreFocus) requestAnimationFrame(() => {
      if (request === operation.current && boundary === liveBoundary.current
        && interaction === interactionVersion.current?.()) restoreBookmarkFocus(focus);
    });
  }, []);
  useEffect(() => { clear(false); }, [boundaryKey, clear]);
  useEffect(() => () => { operation.current++; }, []);
  const register = useCallback((target: BookmarkTarget) => {
    targets.current.set(target.key, target); changed(value => value + 1);
    return () => { if (targets.current.get(target.key) === target) { targets.current.delete(target.key); changed(value => value + 1); } };
  }, []);
  const stage = useCallback((reference: SourceBookmarkReference, source?: HTMLElement | null) => {
    staged.current = reference;
    stagedFocus.current = source ? bookmarkReturnFocus(source) : undefined;
  }, []);
  const release = useCallback((reference: SourceBookmarkReference) => {
    if (staged.current && sameAddress(staged.current, reference)) { staged.current = undefined; stagedFocus.current = undefined; }
  }, []);
  const offer = useCallback(async (reference: SourceBookmarkReference, key?: string, sourceElement?: HTMLElement | null) => {
    // 收下 has already crossed from a preview to its owner. A second paper
    // cannot cancel that write or silently replace its eventual receipt.
    if (committing.current) return;
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && interaction === interactionVersion.current?.();
    // Changing the destination is still the same paper in the same hand.
    // Keep the original editor/selection rather than a button in this tray.
    if (!carriedReference.current || !sameAddress(carriedReference.current, reference)) returnFocus.current =
      staged.current && sameAddress(staged.current, reference) && stagedFocus.current || bookmarkReturnFocus(sourceElement);
    carriedReference.current = reference;
    setBusy(true); setError(''); setDestination(key); setPaper(undefined); previewTarget.current = undefined;
    const source = staged.current && sameAddress(staged.current, reference) ? staged.current : reference;
    const target = key && !['chat', 'note'].includes(key) ? targets.current.get(key) : undefined;
    try {
      if (key && !['chat', 'note'].includes(key) && !target) throw new Error('这张推导纸刚收起来了，可以把这一段先留在对话或笔记里。');
      const preview = target ? await target.preview(source) : await window.zaichang.sourceBookmarkPreview(source);
      if (!current()) return;
      paperBoundary.current = boundary;
      carriedReference.current = preview.reference; previewTarget.current = target; setPaper(preview);
      requestAnimationFrame(() => { if (current()) tray.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); });
    } catch (problem) {
      if (!current()) return;
      // A different question may decline this paper. Reopen its source before
      // offering another destination: an old preview is never recovery proof.
      if (key && !['chat', 'note'].includes(key)) {
        try {
          const preview = await window.zaichang.sourceBookmarkPreview(source);
          if (!current()) return;
          paperBoundary.current = boundary; carriedReference.current = preview.reference; setPaper(preview); setDestination(undefined);
          requestAnimationFrame(() => { if (current()) tray.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); });
        } catch (sourceProblem) { if (current()) { setDestination(undefined); setError(uiError(sourceProblem)); } return; }
      }
      if (current()) { setDestination(undefined); setError(uiError(problem)); }
    }
    finally { if (owns()) setBusy(false); }
  }, []);
  const pick = useCallback((reference: SourceBookmarkReference, source?: HTMLElement | null) => offer(reference, undefined, source), [offer]);
  const getCurrentInteractionVersion = useCallback(() => interactionVersion.current?.(), []);
  const value = useMemo(() => ({ register, pick, offer, stage, release, getInteractionVersion: getCurrentInteractionVersion }),
    [register, pick, offer, stage, release, getCurrentInteractionVersion]);
  const choose = async (key: string) => {
    if (!paper || busy || committing.current) return;
    if (key === 'note' || key === 'chat') { previewTarget.current = undefined; setDestination(key); setError(''); return; }
    await offer(paper.reference, key);
  };
  const accept = async () => {
    if (!paper || !destination || busy || committing.current) return;
    const request = ++operation.current, reference = paper.reference, boundary = liveBoundary.current,
      interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && interaction === interactionVersion.current?.();
    let accepted = false;
    committing.current = request; setAccepting(true); setBusy(true); setError('');
    try {
      if (destination === 'chat') {
        if (!await onDiscussRef.current(reference)) throw new Error('刚才的对话位置变了。原文还在这里，重新选一下「对话」再放过去。');
        accepted = true;
      }
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
    } catch (problem) {
      if (owns()) {
        if (committing.current === request) committing.current = undefined;
        setAccepting(false);
        // The owner may have refused a changed or withdrawn source after its
        // preview. Keep the paper only if that exact address still opens now.
        setPaper(undefined); setDestination(undefined); previewTarget.current = undefined;
        if (!current()) return;
        try {
          const preview = await window.zaichang.sourceBookmarkPreview(reference);
          if (current()) {
            paperBoundary.current = boundary; carriedReference.current = preview.reference; setPaper(preview);
            setError(uiError(problem));
          }
        } catch (sourceProblem) { if (current()) setError(uiError(sourceProblem)); }
      }
    }
    finally {
      if (committing.current === request) committing.current = undefined;
      // A real acceptance is finished even when a later gesture vetoes only
      // its navigation. Retire this paper without focus or duplicate writes.
      if (accepted && owns()) clear(false);
      else if (owns()) { setBusy(false); setAccepting(false); }
    }
  };
  const studyTargets = useMemo(() => [...targets.current.values()], [targetRevision]);
  return <BookmarkTrayContext.Provider value={value}>{children}
    {(paper || error || busy) && createPortal(<aside ref={tray} className="source-bookmark-tray" aria-label="桌边书签托盘"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); clear(); } }}>
      <header><Bookmark size={16} aria-hidden="true" /><strong>书签夹</strong><button type="button" className="icon-button"
        aria-label={accepting ? '收起书签夹' : '放回原处'} onClick={() => clear()}><X size={16} /></button></header>
      {paper && <><div className="source-bookmark-paper" draggable={!busy} onDragStart={event => { stage(paper.reference); writeBookmarkTransfer(event.dataTransfer, paper.reference); }} onDragEnd={() => release(paper.reference)}>
        <span>{paper.title}{paper.page ? ` · 第 ${paper.page} 页` : ''}</span><blockquote><RichText text={paper.text} /></blockquote></div>
        <div className="source-bookmark-destinations" role="group" aria-label="把这一段放在哪里">
          {studyTargets.map(target => <button type="button" key={target.key} aria-pressed={destination === target.key} disabled={busy} onClick={() => void choose(target.key)}><BookOpen size={16} />{studyTargets.length > 1 ? target.label : '推导纸'}</button>)}
          <button type="button" aria-pressed={destination === 'note'} disabled={busy} onClick={() => void choose('note')}><FileText size={16} />笔记</button>
          <button type="button" aria-pressed={destination === 'chat'} disabled={busy} onClick={() => void choose('chat')}><MessageCircle size={16} />对话</button>
        </div>
        {destination && <footer><span>{destination === 'note' ? '留下新的一页' : destination === 'chat' ? '放到刚才那句话旁' : '放在这道题旁'}</span>
          <button type="button" className="text-button" disabled={busy} onClick={() => { if (!committing.current) clear(); }}>放回</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void accept()}>{busy ? '接过来…' : '收下'}</button></footer>}
      </>}
      {error && <p role="status">{error}</p>}{busy && !paper && <p role="status">翻回这一段原文…</p>}
      {error && !destination && !busy && <footer>
        <button type="button" className="text-button" onClick={() => clear()}>放回</button>
        {carriedReference.current && <button type="button" className="primary-button" onClick={() => {
          const reference = carriedReference.current; if (reference) void offer(reference);
        }}>再看一次</button>}
      </footer>}
    </aside>, document.body)}
  </BookmarkTrayContext.Provider>;
}
