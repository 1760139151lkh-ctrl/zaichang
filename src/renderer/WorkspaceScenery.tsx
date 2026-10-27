import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useEffectiveEnvironment } from './appearance';
import { CompanionD01Motion, type CompanionD01Rig, type CompanionD01Target } from './companion-d01-motion';
import { companionPresenceArtwork } from './companion';
import { companionRegisteredSceneArtwork } from './companion-scenes';
import conversationDay from '../../前端视觉创新设计/运行素材/workspaces/conversation-apricot.png';
import conversationNight from '../../前端视觉创新设计/运行素材/workspaces/conversation-rain.png';
import conversationMist from '../../前端视觉创新设计/运行素材/workspaces/conversation-mist.png';
import conversationViolet from '../../前端视觉创新设计/运行素材/workspaces/conversation-violet.png';
import studyDay from '../../前端视觉创新设计/运行素材/workspaces/study-apricot.png';
import studyNight from '../../前端视觉创新设计/运行素材/workspaces/study-rain.png';
import studyMist from '../../前端视觉创新设计/运行素材/workspaces/study-mist.png';
import studyViolet from '../../前端视觉创新设计/运行素材/workspaces/study-violet.png';
import todayDay from '../../前端视觉创新设计/运行素材/workspaces/today-colonnade-apricot.png';
import todayNight from '../../前端视觉创新设计/运行素材/workspaces/today-colonnade-rain.png';
import todayMist from '../../前端视觉创新设计/运行素材/workspaces/today-colonnade-mist.png';
import todayViolet from '../../前端视觉创新设计/运行素材/workspaces/today-colonnade-violet.png';
import sakikoDay from '../../前端视觉创新设计/运行素材/workspaces/today-sakiko-apricot.png';
import sakikoNight from '../../前端视觉创新设计/运行素材/workspaces/today-sakiko-rain.png';
import sakikoMist from '../../前端视觉创新设计/运行素材/workspaces/today-sakiko-mist.png';
import sakikoViolet from '../../前端视觉创新设计/运行素材/workspaces/today-sakiko-violet.png';
import sakikoMask from '../../前端视觉创新设计/运行素材/workspaces/today-sakiko-mask.png';
import deskApricot from '../../前端视觉创新设计/运行素材/coherent-desk/desk-apricot.png';
import deskMist from '../../前端视觉创新设计/运行素材/coherent-desk/desk-mist.png';
import deskViolet from '../../前端视觉创新设计/运行素材/coherent-desk/desk-violet.png';
import deskRain from '../../前端视觉创新设计/运行素材/coherent-desk/desk-rain.png';
import studyPersonApricot from '../../前端视觉创新设计/运行素材/companion/scenes/sakiko-study-apricot-literary-desk-v1-mother.png';
import studyPersonMist from '../../前端视觉创新设计/运行素材/coherent-desk/study-mist.png';
import studyPersonViolet from '../../前端视觉创新设计/运行素材/coherent-desk/study-violet.png';
import studyPersonRain from '../../前端视觉创新设计/运行素材/coherent-desk/study-rain.png';
import deskApricotEyeUnderlay from '../../前端视觉创新设计/运行素材/coherent-desk/desk-apricot-eye-underlay.png';
import deskApricotBlink from '../../前端视觉创新设计/运行素材/coherent-desk/desk-apricot-blink.png';
import deskMistBlink from '../../前端视觉创新设计/运行素材/coherent-desk/desk-mist-blink.png';
import deskVioletBlink from '../../前端视觉创新设计/运行素材/coherent-desk/desk-violet-blink.png';
import deskRainBlink from '../../前端视觉创新设计/运行素材/coherent-desk/desk-rain-blink.png';

