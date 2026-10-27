import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Portal } from './ui';
import morning from '../../前端视觉创新设计/运行素材/companion/morning.png';
import dusk from '../../前端视觉创新设计/运行素材/companion/dusk.png';
import night from '../../前端视觉创新设计/运行素材/companion/night.png';
import { companionEnvironmentStamp, companionMoment, type CompanionMoment } from './companion-variants';
import { companionActivities } from '../shared/companion-activity';
import { companionPortrait } from './companion-portraits';
import { CompanionRoomStage, CompanionSceneStage, companionActiveSceneFamily, companionAmbientArtwork, companionSceneArtwork, companionNeutralPresenceArtwork, companionScenePosition, companionPaletteLight, companionRegisteredSceneArtwork, companionSceneTransferTargets, type CompanionAmbientFit, type CompanionRoomActions, type SceneCharacter, type SceneLight, type SceneTransferChoice, type NeutralSceneTime } from './companion-scenes';
import { APPEARANCE_PALETTES, readEffectiveEnvironment, useEffectiveEnvironment, type AppearancePalette, type EnvironmentVariant, type EffectiveEnvironment } from './appearance';
import './companion.css';
import './companion-input-yield.css';

export type { CompanionMoment } from './companion-variants';
export { companionRoomFrame } from './companion-scenes';
export type { CompanionRoomLayout, CompanionRoomRect, CompanionRoomActions, CompanionAmbientFit } from './companion-scenes';

