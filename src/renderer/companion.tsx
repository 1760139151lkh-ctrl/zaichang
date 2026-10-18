import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Portal } from './ui';
import morning from './assets/companion/morning.png';
import dusk from './assets/companion/dusk.png';
import night from './assets/companion/night.png';
import mio from './assets/companion/mio.png';
import haruka from './assets/companion/haruka.png';
import saku from './assets/companion/saku.png';
import './companion.css';

export const COMPANIONS = [
  { id: 'mio', name: '澪', image: mio, avatar: { left: '-39%', top: '-2%', width: '205%' } },
  { id: 'haruka', name: '遥', image: haruka, avatar: { left: '-49%', top: '-11%', width: '200%' } },
  { id: 'saku', name: '朔', image: saku, avatar: { left: '-67%', top: '-2%', width: '210%' } },
] as const;
export const WINDOW_LIGHT = { morning, dusk, night };

export interface CompanionPreference {
  character: (typeof COMPANIONS)[number]['id'] | 'light' | 'custom';
  presence: 'window' | 'corner' | 'hidden';
  light: 'morning' | 'dusk';
  reducedMotion: boolean;
  scale: number;
  position: number;
}
interface CompanionState extends CompanionPreference {
  customImage?: string;
  customName?: string;
}
const preferenceKey = 'zaichang.companion.v1';
const imageKey = 'zaichang.companion.image.v1';
const imageNameKey = 'zaichang.companion.image-name.v1';
const defaults: CompanionPreference = {
  character: 'mio', presence: 'window', light: 'morning', reducedMotion: false, scale: 1, position: 50,
};

function readPreference(): CompanionPreference {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
    return {
      character: ['mio', 'haruka', 'saku', 'light', 'custom'].includes(value.character) ? value.character : defaults.character,
      presence: ['window', 'corner', 'hidden'].includes(value.presence) ? value.presence : defaults.presence,
      light: value.light === 'dusk' ? 'dusk' : 'morning',
      reducedMotion: value.reducedMotion === true,
      scale: typeof value.scale === 'number' && Number.isFinite(value.scale) ? Math.min(1.3, Math.max(.75, value.scale)) : 1,
      position: typeof value.position === 'number' && Number.isFinite(value.position) ? Math.min(100, Math.max(0, value.position)) : 50,
    };
  } catch { return { ...defaults }; }
}
function readCompanion(): CompanionState {
  const preference = readPreference();
  try {
    const customImage = localStorage.getItem(imageKey) || undefined;
    const valid = customImage && customImage.length <= 3_000_000 && /^data:image\/(?:png|jpeg|webp);base64,/.test(customImage);
    return { ...preference, customImage: valid ? customImage : undefined, customName: localStorage.getItem(imageNameKey)?.slice(0, 120) || undefined };
  } catch { return preference; }
}
export function initializeCompanion() {
  document.documentElement.dataset.motion = readPreference().reducedMotion ? 'reduced' : 'full';
}
export function prefersQuietMotion() {
  return document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const CompanionContext = createContext<{
  value: CompanionState;
  update: (patch: Partial<CompanionPreference>) => void;
  setPicture: (dataUrl: string, name: string) => void;
  removePicture: () => void;
  reset: () => void;
} | null>(null);

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState(readCompanion);
  const update = useCallback((patch: Partial<CompanionPreference>) => {
    const next = { ...readPreference(), ...patch };
    localStorage.setItem(preferenceKey, JSON.stringify(next));
    document.documentElement.dataset.motion = next.reducedMotion ? 'reduced' : 'full';
    setValue(current => ({ ...current, ...next }));
  }, []);
  const setPicture = useCallback((dataUrl: string, name: string) => {
    if (dataUrl.length > 3_000_000 || !/^data:image\/(?:png|jpeg|webp);base64,/.test(dataUrl))
      throw new Error('这张图片太大了，换一张小一点的试试。');
    localStorage.setItem(imageKey, dataUrl);
    localStorage.setItem(imageNameKey, name.slice(0, 120));
    const next = { ...readPreference(), character: 'custom' as const, scale: 1, position: 50 };
    localStorage.setItem(preferenceKey, JSON.stringify(next));
    setValue({ ...next, customImage: dataUrl, customName: name });
  }, []);
  const removePicture = useCallback(() => {
    localStorage.removeItem(imageKey);
    localStorage.removeItem(imageNameKey);
    const next = readPreference();
    if (next.character === 'custom') next.character = 'light';
    localStorage.setItem(preferenceKey, JSON.stringify(next));
    setValue(next);
  }, []);
  const reset = useCallback(() => {
    localStorage.removeItem(imageKey);
    localStorage.removeItem(imageNameKey);
    localStorage.removeItem(preferenceKey);
    document.documentElement.dataset.motion = 'full';
    setValue({ ...defaults });
  }, []);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === null || [preferenceKey, imageKey, imageNameKey].includes(event.key)) {
        setValue(readCompanion());
        initializeCompanion();
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const context = useMemo(() => ({ value, update, setPicture, removePicture, reset }), [value, update, setPicture, removePicture, reset]);
  return <CompanionContext.Provider value={context}>{children}</CompanionContext.Provider>;
}

export function useCompanion() {
  const context = useContext(CompanionContext);
  if (!context) throw new Error('CompanionProvider is required');
  return context;
}
function selectedPicture(value: CompanionState) {
  return value.character === 'custom' ? value.customImage : COMPANIONS.find(item => item.id === value.character)?.image;
}

export function CompanionAvatar({ className = '', size = 34 }: { className?: string; size?: number }) {
  const { value } = useCompanion();
  const character = COMPANIONS.find(item => item.id === value.character);
  const image = value.presence === 'hidden' ? undefined : selectedPicture(value);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return <span className={`companion-avatar ${className} ${image && !failed ? '' : 'is-light'}`} style={{ width: size, height: size }} aria-hidden="true">
    {image && !failed ? <img src={image} alt="" style={value.character === 'custom' ? undefined : character?.avatar} onError={() => setFailed(true)} /> : <Portal size={Math.round(size * .64)} />}
  </span>;
}

export function CompanionScene({ preview = false, quiet = false, immersive = false }: { preview?: boolean; quiet?: boolean; immersive?: boolean }) {
  const { value } = useCompanion();
  const image = selectedPicture(value);
  const showFigure = !!image && (preview || immersive || value.presence === 'window') && value.presence !== 'hidden';
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return <div className={`companion-scene ${preview ? 'is-preview' : ''} ${quiet ? 'is-quiet' : ''} ${immersive ? 'is-immersive' : ''} ${value.character === 'custom' ? 'has-custom-art' : ''}`} data-light={value.light} aria-hidden="true">
    <div className="window-room room-day" style={{ backgroundImage: `url(${value.light === 'dusk' ? dusk : morning})` }} />
    <div className="window-room room-night" style={{ backgroundImage: `url(${night})` }} />
    <div className="window-wash" />
    {showFigure && !failed && <div className="companion-figure" style={{ '--figure-scale': value.scale, '--figure-position': `${value.position}%` } as CSSProperties}>
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
