import { edgeCompanionArtwork, type EdgeCompanionArtwork, type EdgeCompanionPose } from './edge-companion-assets';

export type PresenceEdgeSide = 'top' | 'right' | 'bottom' | 'left';
export type EdgeCompanionRotation = -90 | 0 | 90 | 180;
export interface EdgeCompanionPlacement { edgeId: string; side: PresenceEdgeSide; ratio: number }
export interface EdgePoint { x: number; y: number }
export interface EdgeBox { left: number; top: number; right: number; bottom: number }
export interface PresenceEdgeSurface {
  id: string; label: string; element: HTMLElement; sides: PresenceEdgeSide[]; box: EdgeBox;
  pose?: EdgeCompanionPose;
  point?: boolean;
  sceneAnchor?: boolean;
  visibleBox?: EdgeBox;
}
export interface EdgeCompanionScene {
  host: HTMLElement; bounds: EdgeBox; surfaces: PresenceEdgeSurface[]; obstacles: EdgeBox[];
  scaleX: number; scaleY: number; origin: EdgePoint;
}
export interface EdgeCompanionDock {
  placement: EdgeCompanionPlacement; surface: PresenceEdgeSurface; artwork: EdgeCompanionArtwork;
  mirrored: boolean; rotation: EdgeCompanionRotation; x: number; y: number; width: number; height: number; ink: EdgeBox;
  contact: EdgePoint; support: EdgePoint;
}

const sides: PresenceEdgeSide[] = ['top', 'right', 'bottom', 'left'];
export const edgeRatio = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : .82));
export const sameEdgePlacement = (first: EdgeCompanionPlacement, second: EdgeCompanionPlacement) =>
  first.edgeId === second.edgeId && first.side === second.side && Math.abs(first.ratio - second.ratio) < .0001;
const overlap = (first: EdgeBox, second: EdgeBox) => first.left < second.right && first.right > second.left
  && first.top < second.bottom && first.bottom > second.top;

/** Coordinates describe current presentation only. No document text, grants,
 * calendar facts or source bodies are copied into this scene. */