// Each identity has its own drawn portrait. It makes the character selectable
// without claiming any room, activity or light asset is ready.
const characterSlots = [
  { id: 'sakiko', name: '祥子', fullName: '丰川祥子', category: 'Ave Mujica' },
  { id: 'mutsumi', name: '睦', fullName: '若叶睦', category: 'Ave Mujica' },
  { id: 'uika', name: '初华', fullName: '三角初华', category: 'Ave Mujica' },
  { id: 'umiri', name: '海铃', fullName: '八幡海铃', category: 'Ave Mujica' },
  { id: 'nyamu', name: '若麦', fullName: '祐天寺若麦', category: 'Ave Mujica' },
  { id: 'tomori', name: '灯', fullName: '高松灯', category: 'MyGO!!!!!' },
  { id: 'anon', name: '爱音', fullName: '千早爱音', category: 'MyGO!!!!!' },
  { id: 'rana', name: '乐奈', fullName: '要乐奈', category: 'MyGO!!!!!' },
  { id: 'soyo', name: '素世', fullName: '长崎素世', category: 'MyGO!!!!!' },
  { id: 'taki', name: '立希', fullName: '椎名立希', category: 'MyGO!!!!!' },
] as const;
export const COMPANIONS = characterSlots.map(character => ({
  ...character, image: companionPortrait(character.id)?.image || '',
  frame: { portrait: '122%', portraitTop: '0%', anchor: '50%' },
  avatar: companionPortrait(character.id)?.avatar || { left: '-30%', top: '-16%', width: '160%' },
})).filter(character => character.image);
export const WINDOW_LIGHT = { morning, dusk, night };
type CharacterId = SceneCharacter | 'light' | `custom:${string}`;
export interface CompanionPlacement { scale: number; position: number; verticalPosition: number }
export interface CompanionPreference {
  character: CharacterId;
  presence: 'window' | 'corner' | 'hidden';
  light: 'morning' | 'dusk' | 'night';
  reducedMotion: boolean;
  scale: number;
  position: number;
  verticalPosition: number;
}
export interface CompanionPicture { id: `custom:${string}`; name: string; image: string; legacy?: boolean }
interface CompanionState extends CompanionPreference {
  pictures: CompanionPicture[];
  favorites: CharacterId[];
  names: Record<string, string>;
  scenePositions: Record<string, number>;
  sceneChoices: Record<string, string>;
  retiredFavorites: string[];
}
export interface SceneChoiceExpected { currentChoice?: string; sceneId: string; position: number; environmentStamp?: string }
interface CompanionExpected { preference: CompanionPreference; positions: Record<string, number>; choices?: Record<string, string> }
const preferenceKey = 'zaichang.companion.v1';
const imageKey = 'zaichang.companion.image.v1';
const imageNameKey = 'zaichang.companion.image-name.v1';
const collectionKey = 'zaichang.companion.v2';
const pictureLimit = 8;
const imageBudget = 3_000_000;
const validImage = (image: unknown): image is string => typeof image === 'string' && image.length <= imageBudget && /^data:image\/(?:png|jpeg|webp);base64,/.test(image);
const defaults: CompanionPreference = {
  character: 'sakiko', presence: 'window', light: 'morning', reducedMotion: false, scale: 1, position: 50, verticalPosition: 100,
};
const emptyState = (): CompanionState => ({ ...defaults, pictures: [], favorites: [], names: {}, scenePositions: {}, sceneChoices: {}, retiredFavorites: [] });
const retiredCharacters = ['mio', 'haruka', 'saku', 'nagi'];
const scenePositionKey = /^(?:[a-z0-9][a-z0-9-]{0,63}:)?[a-z0-9-]{1,100}$/;
const sceneChoiceLimit = 720;
const knownCharacter = (id: unknown): id is CharacterId => typeof id === 'string' && (id === 'light' || characterSlots.some(item => item.id === id) || /^custom:[a-zA-Z0-9-]{1,80}$/.test(id));
export function companionSceneChoiceKey(character: string, moment: CompanionMoment, palette: AppearancePalette) {
  return `${companionActiveSceneFamily() ?? 'unavailable'}:${character}-${moment === 'night' ? 'chat' : moment}-${palette}`;
}
function choiceScope(key: string) {
  const parts = /^(?:([a-z0-9][a-z0-9-]{0,63}):)?([a-z]+)-([a-z]+)-([a-z]+)$/.exec(key);
  if (!parts || !characterSlots.some(item => item.id === parts[2])
    || !companionActivities.includes(parts[3] as typeof companionActivities[number])
    || !APPEARANCE_PALETTES.some(item => item.id === parts[4])) return undefined;
  return { sceneFamily: parts[1], character: parts[2] as SceneCharacter, moment: parts[3] as Exclude<CompanionMoment, 'night'>, palette: parts[4] as AppearancePalette };
}
function sceneEnvironmentContext(environment: EffectiveEnvironment) {
  const variant = environment.mode === 'auto' ? environment.requestedVariant : undefined;
  const neutralTime: NeutralSceneTime | undefined = variant === 'unknown' ? environment.isDay ? 'day' : 'night' : undefined;
  return { variant, neutralTime, stamp: `${companionEnvironmentStamp(environment, companionActiveSceneFamily())}:${neutralTime ?? 'weather-or-manual'}` };
}
function registeredChoice(key: string, sceneId: unknown, variant?: EnvironmentVariant, light?: SceneLight, neutralTime?: NeutralSceneTime) {
  const scope = choiceScope(key);
  return scope && companionActiveSceneFamily() && scope.sceneFamily === companionActiveSceneFamily() && typeof sceneId === 'string' && /^[a-z0-9-]{1,100}$/.test(sceneId)
    ? companionRegisteredSceneArtwork(sceneId, scope.character, light ?? companionPaletteLight(scope.palette), scope.palette, variant, neutralTime) : undefined;
}
// Presence can keep a reviewed neutral chat pose while its finer activity is
// unavailable. Exact cell/coverage lookups remain exact, and the source keeps
// its own support, geometry and environment rather than inheriting the request.
// Automatic appearance may retain an independently reviewed time-only room
// when its exact weather cell is missing. The source keeps its canonical
// light/camera; explicit manual theme queries and coverage stay exact.
export function companionPresenceArtwork(character: string, moment: CompanionMoment, light: SceneLight, palette: AppearancePalette, variant?: EnvironmentVariant, neutralTime?: NeutralSceneTime) {
  if (variant === 'unknown') return neutralTime === undefined ? undefined : companionNeutralPresenceArtwork(character, neutralTime);
  return companionSceneArtwork(character, moment, light, palette, variant)
    ?? (moment === 'reading' ? companionSceneArtwork(character, 'resume', light, palette, variant) : undefined)
    ?? (moment !== 'chat' && moment !== 'night' ? companionSceneArtwork(character, 'chat', light, palette, variant) : undefined)
    ?? (variant !== undefined ? companionNeutralPresenceArtwork(character, light === 'night' ? 'night' : 'day') : undefined);
}
function checkedSceneChoice(value: CompanionState, key: string, choice: SceneTransferChoice, expected?: SceneChoiceExpected) {
  const scope = choiceScope(key);
  const environment = readEffectiveEnvironment();
  const { variant, neutralTime, stamp } = sceneEnvironmentContext(environment);
  if (expected?.environmentStamp !== undefined && expected.environmentStamp !== stamp)
    throw new Error('房间的光线刚变过，原来的位置还在。');
  const target = registeredChoice(key, choice.sceneId, variant, environment.light, neutralTime);
  if (!scope || value.character !== scope.character || !target || !Number.isFinite(choice.position)
    || target.positionKey !== choice.positionKey || target.activity !== choice.moment)
    throw new Error('这个坐姿现在还不能采用，原来的位置还在。');
  const selected = value.sceneChoices[key];
  const original = registeredChoice(key, selected, variant, environment.light, neutralTime)
    ?? companionPresenceArtwork(scope.character, scope.moment, environment.light, scope.palette, variant, neutralTime);
  const source = original && companionRegisteredSceneArtwork(original.id, scope.character, environment.light, scope.palette, variant, neutralTime);
  const sourcePosition = source ? companionScenePosition(source, value.scenePositions) : 0;
  if (!source || expected && (selected !== expected.currentChoice || source.id !== expected.sceneId || sourcePosition !== expected.position))
    throw new Error('这里的坐姿刚在另一处改过。原来的选择还在，看看现在的样子再决定。');
  const targets = companionSceneTransferTargets(scope.character, source, environment.light, scope.palette, value.scenePositions, scope.moment, variant, neutralTime);
  if (!targets.some((item: SceneTransferChoice) => item.sceneId === choice.sceneId && item.moment === choice.moment && item.positionKey === choice.positionKey))
    throw new Error('这个地方现在还不能坐，原来的位置还在。');
  return { ...choice, position: companionScenePosition(target, { [target.positionKey]: choice.position }) };
}
function preference(value: any): CompanionPreference {
  return {
    character: knownCharacter(value?.character) ? value.character : defaults.character,
    presence: ['window', 'corner', 'hidden'].includes(value?.presence) ? value.presence : defaults.presence,
    light: value?.light === 'night' ? 'night' : value?.light === 'dusk' ? 'dusk' : 'morning',
    reducedMotion: value?.reducedMotion === true,
    scale: typeof value?.scale === 'number' && Number.isFinite(value.scale) ? Math.min(1.3, Math.max(.75, value.scale)) : 1,
    position: typeof value?.position === 'number' && Number.isFinite(value.position) ? Math.min(100, Math.max(0, value.position)) : 50,
    verticalPosition: typeof value?.verticalPosition === 'number' && Number.isFinite(value.verticalPosition) ? Math.min(100, Math.max(0, value.verticalPosition)) : 100,
  };
}
function readCompanion(): CompanionState {
  try {
    const raw = localStorage.getItem(collectionKey);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored.version !== 2) return emptyState();
      const result: CompanionState = { ...preference(stored), pictures: [], favorites: [], names: {}, scenePositions: {}, sceneChoices: {}, retiredFavorites: [] };
      for (const item of Array.isArray(stored.pictures) ? stored.pictures.slice(0, pictureLimit) : []) {
        const image = item.legacy ? localStorage.getItem(imageKey) : item.image;
        if (knownCharacter(item.id) && item.id.startsWith('custom:') && validImage(image) && !result.pictures.some(picture => picture.id === item.id))
          result.pictures.push({ id: item.id as `custom:${string}`, image, name: typeof item.name === 'string' ? item.name.slice(0, 60) : '我的形象', ...(item.legacy ? { legacy: true } : {}) });
      }
      const exists = (id: CharacterId) => !id.startsWith('custom:') || result.pictures.some(item => item.id === id);
      if (!exists(result.character)) result.character = 'light';
      result.favorites = Array.from(new Set<CharacterId>((Array.isArray(stored.favorites) ? stored.favorites : []).filter((id: unknown): id is CharacterId => knownCharacter(id) && exists(id))));
      if (stored.names && typeof stored.names === 'object') for (const [id, name] of Object.entries(stored.names)) {
        if ((knownCharacter(id) || retiredCharacters.includes(id)) && typeof name === 'string' && name.trim()) result.names[id] = name.trim().slice(0, 60);
      }
      result.retiredFavorites = [...new Set([...(Array.isArray(stored.retiredFavorites) ? stored.retiredFavorites : []), ...(Array.isArray(stored.favorites) ? stored.favorites : [])].filter((id: unknown): id is string => typeof id === 'string' && retiredCharacters.includes(id)))];
      if (stored.scenePositions && typeof stored.scenePositions === 'object') for (const [id, position] of Object.entries(stored.scenePositions).slice(0, 1280)) {
        if (scenePositionKey.test(id) && typeof position === 'number' && Number.isFinite(position)) result.scenePositions[id] = Math.max(-1, Math.min(1, position));
      }
      if (stored.sceneChoices && typeof stored.sceneChoices === 'object') for (const [key, sceneId] of Object.entries(stored.sceneChoices)) {
        if (Object.keys(result.sceneChoices).length >= sceneChoiceLimit) break;
        // Preserve historical choices as data, without resolving them into
        // another room's active artwork or silently rewriting the preference.
        if (choiceScope(key) && typeof sceneId === 'string' && /^[a-z0-9-]{1,100}$/.test(sceneId)) result.sceneChoices[key] = sceneId;
      }
      return result;
    }
    let old: any = {};
    try { old = JSON.parse(localStorage.getItem(preferenceKey) || '{}'); } catch { /* preserve the separate image even if preferences were interrupted */ }
    const result = { ...emptyState(), ...preference(old) };
    const image = localStorage.getItem(imageKey);
    if (validImage(image)) {
      result.pictures = [{ id: 'custom:legacy', image, name: localStorage.getItem(imageNameKey)?.slice(0, 60) || '我的形象', legacy: true }];
      if (old.character === 'custom') result.character = 'custom:legacy';
    } else if (old.character === 'custom') result.character = 'light';
    return result;
  } catch { return emptyState(); }
}
export function initializeCompanion() {
  document.documentElement.dataset.motion = readCompanion().reducedMotion ? 'reduced' : 'full';
}
export function prefersQuietMotion() {
  return document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let CompanionContext = createContext<{
  value: CompanionState;
  update: (patch: Partial<CompanionPreference>, positions?: Record<string, number>, expected?: CompanionExpected, choicesPatch?: Record<string, string>) => void;
  setPicture: (dataUrl: string, name: string, select?: boolean) => `custom:${string}`;
  removePicture: (id: CharacterId) => void;
  rename: (id: CharacterId, name: string) => void;
  toggleFavorite: (id: CharacterId) => void;
  setScenePosition: (sceneId: string, position: number, expectedPosition?: number) => void;
  setSceneChoice: (scope: string, choice: SceneTransferChoice, expected?: SceneChoiceExpected) => void;
  reset: () => void;
} | null>(null);
// A room-art edit also refreshes this module. Keep the context identity so a
// mounted provider and consumers refreshed in separate boundaries stay paired.
if (import.meta.hot) {
  CompanionContext = import.meta.hot.data.companionContext ?? CompanionContext;
  import.meta.hot.data.companionContext = CompanionContext;
}

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState(readCompanion);
  const commit = useCallback((next: CompanionState) => {
    // One atomic write owns selection, names and collection. Legacy bytes remain in
    // their original key, so migration never needs a second copy of a large image.
    const stored = { ...next, version: 2, pictures: next.pictures.map(item => item.legacy ? { id: item.id, name: item.name, legacy: true } : item) };
    localStorage.setItem(collectionKey, JSON.stringify(stored));
    document.documentElement.dataset.motion = next.reducedMotion ? 'reduced' : 'full';
    setValue(next);
  }, []);
  const update = useCallback((patch: Partial<CompanionPreference>, positions?: Record<string, number>, expected?: CompanionExpected, choicesPatch?: Record<string, string>) => {
    const current = readCompanion();
    if (expected && ((Object.keys(expected.preference) as (keyof CompanionPreference)[]).some(key => current[key] !== expected.preference[key])
      || [...new Set([...Object.keys(current.scenePositions), ...Object.keys(expected.positions)])].some(key => current.scenePositions[key] !== expected.positions[key])
      || expected.choices && [...new Set([...Object.keys(current.sceneChoices), ...Object.keys(expected.choices)])].some(key => current.sceneChoices[key] !== expected.choices![key]))) {
      setValue(current);
      document.documentElement.dataset.motion = current.reducedMotion ? 'reduced' : 'full';
      throw new Error('这里的选择刚在另一处改过。试看的样子还在，看看新选择后再决定。');
    }
    const scenePositions = { ...current.scenePositions };
    if (positions) for (const [key, position] of Object.entries(positions)) {
      if (companionActiveSceneFamily() && key.startsWith(`${companionActiveSceneFamily()}:`) && scenePositionKey.test(key) && Number.isFinite(position)) scenePositions[key] = Math.max(-1, Math.min(1, position));
    }
    const sceneChoices = { ...current.sceneChoices };
    const environment = readEffectiveEnvironment(), context = sceneEnvironmentContext(environment);
    if (choicesPatch) for (const [key, sceneId] of Object.entries(choicesPatch)) {
      const selected = registeredChoice(key, sceneId);
      const neutral = registeredChoice(key, sceneId, context.variant, environment.light, context.neutralTime);
      if (!selected && (!neutral || neutral.purpose !== 'neutral-presence' || choiceScope(key)?.palette !== environment.palette))
        throw new Error('有一个坐姿现在还不能采用，试看的样子还在。');
      sceneChoices[key] = sceneId;
    }
    if (Object.keys(sceneChoices).length > sceneChoiceLimit) throw new Error('这些坐姿选择暂时还不能一起留下，原来的选择还在。');
    const next = { ...current, ...preference({ ...current, ...patch }), scenePositions, sceneChoices };
    if (next.character.startsWith('custom:') && !next.pictures.some(item => item.id === next.character)) throw new Error('这张图片已经不在收藏里了，选另一张吧。');
    commit(next);
  }, [commit]);
  const setPicture = useCallback((dataUrl: string, name: string, select = true) => {
    if (!validImage(dataUrl)) throw new Error('这张图片太大了，换一张小一点的试试。');
    const current = readCompanion();
    if (current.pictures.length >= pictureLimit) throw new Error('这里已经放了 8 张自选图片。先移走一张，再把新的带进来吧。');
    if (current.pictures.reduce((total, item) => total + item.image.length, 0) + dataUrl.length > imageBudget)
      throw new Error('这些图片快放满了。可以换一张小些的，或先移走一张不常用的。');
    const id = `custom:${crypto.randomUUID()}` as const;
    commit({ ...current, ...(select ? { character: id, scale: 1, position: 50, verticalPosition: 100 } : {}), pictures: [...current.pictures, { id, image: dataUrl, name: name.trim().slice(0, 60) || '我的形象' }] });
    return id;
  }, [commit]);
  const removePicture = useCallback((id: CharacterId) => {
    const current = readCompanion();
    const removed = current.pictures.find(item => item.id === id);
    if (!removed) return;
    const names = { ...current.names }; delete names[id];
    commit({ ...current, character: current.character === id ? 'light' : current.character, pictures: current.pictures.filter(item => item.id !== id), favorites: current.favorites.filter(item => item !== id), names });
    if (removed.legacy) { try { localStorage.removeItem(imageKey); localStorage.removeItem(imageNameKey); } catch { /* v2 no longer references these bytes */ } }
  }, [commit]);
  const rename = useCallback((id: CharacterId, name: string) => {
    const current = readCompanion();
    const names = { ...current.names };
    if (name.trim()) names[id] = name.trim().slice(0, 60); else delete names[id];
    commit({ ...current, names });
  }, [commit]);
  const toggleFavorite = useCallback((id: CharacterId) => {
    const current = readCompanion();
    commit({ ...current, favorites: current.favorites.includes(id) ? current.favorites.filter(item => item !== id) : [...current.favorites, id] });
  }, [commit]);
  const setScenePosition = useCallback((sceneId: string, position: number, expectedPosition?: number) => {
    if (!companionActiveSceneFamily() || !sceneId.startsWith(`${companionActiveSceneFamily()}:`) || !scenePositionKey.test(sceneId) || !Number.isFinite(position)) return;
    const current = readCompanion();
    if (expectedPosition !== undefined && (current.scenePositions[sceneId] ?? 0) !== expectedPosition) {
      setValue(current);
      throw new Error('这里的位置刚在另一处挪过。看看现在的样子，再决定坐在哪里吧。');
    }
    commit({ ...current, scenePositions: { ...current.scenePositions, [sceneId]: Math.max(-1, Math.min(1, position)) } });
  }, [commit]);
  const setSceneChoice = useCallback((scope: string, choice: SceneTransferChoice, expected?: SceneChoiceExpected) => {
    const current = readCompanion();
    const parsed = choiceScope(scope);
    const environment = readEffectiveEnvironment();
    if (!parsed || environment.palette !== parsed.palette || current.presence !== 'window'
      || expected?.environmentStamp !== undefined && expected.environmentStamp !== sceneEnvironmentContext(environment).stamp)
      throw new Error('这里的样子刚换过。原来的选择还在，看看现在的房间再决定。');
    const selected = checkedSceneChoice(current, scope, choice, expected);
    const sceneChoices = { ...current.sceneChoices, [scope]: selected.sceneId };
    if (Object.keys(sceneChoices).length > 360) throw new Error('这些坐姿选择暂时还不能一起留下，原来的选择还在。');
    commit({ ...current, sceneChoices,
      scenePositions: { ...current.scenePositions, [selected.positionKey]: selected.position } });
  }, [commit]);
  const reset = useCallback(() => {
    // Keep an empty v2 record: even if old-key cleanup fails, legacy images cannot
    // be rediscovered after the user clears their data.
    commit(emptyState());
    let cleanupFailed = false;
    for (const key of [imageKey, imageNameKey, preferenceKey]) { try { localStorage.removeItem(key); } catch { cleanupFailed = true; } }
    if (cleanupFailed) throw new Error('旧图片还没能完全移走，请再试一次。');
  }, [commit]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === null || [collectionKey, preferenceKey, imageKey, imageNameKey].includes(event.key)) { setValue(readCompanion()); initializeCompanion(); }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const context = useMemo(() => ({ value, update, setPicture, removePicture, rename, toggleFavorite, setScenePosition, setSceneChoice, reset }), [value, update, setPicture, removePicture, rename, toggleFavorite, setScenePosition, setSceneChoice, reset]);
  return <CompanionContext.Provider value={context}>{children}</CompanionContext.Provider>;
}
export function useCompanion() {
  const context = useContext(CompanionContext);
  if (!context) throw new Error('CompanionProvider is required');
  return context;
}
/** A setting can try a room and move its character without changing the saved
 * room. The real provider remains the single owner of local preferences. */
