import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Portal } from './ui';
import morning from './assets/companion/morning.png';
import dusk from './assets/companion/dusk.png';
import night from './assets/companion/night.png';
import readingMorning from './assets/companion/reading-morning.png';
import readingDusk from './assets/companion/reading-dusk.png';
import readingNight from './assets/companion/reading-night.png';
import mio from './assets/companion/mio.png';
import haruka from './assets/companion/haruka.png';
import saku from './assets/companion/saku.png';
import sakiko from './assets/companion/sakiko.png';
import mutsumi from './assets/companion/mutsumi.png';
// The selected portraits remain in the local visual checkpoint until binary upload succeeds.
import anon from '../../assets/brand/mark.svg';
import tomori from '../../assets/brand/mark.svg';
import nagi from './assets/companion/nagi.png';
import './companion.css';

// Portrait framing only affects thumbnails. The room always fits the complete
// image inside its available space, including at the largest chosen scale.
export const COMPANIONS = [
  { id: 'sakiko', name: '祥子', category: '二次元', image: sakiko, frame: { height: '100%', top: '0%', anchor: '52%', portrait: '180%', portraitTop: '0%' }, avatar: { left: '-62%', top: '-3%', width: '220%' } },
  { id: 'mutsumi', name: '睦', category: '二次元', image: mutsumi, frame: { height: '100%', top: '0%', anchor: '51%', portrait: '180%', portraitTop: '0%' }, avatar: { left: '-60%', top: '-3%', width: '220%' } },
  { id: 'anon', name: '爱音', category: '二次元', image: anon, frame: { height: '100%', top: '0%', anchor: '50%', portrait: '180%', portraitTop: '0%' }, avatar: { left: '-60%', top: '-5%', width: '220%' } },
  { id: 'tomori', name: '灯', category: '二次元', image: tomori, frame: { height: '100%', top: '0%', anchor: '50%', portrait: '180%', portraitTop: '0%' }, avatar: { left: '-60%', top: '-3%', width: '220%' } },
  { id: 'mio', name: '澪', category: '插画', image: mio, frame: { height: '100%', top: '0%', anchor: '42%', portrait: '180%', portraitTop: '1%' }, avatar: { left: '-39%', top: '-2%', width: '205%' } },
  { id: 'haruka', name: '遥', category: '插画', image: haruka, frame: { height: '100%', top: '0%', anchor: '61%', portrait: '175%', portraitTop: '-7%' }, avatar: { left: '-49%', top: '-11%', width: '200%' } },
  { id: 'saku', name: '朔', category: '插画', image: saku, frame: { height: '100%', top: '0%', anchor: '54%', portrait: '205%', portraitTop: '1%' }, avatar: { left: '-67%', top: '-2%', width: '210%' } },
  { id: 'nagi', name: '凪', category: '写实', image: nagi, frame: { height: '130%', top: '3%', anchor: '54%', portrait: '220%', portraitTop: '1%' }, avatar: { left: '-46%', top: '-5%', width: '210%' } },
] as const;
export const WINDOW_LIGHT = { morning, dusk, night };
type CharacterId = (typeof COMPANIONS)[number]['id'] | 'light' | `custom:${string}`;
export interface CompanionPlacement { scale: number; position: number; verticalPosition: number }
export interface CompanionPreference {
  character: CharacterId;
  presence: 'window' | 'corner' | 'hidden';
  light: 'morning' | 'dusk';
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
}
const preferenceKey = 'zaichang.companion.v1';
const imageKey = 'zaichang.companion.image.v1';
const imageNameKey = 'zaichang.companion.image-name.v1';
const collectionKey = 'zaichang.companion.v2';
const pictureLimit = 8;
const imageBudget = 3_000_000;
const validImage = (image: unknown): image is string => typeof image === 'string' && image.length <= imageBudget && /^data:image\/(?:png|jpeg|webp);base64,/.test(image);
const defaults: CompanionPreference = {
  character: 'mio', presence: 'window', light: 'morning', reducedMotion: false, scale: 1, position: 50, verticalPosition: 100,
};
const emptyState = (): CompanionState => ({ ...defaults, pictures: [], favorites: [], names: {} });
const knownCharacter = (id: unknown): id is CharacterId => typeof id === 'string' && (id === 'light' || COMPANIONS.some(item => item.id === id) || /^custom:[a-zA-Z0-9-]{1,80}$/.test(id));
function preference(value: any): CompanionPreference {
  return {
    character: knownCharacter(value?.character) ? value.character : defaults.character,
    presence: ['window', 'corner', 'hidden'].includes(value?.presence) ? value.presence : defaults.presence,
    light: value?.light === 'dusk' ? 'dusk' : 'morning',
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
      const result: CompanionState = { ...preference(stored), pictures: [], favorites: [], names: {} };
      for (const item of Array.isArray(stored.pictures) ? stored.pictures.slice(0, pictureLimit) : []) {
        const image = item.legacy ? localStorage.getItem(imageKey) : item.image;
        if (knownCharacter(item.id) && item.id.startsWith('custom:') && validImage(image) && !result.pictures.some(picture => picture.id === item.id))
          result.pictures.push({ id: item.id as `custom:${string}`, image, name: typeof item.name === 'string' ? item.name.slice(0, 60) : '我的形象', ...(item.legacy ? { legacy: true } : {}) });
      }
      const exists = (id: CharacterId) => !id.startsWith('custom:') || result.pictures.some(item => item.id === id);
      if (!exists(result.character)) result.character = 'light';
      result.favorites = Array.from(new Set<CharacterId>((Array.isArray(stored.favorites) ? stored.favorites : []).filter((id: unknown): id is CharacterId => knownCharacter(id) && exists(id))));
      if (stored.names && typeof stored.names === 'object') for (const [id, name] of Object.entries(stored.names)) {
        if (knownCharacter(id) && typeof name === 'string' && name.trim()) result.names[id] = name.trim().slice(0, 60);
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

const CompanionContext = createContext<{
  value: CompanionState;
  update: (patch: Partial<CompanionPreference>) => void;
  setPicture: (dataUrl: string, name: string) => void;
  removePicture: (id: CharacterId) => void;
  rename: (id: CharacterId, name: string) => void;
  toggleFavorite: (id: CharacterId) => void;
  reset: () => void;
} | null>(null);

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
  const update = useCallback((patch: Partial<CompanionPreference>) => {
    const current = readCompanion();
    const next = { ...current, ...preference({ ...current, ...patch }) };
    if (next.character.startsWith('custom:') && !next.pictures.some(item => item.id === next.character)) throw new Error('这张图片已经不在收藏里了，选另一张吧。');
    commit(next);
  }, [commit]);
  const setPicture = useCallback((dataUrl: string, name: string) => {
    if (!validImage(dataUrl)) throw new Error('这张图片太大了，换一张小一点的试试。');
    const current = readCompanion();
    if (current.pictures.length >= pictureLimit) throw new Error('这里已经放了 8 张自选图片。先移走一张，再把新的带进来吧。');
    if (current.pictures.reduce((total, item) => total + item.image.length, 0) + dataUrl.length > imageBudget)
      throw new Error('这些图片快放满了。可以换一张小些的，或先移走一张不常用的。');
    const id = `custom:${crypto.randomUUID()}` as const;
    commit({ ...current, character: id, scale: 1, position: 50, verticalPosition: 100, pictures: [...current.pictures, { id, image: dataUrl, name: name.trim().slice(0, 60) || '我的形象' }] });
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
  const context = useMemo(() => ({ value, update, setPicture, removePicture, rename, toggleFavorite, reset }), [value, update, setPicture, removePicture, rename, toggleFavorite, reset]);
  return <CompanionContext.Provider value={context}>{children}</CompanionContext.Provider>;
}
export function useCompanion() {
  const context = useContext(CompanionContext);
  if (!context) throw new Error('CompanionProvider is required');
  return context;
}
function selectedPicture(value: CompanionState) {
  return value.character.startsWith('custom:') ? value.pictures.find(item => item.id === value.character)?.image : COMPANIONS.find(item => item.id === value.character)?.image;
}
export function companionName(value: CompanionState, id: CharacterId = value.character) {
  return value.names[id] || (id === 'light' ? '只留一束光' : COMPANIONS.find(item => item.id === id)?.name || value.pictures.find(item => item.id === id)?.name || '我的形象');
}
export function CompanionAvatar({ className = '', size = 34 }: { className?: string; size?: number }) {
  const { value } = useCompanion();
  const character = COMPANIONS.find(item => item.id === value.character);
  const image = value.presence === 'hidden' ? undefined : selectedPicture(value);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return <span className={`companion-avatar ${className} ${image && !failed ? '' : 'is-light'}`} style={{ width: size, height: size }} aria-hidden="true">
    {image && !failed ? <img src={image} alt="" style={value.character.startsWith('custom:') ? undefined : character?.avatar} onError={() => setFailed(true)} /> : <Portal size={Math.round(size * .64)} />}
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

function CompanionFigure({ image, name, placement, interaction, onError }: {
  image: string; name: string; placement: CompanionPlacement; interaction?: PlacementInteraction; onError: () => void;
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
    if (!interaction || event.button !== 0 || !event.isPrimary || !area.width || !area.height) return;
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
    if (!interaction) return;
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

export function CompanionScene({ preview = false, quiet = false, immersive = false, placement, interaction }: { preview?: boolean; quiet?: boolean; immersive?: boolean; placement?: CompanionPlacement; interaction?: PlacementInteraction }) {
  const { value } = useCompanion();
  const image = selectedPicture(value);
  const showFigure = !!image && (immersive || value.presence === 'window') && value.presence !== 'hidden' && (!quiet || preview);
  const readingRoom = quiet && !preview && !value.character.startsWith('custom:');
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  const editable = preview && showFigure ? interaction : undefined;
  return <div className={`companion-scene ${preview ? 'is-preview' : ''} ${quiet || (preview && value.presence !== 'window') ? 'is-quiet' : ''} ${immersive ? 'is-immersive' : ''} ${value.character.startsWith('custom:') ? 'has-custom-art' : ''}`} data-light={value.light} aria-hidden={editable ? undefined : true}>
    <div className="window-room room-day" style={{ backgroundImage: `url(${value.light === 'dusk'
      ? readingRoom ? readingDusk : dusk : readingRoom ? readingMorning : morning})` }} />
    <div className="window-room room-night" style={{ backgroundImage: `url(${readingRoom ? readingNight : night})` }} />
    <div className="window-wash" />
    {preview && value.presence === 'corner' && <CompanionAvatar className="companion-preview-corner" size={40} />}
    {showFigure && !failed && <CompanionFigure key={value.character} image={image} name={companionName(value)} placement={placement ?? value} interaction={editable} onError={() => setFailed(true)} />}
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
    <CompanionScene immersive />
    <div className="rest-brand"><Portal size={28} /><span>在场</span></div>
    <button type="button" className="icon-button rest-close" aria-label="回到聊天" onClick={onClose}><X size={19} /></button>
    <div className="rest-return"><h1>先坐一会儿。</h1><button type="button" onClick={onClose}><ArrowLeft size={17} />回到聊天</button></div>
  </dialog>;
}
