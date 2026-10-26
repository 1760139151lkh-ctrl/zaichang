import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight } from 'lucide-react';
import './local-text-focus.css';

export interface LocalTextRange { start: number; end: number; preview: string }
const cueEvent = 'zaichang:reading-focus-cue';
const announceCue = (owner: string) => document.dispatchEvent(new CustomEvent(cueEvent, { detail: owner }));

/** A whole source object such as a learner's actual line or teaching step.
 * Reading stays quiet; a real point/selection or keyboard focus reveals just
 * that object's one continuation. It never guesses a range in rendered math. */
export function ReadableFocus({ label, active = false, disabled = false, inline = false, onFocus, children }: {
  label: string; active?: boolean; disabled?: boolean; onFocus: () => void; children: ReactNode;
  inline?: boolean;
}) {
  const root = useRef<HTMLElement | null>(null), cue = useRef<HTMLButtonElement>(null), owner = useId();
  const Tag = inline ? 'span' : 'div';
  const point = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const [open, setOpen] = useState(false), [position, setPosition] = useState<{ left: number; top: number }>();
  const reveal = (x?: number, y?: number) => {
    if (disabled || !root.current) return;
    const rect = root.current.getBoundingClientRect(), below = y ?? rect.bottom;
    setPosition({ left: Math.max(12, Math.min(x === undefined ? rect.right - 112 : x + 10, window.innerWidth - 128)),
      top: Math.max(12, Math.min(below > window.innerHeight - 64 ? below - 42 : below + 8, window.innerHeight - 44)) });
    announceCue(owner); setOpen(true);
  };
  useEffect(() => {
    const another = (event: Event) => { if ((event as CustomEvent).detail !== owner) setOpen(false); };
    document.addEventListener(cueEvent, another);
    return () => document.removeEventListener(cueEvent, another);
  }, [owner]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !cue.current?.contains(event.target as Node)) setOpen(false);
    };
    const clear = () => setOpen(false);
    document.addEventListener('pointerdown', outside); window.addEventListener('blur', clear);
    window.addEventListener('scroll', clear, true); window.addEventListener('resize', clear);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('blur', clear);
      window.removeEventListener('scroll', clear, true); window.removeEventListener('resize', clear); };
  }, [open]);
  const continueHere = () => { if (!disabled) { setOpen(false); onFocus(); } };
  return <Tag ref={element => { root.current = element; }} className={`readable-focus${open && !disabled ? ' is-pointed' : ''}${active ? ' is-referenced' : ''}`}
    role="group" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`${label}，按回车接着聊这一处`} aria-keyshortcuts="Enter"
    onFocus={event => { if (event.target === event.currentTarget && event.currentTarget.matches(':focus-visible')) reveal(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)
      && !cue.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) { setOpen(false); event.stopPropagation(); }
      if (event.key === 'Enter' && event.target === event.currentTarget && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault(); continueHere();
      }
    }}
    onPointerDown={event => { if (event.button === 0) point.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; }}
    onPointerCancel={() => { point.current = undefined; }}
    onPointerUp={event => {
      if (disabled || event.button !== 0) return;
      const element = (event.target as Node).nodeType === Node.ELEMENT_NODE ? event.target as Element : (event.target as Node).parentElement;
      if (element?.closest('button,a,input,textarea,select,summary')) return;
      const down = point.current; point.current = undefined;
      const selection = window.getSelection(), selectedHere = !!selection && !selection.isCollapsed
        && event.currentTarget.contains(selection.anchorNode) && event.currentTarget.contains(selection.focusNode);
      if (!selectedHere && (!down || down.id !== event.pointerId || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8)) return;
      reveal(event.clientX, event.clientY);
    }}>
    {children}
    {open && !disabled && position && createPortal(<button ref={cue} type="button" className="readable-focus-cue" style={position}
      aria-label={`就${label}接着聊`} onPointerDown={event => event.preventDefault()} onClick={continueHere}>
      就这里聊聊<ArrowUpRight size={16} aria-hidden="true" /></button>, root.current?.closest('.app-main') || document.body)}
  </Tag>;
}

/** Source positions come from literal Markdown text nodes, or from a plain
 * field whose entire DOM text equals its source. Never relocate by quote. */
