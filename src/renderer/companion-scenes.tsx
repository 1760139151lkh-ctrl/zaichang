import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { CompanionMoment } from './companion-variants';
import type { AppearancePalette, EffectiveEnvironment, EnvironmentVariant } from './appearance';
import { useSpringValue } from './motion/use-spring';
import { companionActivities, type CompanionActivity } from '../shared/companion-activity';
import primarySakikoMotherReviews from '../../前端视觉创新设计/来源记录/2026-10-25-literary-room/primary-sakiko-pilot-mother-reviews-v1.json';
import { uiError } from './ui';

export type SceneCharacter = 'sakiko' | 'mutsumi' | 'anon' | 'tomori' | 'uika' | 'umiri' | 'nyamu' | 'rana' | 'soyo' | 'taki';
export type SceneLight = 'morning' | 'dusk' | 'night';
export type NeutralSceneTime = 'day' | 'night';
export type ScenePurpose = 'activity' | 'neutral-presence';
export interface CompanionRoomRect { left: number; top: number; width: number; height: number }
export interface CompanionRoomLayout {
  family: string;
  sourceKey: string;
  sourceCanvas: { width: number; height: number };
  poseId: string | null;
  support: SceneCalibration['support'] | null;
  bodyBounds: readonly [number, number, number, number] | null;
  actorSourceRect: CompanionRoomRect | null;
  actorVisible: boolean;
  interaction: 'idle' | 'dragging' | 'committing';
  viewportClientRect: CompanionRoomRect;
  frame: { x: number; y: number; width: number; height: number; scale: number };
  actorClientRect: CompanionRoomRect | null;
  framePolicy: 'safe-cover' | 'protected-fit' | 'compact-cover';
}
export interface CompanionRoomActions {
  onRoomLayout?: (payload: CompanionRoomLayout | null) => void;
  onStartFocus?: () => void;
  deskActionLabel?: string;
  onRest?: () => void;
  focusActive?: boolean;
}
type SceneShadowMode = 'rgba' | 'luminance' | 'alpha' | 'source';
type SourceShadowPolygon = readonly (readonly [number, number])[];
interface SceneFloorCast {
  mask: string;
  clip: readonly [number, number, number, number];
  receiver: 'mask' | 'soft-floor-v1';
}
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
  renderMode?: 'layered' | 'complete-scene';
  id: string;
  sceneFamily: string;
  character: SceneCharacter;
  activity: CompanionActivity;
  source: { kind: 'registered' | 'legacy'; registration?: string; mother: string; background?: string };
  light: SceneLight;
  palette: AppearancePalette;
  environmentVariant?: Exclude<EnvironmentVariant, 'unknown'>;
  neutralTime?: NeutralSceneTime;
  purpose: ScenePurpose;
  positionKey: string;
  mother: string;
  background?: string;
  figure?: string;
  mask?: string;
  maskMode?: 'alpha' | 'luminance';
  contactMask?: string;
  shadow?: string;
  shadowMode?: SceneShadowMode;
  shadowColor?: string;
  shadowOpacity?: number;
  sourceShadowPolygon?: SourceShadowPolygon;
  sourceShadowFeather?: number;
  floorCast?: SceneFloorCast;
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
interface SceneRegistration extends Omit<SceneCalibration, 'contactShadow'> {
  renderMode?: 'layered' | 'complete-scene';
  schemaVersion: 1;
  id: string;
  sceneFamily: string;
  character: SceneCharacter;
  activity: Exclude<CompanionMoment, 'night'>;
  light: SceneLight;
  palette: AppearancePalette;
  environmentVariant?: Exclude<EnvironmentVariant, 'unknown'>;
  neutralTime?: NeutralSceneTime;
  /** Omitted on existing exact activity registrations. */
  purpose?: ScenePurpose;
  width: number;
  height: number;
  mother: string;
  background: string;
  figure?: string;
  mask?: string;
  maskMode?: 'alpha' | 'luminance';
  contactMask?: string;
  shadow?: string;
  shadowMode?: SceneShadowMode;
  shadowColor?: string;
  shadowOpacity?: number;
  sourceShadowPolygon?: SourceShadowPolygon;
  sourceShadowFeather?: number;
  floorCast?: SceneFloorCast;
  foreground?: string;
  contactShadow: { mode: SceneCalibration['contactShadow'] };
  review: { approvedByPrimary: boolean; sourceShadowCalibration?: string; floorCastCalibration?: string; contactAssemblyRecord?: string;
    runtimeSourceSha256?: { mother?: string };
    geometryEvidence?: { jointReceiverEnvelope?: { normalized?: readonly [number, number, number, number] } } };
}
const retiredMotherHashes = new Set((primarySakikoMotherReviews as {
  records: { sha256: string; decision: string; generationInputAllowed?: boolean }[];
}).records.filter(item => item.generationInputAllowed === false || /^(held|rejected)/.test(item.decision)).map(item => item.sha256));
function activeMotherSourceAllowed(item: SceneRegistration) {
  const mother = item.review?.runtimeSourceSha256?.mother;
  return typeof mother === 'string' && /^[a-f0-9]{64}$/.test(mother) && !retiredMotherHashes.has(mother);
}
const registrationFiles = import.meta.glob('../../前端视觉创新设计/运行素材/companion/scenes/*.scene.json', { eager: true, import: 'default' }) as Record<string, SceneRegistration>;
const registeredFile = (name: string | undefined) => name && /^[-a-z0-9]+\.png$/.test(name)
  ? images[`../../前端视觉创新设计/运行素材/companion/scenes/${name}`] : undefined;
interface RoomBackgroundManifest {
  roomFamily: string;
  width: number;
  height: number;
  weather: Partial<Record<Exclude<EnvironmentVariant, 'unknown'>, { file: string; sha256: string }>>;
  timeOnly: Partial<Record<'day' | 'night', { file: string; sha256: string }>>;
  review: { approvedByPrimary: boolean };
  interactionGeometry?: { file: string; sha256: string; sourceRecord: string };
}
interface RoomInteractionGeometry {
  schemaVersion: 1;
  roomFamily: string;
  width: number;
  height: number;
  dropTargets: { support: 'desk-chair' | 'window-seat'; regions: { state: 'all' | 'empty-chair' | 'desk-chair-pose'; polygon: SourceShadowPolygon }[] }[];
  hotspots: { action: 'start-focus' | 'rest'; polygon: SourceShadowPolygon }[];
}
// The asset owner supplies the one active room. A missing manifest never
// permits a legacy room or a different camera to stand in for it.
const roomManifests = import.meta.glob('../../前端视觉创新设计/运行素材/companion/scenes/literary-room-ambient-backgrounds.json', { eager: true, import: 'default' }) as Record<string, RoomBackgroundManifest>;
const roomBackgroundManifest = Object.values(roomManifests).find(item => item?.review?.approvedByPrimary === true
  && typeof item.roomFamily === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(item.roomFamily) && item.width === 1536 && item.height === 1024
  && item.weather && typeof item.weather === 'object' && item.timeOnly && typeof item.timeOnly === 'object');
export function companionActiveSceneFamily() { return roomBackgroundManifest?.roomFamily; }
const interactionFiles = import.meta.glob('../../前端视觉创新设计/运行素材/companion/scenes/*.interaction.json', { eager: true, import: 'default' }) as Record<string, RoomInteractionGeometry>;
const interactionReference = roomBackgroundManifest?.interactionGeometry;
const interactionCandidate = interactionReference && /^[-a-z0-9]+\.interaction\.json$/.test(interactionReference.file)
  && /^[a-f0-9]{64}$/.test(interactionReference.sha256) && validCalibrationRecord(interactionReference.sourceRecord)
  ? interactionFiles[`../../前端视觉创新设计/运行素材/companion/scenes/${interactionReference.file}`] : undefined;