export function readEdgeCompanionScene(host: HTMLElement, anchor?: HTMLElement | null): EdgeCompanionScene {
  const bounds = host.getBoundingClientRect(), scaleX = bounds.width / host.clientWidth || 1,
    scaleY = bounds.height / host.clientHeight || 1;
  const scene: EdgeCompanionScene = { host, bounds: { left: host.scrollLeft, top: host.scrollTop,
    right: host.scrollLeft + host.clientWidth, bottom: host.scrollTop + host.clientHeight },
    surfaces: [], obstacles: [], scaleX, scaleY, origin: { x: bounds.left, y: bounds.top } };
  const local = (rect: DOMRect): EdgeBox => ({ left: (rect.left - bounds.left) / scaleX + host.scrollLeft,
    right: (rect.right - bounds.left) / scaleX + host.scrollLeft,
    top: (rect.top - bounds.top) / scaleY + host.scrollTop, bottom: (rect.bottom - bounds.top) / scaleY + host.scrollTop });
  const clips = new Map<Element, { rect: DOMRect; x: boolean; y: boolean }>();
  const visibleRect = (element: Element, original: DOMRect): DOMRect | undefined => {
    let left = original.left, right = original.right, top = original.top, bottom = original.bottom;
    for (let parent = element.parentElement; parent && parent !== host; parent = parent.parentElement) {
      let clip = clips.get(parent);
      if (!clip) { const style = getComputedStyle(parent); clip = { rect: parent.getBoundingClientRect(),
        x: style.overflowX !== 'visible', y: style.overflowY !== 'visible' }; clips.set(parent, clip); }
      if (clip.x) { left = Math.max(left, clip.rect.left); right = Math.min(right, clip.rect.right); }
      if (clip.y) { top = Math.max(top, clip.rect.top); bottom = Math.min(bottom, clip.rect.bottom); }
      if (right <= left || bottom <= top) return undefined;
    }
    return new DOMRect(left, top, right - left, bottom - top);
  };
  const seen = new Set<string>();
  const elements = [host, ...host.querySelectorAll<HTMLElement>('[data-presence-edge]'), ...(anchor && host.contains(anchor) ? [anchor] : [])];
  for (const element of elements) {
    const id = element.dataset.presenceEdge || (element === host ? 'window' : element === anchor ? 'composer' : '');
    if (!id || seen.has(id) || !element.isConnected || !element.getClientRects().length || element.closest('[hidden],[inert]')
      || element.dataset.presenceEdgeDisabled === 'true') continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden') continue;
    const exposed = element === host ? rect : visibleRect(element, rect);
    if (!exposed) continue;
    if (element.dataset.presenceEdgeScene === 'true') {
      const cover = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + 1)
        .find(node => !node.closest('.edge-companion-stage'));
      if (cover?.closest('.titlebar,.page-content,.notes-content,.workspace,.reading-desk-frame,.keep-index,.keep-object,.keep-empty,.cover-home,.settings-panel,.companion-settings-rows')) continue;
    }
    const allowed = element.dataset.presenceEdgeSides?.split(/[ ,]+/).filter((side): side is PresenceEdgeSide => sides.includes(side as PresenceEdgeSide));
    const pose = element.dataset.presenceEdgePose;
    scene.surfaces.push({ id, label: element.dataset.presenceEdgeLabel || (element === host ? '窗口' : '这张纸'), element,
      ...(pose === 'loaf' || pose === 'curl' ? { pose } : {}),
      ...(element.dataset.presenceEdgePoint === 'true' ? { point: true } : {}),
      ...(element.dataset.presenceEdgeScene === 'true' ? { sceneAnchor: true } : {}),
      visibleBox: element === host ? scene.bounds : local(exposed),
      sides: allowed?.length ? allowed : sides, box: element === host ? scene.bounds : local(rect) });
    seen.add(id);
  }
  const selector = 'button,input,textarea,select,[contenteditable="true"],h1,h2,h3,h4,.katex,canvas,figure,.material-page-image>img,.reading-image-body>img,.reading-image-header>strong,.materials-filename,[data-presence-edge-avoid],p,blockquote,pre';
  const textRange = document.createRange();
  for (const element of host.querySelectorAll<HTMLElement>(selector)) {
    // An inactive reading window is inert but its original page stays visible.
    // Its text/image still needs protection while another window is in front.
    if (element.closest('.edge-companion-stage,[hidden]') || !element.getClientRects().length) continue;
    // The map is the receiving background. Its full-size canvas must not
    // forbid every window edge; its actual controls still reserve their space.
    if (element.tagName === 'CANVAS' && element.closest('.campus-v2-stage')) continue;
    // Invisible furniture hit regions are the same physical setting a cat can
    // sit on. Visible controls, menus and text remain protected obstacles.
    if (element.classList.contains('scene-object-hotspot')) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const actual = element.classList.contains('scene-object-hotspot') ? element.querySelector('polygon')
      : element.classList.contains('reading-frame-grip') ? element.querySelector('svg') : element;
    if (!actual) continue;
    let rect = actual.getBoundingClientRect();
    if (actual instanceof HTMLImageElement && actual.naturalWidth && actual.naturalHeight && style.objectFit === 'contain') {
      const factor = Math.min(rect.width / actual.naturalWidth, rect.height / actual.naturalHeight);
      const width = actual.naturalWidth * factor, height = actual.naturalHeight * factor;
      rect = new DOMRect(rect.left + (rect.width - width) / 2, rect.top + (rect.height - height) / 2, width, height);
    }
    const clipped = visibleRect(element, rect);
    if (!clipped) continue;
    rect = clipped;
    const box = local(rect);
    if (!rect.width || !rect.height || !overlap(box, scene.bounds)) continue;
    if (['P', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4'].includes(element.tagName)
      || element.matches('.materials-filename,.reading-image-header>strong')) {
      textRange.selectNodeContents(element);
      for (const line of textRange.getClientRects()) if (line.width && line.height) {
        const visible = { left: Math.max(line.left, rect.left), top: Math.max(line.top, rect.top),
          right: Math.min(line.right, rect.right), bottom: Math.min(line.bottom, rect.bottom) };
        if (visible.right > visible.left && visible.bottom > visible.top) scene.obstacles.push(local(new DOMRect(visible.left, visible.top,
          visible.right - visible.left, visible.bottom - visible.top)));
      }
    } else scene.obstacles.push(box);
  }
  return scene;
}

export function localEdgePoint(scene: EdgeCompanionScene, clientX: number, clientY: number): EdgePoint {
  return { x: (clientX - scene.origin.x) / scene.scaleX + scene.host.scrollLeft,
    y: (clientY - scene.origin.y) / scene.scaleY + scene.host.scrollTop };
}

function inkOffsets(artwork: EdgeCompanionArtwork, mirrored: boolean, width: number, height: number, padding = 24): EdgeBox {
  const [canvasWidth, canvasHeight] = artwork.canvas;
  const source = artwork.bounds || [0, 0, canvasWidth, canvasHeight];
  // A little room around registered ink also contains the approved small tail arc.
  const left = Math.max(0, source[0] - padding) / canvasWidth, right = Math.min(canvasWidth, source[2] + padding) / canvasWidth;
  return { left: width * (mirrored ? 1 - right : left), right: width * (mirrored ? 1 - left : right),
    top: height * Math.max(0, source[1] - padding) / canvasHeight, bottom: height * Math.min(canvasHeight, source[3] + padding) / canvasHeight };
}

