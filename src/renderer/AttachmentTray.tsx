import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MaterialFileCover } from './materials/MaterialFileCover';
import { useSpringValue } from './motion/use-spring';
import './attachment-tray.css';

export interface AttachmentTrayItem {
  /** Stable draft identity, supplied by its original owner. */
  id: string;
  kind: 'image' | 'document' | 'text';
  name: string;
  shortName?: string;
  mediaType?: string;
  image?: { dataUrl: string; width: number; height: number };
}

export interface AttachmentTrayProps {
  items: readonly AttachmentTrayItem[];
  /** The current original reading frame; this is a visual projection only. */
  activeId?: string;
  /** A send in progress locks changes; the same files remain previewable. */
  busy?: boolean;
  disabled?: boolean;
  onOpen: (id: string) => void;
  onRemove?: (id: string) => void;
  /** Adopt this complete order synchronously, then persist via the draft owner. */
  onReorder?: (orderedIds: string[]) => void;
}

type Bounds = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
type Flight = { item: AttachmentTrayItem; origin: Bounds };
type Gesture = { id: string; pointer: number; startX: number; startY: number; origin: Bounds; order: string[]; moved: boolean };

const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);
function shortName(item: AttachmentTrayItem) {
  const name = (item.shortName || item.name).replace(/\.[a-z\d]{1,8}$/i, '');
  const points = Array.from(name);
  return points.length > 10 ? points.slice(0, 9).join('') + '…' : name;
}

function AttachmentMark({ item }: { item: AttachmentTrayItem }) {
  return item.kind === 'image' && item.image
    ? <img className="attachment-tray-thumbnail" src={item.image.dataUrl} width={item.image.width} height={item.image.height} alt="" draggable={false} />
    : <MaterialFileCover mediaType={item.mediaType} size="regular" coverKey={item.id} />;
}

/** A slot stays in the row while its contents follow a pointer. Neighbours
 * retarget the existing spring, including an immediate change of direction. */
function AttachmentSlot({ children, lifted, frozen, register, id, active }: {
  children: ReactNode; lifted: boolean; frozen: boolean; id: string; active: boolean;
  register: (id: string, node: HTMLLIElement | null) => void;
}) {
  const node = useRef<HTMLLIElement>(null), previous = useRef<{ x: number; y: number } | undefined>(undefined);
  const x = useSpringValue(0, { stiffness: 420, damping: 38, precision: .1 });
  const y = useSpringValue(0, { stiffness: 420, damping: 38, precision: .1 });
  useLayoutEffect(() => {
    const element = node.current;
    if (!element) return;
    const next = { x: element.offsetLeft, y: element.offsetTop }, prior = previous.current;
    previous.current = next;
    if (frozen) { x.stop(); y.stop(); return; }
    if (lifted) { x.set(0); y.set(0); return; }
    if (prior && (prior.x !== next.x || prior.y !== next.y)) {
      x.set(x.get().value + prior.x - next.x, x.get().velocity);
      y.set(y.get().value + prior.y - next.y, y.get().velocity);
      x.animate(0); y.animate(0);
    }
  });
  useEffect(() => { if (!frozen && !lifted) { x.animate(0); y.animate(0); } }, [frozen, lifted]);
  return <li ref={element => { node.current = element; register(id, element); }}
    className={`attachment-tray-slot${lifted ? ' is-placeholder' : ''}`} data-attachment-id={id} data-active={active || undefined}>
    <div className="attachment-tray-tile" style={{ transform: `translate3d(${x.value}px,${y.value}px,0)` }}>{children}</div>
  </li>;
}

/** Presentation and local trial placement only. Opening, removing, and saving
 * an order stay with the App's existing file/draft owners. */
