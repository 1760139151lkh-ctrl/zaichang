import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject, type ReactNode } from 'react';
import { GripVertical, Maximize2, X } from 'lucide-react';
import type { ImageAttachment, TextAttachment } from '../shared/types';
import type { MaterialQuote, MaterialQuoteReference } from '../shared/materials';
import type { LocalSearchLocator } from '../shared/search';
import type { MaterialDocumentAddress } from './materials/material-document-transfer';
import type { MaterialReturnAddress } from './workspace-return';
import { MaterialsPanel } from './MaterialsPanel';
import { useSpringValue } from './motion/use-spring';
import './reading-desk.css';

export type ReadingDeskItem = {
  id: string; kind: 'material'; name: string; address: MaterialDocumentAddress; pending?: TextAttachment;
} | { id: string; kind: 'image'; name: string; image: ImageAttachment }
  | { id: string; kind: 'text'; name: string; text: string };
export interface OpeningRect {
  id: string;
  requestId: number;
  /** Viewport CSS pixels, measured beside the object that opens this reader. */
  rect: { x: number; y: number; width: number; height: number };
}
export interface ReadingDeskProps {
  /** Available originals; opening a frame never creates another attachment. */
  items: readonly ReadingDeskItem[];
  requestOpen?: { id: string; requestId: number };
  /** First creation only. Reopening a frame never replaces its own geometry. */
  openingRect?: OpeningRect;
  active?: boolean;
  boundary: string;
  sessionId?: string;
  draftEnabled?: boolean;
  refreshKey?: string;
  conversationTarget?: RefObject<HTMLElement | null>;
  focus?: { locator: Extract<LocalSearchLocator, { kind: 'material' }>; requestId: number };
  reference?: MaterialQuoteReference;
  resume?: { address: MaterialReturnAddress; requestId: number };
  onActiveChange?: (id: string | undefined) => void;
  onCloseFrame?: (id: string) => void;
  onAttach?: (attachment: TextAttachment) => boolean;
  onQuote: (quote: MaterialQuote) => boolean;
  onPickDocument?: (address: MaterialDocumentAddress) => void | Promise<void>;
  onOpenNote?: (id: string, revision: number) => void;
  onUnsavedChange?: (unsaved: boolean) => void;
  onDraftStateChange?: (id: string, dirty: boolean) => void;
  onReturnAddressChange?: (address: MaterialReturnAddress | undefined) => void;
}

interface Rect { x: number; y: number; width: number; height: number }
interface Size { width: number; height: number }
interface FrameState { id: string; open: boolean; rect: Rect; order: number; activation: number;
  resume?: { address: MaterialReturnAddress; requestId: number } }
const storageKey = 'zaichang.reading-desk.v1';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
function constrain(rect: Rect, size: Size): Rect {
  const width = clamp(rect.width, Math.min(310, size.width), size.width);
  const height = clamp(rect.height, Math.min(250, size.height), size.height);
  return { x: clamp(rect.x, 0, size.width - width), y: clamp(rect.y, 0, size.height - height), width, height };
}
function resizeFrom(rect: Rect, width: number, height: number, size: Size): Rect {
  const availableWidth = size.width - rect.x, availableHeight = size.height - rect.y;
  return { ...rect, width: clamp(width, Math.min(310, availableWidth), availableWidth),
    height: clamp(height, Math.min(250, availableHeight), availableHeight) };
}
function initialRect(index: number, image: boolean, size: Size): Rect {
  const width = Math.min(image ? 390 : 540, size.width * (size.width < 700 ? .93 : image ? .36 : .49));
  const height = Math.min(image ? 350 : 690, size.height * (image ? .61 : .95));
  return constrain({ x: image ? size.width - width - 12 : 12 + (index % 3) * width * .58,
    y: image ? 14 : 12 + (index % 3) * 36, width, height }, size);
}
function savedRect(id: string): Rect | undefined {
  try {
    const rect = JSON.parse(localStorage.getItem(storageKey) || '{}')[id];
    if (rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]))) return rect;
  } catch { /* A layout preference never replaces an original. */ }
}

/** One absolute overlay on the existing app work area. Each source keeps its
 * reader DOM while views change; empty space between windows stays usable. */
