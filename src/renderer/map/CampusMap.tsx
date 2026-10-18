import { useEffect, useId, useReducer, useRef, useState, type RefObject, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Compass,
  LocateFixed,
  MapPinned,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Route,
  Search,
  X,
  Info,
} from 'lucide-react';
import {
  emptyRoute,
  mapPointEndpoint,
  mapRoutePointName,
  routeHasUnverifiedPassages,
  type MapCard,
  type MapPoint,
  type MapRouteResult,
  type LocationStatusResult,
  type LocationFix,
  type MapOverview,
} from '../../shared/map-v2';
import { classifyFix, inBounds } from '../../shared/map-routing';
import { rankMapPoints, uniqueExactMapPoint } from '../../shared/map-names';
import { initialSelection, selectionReducer, type SelectionState } from './map-state';
import type { MapData, CampusMapEngine, SavedCamera } from './map-engine';
import './map.css';
import './map-surface.css';
import { WindowControls } from '../ui';

const api = window.zaichang;
let dataCache: MapData | undefined;
export interface MapSurfaceMemory { camera?: SavedCamera; selection?: SelectionState; entered?: boolean }
const standaloneMemory: MapSurfaceMemory = import.meta.hot?.data.campusMapMemory || {};
import.meta.hot?.dispose((data)=>{data.campusMapMemory=standaloneMemory;});
let sessionLocationEnabled = true;
async function loadData(signal: AbortSignal): Promise<MapData> {
  const current=await api.mapOverview();
  if(current.dataStatus==='error')throw new Error(current.dataError||'这次没能打开地图，试着再打开一次。');
  if(dataCache&&dataCache.manifest.version===current.version){
    const places=dataCache.manifest.profileRevision===current.profileRevision?dataCache.places:await api.mapPlaces();
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    return dataCache={...dataCache,manifest:current,places};
  }
  const {manifest,places,geography,sports,venues}=api.mapDataJson?JSON.parse(await api.mapDataJson()):await api.mapData();
  if(manifest.dataStatus==='error')throw new Error(manifest.dataError||'这次没能打开地图，试着再打开一次。');
  if (
    manifest.schemaVersion !== 'campus-map/v2' ||
    !Array.isArray(places) ||
    (geography as {type?:string}).type !== 'FeatureCollection'
  )
    throw new Error('这份地图暂时还打不开。');
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  return (dataCache = { manifest, places, geography, sports, venues });
}
function initialState(route: MapRouteResult, memory: MapSurfaceMemory): SelectionState {
  if(route.to?.kind==='water')return {...initialSelection,destination:route.to};
  if(route.from?.kind==='water')return {...initialSelection,mode:'two',stage:'origin',destination:route.to};
  if (route.schemaVersion === 'map-route/v2' && route.to)
    return {
      ...initialSelection,
      mode: route.from ? 'two' : 'current',
      origin: route.from,
      destination: route.to,
      route,
    };
  if (memory.selection) return { ...memory.selection, route: emptyRoute() };
  return { ...initialSelection };
}
function distanceLabel(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} 公里` : `${Math.round(m)} 米`;
}
function routeDistanceTitle(r:MapRouteResult) {
  const d=r.distance!;
  const label=routeHasUnverifiedPassages(r)?'假设路线':r.routeBasis==='access_estimate_dominant'?'估算连接为主':d.networkM===0&&d.connectorM>0?'估算连接':'步行';
  return `${label} ${distanceLabel(d.totalM)}`;
}
function placeSearchDetail(p:MapPoint) {
  if(p.undergroundStation)return '地铁 · 步行至出入口';
  if(p.historicalReference&&!p.personal)return '旧图中的地点 · 现状还不清楚';
  if(p.kind==='facility')return '运动场地';
  if(p.kind==='water')return '水域 · 仅供浏览';
  if(p.geometryStatus==='reference-point') {
    if(p.source.url==='local-personal-profile'||p.personal?.referencePoint)return '个人标记 · 入口还不清楚';
    return p.id.startsWith('official/legacy/')?'旧目录中的位置 · 外形还不清楚':'参考位置 · 外形还不清楚';
  }
  if(p.kind==='area')return '片区';
  if(p.entrances.some(e=>e.connected))return '建筑 · 有入口与道路记录';
  return p.accessCandidates?.length?'建筑 · 可估算附近路线，入口还不清楚':'建筑 · 还不清楚从哪里进';
}
function placeStatusText(p:MapPoint) {
  if(p.undergroundStation)return '路线走到有记录的出入口，到了附近请再看看是否开放';
  if(p.roadReference)return '这是图上有记录的道路，楼门在哪还不清楚';
  if(p.historicalReference&&!p.personal)return '这是旧图里的地点，如今的地面和入口还不清楚';
  if(p.kind==='water')return '可以在这里看看水面；选个岸边地点，就能比较路线';
  if(p.kind==='facility')return '场馆与相邻道路';
  if(p.geometryStatus==='reference-point') {
    if(p.modelBasis)return '图上是建筑外形的示意，实际位置和入口还不清楚';
    if(p.source.url==='local-personal-profile'||p.personal?.referencePoint)return '这是你标记的位置，具体入口还不清楚';
    return p.id.startsWith('official/legacy/')?'这是旧目录中的参考位置，现在能否走通还不清楚':'这里是参考位置，具体怎么走还不清楚';
  }
  if(p.entrances.some(e=>e.connected))return '这里有入口记录，可以比较到入口的路线';
  return p.accessCandidates?.length?'可以先看看怎么走到附近，入口在哪还不清楚':'还不清楚从哪扇门进';
}
export function MapRouteCard({ card, onOpen }: { card: MapCard; onOpen: () => void }) {
  const current = card.route?.schemaVersion === 'map-route/v2',
    r = card.route;
  return (
    <button className="campus-v2-card" onClick={onOpen} aria-label="在校园地图中打开">
      <span className="campus-v2-card-icon">
        <MapPinned size={23} />
      </span>
      <span>
        <strong>{current && r.to ? r.to.displayName : '打开校园地图'}</strong>
        <small>
          {current && r.status === 'ready' && r.distance
            ? `${routeDistanceTitle(r)}${r.distance.connectorM ? " · 含估算连接" : " · 已记录入口"}`
            : current
              ? r.reason
              : '地图换了新版本，再选一次地点就好。'}
        </small>
      </span>
      <ArrowUpRight size={18} />
    </button>
  );
}
export function MapSurface({
  initialRoute,
  onClose,
  onUseContext,
  onWindowClose,
  returnLabel = '返回对话',
  reviewScene,
  reviewControls,
  inline = false,
  memory = standaloneMemory,
  onChoose,
  onEngine,
  onTakeControl,
}: {
  initialRoute: MapRouteResult;
  onClose: () => void;
  onWindowClose: () => void;
  onUseContext?: (value: { text: string; label: string; expiresAt: string }) => void;
  returnLabel?: string;
  reviewScene?: 'overview' | 'top-down' | 'oblique' | 'route-demo' | 'building-focus';
  reviewControls?: ReactNode;
  inline?: boolean;
  memory?: MapSurfaceMemory;
  onChoose?: (point: MapPoint) => void;
  onEngine?: (engine: CampusMapEngine | undefined) => void;
  onTakeControl?: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null),
    engine = useRef<CampusMapEngine | undefined>(undefined);
  const searchId=useId();
  const handlers = useRef({onChoose,onEngine,onTakeControl});
  handlers.current={onChoose,onEngine,onTakeControl};
  const routeRef=useRef(initialRoute);routeRef.current=initialRoute;
  const sceneRouteRef=useRef(initialRoute);
  const compass = useRef<HTMLSpanElement>(null),
    scale = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    coverage = useRef<HTMLSpanElement>(null);
  const [data, setData] = useState<MapData>(),
    [loadError, setLoadError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [engineReady, setEngineReady] = useState(false);
  const dataRef=useRef(data);dataRef.current=data;
  const [selection, dispatch] = useReducer(selectionReducer, initialRoute, (r) => inline&&memory.selection?memory.selection:reviewScene === 'building-focus' && r.to ? {...initialSelection, destination:r.to} : initialState(r,memory)),
    selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [query, setQuery] = useState(''),
    [searchOpen, setSearchOpen] = useState(false),
    [onlyConnected, setOnlyConnected] = useState(false),
    [resultIndex, setResultIndex] = useState(-1);
  const [hover, setHover] = useState<MapPoint>(),
    [candidates, setCandidates] = useState<MapPoint[]>([]),
    [about, setAbout] = useState(false),
    [help, setHelp] = useState(false);
  const [pitch,setPitch]=useState(memory.camera?.pitch||0),[spaceControls,setSpaceControls]=useState(false),[preview,setPreview]=useState<number|undefined>(),[routeDetails,setRouteDetails]=useState(false),[collapsed,setCollapsed]=useState(false),[entrances,setEntrances]=useState(false);
  const [selectionNotice,setSelectionNotice]=useState('');
  const reviewRouteFramed = useRef(false);
  const appliedReviewScene=useRef<typeof reviewScene>(undefined);
  const pitchValue=useRef(pitch);
  const [location, setLocation] = useState<LocationStatusResult>({
    status: 'idle',
    reason: sessionLocationEnabled ? '还没有开启这台电脑的定位。' : '已经停下这台电脑的定位，需要时再点「定位」就好。',
    source: 'windows-native',
    phoneConnected: false,
  });
  const handoffContext = useRef(false);
  const [sharing, setSharing] = useState(false),
    [shareError, setShareError] = useState('');
  async function useContext(device = false) {
    const point = selectionRef.current.origin || selectionRef.current.destination;
    if (!device && !point) return;
    setSharing(true);
    setShareError('');
    try {
      const result = await api.shareMapContext({
        enabled: true,
        ...(device ? { includeDevice: true } : { fromId: point!.id }),
      });
      if (!result.enabled || !result.expiresAt) throw new Error('这次没能把地点带回对话，再试一次吧。');
      handoffContext.current = true;
      onUseContext?.({
        text: device
          ? '刚共享的本机设备位置仅作参考，我想问：'
          : `从刚才在地图选中的「${point!.displayName}」出发，`,
        label: device ? '本机设备位置参考' : point!.displayName,
        expiresAt: result.expiresAt,
      });
      onClose();
    } catch (error) {
      setShareError(String(error instanceof Error ? error.message : error));
    } finally {
      setSharing(false);
    }
  }
  const locationRef = useRef(location);
  locationRef.current = location;
  const tracking = useRef(!inline && sessionLocationEnabled);
  const alive = useRef(true),
    locationRevision = useRef(0),
    touched = useRef(false),
    first = useRef(!memory.entered),
    introDone = useRef(false);
  const initialDestination = useRef(
    initialRoute.schemaVersion === 'map-route/v2' ? initialRoute.to?.id : undefined,
  );
  const activity = useRef(0),
    pendingLocate = useRef<{ fix: LocationFix; activity: number } | undefined>(undefined);
  const feedback = useRef({ rotation: NaN, width: NaN, label: '' });
  const requestRef = useRef<(explicit?: boolean) => Promise<void>>(async () => {});
  const results=rankMapPoints((data?.places||[]).filter(p=>!onlyConnected||p.entrances.some(e=>e.connected)),query);
  const shown = results.slice(0, 40);
  const exact=uniqueExactMapPoint(shown,query),activeResult=resultIndex>=0?resultIndex:exact?shown.findIndex(p=>p.id===exact.id):shown.length===1?0:-1;
  function user() {
    handlers.current.onTakeControl?.();
    setSelectionNotice('');
    activity.current++;
    touched.current = true;
    introDone.current = true;
    setHover(undefined);
  }
  function choose(point: MapPoint) {
    user();
    engine.current?.takeControl();
    if(inline){dispatch({type:'browse'});dispatch({type:'choose',point});handlers.current.onChoose?.(point);}
    else if(point.kind==='water'&&selectionRef.current.mode!=='browse')setSelectionNotice('水域仅供浏览，请选择岸边的建筑或地点。');
    else dispatch({ type: 'choose', point });
    setSearchOpen(false);
    setQuery('');
    setCandidates([]);
    setCollapsed(false);setPreview(undefined);
    stage.current?.focus({ preventScroll: true });
  }
  function chooseAndFocus(point:MapPoint){
    choose(point);
    const map=engine.current;if(!map)return;
    const ticket=map.ownership.ticket();
    // Measure the panel created by this selection after React has placed it.
    // A subsequent drag/selection owns the view and cancels this pending fit.
    requestAnimationFrame(()=>{if(engine.current===map&&map.ownership.accepts(ticket))map.focusPlace(point);});
  }
  function showWholeRoute(route:MapRouteResult){
    const map=engine.current;if(!map)return;
    user();map.takeControl();const ticket=map.ownership.ticket();
    setRouteDetails(false);setPreview(undefined);
    // The explicit overview needs the compact card's actual viewport space.
    // A later user gesture still owns the camera and cancels this request.
    requestAnimationFrame(()=>{if(engine.current===map&&map.ownership.accepts(ticket))map.fitRoute(route);});
  }
  useEffect(() => {
    alive.current = true;
    memory.entered = true;
    return () => {
      alive.current = false;
      locationRevision.current++;
      memory.selection = { ...selectionRef.current, route: emptyRoute() };
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    loadData(controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) {setData(d);if(!initialRoute.to)dispatch({type:'rebind',places:d.places});}
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(String(e.message || e));
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!data || !stage.current) return;
    if(engine.current?.supportsSpace){engine.current.updateData(data);return;}
    let disposed = false;
    import('./map-engine')
      .then(({ createCampusMap }) => {
        if (disposed || !stage.current) return;
        const map = createCampusMap(
          stage.current,
          data,
          {
            choose,
            candidates: setCandidates,
            hover: setHover,
            blank: () => {
              setHover(undefined);
              setCandidates([]);
              setSearchOpen(false);
            },
            user,
            camera: (c) => {
              memory.camera = c;
              if(Math.abs((c.pitch||0)-pitchValue.current)>.1){pitchValue.current=c.pitch||0;setPitch(c.pitch||0);}
              if (c.rotation !== feedback.current.rotation) {
                const needle = compass.current?.querySelector('i');
                if (needle) needle.style.transform = `rotate(${c.rotation}rad)`;
                feedback.current.rotation = c.rotation;
              }
              const lat = (Math.atan(Math.exp(c.center[1] / 6378137)) * 360) / Math.PI - 90;
              if (coverage.current) {
                const covered = inBounds(
                  [(c.center[0] * 180) / Math.PI / 6378137, lat],
                  dataRef.current?.manifest.bounds||data.manifest.bounds,
                );
                if (coverage.current.hidden !== covered) coverage.current.hidden = covered;
              }
              if (scale.current) {
                if(c.scale){scale.current.style.width=`${c.scale.width}px`;scale.current.textContent=c.scale.meters>=1000?`${c.scale.meters/1000} km`:`${c.scale.meters} m`;scale.current.title=c.scale.reference;scale.current.dataset.reference=c.scale.reference;return;}
                const ground = c.resolution * Math.cos((lat * Math.PI) / 180),
                  ideal = ground * 90,
                  power = 10 ** Math.floor(Math.log10(ideal)),
                  m =
                    [1, 2, 5, 10]
                      .map((v) => v * power)
                      .filter((v) => v <= ideal)
                      .at(-1) || power;
                const width = Math.round((m / ground) * 10) / 10,
                  label = m >= 1000 ? `${m / 1000} km` : `${m} m`;
                if (width !== feedback.current.width) {
                  scale.current.style.width = `${width}px`;
                  feedback.current.width = width;
                }
                if (label !== feedback.current.label) {
                  scale.current.textContent = label;
                  feedback.current.label = label;
                }
              }
            },
            ready: () => {
              if (alive.current) {setEngineReady(true);handlers.current.onEngine?.(engine.current);}
            },
            error: setLoadError,
          },
          memory.camera,
          {initialRoute:inline?routeRef.current:undefined,cooperativeGestures:inline},
        );
        engine.current = map;
        if (touched.current) map.takeControl();
      })
      .catch((e) => setLoadError(String(e.message || e)));
    return () => {
      disposed = true;
      if(alive.current&&engine.current?.supportsSpace)return;
      setEngineReady(false);
      engine.current?.dispose();
      engine.current = undefined;
    };
  }, [data]);
  useEffect(()=>()=>{engine.current?.dispose();engine.current=undefined;handlers.current.onEngine?.(undefined);},[]);
  useEffect(() => {
    const current=engine.current;
    if(reviewScene!=='route-demo'||!engineReady||!current||selection.route.status!=='ready'||reviewRouteFramed.current)return;
    reviewRouteFramed.current=true;
    const ticket=current.ownership.ticket();
    const frame=requestAnimationFrame(()=>{if(!touched.current&&current.ownership.accepts(ticket))current.fitRoute(selection.route);});
    return ()=>cancelAnimationFrame(frame);
  }, [engineReady, selection.route, reviewScene]);
  useEffect(() => {
    if (!engineReady || !reviewScene || !engine.current) return;
    if(appliedReviewScene.current===reviewScene)return;
    appliedReviewScene.current=reviewScene;
    const current = engine.current;
    if ((reviewScene === 'oblique' || reviewScene === 'building-focus') && current.supportsSpace) {
      current.setPitch(42); current.rotate(-Math.PI / 12, false);
    }
    if (reviewScene === 'overview' || reviewScene === 'top-down') current.overview();
  }, [engineReady, reviewScene]);

  // Profile edits are local and infrequent. Refresh labels and endpoints from
  // their sole owner without recreating geometry, camera or the route task.
  useEffect(()=>{
    if(!data||inline)return;
    let stopped=false;
    const timer=setInterval(async()=>{try{const m=await api.mapOverview();if(stopped)return;if(m.version!==data.manifest.version||m.dataStatus!==data.manifest.dataStatus){const next=api.mapDataJson?JSON.parse(await api.mapDataJson()):await api.mapData();if(!stopped){dataCache=next;setData(next);dispatch({type:'rebind',places:next.places});}return;}if(m.profileRevision===data.manifest.profileRevision)return;const places=await api.mapPlaces();if(stopped)return;data.manifest=m;data.places=places;engine.current?.updatePlaces(places);dispatch({type:'rebind',places});}catch{}},3000);
    return()=>{stopped=true;clearInterval(timer);};
  },[data,inline]);
  useEffect(() => {
    if (engineReady) engine.current?.select(selection.destination, inline?initialRoute.from:selection.mode==='browse'?undefined:selection.origin,inline?initialRoute.status==='ready'&&selection.destination?.id===initialRoute.to?.id:selection.mode!=='browse');
  }, [engineReady, selection.destination, selection.origin,selection.mode,inline,initialRoute]);
  useEffect(()=>{
    if(!inline||sceneRouteRef.current===initialRoute)return;
    sceneRouteRef.current=initialRoute;memory.selection=undefined;
    if(initialRoute.from)dispatch({type:'start',point:initialRoute.from});
    if(initialRoute.to)dispatch({type:'choose',point:initialRoute.to});
  },[inline,initialRoute,memory]);
  useEffect(() => {
    if (!inline && engineReady && initialDestination.current && !touched.current) {
      const point = data?.places.find((p) => p.id === initialDestination.current);
      initialDestination.current = undefined;
      if (point) {
        introDone.current = true;
        engine.current?.focusPlace(point);
      }
    }
  }, [engineReady]);
  useEffect(() => {
    if (engineReady) engine.current?.route(inline?initialRoute:selection.mode==='browse' ? emptyRoute() : selection.route);
    setPreview(undefined);
  }, [engineReady, selection.route, selection.mode,inline,initialRoute]);
  useEffect(()=>{
    if(inline&&engineReady){const point=memory.selection?.destination||initialRoute.to;engine.current?.select(point,initialRoute.from,initialRoute.status==='ready'&&point?.id===initialRoute.to?.id);}
  },[inline,engineReady,initialRoute]);
  useEffect(() => {
    if (engineReady) engine.current?.preview(preview===undefined?undefined:preview/100);
  }, [engineReady, preview]);
  useEffect(() => {
    // A new dataset disposes the old engine before the next ready render.
    // React can still run this effect with the preceding ready flag in that
    // commit. Defer the request until the current instance is actually alive.
    if (inline || !data || !engineReady || !engine.current?.ownership.alive || !selection.destination || selection.stage === 'origin' || selection.mode==='browse') return;
    let current = true;
    const revision = selection.revision;
    dispatch({ type: 'loading', revision });
    const from =
      selection.mode === 'two' && selection.origin
        ? mapPointEndpoint(selection.origin)
        : selection.mode === 'current' && locationRef.current.status === 'fresh'
          ? { kind: 'current' as const }
          : undefined;
    api
      .mapRoute({ from, to: mapPointEndpoint(selection.destination), version: data.manifest.version, profileRevision:data.manifest.profileRevision, avoidStairs:selection.avoidStairs,allowConditional:selection.allowConditional,originAccessId:selection.originAccessId,destinationAccessId:selection.destinationAccessId })
      .then((route) => {
        if (!current || !alive.current) return;
        if(route.source.version && route.source.version!==data.manifest.version)return;
        dispatch({ type: 'result', revision, route });
      })
      .catch((e) => {
        if (current && alive.current)
          dispatch({
            type: 'result',
            revision,
            route: { ...emptyRoute(), status: 'error', reason: String(e.message || e) },
          });
      });
    return () => {
      current = false;
    };
  }, [selection.revision, data, engineReady]);
  requestRef.current = async (explicit = false) => {
    if (document.visibilityState === 'hidden') return;
    if (explicit) tracking.current = sessionLocationEnabled = true;
    if (!tracking.current) return;
    if (explicit) {
      engine.current?.takeControl();
      user();
    }
    const revision = ++locationRevision.current,
      ticket = engine.current?.ownership.ticket(),
      activityTicket = activity.current;
    setLocation((s) => ({ ...s, status: 'requesting', reason: '正在找这台电脑的位置…' }));
    let result: LocationStatusResult;
    try {
      result = await api.mapLocate();
    } catch {
      result = {
        status: 'unavailable',
        source: 'windows-native',
        phoneConnected: false,
        reason: '这次没能找到电脑的位置，也可以自己选个起点。',
      };
    }
    if (!alive.current || revision !== locationRevision.current) return;
    if (result.fix && data)
      result = {
        ...result,
        status: classifyFix(result.fix, data.manifest.bounds, Date.now(), locationRef.current.fix),
      };
    setLocation(result);
    if (result.fix && result.status === 'fresh' && engine.current) {
      if (explicit && activityTicket === activity.current) engine.current.locate(result.fix, false, ticket);
    }
    if (
      explicit &&
      result.fix &&
      result.status === 'fresh' &&
      !engine.current &&
      activityTicket === activity.current
    )
      pendingLocate.current = { fix: result.fix, activity: activityTicket };
  };
  function stopLocation() {
    tracking.current = sessionLocationEnabled = false;
    locationRevision.current++;
    pendingLocate.current = undefined;
    engine.current?.takeControl();
    user();
    void api.mapStopLocation();
    setLocation({
      status: 'idle',
      source: 'windows-native',
      phoneConnected: false,
      reason: '已经停下这台电脑的定位，需要时再点「定位」就好。',
    });
    if (selectionRef.current.mode === 'current') dispatch({ type: 'retry' });
  }
  useEffect(() => {
    if(inline)return;
    void requestRef.current();
    const timer = setInterval(() => {
      if (['fresh', 'approximate', 'outside'].includes(locationRef.current.status)) void requestRef.current();
    }, 30000);
    const visible = () => {
      if (document.visibilityState === 'hidden') {
        locationRevision.current++;
        void api.mapStopLocation();
      } else if (locationRef.current.fix) void requestRef.current();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      locationRevision.current++;
      // The location loop owns shutdown. A deliberate handoff keeps only the
      // already authorised short-lived snapshot; acquisition still stops.
      void api.mapStopLocation({ keepSharedContext: handoffContext.current }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!engineReady) return;
    const usable =
      location.fix && data
        ? ['fresh', 'approximate'].includes(classifyFix(location.fix, data.manifest.bounds))
        : false;
    engine.current?.location(usable ? location.fix : undefined);
    const pending = pendingLocate.current;
    if (pending) {
      pendingLocate.current = undefined;
      if (pending.activity === activity.current) engine.current?.locate(pending.fix);
    }
  }, [engineReady, location]);
  useEffect(() => {
    setResultIndex(-1);
  }, [query, onlyConnected]);
  useEffect(() => {
    if (searchOpen)
      document.getElementById(`${searchId}-result-${resultIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [resultIndex]);
  function cancel(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (searchOpen) {
      setSearchOpen(false);
      search.current?.focus();
    } else if (about || help || candidates.length) {
      setAbout(false);
      setHelp(false);
      setCandidates([]);
      stage.current?.focus();
    } else if (selection.mode === 'two' && selection.stage !== 'browse') {
      dispatch({ type: 'current' });
      stage.current?.focus();
    } else onClose();
  }
  const route = selection.route,
    p = selection.destination;
  const choosingEndpoint=selection.mode==='two'&&(selection.stage==='origin'||selection.stage==='destination');
  const venue=data?.venues?.find(v=>v.id===(p||selection.origin)?.id);
  const hoverPixel =
    hover && engine.current
      ? engine.current.project(hover.coordinate)
      : undefined;
  return (
    <section
      className={`campus-v2-dialog campus-v2-surface${inline?' campus-map-inline':''}`}
      aria-label="校园地图"
      onKeyDown={(event)=>{if(event.key==='Escape')cancel(event);}}
      onKeyDownCapture={user}
    >
      <header className="campus-v2-header">
        <button
          type="button"
          className="campus-v2-return"
          aria-label={returnLabel}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
        >
          <ArrowLeft size={18} />
          <span>返回</span>
        </button>
        <div>
          <strong>校园地图</strong>
          <span>紫金港 · 校园与周边</span>
        </div>
        {reviewControls}
        <div className="campus-v2-window-actions">
          <button
            className="campus-v2-icon"
            aria-label="地图来源与覆盖范围"
            onClick={() => {
              setAbout(!about);
              setHelp(false);
            }}
          >
            <Info size={18} />
          </button>
          {!inline && <WindowControls onClose={onWindowClose} />}
        </div>
      </header>
      <div
        className="campus-v2-body"
        onPointerDown={user}
      >
        <div
          ref={stage}
          className="campus-v2-stage"
          role="application"
          tabIndex={0}
          aria-label="校园地图。方向键平移，加减缩放，Q E 旋转，中括号调整俯仰，N 回北，0 查看校园。"
        />
        <div className="campus-v2-top campus-v2-obstruction">
          <div className="campus-v2-search">
            <Search size={18} />
            <input
              ref={search}
              aria-label="搜索建筑或地点"
              role="combobox"
              aria-expanded={searchOpen}
              aria-controls={`${searchId}-results`}
              aria-autocomplete="list"
              aria-activedescendant={
                searchOpen && shown[activeResult] ? `${searchId}-result-${activeResult}` : undefined
              }
              placeholder="搜索建筑、地点"
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                user();
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSearchOpen(true);
                  setResultIndex((i) =>
                    Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
                  );
                }
                if (e.key === 'Enter' && shown[activeResult]) {
                  e.preventDefault();
                  const point = shown[activeResult];
                  chooseAndFocus(point);
                }
                if (e.key === 'Escape' && searchOpen) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSearchOpen(false);
                }
              }}
            />
            {query ? (
              <button aria-label="清空搜索" onClick={() => setQuery('')}>
                <X size={16} />
              </button>
            ) : (
              <span className="campus-v2-key">⌕</span>
            )}
          </div>
          {searchOpen && (
            <div className="campus-v2-results">
              <button
                className="campus-v2-filter"
                role="switch"
                aria-checked={onlyConnected}
                onClick={() => setOnlyConnected(!onlyConnected)}
              >
                <span>只看有入口记录的地点</span>
                {onlyConnected ? <Check size={15} /> : <span>全部</span>}
              </button>
              <div id={`${searchId}-results`} role="listbox" aria-label="地点搜索结果">
                {shown.map((point, i) => (
                  <button
                    key={point.id}
                    id={`${searchId}-result-${i}`}
                    data-place-id={point.id}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === activeResult}
                    onClick={() => {
                      chooseAndFocus(point);
                    }}
                  >
                    <span>{point.displayName}</span>
                    <small>
                      {placeSearchDetail(point)}
                    </small>
                  </button>
                ))}
              </div>
              <p>
                {results.length
                  ? `${results.length} 个匹配地点${results.length > 1 ? ' · 请选择一项，或用上下键选择' : ''}${results.length > 40 ? ' · 可继续输入缩小范围' : ''}`
                  : '图上还没找到这个名字，试试另一个叫法或附近的地点。'}
              </p>
            </div>
          )}
          <div className="campus-v2-mode">
            <button
              className={selection.mode === 'two' ? 'active' : ''}
              onClick={() => {
                user();
                dispatch({ type: selection.mode === 'two' ? 'browse' : 'two' });setCollapsed(false);
                setSearchOpen(false);
              }}
            >
              <Route size={16} />
              {selection.mode === 'two' ? '浏览地图' : '两点路线'}
            </button>
            <span aria-live="polite">
              {selection.stage === 'origin'
                ? '请选择起点 A'
                : selection.stage === 'destination'
                  ? '请选择终点 B'
                  : selection.mode === 'two'
                    ? '从这里出发 · 轻点别处更换终点'
                    : ''}
            </span>
          </div>
        </div>
        <div className="campus-v2-controls campus-v2-obstruction">
          {engineReady && engine.current?.supportsSpace && <div><button aria-label={pitch>1?'切回平面地图':'打开空间视图'} onClick={()=>{user();engine.current?.setPitch(pitch>1?0:42,true);setSpaceControls(pitch<=1);}}>{pitch>1?'平面':'空间'}</button></div>}
          <div>
            <button aria-label="定位到本机" title="定位到本机" onClick={() => void requestRef.current(true)}>
              <LocateFixed size={20} />
            </button>
            <button aria-label="地图回北" title="回北 · N" onClick={() => engine.current?.north()}>
              <span ref={compass} className="campus-v2-north">
                N<i />
              </span>
            </button>
          </div>
          <div>
            <button aria-label="放大地图" title="放大 · +" onClick={() => engine.current?.zoom(0.6)}>
              <Plus size={19} />
            </button>
            <button aria-label="缩小地图" title="缩小 · −" onClick={() => engine.current?.zoom(-0.6)}>
              <Minus size={19} />
            </button>
          </div>
          <div>
            <button
              aria-label="逆时针旋转地图"
              title="逆时针旋转 · Q"
              onClick={() => engine.current?.rotate(-Math.PI / 12)}
            >
              <RotateCcw size={17} />
            </button>
            <button
              aria-label="顺时针旋转地图"
              title="顺时针旋转 · E"
              onClick={() => engine.current?.rotate(Math.PI / 12)}
            >
              <RotateCw size={17} />
            </button>
            <button aria-label="查看校园全貌" title="查看校园 · 0" onClick={() => engine.current?.overview()}>
              <Maximize size={17} />
            </button>
          </div>
        </div>
        {spaceControls && <div className="campus-v3-pitch campus-v2-floating"><label>视角 <input aria-label="地图俯仰" type="range" min="0" max="55" step="1" value={Math.round(pitch)} onChange={e=>{user();engine.current?.setPitch(Number(e.target.value));}}/></label><button aria-label="收起视角控制" onClick={()=>setSpaceControls(false)}><X size={14}/></button></div>}
        {hover && hoverPixel && !searchOpen && (
          <div
            className="campus-v2-tooltip"
            style={{
              left: Math.max(20, Math.min((stage.current?.clientWidth || 800) - 210, hoverPixel[0] + 12)),
              top: Math.max(90, Math.min((stage.current?.clientHeight || 600) - 65, hoverPixel[1] - 32)),
            }}
          >
            {hover.displayName}
          </div>
        )}
        {candidates.length > 0 && (
          <div className="campus-v2-candidates campus-v2-floating" aria-label="请选择附近建筑">
            <strong>你想选择哪一栋？</strong>
            {candidates.map((p) => (
              <button key={p.id} onClick={() => choose(p)}>
                {p.displayName}
              </button>
            ))}
            <button onClick={() => setCandidates([])}>取消</button>
          </div>
        )}
        {loadError ? (
          <div className="campus-v2-empty" role="alert">
            <MapPinned size={28} />
            <strong>这次没能展开地图</strong>
            <p>{loadError}</p>
            <button
              onClick={() => {
                dataCache = undefined;
                setAttempt((a) => a + 1);
              }}
            >
              再打开一次
            </button>
          </div>
        ) : (
          !engineReady && (
            <div className="campus-v2-loading" role="status">
              正在展开校园地图…
            </div>
          )
        )}
        {selection.mode==='browse' && p && <section className="campus-v3-place campus-v2-route campus-v2-obstruction" aria-label="地点详情"><div><strong>{p.displayName}</strong><button aria-label={collapsed?'展开地点详情':'收起地点详情'} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'展开':'收起'}</button></div>{!collapsed&&<>{!p.graphNodeId&&<p>{placeStatusText(p)}</p>}<div className="campus-v2-route-actions">{p.kind==='water'?<button onClick={()=>{user();dispatch({type:'two'});}}>选择岸边起点</button>:<><button onClick={()=>{user();dispatch({type:'start',point:p});stage.current?.focus({preventScroll:true});}}>从这里选路</button><button onClick={()=>{user();dispatch({type:'current'});}}>从本机位置出发</button>{p.entrances.length>0&&<button onClick={()=>{setEntrances(!entrances);engine.current?.showEntrances(!entrances);}}>{entrances?'收起入口':'查看入口'}</button>}</>}</div>{venue&&<details className="campus-v3-venue"><summary>跑道与场地资料</summary><p>{venue.nominalLapBasis}</p><p>{venue.lapBasis}</p><p>{venue.markingBasis}</p><p>{venue.laneBasis}</p><p>{venue.displayBasis}</p><small>这里可以看看场地，不会记下跑步圈数。</small></details>}{p.waterBasis&&<details className="campus-v3-venue"><summary>水域与岸线资料</summary><p>{p.waterBasis}</p></details>}{(p.modelBasis||p.sourceCorrection)&&<details className="campus-v3-venue"><summary>{p.modelBasis?"建筑形态与资料":"场地资料"}</summary>{p.modelBasis&&<p>{p.modelBasis}</p>}{p.sourceCorrection&&<p>{p.sourceCorrection.basis}</p>}</details>}{p.personal?.note&&<p>{p.personal.note}</p>}</>}</section>}
        {selection.mode!=='browse' && (p || selection.origin || selection.mode === 'two') && (
          <section
            className="campus-v2-route campus-v2-obstruction"
            aria-label="路线信息"
            data-status={route.status}
            data-collapsed={collapsed}
            data-picking={choosingEndpoint}
          >
            <div className="campus-v2-endpoints">
              <button
                onClick={() => {
                  user();
                  dispatch({ type: 'origin' });
                }}
              >
                <span className="campus-v2-endpoint">A</span>
                <span>
                  {selection.mode === 'current' ? '本机位置' : mapRoutePointName(selection.origin,route.originAccess) || '选择起点'}
                </span>
              </button>
              <button className="campus-v3-swap" aria-label="交换两端" title="交换两端" disabled={!selection.origin||!p} onClick={()=>{user();dispatch({type:'swap'});}}><ArrowLeftRight size={16}/></button>
              <button
                onClick={() => {
                  user();
                  dispatch({ type: 'destination' });
                }}
              >
                <span className="campus-v2-endpoint filled">B</span>
                <span>{mapRoutePointName(p,route.destinationAccess) || '选择终点'}</span>
              </button>
              <button aria-label={preview!==undefined?'结束预览':collapsed?'展开路线信息':'收起路线信息'} onClick={()=>preview!==undefined?setPreview(undefined):setCollapsed(!collapsed)}>{preview!==undefined?'结束':collapsed?'展开':'收起'}</button>
            </div>
            {!collapsed && preview===undefined && <>
            {selectionNotice&&<p className="campus-v3-pick-hint" role="status">{selectionNotice}</p>}
            {choosingEndpoint ? <p className="campus-v3-pick-hint" role="status">{selection.stage==='origin'?'在地图上选起点 A':'再选一个地点作为终点 B'}，也可以搜索。</p> :
            <div className="campus-v2-route-main" aria-live="polite">
              <div>
                <strong>
                  {route.status === 'ready' && route.distance
                    ? routeDistanceTitle(route)
                    : route.status === 'loading'
                      ? '正在找一条路'
                      : route.status==='unknown_entrance'
                        ? '还不清楚从哪扇门进'
                      : route.status==='unreachable'
                        ? '还没找到能连起来的路'
                      : route.status==='error'
                        ? '这次没能找到路线'
                      : p
                        ? p.displayName
                        : '轻点地图上的建筑'}
                </strong>
                <p>
                  {selection.stage === 'origin'
                    ? '请选择起点 A。'
                    : route.status === 'ready'
                      ? route.distance?.connectorM ? `道路 ${distanceLabel(route.distance.networkM)} + 估算连接 ${distanceLabel(route.distance.connectorM)} · 虚线请到附近再确认` : `${route.originEntrance?.name||'道路点'} → ${route.destinationEntrance?.name||'道路点'} · ${routeHasUnverifiedPassages(route)?'含尚不确定能否走通的路':'图上已有道路中的最短路线'}`
                      : route.reason}
                </p>

              </div>
              {route.status === 'ready' && (
                <button className="campus-v2-primary" onClick={() => showWholeRoute(route)}>
                  查看全路线
                  <Maximize size={15} />
                </button>
              )}
            </div>}
            <div className="campus-v2-route-actions">
              {route.status==='ready'&&<button className="campus-v3-preview-toggle" onClick={()=>setPreview(0)}><Route size={15}/>沿路看看</button>}
              <button disabled={!selection.previous} onClick={()=>{user();dispatch({type:'undo'});}}>撤销上次选择</button>
              <button onClick={()=>{user();dispatch({type:'clear'});setPreview(undefined);}}>清除</button>
              {route.status==='error'&&<button onClick={()=>dispatch({type:'retry'})}>再找一次路线</button>}
              <button onClick={()=>setRouteDetails(!routeDetails)}>{routeDetails?'收起细节':'路线细节'}</button>
            </div>
            {route.status==='unknown_entrance'&&!!route.roadReferences?.length&&<details className="campus-v3-road-recovery">
              <summary>从附近有记录的道路选起</summary>
              <p>路线会从选中的道路开始或结束，楼门在哪还不清楚。</p>
              {route.roadReferences.map(ref=><button key={ref.endpoint+ref.point.id} onClick={()=>{user();dispatch({type:ref.endpoint==='origin'?'origin':'destination'});dispatch({type:'choose',point:ref.point});}}><span>{ref.point.displayName}</span><small>距{ref.forPlace}参考点直线约{Math.round(ref.straightM)}米 · {ref.endpoint==='origin'?'改为起点':'改为终点'}</small></button>)}
            </details>}
            {route.status==='ready'&&(selection.origin?.roadReference||p?.roadReference)&&<p className="campus-v3-road-reference-note">{selection.origin?.roadReference?'起点':'终点'}在图上有记录的道路上；从这里到楼门怎么走，还没有算进路线里。</p>}
            {routeDetails&&<div className="campus-v3-route-details">
              <label><input type="checkbox" checked={!!selection.avoidStairs} onChange={e=>dispatch({type:'options',avoidStairs:e.target.checked})}/>避开台阶</label>
              <label><input type="checkbox" checked={!!selection.allowConditional} onChange={e=>dispatch({type:'options',allowConditional:e.target.checked})}/>按假设查看尚不确定的路</label>
              {[['origin',selection.origin],['destination',p]].map(([role,value])=>{
                const place=value as MapPoint|undefined,endpoint=role as 'origin'|'destination';
                const choices=[...new Map((place?.accessCandidates||[]).flatMap(candidate=>{
                  if(candidate.entranceId){const entrance=place?.entrances.find(e=>e.id===candidate.entranceId);return entrance?[[`entrance/${entrance.id}`,entrance.name] as const]:[];}
                  return candidate.kind==='entrance'?[[candidate.id,candidate.name] as const]:[];
                })).entries()].sort((a,b)=>a[1].localeCompare(b[1],'zh-CN',{numeric:true}));
                const used=endpoint==='origin'?route.originEntrance:route.destinationEntrance;
                return place&&<div key={endpoint}><strong>{endpoint==='origin'?'出发':'抵达'} · {place.displayName}{place.undergroundStation&&used?' · '+used.name:''}</strong>{place.roadReference?<p>这里是路上的位置，到楼门怎么走还不清楚。</p>:choices.length?<label><select aria-label={endpoint==='origin'?'选择出发入口':'选择抵达入口'} value={(endpoint==='origin'?selection.originAccessId:selection.destinationAccessId)||''} onChange={e=>dispatch({type:'access',endpoint,id:e.target.value||undefined})}><option value="">比较这些有记录的入口</option>{choices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>:<p>入口在哪还不清楚。虚线绕开了图上障碍，只是估算的连接。</p>}</div>;
              })}
              {!!(selection.origin?.entrances.length||p?.entrances.length)&&<button onClick={()=>{setEntrances(!entrances);engine.current?.showEntrances(!entrances);}}>{entrances?'收起入口标记':'查看已记录入口'}</button>}
              {selection.mode==='two'&&<button onClick={()=>{user();dispatch({type:'current'});}}>从本机位置出发</button>}
              {route.warnings.map((warning,i)=><p key={i}>{warning}</p>)}
            </div>}
            {onUseContext && (!choosingEndpoint||routeDetails) && (
              <details className="campus-v2-share">
                <summary>用地点继续对话</summary>
                <p>接下来的两分钟，聊天可以参考这个起点；精确坐标仍留在这台电脑里。</p>
                <button disabled={sharing || !(selection.origin || p)} onClick={() => void useContext(false)}>
                  从「{(selection.origin || p)?.displayName || '选中的地点'}」继续对话
                  <ArrowUpRight size={14} />
                </button>
                {location.fix && ['fresh', 'approximate'].includes(location.status) && (
                  <button disabled={sharing} onClick={() => void useContext(true)}>
                    参考本机设备位置
                  </button>
                )}
                <small>电脑提供的位置只是参考。你若在别处，告诉我就好。</small>
                {shareError && <p role="alert">{shareError}</p>}
              </details>
            )}
            </>}
            {preview!==undefined&&route.status==='ready'&&<div className="campus-v3-preview">
              <label><span>{routeHasUnverifiedPassages(route)?'假设预览':'路线预览'}</span><output>{distanceLabel((route.distance?.totalM||0)*preview/100)}</output><input autoFocus aria-label="路线预览进度" type="range" min="0" max="100" value={preview} onChange={e=>setPreview(Number(e.target.value))}/><span>抵达</span></label>
            </div>}
          </section>
        )}
        <footer className="campus-v2-footer">
          <div>
            <div ref={scale} className="campus-v2-scale" style={{visibility:engineReady?'visible':'hidden'}}>
              100 m
            </div>
            <button
              className="campus-v2-attribution"
              onClick={() => { setAbout(true); setHelp(false); }}
            >
              {data?.manifest.attribution || '© OpenStreetMap contributors'} · 浙大校园资料
            </button>
          </div>
          <span ref={coverage} className="campus-v2-coverage" hidden>
            这张地图还没有画到这里
          </span>
          <button
            className="campus-v2-location-state"
            onClick={() => {
              setAbout(true);
              setHelp(false);
            }}
          >
            {locationLabel(location)}
          </button>
          <button
            className="campus-v2-help"
            aria-label="地图操作说明"
            onClick={() => {
              setHelp(!help);
              setAbout(false);
            }}
          >
            ?
          </button>
        </footer>
        {about && (
          <div className="campus-v2-about campus-v2-floating" role="region" aria-label="地图来源与覆盖范围">
            <div className="campus-v2-floating-head">
              <strong>关于这张地图</strong>
              <button aria-label="关闭地图说明" onClick={() => setAbout(false)}>
                <X size={17} />
              </button>
            </div>
            <p>
              这里是紫金港和周边已有记录的地方。建筑、水系与道路来自开放地图，地点名称和你标记的地方也会一起显示；离线也能看看校园、比较路线。
            </p>
            {data && (
              <>
                <dl>
                  <div>
                    <dt>建筑</dt>
                    <dd>{data.manifest.buildings} 栋可选</dd>
                  </div>
                  <div>
                    <dt>有记录的入口</dt>
                    <dd>{data.manifest.connectedEntrances} 个可以连到图上的路</dd>
                  </div>
                  <div>
                    <dt>能找到附近路线的建筑</dt>
                    <dd>{data.manifest.routableBuildings} 栋有入口记录或估算连接</dd>
                  </div>
                  <div>
                    <dt>地图资料日期</dt>
                    <dd>{data.manifest.sourceDate.slice(0, 10)}</dd>
                  </div>
                </dl>
                <p>
                  图上还没画出的地方，也可能有建筑和道路。门禁、施工和临时通行变化，需要到了附近再留意。
                </p>
                <p>建筑的高低，有的来自资料，有的根据层数估算，也有概括外形的示意；这里还看不到室内路线。望月公寓的轮廓来自 Overture 与 Qian Shi 等人的开放建筑资料，楼号、实际高度和入口还不清楚。东西田径场的资料写的是名义400米，不能用图上的曲线测量跑步距离。斜着看时，比例尺对应画面中心的横向地面距离。</p>
              </>
            )}
            <strong>{location.source === 'test' ? '测试位置（模拟）' : '这台 Windows 电脑的位置'}</strong>
            <p>
              {location.reason}
              {location.fix && (
                <>
                  {' '}
                  精度约 {Math.round(location.fix.accuracy)} 米，记录于{' '}
                  {new Date(location.fix.timestamp).toLocaleTimeString('zh-CN')}。
                </>
              )}
            </p>
            <p>未连接手机位置。地图关闭后停止定位，不保存轨迹。</p>
            {tracking.current && (
              <button className="campus-v2-stop-location" onClick={stopLocation}>
                停止本机定位
              </button>
            )}
            <div className="campus-v2-source-links">
              <button onClick={() => void api.openLink('https://map.zju.edu.cn/index')}>
                浙大官方地图 ↗
              </button>
              <button onClick={() => void api.openLink('https://www.openstreetmap.org/copyright')}>
                OSM · ODbL 许可 ↗
              </button>
              <button onClick={() => void api.openLink('https://docs.overturemaps.org/attribution/')}>
                建筑资料与许可 ↗
              </button>
            </div>
          </div>
        )}
        {help && (
          <div className="campus-v2-about campus-v2-floating" role="region" aria-label="地图操作说明">
            <div className="campus-v2-floating-head">
              <strong>轻轻拨动这张地图</strong>
              <button aria-label="关闭操作说明" onClick={() => setHelp(false)}>
                <X size={17} />
              </button>
            </div>
            <dl>
              <div>
                <dt>平移</dt>
                <dd>拖动或方向键</dd>
              </div>
              <div>
                <dt>缩放</dt>
                <dd>滚轮、双指或 + / −</dd>
              </div>
              <div>
                <dt>旋转</dt>
                <dd>右键拖动、双指或 Q / E；[ / ] 调俯仰</dd>
              </div>
              <div>
                <dt>回北 / 校园</dt>
                <dd>N / 0</dd>
              </div>
              <div>
                <dt>选择建筑</dt>
                <dd>点按轮廓，或搜索后 Enter</dd>
              </div>
            </dl>
            <p>
              键盘快捷键在地图获得焦点时生效。两点路线先选 A，再选 B；此后点选只更换
              B。随时拖动即可接管自动镜头。
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
export function MapSheet(props: Parameters<typeof MapSurface>[0]) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const opener=document.activeElement as HTMLElement|null;
    dialog.current?.showModal();
    return ()=>{dialog.current?.close();if(opener?.isConnected)opener.focus({preventScroll:true});};
  },[]);
  return <dialog ref={dialog} className="campus-v2-dialog" aria-label="校园地图" onCancel={event=>{event.preventDefault();props.onClose();}}><MapSurface {...props}/></dialog>;
}
function fromWgs84([lon, lat]: number[]) {
  return [(6378137 * lon * Math.PI) / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
}
function locationLabel(location: LocationStatusResult) {
  const labels: Record<LocationStatusResult['status'], string> = {
    idle: '也可以自己选个起点',
    requesting: '正在找电脑的位置',
    fresh: '这是电脑刚刚的位置',
    approximate: '电脑的位置还不够精确',
    outside: '定位落在这张地图外',
    stale: '这是之前的位置',
    denied: '还没有允许定位',
    unavailable: '这次没找到电脑的位置',
  };
  return (location.source === 'test' ? '测试 · ' : '') + labels[location.status];
}
