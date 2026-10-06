import { useEffect, useReducer, useRef, useState, type RefObject, type ReactNode } from 'react';
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
let savedCamera: SavedCamera | undefined;
let savedSelection: SelectionState | undefined;
let entered = false;
let sessionLocationEnabled = true;
async function loadData(signal: AbortSignal): Promise<MapData> {
  const current=await api.mapOverview();
  if(current.dataStatus==='error')throw new Error(current.dataError||'地图资料暂不可读，请重新载入。');
  if(dataCache&&dataCache.manifest.version===current.version){
    const places=dataCache.manifest.profileRevision===current.profileRevision?dataCache.places:await api.mapPlaces();
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    return dataCache={...dataCache,manifest:current,places};
  }
  const {manifest,places,geography,sports,venues}=api.mapDataJson?JSON.parse(await api.mapDataJson()):await api.mapData();
  if(manifest.dataStatus==='error')throw new Error(manifest.dataError||'地图资料暂不可读，请重新载入。');
  if (
    manifest.schemaVersion !== 'campus-map/v2' ||
    !Array.isArray(places) ||
    (geography as {type?:string}).type !== 'FeatureCollection'
  )
    throw new Error('地图数据格式无效，请重新构建数据。');
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  return (dataCache = { manifest, places, geography, sports, venues });
}
function initialState(route: MapRouteResult): SelectionState {
  if(route.to?.kind==='water')return {...initialSelection,destination:route.to};
  if(route.from?.kind==='water')return {...initialSelection,mode:'two',stage:'origin',destination:route.to};
  if (route.schemaVersion === 'map-route/v2' && route.to)
    return {
      ...initialSelection,
      mode: route.from ? 'two' : 'current',
      origin: route.from,
      destination: route.to,
      route: emptyRoute(),
    };
  if (savedSelection) return { ...savedSelection, route: emptyRoute() };
  return { ...initialSelection };
}
function distanceLabel(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} 公里` : `${Math.round(m)} 米`;
}
function routeDistanceTitle(r:MapRouteResult) {
  const d=r.distance!;
  const label=r.routeBasis==='access_estimate_dominant'?'接入估计为主':d.networkM===0&&d.connectorM>0?'接入估计':'步行';
  return `${label} ${distanceLabel(d.totalM)}`;
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
            ? `${routeDistanceTitle(r)}${r.distance.connectorM ? " · 含接入估计" : " · 已记录入口"}`
            : current
              ? r.reason
              : '地图已更新，请在新地图中重新选择地点。'}
        </small>
      </span>
      <ArrowUpRight size={18} />
    </button>
  );
}
export function MapSheet({
  initialRoute,
  onClose,
  onUseContext,
  onWindowClose,
  returnLabel = '返回对话',
  reviewScene,
  reviewControls,
}: {
  initialRoute: MapRouteResult;
  onClose: () => void;
  onWindowClose: () => void;
  onUseContext?: (value: { text: string; label: string; expiresAt: string }) => void;
  returnLabel?: string;
  reviewScene?: 'overview' | 'top-down' | 'oblique' | 'route-demo' | 'building-focus';
  reviewControls?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLDivElement>(null),
    engine = useRef<CampusMapEngine | undefined>(undefined);
  const compass = useRef<HTMLSpanElement>(null),
    scale = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    coverage = useRef<HTMLSpanElement>(null);
  const [data, setData] = useState<MapData>(),
    [loadError, setLoadError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [engineReady, setEngineReady] = useState(false);
  const dataRef=useRef(data);dataRef.current=data;
  const [selection, dispatch] = useReducer(selectionReducer, initialRoute, (r) => reviewScene === 'building-focus' && r.to ? {...initialSelection, destination:r.to} : initialState(r)),
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
  const [pitch,setPitch]=useState(savedCamera?.pitch||0),[spaceControls,setSpaceControls]=useState(false),[preview,setPreview]=useState<number|undefined>(),[routeDetails,setRouteDetails]=useState(false),[collapsed,setCollapsed]=useState(false),[entrances,setEntrances]=useState(false);
  const [selectionNotice,setSelectionNotice]=useState('');
  const reviewRouteFramed = useRef(false);
  const pitchValue=useRef(pitch);
  const [location, setLocation] = useState<LocationStatusResult>({
    status: 'idle',
    reason: sessionLocationEnabled ? '本机定位尚未开启。' : '本次会话已停止本机定位；点击定位可以重新开启。',
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
      if (!result.enabled || !result.expiresAt) throw new Error('地点参考尚未开启，请重试。');
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
  const tracking = useRef(sessionLocationEnabled);
  const alive = useRef(true),
    locationRevision = useRef(0),
    touched = useRef(false),
    first = useRef(!entered),
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
    setSelectionNotice('');
    activity.current++;
    touched.current = true;
    introDone.current = true;
    setHover(undefined);
  }
  function choose(point: MapPoint) {
    user();
    engine.current?.takeControl();
    if(point.kind==='water'&&selectionRef.current.mode!=='browse')setSelectionNotice('水域仅供浏览，请选择岸边的建筑或地点。');
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
  useEffect(() => {
    alive.current = true;
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    entered = true;
    return () => {
      alive.current = false;
      locationRevision.current++;
      savedSelection = { ...selectionRef.current, route: emptyRoute() };
      dialog.current?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
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
              savedCamera = c;
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
              if (alive.current) setEngineReady(true);
            },
            error: setLoadError,
          },
          savedCamera,
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
  useEffect(()=>()=>{engine.current?.dispose();engine.current=undefined;},[]);
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
    const current = engine.current;
    if ((reviewScene === 'oblique' || reviewScene === 'building-focus') && current.supportsSpace) {
      current.setPitch(42); current.rotate(-Math.PI / 12, false);
    }
    if (reviewScene === 'overview' || reviewScene === 'top-down') current.overview();
  }, [engineReady, reviewScene]);

  // Profile edits are local and infrequent. Refresh labels and endpoints from
  // their sole owner without recreating geometry, camera or the route task.
  useEffect(()=>{
    if(!data)return;
    let stopped=false;
    const timer=setInterval(async()=>{try{const m=await api.mapOverview();if(stopped)return;if(m.version!==data.manifest.version||m.dataStatus!==data.manifest.dataStatus){const next=api.mapDataJson?JSON.parse(await api.mapDataJson()):await api.mapData();if(!stopped){dataCache=next;setData(next);dispatch({type:'rebind',places:next.places});}return;}if(m.profileRevision===data.manifest.profileRevision)return;const places=await api.mapPlaces();if(stopped)return;data.manifest=m;data.places=places;engine.current?.updatePlaces(places);dispatch({type:'rebind',places});}catch{}},3000);
    return()=>{stopped=true;clearInterval(timer);};
  },[data]);
  useEffect(() => {
    if (engineReady) engine.current?.select(selection.destination, selection.mode==='browse'?undefined:selection.origin,selection.mode!=='browse');
  }, [engineReady, selection.destination, selection.origin,selection.mode]);
  useEffect(() => {
    if (engineReady && initialDestination.current && !touched.current) {
      const point = data?.places.find((p) => p.id === initialDestination.current);
      initialDestination.current = undefined;
      if (point) {
        introDone.current = true;
        engine.current?.focusPlace(point);
      }
    }
  }, [engineReady]);
  useEffect(() => {
    if (engineReady) engine.current?.route(selection.mode==='browse' ? emptyRoute() : selection.route);
    if (selection.mode==='browse') setPreview(undefined);
  }, [engineReady, selection.route, selection.mode]);
  useEffect(() => {
    // A new dataset disposes the old engine before the next ready render.
    // React can still run this effect with the preceding ready flag in that
    // commit. Defer the request until the current instance is actually alive.
    if (!data || !engineReady || !engine.current?.ownership.alive || !selection.destination || selection.stage === 'origin' || selection.mode==='browse') return;
    let current = true;
    const revision = selection.revision;
    dispatch({ type: 'loading', revision });
    const from =
      selection.mode === 'two' && selection.origin
        ? { kind: 'place' as const, id: selection.origin.id }
        : selection.mode === 'current' && locationRef.current.status === 'fresh'
          ? { kind: 'current' as const }
          : undefined;
    api
      .mapRoute({ from, to: { kind: 'place', id: selection.destination.id }, version: data.manifest.version, profileRevision:data.manifest.profileRevision, avoidStairs:selection.avoidStairs,allowConditional:selection.allowConditional,originAccessId:selection.originAccessId,destinationAccessId:selection.destinationAccessId })
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
    setLocation((s) => ({ ...s, status: 'requesting', reason: '正在获取这台电脑的位置…' }));
    let result: LocationStatusResult;
    try {
      result = await api.mapLocate();
    } catch {
      result = {
        status: 'unavailable',
        source: 'windows-native',
        phoneConnected: false,
        reason: '本机定位暂不可用；可以手动选择起点。',
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
      reason: '本次会话已停止本机定位；点击定位可以重新开启。',
    });
    if (selectionRef.current.mode === 'current') dispatch({ type: 'retry' });
  }
  useEffect(() => {
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
      document.getElementById(`campus-result-${resultIndex}`)?.scrollIntoView({ block: 'nearest' });
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
    <dialog
      ref={dialog}
      className="campus-v2-dialog"
      aria-label="校园地图"
      onCancel={cancel}
      onKeyDownCapture={() => {
        activity.current++;
        touched.current = true;
      }}
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
          <WindowControls onClose={onWindowClose} />
        </div>
      </header>
      <div
        className="campus-v2-body"
        onPointerDown={() => {
          activity.current++;
          touched.current = true;
        }}
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
              aria-controls="campus-search-results"
              aria-autocomplete="list"
              aria-activedescendant={
                searchOpen && shown[activeResult] ? `campus-result-${activeResult}` : undefined
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
                <span>只看有已记录入口的地点</span>
                {onlyConnected ? <Check size={15} /> : <span>全部</span>}
              </button>
              <div id="campus-search-results" role="listbox" aria-label="地点搜索结果">
                {shown.map((point, i) => (
                  <button
                    key={point.id}
                    id={`campus-result-${i}`}
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
                      {point.kind === 'facility' ? '运动场地' : point.kind==='water' ? '水域 · 仅供浏览' : point.geometryStatus==='reference-point' ? (point.source.url==='local-personal-profile'||point.personal?.referencePoint?'个人标记 · 入口待核':'官方参考位置 · 轮廓待核') : point.kind === 'area'
                        ? '片区'
                        : point.entrances.some((e) => e.connected)
                          ? '建筑 · 入口已连接'
                          : point.accessCandidates?.length ? '建筑 · 接入估计，门待核' : '建筑 · 接入待核实'}
                    </small>
                  </button>
                ))}
              </div>
              <p>
                {results.length
                  ? `${results.length} 个匹配地点${results.length > 1 ? ' · 请选择一项，或用上下键选择' : ''}${results.length > 40 ? ' · 可继续输入缩小范围' : ''}`
                  : '没有找到这个名称；不代表地点不存在。'}
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
                    ? '起点已固定 · 点选更换终点'
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
            <strong>地图暂未载入</strong>
            <p>{loadError}</p>
            <button
              onClick={() => {
                dataCache = undefined;
                setAttempt((a) => a + 1);
              }}
            >
              重新载入
            </button>
          </div>
        ) : (
          !engineReady && (
            <div className="campus-v2-loading" role="status">
              正在展开校园地图…
            </div>
          )
        )}
        {selection.mode==='browse' && p && <section className="campus-v3-place campus-v2-route campus-v2-obstruction" aria-label="地点详情"><div><strong>{p.displayName}</strong><button aria-label="收起地点详情" onClick={()=>setCollapsed(!collapsed)}>{collapsed?'展开':'收起'}</button></div>{!collapsed&&<><p>{p.roadReference?'已记录道路上的参考点；楼门仍待核实':p.kind==='water'?'水域仅供浏览；选岸边地点可比较路线':p.kind==='facility'?'场馆与相邻道路':p.geometryStatus==='reference-point'?(p.modelBasis?'建筑形态为示意；地面位置与入口待核实':p.source.url==='local-personal-profile'||p.personal?.referencePoint?'个人标记的位置；具体入口待核实':'官方参考位置，建筑轮廓尚未对应'):p.entrances.some(e=>e.connected)?'有已记录入口，可直接比较路线':p.accessCandidates?.length?'可以查看到附近的路线；实际门待核实':'入口位置尚待核实'}</p><div className="campus-v2-route-actions">{p.kind==='water'?<button onClick={()=>{user();dispatch({type:'two'});}}>选择岸边起点</button>:<><button onClick={()=>{user();dispatch({type:'two'});}}>从这里选路</button><button onClick={()=>{user();dispatch({type:'current'});}}>从本机位置出发</button>{p.entrances.length>0&&<button onClick={()=>{setEntrances(!entrances);engine.current?.showEntrances(!entrances);}}>{entrances?'收起入口':'查看入口'}</button>}</>}</div>{venue&&<details className="campus-v3-venue"><summary>跑道与场地资料</summary><p>{venue.nominalLapBasis}</p><p>{venue.lapBasis}</p><p>{venue.markingBasis}</p><p>{venue.laneBasis}</p><p>{venue.displayBasis}</p><small>未记录跑步，不生成圈数或完成状态。</small></details>}{p.waterBasis&&<details className="campus-v3-venue"><summary>水域与岸线资料</summary><p>{p.waterBasis}</p></details>}{(p.modelBasis||p.sourceCorrection)&&<details className="campus-v3-venue"><summary>{p.modelBasis?"建筑形态与资料":"场地资料"}</summary>{p.modelBasis&&<p>{p.modelBasis}</p>}{p.sourceCorrection&&<p>{p.sourceCorrection.basis}</p>}</details>}{p.personal?.note&&<p>{p.personal.note}</p>}</>}</section>}
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
                  {selection.mode === 'current' ? '本机位置' : selection.origin?.displayName || '选择起点'}
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
                <span>{p?.displayName || '选择终点'}</span>
              </button>
              <button aria-label={collapsed?'展开路线信息':'收起路线信息'} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'展开':'收起'}</button>
            </div>
            {!collapsed && <>
            {selectionNotice&&<p className="campus-v3-pick-hint" role="status">{selectionNotice}</p>}
            {choosingEndpoint ? <p className="campus-v3-pick-hint" role="status">{selection.stage==='origin'?'在地图上选起点 A':'再选一个地点作为终点 B'}，也可以搜索。</p> :
            <div className="campus-v2-route-main" aria-live="polite">
              <div>
                <strong>
                  {route.status === 'ready' && route.distance
                    ? routeDistanceTitle(route)
                    : route.status === 'loading'
                      ? '正在计算路线'
                      : route.status==='unknown_entrance'
                        ? '道路接入待核实'
                      : route.status==='unreachable'
                        ? '暂未找到连通路线'
                      : route.status==='error'
                        ? '路线暂不可用'
                      : p
                        ? p.displayName
                        : '轻点地图上的建筑'}
                </strong>
                <p>
                  {selection.stage === 'origin'
                    ? '请选择起点 A。'
                    : route.status === 'ready'
                      ? route.distance?.connectorM ? `道路 ${distanceLabel(route.distance.networkM)} + 接入估计 ${distanceLabel(route.distance.connectorM)} · 虚线处门待核` : `${route.originEntrance?.name||'道路点'} → ${route.destinationEntrance?.name||'道路点'} · 已记录路网内最短`
                      : route.reason}
                </p>

              </div>
              {route.status === 'ready' && (
                <button className="campus-v2-primary" onClick={() => engine.current?.fitRoute(route)}>
                  查看全路线
                  <Maximize size={15} />
                </button>
              )}
            </div>}
            <div className="campus-v2-route-actions">
              {route.status==='ready'&&<button className="campus-v3-preview-toggle" onClick={()=>{const next=preview===undefined?0:undefined;setPreview(next);engine.current?.preview(next===undefined?undefined:next/100);}}><Route size={15}/>{preview===undefined?'沿路看看':'结束预览'}</button>}
              <button disabled={!selection.previous} onClick={()=>{user();dispatch({type:'undo'});}}>撤销上次选择</button>
              <button onClick={()=>{user();dispatch({type:'clear'});setPreview(undefined);}}>清除</button>
              {route.status==='error'&&<button onClick={()=>dispatch({type:'retry'})}>重试路线</button>}
              <button onClick={()=>setRouteDetails(!routeDetails)}>{routeDetails?'收起细节':'路线细节'}</button>
            </div>
            {route.status==='unknown_entrance'&&!!route.roadReferences?.length&&<details className="campus-v3-road-recovery">
              <summary>选附近已记录的道路点</summary>
              <p>路线会从所选道路点开始或结束；楼门仍待核实。</p>
              {route.roadReferences.map(ref=><button key={ref.endpoint+ref.point.id} onClick={()=>{user();dispatch({type:ref.endpoint==='origin'?'origin':'destination'});dispatch({type:'choose',point:ref.point});}}><span>{ref.point.displayName}</span><small>距{ref.forPlace}参考点直线约{Math.round(ref.straightM)}米 · {ref.endpoint==='origin'?'改为起点':'改为终点'}</small></button>)}
            </details>}
            {route.status==='ready'&&(selection.origin?.roadReference||p?.roadReference)&&<p className="campus-v3-road-reference-note">{selection.origin?.roadReference?'起点':'终点'}位于已记录道路上；这段路线不包含到楼门的未知连接。</p>}
            {preview!==undefined&&route.status==='ready'&&<div className="campus-v3-preview">
              <label><span>路线预览</span><output>{distanceLabel((route.distance?.totalM||0)*preview/100)}</output><input aria-label="路线预览进度" type="range" min="0" max="100" value={preview} onChange={e=>{const v=Number(e.target.value);setPreview(v);engine.current?.preview(v/100);}}/><span>抵达</span></label>
              <small>拖动，查看沿途走法。空心点是预览，相机保持当前视角。</small>
            </div>}
            {routeDetails&&<div className="campus-v3-route-details">
              <label><input type="checkbox" checked={!!selection.avoidStairs} onChange={e=>dispatch({type:'options',avoidStairs:e.target.checked})}/>避开台阶</label>
              <label><input type="checkbox" checked={!!selection.allowConditional} onChange={e=>dispatch({type:'options',allowConditional:e.target.checked})}/>作为假设查看待核通路</label>
              {[['origin',selection.origin],['destination',p]].map(([role,value])=>{const place=value as MapPoint|undefined;const endpoint=role as 'origin'|'destination';const choices=place?.accessCandidates?.filter(a=>a.kind==='entrance')||[];return place&&<div key={endpoint}><strong>{endpoint==='origin'?'出发':'抵达'} · {place.displayName}</strong>{place.roadReference?<p>已记录的道路点，未把它当作楼门。</p>:choices.length?<label>入口 <select aria-label={endpoint==='origin'?'选择出发入口':'选择抵达入口'} value={(endpoint==='origin'?selection.originAccessId:selection.destinationAccessId)||''} onChange={e=>dispatch({type:'access',endpoint,id:e.target.value||undefined})}><option value="">比较全部合格入口</option>{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>:<p>实际门未核实；虚线只表示避障接入估计。</p>}</div>;})}
              <button onClick={()=>{setEntrances(!entrances);engine.current?.showEntrances(!entrances);}}>{entrances?'收起入口标记':'查看已记录入口'}</button>
              {selection.mode==='two'&&<button onClick={()=>{user();dispatch({type:'current'});}}>从本机位置出发</button>}
              {route.warnings.map((warning,i)=><p key={i}>{warning}</p>)}
            </div>}
            {onUseContext && (!choosingEndpoint||routeDetails) && (
              <details className="campus-v2-share">
                <summary>用地点继续对话</summary>
                <p>只在接下来两分钟允许参考这处起点，精确坐标留在本机。</p>
                <button disabled={sharing || !(selection.origin || p)} onClick={() => void useContext(false)}>
                  从「{(selection.origin || p)?.displayName || '选中的地点'}」继续对话
                  <ArrowUpRight size={14} />
                </button>
                {location.fix && ['fresh', 'approximate'].includes(location.status) && (
                  <button disabled={sharing} onClick={() => void useContext(true)}>
                    参考本机设备位置
                  </button>
                )}
                <small>设备报告位置不等于你本人所在地；你的陈述优先。</small>
                {shareError && <p role="alert">{shareError}</p>}
              </details>
            )}
            </>}
          </section>
        )}
        <footer className="campus-v2-footer">
          <div>
            <div ref={scale} className="campus-v2-scale" style={{visibility:engineReady?'visible':'hidden'}}>
              100 m
            </div>
            <button
              className="campus-v2-attribution"
              onClick={() => void api.openLink('https://www.openstreetmap.org/copyright')}
            >
              © OpenStreetMap contributors · 场地参考浙大校园资料
            </button>
          </div>
          <span ref={coverage} className="campus-v2-coverage" hidden>
            此处超出数据覆盖范围
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
              紫金港与已记录的周边。建筑、水系与道路来自开放地理数据；地点名称与个人绑定读取共同活动配置，地图可离线浏览和规划。
            </p>
            {data && (
              <>
                <dl>
                  <div>
                    <dt>建筑</dt>
                    <dd>{data.manifest.buildings} 栋可选</dd>
                  </div>
                  <div>
                    <dt>可用入口</dt>
                    <dd>{data.manifest.connectedEntrances} 个已连接路网</dd>
                  </div>
                  <div>
                    <dt>接入覆盖</dt>
                    <dd>{data.manifest.routableBuildings} 栋有入口或避障估计</dd>
                  </div>
                  <div>
                    <dt>数据时间</dt>
                    <dd>{data.manifest.sourceDate.slice(0, 10)}</dd>
                  </div>
                </dl>
                <p>
                  未记录的建筑与道路没有用虚构图形补齐。地图之外仍可能有道路；现实门禁、施工和未标注限制不在本地快照内。
                </p>
                <p>建筑体量区分源高度、层数估计和按原设计／影像简化的模型；没有室内路线。气膜馆约18米来自学校介绍；月牙楼的坡面与双塔为有依据的简化表达，尺寸未实测。东西田径场资料记载名义400米；显示曲线不是认证测量线。倾斜视图的比例尺对应视野中心的横向地面。</p>
              </>
            )}
            <strong>{location.source === 'test' ? '测试位置（模拟）' : '这台 Windows 电脑的位置'}</strong>
            <p>
              {location.reason}
              {location.fix && (
                <>
                  {' '}
                  精度约 {Math.round(location.fix.accuracy)} 米，采集于{' '}
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
    </dialog>
  );
}
function fromWgs84([lon, lat]: number[]) {
  return [(6378137 * lon * Math.PI) / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
}
function locationLabel(location: LocationStatusResult) {
  const labels: Record<LocationStatusResult['status'], string> = {
    idle: '可手动选择起点',
    requesting: '正在获取本机位置',
    fresh: '本机位置已更新',
    approximate: '本机位置精度较低',
    outside: '本机位置在范围外',
    stale: '位置已过期',
    denied: '定位未获授权',
    unavailable: '本机定位暂不可用',
  };
  return (location.source === 'test' ? '测试 · ' : '') + labels[location.status];
}