export function ReadingDesk(props: ReadingDeskProps) {
  const stage = useRef<HTMLDivElement>(null), callbacks = useRef(props); callbacks.current = props;
  const [size, setSize] = useState<Size>({ width: 1100, height: 650 });
  const dimensions = useRef(size); dimensions.current = size;
  const [frames, setFrames] = useState<FrameState[]>([]), [activeId, setActiveId] = useState<string>();
  const [attachedOpen, setAttachedOpen] = useState<string>();
  const activeFrame = useRef(activeId), framesNow = useRef(frames); activeFrame.current = activeId; framesNow.current = frames;
  const sequence = useRef(0), openedRequest = useRef(''), openedSource = useRef('');
  const verification = useRef(0), reopening = useRef(0);
  const activeProof = useRef<{ id: string; activation: number } | undefined>(undefined);
  // A last verified pointer is only a future resume intention. The active
  // reader must qualify itself again before reporting a current source.
  const lastKnown = useRef(new Map<string, MaterialReturnAddress>()), dirty = useRef(new Map<string, boolean>());
  const itemsNow = useRef(props.items); itemsNow.current = props.items;
  const idsKey = JSON.stringify(props.items.map(item => item.id));
  const referenceKey = props.reference ? JSON.stringify(props.reference) : '';
  const activate = useCallback((id: string) => {
    const changed = activeFrame.current !== id;
    activeFrame.current = id; setActiveId(id);
    const activation = changed ? ++verification.current : undefined, order = ++sequence.current;
    if (activation) activeProof.current = { id, activation };
    setFrames(previous => previous.map(frame => frame.id === id ? { ...frame, order,
      ...(activation ? { activation } : {}), resume: undefined } : frame));
    if (changed) { callbacks.current.onActiveChange?.(id); callbacks.current.onReturnAddressChange?.(undefined); }
  }, []);
  const open = useCallback((id: string, restore = true, requestId?: number) => {
    const item = itemsNow.current.find(candidate => candidate.id === id);
    if (!item) return;
    const host = stage.current?.getBoundingClientRect();
    // Read the real host after it becomes visible. ResizeObserver may not have
    // delivered its first size yet, especially when Keep opens a source.
    const available = host && host.width > 0 && host.height > 0 ? { width: host.width, height: host.height } : dimensions.current;
    if (available.width !== dimensions.current.width || available.height !== dimensions.current.height) {
      dimensions.current = available; setSize(available);
    }
    const proposed = callbacks.current.openingRect;
    const sourceRect = proposed?.id === id && proposed.requestId === requestId ? proposed.rect : undefined;
    const preferred = sourceRect && host && host.width > 0 && host.height > 0
      && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(sourceRect[key as keyof Rect]))
      && sourceRect.width > 0 && sourceRect.height > 0
      ? { x: sourceRect.x - host.left, y: sourceRect.y - host.top, width: sourceRect.width, height: sourceRect.height } : undefined;
    const activation = ++verification.current, order = ++sequence.current, known = restore ? lastKnown.current.get(id) : undefined;
    activeProof.current = { id, activation };
    const resume = known ? { address: known, requestId: -++reopening.current } : undefined;
    setFrames(previous => {
      if (previous.some(frame => frame.id === id)) return previous.map(frame => frame.id === id ? { ...frame, open: true, order,
        activation, resume: !frame.open ? resume : undefined } : frame);
      return [...previous, { id, open: true, order, activation, resume,
        rect: constrain(preferred || savedRect(id) || initialRect(previous.filter(frame => frame.open).length, item.kind === 'image', available), available) }];
    });
    activeFrame.current = id; setActiveId(id); callbacks.current.onActiveChange?.(id);
    callbacks.current.onReturnAddressChange?.(undefined);
  }, []);
  useEffect(() => {
    lastKnown.current.clear(); setFrames(previous => previous.map(frame => ({ ...frame, resume: undefined })));
    for (const id of dirty.current.keys()) callbacks.current.onDraftStateChange?.(id, false);
    dirty.current.clear(); callbacks.current.onUnsavedChange?.(false);
    const frame = framesNow.current.find(candidate => candidate.id === activeFrame.current);
    activeProof.current = frame ? { id: frame.id, activation: frame.activation } : undefined;
    callbacks.current.onReturnAddressChange?.(undefined);
  }, [props.boundary]);
  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (!width || !height) return;
      const next = { width, height }; dimensions.current = next; setSize(next);
      setFrames(previous => previous.map(frame => ({ ...frame, rect: constrain(frame.rect, next) })));
    });
    observer.observe(stage.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setFrames(previous => previous.filter(frame => props.items.some(item => item.id === frame.id)));
    for (const id of lastKnown.current.keys()) if (!props.items.some(item => item.id === id)) lastKnown.current.delete(id);
    for (const id of dirty.current.keys()) if (!props.items.some(item => item.id === id)) {
      dirty.current.delete(id); callbacks.current.onDraftStateChange?.(id, false);
    }
    callbacks.current.onUnsavedChange?.([...dirty.current.values()].some(Boolean));
    if (activeFrame.current && !props.items.some(item => item.id === activeFrame.current)) {
      activeFrame.current = undefined; activeProof.current = undefined; setActiveId(undefined); callbacks.current.onActiveChange?.(undefined); callbacks.current.onReturnAddressChange?.(undefined);
    }
  }, [idsKey]);
  useEffect(() => {
    const request = props.requestOpen;
    if (!request || props.active === false || openedRequest.current === `${request.id}:${request.requestId}`) return;
    if (!props.items.some(item => item.id === request.id)) return;
    openedRequest.current = `${request.id}:${request.requestId}`; open(request.id, true, request.requestId);
  }, [props.requestOpen?.id, props.requestOpen?.requestId, idsKey, props.active, open]);
  useEffect(() => {
    if (!attachedOpen || !props.items.some(item => item.id === attachedOpen)) return;
    open(attachedOpen, false); setAttachedOpen(undefined);
  }, [attachedOpen, idsKey, open]);
  useEffect(() => {
    if (props.active === false) return;
    const id = props.resume?.address.resourceId || props.focus?.locator.resourceId || props.reference?.resourceId;
    const source = props.resume ? `resume:${id}:${props.resume.requestId}` : props.focus ? `focus:${id}:${props.focus.requestId}` : referenceKey;
    if (!id || !source || source === openedSource.current || !props.items.some(item => item.id === id)) return;
    openedSource.current = source; open(id, false, props.resume?.requestId ?? props.focus?.requestId);
  }, [props.resume?.requestId, props.focus?.requestId, referenceKey, idsKey, props.active, open]);
  function close(id: string) {
    const oldFocus = document.activeElement;
    const next = framesNow.current.filter(frame => frame.open && frame.id !== id).sort((a, b) => b.order - a.order)[0]?.id;
    const activation = ++verification.current;
    activeProof.current = next ? { id: next, activation } : undefined;
    setFrames(previous => previous.map(frame => frame.id === id ? { ...frame, open: false }
      : frame.id === next ? { ...frame, activation, resume: undefined } : frame));
    activeFrame.current = next; setActiveId(next); callbacks.current.onActiveChange?.(next);
    callbacks.current.onReturnAddressChange?.(undefined); callbacks.current.onCloseFrame?.(id);
    requestAnimationFrame(() => {
      if (!document.hasFocus() || callbacks.current.active === false || document.activeElement !== oldFocus && document.activeElement !== document.body) return;
      const cover = document.querySelector<HTMLButtonElement>(`[data-attachment-id="${CSS.escape(id)}"] .attachment-tray-open`);
      cover?.focus({ preventScroll: true });
    });
  }
  function place(id: string, rect: Rect, commit: boolean) {
    setFrames(previous => previous.map(frame => frame.id === id ? { ...frame, rect } : frame));
    if (!commit) return;
    try {
      const saved = Object.fromEntries(framesNow.current.map(frame => [frame.id, frame.id === id ? rect : frame.rect]));
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch { /* Reading still works without a geometry preference. */ }
  }
  return <div ref={stage} className="reading-desk" role="region" hidden={props.active === false} aria-label="摊开的资料">
    {frames.map(frame => {
      const item = props.items.find(candidate => candidate.id === frame.id);
      if (!item) return null;
      return <ReadingFrame key={item.id} item={item} frame={frame} size={size} active={activeId === item.id} present={props.active !== false && frame.open}
        onActivate={() => activate(item.id)} onPlace={(rect, commit) => place(item.id, rect, commit)}>
        {grip => item.kind !== 'material' ? <><header className="reading-image-header">{grip}<strong title={item.name}>{item.name}</strong>
          <button type="button" className="icon-button" aria-label={`收起${item.name}`} onClick={() => close(item.id)}><X size={17} /></button></header>
          {item.kind === 'image' ? <div className="reading-image-body"><img src={item.image.dataUrl} width={item.image.width} height={item.image.height} alt={item.name} draggable={false} /></div>
            : <pre className="reading-legacy-text" tabIndex={0} aria-label={item.name}>{item.text}</pre>}</>
          : <MaterialsPanel active={props.active !== false && frame.open} boundary={props.boundary} sessionId={props.sessionId}
            pending={item.pending} fixedDocument={item.address} readerId={`desk:${item.id}`} verifyRequest={frame.activation} frameless headerGrip={grip}
            draftEnabled={props.draftEnabled} refreshKey={props.refreshKey} conversationTarget={props.conversationTarget}
            focus={props.focus?.locator.resourceId === item.id ? props.focus : undefined}
            reference={props.reference?.resourceId === item.id ? props.reference : undefined}
            resume={props.resume?.address.resourceId === item.id ? props.resume : frame.resume}
            onClose={() => close(item.id)} onAttach={attachment => callbacks.current.onAttach?.(attachment) || false}
            onOpenDocument={address => setAttachedOpen(address.resourceId)}
            onQuote={props.onQuote} onPickDocument={props.onPickDocument} onOpenNote={props.onOpenNote}
            onUnsavedChange={value => { dirty.current.set(item.id, value); callbacks.current.onDraftStateChange?.(item.id, value);
              callbacks.current.onUnsavedChange?.([...dirty.current.values()].some(Boolean)); }}
            onReturnAddressChange={address => { if (address) lastKnown.current.set(item.id, address);
              if (activeFrame.current === item.id && activeProof.current?.id === item.id && activeProof.current.activation === frame.activation)
                callbacks.current.onReturnAddressChange?.(address); }} />}
      </ReadingFrame>;
    })}
  </div>;
}