function selectedRange(root: HTMLElement, source: string): LocalTextRange | undefined {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
  const bodyBoundary = (node: Node | null) => !!node && (root.contains(node)
    || node.nodeType === Node.ELEMENT_NODE && (node as Element).contains(root));
  if (!bodyBoundary(selection.anchorNode) || !bodyBoundary(selection.focusNode)) return;
  const excluded = 'button,input,textarea,select,svg,math,.katex,[data-focus-excluded]';
  const element = (node: Node | null) => node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement;
  if (element(selection.anchorNode)?.closest(excluded) || element(selection.focusNode)?.closest(excluded)
    || selection.getRangeAt(0).cloneContents().querySelector(excluded)) return;
  const range = selection.getRangeAt(0).cloneRange(), body = document.createRange(); body.selectNodeContents(root);
  const lowerBoundary = body.comparePoint(range.startContainer, range.startOffset);
  const upperBoundary = body.comparePoint(range.endContainer, range.endOffset);
  if (lowerBoundary > 0 || upperBoundary < 0) return;
  // A paragraph-end gesture can leave the browser caret on an ancestor just
  // after the body. Clip only that empty boundary, never neighbouring text.
  if (lowerBoundary < 0) {
    const outside = range.cloneRange(); outside.setEnd(body.startContainer, body.startOffset);
    if (outside.toString().trim()) return;
    range.setStart(body.startContainer, body.startOffset);
  }
  if (upperBoundary > 0) {
    const outside = range.cloneRange(); outside.setStart(body.endContainer, body.endOffset);
    if (outside.toString().trim()) return;
    range.setEnd(body.endContainer, body.endOffset);
  }
  const text = range.toString().trim();
  if (!text || Array.from(text).length > 1200) return;
  const points = Array.from(source);
  const prefixPoints = (prefix: string, whole: string): number | undefined => {
    const count = Array.from(prefix).length;
    return Array.from(whole).slice(0, count).join('') === prefix ? count : undefined;
  };
  let start: number, end: number;
  if (root.textContent === source) {
    const prefix = document.createRange(); prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset); const lower = prefixPoints(prefix.toString(), source);
    prefix.setEnd(range.endContainer, range.endOffset); const upper = prefixPoints(prefix.toString(), source);
    if (lower === undefined || upper === undefined) return;
    start = lower; end = upper;
  } else {
    const spans = [...root.querySelectorAll<HTMLElement>('[data-focus-start][data-focus-end]')]
      .filter(span => range.intersectsNode(span));
    const first = spans[0], last = spans.at(-1);
    if (!first || !last) return;
    const boundary = (span: HTMLElement, atEnd: boolean): number | undefined => {
      const lower = Number(span.dataset.focusStart), upper = Number(span.dataset.focusEnd), value = span.textContent || '';
      if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || lower < 0 || upper <= lower
        || points.slice(lower, upper).join('') !== value) return;
      const node = atEnd ? range.endContainer : range.startContainer, offset = atEnd ? range.endOffset : range.startOffset;
      if (span.contains(node)) {
        const prefix = document.createRange(); prefix.selectNodeContents(span); prefix.setEnd(node, offset);
        const count = prefixPoints(prefix.toString(), value);
        return count === undefined ? undefined : lower + count;
      }
      const outside = range.cloneRange();
      if (atEnd) outside.setStartAfter(span); else outside.setEndBefore(span);
      if (outside.toString().trim()) return;
      return atEnd ? upper : lower;
    };
    const lower = boundary(first, false), upper = boundary(last, true);
    if (lower === undefined || upper === undefined) return;
    start = lower; end = upper;
  }
  if (start < 0 || end <= start || end > points.length || end - start > 1200) return;
  return { start, end, preview: text };
}

/** Invert only a proven literal-text position. Markdown syntax or generated
 * math never gets a guessed DOM location. */
function displayedRange(root: HTMLElement, source: string, start: number, end: number): Range | undefined {
  const points = Array.from(source);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > points.length) return;
  const inText = (element: HTMLElement, offset: number): { node: Text; offset: number } | undefined => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (offset <= node.length) return { node, offset };
      offset -= node.length;
    }
  };
  const at = (point: number, upper: boolean) => {
    if (root.textContent === source) return inText(root, points.slice(0, point).join('').length);
    const candidates = [...root.querySelectorAll<HTMLElement>('[data-focus-start][data-focus-end]')].filter(span => {
      const lower = Number(span.dataset.focusStart), end = Number(span.dataset.focusEnd);
      return Number.isSafeInteger(lower) && Number.isSafeInteger(end) && lower >= 0 && end > lower
        && lower <= point && point <= end && points.slice(lower, end).join('') === span.textContent;
    });
    const span = upper ? candidates[0] : candidates.at(-1);
    return span && inText(span, points.slice(Number(span.dataset.focusStart), point).join('').length);
  };
  const lower = at(start, false), upper = at(end, true);
  if (!lower || !upper) return;
  const range = document.createRange(); range.setStart(lower.node, lower.offset); range.setEnd(upper.node, upper.offset);
  return range.collapsed ? undefined : range;
}

