import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { CompanionMoment } from './companion-variants';
import type { AppearancePalette } from './appearance';
import { useSpringValue } from './motion/use-spring';
import { companionActivities, type CompanionActivity } from '../shared/companion-activity';

export type SceneCharacter = 'sakiko' | 'mutsumi' | 'anon' | 'tomori' | 'uika' | 'umiri' | 'nyamu' | 'rana' | 'soyo' | 'taki';
export type SceneLight = 'morning' | 'dusk' | 'night';
const sceneCharacters: readonly SceneCharacter[] = ['sakiko', 'mutsumi', 'anon', 'tomori', 'uika', 'umiri', 'nyamu', 'rana', 'soyo', 'taki'];
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
  character: SceneCharacter;
  activity: CompanionActivity;
  source: { kind: 'registered' | 'legacy'; registration?: string; mother: string; background?: string };
  light: SceneLight;
  palette: AppearancePalette;
  positionKey: string;
  mother: string;
  background?: string;
  figure?: string;
  mask?: string;
  maskMode?: 'alpha' | 'luminance';
  shadow?: string;
  foreground?: string;
  width: number;
  height: number;
}
export interface SceneTransferChoice {
  sceneId: string;
  moment: Exclude<CompanionMoment, 'night'>;
  positionKey: string;
  position: number;
}
export interface SceneTransferTarget extends SceneTransferChoice {
  artwork: CompanionSceneArtwork;
  label: string;
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
  maskMode?: 'alpha' | 'luminance';
  shadow?: string;
  foreground?: string;
  contactShadow: { mode: SceneCalibration['contactShadow'] };
  review: { approvedByPrimary: boolean };
}
const registrationFiles = import.meta.glob('../../前端视觉创新设计/运行素材/companion/scenes/*.scene.json', { eager: true, import: 'default' }) as Record<string, SceneRegistration>;
const registeredFile = (name: string | undefined) => name && /^[-a-z0-9]+\.png$/.test(name)
  ? images[`../../前端视觉创新设计/运行素材/companion/scenes/${name}`] : undefined;
const registrations = Object.entries(registrationFiles).filter(([, item]) => {
  if (!item || typeof item !== 'object') return false;
  const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
  return item.schemaVersion === 1 && item.review?.approvedByPrimary === true
    && typeof item.id === 'string' && /^[a-z0-9-]+$/.test(item.id)
    && sceneCharacters.includes(item.character) && companionActivities.includes(item.activity)
    && ['morning', 'dusk', 'night'].includes(item.light) && ['apricot', 'mist', 'violet', 'rain'].includes(item.palette)
    && item.light === companionPaletteLight(item.palette)
    && registeredFile(item.mother) && registeredFile(item.background) && (registeredFile(item.figure) || registeredFile(item.mask))
    && (!item.figure || registeredFile(item.figure)) && (!item.mask || registeredFile(item.mask))
    && (item.maskMode === undefined || ['alpha', 'luminance'].includes(item.maskMode))
    && (item.maskMode !== 'luminance' || registeredFile(item.mask))
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
}).map(([path, item]) => ({ ...item, registrationPath: path.replace('../../', '') }));
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

function registeredArtwork(registration: typeof registrations[number]): CompanionSceneArtwork {
  return {
    ...registration, contactShadow: registration.contactShadow.mode, positionKey: registration.id,
    source: { kind: 'registered', registration: registration.registrationPath, mother: registration.mother, background: registration.background },
    mother: registeredFile(registration.mother)!, background: registeredFile(registration.background),
    figure: registeredFile(registration.figure), mask: registeredFile(registration.mask),
    shadow: registration.contactShadow.mode === 'separate' ? registeredFile(registration.shadow) : undefined,
    foreground: registeredFile(registration.foreground),
  };
}
/** Position belongs to this exact pose and room. A different scene must never
 * inherit a displacement calibrated for another support surface. */