export function AttachmentTray(props: AttachmentTrayProps) {
  const callbacks = useRef(props); callbacks.current = props;
  const tray = useRef<HTMLUListElement>(null), slots = useRef(new Map<string, HTMLLIElement>());
  const gesture = useRef<Gesture | undefined>(undefined);
  const [held, setHeld] = useState<string>(), [preview, renderPreview] = useState<string[]>();
  const previewOrder = useRef<string[] | undefined>(undefined), [flight, renderFlight] = useState<Flight>();
  const flightRef = useRef<Flight | undefined>(undefined), settling = useRef(0), clickSuppressedUntil = useRef(0);
  const [announcement, announce] = useState('');
  const x = useSpringValue(0, { stiffness: 440, damping: 40, precision: .1 });
  const y = useSpringValue(0, { stiffness: 440, damping: 40, precision: .1 });
  const ids = props.items.map(item => item.id), idsKey = JSON.stringify(ids);
  const announcedSources = useRef(ids);
  const byId = new Map(props.items.map(item => [item.id, item]));
  const order = preview && preview.length === ids.length && preview.every(id => byId.has(id)) ? preview : ids;
  const locked = !!props.busy || !!props.disabled;
  const canReorder = !locked && !!props.onReorder && ids.length > 1;

  function setPreview(next?: string[]) { previewOrder.current = next; renderPreview(next); }
  function clearFlight() {
    settling.current++; x.stop(); y.stop();
    flightRef.current = undefined; renderFlight(undefined); setHeld(undefined); setPreview(undefined);
  }
  function release(pointer: number) {
    if (tray.current?.hasPointerCapture(pointer)) tray.current.releasePointerCapture(pointer);
  }
  function preserveFocus(id: string, previous: Element | null) {
    const wasOurs = !!previous && !!tray.current?.contains(previous);
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!document.hasFocus() || callbacks.current.disabled || active !== previous && !(wasOurs && active === document.body)) return;
      slots.current.get(id)?.querySelector<HTMLButtonElement>('.attachment-tray-open')?.focus({ preventScroll: true });
    });
  }
  function settle() {
    const moving = flightRef.current;
    if (!moving) { setHeld(undefined); setPreview(undefined); return; }
    const token = ++settling.current;
    requestAnimationFrame(() => {
      if (token !== settling.current) return;
      const target = slots.current.get(moving.item.id)?.getBoundingClientRect();
      if (!target) { clearFlight(); return; }
      let remaining = 2;
      const rested = () => { if (--remaining === 0 && token === settling.current) clearFlight(); };
      x.animate(target.left - moving.origin.left, { onRest: rested });
      y.animate(target.top - moving.origin.top, { onRest: rested });
    });
  }
  function cancel() {
    const current = gesture.current;
    if (!current) return false;
    gesture.current = undefined; clickSuppressedUntil.current = performance.now() + 400;
    setPreview(undefined); release(current.pointer); settle();
    if (current.moved) announce('已放回原来的顺序');
    return true;
  }
  function begin(event: PointerEvent<HTMLButtonElement>, item: AttachmentTrayItem) {
    if (event.button !== 0 || !event.isPrimary || props.disabled) return;
    clickSuppressedUntil.current = 0;
    // A busy draft is still readable, but does not start a write gesture.
    if (!canReorder) return;
    event.preventDefault(); event.stopPropagation();
    if (gesture.current) cancel();
    const currentFlight = flightRef.current;
    const visual = currentFlight?.item.id === item.id
      ? { ...currentFlight.origin, left: currentFlight.origin.left + x.get().value, top: currentFlight.origin.top + y.get().value }
      : event.currentTarget.closest('.attachment-tray-tile')!.getBoundingClientRect();
    clearFlight();
    event.currentTarget.focus({ preventScroll: true });
    gesture.current = { id: item.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      origin: { left: visual.left, top: visual.top, width: visual.width, height: visual.height }, order: [...ids], moved: false };
    setHeld(item.id); tray.current?.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLUListElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    event.preventDefault(); event.stopPropagation();
    if (!current.moved) {
      current.moved = true;
      const item = callbacks.current.items.find(candidate => candidate.id === current.id);
      if (!item) { cancel(); return; }
      const next = { item, origin: current.origin }; flightRef.current = next; renderFlight(next);
      setPreview([...current.order]);
    }
    x.set(dx); y.set(dy);
    const next = [...(previewOrder.current || current.order)];
    const center = { x: current.origin.left + dx + current.origin.width / 2, y: current.origin.top + dy + current.origin.height / 2 };
    let nearest = next.indexOf(current.id), distance = Infinity;
    next.forEach((id, index) => {
      const rect = slots.current.get(id)?.getBoundingClientRect();
      if (!rect) return;
      const gap = Math.hypot(center.x - rect.left - rect.width / 2, center.y - rect.top - rect.height / 2);
      if (gap < distance) { distance = gap; nearest = index; }
    });
    const from = next.indexOf(current.id);
    if (nearest !== from) { next.splice(from, 1); next.splice(nearest, 0, current.id); setPreview(next); }
  }
  function end(event: PointerEvent<HTMLUListElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (callbacks.current.disabled || !callbacks.current.items.some(item => item.id === current.id)
      || current.moved && (callbacks.current.busy || !callbacks.current.onReorder)) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
    event.preventDefault(); event.stopPropagation(); gesture.current = undefined;
    clickSuppressedUntil.current = performance.now() + 400; release(current.pointer);
    if (!current.moved) {
      setHeld(undefined);
      if (!callbacks.current.disabled) callbacks.current.onOpen(current.id);
      return;
    }
    const accepted = previewOrder.current || current.order;
    const previousFocus = document.activeElement;
    let adopted = false;
    try {
      if (!sameOrder(current.order, accepted)) callbacks.current.onReorder?.([...accepted]);
      adopted = true;
      announce(`${shortName(flightRef.current!.item)}，第 ${accepted.indexOf(current.id) + 1} 份，共 ${accepted.length} 份`);
    } finally {
      if (!adopted) setPreview(undefined);
      settle();
    }
    preserveFocus(current.id, previousFocus);
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, item: AttachmentTrayItem) {
    if (!canReorder || !event.altKey || event.ctrlKey || event.metaKey) return;
    const from = ids.indexOf(item.id);
    const target = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? Math.max(0, from - 1)
      : ['ArrowRight', 'ArrowDown'].includes(event.key) ? Math.min(ids.length - 1, from + 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : undefined;
    if (target === undefined) return;
    event.preventDefault(); event.stopPropagation();
    if (target === from) return;
    const previousFocus = document.activeElement;
    if (gesture.current) cancel();
    clearFlight(); const next = [...ids]; next.splice(from, 1); next.splice(target, 0, item.id);
    callbacks.current.onReorder?.(next);
    announce(`${shortName(item)}，第 ${target + 1} 份，共 ${ids.length} 份`);
    preserveFocus(item.id, previousFocus);
  }
  const actions = useRef({ cancel, clearFlight }); actions.current = { cancel, clearFlight };
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && actions.current.cancel()) { event.preventDefault(); event.stopPropagation(); }
    };
    const interrupted = () => { if (!actions.current.cancel() && flightRef.current) actions.current.clearFlight(); };
    const visibility = () => { if (document.hidden) interrupted(); };
    window.addEventListener('keydown', key, true); window.addEventListener('blur', interrupted); window.addEventListener('resize', interrupted);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      const active = gesture.current; gesture.current = undefined; if (active) release(active.pointer);
      settling.current++; window.removeEventListener('keydown', key, true); window.removeEventListener('blur', interrupted); window.removeEventListener('resize', interrupted);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (announcedSources.current.length !== ids.length || ids.some(id => !announcedSources.current.includes(id))) announce('');
    announcedSources.current = ids;
    if (gesture.current && (!canReorder || !sameOrder(gesture.current.order, ids))) cancel();
    if (flightRef.current && !ids.includes(flightRef.current.item.id)) clearFlight();
  }, [idsKey, canReorder]);

  if (!props.items.length) return null;
  return <>
    <ul ref={tray} className={`attachment-tray${flight ? ' is-sorting' : ''}`} aria-label="附件" aria-busy={props.busy || undefined} data-reorderable={canReorder || undefined}
      onPointerMove={move} onPointerUp={end} onPointerCancel={event => { if (gesture.current?.pointer === event.pointerId) cancel(); }}
      onLostPointerCapture={event => { if (gesture.current?.pointer === event.pointerId) cancel(); }}>
      {order.map(id => {
        const item = byId.get(id)!;
        return <AttachmentSlot key={id} id={id} active={props.activeId === id} lifted={flight?.item.id === id} frozen={held === id}
          register={(key, node) => { if (node) slots.current.set(key, node); else slots.current.delete(key); }}>
          <button type="button" className="attachment-tray-open" disabled={props.disabled} aria-label={`预览${item.name}`} aria-current={props.activeId === id || undefined} title={item.name}
            aria-keyshortcuts={canReorder ? 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+Home Alt+End' : undefined}
            onPointerDown={event => begin(event, item)} onDragStart={event => event.preventDefault()} onKeyDown={event => keyDown(event, item)}
            onClick={event => {
              if (event.detail > 0 && performance.now() < clickSuppressedUntil.current) return;
              if (gesture.current) cancel();
              if (flightRef.current) clearFlight();
              props.onOpen(id);
            }}>
            <span className="attachment-tray-mark"><AttachmentMark item={item} /></span>
            <span className="attachment-tray-name">{shortName(item)}</span>
          </button>
          {props.onRemove && !props.busy && <button type="button" className="attachment-tray-remove" disabled={props.disabled} aria-label={`移除${item.name}`} title="移除"
            onClick={() => {
              if (gesture.current) cancel();
              if (flightRef.current) clearFlight();
              props.onRemove?.(id);
            }}><X size={11} aria-hidden="true" /></button>}
        </AttachmentSlot>;
      })}
    </ul>
    <span className="attachment-tray-announcement" role="status" aria-live="polite">{announcement}</span>
    {flight && createPortal(<div className="attachment-tray-flight" aria-hidden="true" style={{ position: 'fixed',
      left: flight.origin.left, top: flight.origin.top, width: flight.origin.width, height: flight.origin.height,
      transform: `translate3d(${x.value}px,${y.value}px,0)`, pointerEvents: 'none', zIndex: 1000 } as CSSProperties}>
      <span className="attachment-tray-open"><span className="attachment-tray-mark"><AttachmentMark item={flight.item} /></span>
        <span className="attachment-tray-name">{shortName(flight.item)}</span></span>
    </div>, document.body)}
  </>;
}
