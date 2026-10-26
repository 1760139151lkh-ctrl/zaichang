import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useEffectiveEnvironment } from './appearance';
import conversationDay from '../../前端视觉创新设计/运行素材/workspaces/conversation-apricot.png';
import conversationNight from '../../前端视觉创新设计/运行素材/workspaces/conversation-rain.png';
import conversationMist from '../../前端视觉创新设计/运行素材/workspaces/conversation-mist.png';
import conversationViolet from '../../前端视觉创新设计/运行素材/workspaces/conversation-violet.png';
import keepDay from '../../前端视觉创新设计/运行素材/workspaces/keep-apricot.png';
import keepNight from '../../前端视觉创新设计/运行素材/workspaces/keep-rain.png';
import keepMist from '../../前端视觉创新设计/运行素材/workspaces/keep-mist.png';
import keepViolet from '../../前端视觉创新设计/运行素材/workspaces/keep-violet.png';
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

const artwork = {
  conversation: { apricot: conversationDay, rain: conversationNight, mist: conversationMist, violet: conversationViolet },
  keep: { apricot: keepDay, rain: keepNight, mist: keepMist, violet: keepViolet },
  study: { apricot: studyDay, rain: studyNight, mist: studyMist, violet: studyViolet },
  today: { apricot: todayDay, rain: todayNight, mist: todayMist, violet: todayViolet },
  memory: { apricot: keepDay, rain: keepNight, mist: keepMist, violet: keepViolet },
  studio: { apricot: studyDay, rain: studyNight, mist: studyMist, violet: studyViolet },
};
export type WorkspaceScene = keyof typeof artwork;
const seatedFigures: Record<string, string> = {
  [todayDay]: sakikoDay, [todayNight]: sakikoNight, [todayMist]: sakikoMist, [todayViolet]: sakikoViolet,
};

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
const perches: Record<'conversation' | 'keep' | 'study' | 'today', Perch[]> = {
  conversation: [
    { id: 'lamp', label: '台灯顶', x: 229, y: 303, pose: 'loaf' },
    { id: 'left-books', label: '桌角的书', x: 70, y: 734, pose: 'curl' },
    { id: 'shelf-books', label: '书架上的书', x: 1467, y: 443, pose: 'loaf' },
    { id: 'desk', label: '桌沿', x: 1190, y: 956, pose: 'stretch' },
  ],
  keep: [
    { id: 'books', label: '摞起的书', x: 329, y: 138, pose: 'curl' },
    { id: 'desk-corner', label: '桌面右角', x: 1390, y: 803, pose: 'loaf' },
    { id: 'desk-front', label: '桌面前沿', x: 768, y: 968, pose: 'curl' },
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

/** Art is a setting for the current work, never a second conversation or source. */
export function WorkspaceScenery({ scene, character, showCharacter = false }: { scene: WorkspaceScene; character?: string; showCharacter?: boolean }) {
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
  const family = scene === 'memory' ? 'keep' : scene === 'studio' ? 'study' : scene;
  const scale = Math.max(size.width / 1536, size.height / 1024);
  const x = (size.width - 1536 * scale) * (family === 'conversation' && size.width <= 1000 ? .7 : .5);
  const y = (size.height - 1024 * scale) * (family === 'today' ? 1 : .5);
  const characterVisible = family === 'today' && character === 'sakiko' && showCharacter
    && x + 1020 * scale >= 8 && x + 1495 * scale <= size.width - 8
    && y + 310 * scale >= 72 && y + 1004 * scale <= size.height - 8;
  const next = artwork[scene][environment.palette];
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
      setPrevious(image); setImage(next);
    }).catch(() => { /* Retain the already readable setting if artwork cannot load. */ });
    return () => { active = false; };
  }, [next, image]);
  useEffect(() => {
    if (!previous) return;
    const timer = window.setTimeout(() => setPrevious(undefined), 420);
    return () => window.clearTimeout(timer);
  }, [previous]);
  return <div ref={root} className="workspace-scenery" aria-hidden="true">
    <div className="workspace-scenery-frame" style={{ transform: `translate(${x}px,${y}px) scale(${scale})` }}>
    {previous && <WorkspacePlate background={previous} characterVisible={characterVisible} />}
    <WorkspacePlate key={image} background={image} characterVisible={characterVisible} arriving />
    {perches[family].map(perch => <div key={perch.id} className="workspace-scene-perch"
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