export function companionScenePosition(artwork: CompanionSceneArtwork, positions: Readonly<Record<string, number>>) {
  const bounds = seatPositionBounds(artwork);
  const stored = positions[artwork.positionKey] ?? positions[artwork.id] ?? 0;
  return Math.max(bounds[0], Math.min(bounds[1], Number.isFinite(stored) ? stored : 0));
}
export function companionRegisteredSceneArtwork(sceneId: string, character: string, light: SceneLight, palette: AppearancePalette): CompanionSceneArtwork | undefined {
  const registration = registrations.find(item => item.id === sceneId && item.character === character && item.light === light && item.palette === palette);
  return registration && registeredArtwork(registration);
}
export function companionSceneTransferTargets(character: string, current: CompanionSceneArtwork, light: SceneLight, palette: AppearancePalette,
  positions: Record<string, number>, semanticMoment: CompanionMoment): SceneTransferTarget[] {
  if (!registrations.some(item => item.id === current.id && item.character === character && item.light === light && item.palette === palette)) return [];
  const matching = registrations.filter(item => item.character === character && item.light === light && item.palette === palette && item.support !== current.support);
  const result: SceneTransferTarget[] = [];
  for (const support of ['window-seat', 'desk-chair', 'sofa', 'floor'] as const) {
    const candidates = matching.filter(item => item.support === support);
    const preferred = support === 'desk-chair' ? [semanticMoment, 'study', 'planning']
      : support === 'window-seat' ? [semanticMoment, 'reading', 'chat', 'rest'] : [semanticMoment, 'rest', 'chat', 'play'];
    const selected = preferred.map(activity => candidates.find(item => item.activity === activity)).find(Boolean) ?? candidates[0];
    if (!selected) continue;
    const artwork = registeredArtwork(selected);
    result.push({ artwork, sceneId: selected.id, moment: selected.activity, positionKey: artwork.positionKey,
      position: companionScenePosition(artwork, positions),
      label: support === 'desk-chair' ? '桌边' : support === 'sofa' ? '沙发上' : support === 'floor' ? '地面上' : '窗边' });
  }
  return result;
}

export function companionSceneArtwork(character: string, moment: CompanionMoment = 'chat', light: SceneLight = 'morning', palette: AppearancePalette = 'apricot'): CompanionSceneArtwork | undefined {
  const activity = moment === 'night' ? 'chat' : moment;
  const registration = registrations.find(item => item.character === character && item.activity === activity && item.light === light && item.palette === palette);
  if (registration) return registeredArtwork(registration);
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
    id, character: character as SceneCharacter, activity, light: sceneLight, palette: artworkPalette, positionKey: id, width: 1536, height: 1024,
    source: { kind: 'legacy', mother: `${id}-mother.png`, background: `${backgroundSources[id] || (file(id, 'background') ? id : room)}-background.png` },
    ...companionSceneCalibrations[id],
    mother: file(id, 'mother'), background: file(backgroundSources[id] || id, 'background') || file(room, 'background'), mask: file(id, 'mask') || file(id, 'figure'),
    shadow: companionSceneCalibrations[id].contactShadow === 'separate' ? file(id, 'shadow') : undefined, foreground: file(id, 'foreground'),
  };
}

/** Selection describes the exact cell. Legacy material remains identifiable
 * and cannot be counted as a newly reviewed matrix scene. */