/** Keeps the actual prose selectable. Choosing a sentence carries an owner
 * address to the ordinary composer; it does not copy that prose into a draft,
 * send a message, accept a suggestion or create another work object. */
export function LocalTextFocus({ source, label, onFocus, activeRange, disabled = false, rangeAllowed, children }: {
  source: string; label: string; onFocus: (range: LocalTextRange) => void;
  activeRange?: { start: number; end: number }; disabled?: boolean; children: ReactNode;
  rangeAllowed?: (range: LocalTextRange, body?: HTMLElement) => boolean;
}) {
  const body = useRef<HTMLDivElement>(null), owner = useId();
  const [selection, setSelection] = useState<{ source: string; range: LocalTextRange }>();
  const current = selection?.source === source && !disabled ? selection.range : undefined;
  const capture = useCallback(() => {
    const candidate = body.current && !disabled ? selectedRange(body.current, source) : undefined;
    const range = candidate && (!rangeAllowed || rangeAllowed(candidate, body.current || undefined)) ? candidate : undefined;
    if (range) announceCue(owner);
    setSelection(range ? { source, range } : undefined);
  }, [source, disabled, rangeAllowed, owner]);
  useEffect(() => { setSelection(undefined); }, [source, disabled]);
  useLayoutEffect(() => {
    if (!body.current || !activeRange) return;
    if (rangeAllowed && !rangeAllowed({ ...activeRange, preview: Array.from(source).slice(activeRange.start, activeRange.end).join('') }, body.current)) return;
    const range = displayedRange(body.current, source, activeRange.start, activeRange.end);
    if (!range) return;
    const browser = window as unknown as { Highlight?: new (...ranges: Range[]) => unknown;
      CSS?: { highlights?: { set: (name: string, highlight: unknown) => void; delete: (name: string) => void } } };
    if (!browser.Highlight || !browser.CSS?.highlights) return;
    const registry = browser.CSS.highlights, name = `reading-focus-${owner.replace(/[^a-zA-Z0-9-]/g, '')}`;
    const style = document.createElement('style');
    style.textContent = `::highlight(${name}){background-color:color-mix(in srgb,var(--accent-soft) 60%,transparent);color:inherit}`;
    document.head.append(style); registry.set(name, new browser.Highlight(range));
    return () => { registry.delete(name); style.remove(); };
  }, [source, activeRange?.start, activeRange?.end, rangeAllowed, owner]);
  useEffect(() => {
    const clear = () => setSelection(undefined);
    const another = (event: Event) => { if ((event as CustomEvent).detail !== owner) clear(); };
    document.addEventListener('selectionchange', capture);
    document.addEventListener(cueEvent, another);
    window.addEventListener('blur', clear);
    return () => { document.removeEventListener('selectionchange', capture); document.removeEventListener(cueEvent, another); window.removeEventListener('blur', clear); };
  }, [capture, owner]);
  return <div className={`local-text-focus${activeRange ? ' is-referenced' : ''}`}>
    <div ref={body} onPointerUp={capture} onKeyUp={capture}>{children}</div>
    {current && <div className="local-text-focus-cue">
      <span>“{Array.from(current.preview).slice(0, 72).join('')}{Array.from(current.preview).length > 72 ? '…' : ''}”</span>
      <button type="button" aria-label={`就${label}的这句接着聊`} onPointerDown={event => event.preventDefault()} onClick={() => {
        // The chosen address now supplies the reading mark. Do not leave a
        // second native selection that can reopen the cue or outlive Cancel.
        const selected = window.getSelection();
        if (selected && body.current && selectedRange(body.current, source)) selected.removeAllRanges();
        onFocus(current); setSelection(undefined);
      }}>就这句聊聊<ArrowUpRight size={12} /></button>
    </div>}
  </div>;
}
