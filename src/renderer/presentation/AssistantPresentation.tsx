import './openui-development';
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createLibrary, defineComponent, Renderer } from '@openuidev/react-lang';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Sun,
} from 'lucide-react';
import { z } from 'zod/v4';
import type { PresentationView, SceneSnapshot, SemanticSelection } from '../../shared/scenes';
import './presentation.css';

type MapSnapshot = Extract<SceneSnapshot, { kind: 'map' }>;
type WeatherSnapshot = Extract<SceneSnapshot, { kind: 'weather' }>;

export interface AssistantPresentationProps {
  view: PresentationView;
  scenes: SceneSnapshot[];
  renderMap: (scene: MapSnapshot, active: boolean) => ReactNode;
  onSelect: (selection: SemanticSelection) => void;
  selection?: SemanticSelection | null;
  isStreaming?: boolean;
}

interface SceneContextValue extends Omit<AssistantPresentationProps, 'view' | 'scenes' | 'isStreaming'> {
  snapshots: Map<string, SceneSnapshot>;
}
const SceneContext = createContext<SceneContextValue | null>(null);

function useScene(ref: string, kind: SceneSnapshot['kind']) {
  const context = useContext(SceneContext);
  const scene = context?.snapshots.get(ref);
  return { context, scene: scene?.kind === kind ? scene : undefined };
}

function MapSlot({
  scene,
  renderMap,
}: {
  scene: MapSnapshot;
  renderMap: AssistantPresentationProps['renderMap'];
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const element = container.current;
    let intersects = false;
    const refresh = () =>
      setVisible(
        intersects ||
          !!element.querySelector(
            '.conversation-map[data-focused="true"], .conversation-map[data-collapsed="true"]',
          ),
      );
    const observer = new IntersectionObserver(
      (entries) => {
        intersects = entries.some((entry) => entry.isIntersecting);
        refresh();
      },
      { rootMargin: '240px' },
    );
    const focusObserver = new MutationObserver(refresh);
    observer.observe(element);
    focusObserver.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-focused', 'data-collapsed'],
    });
    return () => {
      observer.disconnect();
      focusObserver.disconnect();
    };
  }, []);
  return (
    <div className="presentation-map-slot" ref={container} data-scene-id={scene.id}>
      {renderMap(scene, visible)}
    </div>
  );
}

const MapScene = defineComponent({
  name: 'MapScene',
  description:
    '显示已由主机核验的校园旅程。ref 是提供过的场景 id@revision；路线和地点不得编造。观看和选中不等于更改安排或到达。',
  props: z.object({ ref: z.string().min(1) }),
  component: ({ props }) => {
    const { context, scene } = useScene(props.ref, 'map');
    if (!context || !scene || scene.kind !== 'map') return <UnavailableScene />;
    return <MapSlot scene={scene} renderMap={context.renderMap} />;
  },
});

const WeatherScene = defineComponent({
  name: 'WeatherScene',
  description:
    '比较已查询的杭州按日预报并选择日期。仅使用已提供的场景 id@revision；按日降水概率不能推出小时天气或停雨时间。选择日期可供下一句引用，不会保存日程。',
  props: z.object({ ref: z.string().min(1) }),
  component: ({ props }) => {
    const { context, scene } = useScene(props.ref, 'weather');
    if (!context || !scene || scene.kind !== 'weather') return <UnavailableScene />;
    return <WeatherDays scene={scene} selection={context.selection} onSelect={context.onSelect} />;
  },
});

const SceneStack = defineComponent({
  name: 'SceneStack',
  description:
    '按交流需要组织已核验的地图和天气。stack 让不同领域自然接续；compare 仅在宽度足够时并排比较，地图仍保留可操作的空间。',
  props: z.object({
    children: z.array(z.union([MapScene.ref, WeatherScene.ref])),
    layout: z.enum(['stack', 'compare']).default('stack'),
  }),
  component: ({ props, renderNode }) => (
    <div className={`presentation-scenes presentation-scenes-${props.layout}`}>
      {props.children.map((node) => {
        const ref = typeof node.props?.ref === 'string' ? node.props.ref : node.type;
        const identity = ref.replace(/@\d+$/, '');
        return <Fragment key={identity}>{renderNode(node)}</Fragment>;
      })}
    </div>
  ),
});

/** A stable module-level library keeps parsing and mounted scene identity independent of text tokens. */
export const assistantPresentationLibrary = createLibrary({
  root: 'SceneStack',
  components: [SceneStack, MapScene, WeatherScene],
});

function UnavailableScene() {
  return (
    <p className="presentation-unavailable" role="status">
      这份内容暂时无法显示。
    </p>
  );
}

/** All facts come from exact host snapshots; OpenUI only composes the allowed component references. */
export function AssistantPresentation({
  view,
  scenes,
  renderMap,
  onSelect,
  selection,
  isStreaming = false,
}: AssistantPresentationProps) {
  const [failed, setFailed] = useState(false);
  const snapshots = useMemo(() => {
    const allowed = new Set(view.sceneRefs.map((ref) => `${ref.id}@${ref.revision}`));
    return new Map(
      scenes.flatMap((scene) => {
        const key = `${scene.id}@${scene.revision}`;
        return allowed.has(key) ? [[key, scene] as const] : [];
      }),
    );
  }, [scenes, view.sceneRefs]);
  const context = useMemo(
    () => ({ snapshots, renderMap, onSelect, selection }),
    [snapshots, renderMap, onSelect, selection],
  );
  useEffect(() => setFailed(false), [view.id, view.revision]);
  if (view.libraryVersion !== 1 || !view.sceneRefs.length) return <UnavailableScene />;
  return (
    <SceneContext.Provider value={context}>
      <div className="assistant-presentation" data-view-id={view.id}>
        <Renderer
          response={view.dsl}
          library={assistantPresentationLibrary}
          isStreaming={isStreaming}
          publishObservability={false}
          onError={(errors) => setFailed(errors.some((error) => error.severity !== 'warning'))}
        />
        {failed && <UnavailableScene />}
      </div>
    </SceneContext.Provider>
  );
}

