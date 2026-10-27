import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSpringValue } from './motion/use-spring';
import { edgeCompanionArtwork } from './edge-companion-assets';
import { clampEdgeSprite, edgeRatio, edgeSpriteBox, localEdgePoint, nearestEdgeDock, readEdgeCompanionScene, resolveEdgePlacement,
  sameEdgePlacement, type EdgeCompanionDock, type EdgeCompanionPlacement, type EdgeCompanionScene, type EdgePoint } from './edge-companion-geometry';
import './edge-companion.css';

export type { EdgeCompanionPlacement } from './edge-companion-geometry';
type Figure = Pick<EdgeCompanionDock, 'artwork' | 'mirrored' | 'rotation' | 'width' | 'height' | 'support'>;
type Grab = { id: number; node: HTMLButtonElement; start: EdgePoint; offset: EdgePoint;
  before: EdgeCompanionPlacement; moved: boolean; last: EdgePoint; dropContact: EdgePoint; time: number; velocity: EdgePoint };
const quietMotion = () => document.hidden || document.documentElement.dataset.motion === 'reduced'
  || matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface EdgeCompanionProps {
  /** Existing app surface. Marked paper wrappers remain the docking owners. */
  host?: HTMLElement | null;
  anchor: HTMLElement | null;
  character?: string;
  placement?: EdgeCompanionPlacement;
  onPlacementChange?: (placement: EdgeCompanionPlacement) => void;
  /** Compatibility with the original composer-only appearance preference. */
  ratio?: number;
  onRatioChange?: (ratio: number) => void;
  text?: string;
  replyAvailable?: boolean;
  onOpenReply?: () => void;
  busy?: boolean;
  onCall?: () => void;
  name?: string;
  hidden?: boolean;
  active?: boolean;
}

/** Transient presentation only: no second conversation, source or memory owner. */
export function EdgeCompanion(props: EdgeCompanionProps) {
  const character = props.character ?? 'sakiko';
  return edgeCompanionArtwork(character) ? <EdgeCompanionFigure key={character} {...props} character={character} /> : null;
}