export function companionSceneResolution(character: string, moment: CompanionMoment = 'chat', light: SceneLight = 'morning', palette: AppearancePalette = 'apricot') {
  const artwork = companionSceneArtwork(character, moment, light, palette);
  return { character, activity: moment === 'night' ? 'chat' : moment, light, palette,
    status: artwork?.source.kind ?? 'missing', artwork } as const;
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
export function CompanionSceneStage({ artwork, name, position, onCommit, transferTargets = [], transferScope, onTransferCommit, showFigure = true, interactive = true, quiet = false, reducedMotion = false, previewOnly = false }: {
  artwork: CompanionSceneArtwork;
  name: string;
  position: number;
  onCommit: (position: number) => void;
  transferTargets?: readonly SceneTransferTarget[];
  transferScope?: string;
  onTransferCommit?: (choice: SceneTransferChoice, origin: { sceneId: string; position: number }) => void;
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
  const [imageAttempt, setImageAttempt] = useState(0);
  const [openedMother, setOpenedMother] = useState<string>();
  const [saveError, setSaveError] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const targetsOpenRef = useRef(false);
  targetsOpenRef.current = targetsOpen;
  const [hoveredTarget, setHoveredTarget] = useState<string>();
  const hoveredTargetRef = useRef<string | undefined>(undefined);
  const targetButtons = useRef(new Map<string, HTMLButtonElement>());
  const transferEntry = useRef<HTMLButtonElement>(null);
  const confirmTransfer = useRef<HTMLButtonElement>(null);
  const [transferError, setTransferError] = useState('');
  const [openingTransfer, setOpeningTransfer] = useState(false);
  const openingTransferRef = useRef(false);
  const [pendingTransfer, setPendingTransfer] = useState<{ target: SceneTransferTarget; origin: { sceneId: string; position: number }; scope?: string }>();
  const pendingTransferRef = useRef(pendingTransfer);
  pendingTransferRef.current = pendingTransfer;
  const shown = pendingTransfer?.target.artwork ?? artwork;
  const imageKey = `${shown.id}:${imageAttempt}`;
  const currentImageKey = useRef(imageKey);
  currentImageKey.current = imageKey;
  const imageSource = (url: string | undefined) => url && imageAttempt ? `${url}${url.includes('?') ? '&' : '?'}scene-retry=${imageAttempt}` : url;
  const motherReady = openedMother === imageKey;
  const shownBounds = seatPositionBounds(shown);
  const shownPosition = pendingTransfer ? Math.max(shownBounds[0], Math.min(shownBounds[1], pendingTransfer.target.position)) : value;
  const latest = useRef({ onCommit, position, artwork, quiet, previewOnly, transferTargets, transferScope, onTransferCommit });
  latest.current = { onCommit, position, artwork, quiet, previewOnly, transferTargets, transferScope, onTransferCommit };
  const gesture = useRef<{ pointerId: number; x: number; y: number; origin: number; savedOrigin: number; scale: number; tangentX: number; tangentY: number; sampledAt: number; sampledValue: number; velocity: number;
    assetId: string; previewOnly: boolean; onCommit: (position: number) => void; distance: number } | undefined>(undefined);
  const keyboardOrigin = useRef<number | undefined>(undefined);
  const pendingOrigin = useRef<number | undefined>(undefined);
  const pendingTarget = useRef<number | undefined>(undefined);
  const layered = !!shown.background && (!!shown.figure || !!shown.mask) && !failedLayer;
  const canSlide = interactive && showFigure && layered && motherReady && !failedMother && !pendingTransfer && artwork.contourComplete && bounds[1] - bounds[0] > .0001;
  const canTransfer = interactive && showFigure && layered && motherReady && !failedMother && !pendingTransfer && !!onTransferCommit && transferTargets.length > 0;
  const canMove = canSlide || canTransfer;
  // Keep the room full-height while yielding to the paper. A horizontal
  // camera shift clears the person without turning the room into a thumbnail.
  const fullScale = size.height / shown.height;
  // Clear the whole legal seat interval. Framing must stay fixed while a
  // pointer controls the person, including wide poses beside a narrow paper.
  const bodyLeft = Math.min(...shownBounds.map(at => shown.bodyBounds[0]
    + at * (shown.travel + (shown.bodyBounds[0] - shown.seat[0]) * shown.perspective)));
  const paperEdge = 44 + Math.min(800, Math.max(0, size.width - 330));
  const scale = fullScale;
  const fullX = size.width - shown.width * scale;
  const retreatX = Math.max(0, paperEdge + 24 - (fullX + bodyLeft * shown.width * scale));
  const stageX = fullX + retreatX * retreat.value;
  const stageY = 0;
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
  function closeTransfer(restoreFocus = false) {
    pendingTransferRef.current = undefined;
    openingTransferRef.current = false; setOpeningTransfer(false);
    setPendingTransfer(undefined); setTargetsOpen(false); setHoveredTarget(undefined); hoveredTargetRef.current = undefined; setTransferError('');
    if (restoreFocus) requestAnimationFrame(() => (transferEntry.current ?? handle.current)?.focus({ preventScroll: true }));
  }
  function previewTransfer(target: SceneTransferTarget) {
    const current = latest.current;
    const valid = current.transferTargets.find(item => item.sceneId === target.sceneId);
    if (!valid || !current.onTransferCommit) return;
    finish(true); cancelKeyboard(); cancelPending();
    const next = { target: valid, origin: { sceneId: current.artwork.id, position: current.position }, scope: current.transferScope };
    pendingTransferRef.current = next; setPendingTransfer(next); setTargetsOpen(false); setHoveredTarget(undefined); hoveredTargetRef.current = undefined; setTransferError('');
  }
  async function acceptTransfer() {
    const pending = pendingTransferRef.current;
    let current = latest.current;
    if (!pending || !current.onTransferCommit || failedLayer || failedMother || openingTransferRef.current) return;
    if (pending.origin.sceneId !== current.artwork.id || pending.scope !== current.transferScope || !current.transferTargets.some(item => item.sceneId === pending.target.sceneId)) {
      closeTransfer(true); return;
    }
    openingTransferRef.current = true; setOpeningTransfer(true); setTransferError('');
    let layersOpened = false;
    try {
      const target = pending.target.artwork;
      // Confirm only a complete, decoded pose. A quick click must not save a
      // destination whose first image request is still loading or has failed.
      const layers = [target.mother, target.background, target.figure || target.mask, target.shadow, target.foreground];
      await Promise.all([...new Set(layers.filter((url): url is string => !!url))].map(async url => {
        const layer = new Image(); layer.src = imageSource(url)!;
        await layer.decode();
        if (layer.naturalWidth !== target.width || layer.naturalHeight !== target.height)
          throw new Error('这里的画面还没完整打开。原来的位置还在，可以先回去再试。');
      }));
      layersOpened = true;
      current = latest.current;
      if (pendingTransferRef.current !== pending) return;
      if (!current.onTransferCommit || pending.origin.sceneId !== current.artwork.id || pending.scope !== current.transferScope
        || pending.origin.position !== current.position || !current.transferTargets.some(item => item.sceneId === pending.target.sceneId)) {
        closeTransfer(true); return;
      }
      const { sceneId, moment, positionKey, position } = pending.target;
      current.onTransferCommit({ sceneId, moment, positionKey, position }, pending.origin);
      closeTransfer(true);
    } catch (problem) {
      if (pendingTransferRef.current === pending) setTransferError(problem instanceof Error && problem.name === 'Error'
        ? problem.message : layersOpened ? '这个位置暂时没能留下，试看的样子还在。'
          : '这里的画面还没完整打开。原来的位置还在，可以先回去再试。');
    } finally {
      if (pendingTransferRef.current === pending) { openingTransferRef.current = false; setOpeningTransfer(false); }
    }
  }
  function finish(cancel: boolean) {
    const active = gesture.current;
    if (!active) return;
    cancel ||= active.assetId !== latest.current.artwork.id;
    gesture.current = undefined;
    setMoving(false);
    const transfer = !cancel && active.distance >= 8 ? latest.current.transferTargets.find(item => item.sceneId === hoveredTargetRef.current) : undefined;
    setTargetsOpen(false); setHoveredTarget(undefined); hoveredTargetRef.current = undefined;
    if (cancel || transfer || currentBounds.current[1] - currentBounds.current[0] <= .0001) {
      settle(active.savedOrigin, spring.get().velocity, false);
      if (active.previewOnly) active.onCommit(active.savedOrigin);
    }
    else settle(spring.get().value, performance.now() - active.sampledAt < 100 ? active.velocity : 0);
    retreat.animate(latest.current.quiet ? 1 : 0);
    if (handle.current?.hasPointerCapture(active.pointerId)) handle.current.releasePointerCapture(active.pointerId);
    if (transfer) previewTransfer(transfer);
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
      finish(true); cancelKeyboard(); cancelPending(); closeTransfer();
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    finish(true); keyboardOrigin.current = undefined; pendingOrigin.current = undefined; pendingTarget.current = undefined;
    closeTransfer(); setFailedLayer(false); setFailedMother(false); setSaveError(false); apply(position);
  }, [artwork.id, transferScope]);
  useLayoutEffect(() => {
    setFailedLayer(false); setFailedMother(false);
  }, [shown.id]);
  useEffect(() => {
    if (!pendingTransfer) return;
    const frame = requestAnimationFrame(() => confirmTransfer.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [pendingTransfer?.target.sceneId]);
  useEffect(() => {
    if ((!interactive || !showFigure) && pendingTransferRef.current) closeTransfer();
  }, [interactive, showFigure]);
  useEffect(() => {
    if (pendingTransferRef.current && pendingTransferRef.current.origin.position !== position) closeTransfer();
    if (gesture.current && legal(position) !== gesture.current.savedOrigin) finish(true);
    if (keyboardOrigin.current !== undefined && legal(position) !== keyboardOrigin.current) keyboardOrigin.current = undefined;
    if (!gesture.current && keyboardOrigin.current === undefined) {
      if (previewOnly && pendingOrigin.current !== undefined && pendingTarget.current === legal(position)) return;
      pendingOrigin.current = undefined; pendingTarget.current = undefined; spring.animate(legal(position));
    }
  }, [position]);
  useEffect(() => { finish(true); cancelKeyboard(); cancelPending(); closeTransfer(); retreat.animate(quiet ? 1 : 0); }, [quiet]);
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' && (gesture.current || keyboardOrigin.current !== undefined || pendingOrigin.current !== undefined || pendingTransferRef.current || targetsOpenRef.current)) {
        event.preventDefault(); event.stopPropagation(); finish(true); cancelKeyboard(); cancelPending(); closeTransfer(true);
      }
    };
    const blur = () => { cancelKeyboard(); finish(true); cancelPending(); closeTransfer(); };
    window.addEventListener('keydown', escape, true); window.addEventListener('blur', blur);
    const hidden = () => { if (document.hidden) { finish(true); cancelKeyboard(); cancelPending(); closeTransfer(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      gesture.current = undefined; pendingTransferRef.current = undefined; pendingOrigin.current = undefined; pendingTarget.current = undefined;
      spring.stop(); retreat.stop();
      window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden);
    };
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
      assetId: artwork.id, previewOnly, onCommit: latest.current.onCommit, distance: 0,
      sampledAt: performance.now(), sampledValue: u, velocity: snapshot.velocity,
      tangentX: artwork.travel * artwork.width + artwork.perspective * originalX,
      tangentY: artwork.travel * artwork.width * artwork.slope + artwork.perspective * originalY };

    setMoving(true); setTargetsOpen(canTransfer); setTransferError('');
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    active.distance = Math.hypot(event.clientX - active.x, event.clientY - active.y);
    const hovered = latest.current.transferTargets.find(target => {
      const rect = targetButtons.current.get(target.sceneId)?.getBoundingClientRect();
      return rect && event.clientX >= rect.left - 14 && event.clientX <= rect.right + 14 && event.clientY >= rect.top - 14 && event.clientY <= rect.bottom + 14;
    });
    hoveredTargetRef.current = hovered?.sceneId; setHoveredTarget(hovered?.sceneId);
    if (!canSlide) return;
    // Project both pointer axes onto the actual seat's tangent. The character
    // remains on the seat even if the hand moves vertically off the surface.
    const dx = (event.clientX - active.x) / active.scale, dy = (event.clientY - active.y) / active.scale;
    const tangentLength = active.tangentX ** 2 + active.tangentY ** 2;
    if (tangentLength <= .00001) return;
    const delta = (dx * active.tangentX + dy * active.tangentY) / tangentLength;
    const next = legal(active.origin + delta), now = performance.now(), elapsed = (now - active.sampledAt) / 1000;
    const velocity = elapsed > 0 ? (next - active.sampledValue) / elapsed : active.velocity;
    active.velocity = Math.max(-8, Math.min(8, velocity)); active.sampledAt = now; active.sampledValue = next;
    apply(next, active.velocity);
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!canMove) return;
    if (canTransfer && (event.key === ' ' || event.key === 'Enter' && keyboardOrigin.current === undefined)) {
      event.preventDefault(); event.stopPropagation(); setTargetsOpen(true);
      requestAnimationFrame(() => targetButtons.current.values().next().value?.focus({ preventScroll: true })); return;
    }
    if (event.key === 'Escape' && keyboardOrigin.current !== undefined) {
      event.preventDefault(); event.stopPropagation();
      cancelKeyboard(); return;
    }
    if (event.key === 'Enter') { event.preventDefault(); acceptKeyboard(); return; }
    if (!canSlide) return;
    const current = spring.get().value;
    const step = event.shiftKey ? .015 : .08;
    const next = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? current - step
      : ['ArrowRight', 'ArrowDown'].includes(event.key) ? current + step
        : event.key === 'Home' ? bounds[0] : event.key === 'End' ? bounds[1] : undefined;
    if (next === undefined) return;
    event.preventDefault(); keyboardOrigin.current ??= legal(latest.current.position); spring.stop(); apply(next);
  }
  const focusPoints = shown.hitPolygon.replace(/([\d.]+)% ([\d.]+)%/g, (_, x, y) => `${Number(x) / 100 * shown.width},${Number(y) / 100 * shown.height}`).replaceAll(', ', ' ');
  const dx = shownPosition * shown.travel * shown.width;
  const actorStyle: CSSProperties = {
    transformOrigin: `${shown.seat[0] * 100}% ${shown.seat[1] * 100}%`,
    transform: `translate(${dx}px, ${dx * shown.slope}px) scale(${1 + shownPosition * shown.perspective})`,
  };
  const verifyLayer = (image: HTMLImageElement) => {
    if (currentImageKey.current !== imageKey) return;
    if (image.naturalWidth !== shown.width || image.naturalHeight !== shown.height) setFailedLayer(true);
  };
  const failLayer = () => { if (currentImageKey.current === imageKey) setFailedLayer(true); };
  const failMother = () => { if (currentImageKey.current === imageKey) setFailedMother(true); };
  const retryImages = () => {
    finish(true); cancelKeyboard(); cancelPending(); closeTransfer();
    setFailedMother(false); setFailedLayer(false); setOpenedMother(undefined); setImageAttempt(current => current + 1);
  };
  const showEmptyRoom = failedMother && !!shown.background && !failedLayer;
  const seatName = shown.support === 'floor' ? '地面上' : shown.support === 'desk-chair' ? '桌边' : shown.support === 'sofa' ? '沙发上' : '窗边';
  return <div ref={viewport} className={`scene-stage-viewport${moving ? ' is-moving' : ''}${pendingTransfer ? ' is-trying-place' : ''}`} data-scene={shown.id} data-activity={shown.activity} data-art-source={shown.source.kind} data-light={shown.light} data-art-palette={shown.palette} data-support={shown.support} data-layered={layered}>
    <img key={`mother-${imageKey}`} src={imageSource(shown.mother)} alt="" hidden style={{ display: 'none' }} onLoad={event => {
      if (currentImageKey.current !== imageKey) return;
      if (event.currentTarget.naturalWidth !== shown.width || event.currentTarget.naturalHeight !== shown.height) setFailedMother(true);
      else setOpenedMother(imageKey);
    }} onError={failMother} />
    {!shown.figure && shown.mask && <img key={`mask-${imageKey}`} src={imageSource(shown.mask)} alt="" hidden style={{ display: 'none' }}
      onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />}
    {(!failedMother || showEmptyRoom) && <div key={`canvas-${imageKey}`} className="scene-canvas" style={{ width: shown.width, height: shown.height,
      transform: `translate(${stageX}px, ${stageY}px) scale(${scale})` }}>
      {layered || showEmptyRoom ? <>
        <img className="scene-layer" src={imageSource(shown.background)} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />
        {showFigure && motherReady && !failedMother && <div className="scene-actor-layer" style={actorStyle}>
          {shown.shadow && <img className="scene-layer" src={imageSource(shown.shadow)} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />}
          {shown.figure ? <img className="scene-layer" src={imageSource(shown.figure)} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} /> : <svg className="scene-layer" viewBox={`0 0 ${shown.width} ${shown.height}`} aria-hidden="true">
            <defs>
              <filter id={`${svgId}-alpha`} colorInterpolationFilters="sRGB">
                <feComponentTransfer><feFuncA type="table" tableValues="0 0 0 0 0 0 0 0 1 1 1" /></feComponentTransfer>
              </filter>
              <mask id={`${svgId}-figure`} maskUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} style={{ maskType: shown.maskMode ?? 'alpha' }}>
                <image href={imageSource(shown.mask)} width={shown.width} height={shown.height} preserveAspectRatio="none" filter={shown.maskMode === 'luminance' ? undefined : `url(#${svgId}-alpha)`} onError={failLayer} />
              </mask>
            </defs>
            <image href={imageSource(shown.mother)} width={shown.width} height={shown.height} preserveAspectRatio="none" mask={`url(#${svgId}-figure)`} onError={failLayer} />
          </svg>}
          {canMove && <div ref={handle} className="scene-character-grab" role={canSlide ? 'slider' : 'button'} tabIndex={0}
            aria-label={`${name}在${seatName}的位置`} aria-orientation={canSlide ? 'horizontal' : undefined} aria-valuemin={canSlide ? Math.round(bounds[0] * 100) : undefined} aria-valuemax={canSlide ? Math.round(bounds[1] * 100) : undefined} aria-describedby={instructionsId}
            aria-valuenow={canSlide ? Math.round(value * 100) : undefined} aria-valuetext={canSlide ? Math.abs(value) < .05 ? '原来的位置' : value < 0 ? '座位左侧' : '座位右侧' : undefined}
            title={canTransfer ? '拖到家具，先看看新的坐姿' : '拖动，换个舒服的位置；双击回到原处'}
            style={{ inset: 0, clipPath: `polygon(${shown.hitPolygon})` }}
            onPointerDown={begin} onPointerMove={move} onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) finish(false); }} onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }} onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }}
            onDoubleClick={() => { if (canSlide) { keyboardOrigin.current = undefined; settle(0); } }} onKeyDown={keyDown}
            onBlur={() => { acceptKeyboard(); finish(true); }} />}
          {canMove && <span id={instructionsId} className="sr-only">{canSlide ? '方向键调整位置，Shift加方向键微调；回车留下这个位置。' : ''}{canTransfer ? '空格或回车选择另一处家具，先试坐再决定。' : ''}Escape取消。</span>}
          {canMove && <svg className="scene-focus-ring" viewBox={`0 0 ${shown.width} ${shown.height}`} aria-hidden="true"><polygon points={focusPoints} /></svg>}
        </div>}
        {shown.foreground && <img className="scene-layer scene-foreground" src={imageSource(shown.foreground)} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />}
      </> : showFigure && motherReady ? <img className="scene-layer" src={imageSource(shown.mother)} alt="" draggable={false} onError={failMother} /> : null}
    </div>}
    {(canTransfer || pendingTransfer) && <div className="scene-transfer-ui" data-open={targetsOpen}>
      {canTransfer && !pendingTransfer && <button ref={transferEntry} type="button" className="scene-transfer-entry" aria-expanded={targetsOpen}
        onClick={() => { cancelKeyboard(); finish(true); cancelPending(); setTargetsOpen(!targetsOpenRef.current); }}>
        换个位置
      </button>}
      {targetsOpen && !pendingTransfer && <div className="scene-transfer-targets" role="group" aria-label="想坐在哪里">
        {transferTargets.map(target => {
          const left = Math.max(Math.min(70, size.width / 2), Math.min(size.width - Math.min(70, size.width / 2), stageX + target.artwork.seat[0] * target.artwork.width * scale));
          const top = Math.max(46, Math.min(size.height - 72, stageY + target.artwork.seat[1] * target.artwork.height * scale - 34));
          return <button key={target.sceneId} ref={element => { if (element) targetButtons.current.set(target.sceneId, element); else targetButtons.current.delete(target.sceneId); }} type="button"
            className={`scene-transfer-target${hoveredTarget === target.sceneId ? ' is-over' : ''}`} style={{ left, top }} aria-label={`先试坐${target.label}`}
            onClick={() => previewTransfer(target)}>{target.label}</button>;
        })}
      </div>}
      {pendingTransfer && <div className="scene-transfer-preview" role="group" aria-label={`试坐${pendingTransfer.target.label}`}>
        <span>{pendingTransfer.target.label}</span>
        <button type="button" onClick={() => closeTransfer(true)}>先不换</button>
        <button ref={confirmTransfer} type="button" className="scene-transfer-accept" disabled={failedLayer || failedMother || openingTransfer} aria-busy={openingTransfer || undefined} onClick={acceptTransfer}>就坐这里</button>
        {(transferError || failedLayer || failedMother) && <p role="alert">{transferError || '这里的画面暂时没打开，先回原处再试一次吧。'}</p>}
      </div>}
    </div>}
    {(failedMother || failedLayer) && !pendingTransfer && <div className="scene-position-problem" role="alert"><span>窗边的画面没能完整打开，原来的选择还在。</span><button type="button" className="text-button" onClick={retryImages}>再打开一次</button></div>}
    {saveError && !failedMother && !failedLayer && <p className="scene-position-problem" role="alert">刚才的位置没能留下，先回到原处了。再试一次吧。</p>}
  </div>;
}