export function edgeSpriteBox(artwork: EdgeCompanionArtwork, mirrored: boolean, major = 104, rotation: EdgeCompanionRotation = 0) {
  const factor = major / Math.max(...artwork.canvas), canvasWidth = artwork.canvas[0] * factor, canvasHeight = artwork.canvas[1] * factor;
  const sx = (mirrored ? 1 - (artwork.supportX ?? .5) : artwork.supportX ?? .5) * canvasWidth, sy = artwork.supportY * canvasHeight;
  const ink = inkOffsets(artwork, mirrored, canvasWidth, canvasHeight);
  const sourceInk = inkOffsets(artwork, mirrored, canvasWidth, canvasHeight, 0);
  const rotateInk = (box: EdgeBox): EdgeBox => rotation === 90
    ? { left: canvasHeight - box.bottom, right: canvasHeight - box.top, top: box.left, bottom: box.right }
    : rotation === -90 ? { left: box.top, right: box.bottom, top: canvasWidth - box.right, bottom: canvasWidth - box.left }
      : rotation === 180 ? { left: canvasWidth - box.right, right: canvasWidth - box.left, top: canvasHeight - box.bottom, bottom: canvasHeight - box.top } : box;
  const edgeInk = rotateInk(sourceInk);
  if (rotation === 90) return { width: canvasHeight, height: canvasWidth, canvasWidth, canvasHeight,
    edgeInk, support: { x: canvasHeight - sy, y: sx }, ink: rotateInk(ink) };
  if (rotation === -90) return { width: canvasHeight, height: canvasWidth, canvasWidth, canvasHeight,
    edgeInk, support: { x: sy, y: canvasWidth - sx }, ink: rotateInk(ink) };
  if (rotation === 180) return { width: canvasWidth, height: canvasHeight, canvasWidth, canvasHeight, edgeInk,
    support: { x: canvasWidth - sx, y: canvasHeight - sy }, ink: rotateInk(ink) };
  return { width: canvasWidth, height: canvasHeight, canvasWidth, canvasHeight, edgeInk, support: { x: sx, y: sy }, ink };
}

function subtract(ranges: [number, number][], first: number, last: number): [number, number][] {
  return ranges.flatMap(([start, end]) => last <= start || first >= end ? [[start, end] as [number, number]]
    : [...(first > start ? [[start, Math.min(end, first)] as [number, number]] : []),
      ...(last < end ? [[Math.max(start, last), end] as [number, number]] : [])]);
}
const nearest = (value: number, ranges: [number, number][]) => ranges.map(([start, end]) => Math.max(start, Math.min(end, value)))
  .sort((first, second) => Math.abs(first - value) - Math.abs(second - value))[0];

function exposedEdgeOwner(scene: EdgeCompanionScene, point: EdgePoint): HTMLElement | undefined {
  const clientX = scene.origin.x + (point.x - scene.host.scrollLeft) * scene.scaleX;
  const clientY = scene.origin.y + (point.y - scene.host.scrollTop) * scene.scaleY;
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (element.closest('.edge-companion-stage')) continue;
    const owner = element.closest<HTMLElement>('[data-presence-edge]');
    if (owner && scene.host.contains(owner)) return owner;
  }
  return undefined;
}