export function CompanionPreviewProvider({ preference: preview, positions, choices, onPositionChange, onSceneChoiceChange, children }: {
  preference: CompanionPreference; positions: Record<string, number>; choices: Record<string, string>;
  onPositionChange: (key: string, position: number) => void;
  onSceneChoiceChange: (scope: string, choice: SceneTransferChoice) => void; children: ReactNode;
}) {
  const current = useCompanion();
  const value = { ...current.value, ...preview, scenePositions: positions, sceneChoices: choices };
  return <CompanionContext.Provider value={{ ...current, value, setScenePosition: onPositionChange,
    setSceneChoice: (scope, choice, expected) => onSceneChoiceChange(scope, checkedSceneChoice(value, scope, choice, expected)) }}>{children}</CompanionContext.Provider>;
}
function selectedPicture(value: CompanionState, moment: CompanionMoment = 'chat', palette: AppearancePalette = 'apricot') {
  return value.character.startsWith('custom:') ? value.pictures.find(item => item.id === value.character)?.image
    : companionSceneArtwork(value.character, moment, companionPaletteLight(palette), palette)?.mother;
}
export function companionName(value: CompanionState, id: CharacterId = value.character) {
  return value.names[id] || (id === 'light' ? '只留一束光' : characterSlots.find(item => item.id === id)?.name || value.pictures.find(item => item.id === id)?.name || '我的形象');
}
/** A legacy display-label fallback, never an identity migration or biography. */
export function companionAuthorArtwork(authorName?: string) {
  return COMPANIONS.find(character => character.fullName === authorName)?.id;
}
export function CompanionAvatar({ className = '', size = 34, characterId }: { className?: string; size?: number; characterId?: string }) {
  const { value } = useCompanion();
  const shownCharacter = characterId ?? value.character;
  const character = COMPANIONS.find(item => item.id === shownCharacter), custom = shownCharacter.startsWith('custom:');
  // The portrait identifies this character. It does not claim a matching
  // room, activity or light asset exists for the current stage.
  const image = value.presence === 'hidden' ? undefined
    : custom ? value.pictures.find(item => item.id === shownCharacter)?.image : character?.image;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return <span className={`companion-avatar ${className} ${image && !failed ? '' : 'is-light'}`} style={{ width: size, height: size }} aria-hidden="true">
    {image && !failed ? <img src={image} alt="" style={custom ? undefined : character?.avatar} onError={() => setFailed(true)} /> : <Portal size={Math.round(size * .64)} />}
  </span>;
}