const deskArtwork = { apricot: deskApricot, mist: deskMist, violet: deskViolet, rain: deskRain };
const studyPersonArtwork = { apricot: studyPersonApricot, mist: studyPersonMist, violet: studyPersonViolet, rain: studyPersonRain };
const deskBlinkArtwork = { apricot: deskApricotBlink, mist: deskMistBlink, violet: deskVioletBlink, rain: deskRainBlink };
const deskBlinkPaths = [
  'M375 237 C410 233 443 248 457 267 L455 299 C425 301 391 288 378 273 Z',
  'M503 282 C534 277 568 290 582 309 L574 340 C543 348 510 333 503 316 Z',
];
const deskEyeRig: CompanionD01Rig = {
  id: 'sakiko-coherent-desk-apricot-eyes-v1', width: 1536, height: 1024, source: deskApricot, cleanPlate: deskApricot,
  eyes: { cleanPlate: deskApricotEyeUnderlay, travel: [1.8, 1], blink: { source: deskApricotBlink, paths: deskBlinkPaths }, apertures: [
    { center: [419, 268], path: 'M394 254 C404 248 423 250 435 259 C443 265 447 272 446 277 C432 287 416 285 405 281 C396 276 394 266 394 254 Z',
      irisPath: 'M401 252 C414 250 431 253 438 266 C441 276 432 285 420 284 C407 283 399 270 401 252 Z' },
    { center: [533, 309], path: 'M518 301 C528 292 542 293 553 301 C560 306 562 312 560 317 C551 327 535 330 524 323 C519 317 516 307 518 301 Z',
      irisPath: 'M519 299 C525 294 538 296 546 303 C553 313 544 326 532 327 C520 326 515 313 519 299 Z' },
  ] },
};
function blinkOnlyRig(palette: 'mist' | 'violet' | 'rain'): CompanionD01Rig {
  const source = deskArtwork[palette];
  return { id: `sakiko-coherent-desk-${palette}-blink-v1`, width: 1536, height: 1024, source, cleanPlate: source,
    eyes: { cleanPlate: source, apertures: [], travel: [0, 0], blink: { source: deskBlinkArtwork[palette], paths: deskBlinkPaths } } };
}
const deskMotionRigs = { apricot: deskEyeRig, mist: blinkOnlyRig('mist'), violet: blinkOnlyRig('violet'), rain: blinkOnlyRig('rain') };

const artwork = {
  conversation: { apricot: conversationDay, rain: conversationNight, mist: conversationMist, violet: conversationViolet },
  study: { apricot: studyDay, rain: studyNight, mist: studyMist, violet: studyViolet },
  today: { apricot: todayDay, rain: todayNight, mist: todayMist, violet: todayViolet },
  studio: { apricot: studyDay, rain: studyNight, mist: studyMist, violet: studyViolet },
};
export type WorkspaceScene = keyof typeof artwork;
const seatedFigures: Record<string, string> = {
  [todayDay]: sakikoDay, [todayNight]: sakikoNight, [todayMist]: sakikoMist, [todayViolet]: sakikoViolet,
};

/** Decode only the current light's nearby destinations while the room remains
 * visible. Keep the image objects alive across navigation, not all themes. */
export function WorkspaceArtworkWarmup({ character, sceneChoices }: { character: string; sceneChoices?: Record<string, string> }) {
  const environment = useEffectiveEnvironment();
  const retained = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    const palette = environment.palette;
    const variant = environment.mode === 'auto' ? environment.requestedVariant : undefined;
    const neutralTime = variant === 'unknown' ? environment.isDay ? 'day' : 'night' : undefined;
    const roomArt = [
      ...(['chat', 'reading', 'study', 'resume', 'rest'] as const).map(moment => companionPresenceArtwork(character, moment, environment.light, palette, variant, neutralTime)),
      ...Object.values(sceneChoices || {}).map(id => companionRegisteredSceneArtwork(id, character, environment.light, palette, variant, neutralTime)),
    ];
    const roomUrls = roomArt.flatMap(art => art ? [art.mother, art.background, art.mask, art.figure, art.contactMask, art.shadow] : [])
      .filter((url): url is string => !!url);
    const urls = [...new Set([...roomUrls, ...(character === 'sakiko'
      ? [deskArtwork[palette], studyPersonArtwork[palette], artwork.today[palette], seatedFigures[artwork.today[palette]], sakikoMask,
        deskBlinkArtwork[palette], ...(palette === 'apricot' ? [deskApricotEyeUnderlay] : [])]
      : [])])];
    retained.current = urls.map(url => { const image = new Image(); image.src = url; void image.decode().catch(() => {}); return image; });
    return () => { retained.current = []; };
  }, [character, environment.palette, environment.mode, environment.light, environment.requestedVariant, environment.isDay, sceneChoices]);
  return null;
}

