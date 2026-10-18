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
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock3,
  MapPin,
  Sun,
} from 'lucide-react';
import { z } from 'zod/v4';
import type { PresentationView, SceneSnapshot, SemanticSelection } from '../../shared/scenes';
import './presentation.css';

type MapSnapshot = Extract<SceneSnapshot, { kind: 'map' }>;
type WeatherSnapshot = Extract<SceneSnapshot, { kind: 'weather' }>;
type CampusSnapshot = Extract<SceneSnapshot, { kind: 'campus' }>;

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
    '比较场景中所给地点的按日预报并选择日期。仅使用已提供的场景 id@revision；按日降水概率不能推出小时天气或停雨时间。选择日期可供下一句引用，不会保存日程。',
  props: z.object({ ref: z.string().min(1) }),
  component: ({ props }) => {
    const { context, scene } = useScene(props.ref, 'weather');
    if (!context || !scene || scene.kind !== 'weather') return <UnavailableScene />;
    return <WeatherDays scene={scene} selection={context.selection} onSelect={context.onSelect} />;
  },
});

const CampusScene = defineComponent({
  name: 'CampusScene',
  description:
    '展示已读取的校园课程或考试记录。ref 必须引用宿主快照；保留原时间、来源和读取范围。选择某条记录供下一句引用，不会写日历或读取更多资料。',
  props: z.object({ ref: z.string().min(1) }),
  component: ({ props }) => {
    const { context, scene } = useScene(props.ref, 'campus');
    if (!context || !scene || scene.kind !== 'campus') return <UnavailableScene />;
    return <CampusRecords scene={scene} selection={context.selection} onSelect={context.onSelect} />;
  },
});

const SceneStack = defineComponent({
  name: 'SceneStack',
  description:
    '按交流需要组织已核验的地图、天气和校园记录。stack 让不同领域自然接续；compare 仅在宽度足够时并排比较，地图仍保留可操作的空间。',
  props: z.object({
    children: z.array(z.union([MapScene.ref, WeatherScene.ref, CampusScene.ref])),
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
  components: [SceneStack, MapScene, WeatherScene, CampusScene],
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
          <h3>{scene.location} · 按日天气</h3>
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

/** Offset-free campus times are already local source strings. Never feed them
 * into Date's machine-local parser and silently move a class to another day. */
function campusTime(value?: string, withYear = false) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) {
    return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', ...(withYear ? { year: 'numeric' } : {}), month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return value.replace('T', ' ').replace(/(\d{2}:\d{2}):00(?:\.000)?$/, '$1');
}

function CampusRecords({ scene, selection, onSelect }: {
  scene: CampusSnapshot;
  selection?: SemanticSelection | null;
  onSelect: AssistantPresentationProps['onSelect'];
}) {
  const selectedId = selection?.kind === 'record' && selection.sceneId === scene.id && selection.sceneRevision === scene.revision ? selection.recordId : undefined;
  const [browsedId, setBrowsedId] = useState(scene.records[0]?.id);
  const [showAll, setShowAll] = useState(false);
  const row = scene.records.find(record => record.id === browsedId) || scene.records[0];
  const isExam = scene.domain === 'exams';
  const Icon = isExam ? CalendarDays : BookOpen;
  const noun = isExam ? '考试' : '课';
  const heading = isExam ? '考试安排' : scene.domain === 'courses' ? '一起看看这些课' : '课表里的安排';
  const choices = showAll ? scene.records : scene.records.slice(0, 5);
  if (!row) return <UnavailableScene />;
  return (
    <section className="presentation-campus" aria-label={heading} data-scene-id={scene.id}>
      <header className="presentation-campus-heading">
        <Icon size={21} strokeWidth={1.5} aria-hidden="true" />
        <h3>{heading}</h3>
        {scene.term && <span className="presentation-campus-term">{scene.term}</span>}
      </header>
      {scene.records.length > 1 && <div className="presentation-campus-choices" role="group" aria-label={`选择想看的${noun}`}>
        {choices.map(record => <button type="button" key={record.id} aria-pressed={record.id === row.id}
          className={record.id === row.id ? 'is-active' : ''} onClick={() => setBrowsedId(record.id)}>
          <span>{record.title}</span>
          {record.startsAt && <small>{campusTime(record.startsAt)}</small>}
        </button>)}
        {scene.records.length > 5 && <button type="button" className="presentation-campus-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? '收起一些' : `其余 ${scene.records.length - 5} 项`}<ChevronDown size={14} className={showAll ? 'is-open' : ''} />
        </button>}
      </div>}
      <div className="presentation-campus-detail">
        <div className="presentation-campus-main">
          <h4>{row.title}</h4>
          {row.cancelled && <p className="presentation-campus-change">这次{noun}已取消</p>}
          {row.rescheduled && <p className="presentation-campus-change">课表中有调课，请留意下面的时间</p>}
          {row.teachers?.length ? <p>{row.teachers.join('、')}</p> : null}
          <div className="presentation-campus-meta">
            {row.credit !== undefined && <span>{row.credit} 学分</span>}
            {row.examType && <span>{row.examType}</span>}
            {row.term && row.term !== scene.term && <span>{row.term}</span>}
          </div>
          <button type="button" className="presentation-campus-continue"
            aria-pressed={selectedId === row.id}
            onClick={() => onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'record', recordId: row.id })}>
            {selectedId === row.id ? '接着说，我在听' : `接着聊这${isExam ? '场考试' : '门课'}`}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {(row.startsAt || row.dateLabel || row.location || row.seat !== undefined) && <div className="presentation-campus-when">
          {(row.startsAt || row.dateLabel) && <div><Clock3 size={16} aria-hidden="true" /><p>
            <strong>{campusTime(row.startsAt) || row.dateLabel}</strong>
            {row.endsAt && <span>至 {campusTime(row.endsAt)}</span>}
            {!row.startsAt && row.dateLabel && <span>具体时刻还没在这份资料里看到</span>}
          </p></div>}
          {row.location && <div><MapPin size={16} aria-hidden="true" /><p>{row.location}</p></div>}
          {row.seat !== undefined && <p className="presentation-campus-seat">座位 {row.seat}</p>}
        </div>}
      </div>
      <footer className="presentation-campus-footer">
        <span>{scene.origin === 'legacy_import' ? '来自你带来的资料' : '来自校园资料'}{!scene.complete ? ' · 这次读到的部分' : ''}</span>
        <details className="presentation-campus-source">
          <summary>看看资料来自哪里<ChevronDown size={13} aria-hidden="true" /></summary>
          <div>
            <p>{scene.sourceLabel}</p>
            {scene.source.fetchedAt ? <p><time dateTime={scene.source.fetchedAt}>{campusTime(scene.source.fetchedAt, true)}</time> 读取</p> : <p>这份资料没有附读取时间。</p>}
            <p>{scene.total !== undefined && scene.total > scene.records.length ? `本次显示 ${scene.records.length} 项，查询中共有 ${scene.total} 项。` : `这里保留了这次读到的 ${scene.records.length} 项。`}</p>
            {scene.origin === 'legacy_import' && <p>这是你带来的那份资料，之后的课程变动可以再一起核对。</p>}
          </div>
        </details>
      </footer>
    </section>
  );
}