interface PlacementInteraction {
  onChange: (placement: CompanionPlacement) => void;
  onCommit: (placement: CompanionPlacement) => void;
}
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
function fittedFigure(area: { width: number; height: number }, ratio: number, placement: CompanionPlacement) {
  // Reserve the full 1.3x range up front. Moving or enlarging a figure cannot
  // move its head out of the window or push it over the conversation.
  const height = Math.min(area.height, area.width / ratio) * placement.scale / 1.3;
  const width = height * ratio;
  return { width, height, left: (area.width - width) * placement.position / 100, top: (area.height - height) * placement.verticalPosition / 100 };
}

function CompanionFigure({ image, name, placement, interaction, yieldToInput = false, onError }: {
  image: string; name: string; placement: CompanionPlacement; interaction?: PlacementInteraction; yieldToInput?: boolean; onError: () => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const instructions = useId();
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [ratio, setRatio] = useState(2 / 3);
  const [manipulating, setManipulating] = useState(false);
  const latest = useRef({ placement, interaction });
  latest.current = { placement, interaction };
  const draft = useRef(placement);
  draft.current = placement;
  const keyboardOrigin = useRef<CompanionPlacement | undefined>(undefined);
  const gesture = useRef<{
    pointerId: number; target: HTMLElement; mode: 'move' | 'resize'; x: number; y: number;
    placement: CompanionPlacement; area: typeof area; figure: ReturnType<typeof fittedFigure>;
  } | undefined>(undefined);
  function change(next: CompanionPlacement) {
    draft.current = next;
    latest.current.interaction?.onChange(next);
  }
  function finish(cancel: boolean) {
    const current = gesture.current;
    if (!current) return;
    gesture.current = undefined;
    setManipulating(false);
    if (current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    if (cancel) change(current.placement);
    else latest.current.interaction?.onCommit(draft.current);
  }
  useLayoutEffect(() => {
    if (!yieldToInput) return;
    finish(true);
    if (keyboardOrigin.current) {
      const origin = keyboardOrigin.current;
      keyboardOrigin.current = undefined; change(origin);
    }
  }, [yieldToInput]);
  useEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (gesture.current && (Math.abs(width - gesture.current.area.width) > 1 || Math.abs(height - gesture.current.area.height) > 1)) finish(true);
      setArea({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || !gesture.current) return;
      event.preventDefault(); event.stopPropagation(); finish(true);
    }
    const blur = () => finish(true);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', blur); };
  }, []);
  useEffect(() => { keyboardOrigin.current = undefined; }, [image]);
  const figure = fittedFigure(area, ratio, placement);
  function begin(event: PointerEvent<HTMLElement>, mode: 'move' | 'resize') {
    if (yieldToInput || !interaction || event.button !== 0 || !event.isPrimary || !area.width || !area.height) return;
    event.preventDefault(); event.stopPropagation();
    keyboardOrigin.current = undefined;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, target: event.currentTarget, mode, x: event.clientX, y: event.clientY, placement: { ...placement }, area, figure };
    draft.current = placement;
    setManipulating(true);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (current.mode === 'move') {
      const travelX = current.area.width - current.figure.width;
      const travelY = current.area.height - current.figure.height;
      change({ ...current.placement,
        position: travelX > 1 ? clamp(current.placement.position + dx / travelX * 100, 0, 100) : current.placement.position,
        verticalPosition: travelY > 1 ? clamp(current.placement.verticalPosition + dy / travelY * 100, 0, 100) : current.placement.verticalPosition,
      });
    } else {
      const projected = (dx * current.figure.width + dy * current.figure.height) / (current.figure.width ** 2 + current.figure.height ** 2);
      const scale = clamp(current.placement.scale * (1 + projected), .75, 1.3);
      const resized = fittedFigure(current.area, ratio, { ...current.placement, scale });
      // Resize from the grabbed corner; preserve the opposite corner until a
      // window boundary requires it to move inward.
      change({ scale,
        position: current.area.width - resized.width > 1 ? clamp(current.figure.left / (current.area.width - resized.width) * 100, 0, 100) : current.placement.position,
        verticalPosition: current.area.height - resized.height > 1 ? clamp(current.figure.top / (current.area.height - resized.height) * 100, 0, 100) : current.placement.verticalPosition,
      });
    }
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (yieldToInput || !interaction) return;
    if (event.key === 'Escape' && keyboardOrigin.current) {
      event.preventDefault(); event.stopPropagation();
      const original = keyboardOrigin.current;
      keyboardOrigin.current = undefined;
      change(original); interaction.onCommit(original);
      return;
    }
    if (event.key === 'Enter' && keyboardOrigin.current) {
      event.preventDefault(); keyboardOrigin.current = undefined;
      interaction.onCommit(draft.current);
      return;
    }
    const direction = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key);
    const sizeKey = ['+', '-', '='].includes(event.key);
    if (!direction && !sizeKey) return;
    const resize = (event.target as HTMLElement).closest('.companion-resize-handle') || sizeKey;
    event.preventDefault(); event.stopPropagation();
    keyboardOrigin.current ??= { ...draft.current };
    const next = { ...draft.current };
    if (resize) {
      const smaller = ['-', 'ArrowLeft', 'ArrowDown'].includes(event.key);
      next.scale = clamp(next.scale + (smaller ? -1 : 1) * (event.shiftKey ? .005 : .025), .75, 1.3);
    } else {
      const step = event.shiftKey ? 1 : 5;
      if (event.key === 'ArrowLeft') next.position = clamp(next.position - step, 0, 100);
      if (event.key === 'ArrowRight') next.position = clamp(next.position + step, 0, 100);
      if (event.key === 'ArrowUp') next.verticalPosition = clamp(next.verticalPosition - step, 0, 100);
      if (event.key === 'ArrowDown') next.verticalPosition = clamp(next.verticalPosition + step, 0, 100);
    }
    change(next);
  }
  return <div ref={areaRef} className="companion-placement-area">
    <div className={`companion-figure ${interaction ? 'is-editable' : ''} ${manipulating ? 'is-manipulating' : ''}`}
      style={{ width: figure.width, height: figure.height, left: figure.left, top: figure.top, visibility: area.width ? 'visible' : 'hidden' } as CSSProperties}
      tabIndex={interaction ? 0 : undefined} role={interaction ? 'group' : undefined}
      aria-label={interaction ? `移动${name}` : undefined} aria-describedby={interaction ? instructions : undefined}
      onPointerDown={event => begin(event, 'move')} onPointerMove={move}
      onPointerUp={event => { if (event.pointerId === gesture.current?.pointerId) finish(false); }}
      onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
      onKeyDown={keyDown} onKeyUp={event => {
        if (keyboardOrigin.current && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key)) interaction?.onCommit(draft.current);
      }} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && keyboardOrigin.current) {
          keyboardOrigin.current = undefined; interaction?.onCommit(draft.current);
        }
      }}>
      <img key={image} src={image} alt="" onError={onError} onLoad={event => setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} draggable={false} />
      {interaction && <>
        <button type="button" className="companion-resize-handle" role="slider" aria-label={`${name}的大小`} aria-valuemin={75} aria-valuemax={130} aria-valuenow={Math.round(placement.scale * 100)} aria-valuetext={`${Math.round(placement.scale * 100)}%`} aria-describedby={instructions}
          onPointerDown={event => begin(event, 'resize')}><span /></button>
        <span id={instructions} className="sr-only">拖动人物来移动，拖动右下角来缩放。方向键移动，Shift 加方向键微调，加减键缩放，Escape 还原，回车完成。</span>
      </>}
    </div>
  </div>;
}