function surfaceCandidates(scene: EdgeCompanionScene, character: string, surface: PresenceEdgeSurface, side: PresenceEdgeSide,
  point?: EdgePoint, ratio?: number, alongDirection?: -1 | 1): EdgeCompanionDock[] {
  const horizontal = side === 'top' || side === 'bottom', box = surface.box, exposed = surface.visibleBox || box;
  const result: EdgeCompanionDock[] = [];
  const windowEdge = surface.element === scene.host;
  const preferredRotation: EdgeCompanionRotation = horizontal ? (windowEdge ? side === 'top' ? 180 : 0 : side === 'bottom' ? 180 : 0)
    : (side === 'left') === !windowEdge ? -90 : 90;
  const rotations: EdgeCompanionRotation[] = surface.point ? [0] : horizontal ? [preferredRotation, preferredRotation === 0 ? 180 : 0]
    : [preferredRotation, preferredRotation === 90 ? -90 : 90];
  const poses = rotations.flatMap(rotation => (horizontal ? [false, true] : [false]).map(dockLeft => {
    const sourceRight = horizontal ? dockLeft !== (rotation === 180) : rotation === -90;
    return { rotation, dockLeft, sourceRight, artwork: edgeCompanionArtwork(character, sourceRight, surface.pose) };
  }));
  for (const { dockLeft, artwork, sourceRight, rotation } of poses) {
    if (!artwork) continue;
    const mirrors = [artwork.mirrorSafe && artwork.facing !== (sourceRight ? 'right' : 'left')];
    for (const mirrored of mirrors) {
      const length = horizontal ? box.right - box.left : box.bottom - box.top;
      const fixed = side === 'top' ? box.top : side === 'bottom' ? box.bottom : side === 'left' ? box.left : box.right;
      if (fixed < (horizontal ? exposed.top : exposed.left) - .5 || fixed > (horizontal ? exposed.bottom : exposed.right) + .5) continue;
      let major = Math.min(104, Math.max(64, length * .22)), sprite = edgeSpriteBox(artwork, mirrored, major, rotation);
      // A window has no visible receiving frame outside its clipped viewport.
      // Put the actual silhouette on that edge; the old paw anchor deliberately
      // hid part of the cat outside it. Paper edges keep their original support.
      const support = () => windowEdge ? { x: side === 'left' ? sprite.edgeInk.left : side === 'right' ? sprite.edgeInk.right : sprite.support.x,
        y: side === 'top' ? sprite.edgeInk.top : side === 'bottom' ? sprite.edgeInk.bottom : sprite.support.y } : sprite.support;
      const offsets = (): EdgeBox => { const contact = support(), ink = windowEdge ? sprite.edgeInk : sprite.ink;
        return { left: ink.left - contact.x, right: ink.right - contact.x, top: ink.top - contact.y, bottom: ink.bottom - contact.y }; };
      let offset = offsets();
      const boundFirst = horizontal ? scene.bounds.top : scene.bounds.left, boundLast = horizontal ? scene.bounds.bottom : scene.bounds.right;
      if (!windowEdge) {
        const before = Math.max(0, -(horizontal ? offset.top : offset.left)), after = Math.max(0, horizontal ? offset.bottom : offset.right);
        const fit = Math.min(1, before ? (fixed - boundFirst) / before : 1, after ? (boundLast - fixed) / after : 1);
        if (fit < 1 && major * fit >= 64) { major *= fit; sprite = edgeSpriteBox(artwork, mirrored, major, rotation); offset = offsets(); }
      }
      const crossFirst = fixed + (horizontal ? offset.top : offset.left), crossLast = fixed + (horizontal ? offset.bottom : offset.right);
      if (crossFirst < boundFirst - .01 || crossLast > boundLast + .01) continue;
      const pointAlong = horizontal ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2;
      const start = surface.point ? pointAlong : Math.max(horizontal ? box.left + 6 : box.top + 6, horizontal ? exposed.left : exposed.top, horizontal ? scene.bounds.left : scene.bounds.top)
        - (horizontal ? offset.left : offset.top);
      const end = surface.point ? pointAlong : Math.min(horizontal ? box.right - 6 : box.bottom - 6, horizontal ? exposed.right : exposed.bottom, horizontal ? scene.bounds.right : scene.bounds.bottom)
        - (horizontal ? offset.right : offset.bottom);
      if (surface.point && (pointAlong + (horizontal ? offset.left : offset.top) < (horizontal ? scene.bounds.left : scene.bounds.top)
        || pointAlong + (horizontal ? offset.right : offset.bottom) > (horizontal ? scene.bounds.right : scene.bounds.bottom))) continue;
      if (surface.point && (pointAlong < (horizontal ? exposed.left : exposed.top) || pointAlong > (horizontal ? exposed.right : exposed.bottom))) continue;
      if (end < start) continue;
      let ranges: [number, number][] = [[horizontal && dockLeft ? start : horizontal ? (start + end) / 2 : start,
        horizontal && dockLeft ? (start + end) / 2 : end]];
      for (const obstacle of scene.obstacles) {
        if ((horizontal ? obstacle.bottom <= crossFirst || obstacle.top >= crossLast : obstacle.right <= crossFirst || obstacle.left >= crossLast)) continue;
        ranges = subtract(ranges, (horizontal ? obstacle.left - offset.right : obstacle.top - offset.bottom) - 3,
          (horizontal ? obstacle.right - offset.left : obstacle.bottom - offset.top) + 3);
        if (!ranges.length) break;
      }
      // A lower paper's rectangle still exists while another paper covers it.
      // Only its actually exposed edge can hold the companion.
      const inside = (along: number): EdgePoint => ({ x: horizontal ? along : fixed + (side === 'left' ? 1 : -1),
        y: horizontal ? fixed + (side === 'top' ? 1 : -1) : along });
      // Decorative support points have already passed the actual foreground
      // hit check. A transparent full-page wrapper is not a paper covering it.
      for (const other of surface.sceneAnchor ? [] : scene.surfaces) {
        if (other.element === scene.host || other.element === surface.element || other.element.contains(surface.element)) continue;
        const first = Math.max(start, horizontal ? other.box.left : other.box.top), last = Math.min(end, horizontal ? other.box.right : other.box.bottom);
        if (last <= first || (horizontal ? fixed < other.box.top || fixed > other.box.bottom : fixed < other.box.left || fixed > other.box.right)) continue;
        const owner = exposedEdgeOwner(scene, inside((first + last) / 2));
        if (owner && (owner === other.element || other.element.contains(owner))) {
          ranges = subtract(ranges, (horizontal ? other.box.left - offset.right : other.box.top - offset.bottom) - 2,
            (horizontal ? other.box.right - offset.left : other.box.bottom - offset.top) + 2);
        }
      }
      const wanted = ratio !== undefined ? start + edgeRatio(ratio) * (end - start) : point
        ? horizontal ? point.x : point.y
        : (start + end) / 2;
      const directed = alongDirection === 1 ? ranges.filter(([, last]) => last >= wanted).map(([first, last]) => [Math.max(first, wanted), last] as [number, number])
        : alongDirection === -1 ? ranges.filter(([first]) => first <= wanted).map(([first, last]) => [first, Math.min(last, wanted)] as [number, number]) : ranges;
      const along = nearest(wanted, directed);
      if (along === undefined) continue;
      const owner = exposedEdgeOwner(scene, inside(along));
      if (!surface.sceneAnchor && owner && owner !== surface.element && !owner.contains(surface.element)) continue;
      const contact = { x: horizontal ? along : fixed, y: horizontal ? fixed : along };
      const dockSupport = support(), x = contact.x - dockSupport.x, y = contact.y - dockSupport.y;
      result.push({ placement: { edgeId: surface.id, side, ratio: end > start ? edgeRatio((along - start) / (end - start)) : .5 },
        surface, artwork, mirrored, rotation, x, y, width: sprite.width, height: sprite.height,
        ink: { left: x + sprite.edgeInk.left, right: x + sprite.edgeInk.right, top: y + sprite.edgeInk.top, bottom: y + sprite.edgeInk.bottom }, contact, support: dockSupport,
      });
    }
  }
  return result;
}

