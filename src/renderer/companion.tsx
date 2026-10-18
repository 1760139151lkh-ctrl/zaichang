import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Portal } from './ui';
import morning from './assets/companion/morning.png';
import dusk from './assets/companion/dusk.png';
import night from './assets/companion/night.png';
import mio from './assets/companion/mio.png';
import haruka from './assets/companion/haruka.png';
import saku from './assets/companion/saku.png';
import sakiko from './assets/companion/sakiko.png';
import mutsumi from './assets/companion/mutsumi.png';
import nagi from './assets/companion/nagi.png';
import './companion.css';

export const COMPANIONS = [
  { id: 'sakiko', name: '祥子', category: '二次元', image: sakiko, avatar: { left: '-42%', top: '-4%', width: '200%' } },
  { id: 'mutsumi', name: '睦', category: '二次元', image: mutsumi, avatar: { left: '-48%', top: '-3%', width: '200%' } },
  { id: 'mio', name: '澪', category: '插画', image: mio, avatar: { left: '-39%', top: '-2%', width: '205%' } },
  { id: 'haruka', name: '遥', category: '插画', image: haruka, avatar: { left: '-49%', top: '-11%', width: '200%' } },
  { id: 'saku', name: '朔', category: '插画', image: saku, avatar: { left: '-67%', top: '-2%', width: '210%' } },
  { id: 'nagi', name: '凪', category: '写实', image: nagi, avatar: { left: '-46%', top: '-5%', width: '210%' } },
] as const;
export const WINDOW_LIGHT = { morning, dusk, night };
type CharacterId = (typeof COMPANIONS)[number]['id'] | 'light' | `custom:${string}`;
export interface CompanionPreference {
  character: CharacterId;
  presence: 'window' | 'corner' | 'hidden';
  light: 'morning' | 'dusk';
  reducedMotion: boolean;
  scale: number;
  position: number;
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
  character: 'mio', presence: 'window', light: 'morning', reducedMotion: false, scale: 1, position: 50,
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
    commit({ ...current, character: id, scale: 1, position: 50, pictures: [...current.pictures, { id, image: dataUrl, name: name.trim().slice(0, 60) || '我的形象' }] });
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

export function CompanionScene({ preview = false, quiet = false, immersive = false, placement }: { preview?: boolean; quiet?: boolean; immersive?: boolean; placement?: { scale: number; position: number } }) {
  const { value } = useCompanion();
  const image = selectedPicture(value);
  const showFigure = !!image && (preview || immersive || value.presence === 'window') && value.presence !== 'hidden';
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return <div className={`companion-scene ${preview ? 'is-preview' : ''} ${quiet ? 'is-quiet' : ''} ${immersive ? 'is-immersive' : ''} ${value.character.startsWith('custom:') ? 'has-custom-art' : ''}`} data-light={value.light} aria-hidden="true">
    <div className="window-room room-day" style={{ backgroundImage: `url(${value.light === 'dusk' ? dusk : morning})` }} />
    <div className="window-room room-night" style={{ backgroundImage: `url(${night})` }} />
    <div className="window-wash" />
    {showFigure && !failed && <div className="companion-figure" style={{ '--figure-scale': placement?.scale ?? value.scale, '--figure-position': `${placement?.position ?? value.position}%` } as CSSProperties}>
      <img key={image} src={image} alt="" onError={() => setFailed(true)} draggable={false} />
    </div>}
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