const roomInteraction = validRoomInteraction(interactionCandidate) ? interactionCandidate : undefined;
function validInteractionPolygon(value: unknown): value is SourceShadowPolygon {
  return Array.isArray(value) && value.length >= 3 && value.length <= 32
    && value.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
      && point[0] >= 0 && point[0] <= 1536 && point[1] >= 0 && point[1] <= 1024)
    && Math.abs(value.reduce((area, point, index) => {
      const next = value[(index + 1) % value.length];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0)) > .001;
}
function validRoomInteraction(value: RoomInteractionGeometry | undefined): value is RoomInteractionGeometry {
  return !!value && value.schemaVersion === 1 && value.roomFamily === companionActiveSceneFamily()
    && value.width === 1536 && value.height === 1024
    && Array.isArray(value.dropTargets) && value.dropTargets.length <= 2
    && new Set(value.dropTargets.map(target => target?.support)).size === value.dropTargets.length
    && value.dropTargets.every(target => target && ['desk-chair', 'window-seat'].includes(target.support)
      && Array.isArray(target.regions) && target.regions.length > 0 && target.regions.length <= 3
      && target.regions.every(region => region && ['all', 'empty-chair', 'desk-chair-pose'].includes(region.state) && validInteractionPolygon(region.polygon)))
    && Array.isArray(value.hotspots) && value.hotspots.length <= 2
    && new Set(value.hotspots.map(hotspot => hotspot?.action)).size === value.hotspots.length
    && value.hotspots.every(hotspot => hotspot && ['start-focus', 'rest'].includes(hotspot.action) && validInteractionPolygon(hotspot.polygon));
}
function insidePolygon(x: number, y: number, polygon: SourceShadowPolygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (Math.abs((x - xi) * (yj - yi) - (y - yi) * (xj - xi)) < .001
      && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function matchesRoom(registration: { sceneFamily?: string; width: number; height: number }) {
  return !!roomBackgroundManifest && registration.sceneFamily === roomBackgroundManifest.roomFamily
    && registration.width === roomBackgroundManifest.width && registration.height === roomBackgroundManifest.height;
}
function validCalibrationRecord(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 512 && /^[-a-zA-Z0-9_\u3400-\u9fff/.]+\.json$/.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..');
}
function validFloorCast(item: SceneRegistration) {
  const floor = item.floorCast;
  if (floor === undefined) return true;
  return !!floor && typeof floor === 'object' && registeredFile(floor.mask)
    && ['mask', 'soft-floor-v1'].includes(floor.receiver)
    && Array.isArray(floor.clip) && floor.clip.length === 4 && floor.clip.every(Number.isFinite)
    && floor.clip[0] >= 0 && floor.clip[1] >= 0 && floor.clip[2] > 0 && floor.clip[3] > 0
    && floor.clip[0] + floor.clip[2] <= item.width && floor.clip[1] + floor.clip[3] <= item.height
    && item.travel === 0 && item.slope === 0 && item.perspective === 0
    && validCalibrationRecord(item.review?.floorCastCalibration);
}
function validContactAssembly(item: SceneRegistration) {
  return item.contactMask === undefined || registeredFile(item.contactMask) && registeredFile(item.mask)
    && item.maskMode === 'luminance' && item.figure === undefined && item.shadow === undefined
    && item.shadowMode === undefined && item.shadowColor === undefined && item.shadowOpacity === undefined
    && item.floorCast === undefined && item.sourceShadowPolygon === undefined && item.sourceShadowFeather === undefined
    && item.contactShadow?.mode === 'included' && item.travel === 0 && item.slope === 0 && item.perspective === 0
    && validCalibrationRecord(item.review?.contactAssemblyRecord);
}
function validSourceShadowCalibration(item: SceneRegistration) {
  const polygon = item.sourceShadowPolygon;
  const feather = item.sourceShadowFeather;
  if (polygon === undefined) return feather === undefined;
  return item.shadowMode === 'source' && Array.isArray(polygon) && polygon.length >= 3 && polygon.length <= 64
    && polygon.every(point => Array.isArray(point) && point.length === 2
      && point.every(Number.isFinite) && point[0] >= 0 && point[0] <= item.width && point[1] >= 0 && point[1] <= item.height)
    && Math.abs(polygon.reduce((area, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0)) > .001
    && (feather === undefined || Number.isFinite(feather) && feather >= 0 && feather <= 2)
    && validCalibrationRecord(item.review?.sourceShadowCalibration);
}
function validEnvironmentRegistration(item: SceneRegistration) {
  if (item.purpose === 'neutral-presence') return item.environmentVariant === undefined
    && item.neutralTime === (item.light === 'night' ? 'night' : 'day');
  return (item.purpose === undefined || item.purpose === 'activity') && item.neutralTime === undefined
    && (item.environmentVariant === undefined || ['clear-day', 'overcast-day', 'rain-day', 'dry-night', 'rain-night', 'twilight'].includes(item.environmentVariant));
}
const registrations = Object.entries(registrationFiles).filter(([, item]) => {
  if (!item || typeof item !== 'object') return false;
  const unit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
  return item.schemaVersion === 1 && item.review?.approvedByPrimary === true
    && (!matchesRoom(item) || activeMotherSourceAllowed(item))
    && typeof item.id === 'string' && /^[a-z0-9-]+$/.test(item.id)
    && typeof item.sceneFamily === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(item.sceneFamily)
    && sceneCharacters.includes(item.character) && companionActivities.includes(item.activity)
    && ['morning', 'dusk', 'night'].includes(item.light) && ['apricot', 'mist', 'violet', 'rain'].includes(item.palette)
    && validEnvironmentRegistration(item)
    && item.light === companionPaletteLight(item.palette)
    && registeredFile(item.mother) && registeredFile(item.background)
    && (item.renderMode === 'complete-scene'
      ? item.travel === 0 && item.slope === 0 && item.perspective === 0 && item.contactShadow?.mode === 'included'
        && !item.figure && !item.mask && !item.contactMask && !item.shadow && !item.floorCast
      : (item.renderMode === undefined || item.renderMode === 'layered') && (registeredFile(item.figure) || registeredFile(item.mask)))
    && (!item.figure || registeredFile(item.figure)) && (!item.mask || registeredFile(item.mask))
    && (item.maskMode === undefined || ['alpha', 'luminance'].includes(item.maskMode))
    && (item.maskMode !== 'luminance' || registeredFile(item.mask))
    && (!item.shadow || registeredFile(item.shadow)) && (!item.foreground || registeredFile(item.foreground))
    && (item.shadowMode === undefined || ['rgba', 'luminance', 'alpha', 'source'].includes(item.shadowMode))
    && (item.shadowColor === undefined || /^#[\da-f]{6}$/i.test(item.shadowColor))
    && (item.shadowOpacity === undefined || unit(item.shadowOpacity))
    && (!['luminance', 'alpha'].includes(item.shadowMode ?? '') || item.contactShadow?.mode === 'separate'
      && registeredFile(item.shadow) && item.shadowColor !== undefined && item.shadowOpacity !== undefined)
    && (item.shadowMode !== 'source' || item.contactShadow?.mode === 'separate' && registeredFile(item.shadow)
      && item.travel === 0 && item.slope === 0 && item.perspective === 0)
    && validSourceShadowCalibration(item)
    && validFloorCast(item)
    && validContactAssembly(item)
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
  const leftSeat = (left + right) / 2 < .5;
  for (const x of [left, right]) constrain(x, artwork.travel + artwork.perspective * (x - artwork.seat[0]), leftSeat ? 0 : artwork.safeTextBoundary, leftSeat ? artwork.safeTextBoundary : 1);
  for (const y of [top, bottom]) constrain(y, artwork.travel * artwork.width / artwork.height * artwork.slope + artwork.perspective * (y - artwork.seat[1]), 0, 1);
  return minimum <= maximum ? [minimum, maximum] : [0, 0];
}

function registeredArtwork(registration: typeof registrations[number]): CompanionSceneArtwork {
  return {
    ...registration, purpose: registration.purpose ?? 'activity', contactShadow: registration.contactShadow.mode,
    positionKey: `${registration.sceneFamily}:${registration.id}`,
    source: { kind: 'registered', registration: registration.registrationPath, mother: registration.mother, background: registration.background },
    mother: registeredFile(registration.mother)!, background: registeredFile(registration.background),
    figure: registeredFile(registration.figure), mask: registeredFile(registration.mask),
    contactMask: registeredFile(registration.contactMask),
    shadow: registration.contactShadow.mode === 'separate' ? registeredFile(registration.shadow) : undefined,
    floorCast: registration.floorCast && { ...registration.floorCast, mask: registeredFile(registration.floorCast.mask)! },
    foreground: registeredFile(registration.foreground),
  };
}
function sceneSourceKey(artwork: CompanionSceneArtwork, attempt: number) {
  return JSON.stringify([artwork.sceneFamily, artwork.id, artwork.purpose, artwork.neutralTime, artwork.environmentVariant,
    artwork.width, artwork.height, artwork.mother, artwork.background,
    artwork.figure, artwork.mask, artwork.maskMode, artwork.contactMask, artwork.shadow, artwork.shadowMode,
    artwork.shadowColor, artwork.shadowOpacity, artwork.foreground, artwork.floorCast, artwork.sourceShadowPolygon,
    artwork.sourceShadowFeather, artwork.contactShadow, artwork.seat, artwork.ground, artwork.bodyBounds,
    artwork.support, artwork.floorContact, artwork.safeTextBoundary, artwork.contourComplete, artwork.hitPolygon,
    artwork.travel, artwork.slope, artwork.perspective, attempt]);
}
/** Position belongs to this exact pose and room. A different scene must never
 * inherit a displacement calibrated for another support surface. */
export function companionScenePosition(artwork: CompanionSceneArtwork, positions: Readonly<Record<string, number>>) {
  const bounds = seatPositionBounds(artwork);
  const stored = positions[artwork.positionKey] ?? 0;
  return Math.max(bounds[0], Math.min(bounds[1], Number.isFinite(stored) ? stored : 0));
}
function matchesEnvironment(registration: typeof registrations[number], variant?: EnvironmentVariant, neutralTime?: NeutralSceneTime) {
  // A manual palette is an appearance choice, not a weather assertion.
  // Unknown weather admits only an independently reviewed time-only presence.
  // Room, palette and light are still exact constraints at every caller.
  if (registration.purpose === 'neutral-presence') return variant === 'unknown'
    && neutralTime !== undefined && registration.neutralTime === neutralTime;
  return variant === undefined || variant !== 'unknown' && registration.environmentVariant === variant;
}
function preferredRegistration(candidates: typeof registrations, variant?: EnvironmentVariant) {
  // Adding a live-weather scene must not replace a manual theme's default.
  // Explicit saved scene IDs remain selectable regardless of this preference.
  return (variant === undefined ? candidates.find(item => {
    const themeId = `${item.character}-${item.activity}-${item.palette}`;
    return item.id === themeId || item.id.startsWith(`${themeId}-`);
  }) : undefined) ?? candidates[0];
}
export function companionRegisteredSceneArtwork(sceneId: string, character: string, light: SceneLight, palette: AppearancePalette, variant?: EnvironmentVariant, neutralTime?: NeutralSceneTime): CompanionSceneArtwork | undefined {
  const registration = registrations.find(item => matchesRoom(item) && item.id === sceneId && item.character === character && item.light === light && item.palette === palette && matchesEnvironment(item, variant, neutralTime));
  return registration && registeredArtwork(registration);
}
export function companionSceneTransferTargets(character: string, current: CompanionSceneArtwork, light: SceneLight, palette: AppearancePalette,
  positions: Record<string, number>, semanticMoment: CompanionMoment, variant?: EnvironmentVariant, neutralTime?: NeutralSceneTime): SceneTransferTarget[] {
  if (!matchesRoom(current) || !registrations.some(item => matchesRoom(item) && item.id === current.id && item.character === character && item.light === light && item.palette === palette && matchesEnvironment(item, variant, neutralTime))) return [];
  const matching = registrations.filter(item => matchesRoom(item) && item.character === character && item.light === light && item.palette === palette && matchesEnvironment(item, variant, neutralTime) && item.support !== current.support);
  const result: SceneTransferTarget[] = [];
  for (const support of ['window-seat', 'desk-chair', 'sofa', 'floor'] as const) {
    const candidates = matching.filter(item => item.support === support);
    const preferred = support === 'desk-chair' ? [semanticMoment, 'study', 'planning']
      : support === 'window-seat' ? [semanticMoment, 'reading', 'chat', 'rest'] : [semanticMoment, 'rest', 'chat', 'play'];
    const selected = preferred.map(activity => preferredRegistration(candidates.filter(item => item.activity === activity), variant)).find(Boolean) ?? preferredRegistration(candidates, variant);
    if (!selected) continue;
    const artwork = registeredArtwork(selected);
    result.push({ artwork, sceneId: selected.id, moment: selected.activity, positionKey: artwork.positionKey,
      position: companionScenePosition(artwork, positions),
      label: support === 'desk-chair' ? '桌边' : support === 'sofa' ? '沙发上' : support === 'floor' ? '地面上' : '窗边' });
  }
  return result;
}

export function companionSceneArtwork(character: string, moment: CompanionMoment = 'chat', light: SceneLight = 'morning', palette: AppearancePalette = 'apricot', variant?: EnvironmentVariant): CompanionSceneArtwork | undefined {
  const activity = moment === 'night' ? 'chat' : moment;
  const registration = preferredRegistration(registrations.filter(item => item.purpose !== 'neutral-presence' && matchesRoom(item) && item.character === character && item.activity === activity && item.light === light && item.palette === palette && matchesEnvironment(item, variant)), variant);
  return registration && registeredArtwork(registration);
}

/** Unknown-weather presence uses the reviewed time-only room independently of
 * the clock UI palette. Keep the source's canonical light, palette and geometry;
 * ordinary activity, weather and explicit scene-ID queries remain exact. */
export function companionNeutralPresenceArtwork(character: string, neutralTime: NeutralSceneTime): CompanionSceneArtwork | undefined {
  const light: SceneLight = neutralTime === 'night' ? 'night' : 'morning';
  const palette: AppearancePalette = neutralTime === 'night' ? 'rain' : 'mist';
  const registration = registrations.find(item => item.purpose === 'neutral-presence' && matchesRoom(item)
    && item.character === character && item.light === light && item.palette === palette && matchesEnvironment(item, 'unknown', neutralTime));
  return registration && registeredArtwork(registration);
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

export interface CompanionAmbientArtwork {
  sceneFamily: string;
  background: string;
  width: number;
  height: number;
  variant: EnvironmentVariant | 'time-day' | 'time-night';
  timeOnly: boolean;
  fallbackBackground?: string;
  fallbackVariant: 'time-day' | 'time-night';
}
const manualAmbientVariant: Record<AppearancePalette, Exclude<EnvironmentVariant, 'unknown'>> = {
  apricot: 'clear-day', mist: 'overcast-day', violet: 'twilight', rain: 'rain-night',
};
/** These are admitted empty rooms, not substitute character/activity cells. */
export function companionAmbientArtwork(environment: Pick<EffectiveEnvironment, 'mode' | 'palette' | 'requestedVariant' | 'isDay'>): CompanionAmbientArtwork | undefined {
  if (!roomBackgroundManifest) return undefined;
  const requested = environment.mode === 'manual' ? manualAmbientVariant[environment.palette] : environment.requestedVariant;
  const fallback = roomBackgroundManifest.timeOnly[environment.isDay ? 'day' : 'night'];
  const fallbackBackground = registeredFile(fallback?.file);
  const background = requested === 'unknown' ? undefined : registeredFile(roomBackgroundManifest.weather[requested]?.file);
  const fallbackVariant = environment.isDay ? 'time-day' : 'time-night';
  if (!background && !fallbackBackground) return undefined;
  return { sceneFamily: roomBackgroundManifest.roomFamily, background: background ?? fallbackBackground!, width: roomBackgroundManifest.width, height: roomBackgroundManifest.height,
    variant: background ? requested : fallbackVariant, timeOnly: !background, fallbackBackground, fallbackVariant };
}
// One crop for the entire admitted room family. Activity, theme and a temporary
// transfer preview cannot change its camera. Source margins protect the contact
// receivers around the reviewed person envelopes; they never enable more travel.
const roomFramingBounds = (() => {
  const family = registrations.filter(matchesRoom);
  if (!family.length || !roomBackgroundManifest) return [0, 0, 1, 1] as const;
  const limits = [1, 1, 0, 0];
  const include = (x: number, y: number) => {
    limits[0] = Math.min(limits[0], x); limits[1] = Math.min(limits[1], y);
    limits[2] = Math.max(limits[2], x); limits[3] = Math.max(limits[3], y);
  };
  const includeRect = (rect: readonly number[] | undefined) => {
    if (rect?.length === 4 && rect.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
      && rect[0] < rect[2] && rect[1] < rect[3]) { include(rect[0], rect[1]); include(rect[2], rect[3]); }
  };
  for (const registration of family) {
    const artwork = registeredArtwork(registration);
    for (const at of seatPositionBounds(artwork)) {
      const scale = 1 + at * artwork.perspective;
      const dx = at * artwork.travel;
      const dy = dx * artwork.width / artwork.height * artwork.slope;
      for (const [x, y] of [[artwork.bodyBounds[0], artwork.bodyBounds[1]], [artwork.bodyBounds[2], artwork.bodyBounds[3]], artwork.seat, artwork.ground])
        include(artwork.seat[0] + (x - artwork.seat[0]) * scale + dx, artwork.seat[1] + (y - artwork.seat[1]) * scale + dy);
    }
    includeRect(registration.review.geometryEvidence?.jointReceiverEnvelope?.normalized);
    for (const [x, y] of registration.sourceShadowPolygon ?? []) include(x / artwork.width, y / artwork.height);
    if (registration.floorCast) {
      const [x, y, width, height] = registration.floorCast.clip;
      include(x / artwork.width, y / artwork.height); include((x + width) / artwork.width, (y + height) / artwork.height);
    }
  }
  for (const polygon of [...(roomInteraction?.dropTargets.flatMap(target => target.regions.map(region => region.polygon)) ?? []),
    ...(roomInteraction?.hotspots.map(hotspot => hotspot.polygon) ?? [])])
    for (const [x, y] of polygon) include(x / roomBackgroundManifest.width, y / roomBackgroundManifest.height);
  return [Math.max(0, limits[0] - 96 / roomBackgroundManifest.width), Math.max(0, limits[1] - 12 / roomBackgroundManifest.height),
    Math.min(1, limits[2] + 96 / roomBackgroundManifest.width), Math.min(1, limits[3] + 12 / roomBackgroundManifest.height)] as const;
})();
export function companionRoomFrame(width: number, height: number, canvasWidth: number, canvasHeight: number,
  focusBounds?: readonly [number, number, number, number]) {
  const wideScale = Math.max(0, width / canvasWidth), tallScale = Math.max(0, height / canvasHeight);
  const cover = Math.max(wideScale, tallScale);
  // A tall window uses a deliberate crop around the same actor, not a tiny
  // complete landscape surrounded by letterboxing. Source pixels and all
  // furniture/interaction coordinates still share this single transform.
  if (focusBounds && width <= 760 && height > width * .9) {
    const focusX = (focusBounds[0] + focusBounds[2]) * canvasWidth / 2;
    return { scale: cover, x: Math.min(0, Math.max(width - canvasWidth * cover, width / 2 - focusX * cover)),
      y: Math.min(0, (height - canvasHeight * cover) / 2), width: canvasWidth * cover,
      height: canvasHeight * cover, policy: 'compact-cover' as const };
  }
  const bounds = canvasWidth === roomBackgroundManifest?.width && canvasHeight === roomBackgroundManifest.height ? roomFramingBounds : [0, 0, 1, 1];
  const minimumX = -bounds[0] * canvasWidth * cover, maximumX = width - bounds[2] * canvasWidth * cover;
  const minimumY = -bounds[1] * canvasHeight * cover, maximumY = height - bounds[3] * canvasHeight * cover;
  if (minimumX <= maximumX + .001 && minimumY <= maximumY + .001) {
    return { scale: cover,
      x: Math.max(minimumX, Math.min(maximumX, (width - canvasWidth * cover) / 2)),
      y: Math.max(minimumY, Math.min(maximumY, (height - canvasHeight * cover) / 2)),
      width: canvasWidth * cover, height: canvasHeight * cover, policy: 'safe-cover' as const };
  }
  // Keep the largest scale that fits the same protected room, rather than
  // snapping to full-canvas contain when cover misses it by a few pixels.
  // The 2026-10-25 audit found 23 admitted scenes protecting Y=79..943;
  // seven unadmitted Sakiko candidates would extend that to 74..967 (893px).
  // Bounds stay data-driven, including receivers, hotspots and the 12/96px
  // margins. A wide viewport may still need a matching extended plate.
  const protectedWidth = (bounds[2] - bounds[0]) * canvasWidth;
  const protectedHeight = (bounds[3] - bounds[1]) * canvasHeight;
  const scale = Math.min(cover, Math.max(0, width) / protectedWidth, Math.max(0, height) / protectedHeight);
  const fitMinimumX = -bounds[0] * canvasWidth * scale, fitMaximumX = width - bounds[2] * canvasWidth * scale;
  const fitMinimumY = -bounds[1] * canvasHeight * scale, fitMaximumY = height - bounds[3] * canvasHeight * scale;
  return { scale,
    x: Math.max(fitMinimumX, Math.min(fitMaximumX, (width - canvasWidth * scale) / 2)),
    y: Math.max(fitMinimumY, Math.min(fitMaximumY, (height - canvasHeight * scale) / 2)),
    width: canvasWidth * scale, height: canvasHeight * scale,
    policy: 'protected-fit' as const };
}
type RoomLayoutSource = Omit<CompanionRoomLayout, 'viewportClientRect' | 'frame' | 'actorClientRect' | 'framePolicy'>;
function useRoomLayoutReport(viewport: { current: HTMLDivElement | null }, callback: CompanionRoomActions['onRoomLayout'], source: RoomLayoutSource,
  frame: ReturnType<typeof companionRoomFrame>) {
  const current = useRef({ callback, source, frame });
  current.current = { callback, source, frame };
  const last = useRef<string | undefined>(undefined);
  const previousCallback = useRef(callback);
  function publish() {
    const { callback, source, frame } = current.current;
    if (!callback) {
      previousCallback.current?.(null); previousCallback.current = undefined; last.current = undefined; return;
    }
    previousCallback.current = callback;
    const element = viewport.current;
    if (!element) return;
    const rect = element.getBoundingClientRect(), actor = source.actorVisible ? source.actorSourceRect : null;
    const payload: CompanionRoomLayout = { ...source,
      frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height, scale: frame.scale }, framePolicy: frame.policy,
      viewportClientRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      actorClientRect: actor ? { left: rect.left + frame.x + actor.left * frame.scale, top: rect.top + frame.y + actor.top * frame.scale,
        width: actor.width * frame.scale, height: actor.height * frame.scale } : null };
    const signature = JSON.stringify(payload);
    if (last.current !== signature) { last.current = signature; callback(payload); }
  }
  useLayoutEffect(publish);
  useEffect(() => {
    window.addEventListener('scroll', publish, true);
    return () => { window.removeEventListener('scroll', publish, true); current.current.callback?.(null); };
  }, []);
}
interface RoomHotspotAvailability { onHotspotsAvailableChange?: (available: boolean) => void }
function RoomHotspots({ family, actor, enabled = true, onStartFocus, deskActionLabel, onRest, focusActive = false, onHotspotsAvailableChange }: {
  family: string; actor?: CompanionRoomRect | null; enabled?: boolean;
} & CompanionRoomActions & RoomHotspotAvailability) {
  const hotspots = enabled && roomInteraction?.roomFamily === family ? roomInteraction.hotspots.filter(hotspot => {
    const action = hotspot.action === 'start-focus' ? onStartFocus : onRest;
    if (!action) return false;
    const xs = hotspot.polygon.map(point => point[0]), ys = hotspot.polygon.map(point => point[1]);
    return !actor || !(Math.max(...xs) > actor.left && Math.min(...xs) < actor.left + actor.width
      && Math.max(...ys) > actor.top && Math.min(...ys) < actor.top + actor.height);
  }) : [];
  const available = hotspots.some(hotspot => hotspot.action !== 'start-focus' || !focusActive);
  useLayoutEffect(() => {
    onHotspotsAvailableChange?.(available);
    return () => onHotspotsAvailableChange?.(false);
  }, [available, onHotspotsAvailableChange]);
  if (!roomInteraction) return null;
  return <>{hotspots.map(hotspot => {
    const action = hotspot.action === 'start-focus' ? onStartFocus : onRest;
    const points = hotspot.polygon.map(point => point.join(',')).join(' ');
    const focus = hotspot.action === 'start-focus';
    const label = focus ? deskActionLabel || (focusActive ? '专注进行中' : '开始专注') : '坐下歇一会儿';
    return <button key={hotspot.action} type="button" className="scene-object-hotspot" data-action={hotspot.action}
      data-active={focus && focusActive || undefined} disabled={focus && focusActive}
      aria-label={label} title={label}
      style={{ clipPath: `polygon(${hotspot.polygon.map(([x, y]) => `${x / roomInteraction.width * 100}% ${y / roomInteraction.height * 100}%`).join(',')})` }}
      onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); action?.(); }}>
      <svg viewBox={`0 0 ${roomInteraction.width} ${roomInteraction.height}`} aria-hidden="true"><polygon points={points} vectorEffect="non-scaling-stroke" /></svg>
    </button>;
  })}</>;
}
export type CompanionAmbientFit = 'room' | 'cover';

type RoomPerch = { id: string; label: string; x: number; y: number; pose: 'loaf' | 'curl' };
const literaryFurniturePerches: RoomPerch[] = [
  { id: 'lamp', label: '窗边灯罩', x: 510, y: 283, pose: 'loaf' },
  { id: 'books', label: '圆桌上的书', x: 552, y: 488, pose: 'curl' },
  { id: 'bench', label: '窗边软垫', x: 838, y: 548, pose: 'curl' },
  { id: 'floor', label: '窗前地毯', x: 704, y: 964, pose: 'curl' },
];
// These actor supports were checked against the exact original mothers. Other
// poses keep furniture points without inventing head or lap coordinates.
const literaryActorPerches: Record<string, RoomPerch[]> = {
  'sakiko-chat-apricot-literary-v1': [
    { id: 'head', label: '祥子头顶', x: 1140, y: 120, pose: 'loaf' },
    { id: 'lap', label: '祥子膝上', x: 1138, y: 559, pose: 'curl' },
  ],
  'sakiko-study-apricot-literary-desk-v1': [
    { id: 'book', label: '祥子手边的书', x: 132, y: 379, pose: 'curl' },
  ],
};
function RoomPerches({ family, actor, pose, actorStyle }: {
  family: string; actor: CompanionRoomRect | null; pose?: string; actorStyle?: CSSProperties;
}) {
  if (family !== 'literary-room-v1') return null;
  const render = (perch: RoomPerch) => <div key={perch.id} className="workspace-scene-perch"
    data-presence-edge={`room-${pose || 'empty'}-${perch.id}`} data-presence-edge-label={perch.label}
    data-presence-edge-sides="top" data-presence-edge-point="true" data-presence-edge-scene="true"
    data-presence-edge-pose={perch.pose} style={{ left: perch.x - 36, top: perch.y, width: 72, height: 4 }} />;
  return <>
    {literaryFurniturePerches.filter(perch => !actor || perch.x < actor.left - 30 || perch.x > actor.left + actor.width + 30
      || perch.y < actor.top || perch.y > actor.top + actor.height + 30).map(render)}
    {pose && <div className="scene-actor-perches" style={actorStyle}>{(literaryActorPerches[pose] || []).map(render)}</div>}
  </>;
}

/** Room presentation uses the common physical camera. Decorative cover is
 * only an admitted empty plate, with no room coordinates or interactions. */
export function CompanionRoomStage({ artwork, reducedMotion = false, ambientFit = 'room', onRoomLayout, onStartFocus, deskActionLabel, onRest, focusActive, onHotspotsAvailableChange }: {
  artwork: CompanionAmbientArtwork; reducedMotion?: boolean; ambientFit?: CompanionAmbientFit;
} & CompanionRoomActions & RoomHotspotAvailability) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [openedBackground, setOpenedBackground] = useState<string>();
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const initial = element.getBoundingClientRect();
    setSize({ width: initial.width, height: initial.height });
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setFailed(new Set()), [artwork.background]);
  const background = !failed.has(artwork.background) ? artwork.background
    : artwork.fallbackBackground && !failed.has(artwork.fallbackBackground) ? artwork.fallbackBackground : undefined;
  const timeOnly = artwork.timeOnly || background !== artwork.background;
  const variant = timeOnly ? artwork.fallbackVariant : artwork.variant;
  const frame = companionRoomFrame(size.width, size.height, artwork.width, artwork.height, [0, 0, 1, 1]);
  useRoomLayoutReport(viewport, ambientFit === 'cover' ? undefined : onRoomLayout, { family: artwork.sceneFamily, sourceKey: `${artwork.sceneFamily}:${background ?? 'unavailable'}`,
    sourceCanvas: { width: artwork.width, height: artwork.height }, poseId: null, support: null, bodyBounds: null, actorSourceRect: null, actorVisible: false, interaction: 'idle' }, frame);
  useLayoutEffect(() => {
    if (ambientFit !== 'cover') return;
    onRoomLayout?.(null);
    onHotspotsAvailableChange?.(false);
  }, [ambientFit, onRoomLayout, onHotspotsAvailableChange]);
  const fail = () => { if (background) setFailed(current => new Set([...current, background])); };
  const opened = (image: HTMLImageElement) => {
    if (image.naturalWidth !== artwork.width || image.naturalHeight !== artwork.height) fail();
    else setOpenedBackground(background);
  };
  return <div ref={viewport} className="scene-stage-viewport" data-scene-family={artwork.sceneFamily} data-ambient-fit={ambientFit}
    data-frame-policy={ambientFit === 'cover' ? 'decorative-cover' : frame.policy} data-art-source="ambient-only" data-environment-state="ambient-only" data-ambient-variant={variant} data-time-only={timeOnly}>
    {matchesRoom(artwork) && background && (ambientFit === 'cover'
      ? <img key={background} className="scene-ambient-cover" src={background} alt="" draggable={false}
        onError={fail} onLoad={event => opened(event.currentTarget)} />
      : <div className="scene-canvas" style={{ width: artwork.width, height: artwork.height,
      transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`, transition: reducedMotion ? 'none' : undefined }}>
      <img key={background} className="scene-layer" src={background} alt="" draggable={false} onError={fail} onLoad={event => opened(event.currentTarget)} />
      <RoomHotspots family={artwork.sceneFamily} enabled={openedBackground === background} onStartFocus={onStartFocus} deskActionLabel={deskActionLabel} onRest={onRest} focusActive={focusActive} onHotspotsAvailableChange={onHotspotsAvailableChange} />
      {openedBackground === background && <RoomPerches family={artwork.sceneFamily} actor={null} />}
    </div>)}
  </div>;
}

const portraits = import.meta.glob('../../前端视觉创新设计/运行素材/companion/portraits/*-portrait.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function companionScenePortrait(character: string) {
  return portraits[`../../前端视觉创新设计/运行素材/companion/portraits/${character}-portrait.png`];
}

/** Position follows a calibrated support surface; floor poses stay at their contact pivot. */
export function CompanionSceneStage({ artwork, name, position, onCommit, transferTargets = [], transferScope, onTransferCommit, showFigure = true, interactive = true, quiet = false, reducedMotion = false, previewOnly = false,
  yieldToInput = false, onRoomLayout, onStartFocus, deskActionLabel, onRest, focusActive, onHotspotsAvailableChange }: {
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
  yieldToInput?: boolean;
  reducedMotion?: boolean;
  previewOnly?: boolean;
} & CompanionRoomActions & RoomHotspotAvailability) {
  const svgId = useId().replace(/:/g, '');
  const viewport = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const furnitureMenu = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const bounds = seatPositionBounds(artwork);
  const currentBounds = useRef(bounds);
  currentBounds.current = bounds;
  const legal = (next: number) => Math.max(currentBounds.current[0], Math.min(currentBounds.current[1], clamp(next)));
  const spring = useSpringValue(legal(position), { bounds, precision: .0005, stiffness: 300, damping: 31, reducedMotion });
  const value = spring.value;
  const [moving, setMoving] = useState(false);
  const [failedLayer, setFailedLayer] = useState(false);
  const [failedMother, setFailedMother] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [openedMother, setOpenedMother] = useState<string>();
  const [openedBackground, setOpenedBackground] = useState<string>();
  const [openedContactAssembly, setOpenedContactAssembly] = useState<string>();
  const [openedFloorMask, setOpenedFloorMask] = useState<string>();
  const [openedFloorFigure, setOpenedFloorFigure] = useState<string>();
  const [saveError, setSaveError] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const targetsOpenRef = useRef(false);
  targetsOpenRef.current = targetsOpen;
  const hoveredTargetRef = useRef<string | undefined>(undefined);
  const pointerDistance = useRef(0);
  const targetButtons = useRef(new Map<string, HTMLButtonElement>());
  const decodedArtwork = useRef(new Map<string, Promise<void>>());
  const readyMothers = useRef(new Set<string>());
  const [dragPreview, setDragPreview] = useState<SceneTransferTarget>();
  const dragPreviewRef = useRef<SceneTransferTarget | undefined>(undefined);
  const [transferError, setTransferError] = useState('');
  const [openingTransfer, setOpeningTransfer] = useState(false);
  const openingTransferRef = useRef(false);
  const focusRestoreVersion = useRef(0);
  const [pendingTransfer, setPendingTransfer] = useState<{ target: SceneTransferTarget; origin: { sceneId: string; position: number }; sourceKey: string; scope?: string }>();
  const pendingTransferRef = useRef(pendingTransfer);
  pendingTransferRef.current = pendingTransfer;
  const shown = dragPreview?.artwork ?? artwork;
  const imageKey = sceneSourceKey(shown, imageAttempt);
  const sourceKey = sceneSourceKey(artwork, imageAttempt);
  const currentImageKey = useRef(imageKey);
  currentImageKey.current = imageKey;
  const imageSource = (url: string | undefined) => url && imageAttempt ? `${url}${url.includes('?') ? '&' : '?'}scene-retry=${imageAttempt}` : url;
  const motherReady = openedMother === imageKey;
  const backgroundReady = openedBackground === imageKey;
  const contactReady = !shown.contactMask || openedContactAssembly === imageKey;
  const subjectReady = motherReady && backgroundReady && !failedMother && contactReady && (!shown.contactMask || !failedLayer);
  const shownBounds = seatPositionBounds(shown);
  const shownPosition = dragPreview ? Math.max(shownBounds[0], Math.min(shownBounds[1], dragPreview.position)) : value;
  const latest = useRef({ onCommit, position, artwork, sourceKey, quiet, yieldToInput, interactive, showFigure, previewOnly, transferTargets, transferScope, onTransferCommit });
  latest.current = { onCommit, position, artwork, sourceKey, quiet, yieldToInput, interactive, showFigure, previewOnly, transferTargets, transferScope, onTransferCommit };
  const inputHeld = useRef(false);
  const gesture = useRef<{ pointerId: number; x: number; y: number; origin: number; savedOrigin: number; scale: number; tangentX: number; tangentY: number; sampledAt: number; sampledValue: number; velocity: number;
    assetId: string; sourceKey: string; previewOnly: boolean; onCommit: (position: number) => void; distance: number;
    stageX: number; stageY: number; grabOffsetX: number; grabOffsetY: number } | undefined>(undefined);
  const keyboardOrigin = useRef<number | undefined>(undefined);
  const pendingOrigin = useRef<number | undefined>(undefined);
  const pendingTarget = useRef<number | undefined>(undefined);
  const fixedSourceShadow = shown.shadowMode === 'source' && shown.travel === 0 && shown.slope === 0 && shown.perspective === 0;
  const sourceShadowPoints = shown.sourceShadowPolygon?.map(point => point.join(',')).join(' ');
  const floorCast = shown.floorCast;
  const floorFigure = shown.mask ?? shown.figure;
  const floorReady = !!floorCast && shown.travel === 0 && shown.slope === 0 && shown.perspective === 0
    && openedFloorMask === `${imageKey}:${floorCast.mask}` && openedFloorFigure === `${imageKey}:${floorFigure}`;
  const layered = !!shown.background && (!!shown.figure || !!shown.mask) && !failedLayer;
  const sameRoom = matchesRoom(shown);
  const sourceReady = sameRoom && !failedMother && !failedLayer && (moving || layered && subjectReady);
  const canSlide = !yieldToInput && interactive && showFigure && sourceReady && !pendingTransfer && artwork.contourComplete && bounds[1] - bounds[0] > .0001;
  const canTransfer = !yieldToInput && interactive && showFigure && sourceReady && !pendingTransfer && !!onTransferCommit && transferTargets.length > 0;
  const canMove = canSlide || canTransfer;
  // All layers share the family's safe camera, including a transfer preview.
  const frame = companionRoomFrame(size.width, size.height, shown.width, shown.height, shown.bodyBounds);
  const scale = frame.scale;
  const stageX = moving && gesture.current ? gesture.current.stageX : frame.x;
  const stageY = moving && gesture.current ? gesture.current.stageY : frame.y;
  const apply = (next: number, velocity = 0) => spring.set(legal(next), velocity);
  function commit(next: number) {
    if (latest.current.yieldToInput) return;
    try { latest.current.onCommit(next); setSaveError(false); }
    catch { spring.animate(legal(latest.current.position)); setSaveError(true); }
  }
  function settle(next: number, velocity = spring.get().velocity, save = true) {
    const target = legal(next);
    const assetId = latest.current.artwork.id;
    const sourceKey = latest.current.sourceKey;
    const scope = latest.current.transferScope;
    if (save) pendingOrigin.current ??= legal(latest.current.position);
    else pendingOrigin.current = undefined;
    pendingTarget.current = save ? target : undefined;
    if (save && latest.current.previewOnly) commit(target);
    spring.animate(target, { velocity, ...(save ? { onRest: () => {
      pendingOrigin.current = undefined; pendingTarget.current = undefined;
      if (latest.current.artwork.id === assetId && latest.current.sourceKey === sourceKey && latest.current.transferScope === scope && !latest.current.previewOnly) commit(target);
    } } : {}) });
  }
  function cancelPending() {
    if (pendingOrigin.current === undefined) return;
    const origin = pendingOrigin.current;
    settle(origin, spring.get().velocity, false);
    if (latest.current.previewOnly) commit(legal(origin));
  }
  function showDragPreview(target?: SceneTransferTarget) {
    dragPreviewRef.current = target; setDragPreview(target);
    const next = target?.artwork ?? latest.current.artwork;
    const nextKey = sceneSourceKey(next, imageAttempt);
    if (readyMothers.current.has(nextKey)) setOpenedMother(nextKey);
  }
  function decodeArtwork(target: CompanionSceneArtwork) {
    if (!matchesRoom(target)) return Promise.reject(new Error('房间刚换过，原来的选择还在。'));
    const layers = [...new Set([target.mother, target.background, target.figure || target.mask, target.shadow, target.foreground,
      target.floorCast?.mask, target.floorCast ? target.mask : undefined, target.contactMask]
      .filter((url): url is string => !!url))];
    const key = sceneSourceKey(target, imageAttempt);
    let decoded = decodedArtwork.current.get(key);
    if (!decoded) {
      decoded = Promise.all(layers.map(async url => {
        const image = new Image(); image.src = imageSource(url)!;
        await image.decode();
        if (image.naturalWidth !== target.width || image.naturalHeight !== target.height)
          throw new Error('这里的画面还没完整打开。原来的位置还在。');
      })).then(() => { readyMothers.current.add(key); }).catch(problem => {
        decodedArtwork.current.delete(key);
        throw problem;
      });
      decodedArtwork.current.set(key, decoded);
    }
    return decoded;
  }
  function closeTransfer(restoreFocus = false, preserveError = false) {
    const focusVersion = ++focusRestoreVersion.current;
    const focusOwner = document.activeElement;
    const ownedFocus = focusOwner === handle.current || !!focusOwner && furnitureMenu.current?.contains(focusOwner);
    pendingTransferRef.current = undefined;
    openingTransferRef.current = false; setOpeningTransfer(false);
    setPendingTransfer(undefined); setTargetsOpen(false); hoveredTargetRef.current = undefined; showDragPreview();
    if (!preserveError) setTransferError('');
    if (restoreFocus) requestAnimationFrame(() => {
      if (ownedFocus && (document.activeElement === focusOwner || document.activeElement === document.body)
        && focusRestoreVersion.current === focusVersion && !latest.current.yieldToInput && latest.current.interactive && latest.current.showFigure && !document.hidden)
        handle.current?.focus({ preventScroll: true });
    });
  }
  function previewTransfer(target: SceneTransferTarget) {
    const current = latest.current;
    if (current.yieldToInput) return;
    const valid = current.transferTargets.find(item => item.sceneId === target.sceneId);
    if (!valid || !current.onTransferCommit) return;
    finish(true); cancelKeyboard(); cancelPending();
    const next = { target: valid, origin: { sceneId: current.artwork.id, position: current.position }, sourceKey: current.sourceKey, scope: current.transferScope };
    pendingTransferRef.current = next; setPendingTransfer(next); setTargetsOpen(false); hoveredTargetRef.current = undefined; setTransferError('');
    void acceptTransfer();
  }
  async function acceptTransfer() {
    const pending = pendingTransferRef.current;
    let current = latest.current;
    if (!pending || current.yieldToInput || !current.onTransferCommit || failedLayer || failedMother || openingTransferRef.current) return;
    if (pending.sourceKey !== current.sourceKey || pending.origin.sceneId !== current.artwork.id || pending.scope !== current.transferScope
      || !current.transferTargets.some(item => item.sceneId === pending.target.sceneId && sceneSourceKey(item.artwork, imageAttempt) === sceneSourceKey(pending.target.artwork, imageAttempt))) {
      closeTransfer(true); return;
    }
    openingTransferRef.current = true; setOpeningTransfer(true); setTransferError('');
    let layersOpened = false;
    try {
      // A visual drop is committed only after this exact pose is decoded.
      // Source/version checks below still reject a late result after Escape,
      // another scene choice, or an environment change.
      await decodeArtwork(pending.target.artwork);
      layersOpened = true;
      current = latest.current;
      if (pendingTransferRef.current !== pending) return;
      if (current.yieldToInput) { closeTransfer(); return; }
      if (!current.onTransferCommit || pending.sourceKey !== current.sourceKey || pending.origin.sceneId !== current.artwork.id || pending.scope !== current.transferScope
        || pending.origin.position !== current.position || !current.transferTargets.some(item => item.sceneId === pending.target.sceneId
          && sceneSourceKey(item.artwork, imageAttempt) === sceneSourceKey(pending.target.artwork, imageAttempt))) {
        closeTransfer(true); return;
      }
      const { sceneId, moment, positionKey, position } = pending.target;
      current.onTransferCommit({ sceneId, moment, positionKey, position }, pending.origin);
      closeTransfer(true);
    } catch (problem) {
      if (pendingTransferRef.current === pending) {
        closeTransfer(true);
        setTransferError(uiError(problem, { fallback: layersOpened ? '这个位置暂时没能留下，已经回到原处。'
          : '这里的画面暂时没打开，已经回到原处。' }));
      }
    } finally {
      if (pendingTransferRef.current === pending) { openingTransferRef.current = false; setOpeningTransfer(false); }
    }
  }
  function finish(cancel: boolean) {
    const active = gesture.current;
    if (!active) return;
    cancel ||= active.assetId !== latest.current.artwork.id || active.sourceKey !== latest.current.sourceKey;
    pointerDistance.current = active.distance;
    gesture.current = undefined;
    setMoving(false);
    const transfer = !cancel && active.distance >= 8 ? latest.current.transferTargets.find(item => item.sceneId === hoveredTargetRef.current) : undefined;
    setTargetsOpen(false); hoveredTargetRef.current = undefined;
    if (cancel || transfer || currentBounds.current[1] - currentBounds.current[0] <= .0001) {
      settle(active.savedOrigin, spring.get().velocity, false);
      if (active.previewOnly) active.onCommit(active.savedOrigin);
    }
    else settle(spring.get().value, performance.now() - active.sampledAt < 100 ? active.velocity : 0);
    if (handle.current?.hasPointerCapture(active.pointerId)) handle.current.releasePointerCapture(active.pointerId);
    if (transfer) previewTransfer(transfer);
    else showDragPreview();
  }
  function cancelKeyboard() {
    if (keyboardOrigin.current === undefined) return;
    settle(keyboardOrigin.current, spring.get().velocity, false); keyboardOrigin.current = undefined;
  }
  function acceptKeyboard() {
    if (keyboardOrigin.current === undefined) return;
    keyboardOrigin.current = undefined; settle(spring.get().value);
  }
  function holdForInput() {
    const active = gesture.current;
    gesture.current = undefined;
    keyboardOrigin.current = undefined; pendingOrigin.current = undefined; pendingTarget.current = undefined;
    spring.set(spring.get().value);
    setMoving(false); closeTransfer(false, true);
    if (active && handle.current?.hasPointerCapture(active.pointerId)) handle.current.releasePointerCapture(active.pointerId);
  }
  useLayoutEffect(() => {
    if (yieldToInput) { inputHeld.current = true; holdForInput(); }
    else if (inputHeld.current) {
      inputHeld.current = false;
      spring.animate(legal(latest.current.position));
    }
  }, [yieldToInput]);
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
  }, [sourceKey, transferScope]);
  useEffect(() => {
    if (!shown.contactMask) return;
    let current = true;
    void decodeArtwork(shown).then(() => {
      if (current && currentImageKey.current === imageKey) setOpenedContactAssembly(imageKey);
    }).catch(() => {
      if (current && currentImageKey.current === imageKey) setFailedLayer(true);
    });
    return () => { current = false; };
  }, [imageKey]);
  useLayoutEffect(() => {
    setFailedLayer(false); setFailedMother(false);
  }, [imageKey]);
  const transferAssetKey = transferTargets.map(target => sceneSourceKey(target.artwork, imageAttempt)).join('|');
  useEffect(() => {
    for (const target of transferTargets) void decodeArtwork(target.artwork).catch(() => { /* A failed destination leaves the current pose available. */ });
  }, [transferAssetKey, imageAttempt]);
  useEffect(() => {
    if (!targetsOpen) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !furnitureMenu.current?.contains(event.target)) setTargetsOpen(false);
    };
    window.addEventListener('pointerdown', outside, true);
    return () => window.removeEventListener('pointerdown', outside, true);
  }, [targetsOpen]);
  useEffect(() => {
    if ((!interactive || !showFigure) && pendingTransferRef.current) closeTransfer();
  }, [interactive, showFigure]);
  useEffect(() => {
    if (pendingTransferRef.current && pendingTransferRef.current.origin.position !== position) closeTransfer();
    if (gesture.current && legal(position) !== gesture.current.savedOrigin) finish(true);
    if (keyboardOrigin.current !== undefined && legal(position) !== keyboardOrigin.current) keyboardOrigin.current = undefined;
    if (!gesture.current && keyboardOrigin.current === undefined) {
      if (previewOnly && pendingOrigin.current !== undefined && pendingTarget.current === legal(position)) return;
      pendingOrigin.current = undefined; pendingTarget.current = undefined;
      if (latest.current.yieldToInput) spring.set(legal(position));
      else spring.animate(legal(position));
    }
  }, [position]);
  useEffect(() => {
    if (latest.current.yieldToInput) { holdForInput(); return; }
    finish(true); cancelKeyboard(); cancelPending(); closeTransfer();
  }, [quiet]);
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
      focusRestoreVersion.current++; spring.stop();
      window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!canMove || gesture.current || event.button !== 0 || !event.isPrimary || !scale) return;
    event.preventDefault(); event.stopPropagation();
    keyboardOrigin.current = undefined;
    event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    const snapshot = spring.stop(); pendingOrigin.current = undefined; pendingTarget.current = undefined;
    const rect = viewport.current!.getBoundingClientRect(), u = snapshot.value;
    const worldX = (event.clientX - rect.left - stageX) / scale;
    const worldY = (event.clientY - rect.top - stageY) / scale;
    const originalX = (worldX - artwork.seat[0] * artwork.width - u * artwork.travel * artwork.width) / (1 + u * artwork.perspective);
    const originalY = (worldY - artwork.seat[1] * artwork.height - u * artwork.travel * artwork.width * artwork.slope) / (1 + u * artwork.perspective);
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: u, savedOrigin: legal(latest.current.position), scale,
      assetId: artwork.id, sourceKey: latest.current.sourceKey, previewOnly, onCommit: latest.current.onCommit, distance: 0,
      stageX, stageY, grabOffsetX: worldX - artwork.seat[0] * artwork.width - u * artwork.travel * artwork.width,
      grabOffsetY: worldY - artwork.seat[1] * artwork.height - u * artwork.travel * artwork.width * artwork.slope,
      sampledAt: performance.now(), sampledValue: u, velocity: snapshot.velocity,
      tangentX: artwork.travel * artwork.width + artwork.perspective * originalX,
      tangentY: artwork.travel * artwork.width * artwork.slope + artwork.perspective * originalY };

    setMoving(true); setTargetsOpen(false); setTransferError('');
    pointerDistance.current = 0;
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    active.distance = Math.hypot(event.clientX - active.x, event.clientY - active.y);
    const rect = viewport.current!.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left - active.stageX) / active.scale;
    const pointerY = (event.clientY - rect.top - active.stageY) / active.scale;
    const contactX = pointerX - active.grabOffsetX;
    const contactY = pointerY - active.grabOffsetY;
    const visibleStates = new Set(['all', artwork.support === 'desk-chair' ? 'desk-chair-pose' : 'empty-chair',
      ...(dragPreview ? [dragPreview.artwork.support === 'desk-chair' ? 'desk-chair-pose' : 'empty-chair'] : [])]);
    const hovered = latest.current.transferTargets.map(target => {
      const regions = roomInteraction?.dropTargets.find(item => item.support === target.artwork.support)?.regions
        .filter(region => visibleStates.has(region.state)) ?? [];
      let distance = Infinity;
      for (const { polygon } of regions) {
        const x = polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length;
        const y = polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length;
        for (const [px, py] of [[pointerX, pointerY], [contactX, contactY]]) {
          if (insidePolygon(px, py, polygon)) distance = Math.min(distance, (px - x) ** 2 + (py - y) ** 2);
        }
      }
      return { target, distance };
    }).filter(item => Number.isFinite(item.distance))
      .sort((a, b) => a.distance - b.distance)[0]?.target;
    hoveredTargetRef.current = hovered?.sceneId;
    if (active.distance >= 8 && hovered && dragPreviewRef.current?.sceneId !== hovered.sceneId) {
      void decodeArtwork(hovered.artwork).then(() => {
        if (gesture.current === active && active.sourceKey === latest.current.sourceKey && hoveredTargetRef.current === hovered.sceneId
          && latest.current.transferTargets.some(target => target.sceneId === hovered.sceneId
            && sceneSourceKey(target.artwork, imageAttempt) === sceneSourceKey(hovered.artwork, imageAttempt))) showDragPreview(hovered);
      }).catch(() => { /* The original pose stays visible until a complete destination can open. */ });
    } else if (!hovered && dragPreviewRef.current) showDragPreview();
    if (hovered) return;
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
  function openTransferMenu() {
    if (!canTransfer) return;
    cancelKeyboard(); cancelPending(); setTargetsOpen(true);
    const focusVersion = focusRestoreVersion.current;
    requestAnimationFrame(() => {
      if (document.activeElement === handle.current && focusRestoreVersion.current === focusVersion
        && targetsOpenRef.current && !latest.current.yieldToInput && !document.hidden)
        targetButtons.current.values().next().value?.focus({ preventScroll: true });
    });
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!canMove) return;
    if (canTransfer && (event.key === ' ' || event.key === 'Enter' && keyboardOrigin.current === undefined)) {
      event.preventDefault(); event.stopPropagation(); openTransferMenu(); return;
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
  const dx = shownPosition * shown.travel * shown.width;
  const actorStyle: CSSProperties = {
    transformOrigin: `${shown.seat[0] * 100}% ${shown.seat[1] * 100}%`,
    transform: `translate(${dx}px, ${dx * shown.slope}px) scale(${1 + shownPosition * shown.perspective})`,
  };
  const actorVisible = showFigure && sameRoom && subjectReady && (layered || !shown.contactMask);
  const actorScale = 1 + shownPosition * shown.perspective;
  const actorSourceRect: CompanionRoomRect | null = actorVisible ? {
    left: shown.seat[0] * shown.width + (shown.bodyBounds[0] - shown.seat[0]) * shown.width * actorScale + dx,
    top: shown.seat[1] * shown.height + (shown.bodyBounds[1] - shown.seat[1]) * shown.height * actorScale + dx * shown.slope,
    width: (shown.bodyBounds[2] - shown.bodyBounds[0]) * shown.width * actorScale,
    height: (shown.bodyBounds[3] - shown.bodyBounds[1]) * shown.height * actorScale,
  } : null;
  useRoomLayoutReport(viewport, onRoomLayout, { family: shown.sceneFamily, sourceKey: imageKey,
    sourceCanvas: { width: shown.width, height: shown.height }, poseId: shown.id, support: shown.support,
    bodyBounds: shown.bodyBounds, actorSourceRect, actorVisible,
    interaction: moving ? 'dragging' : pendingTransfer ? 'committing' : 'idle' }, { ...frame, x: stageX, y: stageY });
  const verifyLayer = (image: HTMLImageElement) => {
    if (currentImageKey.current !== imageKey) return false;
    if (image.naturalWidth !== shown.width || image.naturalHeight !== shown.height) { setFailedLayer(true); return false; }
    return true;
  };
  const failLayer = () => { if (currentImageKey.current === imageKey) setFailedLayer(true); };
  const failMother = () => { if (currentImageKey.current === imageKey) setFailedMother(true); };
  const retryImages = () => {
    finish(true); cancelKeyboard(); cancelPending(); closeTransfer();
    decodedArtwork.current.clear();
    setFailedMother(false); setFailedLayer(false); setOpenedMother(undefined); setOpenedContactAssembly(undefined); setImageAttempt(current => current + 1);
  };
  const showEmptyRoom = !!shown.background && (shown.contactMask ? failedMother || failedLayer : failedMother && !failedLayer);
  const seatName = shown.support === 'floor' ? '地面上' : shown.support === 'desk-chair' ? '桌边' : shown.support === 'sofa' ? '沙发上' : '窗边';
  return <div ref={viewport} className={`scene-stage-viewport${moving ? ' is-moving' : ''}${pendingTransfer ? ' is-trying-place' : ''}`} data-scene-family={shown.sceneFamily} data-frame-policy={frame.policy} data-scene={shown.id} data-activity={shown.activity} data-art-source={shown.source.kind} data-scene-purpose={shown.purpose} data-neutral-time={shown.neutralTime} data-light={shown.light} data-art-palette={shown.palette} data-support={shown.support} data-layered={layered} data-contact-assembly={shown.contactMask ? 'fixed-source-included' : undefined}>
    <img key={`mother-${imageKey}`} src={imageSource(shown.mother)} alt="" hidden style={{ display: 'none' }} onLoad={event => {
      if (currentImageKey.current !== imageKey) return;
      if (event.currentTarget.naturalWidth !== shown.width || event.currentTarget.naturalHeight !== shown.height) setFailedMother(true);
      else { readyMothers.current.add(imageKey); setOpenedMother(imageKey); }
    }} onError={failMother} />
    {!shown.figure && shown.mask && <img key={`mask-${imageKey}`} src={imageSource(shown.mask)} alt="" hidden style={{ display: 'none' }}
      onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />}
    {shown.contactMask && <img key={`contact-mask-${imageKey}`} src={imageSource(shown.contactMask)} alt="" hidden style={{ display: 'none' }}
      onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />}
    {['luminance', 'alpha', 'source'].includes(shown.shadowMode ?? '') && shown.shadow && <img key={`shadow-${imageKey}`} src={imageSource(shown.shadow)} alt="" hidden style={{ display: 'none' }}
      onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />}
    {floorCast && <>
      <img key={`floor-mask-${imageKey}`} src={imageSource(floorCast.mask)} alt="" hidden style={{ display: 'none' }} onError={failLayer}
        onLoad={event => { if (verifyLayer(event.currentTarget)) setOpenedFloorMask(`${imageKey}:${floorCast.mask}`); }} />
      <img key={`floor-figure-${imageKey}`} src={imageSource(floorFigure)} alt="" hidden style={{ display: 'none' }} onError={failLayer}
        onLoad={event => { if (verifyLayer(event.currentTarget)) setOpenedFloorFigure(`${imageKey}:${floorFigure}`); }} />
    </>}
    {sameRoom && (!failedMother || showEmptyRoom) && <div className="scene-canvas" style={{ width: shown.width, height: shown.height,
      transform: `translate(${stageX}px, ${stageY}px) scale(${scale})` }}>
      {layered || showEmptyRoom || !showFigure && shown.renderMode === 'complete-scene' ? <>
        <img key={`background-${imageKey}`} className="scene-layer" src={imageSource(shown.background)} alt="" draggable={false}
          onLoad={event => { if (verifyLayer(event.currentTarget)) setOpenedBackground(imageKey); }} onError={failLayer} />
        {showFigure && motherReady && !failedMother && fixedSourceShadow && shown.shadow && <svg className="scene-layer scene-source-shadow" viewBox={`0 0 ${shown.width} ${shown.height}`} aria-hidden="true">
          <defs>
            <mask id={`${svgId}-shadow-figure`} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} style={{ maskType: shown.figure ? 'alpha' : shown.maskMode ?? 'alpha' }}>
              <image href={imageSource(shown.figure ?? shown.mask)} width={shown.width} height={shown.height} preserveAspectRatio="none" onError={failLayer} />
            </mask>
            {!!shown.sourceShadowFeather && <filter id={`${svgId}-shadow-feather`} filterUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={shown.sourceShadowFeather} />
            </filter>}
            {shown.sourceShadowPolygon && <clipPath id={`${svgId}-shadow-boundary`} clipPathUnits="userSpaceOnUse">
              <polygon points={sourceShadowPoints} />
            </clipPath>}
            <mask id={`${svgId}-source-shadow`} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} style={{ maskType: 'luminance' }}>
              <image href={imageSource(shown.shadow)} width={shown.width} height={shown.height} preserveAspectRatio="none" onError={failLayer} />
              {shown.sourceShadowPolygon && <g clipPath={shown.sourceShadowFeather ? `url(#${svgId}-shadow-boundary)` : undefined}>
                <polygon points={sourceShadowPoints} fill="white" filter={shown.sourceShadowFeather ? `url(#${svgId}-shadow-feather)` : undefined} />
              </g>}
              <rect width={shown.width} height={shown.height} fill="black" mask={`url(#${svgId}-shadow-figure)`} />
            </mask>
          </defs>
          <image href={imageSource(shown.mother)} width={shown.width} height={shown.height} preserveAspectRatio="none"
            opacity={shown.shadowOpacity ?? 1} mask={`url(#${svgId}-source-shadow)`} onError={failLayer} />
        </svg>}
        {showFigure && subjectReady && <div className="scene-actor-layer" style={actorStyle}>
          {shown.shadow && shown.shadowMode !== 'source' && (shown.shadowMode === 'luminance' || shown.shadowMode === 'alpha' ? <svg className="scene-layer" viewBox={`0 0 ${shown.width} ${shown.height}`} aria-hidden="true">
            <defs><mask id={`${svgId}-contact-shadow`} maskUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} style={{ maskType: shown.shadowMode }}>
              <image href={imageSource(shown.shadow)} width={shown.width} height={shown.height} preserveAspectRatio="none" onError={failLayer} />
            </mask></defs>
            <rect width={shown.width} height={shown.height} fill={shown.shadowColor ?? '#291c16'} opacity={shown.shadowOpacity ?? .48} mask={`url(#${svgId}-contact-shadow)`} />
          </svg> : <img className="scene-layer" src={imageSource(shown.shadow)} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />)}
          {floorCast && floorReady && <svg className="scene-layer" viewBox={`0 0 ${shown.width} ${shown.height}`} aria-hidden="true">
            <defs>
              <clipPath id={`${svgId}-floor-clip`} clipPathUnits="userSpaceOnUse">
                <rect x={floorCast.clip[0]} y={floorCast.clip[1]} width={floorCast.clip[2]} height={floorCast.clip[3]} />
              </clipPath>
              {floorCast.receiver === 'soft-floor-v1' && <filter id={`${svgId}-floor-receiver`} colorInterpolationFilters="sRGB">
                <feComponentTransfer>
                  <feFuncR type="discrete" tableValues="0 0 0 0 0 1 1 1" />
                  <feFuncG type="discrete" tableValues="0 0 0 0 0 1 1 1" />
                  <feFuncB type="discrete" tableValues="0 0 0 0 0 1 1 1" />
                </feComponentTransfer>
                <feMorphology operator="dilate" radius="28" />
                <feGaussianBlur stdDeviation="4" />
              </filter>}
              <mask id={`${svgId}-floor-figure`} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} style={{ maskType: shown.mask ? shown.maskMode ?? 'alpha' : 'alpha' }}>
                <image href={imageSource(floorFigure)} width={shown.width} height={shown.height} preserveAspectRatio="none" onError={failLayer} />
              </mask>
              <mask id={`${svgId}-floor-cast`} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} style={{ maskType: 'luminance' }}>
                <image href={imageSource(floorCast.mask)} width={shown.width} height={shown.height} preserveAspectRatio="none" onError={failLayer}
                  filter={floorCast.receiver === 'soft-floor-v1' ? `url(#${svgId}-floor-receiver)` : undefined} clipPath={`url(#${svgId}-floor-clip)`} />
                <rect width={shown.width} height={shown.height} fill="black" mask={`url(#${svgId}-floor-figure)`} />
              </mask>
            </defs>
            <image href={imageSource(shown.mother)} width={shown.width} height={shown.height} preserveAspectRatio="none" mask={`url(#${svgId}-floor-cast)`} onError={failLayer} />
          </svg>}
          {shown.contactMask ? <svg className="scene-layer" viewBox={`0 0 ${shown.width} ${shown.height}`} aria-hidden="true">
            <defs>
              <filter id={`${svgId}-included-max`} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} colorInterpolationFilters="sRGB">
                <feImage href={imageSource(shown.mask)} x="0" y="0" width={shown.width} height={shown.height} preserveAspectRatio="none" result="F" onError={failLayer} />
                <feColorMatrix in="F" type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0" result="F_luminance" />
                <feImage href={imageSource(shown.contactMask)} x="0" y="0" width={shown.width} height={shown.height} preserveAspectRatio="none" result="S" onError={failLayer} />
                <feColorMatrix in="S" type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0" result="S_luminance" />
                <feBlend in="F_luminance" in2="S_luminance" mode="lighten" />
              </filter>
              <mask id={`${svgId}-included-coverage`} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width={shown.width} height={shown.height} style={{ maskType: 'luminance' }}>
                <rect width={shown.width} height={shown.height} fill="black" />
                <rect width={shown.width} height={shown.height} fill="white" filter={`url(#${svgId}-included-max)`} />
              </mask>
            </defs>
            <image href={imageSource(shown.mother)} x="0" y="0" width={shown.width} height={shown.height} preserveAspectRatio="none" mask={`url(#${svgId}-included-coverage)`} onError={failLayer} />
          </svg> : shown.figure ? <img className="scene-layer" src={imageSource(shown.figure)} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} /> : <svg className="scene-layer" viewBox={`0 0 ${shown.width} ${shown.height}`} aria-hidden="true">
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
        </div>}
        {(canMove || moving || pendingTransfer) && <div key="interaction" className="scene-interaction-layer" style={actorStyle}>
          <div ref={handle} className="scene-character-grab" role={canSlide ? 'slider' : 'button'} tabIndex={0}
            aria-label={`${name}在${seatName}的位置`} aria-orientation={canSlide ? 'horizontal' : undefined} aria-valuemin={canSlide ? Math.round(bounds[0] * 100) : undefined} aria-valuemax={canSlide ? Math.round(bounds[1] * 100) : undefined}
            aria-valuenow={canSlide ? Math.round(value * 100) : undefined} aria-valuetext={canSlide ? Math.abs(value) < .05 ? '原来的位置' : value < 0 ? '座位左侧' : '座位右侧' : undefined}
            aria-haspopup={canTransfer ? 'menu' : undefined} aria-expanded={canTransfer ? targetsOpen : undefined} aria-busy={openingTransfer || undefined}
            style={{ inset: 0, clipPath: `polygon(${shown.hitPolygon})` }}
            onPointerDown={begin} onPointerMove={move} onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) finish(false); }} onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }} onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }}
            onClick={event => { if (!canSlide && (event.detail === 0 || pointerDistance.current < 8)) openTransferMenu(); }}
            onDoubleClick={() => { if (canSlide) { keyboardOrigin.current = undefined; settle(0); } }} onKeyDown={keyDown}
            onBlur={() => { acceptKeyboard(); finish(true); }} />
          <div className="scene-focus-ring" aria-hidden="true" style={{
            left: `${shown.bodyBounds[0] * 100}%`, top: `${shown.bodyBounds[1] * 100}%`,
            width: `${(shown.bodyBounds[2] - shown.bodyBounds[0]) * 100}%`, height: `${(shown.bodyBounds[3] - shown.bodyBounds[1]) * 100}%`,
          }} />
        </div>}
        {shown.foreground && <img className="scene-layer scene-foreground" src={imageSource(shown.foreground)} alt="" draggable={false} onLoad={event => verifyLayer(event.currentTarget)} onError={failLayer} />}
        <RoomHotspots family={shown.sceneFamily} actor={actorSourceRect} enabled={openedBackground === imageKey && !failedLayer && !moving && !pendingTransfer && !targetsOpen}
          onStartFocus={onStartFocus} deskActionLabel={deskActionLabel} onRest={onRest} focusActive={focusActive} onHotspotsAvailableChange={onHotspotsAvailableChange} />
      </> : showFigure && motherReady && !shown.contactMask ? <>
        <img className="scene-layer" src={imageSource(shown.mother)} alt="" draggable={false} onError={failMother} />
        {shown.renderMode === 'complete-scene' && <RoomHotspots family={shown.sceneFamily} actor={actorSourceRect}
          enabled={!failedMother && !moving && !pendingTransfer && !targetsOpen} onStartFocus={onStartFocus}
          deskActionLabel={deskActionLabel} onRest={onRest} focusActive={focusActive} onHotspotsAvailableChange={onHotspotsAvailableChange} />}
      </> : null}
      {!moving && !pendingTransfer && !targetsOpen && (openedBackground === imageKey || motherReady) && !failedLayer && !failedMother
        && <RoomPerches family={shown.sceneFamily} actor={actorSourceRect} pose={actorVisible ? shown.id : undefined} actorStyle={actorStyle} />}
    </div>}
    {targetsOpen && canTransfer && <div ref={furnitureMenu} className="scene-furniture-menu" role="menu" aria-label="坐在哪里"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setTargetsOpen(false); }}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...targetButtons.current.values()];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      }}>
      {transferTargets.map(target => <button key={target.sceneId} ref={element => { if (element) targetButtons.current.set(target.sceneId, element); else targetButtons.current.delete(target.sceneId); }}
        type="button" role="menuitem" onClick={() => previewTransfer(target)}>{target.label}</button>)}
    </div>}
    {transferError && !failedMother && !failedLayer && <p className="scene-position-problem" role="alert">{transferError}</p>}
    {(failedMother || failedLayer) && !pendingTransfer && <div className="scene-position-problem" role="alert"><span>窗边的画面没能完整打开，原来的选择还在。</span><button type="button" className="text-button" onClick={retryImages}>再打开一次</button></div>}
    {saveError && !failedMother && !failedLayer && <p className="scene-position-problem" role="alert">刚才的位置没能留下，先回到原处了。再试一次吧。</p>}
  </div>;
}