const distance = (dock: EdgeCompanionDock, point: EdgePoint) => (dock.contact.x - point.x) ** 2 + (dock.contact.y - point.y) ** 2;

export function resolveEdgePlacement(scene: EdgeCompanionScene, character: string, placement: EdgeCompanionPlacement,
  alongDirection?: -1 | 1): EdgeCompanionDock | undefined {
  const surface = scene.surfaces.find(value => value.id === placement.edgeId && value.sides.includes(placement.side));
  if (!surface) return undefined;
  return surfaceCandidates(scene, character, surface, placement.side, undefined, placement.ratio, alongDirection)
    .sort((first, second) => Math.abs(first.placement.ratio - placement.ratio) - Math.abs(second.placement.ratio - placement.ratio))[0];
}

/** Magnetic contact uses actual surfaced edges and the current paw anchor. */
export function nearestEdgeDock(scene: EdgeCompanionScene, character: string, point: EdgePoint,
  direction?: EdgePoint): EdgeCompanionDock | undefined {
  const candidates = scene.surfaces.flatMap(surface => surface.sides.flatMap(side => surfaceCandidates(scene, character, surface, side, point)));
  const eligible = direction ? candidates.filter(dock => (dock.contact.x - point.x) * direction.x
    + (dock.contact.y - point.y) * direction.y > 8) : candidates;
  return eligible.sort((first, second) => distance(first, point) - distance(second, point))[0];
}

export function clampEdgeSprite(scene: EdgeCompanionScene, artwork: EdgeCompanionArtwork, mirrored: boolean,
  width: number, height: number, point: EdgePoint, rotation: EdgeCompanionRotation = 0): EdgePoint {
  const sprite = edgeSpriteBox(artwork, mirrored, Math.max(width, height), rotation), ink = sprite.ink;
  return { x: Math.max(scene.bounds.left - ink.left, Math.min(scene.bounds.right - ink.right, point.x)),
    y: Math.max(scene.bounds.top - ink.top, Math.min(scene.bounds.bottom - ink.bottom, point.y)) };
}