function weatherCondition(code: number | null) {
  if (code === null) return { label: '未知', Icon: Cloud };
  if (code === 0) return { label: '晴', Icon: Sun };
  if (code === 1) return { label: '大部晴朗', Icon: CloudSun };
  if (code === 2) return { label: '多云', Icon: CloudSun };
  if (code === 3) return { label: '阴', Icon: Cloud };
  if (code === 45 || code === 48) return { label: '雾', Icon: CloudFog };
  if ([51, 53, 55].includes(code)) return { label: '毛毛雨', Icon: CloudDrizzle };
  if ([56, 57].includes(code)) return { label: '冻毛毛雨', Icon: CloudDrizzle };
  if ([61, 63, 65].includes(code)) return { label: code === 65 ? '大雨' : '雨', Icon: CloudRain };
  if ([66, 67].includes(code)) return { label: '冻雨', Icon: CloudRain };
  if ([80, 81, 82].includes(code)) return { label: code === 82 ? '强阵雨' : '阵雨', Icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '雪', Icon: CloudSnow };
  if (code === 95) return { label: '雷暴', Icon: CloudLightning };
  if (code === 97) return { label: '强雷暴', Icon: CloudLightning };
  if ([96, 99].includes(code)) return { label: '雷暴伴冰雹', Icon: CloudLightning };
  return { label: '未知', Icon: Cloud };
}

function dateLabel(date: string, full = false) {
  // A forecast day is a calendar date in its own source zone, not an instant in this computer's zone.
  const value = new Date(`${date}T12:00:00Z`);
  return value.toLocaleDateString('zh-CN', {
    timeZone: 'UTC',
    ...(full ? { month: 'long', day: 'numeric', weekday: 'long' } : { weekday: 'short' }),
  });
}

const degrees = (value: number | null) => (value === null ? '—' : `${Math.round(value)}°`);

function WeatherDays({
  scene,
  selection,
  onSelect,
}: {
  scene: WeatherSnapshot;
  selection?: SemanticSelection | null;
  onSelect: AssistantPresentationProps['onSelect'];
}) {
  const selectedDate =
    selection?.sceneId === scene.id && selection.sceneRevision === scene.revision && selection.kind === 'date'
      ? selection.date
      : undefined;
  return (
    <section className="presentation-weather" aria-label="按日天气预报" data-scene-id={scene.id}>
      <header className="presentation-weather-heading">
        <div>
          <h3>杭州 · 按日天气</h3>
          <span>
            {scene.days.length > 1
              ? `${scene.days[0]?.date.slice(5).replace('-', '/')} — ${scene.days.at(-1)?.date.slice(5).replace('-', '/')}`
              : scene.days[0]?.date}
          </span>
        </div>
        <span>城市参考预报</span>
      </header>
      <div className="presentation-weather-days" role="group" aria-label="选择日期">
        {scene.days.map((day) => {
          const { label, Icon } = weatherCondition(day.weatherCode);
          const selected = selectedDate === day.date;
          return (
            <button
              type="button"
              className={`presentation-weather-day${selected ? ' is-selected' : ''}`}
              key={day.date}
              aria-pressed={selected}
              aria-label={`${dateLabel(day.date, true)}，${label}，最低温 ${day.minC === null ? '未知' : Math.round(day.minC) + ' 摄氏度'}，最高温 ${day.maxC === null ? '未知' : Math.round(day.maxC) + ' 摄氏度'}，最大降水概率 ${day.precipitationProbabilityMax === null ? '未知' : Math.round(day.precipitationProbabilityMax) + '%'}`}
              onClick={() =>
                onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'date', date: day.date })
              }
            >
              <span className="presentation-weather-weekday">{dateLabel(day.date)}</span>
              <span className="presentation-weather-date">{day.date.slice(5).replace('-', '/')}</span>
              <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
              <span className="presentation-weather-condition">{label}</span>
              <span className="presentation-weather-temperatures">
                <strong>{degrees(day.maxC)}</strong>
                <span>{degrees(day.minC)}</span>
              </span>
              <span className="presentation-weather-rain">
                <Droplets size={11} aria-hidden="true" />
                {day.precipitationProbabilityMax === null
                  ? '未知'
                  : `${Math.round(day.precipitationProbabilityMax)}%`}
              </span>
            </button>
          );
        })}
      </div>
      <footer className="presentation-weather-source">
        <span>每日最高 / 最低温 · 最大降水概率</span>
        {scene.source.fetchedAt && (
          <time dateTime={scene.source.fetchedAt}>
            {new Date(scene.source.fetchedAt).toLocaleString('zh-CN', {
              timeZone: scene.timeZone,
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}{' '}
            更新
          </time>
        )}
      </footer>
    </section>
  );
}
