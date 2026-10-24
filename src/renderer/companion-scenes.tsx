import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { CompanionMoment } from './companion-variants';
import type { AppearancePalette } from './appearance';
import { useSpringValue } from './motion/use-spring';

export type SceneCharacter = 'sakiko' | 'mutsumi' | 'anon' | 'tomori' | 'uika' | 'umiri' | 'nyamu' | 'rana' | 'soyo' | 'taki';
export type SceneLight = 'morning' | 'dusk' | 'night';
export interface SceneCalibration {
  seat: readonly [number, number];
  ground: readonly [number, number];
  bodyBounds: readonly [number, number, number, number];
  safeTextBoundary: number;
  support: 'window-seat' | 'desk-chair' | 'sofa' | 'floor';
  floorContact?: 'feet' | 'kneeling';
  contactShadow: 'included' | 'separate' | 'none';
  contourComplete: boolean;
  hitPolygon: string;
  travel: number;
  slope: number;
  perspective: number;
}
export interface CompanionSceneArtwork extends SceneCalibration {
  id: string;
  light: SceneLight;
  palette: AppearancePalette;
  positionKey: string;
  mother: string;
  background?: string;
  figure?: string;
  mask?: string;
  shadow?: string;
  foreground?: string;
  width: number;
  height: number;
}

