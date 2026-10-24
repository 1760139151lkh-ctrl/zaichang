import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { StickyNote } from 'lucide-react';
import type { MaterialNote, MaterialPage, MaterialQuoteReference } from '../shared/materials';

export interface MaterialPageSelection { start: number; end: number; rect: DOMRect }
interface Props {
  document: MaterialPage;
  zoom: number;
  notes: MaterialNote[];
  reference?: MaterialQuoteReference;
  highlight?: { offset: number; end: number };
  activeNoteId?: string;
  onSelection: (selection?: MaterialPageSelection) => void;
  onOpenNote: (note: MaterialNote) => void;
  onSelectionDragStart?: (event: DragEvent<HTMLElement>, selection: MaterialPageSelection) => void;
  onSelectionDragEnd?: () => void;
  onMoveNote?: (note: MaterialNote, source: MaterialQuoteReference) => void;
  moveDisabled?: boolean;
}

/** The image and transparent selection share the host's page coordinates.
 * Every selectable node retains an original Unicode address; visual position
 * is never used to infer a source range or reconstruct a quotation. */
export const MaterialPdfPage = memo(function MaterialPdfPage({ document: page, zoom, notes, reference, highlight, activeNoteId, onSelection, onOpenNote, onSelectionDragStart, onSelectionDragEnd, onMoveNote, moveDisabled }: Props) {
  const root = useRef<HTMLDivElement>(null), layer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  type PinMove = { note: MaterialNote; source?: MaterialQuoteReference; x: number; y: number; originX: number; originY: number; keyboard: boolean; moved: boolean };
  const [pinMove, setPinMove] = useState<PinMove>();
  const pinMoveRef = useRef<PinMove | undefined>(undefined);
  const pinPointer = useRef<{ id: number; element: HTMLButtonElement } | undefined>(undefined);
  const suppressPinClick = useRef(0);
  const [announcement, setAnnouncement] = useState('');
  function updatePin(value?: PinMove) { pinMoveRef.current = value; setPinMove(value); }
  function cancelPin() {
    const pointer = pinPointer.current; pinPointer.current = undefined;
    if (pointer?.element.hasPointerCapture(pointer.id)) pointer.element.releasePointerCapture(pointer.id);
    updatePin();
  }
  useEffect(() => { cancelPin(); }, [page.item.resourceId, page.item.sha256, page.page, moveDisabled]);
  useEffect(() => () => {
    const pointer = pinPointer.current;
    if (pointer?.element.hasPointerCapture(pointer.id)) pointer.element.releasePointerCapture(pointer.id);
  }, []);
  useEffect(() => {
    const blur = () => cancelPin();
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);
  useLayoutEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const spans = useMemo(() => {
    const context = window.document.createElement('canvas').getContext('2d');
    return (page.textRuns || []).map(run => {
      const [left, top, right, bottom] = run.bbox;
      const fontSize = Math.max(1, (bottom - top) * size.height);
      if (context) context.font = `${fontSize}px Arial, sans-serif`;
      const natural = context?.measureText(run.text).width || (right - left) * size.width || 1;
      return { run, style: { left: `${left * 100}%`, top: `${top * 100}%`, fontSize,
        transform: `scaleX(${Math.max(.001, (right - left) * size.width / natural)})` } as CSSProperties };
    });
  }, [page.textRuns, size]);
  const currentReference = reference?.resourceId === page.item.resourceId && reference.sha256 === page.item.sha256
    && reference.page === page.page ? reference : undefined;
  const currentNotes = notes.filter(note => note.source.resourceId === page.item.resourceId
    && note.source.sha256 === page.item.sha256 && note.source.page === page.page);
  const ranges = [...currentNotes.map(note => ({ start: note.source.start, end: note.source.end, kind: 'note' })),
    ...(pinMove?.source ? [{ ...pinMove.source, kind: 'drop' }] : []),
    ...(currentReference ? [{ ...currentReference, kind: 'reference' }] : []),
    ...(highlight ? [{ start: highlight.offset, end: highlight.end, kind: 'search' }] : [])];
  function content(run: NonNullable<MaterialPage['textRuns']>[number]) {
    const points = Array.from(run.text), cuts = new Set([run.start, run.end]);
    for (const range of ranges) if (range.start < run.end && range.end > run.start) {
      cuts.add(Math.max(run.start, range.start)); cuts.add(Math.min(run.end, range.end));
    }
    const offsets = [...cuts].sort((a, b) => a - b);
    return offsets.slice(0, -1).map((start, index) => {
      const end = offsets[index + 1], text = points.slice(start - run.start, end - run.start).join('');
      const kinds = ranges.filter(range => range.start < end && range.end > start).map(range => range.kind);
      return kinds.length ? <mark key={start} className={kinds.map(kind => `is-${kind}`).join(' ')}>{text}</mark> : text;
    });
  }
  function address(container: Node, offset: number, edge: 'start' | 'end') {
    const element = container.nodeType === Node.ELEMENT_NODE ? container as Element : container.parentElement;
    const span = element?.closest<HTMLElement>('[data-material-start]');
    if (span && layer.current?.contains(span)) {
      const before = window.document.createRange(); before.selectNodeContents(span); before.setEnd(container, offset);
      return Number(span.dataset.materialStart) + Array.from(before.toString()).length;
    }
    if (container === layer.current) {
      const child = layer.current.children[offset + (edge === 'end' ? -1 : 0)] as HTMLElement | undefined;
      if (child) return Number(edge === 'end' ? child.dataset.materialEnd : child.dataset.materialStart);
    }
  }
  function selectedRange(): MaterialPageSelection | undefined {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed || !layer.current) return;
    const range = selected.getRangeAt(0);
    if (!layer.current.contains(range.startContainer) || !layer.current.contains(range.endContainer)) return;
    const start = address(range.startContainer, range.startOffset, 'start'), end = address(range.endContainer, range.endOffset, 'end');
    if (start === undefined || end === undefined || start < page.start || end > page.end || end <= start) return;
    return { start, end, rect: range.getBoundingClientRect() };
  }
  function capture() { onSelection(selectedRange()); }
  function sourceFor(run: NonNullable<MaterialPage['textRuns']>[number]): MaterialQuoteReference | undefined {
    if (run.end <= run.start || run.end - run.start > 4000 || !run.text.trim()) return;
    return { resourceId: page.item.resourceId, sha256: page.item.sha256, page: page.page, start: run.start, end: run.end };
  }
  function beginPin(event: PointerEvent<HTMLButtonElement>, note: MaterialNote) {
    if (!onMoveNote || moveDisabled || pinPointer.current || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pinPointer.current = { id: event.pointerId, element: event.currentTarget };
    updatePin({ note, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, keyboard: false, moved: false });
  }
  function movePin(event: PointerEvent<HTMLButtonElement>) {
    const current = pinMoveRef.current;
    if (!current || pinPointer.current?.id !== event.pointerId) return;
    const moved = current.moved || Math.hypot(event.clientX - current.originX, event.clientY - current.originY) > 5;
    const element = window.document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-material-start]');
    const run = element && layer.current?.contains(element) ? page.textRuns?.find(run => run.start === Number(element.dataset.materialStart)) : undefined;
    updatePin({ ...current, x: event.clientX, y: event.clientY, moved, source: moved && run ? sourceFor(run) : undefined });
  }
  function commitPin() {
    const current = pinMoveRef.current;
    cancelPin();
    if (!current?.moved || !current.source) return;
    suppressPinClick.current = performance.now() + 400;
    if (current.source.start === current.note.source.start && current.source.end === current.note.source.end) return;
    onMoveNote?.(current.note, current.source);
    // The parent announces the actual native save or conflict. A local pin
    // cannot keep announcing progress after that owner has finished.
    setAnnouncement('');
  }
  function keyPin(event: KeyboardEvent<HTMLButtonElement>, note: MaterialNote) {
    if (!onMoveNote || moveDisabled) return;
    if (event.key === 'Escape' && pinMoveRef.current) { event.preventDefault(); event.stopPropagation(); cancelPin(); setAnnouncement('仍在原处。'); return; }
    if ((event.key === ' ' || event.key === 'Enter') && pinMoveRef.current?.keyboard) { event.preventDefault(); event.stopPropagation(); commitPin(); return; }
    if (event.key === ' ') {
      event.preventDefault(); event.stopPropagation();
      updatePin({ note, source: note.source, x: 0, y: 0, originX: 0, originY: 0, keyboard: true, moved: true });
      setAnnouncement('用上下方向键选择原文，回车放下，Escape 放回。'); return;
    }
    const current = pinMoveRef.current;
    if (!current?.keyboard || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const runs = (page.textRuns || []).filter(run => sourceFor(run));
    const index = runs.findIndex(run => run.start <= (current.source?.start ?? note.source.start) && run.end > (current.source?.start ?? note.source.start));
    const next = runs[Math.max(0, Math.min(runs.length - 1, (index < 0 ? 0 : index) + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) { updatePin({ ...current, source: sourceFor(next) }); setAnnouncement(next.text); }
  }
  const groups: { top: number; notes: MaterialNote[] }[] = [];
  for (const note of currentNotes) {
    const run = page.textRuns?.find(run => run.start < note.source.end && run.end > note.source.start);
    if (!run) continue;
    const top = run.bbox[1], group = groups.find(group => Math.abs(group.top - top) * size.height < 22);
    if (group) group.notes.push(note); else groups.push({ top, notes: [note] });
  }
  if (!page.image) return null;
  return <div ref={root} className="material-page-image material-pdf-page" style={{ width: `${zoom}%` }}>
    <img src={page.image.dataUrl} width={page.image.width} height={page.image.height}
      alt={`${page.item.name}，第 ${page.page} 页原文`} draggable={false} />
    {!!spans.length && <div ref={layer} className="material-pdf-text-layer" tabIndex={0} role="document" aria-label="可选择的 PDF 原文"
      onPointerUp={capture} onKeyUp={capture}
      onDragStart={event => { const selection = selectedRange(); if (!selection || !onSelectionDragStart) event.preventDefault(); else onSelectionDragStart(event, selection); }}
      onDragEnd={onSelectionDragEnd}>
      {spans.map(({ run, style }) => <span key={`${run.start}:${run.end}`} data-material-start={run.start} data-material-end={run.end}
        dir={run.dir === 'rtl' ? 'rtl' : 'ltr'} style={style}>{content(run)}</span>)}
    </div>}
    {groups.map(group => {
      const current = group.notes.findIndex(note => note.id === activeNoteId);
      const next = group.notes[(current + 1) % group.notes.length];
      const moving = pinMove?.note.id === next.id ? pinMove : undefined;
      return <button type="button" key={group.notes[0].id} className={`material-page-note-pin${current >= 0 ? ' is-open' : ''}${moving?.moved ? ' is-moving' : ''}`}
        style={{ top: `${group.top * 100}%`, ...(moving?.moved && !moving.keyboard ? { transform: `translate(${moving.x - moving.originX}px, ${moving.y - moving.originY}px)` } : {}) }}
        aria-label={`${group.notes.length > 1 ? `这一处的 ${group.notes.length} 条笔记，点击翻看` : '打开这一处的笔记'}；拖到另一行，或按空格调整位置`}
        title={next.preview} onPointerDown={event => beginPin(event, next)} onPointerMove={movePin}
        onPointerUp={event => { if (pinPointer.current?.id === event.pointerId) { const moved = pinMoveRef.current?.moved; if (moved) suppressPinClick.current = performance.now() + 400; commitPin(); } }}
        onPointerCancel={cancelPin} onLostPointerCapture={() => { if (pinPointer.current) cancelPin(); }}
        onKeyDown={event => keyPin(event, next)} onBlur={cancelPin}
        onClick={() => { if (performance.now() >= suppressPinClick.current) onOpenNote(next); }}><StickyNote size={14} />{group.notes.length > 1 && <span>{group.notes.length}</span>}</button>;
    })}
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
  </div>;
});
