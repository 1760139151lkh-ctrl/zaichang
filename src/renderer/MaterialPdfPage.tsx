import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
}

/** The image and transparent selection share the host's page coordinates.
 * Every selectable node retains an original Unicode address; visual position
 * is never used to infer a source range or reconstruct a quotation. */
export const MaterialPdfPage = memo(function MaterialPdfPage({ document: page, zoom, notes, reference, highlight, activeNoteId, onSelection, onOpenNote }: Props) {
  const root = useRef<HTMLDivElement>(null), layer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
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
  function capture() {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed || !layer.current) { onSelection(); return; }
    const range = selected.getRangeAt(0);
    if (!layer.current.contains(range.startContainer) || !layer.current.contains(range.endContainer)) { onSelection(); return; }
    const start = address(range.startContainer, range.startOffset, 'start'), end = address(range.endContainer, range.endOffset, 'end');
    if (start === undefined || end === undefined || start < page.start || end > page.end || end <= start) { onSelection(); return; }
    onSelection({ start, end, rect: range.getBoundingClientRect() });
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
      onPointerUp={capture} onKeyUp={capture}>
      {spans.map(({ run, style }) => <span key={`${run.start}:${run.end}`} data-material-start={run.start} data-material-end={run.end}
        dir={run.dir === 'rtl' ? 'rtl' : 'ltr'} style={style}>{content(run)}</span>)}
    </div>}
    {groups.map(group => {
      const current = group.notes.findIndex(note => note.id === activeNoteId);
      const next = group.notes[(current + 1) % group.notes.length];
      return <button type="button" key={group.notes[0].id} className={`material-page-note-pin${current >= 0 ? ' is-open' : ''}`}
        style={{ top: `${group.top * 100}%` }} aria-label={group.notes.length > 1 ? `这一处的 ${group.notes.length} 条笔记，点击翻看` : '打开这一处的笔记'}
        title={next.preview} onClick={() => onOpenNote(next)}><StickyNote size={14} />{group.notes.length > 1 && <span>{group.notes.length}</span>}</button>;
    })}
  </div>;
});