function EdgeCompanionFigure({ host: givenHost, anchor, character = 'sakiko', placement, onPlacementChange,
  ratio = .82, onRatioChange, text = '', replyAvailable = false, onOpenReply, busy = false, onCall, name, hidden = false, active = true }: EdgeCompanionProps) {
  const host = givenHost ?? anchor?.closest<HTMLElement>('.app-main') ?? anchor;
  const preferred = placement ?? { edgeId: anchor?.dataset.presenceEdge || 'composer', side: 'top' as const, ratio: edgeRatio(ratio) };
  const home = useRef(preferred), external = `${preferred.edgeId}:${preferred.side}:${preferred.ratio}`;
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), grab = useRef<Grab | undefined>(undefined);
  const scene = useRef<EdgeCompanionScene | undefined>(undefined), target = useRef<EdgeCompanionDock | undefined>(undefined);
  const [figure, setFigure] = useState<Figure | undefined>(undefined), visual = useRef(figure); visual.current = figure;
  const [visible, setVisible] = useState(false), [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false), [acknowledged, setAcknowledged] = useState(false);
  const [imageReady, setImageReady] = useState<Record<string, { body: boolean; tail: boolean; whole: boolean }>>({});
  const [failedAsset, setFailedAsset] = useState('');
  const callbacks = useRef({ onPlacementChange, onRatioChange }); callbacks.current = { onPlacementChange, onRatioChange };
  const x = useSpringValue(0, { stiffness: 320, damping: 35, precision: .08 });
  const y = useSpringValue(0, { stiffness: 320, damping: 35, precision: .08 });
  const tail = useSpringValue(0, { stiffness: 210, damping: 26, precision: .01, bounds: [-3, 3] });
  const operation = useRef(0), tailOperation = useRef(0), skipPointerClick = useRef(false), initialized = useRef(false);
  const pending = useRef<EdgeCompanionPlacement | undefined>(undefined), refresh = useRef<() => void>(() => {});
  const helpId = useId(), artwork = figure?.artwork, artworkId = artwork?.id;
  const currentArtwork = useRef(artworkId); currentArtwork.current = artworkId;
  const label = name ?? artwork?.label ?? edgeCompanionArtwork(character)?.label ?? '';
  function quietTail() { tailOperation.current++; tail.set(0); }
  function acknowledge() {
    const ticket = ++tailOperation.current;
    if (!artwork?.tail || failedAsset === artwork.id || quietMotion()) { tail.set(0); return; }
    tail.animate(2.4, { onRest: () => { if (ticket === tailOperation.current) tail.animate(0); } });
  }
  function imageLoaded(part: 'body' | 'tail' | 'whole', id: string, ready = true) {
    setImageReady(value => value[id]?.[part] === ready ? value : ({ ...value,
      [id]: { ...(value[id] || { body: false, tail: false, whole: false }), [part]: ready } }));
  }
  function layerError(id: string) { if (currentArtwork.current === id) { quietTail(); setFailedAsset(id); setOpen(false); } }
  function release() {
    const current = grab.current;
    if (!current) return;
    grab.current = undefined; setDragging(false);
    if (current.node.hasPointerCapture(current.id)) current.node.releasePointerCapture(current.id);
  }
  function currentContact(): EdgePoint {
    const sprite = visual.current;
    const support = sprite?.support ?? { x: 0, y: 0 };
    return { x: x.get().value + support.x, y: y.get().value + support.y };
  }
  function place(dock: EdgeCompanionDock, commit = false, velocity?: EdgePoint, immediate = false) {
    const ticket = ++operation.current;
    if (commit) pending.current = dock.placement;
    const previous = visual.current;
    if (!immediate) {
      const beforeX = x.get(), beforeY = y.get();
      const nextShape = edgeSpriteBox(dock.artwork, dock.mirrored, Math.max(dock.width, dock.height), dock.rotation);
      const beforeShape = previous ? edgeSpriteBox(previous.artwork, previous.mirrored, Math.max(previous.width, previous.height), previous.rotation) : nextShape;
      const origin = { x: beforeX.value + (previous?.support ?? beforeShape.support).x - dock.support.x,
        y: beforeY.value + (previous?.support ?? beforeShape.support).y - dock.support.y };
      const start = scene.current ? clampEdgeSprite(scene.current, dock.artwork, dock.mirrored, dock.width, dock.height, origin, dock.rotation) : origin;
      x.set(start.x, beforeX.velocity); y.set(start.y, beforeY.velocity);
      const ink = nextShape.ink, bounds = scene.current?.bounds;
      const limited = (at: number, to: number, speed: number, first: number, last: number) => {
        const travel = speed * (to - at) >= 0 ? Math.abs(to - at) : speed < 0 ? at - first : last - at;
        return Math.sign(speed) * Math.min(Math.abs(speed), Math.max(0, travel) * 10);
      };
      // Carry momentum while retaining room to brake before the safe edge.
      velocity = { x: limited(start.x, dock.x, velocity?.x ?? beforeX.velocity, bounds ? bounds.left - ink.left : -Infinity, bounds ? bounds.right - ink.right : Infinity),
        y: limited(start.y, dock.y, velocity?.y ?? beforeY.velocity, bounds ? bounds.top - ink.top : -Infinity, bounds ? bounds.bottom - ink.bottom : Infinity) };
    }
    target.current = dock; setFigure(dock); setVisible(true);
    let remaining = 2;
    const rested = () => {
      if (--remaining || ticket !== operation.current || !commit || document.hidden || grab.current) return;
      const actual = scene.current && resolveEdgePlacement(scene.current, character, dock.placement);
      if (!actual || !sameEdgePlacement(actual.placement, dock.placement)) return;
      home.current = dock.placement; pending.current = undefined;
      if (callbacks.current.onPlacementChange) callbacks.current.onPlacementChange(dock.placement);
      else callbacks.current.onRatioChange?.(dock.placement.ratio);
    };
    if (immediate) { x.set(dock.x); y.set(dock.y); rested(); rested(); }
    else { x.animate(dock.x, { velocity: velocity?.x, onRest: rested }); y.animate(dock.y, { velocity: velocity?.y, onRest: rested }); }
  }
  function returnHome(immediate = false) {
    operation.current++; quietTail(); pending.current = undefined;
    const current = grab.current;
    if (current) { home.current = current.before; skipPointerClick.current = true; release(); }
    const currentScene = scene.current;
    if (!currentScene) return;
    const dock = resolveEdgePlacement(currentScene, character, home.current)
      ?? nearestEdgeDock(currentScene, character, currentContact());
    if (dock) place(dock, false, undefined, immediate); else { x.stop(); y.stop(); setVisible(false); }
  }
  useLayoutEffect(() => {
    if (!host || hidden || !active) { operation.current++; release(); quietTail(); setVisible(false); setOpen(false); return; }
    let frame = 0, motionUntil = 0, surfaces: HTMLElement[] = [];
    const resize = new ResizeObserver(() => request());
    const followMotion = () => {
      if (performance.now() < motionUntil && surfaces.some(element => element.getAnimations().some(animation => animation.playState === 'running'))) schedule();
    };
    const measure = () => {
      frame = 0;
      if (!host.isConnected || !host.getClientRects().length || document.hidden) { setVisible(false); return; }
      const next = readEdgeCompanionScene(host, anchor); scene.current = next;
      const elements = next.surfaces.map(surface => surface.element);
      if (elements.length !== surfaces.length || elements.some((element, index) => element !== surfaces[index])) {
        resize.disconnect(); resize.observe(host); for (const element of elements) if (element !== host) resize.observe(element); surfaces = elements;
      }
      const current = grab.current, sprite = visual.current;
      if (current && sprite) {
        const point = clampEdgeSprite(next, sprite.artwork, sprite.mirrored, sprite.width, sprite.height, { x: x.get().value, y: y.get().value }, sprite.rotation);
        x.set(point.x); y.set(point.y);
        followMotion(); return;
      }
      const intended = pending.current ?? home.current;
      const intendedDock = resolveEdgePlacement(next, character, intended);
      // A disappearing paper cancels the unfinished drop. A visible fallback
      // must not become the saved owner of that interrupted gesture.
      if (pending.current && !intendedDock) { pending.current = undefined; operation.current++; }
      const dock = intendedDock ?? resolveEdgePlacement(next, character, home.current)
        ?? nearestEdgeDock(next, character, initialized.current ? currentContact() : { x: next.bounds.right - 80, y: next.bounds.bottom - 80 });
      if (!dock) { operation.current++; x.stop(); y.stop(); setVisible(false); setOpen(false); followMotion(); return; }
      const previous = target.current;
      if (!initialized.current || !previous || previous.artwork.id !== dock.artwork.id || previous.mirrored !== dock.mirrored || previous.rotation !== dock.rotation
        || Math.abs(previous.x - dock.x) > .25 || Math.abs(previous.y - dock.y) > .25
        || Math.abs(previous.width - dock.width) > .25 || Math.abs(previous.height - dock.height) > .25) {
        // Following the current paper is not another persisted placement.
        place(dock, !!pending.current, undefined, true); initialized.current = true;
      } else setVisible(true);
      followMotion();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const request = () => { motionUntil = performance.now() + 650; schedule(); };
    refresh.current = request;
    const mutations = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element && record.target.closest('.edge-companion-stage')))) request();
    });
    mutations.observe(host, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'inert', 'data-presence-edge', 'data-presence-edge-sides', 'data-presence-edge-disabled', 'data-presence-edge-pose', 'data-presence-edge-point'] });
    const visibility = () => { if (document.hidden) { operation.current++; returnHome(true); x.stop(); y.stop(); quietTail(); setVisible(false); setOpen(false); } else request(); };
    const paperGesture = (event: globalThis.PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) { quietTail(); request(); } };
    const paperInput = (event: globalThis.KeyboardEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) quietTail(); };
    const paperMotion = (event: globalThis.PointerEvent) => { if (!(event.target instanceof Node && root.current?.contains(event.target))) request(); };
    host.addEventListener('pointerdown', paperGesture, true); host.addEventListener('pointermove', paperMotion, true);
    host.addEventListener('keydown', paperInput, true);
    host.addEventListener('pointerup', request, true); host.addEventListener('animationstart', request, true); host.addEventListener('transitionrun', request, true);
    window.addEventListener('resize', request); document.addEventListener('scroll', request, true); document.addEventListener('visibilitychange', visibility);
    measure();
    return () => { if (frame) cancelAnimationFrame(frame); refresh.current = () => {}; resize.disconnect(); mutations.disconnect();
      host.removeEventListener('pointerdown', paperGesture, true); host.removeEventListener('pointermove', paperMotion, true);
      host.removeEventListener('keydown', paperInput, true);
      host.removeEventListener('pointerup', request, true); host.removeEventListener('animationstart', request, true); host.removeEventListener('transitionrun', request, true);
      window.removeEventListener('resize', request); document.removeEventListener('scroll', request, true); document.removeEventListener('visibilitychange', visibility);
      operation.current++; pending.current = undefined; release(); x.stop(); y.stop(); quietTail(); scene.current = undefined; target.current = undefined; initialized.current = false; };
  }, [host, anchor, hidden, active, character]);
  useLayoutEffect(() => { home.current = preferred; operation.current++; pending.current = undefined; release(); target.current = undefined; refresh.current(); }, [external]);
  useEffect(() => {
    // Warm only this character's admitted poses before a drop changes stance.
    // These are local artwork requests, with no conversation or document input.
    const poses = [...new Map((['stretch', 'loaf', 'curl'] as const).flatMap(pose =>
      [edgeCompanionArtwork(character, false, pose), edgeCompanionArtwork(character, true, pose)])
      .filter(pose => !!pose).map(pose => [pose.id, pose])).values()];
    let active = true;
    const images = poses.flatMap(pose => ([['body', pose.body], ['tail', pose.tail], ['whole', pose.whole]] as const)
      .flatMap(([part, source]) => {
        if (!source) return [];
        const image = new Image(); image.decoding = 'async';
        image.onload = () => { if (active) imageLoaded(part, pose.id); };
        image.src = source; return [image];
      }));
    return () => { active = false; for (const image of images) { image.onload = null; image.removeAttribute('src'); } };
  }, [character]);
  useEffect(() => { setOpen(false); quietTail(); setFailedAsset(''); }, [artworkId]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true); return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => { if (!acknowledged) return; const timer = setTimeout(() => setAcknowledged(false), 900); return () => clearTimeout(timer); }, [acknowledged]);
  const cancelGesture = useRef(returnHome); cancelGesture.current = returnHome;
  useEffect(() => {
    const blur = () => { if (grab.current || pending.current) cancelGesture.current(true); quietTail(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && (grab.current || pending.current)) { event.preventDefault(); event.stopPropagation(); setOpen(false); cancelGesture.current(); } };
    window.addEventListener('blur', blur); window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('blur', blur); window.removeEventListener('keydown', escape, true); };
  }, []);
  function begin(event: PointerEvent<HTMLButtonElement>) {
    const currentScene = scene.current, sprite = visual.current;
    if (!currentScene || !sprite || event.button !== 0 || !event.isPrimary || grab.current) return;
    event.preventDefault(); event.stopPropagation(); operation.current++; pending.current = undefined; skipPointerClick.current = false; setOpen(false); quietTail();
    event.currentTarget.focus({ preventScroll: true });
    const at = localEdgePoint(currentScene, event.clientX, event.clientY), beforeX = x.stop(), beforeY = y.stop();
    x.set(beforeX.value, beforeX.velocity); y.set(beforeY.value, beforeY.velocity); event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = { id: event.pointerId, node: event.currentTarget, start: at, offset: { x: at.x - beforeX.value, y: at.y - beforeY.value },
      before: home.current, moved: false, last: { x: beforeX.value, y: beforeY.value }, dropContact: currentContact(), time: event.timeStamp, velocity: { x: beforeX.velocity, y: beforeY.velocity } };
    setDragging(true);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = grab.current, currentScene = scene.current, sprite = visual.current;
    if (!current || current.id !== event.pointerId || !currentScene || !sprite) return;
    event.preventDefault(); event.stopPropagation(); const at = localEdgePoint(currentScene, event.clientX, event.clientY);
    current.moved ||= Math.hypot(at.x - current.start.x, at.y - current.start.y) > 4;
    // Keep the whole drawing visible while the hand can still reach an outer
    // edge. The intended contact, rather than a clipped old stance, picks it.
    current.dropContact = { x: at.x - current.offset.x + sprite.support.x, y: at.y - current.offset.y + sprite.support.y };
    const point = clampEdgeSprite(currentScene, sprite.artwork, sprite.mirrored, sprite.width, sprite.height, { x: at.x - current.offset.x, y: at.y - current.offset.y }, sprite.rotation);
    const elapsed = Math.max(1, event.timeStamp - current.time) / 1000;
    current.velocity = { x: Math.max(-1200, Math.min(1200, (point.x - current.last.x) / elapsed)), y: Math.max(-1200, Math.min(1200, (point.y - current.last.y) / elapsed)) };
    current.last = point; current.time = event.timeStamp; x.set(point.x, current.velocity.x); y.set(point.y, current.velocity.y);
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const current = grab.current, currentScene = scene.current, sprite = visual.current;
    if (!current || current.id !== event.pointerId || !currentScene || !sprite) return;
    const next = nearestEdgeDock(currentScene, character, current.dropContact);
    if (current.moved) skipPointerClick.current = true;
    const moved = current.moved, velocity = current.velocity; release(); if (moved && next) place(next, true, velocity); else returnHome();
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); returnHome(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const currentScene = scene.current, current = target.current; if (!currentScene || !current) return;
    event.preventDefault(); event.stopPropagation(); release(); setOpen(false); quietTail();
    const horizontal = current.placement.side === 'top' || current.placement.side === 'bottom';
    const along = !current.surface.point && ['Home', 'End', ...(horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'])].includes(event.key);
    if (current.surface.point && ['Home', 'End'].includes(event.key)) return;
    const next = along ? resolveEdgePlacement(currentScene, character, { ...current.placement,
      ratio: event.key === 'Home' ? 0 : event.key === 'End' ? 1 : edgeRatio(current.placement.ratio
        + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) * (event.shiftKey ? .01 : .05)) },
      ['Home', 'End'].includes(event.key) ? undefined : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1)
      : nearestEdgeDock(currentScene, character, current.contact,
        { x: event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, y: event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0 });
    if (next) place(next, true);
  }
  if (!host || !figure || !artwork || hidden || !active) return null;
  const failed = failedAsset === artwork.id;
  const sprite = edgeSpriteBox(artwork, figure.mirrored, Math.max(figure.width, figure.height), figure.rotation), hit = sprite.ink;
  const opened = imageReady[artwork.id];
  const ready = !!opened && (failed ? !!artwork.whole && opened.whole : opened.body && (!artwork.tail || opened.tail));
  const bounds = scene.current?.bounds, bubble = open && visible && bounds && (text.trim() || replyAvailable || busy || acknowledged);
  const spaceRight = bounds ? bounds.right - (x.value + figure.width) - 12 : 0, spaceLeft = bounds ? x.value - bounds.left - 12 : 0;
  const bubbleRight = spaceRight >= 120 || spaceRight >= spaceLeft;
  const bubbleWidth = Math.max(80, Math.min(280, bubbleRight ? spaceRight : spaceLeft, bounds ? bounds.right - bounds.left : 280));
  const bubbleX = bounds ? Math.max(bounds.left, Math.min(bounds.right - bubbleWidth, bubbleRight ? x.value + figure.width + 8 : x.value - bubbleWidth - 8)) : 0;
  const bubbleY = bounds ? Math.max(bounds.top, Math.min(bounds.bottom - 160, y.value + figure.height * .2)) : 0;
  const turn = figure.rotation === 90 ? `translate(${sprite.canvasHeight}px,0) rotate(90deg)`
    : figure.rotation === -90 ? `translate(0,${sprite.canvasWidth}px) rotate(-90deg)`
      : figure.rotation === 180 ? `translate(${sprite.canvasWidth}px,${sprite.canvasHeight}px) rotate(180deg)` : '';
  const facing = figure.mirrored ? `translate(${sprite.canvasWidth}px,0) scaleX(-1)` : '';
  return createPortal(<div ref={root} className="edge-companion-stage" data-dragging={dragging}>
    <div className="edge-companion" data-character={artwork.character} data-asset={artwork.id} data-mirrored={figure.mirrored} data-rotation={figure.rotation} data-edge-side={target.current?.placement.side} data-dragging={dragging}
      style={{ width: figure.width, height: figure.height, left: x.value, top: y.value,
        visibility: visible && (ready || document.activeElement === button.current) ? 'visible' : 'hidden' }}>
      <button ref={button} type="button" className="edge-companion-cat" aria-label={`轻唤${label}，当前位置：${target.current?.surface.label || '边缘'}；可拖动`} aria-describedby={helpId}
        style={{ left: hit.left, top: hit.top, width: hit.right - hit.left, height: hit.bottom - hit.top }}
        onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => { if (grab.current?.id === event.pointerId) returnHome(); }}
        onLostPointerCapture={event => { if (grab.current?.id === event.pointerId) returnHome(); }} onKeyDown={key}
        onClick={event => { event.stopPropagation(); if (event.detail > 0 && skipPointerClick.current) { skipPointerClick.current = false; return; }
          setOpen(true); setAcknowledged(true); acknowledge(); if (!busy) onCall?.(); }}>
        <span className="edge-companion-artwork" aria-hidden="true"
          style={{ left: -hit.left, top: -hit.top, width: sprite.canvasWidth, height: sprite.canvasHeight,
            visibility: ready ? 'visible' : 'hidden', transformOrigin: '0 0', transform: `${turn} ${facing}`.trim() || 'none' }}>
          {failed && artwork.whole ? <img key={`${artwork.id}-whole`} src={artwork.whole} alt="" draggable={false} onLoad={() => imageLoaded('whole', artwork.id)} onError={() => imageLoaded('whole', artwork.id, false)} /> : !failed ? <>
            {artwork.tail && artwork.tailOrigin && <img key={`${artwork.id}-tail`} className="edge-companion-tail" src={artwork.tail} alt="" draggable={false}
              style={{ transform: `rotate(${tail.value}deg)`, transformOrigin: `${artwork.tailOrigin[0] * 100}% ${artwork.tailOrigin[1] * 100}%` }} onLoad={() => imageLoaded('tail', artwork.id)} onError={() => layerError(artwork.id)} />}
            <img key={`${artwork.id}-body`} src={artwork.body} alt="" draggable={false} onLoad={() => imageLoaded('body', artwork.id)} onError={() => layerError(artwork.id)} />
          </> : null}
        </span>
      </button>
    </div>
    <span id={helpId} className="sr-only">拖到可见的书、灯、座位、人物落点或纸张和窗口边缘，放手吸附。方向键沿边移动，另一方向选择落点，Home、End到两端，Escape放回。回车轻唤。</span>
    {bubble && <div className="edge-companion-bubble" role="status" aria-live="polite" aria-busy={busy} data-right={bubbleRight}
      style={{ left: bubbleX, top: bubbleY, width: bubbleWidth, maxHeight: Math.max(32, Math.min(160, bounds.bottom - bubbleY)) }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); quietTail(); button.current?.focus({ preventScroll: true }); } }}>
      {text.trim() ? <span>{text.trim()}</span> : replyAvailable && !busy ? <button type="button" className="edge-companion-open-reply" onClick={onOpenReply}>到对话里接着看</button> : <span>…</span>}<button type="button" aria-label="收起这句话" onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
        onClick={event => { event.stopPropagation(); setOpen(false); quietTail(); if (event.detail === 0) button.current?.focus({ preventScroll: true }); }}><X size={16} /></button>
    </div>}
  </div>, host);
}