function WorkspacePlate({ background, characterVisible, arriving = false }: {
  background: string; characterVisible: boolean; arriving?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const mother = seatedFigures[background];
  return <div className={`workspace-scenery-layer${arriving ? ' workspace-scenery-current' : ''}`}>
    <img src={background} alt="" />
    {characterVisible && mother && <svg className="workspace-character" viewBox="0 0 1536 1024" aria-hidden="true">
      <defs>
        <filter id={`${id}-contact-feather`} colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="3" /></filter>
        <mask id={`${id}-person`} x="0" y="0" width="1536" height="1024" maskUnits="userSpaceOnUse" style={{ maskType: 'luminance' }}>
          <image href={sakikoMask} width="1536" height="1024" />
          {/* Reveal actual contact pixels from the same mother, rather than
              painting a synthetic shadow beneath a redrawn cutout. */}
          <g fill="white" filter={`url(#${id}-contact-feather)`}>
            <polygon points="1010,968 1202,959 1224,1004 1186,1017 1021,1008 1000,990" />
            <polygon points="1275,775 1454,772 1457,795 1297,797" />
          </g>
        </mask>
      </defs>
      <image href={mother} width="1536" height="1024" mask={`url(#${id}-person)`} />
    </svg>}
  </div>;
}

type Perch = { id: string; label: string; x: number; y: number; pose: 'loaf' | 'curl' | 'stretch' };
// Source-pixel support points. These share the image's projection, and are
// ignored when a reading surface or a control covers the real furniture.
const perches: Record<'conversation' | 'study' | 'today', Perch[]> = {
  conversation: [
    { id: 'lamp', label: '台灯顶', x: 229, y: 303, pose: 'loaf' },
    { id: 'left-books', label: '桌角的书', x: 70, y: 734, pose: 'curl' },
    { id: 'shelf-books', label: '书架上的书', x: 1467, y: 443, pose: 'loaf' },
    { id: 'desk', label: '桌沿', x: 1190, y: 956, pose: 'stretch' },
  ],
  study: [
    { id: 'books', label: '书脊旁', x: 1025, y: 155, pose: 'loaf' },
    { id: 'desk-front', label: '桌垫前沿', x: 1040, y: 969, pose: 'curl' },
    { id: 'notebook', label: '身旁的本子', x: 72, y: 466, pose: 'stretch' },
  ],
  today: [
    { id: 'floor', label: '廊下的地面', x: 680, y: 1008, pose: 'curl' },
    { id: 'bench-arm', label: '长椅扶手', x: 1234, y: 677, pose: 'loaf' },
    { id: 'book', label: '长椅上的书', x: 1438, y: 769, pose: 'loaf' },
  ],
};
const characterPerches: Perch[] = [
  { id: 'head', label: '祥子头顶', x: 1334, y: 312, pose: 'loaf' },
  { id: 'lap', label: '祥子膝上', x: 1290, y: 729, pose: 'curl' },
];
const deskPerches: Perch[] = [
  { id: 'lamp', label: '桌边灯罩', x: 40, y: 216, pose: 'loaf' },
  { id: 'books', label: '手边的书', x: 208, y: 876, pose: 'curl' },
  { id: 'desk-front', label: '桌面前沿', x: 1190, y: 1000, pose: 'stretch' },
];

/** Art is a setting for the current work, never a second conversation or source. */
export function WorkspaceScenery({ scene, character, showCharacter = false, motionTargets, yieldToInput = false, reducedMotion = false }: {
  scene: WorkspaceScene; character?: string; showCharacter?: boolean; motionTargets?: readonly CompanionD01Target[];
  yieldToInput?: boolean; reducedMotion?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width && height) setSize(old => old.width === width && old.height === height ? old : { width, height });
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const environment = useEffectiveEnvironment();
  const family = scene === 'studio' ? 'study' : scene;
  const nearDesk = (scene === 'conversation' || scene === 'studio') && character === 'sakiko' && showCharacter;
  const sharedStudy = scene === 'study' && character === 'sakiko' && showCharacter;
  const scale = Math.max(size.width / 1536, size.height / 1024);
  const x = (size.width - 1536 * scale) * ((nearDesk || sharedStudy) && size.width <= 1000 ? 0 : family === 'conversation' && size.width <= 1000 ? .7 : .5);
  const y = (size.height - 1024 * scale) * (family === 'today' ? 1 : .5);
  const characterVisible = family === 'today' && character === 'sakiko' && showCharacter
    && x + 1020 * scale >= 8 && x + 1495 * scale <= size.width - 8
    && y + 310 * scale >= 72 && y + 1004 * scale <= size.height - 8;
  const next = nearDesk ? deskArtwork[environment.palette] : sharedStudy ? studyPersonArtwork[environment.palette] : artwork[scene][environment.palette];
  const paintingFamily = nearDesk ? 'near-desk' : sharedStudy ? 'shared-study' : family;
  const displayedFamily = useRef(paintingFamily);
  const [image, setImage] = useState(next);
  const [previous, setPrevious] = useState<string>();
  useEffect(() => {
    if (next === image) return;
    let active = true;
    const sources = [next, ...(seatedFigures[next] ? [seatedFigures[next], sakikoMask] : [])];
    void Promise.all(sources.map(source => {
      const candidate = new Image(); candidate.src = source; return candidate.decode();
    })).then(() => {
      if (!active) return;
      // A change of camera/pose is a cut between places, never two bodies
      // cross-fading through each other. Same-camera light may dissolve.
      setPrevious(displayedFamily.current === paintingFamily ? image : undefined);
      displayedFamily.current = paintingFamily; setImage(next);
    }).catch(() => { /* Retain the already readable setting if artwork cannot load. */ });
    return () => { active = false; };
  }, [next, image, paintingFamily]);
  useEffect(() => {
    if (!previous) return;
    const timer = window.setTimeout(() => setPrevious(undefined), 420);
    return () => window.clearTimeout(timer);
  }, [previous]);
  return <div ref={root} className="workspace-scenery" data-desk={nearDesk ? 'true' : undefined} data-study-room={sharedStudy ? 'true' : undefined} aria-hidden="true">
    <div className="workspace-scenery-frame" style={{ transform: `translate(${x}px,${y}px) scale(${scale})` }}>
    {previous && <WorkspacePlate background={previous} characterVisible={characterVisible} />}
    <WorkspacePlate key={image} background={image} characterVisible={characterVisible} arriving={!!previous} />
    {nearDesk && image === deskArtwork[environment.palette] && !previous && <CompanionD01Motion
      rig={deskMotionRigs[environment.palette]} targets={environment.palette === 'apricot' ? motionTargets : undefined} yieldToInput={yieldToInput} reducedMotion={reducedMotion}
      geometryKey={`${x}:${y}:${scale}`} />}
    {(nearDesk ? deskPerches : sharedStudy ? [] : perches[family]).map(perch => <div key={perch.id} className="workspace-scene-perch"
      data-presence-edge={`scenery-${family}-${perch.id}`} data-presence-edge-label={perch.label}
      data-presence-edge-sides="top" data-presence-edge-point="true" data-presence-edge-scene="true"
      data-presence-edge-pose={perch.pose} style={{ left: perch.x - 36, top: perch.y, width: 72, height: 4 }} />)}
    {characterVisible && seatedFigures[image] && characterPerches.map(perch => <div key={perch.id}
      className="workspace-scene-perch workspace-character-perch" data-presence-edge={`scenery-sakiko-${perch.id}`}
      data-presence-edge-label={perch.label} data-presence-edge-sides="top" data-presence-edge-point="true"
      data-presence-edge-scene="true" data-presence-edge-pose={perch.pose}
      style={{ left: perch.x - 36, top: perch.y, width: 72, height: 4 }} />)}
    </div>
  </div>;
}
