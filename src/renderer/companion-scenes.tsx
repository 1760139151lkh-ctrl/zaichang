import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { CompanionMoment } from './companion-variants';
import type { AppearancePalette } from './appearance';

export type SceneCharacter = 'sakiko' | 'mutsumi' | 'anon' | 'tomori';
export type SceneLight = 'morning' | 'dusk' | 'night';
interface SceneCalibration {
  seat: readonly [number, number];
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
const defaultCalibration: SceneCalibration = {
  seat: [.86, .63],
  hitPolygon: '81% 12%, 89% 14%, 94% 27%, 98% 43%, 99% 61%, 94% 66%, 85% 66%, 80% 83%, 78% 97%, 72% 99%, 65% 97%, 69% 91%, 72% 74%, 67% 85%, 65% 92%, 59% 95%, 57% 92%, 60% 88%, 65% 82%, 70% 66%, 74% 53%, 72% 44%, 74% 32%, 75% 21%, 77% 15%',
  travel: .045, slope: .12, perspective: .018,
};
const calibrations: Record<string, SceneCalibration> = {
  'sakiko-chat': defaultCalibration,
};
// The corrected master was redrawn on the clean reading-room plate.
const backgroundSources: Record<string, string> = { 'sakiko-chat': 'sakiko-reading' };
const sceneSources: Record<string, { light: SceneLight; palette: AppearancePalette; room: string; mask: string }> = {
  'sakiko-chat-mist': { light: 'morning', palette: 'mist', room: 'room-morning-mist', mask: 'sakiko-chat' },
  'sakiko-chat-violet': { light: 'dusk', palette: 'violet', room: 'room-dusk-violet', mask: 'sakiko-chat' },
};
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function companionSceneArtwork(character: string, moment: CompanionMoment = 'chat', light: SceneLight = 'morning', palette: AppearancePalette = 'apricot'): CompanionSceneArtwork | undefined {
  const activity = moment === 'night' ? 'chat' : moment;
  const candidates = [...new Set([
    `${character}-${activity}-${light}-${palette}`, `${character}-${activity}-${light}`,
    ...(light === 'night' ? [`${character}-night-${palette}`, `${character}-night`] : []),
    ...(light === 'dusk' ? [`${character}-${activity}-violet`, `${character}-chat-dusk-${palette}`, `${character}-chat-violet`] : []),
    `${character}-${activity}-${palette}`, `${character}-${activity}`,
    `${character}-chat-${light}-${palette}`, `${character}-chat-${light}`, `${character}-chat`,
  ])];
  const id = candidates.find(stem => file(stem, 'mother') && (!sceneSources[stem] || sceneSources[stem].light === light));
  if (!id) return undefined;
  const source = sceneSources[id];
  const sceneLight: SceneLight = source?.light || (/-night(?:-|$)/.test(id) ? 'night' : /-dusk(?:-|$)/.test(id) ? 'dusk' : 'morning');
  const artworkPalette: AppearancePalette = source?.palette || (id.includes(`-${palette}`) ? palette : sceneLight === 'night' ? 'rain' : 'apricot');
  const room = sceneLight === 'night' ? 'sakiko-night'
    : activity === 'reading' ? 'sakiko-reading' : 'sakiko-chat';
  return {
    id, light: sceneLight, palette: artworkPalette, positionKey: `${character}-${activity}`, width: 1536, height: 1024,
    ...defaultCalibration, ...calibrations[id],
    mother: file(id, 'mother'), background: file(backgroundSources[id] || id, 'background') || (source ? file(source.room, 'background') : undefined) || file(`room-${sceneLight}-${artworkPalette}`, 'background') || file(`room-${sceneLight}`, 'background') || file(room, 'background'), mask: file(id, 'mask') || file(id, 'figure') || (source ? file(source.mask, 'mask') || file(source.mask, 'figure') : undefined),
    shadow: file(id, 'shadow'), foreground: file(id, 'foreground'),
  };
}

export function companionPaletteLight(palette: AppearancePalette): SceneLight {
  return palette === 'rain' ? 'night' : palette === 'violet' ? 'dusk' : 'morning';
}

export function companionSceneLights(character: string, moment: CompanionMoment = 'chat', palette: AppearancePalette = 'apricot') {
  return (['morning', 'dusk', 'night'] as const).filter(light => companionSceneArtwork(character, moment, light, palette)?.light === light);
}

export function companionScenePortrait(character: string) {
  return companionSceneArtwork(character)?.mother;
}

/** Position is a seat-surface parameter, not an arbitrary screen coordinate. */
export function CompanionSceneStage({ artwork, name, position, onCommit, showFigure = true, interactive = true }: {
  artwork: CompanionSceneArtwork;
  name: string;
  position: number;
  onCommit: (position: number) => void;
  showFigure?: boolean;
  interactive?: boolean;
}) {
  const svgId = useId().replace(/:/g, '');
  const viewport = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [value, setValue] = useState(clamp(position));
  const [moving, setMoving] = useState(false);
  const [failedLayer, setFailedLayer] = useState(false);
  const [failedMother, setFailedMother] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const current = useRef(value);
  const latest = useRef({ onCommit, position });
  latest.current = { onCommit, position };
  const gesture = useRef<{ pointerId: number; x: number; y: number; origin: number; scale: number; tangentX: number; tangentY: number } | undefined>(undefined);
  const keyboardOrigin = useRef<number | undefined>(undefined);
  const layered = !!artwork.background && !!artwork.mask && !failedLayer;
  const canMove = interactive && showFigure && layered;
  const scale = size.height / artwork.height;
  const apply = (next: number) => { current.current = clamp(next); setValue(current.current); };
  function commit(next: number) {
    try { latest.current.onCommit(next); setSaveError(false); }
    catch { apply(latest.current.position); setSaveError(true); }
  }
  function finish(cancel: boolean) {
    const active = gesture.current;
    if (!active) return;
    gesture.current = undefined;
    setMoving(false);
    if (cancel) apply(active.origin);
    else commit(current.current);
    if (handle.current?.hasPointerCapture(active.pointerId)) handle.current.releasePointerCapture(active.pointerId);
  }
  function cancelKeyboard() {
    if (keyboardOrigin.current === undefined) return;
    apply(latest.current.position); keyboardOrigin.current = undefined;
  }
  useEffect(() => {
    if (!canMove) { cancelKeyboard(); finish(true); }
  }, [canMove]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      finish(true);
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    finish(true); keyboardOrigin.current = undefined;
    setFailedLayer(false); setFailedMother(false); setSaveError(false); apply(position);
  }, [artwork.id]);
  useEffect(() => { if (!gesture.current) apply(position); }, [position]);
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); finish(true); }
    };
    const blur = () => { cancelKeyboard(); finish(true); };
    window.addEventListener('keydown', escape, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', blur); };
  }, []);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!canMove || gesture.current || event.button !== 0 || !event.isPrimary || !scale) return;
    event.preventDefault(); event.stopPropagation();
    keyboardOrigin.current = undefined;
    event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    const rect = viewport.current!.getBoundingClientRect(), u = current.current;
    const worldX = (event.clientX - rect.left - (size.width - artwork.width * scale)) / scale;
    const worldY = (event.clientY - rect.top) / scale;
    const originalX = (worldX - artwork.seat[0] * artwork.width - u * artwork.travel * artwork.width) / (1 + u * artwork.perspective);
    const originalY = (worldY - artwork.seat[1] * artwork.height - u * artwork.travel * artwork.width * artwork.slope) / (1 + u * artwork.perspective);
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: u, scale,
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
    apply(active.origin + delta);
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!canMove) return;
    if (event.key === 'Escape' && keyboardOrigin.current !== undefined) {
      event.preventDefault(); event.stopPropagation();
      apply(keyboardOrigin.current); commit(current.current); keyboardOrigin.current = undefined; return;
    }
    if (event.key === 'Enter') { event.preventDefault(); keyboardOrigin.current = undefined; commit(current.current); return; }
    const step = event.shiftKey ? .015 : .08;
    const next = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? current.current - step
      : ['ArrowRight', 'ArrowDown'].includes(event.key) ? current.current + step
        : event.key === 'Home' ? -1 : event.key === 'End' ? 1 : undefined;
    if (next === undefined) return;
    event.preventDefault(); keyboardOrigin.current ??= current.current; apply(next);
  }
  const focusPoints = artwork.hitPolygon.replace(/([\d.]+)% ([\d.]+)%/g, (_, x, y) => `${Number(x) / 100 * artwork.width},${Number(y) / 100 * artwork.height}`).replaceAll(', ', ' ');
  const dx = value * artwork.travel * artwork.width;
  const actorStyle: CSSProperties = {
    transformOrigin: `${artwork.seat[0] * 100}% ${artwork.seat[1] * 100}%`,
    transform: `translate(${dx}px, ${dx * artwork.slope}px) scale(${1 + value * artwork.perspective})`,
  };
  return <div ref={viewport} className={`scene-stage-viewport${moving ? ' is-moving' : ''}`} data-scene={artwork.id} data-light={artwork.light} data-art-palette={artwork.palette} data-layered={layered}>
    {!failedMother && <div className="scene-canvas" style={{ width: artwork.width, height: artwork.height,
      transform: `translate(${size.width - artwork.width * scale}px, 0px) scale(${scale})` }}>
      {layered ? <>
        <img className="scene-layer" src={artwork.background} alt="" draggable={false} onError={() => setFailedLayer(true)} />
        {showFigure && <div className="scene-actor-layer" style={actorStyle}>
          {artwork.shadow && <img className="scene-layer" src={artwork.shadow} alt="" draggable={false} />}
          <svg className="scene-layer" viewBox={`0 0 ${artwork.width} ${artwork.height}`} aria-hidden="true">
            <defs>
              <filter id={`${svgId}-alpha`} colorInterpolationFilters="sRGB">
                <feComponentTransfer><feFuncA type="table" tableValues="0 0 0 0 0 0 0 0 1 1 1" /></feComponentTransfer>
              </filter>
              <mask id={`${svgId}-figure`} maskUnits="userSpaceOnUse" x="0" y="0" width={artwork.width} height={artwork.height} style={{ maskType: 'alpha' }}>
                <image href={artwork.mask} width={artwork.width} height={artwork.height} preserveAspectRatio="none" filter={`url(#${svgId}-alpha)`} onError={() => setFailedLayer(true)} />
              </mask>
            </defs>
            <image href={artwork.mother} width={artwork.width} height={artwork.height} preserveAspectRatio="none" mask={`url(#${svgId}-figure)`} onError={() => setFailedLayer(true)} />
          </svg>
          {canMove && <div ref={handle} className="scene-character-grab" role="slider" tabIndex={0}
            aria-label={`${name}在窗边的位置`} aria-orientation="horizontal" aria-valuemin={-100} aria-valuemax={100}
            aria-valuenow={Math.round(value * 100)} aria-valuetext={Math.abs(value) < .05 ? '原来的位置' : value < 0 ? '靠窗内侧' : '靠窗外侧'}
            title="拖动，换个舒服的位置；双击回到原处"
            style={{ inset: 0, clipPath: `polygon(${artwork.hitPolygon})` }}
            onPointerDown={begin} onPointerMove={move} onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) finish(false); }} onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }} onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }}
            onDoubleClick={() => { apply(0); commit(0); }} onKeyDown={keyDown}
            onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) commit(current.current); }}
            onBlur={() => { cancelKeyboard(); finish(true); }} />}
          {canMove && <svg className="scene-focus-ring" viewBox={`0 0 ${artwork.width} ${artwork.height}`} aria-hidden="true"><polygon points={focusPoints} /></svg>}
        </div>}
        {artwork.foreground && <img className="scene-layer scene-foreground" src={artwork.foreground} alt="" draggable={false} />}
      </> : showFigure ? <img className="scene-layer" src={artwork.mother} alt="" draggable={false} onError={() => setFailedMother(true)} /> : null}
    </div>}
    {saveError && <p className="scene-position-problem" role="alert">刚才的位置没能留下，先回到原处了。再试一次吧。</p>}
  </div>;
}