export function CompanionScene({ preview = false, quiet = false, yieldToInput = false, representation = 'auto', ambientFit = 'room', immersive = false, moment, placement, interaction, paletteOverride,
  onRoomLayout, onStartFocus, deskActionLabel, onRest, focusActive = false }: { preview?: boolean; quiet?: boolean; yieldToInput?: boolean; representation?: 'auto' | 'scene' | 'portrait'; ambientFit?: CompanionAmbientFit; immersive?: boolean; moment?: CompanionMoment; placement?: CompanionPlacement; interaction?: PlacementInteraction; paletteOverride?: AppearancePalette } & CompanionRoomActions) {
  const { value, setScenePosition, setSceneChoice } = useCompanion();
  const sceneElement = useRef<HTMLDivElement>(null);
  const [hotspotsAvailable, setHotspotsAvailable] = useState(false);
  const environment = useEffectiveEnvironment();
  const palette = paletteOverride ?? environment.palette;
  const light = paletteOverride ? companionPaletteLight(palette) : environment.light;
  const manualEnvironment = paletteOverride !== undefined || environment.mode === 'manual';
  const context = sceneEnvironmentContext(environment);
  const variant = manualEnvironment ? undefined : context.variant;
  const neutralTime = manualEnvironment ? undefined : context.neutralTime;
  const environmentStamp = context.stamp;
  const semanticMoment = moment ?? (immersive ? 'rest' : companionMoment({ reading: quiet && !preview, night: light === 'night' }));
  const semanticActivity = semanticMoment === 'night' ? 'chat' : semanticMoment;
  const scope = companionSceneChoiceKey(value.character, semanticMoment, palette);
  const chosenArtwork = registeredChoice(scope, value.sceneChoices[scope], variant, light, neutralTime);
  const resolvedArtwork = chosenArtwork ?? companionPresenceArtwork(value.character, semanticMoment, light, palette, variant, neutralTime);
  const artwork = resolvedArtwork?.source.kind === 'registered' ? resolvedArtwork : undefined;
  const ambient = companionAmbientArtwork({ mode: manualEnvironment ? 'manual' : 'auto', palette,
    requestedVariant: environment.requestedVariant, isDay: manualEnvironment ? light !== 'night' : environment.isDay });
  const sceneMoment = artwork?.activity ?? semanticMoment;
  const presenceFallback = artwork?.purpose === 'neutral-presence' ? 'time-neutral'
    : !chosenArtwork && semanticActivity === 'reading' && artwork?.activity === 'resume' ? 'reading-with-resume-pose'
    : !chosenArtwork && artwork?.activity === 'chat' && semanticActivity !== 'chat' ? 'neutral-chat' : undefined;
  const image = value.character.startsWith('custom:') ? selectedPicture(value, semanticMoment, palette) : artwork?.mother;
  const transferTargets = artwork ? companionSceneTransferTargets(value.character, artwork, light, palette, value.scenePositions, semanticActivity, variant, neutralTime) : [];
  // Reading is a temporary representation, never a rewrite of the person's
  // saved presence preference. The existing titlebar portrait stays callable.
  // A layout with room for the complete reviewed side pose can opt into scene.
  const bodyPresentation = representation === 'scene' || representation === 'auto' && (!quiet || preview || immersive);
  // Cropping is decorative only. A full-body presentation always retains the
  // original room camera, including custom figures and their saved placement.
  const roomAmbientFit = bodyPresentation ? 'room' : ambientFit;
  const showFigure = !!image && value.presence === 'window' && bodyPresentation;
  const [failed, setFailed] = useState(false);
  const inputHasYielded = useRef(false);
  if (yieldToInput) inputHasYielded.current = true;
  useEffect(() => setFailed(false), [image]);
  const editable = preview && showFigure ? interaction : undefined;
  // The portrait representation opens an admitted empty plate directly. It
  // never falls back to a mother that still contains the full person.
  const scene = !!artwork && bodyPresentation;
  const hasRoom = scene || !!ambient;
  const roomInteractive = roomAmbientFit === 'room' && !preview && !immersive && !value.character.startsWith('custom:');
  useEffect(() => { if (!hasRoom) onRoomLayout?.(null); }, [hasRoom, onRoomLayout]);
  useEffect(() => {
    if (!hasRoom || roomAmbientFit === 'cover' || preview || immersive) return;
    const main = sceneElement.current?.closest<HTMLElement>('.app-main');
    if (!main) return;
    // Blank room areas remain clickable. Wheel input within the real paper
    // column still belongs to the existing scroll owner, without a hit layer.
    const wheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || !event.deltaY) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest('.message-scroll,.workspace.welcome,canvas,[role="slider"],.materials-panel,.reading-divider,.interactive-program,.conversation-map')) return;
      if (!target.closest('.scene-object-hotspot') && target.closest('button,a,input,textarea,select,summary,[contenteditable="true"]')) return;
      const scroll = main.querySelector<HTMLElement>('.conversation-space:not([hidden]) .workspace.conversation > .message-scroll')
        ?? main.querySelector<HTMLElement>('.conversation-space:not([hidden]) .workspace.welcome');
      const paper = scroll?.querySelector<HTMLElement>(scroll.classList.contains('welcome') ? '.welcome-inner' : ':scope > .messages');
      if (!scroll || !paper || scroll.scrollHeight <= scroll.clientHeight) return;
      const bounds = scroll.getBoundingClientRect(), column = paper.getBoundingClientRect();
      if (event.clientX < column.left || event.clientX > column.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
      const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(scroll).lineHeight) || 16 : event.deltaMode === 2 ? scroll.clientHeight : 1;
      const before = scroll.scrollTop;
      scroll.scrollTop = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, before + event.deltaY * unit));
      if (scroll.scrollTop !== before) event.preventDefault();
    };
    main.addEventListener('wheel', wheel, { passive: false });
    return () => main.removeEventListener('wheel', wheel);
  }, [hasRoom, roomAmbientFit, preview, immersive]);
  const paperSide = roomAmbientFit === 'cover' ? undefined
    : artwork && (artwork.bodyBounds[0] + artwork.bodyBounds[2]) / 2 < .5 ? 'right' : 'left';
  return <div ref={sceneElement} className={`companion-scene ${preview ? 'is-preview' : ''} ${quiet || (preview && value.presence !== 'window') ? 'is-quiet' : ''} ${yieldToInput ? 'is-yielding-to-input' : ''} ${inputHasYielded.current ? 'has-yielded-to-input' : ''} ${immersive ? 'is-immersive' : ''} ${value.character.startsWith('custom:') ? 'has-custom-art' : ''} ${hasRoom ? 'has-scene-art' : ''}`} data-scene-family={companionActiveSceneFamily()} data-ambient-fit={roomAmbientFit} data-paper-side={paperSide} data-light={light} data-moment={sceneMoment} data-requested-moment={semanticMoment} data-presence-representation={value.presence === 'hidden' ? 'hidden' : value.presence === 'corner' ? 'corner' : bodyPresentation ? 'scene' : 'reading-portrait'} data-presence-fallback={presenceFallback} data-scene-purpose={artwork?.purpose} data-neutral-time={artwork?.neutralTime} data-environment-variant={variant} data-environment-state={scene ? artwork?.purpose === 'neutral-presence' ? 'time-only-presence' : 'matched' : ambient ? 'ambient-only' : 'unavailable'} aria-hidden={roomAmbientFit === 'cover' ? true : scene && showFigure || editable || hotspotsAvailable ? undefined : true}>
    {scene ? <>
      <CompanionSceneStage artwork={artwork} name={companionName(value)} position={companionScenePosition(artwork, value.scenePositions)}
        onCommit={position => setScenePosition(artwork.positionKey, position, value.scenePositions[artwork.positionKey] ?? 0)} transferTargets={transferTargets} transferScope={`${scope}:${environmentStamp}`}
        onTransferCommit={(choice: SceneTransferChoice, origin: Pick<SceneChoiceExpected, 'sceneId' | 'position'>) => setSceneChoice(scope, choice, { ...origin, currentChoice: value.sceneChoices[scope], environmentStamp })}
        showFigure={showFigure} interactive={showFigure} quiet={quiet && !preview} yieldToInput={yieldToInput} reducedMotion={value.reducedMotion} previewOnly={preview}
        onRoomLayout={onRoomLayout} onStartFocus={roomInteractive ? onStartFocus : undefined} deskActionLabel={deskActionLabel} onRest={roomInteractive ? onRest : undefined} focusActive={focusActive} onHotspotsAvailableChange={setHotspotsAvailable} />
    </> : <>
      {ambient ? <CompanionRoomStage artwork={ambient} ambientFit={roomAmbientFit} reducedMotion={value.reducedMotion} onRoomLayout={onRoomLayout}
        onStartFocus={roomInteractive ? onStartFocus : undefined} deskActionLabel={deskActionLabel} onRest={roomInteractive ? onRest : undefined} focusActive={focusActive} onHotspotsAvailableChange={setHotspotsAvailable} />
        : <div className="scene-environment-neutral" />}
      {showFigure && value.character.startsWith('custom:') && !failed && <CompanionFigure key={value.character} image={image!} name={companionName(value)} placement={placement ?? value} interaction={editable} yieldToInput={yieldToInput} onError={() => setFailed(true)} />}
    </>}
    {preview && value.presence === 'corner' && <CompanionAvatar className="companion-preview-corner" size={40} />}
    {immersive && value.presence === 'corner' && <CompanionAvatar className="companion-rest-corner" size={40} />}
  </div>;
}

export function RestSpace({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { ref.current?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="rest-space" aria-label="先坐一会儿" onCancel={event => { event.preventDefault(); onClose(); }}>
    <CompanionScene immersive moment="rest" />
    <div className="rest-brand"><Portal size={28} /><span>在场</span></div>
    <button type="button" className="icon-button rest-close" aria-label="回到刚才" onClick={onClose}><X size={19} /></button>
    <div className="rest-return"><h1>先坐一会儿。</h1><button type="button" onClick={onClose}><ArrowLeft size={17} />回到刚才</button></div>
  </dialog>;
}