// Every layer has the mother's complete canvas. No layer independently covers
// the viewport, and a tight portrait is never fitted into this coordinate space.
const images = import.meta.glob('../../前端视觉创新设计/运行素材/companion/scenes/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const file = (stem: string, layer: string) => images[`../../前端视觉创新设计/运行素材/companion/scenes/${stem}-${layer}.png`];
interface SceneRegistration extends Omit<SceneCalibration, 'contactShadow'> {
  schemaVersion: 1;
  id: string;
  character: SceneCharacter;
  activity: Exclude<CompanionMoment, 'night'>;
  light: SceneLight;
  palette: AppearancePalette;
  width: number;
  height: number;
  mother: string;
  background: string;
  figure?: string;
  mask?: string;
  shadow?: string;
  foreground?: string;
  contactShadow: { mode: SceneCalibration['contactShadow'] };
  review: { approvedByPrimary: boolean };
}
const registrationFiles = import.meta.glob('../../前端视觉创新设计/运行素材/companion/scenes/*.scene.json', { eager: true, import: 'default' }) as Record<string, SceneRegistration>;
const registeredFile = (name: string | undefined) => name && /^[-a-z0-9]+\.png$/.test(name)
  ? images[`../../前端视觉创新设计/运行素材/companion/scenes/${name}`] : undefined;
const registrations = Object.values(registrationFiles).filter(item => {
  if (!item || typeof item !== 'object') return false;
  const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
  return item.schemaVersion === 1 && item.review?.approvedByPrimary === true
    && typeof item.id === 'string' && /^[a-z0-9-]+$/.test(item.id)
    && registeredFile(item.mother) && registeredFile(item.background) && (registeredFile(item.figure) || registeredFile(item.mask))
    && (!item.figure || registeredFile(item.figure)) && (!item.mask || registeredFile(item.mask))
    && (!item.shadow || registeredFile(item.shadow)) && (!item.foreground || registeredFile(item.foreground))
    && Number.isFinite(item.width) && item.width > 0 && Number.isFinite(item.height) && item.height > 0
    && Array.isArray(item.seat) && item.seat.length === 2 && item.seat.every(unit)
    && Array.isArray(item.ground) && item.ground.length === 2 && item.ground.every(unit)
    && Array.isArray(item.bodyBounds) && item.bodyBounds.length === 4 && item.bodyBounds.every(unit) && unit(item.safeTextBoundary)
    && item.bodyBounds[0] < item.bodyBounds[2] && item.bodyBounds[1] < item.bodyBounds[3]
    && Number.isFinite(item.travel) && item.travel >= 0 && Number.isFinite(item.slope) && Number.isFinite(item.perspective)
    && (item.travel > 0 || item.perspective === 0)
    && /^[\d.%,\s]+$/.test(item.hitPolygon)
    && ['window-seat', 'desk-chair', 'sofa', 'floor'].includes(item.support)
    && (item.support === 'floor'
      ? ['feet', 'kneeling'].includes(item.floorContact ?? '') && item.travel === 0 && item.slope === 0 && item.perspective === 0
        && item.seat.every((value, index) => value === item.ground[index])
      : item.floorContact === undefined)
    && typeof item.contourComplete === 'boolean' && ['included', 'separate', 'none'].includes(item.contactShadow?.mode)
    && (item.contactShadow.mode !== 'separate' || registeredFile(item.shadow));
});
// Coordinates refer to the original 1536×1024 canvas. Each surviving master
// was inspected independently; a new pose must bring its own calibration.
export const companionSceneCalibrations: Record<string, SceneCalibration> = {
  'sakiko-chat': { seat: [.853, .637], ground: [.747, .94], bodyBounds: [.6855, .1387, .9525, .9502], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: true, travel: .024, slope: .14, perspective: .004,
    hitPolygon: '78% 14%, 85% 14%, 89% 21%, 92% 38%, 95% 55%, 94% 64%, 83% 65%, 81% 72%, 81% 91%, 79% 95%, 73% 95%, 72% 93%, 69% 94%, 68% 91%, 72% 85%, 72% 68%, 73% 57%, 74% 39%, 73% 26%, 75% 18%' },
  'mutsumi-chat': { seat: [.854, .64], ground: [.675, .96], bodyBounds: [.5885, .1299, .987, .9795], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: true, travel: .022, slope: .13, perspective: .003,
    hitPolygon: '78% 13%, 86% 14%, 90% 27%, 96% 42%, 98% 53%, 94% 64%, 83% 65%, 78% 78%, 76% 94%, 72% 98%, 66% 97%, 65% 94%, 61% 94%, 59% 91%, 63% 85%, 70% 67%, 72% 57%, 74% 39%, 75% 24%' },
  'mutsumi-reading': { seat: [.853, .64], ground: [.675, .96], bodyBounds: [.5885, .1318, .9864, .9795], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: true, travel: .02, slope: .13, perspective: .003,
    hitPolygon: '78% 14%, 86% 14%, 90% 28%, 96% 42%, 98% 53%, 94% 64%, 83% 65%, 78% 78%, 76% 94%, 72% 98%, 66% 97%, 65% 94%, 61% 94%, 59% 91%, 63% 85%, 70% 67%, 72% 57%, 73% 45%, 76% 25%' },
  'mutsumi-night': { seat: [.854, .64], ground: [.674, .96], bodyBounds: [.5866, .1309, .9857, .9795], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: true, travel: .019, slope: .13, perspective: .003,
    hitPolygon: '78% 14%, 86% 14%, 90% 28%, 96% 42%, 98% 53%, 94% 64%, 83% 65%, 78% 78%, 76% 94%, 72% 98%, 66% 97%, 65% 94%, 61% 94%, 59% 91%, 63% 85%, 70% 67%, 73% 57%, 75% 41%, 76% 25%' },
  'anon-chat': { seat: [.86, .638], ground: [.683, .96], bodyBounds: [.6061, .125, 1, .9776], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: false, travel: .024, slope: .12, perspective: .002,
    hitPolygon: '78% 13%, 85% 13%, 91% 24%, 97% 39%, 100% 49%, 98% 61%, 90% 65%, 82% 65%, 78% 77%, 76% 94%, 72% 98%, 66% 97%, 65% 95%, 61% 94%, 60% 91%, 64% 85%, 70% 66%, 73% 56%, 74% 43%, 74% 24%' },
  'anon-reading': { seat: [.86, .638], ground: [.683, .96], bodyBounds: [.6061, .1299, 1, .9786], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: false, travel: .021, slope: .12, perspective: .002,
    hitPolygon: '78% 14%, 85% 14%, 91% 26%, 97% 40%, 100% 50%, 98% 61%, 90% 65%, 82% 65%, 78% 77%, 76% 94%, 72% 98%, 66% 97%, 65% 95%, 61% 94%, 60% 91%, 64% 85%, 70% 66%, 73% 56%, 73% 43%, 74% 26%' },
  'anon-night': { seat: [.86, .638], ground: [.683, .96], bodyBounds: [.6048, .125, .9987, .9795], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: false, travel: .022, slope: .12, perspective: .002,
    hitPolygon: '78% 13%, 85% 13%, 91% 24%, 97% 39%, 100% 49%, 98% 61%, 90% 65%, 82% 65%, 78% 77%, 76% 94%, 72% 98%, 66% 97%, 65% 95%, 61% 94%, 60% 91%, 64% 85%, 70% 66%, 73% 56%, 75% 43%, 75% 24%' },
  'tomori-chat': { seat: [.852, .638], ground: [.678, .96], bodyBounds: [.5879, .1074, .9623, .9893], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: true, travel: .021, slope: .14, perspective: .002,
    hitPolygon: '78% 11%, 85% 13%, 89% 23%, 91% 34%, 94% 48%, 95% 62%, 86% 66%, 81% 66%, 77% 79%, 76% 96%, 72% 99%, 66% 98%, 65% 95%, 60% 94%, 59% 91%, 63% 85%, 70% 67%, 72% 56%, 74% 42%, 73% 24%' },
  'tomori-night': { seat: [.851, .64], ground: [.677, .96], bodyBounds: [.5827, .1357, .9571, .9844], safeTextBoundary: .56,
    support: 'window-seat', contactShadow: 'none', contourComplete: true, travel: .019, slope: .14, perspective: .002,
    hitPolygon: '78% 14%, 85% 14%, 89% 24%, 91% 35%, 94% 49%, 95% 63%, 86% 66%, 81% 66%, 77% 79%, 76% 95%, 72% 99%, 66% 98%, 65% 95%, 60% 94%, 58% 91%, 63% 85%, 70% 67%, 72% 56%, 75% 42%, 74% 25%' },
};
// The corrected master was redrawn on the clean reading-room plate.
const backgroundSources: Record<string, string> = { 'sakiko-chat': 'sakiko-reading' };
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

function seatPositionBounds(artwork: CompanionSceneArtwork): readonly [number, number] {
  if (artwork.support === 'floor' || !artwork.contourComplete || artwork.travel === 0) return [0, 0];
  let minimum = -1, maximum = 1;
  const constrain = (origin: number, derivative: number, lower: number, upper: number) => {
    if (Math.abs(derivative) < .00001) return;
    const a = (lower - origin) / derivative, b = (upper - origin) / derivative;
    minimum = Math.max(minimum, Math.min(a, b)); maximum = Math.min(maximum, Math.max(a, b));
  };
  const [left, top, right, bottom] = artwork.bodyBounds;
  for (const x of [left, right]) constrain(x, artwork.travel + artwork.perspective * (x - artwork.seat[0]), artwork.safeTextBoundary, 1);
  for (const y of [top, bottom]) constrain(y, artwork.travel * artwork.width / artwork.height * artwork.slope + artwork.perspective * (y - artwork.seat[1]), 0, 1);
  return minimum <= maximum ? [minimum, maximum] : [0, 0];
}

export function companionSceneArtwork(character: string, moment: CompanionMoment = 'chat', light: SceneLight = 'morning', palette: AppearancePalette = 'apricot'): CompanionSceneArtwork | undefined {
  const activity = moment === 'night' ? 'chat' : moment;
  const registration = registrations.find(item => item.character === character && item.activity === activity && item.light === light && item.palette === palette);
  if (registration) return {
    ...registration, contactShadow: registration.contactShadow.mode, positionKey: `${character}-${activity}`,
    mother: registeredFile(registration.mother)!, background: registeredFile(registration.background),
    figure: registeredFile(registration.figure), mask: registeredFile(registration.mask),
    shadow: registration.contactShadow.mode === 'separate' ? registeredFile(registration.shadow) : undefined,
    foreground: registeredFile(registration.foreground),
  };
  const candidates = [...new Set([
    `${character}-${activity}-${light}-${palette}`,
    ...(light === 'night' && activity === 'chat' && palette === 'rain' ? [`${character}-night`] : []),
    ...(light === 'morning' && palette === 'apricot' ? [`${character}-${activity}`] : []),
  ])];
  const id = candidates.find(stem => file(stem, 'mother') && companionSceneCalibrations[stem]);
  if (!id) return undefined;
  const sceneLight: SceneLight = /-night(?:-|$)/.test(id) ? 'night' : 'morning';
  const artworkPalette: AppearancePalette = sceneLight === 'night' ? 'rain' : 'apricot';
  const room = sceneLight === 'night' ? 'sakiko-night'
    : activity === 'reading' ? 'sakiko-reading' : 'sakiko-chat';
  return {
    id, light: sceneLight, palette: artworkPalette, positionKey: `${character}-${activity}`, width: 1536, height: 1024,
    ...companionSceneCalibrations[id],
    mother: file(id, 'mother'), background: file(backgroundSources[id] || id, 'background') || file(room, 'background'), mask: file(id, 'mask') || file(id, 'figure'),
    shadow: companionSceneCalibrations[id].contactShadow === 'separate' ? file(id, 'shadow') : undefined, foreground: file(id, 'foreground'),
  };
}

export function companionPaletteLight(palette: AppearancePalette): SceneLight {
  return palette === 'rain' ? 'night' : palette === 'violet' ? 'dusk' : 'morning';
}

export function companionSceneLights(character: string, moment: CompanionMoment = 'chat', palette: AppearancePalette = 'apricot') {
  return (['morning', 'dusk', 'night'] as const).filter(light => companionSceneArtwork(character, moment, light, palette)?.light === light);
}

const portraits = import.meta.glob('../../前端视觉创新设计/运行素材/companion/portraits/*-portrait.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function companionScenePortrait(character: string) {
  return portraits[`../../前端视觉创新设计/运行素材/companion/portraits/${character}-portrait.png`];
}

/** Position follows a calibrated support surface; floor poses stay at their contact pivot. */
export function CompanionSceneStage({ artwork, name, position, onCommit, showFigure = true, interactive = true, quiet = false, reducedMotion = false, previewOnly = false }: {
  artwork: CompanionSceneArtwork;
  name: string;
  position: number;
  onCommit: (position: number) => void;
  showFigure?: boolean;
  interactive?: boolean;
  quiet?: boolean;
  reducedMotion?: boolean;
  previewOnly?: boolean;
}) {
  const svgId = useId().replace(/:/g, '');
  const instructionsId = `${svgId}-instructions`;
  const viewport = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const bounds = seatPositionBounds(artwork);
  const currentBounds = useRef(bounds);
  currentBounds.current = bounds;
  const legal = (next: number) => Math.max(currentBounds.current[0], Math.min(currentBounds.current[1], clamp(next)));
  const spring = useSpringValue(legal(position), { bounds, precision: .0005, stiffness: 300, damping: 31, reducedMotion });
  const value = spring.value;
  const retreat = useSpringValue(quiet ? 1 : 0, { bounds: [0, 1], precision: .001, stiffness: 220, damping: 28, reducedMotion });
  const [moving, setMoving] = useState(false);
  const [failedLayer, setFailedLayer] = useState(false);
  const [failedMother, setFailedMother] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const latest = useRef({ onCommit, position, artwork, quiet, previewOnly });
  latest.current = { onCommit, position, artwork, quiet, previewOnly };
  const gesture = useRef<{ pointerId: number; x: number; y: number; origin: number; savedOrigin: number; scale: number; tangentX: number; tangentY: number; sampledAt: number; sampledValue: number; velocity: number;
    assetId: string; previewOnly: boolean; onCommit: (position: number) => void } | undefined>(undefined);
  const keyboardOrigin = useRef<number | undefined>(undefined);
  const pendingOrigin = useRef<number | undefined>(undefined);
  const pendingTarget = useRef<number | undefined>(undefined);
  const layered = !!artwork.background && (!!artwork.figure || !!artwork.mask) && !failedLayer;
  const canMove = interactive && showFigure && layered && artwork.contourComplete && bounds[1] - bounds[0] > .0001;
  // The room and every layer share this one camera. Content retreat changes
  // the room's framing, never the aspect ratio of the person or furniture.
  const fullScale = size.height / artwork.height;
  // Clear the whole legal seat interval. Framing must stay fixed while a
  // pointer controls the person, including wide poses beside a narrow paper.
  const bodyLeft = Math.min(...bounds.map(at => artwork.bodyBounds[0]
    + at * (artwork.travel + (artwork.bodyBounds[0] - artwork.seat[0]) * artwork.perspective)));
  const paperEdge = 44 + Math.min(800, Math.max(0, size.width - 330));
  const clearScale = Math.max(0, size.width - paperEdge - 24) / ((1 - bodyLeft) * artwork.width);
  const sideScale = Math.min(fullScale, Math.max(360, size.height * .7) / artwork.height, clearScale);
  const scale = fullScale + (sideScale - fullScale) * retreat.value;
  const stageX = size.width - artwork.width * scale;
  const stageY = (size.height - artwork.height * scale) * .5 * retreat.value;
  const apply = (next: number, velocity = 0) => spring.set(legal(next), velocity);
  function commit(next: number) {
    try { latest.current.onCommit(next); setSaveError(false); }
    catch { spring.animate(legal(latest.current.position)); setSaveError(true); }
  }
  function settle(next: number, velocity = spring.get().velocity, save = true) {
    const target = legal(next);
    const assetId = latest.current.artwork.id;
    if (save) pendingOrigin.current ??= legal(latest.current.position);
    else pendingOrigin.current = undefined;
    pendingTarget.current = save ? target : undefined;
    if (save && latest.current.previewOnly) commit(target);
    spring.animate(target, { velocity, ...(save ? { onRest: () => {
      pendingOrigin.current = undefined; pendingTarget.current = undefined;
      if (latest.current.artwork.id === assetId && !latest.current.previewOnly) commit(target);
    } } : {}) });
  }
  function cancelPending() {
    if (pendingOrigin.current === undefined) return;
    const origin = pendingOrigin.current;
    settle(origin, spring.get().velocity, false);
    if (latest.current.previewOnly) commit(legal(origin));
  }
  function finish(cancel: boolean) {
    const active = gesture.current;
    if (!active) return;
    cancel ||= active.assetId !== latest.current.artwork.id;
    gesture.current = undefined;
    setMoving(false);
    if (cancel) {
      settle(active.savedOrigin, spring.get().velocity, false);
      if (active.previewOnly) active.onCommit(active.savedOrigin);
    }
    else settle(spring.get().value, performance.now() - active.sampledAt < 100 ? active.velocity : 0);
    retreat.animate(latest.current.quiet ? 1 : 0);
    if (handle.current?.hasPointerCapture(active.pointerId)) handle.current.releasePointerCapture(active.pointerId);
  }
  function cancelKeyboard() {
    if (keyboardOrigin.current === undefined) return;
    settle(keyboardOrigin.current, spring.get().velocity, false); keyboardOrigin.current = undefined;
  }
  function acceptKeyboard() {
    if (keyboardOrigin.current === undefined) return;
    keyboardOrigin.current = undefined; settle(spring.get().value);
  }
  useEffect(() => {
    if (!canMove) { cancelKeyboard(); finish(true); cancelPending(); }
  }, [canMove]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const initialSize = element.getBoundingClientRect();
    setSize({ width: initialSize.width, height: initialSize.height });
    const observer = new ResizeObserver(([entry]) => {
      finish(true);
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    finish(true); keyboardOrigin.current = undefined; pendingOrigin.current = undefined; pendingTarget.current = undefined;
    setFailedLayer(false); setFailedMother(false); setSaveError(false); apply(position);
  }, [artwork.id]);
  useEffect(() => {
    if (!gesture.current && keyboardOrigin.current === undefined) {
      if (previewOnly && pendingOrigin.current !== undefined && pendingTarget.current === legal(position)) return;
      pendingOrigin.current = undefined; pendingTarget.current = undefined; spring.animate(legal(position));
    }
  }, [position]);
  useEffect(() => { finish(true); cancelKeyboard(); cancelPending(); retreat.animate(quiet ? 1 : 0); }, [quiet]);
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' && (gesture.current || keyboardOrigin.current !== undefined || pendingOrigin.current !== undefined)) {
        event.preventDefault(); event.stopPropagation(); finish(true); cancelKeyboard(); cancelPending();
      }
    };
    const blur = () => { cancelKeyboard(); finish(true); cancelPending(); };
    window.addEventListener('keydown', escape, true); window.addEventListener('blur', blur);
    const hidden = () => { if (document.hidden) { finish(true); cancelKeyboard(); cancelPending(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!canMove || gesture.current || event.button !== 0 || !event.isPrimary || !scale) return;
    event.preventDefault(); event.stopPropagation();
    keyboardOrigin.current = undefined;
    event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    const snapshot = spring.stop(); retreat.stop(); pendingOrigin.current = undefined; pendingTarget.current = undefined;
    const rect = viewport.current!.getBoundingClientRect(), u = snapshot.value;
    const worldX = (event.clientX - rect.left - stageX) / scale;
    const worldY = (event.clientY - rect.top - stageY) / scale;
    const originalX = (worldX - artwork.seat[0] * artwork.width - u * artwork.travel * artwork.width) / (1 + u * artwork.perspective);
    const originalY = (worldY - artwork.seat[1] * artwork.height - u * artwork.travel * artwork.width * artwork.slope) / (1 + u * artwork.perspective);
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: u, savedOrigin: legal(latest.current.position), scale,
      assetId: artwork.id, previewOnly, onCommit: latest.current.onCommit,
      sampledAt: performance.now(), sampledValue: u, velocity: snapshot.velocity,
      tangentX: artwork.travel * artwork.width + artwork.perspective * originalX,
      tangentY: artwork.travel * artwork.width * artwork.slope + artwork.perspective * originalY };

    setMoving(true);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    // Project both pointer axes onto the actual seat's tangent. The character
    // remains on the seat even if the hand moves vertically off the surface.
    const dx = (event.clientX - active.x) / active.scale, dy = (event.clientY - active.y) / active.scale;
    const delta = (dx * active.tangentX + dy * active.tangentY) / (active.tangentX ** 2 + active.tangentY ** 2);
    const next = legal(active.origin + delta), now = performance.now(), elapsed = (now - active.sampledAt) / 1000;
    const velocity = elapsed > 0 ? (next - active.sampledValue) / elapsed : active.velocity;
    active.velocity = Math.max(-8, Math.min(8, velocity)); active.sampledAt = now; active.sampledValue = next;
    apply(next, active.velocity);
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!canMove) return;
    if (event.key === 'Escape' && keyboardOrigin.current !== undefined) {
      event.preventDefault(); event.stopPropagation();
      cancelKeyboard(); return;
    }
    if (event.key === 'Enter') { event.preventDefault(); acceptKeyboard(); return; }
    const current = spring.get().value;
    const step = event.shiftKey ? .015 : .08;
    const next = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? current - step
      : ['ArrowRight', 'ArrowDown'].includes(event.key) ? current + step
        : event.key === 'Home' ? bounds[0] : event.key === 'End' ? bounds[1] : undefined;
    if (next === undefined) return;
    event.preventDefault(); keyboardOrigin.current ??= legal(latest.current.position); spring.stop(); apply(next);
  }
  const focusPoints = artwork.hitPolygon.replace(/([\d.]+)% ([\d.]+)%/g, (_, x, y) => `${Number(x) / 100 * artwork.width},${Number(y) / 100 * artwork.height}`).replaceAll(', ', ' ');
  const dx = value * artwork.travel * artwork.width;
  const actorStyle: CSSProperties = {
    transformOrigin: `${artwork.seat[0] * 100}% ${artwork.seat[1] * 100}%`,
    transform: `translate(${dx}px, ${dx * artwork.slope}px) scale(${1 + value * artwork.perspective})`,
  };
  const verifyLayer = (image: HTMLImageElement) => {
    if (image.naturalWidth !== artwork.width || image.naturalHeight !== artwork.height) setFailedLayer(true);
  };
  const seatName = artwork.support === 'floor' ? '地面上' : artwork.support === 'desk-chair' ? '桌边' : artwork.support === 'sofa' ? '沙发上' : '窗边';
  return <div ref={viewport} className={`scene-stage-viewport${moving ? ' is-moving' : ''}`} data-scene={artwork.id} data-light={artwork.light} data-art-palette={artwork.palette} data-support={artwork.support} data-layered={layered}>
    <img src={artwork.mother} alt="" hidden style={{ display: 'none' }} onLoad={event => {
      if (event.currentTarget.naturalWidth !== artwork.width || event.currentTarget.naturalHeight !== artwork.height) setFailedMother(true);
    }} onError={() => setFailedMother(true)} />
    {!artwork.figure && artwork.mask && <img src={artwork.mask} alt="" hidden style={{ display: 'none' }}
      onLoad={event => verifyLayer(event.currentTarget)} onError={() => setFailedLayer(true)} />}
    {!failedMother && <div className="scene-canvas" style={{ width: artwork.width, height: artwork.height,
      transform: `translate(${stageX}px, ${stageY}px) scale(${scale})` }}>
      {layered ? <>
        <img className="scene-layer" src={artwork.background} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={() => setFailedLayer(true)} />
        {showFigure && <div className="scene-actor-layer" style={actorStyle}>
          {artwork.shadow && <img className="scene-layer" src={artwork.shadow} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={() => setFailedLayer(true)} />}
          {artwork.figure ? <img className="scene-layer" src={artwork.figure} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={() => setFailedLayer(true)} /> : <svg className="scene-layer" viewBox={`0 0 ${artwork.width} ${artwork.height}`} aria-hidden="true">
            <defs>
              <filter id={`${svgId}-alpha`} colorInterpolationFilters="sRGB">
                <feComponentTransfer><feFuncA type="table" tableValues="0 0 0 0 0 0 0 0 1 1 1" /></feComponentTransfer>
              </filter>
              <mask id={`${svgId}-figure`} maskUnits="userSpaceOnUse" x="0" y="0" width={artwork.width} height={artwork.height} style={{ maskType: 'alpha' }}>
                <image href={artwork.mask} width={artwork.width} height={artwork.height} preserveAspectRatio="none" filter={`url(#${svgId}-alpha)`} onError={() => setFailedLayer(true)} />
              </mask>
            </defs>
            <image href={artwork.mother} width={artwork.width} height={artwork.height} preserveAspectRatio="none" mask={`url(#${svgId}-figure)`} onError={() => setFailedLayer(true)} />
          </svg>}
          {canMove && <div ref={handle} className="scene-character-grab" role="slider" tabIndex={0}
            aria-label={`${name}在${seatName}的位置`} aria-orientation="horizontal" aria-valuemin={Math.round(bounds[0] * 100)} aria-valuemax={Math.round(bounds[1] * 100)} aria-describedby={instructionsId}
            aria-valuenow={Math.round(value * 100)} aria-valuetext={Math.abs(value) < .05 ? '原来的位置' : value < 0 ? '座位左侧' : '座位右侧'}
            title="拖动，换个舒服的位置；双击回到原处"
            style={{ inset: 0, clipPath: `polygon(${artwork.hitPolygon})` }}
            onPointerDown={begin} onPointerMove={move} onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) finish(false); }} onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }} onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }}
            onDoubleClick={() => { keyboardOrigin.current = undefined; settle(0); }} onKeyDown={keyDown}
            onBlur={() => { acceptKeyboard(); finish(true); }} />}
          {canMove && <span id={instructionsId} className="sr-only">方向键调整位置，Shift加方向键微调；回车留下这个位置，Escape取消。双击回到原处。</span>}
          {canMove && <svg className="scene-focus-ring" viewBox={`0 0 ${artwork.width} ${artwork.height}`} aria-hidden="true"><polygon points={focusPoints} /></svg>}
        </div>}
        {artwork.foreground && <img className="scene-layer scene-foreground" src={artwork.foreground} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={() => setFailedLayer(true)} />}
      </> : showFigure ? <img className="scene-layer" src={artwork.mother} alt="" draggable={false} onError={() => setFailedMother(true)} /> : null}
    </div>}
    {saveError && <p className="scene-position-problem" role="alert">刚才的位置没能留下，先回到原处了。再试一次吧。</p>}
  </div>;
}