interface Gesture { pointer: number; element: HTMLButtonElement; mode: 'move' | 'resize'; x: number; y: number; origin: Rect; start: Rect; last: Rect; time: number; velocity: Rect }
function ReadingFrame({ item, frame, size, active, present, onActivate, onPlace, children }: {
  item: ReadingDeskItem; frame: FrameState; size: Size; active: boolean; present: boolean; onActivate: () => void;
  onPlace: (rect: Rect, commit: boolean) => void; children: (grip: ReactNode) => ReactNode;
}) {
  const x = useSpringValue(frame.rect.x, { stiffness: 380, damping: 38, precision: .1 });
  const y = useSpringValue(frame.rect.y, { stiffness: 380, damping: 38, precision: .1 });
  const width = useSpringValue(frame.rect.width, { stiffness: 380, damping: 38, precision: .1 });
  const height = useSpringValue(frame.rect.height, { stiffness: 380, damping: 38, precision: .1 });
  const gesture = useRef<Gesture | undefined>(undefined), keyboardOrigin = useRef<Rect | undefined>(undefined);
  const baseline = useRef(frame.rect);
  const [moving, setMoving] = useState(false);
  const callbacks = useRef({ onActivate, onPlace }); callbacks.current = { onActivate, onPlace };
  const parentSize = useRef(size); parentSize.current = size;
  const snapshot = (): Rect => ({ x: x.get().value, y: y.get().value, width: width.get().value, height: height.get().value });
  function set(rect: Rect, animated = false, velocity?: Rect) {
    for (const [key, spring] of [['x', x], ['y', y], ['width', width], ['height', height]] as const)
      if (animated) spring.animate(rect[key], { velocity: velocity?.[key] ?? spring.get().velocity });
      else spring.set(rect[key], velocity?.[key]);
  }
  function release() {
    const old = gesture.current; gesture.current = undefined; setMoving(false);
    if (old?.element.hasPointerCapture(old.pointer)) old.element.releasePointerCapture(old.pointer);
  }
  function cancel() {
    const origin = gesture.current?.origin || keyboardOrigin.current;
    if (!origin) return;
    const velocity = gesture.current?.velocity; release(); keyboardOrigin.current = undefined;
    const rect = constrain(origin, parentSize.current); set(rect, true, velocity); callbacks.current.onPlace(rect, false);
  }
  useLayoutEffect(() => {
    if (gesture.current || keyboardOrigin.current) return;
    const rect = constrain(frame.rect, size); set(rect, true);
  }, [frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height]);
  useEffect(() => { const interrupted = !!gesture.current || !!keyboardOrigin.current;
    cancel(); baseline.current = constrain(baseline.current, size);
    const rect = interrupted ? baseline.current : constrain(snapshot(), size); set(rect); callbacks.current.onPlace(rect, false); }, [size.width, size.height]);
  useEffect(() => { if (!present) cancel(); }, [present]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    if (!moving) return;
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('keydown', escape, true); };
  }, [moving]);
  useEffect(() => () => { const old = gesture.current; gesture.current = undefined;
    if (old?.element.hasPointerCapture(old.pointer)) old.element.releasePointerCapture(old.pointer); }, []);
  function begin(event: PointerEvent<HTMLButtonElement>, mode: 'move' | 'resize') {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    event.preventDefault(); event.stopPropagation(); callbacks.current.onActivate();
    const start = snapshot(), origin = keyboardOrigin.current || baseline.current;
    x.stop(); y.stop(); width.stop(); height.stop(); keyboardOrigin.current = undefined;
    gesture.current = { pointer: event.pointerId, element: event.currentTarget, mode, x: event.clientX, y: event.clientY,
      origin, start, last: start, time: performance.now(), velocity: { x: 0, y: 0, width: 0, height: 0 } };
    event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); setMoving(true);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const hand = gesture.current;
    if (!hand || hand.pointer !== event.pointerId) return;
    const dx = event.clientX - hand.x, dy = event.clientY - hand.y;
    const rect = hand.mode === 'move' ? constrain({ ...hand.start, x: hand.start.x + dx, y: hand.start.y + dy }, parentSize.current)
      : resizeFrom(hand.start, hand.start.width + dx, hand.start.height + dy, parentSize.current);
    const now = performance.now(), elapsed = (now - hand.time) / 1000;
    if (elapsed > 0) for (const key of ['x', 'y', 'width', 'height'] as const) hand.velocity[key] = clamp((rect[key] - hand.last[key]) / elapsed, -1800, 1800);
    hand.last = rect; hand.time = now; set(rect, false, hand.velocity); callbacks.current.onPlace(rect, false);
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    const hand = gesture.current;
    if (!hand || hand.pointer !== event.pointerId) return;
    const rect = constrain(snapshot(), parentSize.current); baseline.current = rect; release();
    set(rect, true, { x: 0, y: 0, width: 0, height: 0 }); callbacks.current.onPlace(rect, true);
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, mode: 'move' | 'resize') {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && keyboardOrigin.current) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
    if (event.key === 'Enter' && keyboardOrigin.current) { event.preventDefault(); keyboardOrigin.current = undefined;
      baseline.current = snapshot(); callbacks.current.onPlace(snapshot(), true); return; }
    const amount = event.shiftKey ? 2 : 16, dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0,
      dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
    if (!dx && !dy) return;
    if (gesture.current) { const origin = gesture.current.origin; release(); keyboardOrigin.current = origin; }
    event.preventDefault(); event.stopPropagation(); callbacks.current.onActivate(); keyboardOrigin.current ||= baseline.current;
    const rect = mode === 'move' ? constrain({ ...snapshot(), x: snapshot().x + dx, y: snapshot().y + dy }, parentSize.current)
      : resizeFrom(snapshot(), snapshot().width + dx, snapshot().height + dy, parentSize.current);
    set(rect); callbacks.current.onPlace(rect, false);
  }
  function blur() { if (gesture.current || !document.hasFocus() || document.hidden) cancel(); else if (keyboardOrigin.current) { keyboardOrigin.current = undefined;
    baseline.current = snapshot(); callbacks.current.onPlace(snapshot(), true); } }
  const grip = <button type="button" className="reading-frame-grip" aria-label={`移动${item.name}阅读窗`}
    title="拖动摆放；方向键移动，回车留下，Escape放回" onPointerDown={event => begin(event, 'move')}
    onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current) cancel(); }}
    onKeyDown={event => key(event, 'move')} onBlur={blur}><GripVertical size={16} /></button>;
  return <section className={`reading-desk-frame${active ? ' is-active' : ''}${moving ? ' is-moving' : ''}${item.kind === 'image' ? ' is-image' : ''}`}
    hidden={!frame.open} aria-label={`${item.name}阅读窗`} data-reading-id={item.id}
    data-presence-edge={`reading:${item.id}`} data-presence-edge-label={item.kind === 'image' ? '这张图片' : '这份资料'} data-presence-edge-sides="top right bottom left"
    style={{ transform: `translate3d(${x.value}px,${y.value}px,0)`, width: width.value, height: height.value, zIndex: frame.order }}
    onPointerDownCapture={onActivate} onFocusCapture={onActivate}>
    {children(grip)}
    <button type="button" className="reading-frame-resize" aria-label={`调整${item.name}阅读窗大小`}
      title="拖动改变大小；方向键调整，回车留下，Escape放回" onPointerDown={event => begin(event, 'resize')}
      onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current) cancel(); }}
      onKeyDown={event => key(event, 'resize')} onBlur={blur}><Maximize2 size={13} /></button>
  </section>;
}
