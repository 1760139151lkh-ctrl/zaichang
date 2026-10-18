import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Expand, MapPinned, Pause, Play, Route, X } from 'lucide-react';
import type { MapScene, SemanticSelection } from '../../shared/scenes';
import { emptyRoute, routeHasUnverifiedPassages, type MapPoint } from '../../shared/map-v2';
import { MapSurface, type MapSurfaceMemory } from './CampusMap';
import type { CampusMapEngine } from './map-engine';
import './conversation-map.css';

interface ViewMemory extends MapSurfaceMemory {
  legId?: string;
  sourceLegId?: string;
  collapsed?: boolean;
  manual?: boolean;
  selected?: MapPoint;
  cameraRequestId?: string;
  display?: string;
}
const views = new Map<string, ViewMemory>();
export function clearConversationMapViews() {
  views.clear();
}
function viewMemory(key: string, continuationKey?: string): ViewMemory {
  let value = views.get(key);
  if (!value) {
    value = continuationKey && views.has(continuationKey) ? structuredClone(views.get(continuationKey)!) : {};
    views.set(key, value);
    while (views.size > 96) views.delete(views.keys().next().value!);
  }
  return value;
}
function distance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} 公里` : `${Math.round(m)} 米`;
}

/** A scene's fact snapshot is immutable. Only its local camera/preview/selection is saved here. */
export function ConversationMap({
  scene: snapshot,
  memoryKey = snapshot.id,
  continuationKey,
  onSelect,
  onContinue,
  historical = false,
  cancelled = false,
  interruptionKey,
  active = true,
  allowCameraRequests = true,
}: {
  scene: MapScene;
  memoryKey?: string;
  continuationKey?: string;
  onSelect: (selection: SemanticSelection) => void;
  onContinue?: () => void;
  historical?: boolean;
  cancelled?: boolean;
  interruptionKey?: string;
  active?: boolean;
  allowCameraRequests?: boolean;
}) {
  // IPC publishes a cloned message at every text update; equal scene versions
  // retain their fact object so streaming prose cannot restart map effects.
  const scene = useMemo(() => snapshot, [snapshot.id, snapshot.revision]);
  const memory = useRef(viewMemory(memoryKey, continuationKey)).current;
  const userCameraRequest =
    allowCameraRequests &&
    !historical &&
    !!scene.cameraUserRequested &&
    !!scene.cameraRequestId &&
    memory.cameraRequestId !== scene.cameraRequestId;
  const canApplyDisplay = scene.display === 'compact' || !memory.manual || userCameraRequest;
  const [collapsed, setCollapsed] = useState(
      userCameraRequest && scene.display !== 'compact'
        ? false
        : scene.display && scene.display !== memory.display && canApplyDisplay
          ? scene.display === 'compact'
          : !!memory.collapsed,
    ),
    [focused, setFocused] = useState(false);
  const [legId, setLegId] = useState(
      memory.sourceLegId !== scene.activeLegId ? scene.activeLegId : memory.legId || scene.activeLegId,
    ),
    [selected, setSelected] = useState(memory.selected);
  const [ready, setReady] = useState(false),
    [explaining, setExplaining] = useState(false),
    [progress, setProgress] = useState<number>(),
    [playing, setPlaying] = useState(false);
  const [entrances, setEntrances] = useState(false);
  const engine = useRef<CampusMapEngine | undefined>(undefined),
    container = useRef<HTMLElement>(null),
    expandButton = useRef<HTMLButtonElement>(null);
  const prior = useRef({ revision: scene.revision, intent: scene.cameraIntent });
  const motionRequest = useRef(0);
  const previousInterruption = useRef(interruptionKey);
  const effectiveLegId = memory.sourceLegId !== scene.activeLegId ? scene.activeLegId : legId;
  const leg =
    scene.journey.legs.find((value) => value.id === effectiveLegId) ||
    scene.journey.legs.find((value) => value.id === scene.activeLegId) ||
    scene.journey.legs[0];
  const browseRoute = useMemo(() => ({ ...emptyRoute(), to: scene.place }), [scene.place]);
  const route = leg?.route || browseRoute;
  const previewRoute = useRef(route);
  const changedRoute = previewRoute.current !== route;
  const total = scene.journey.legs.reduce((sum, value) => sum + (value.route.distance?.totalM || 0), 0);
  const dwell = scene.journey.stops.reduce((sum, value) => sum + (value.dwellMinutes || 0), 0);
  const valid = scene.journey.legs.every((value) => value.route.status === 'ready');
  useEffect(() => {
    if (memory.sourceLegId !== scene.activeLegId) {
      memory.sourceLegId = scene.activeLegId;
      memory.legId = scene.activeLegId;
      setLegId(scene.activeLegId);
      setProgress(undefined);
      setPlaying(false);
    }
    if (scene.display && memory.display !== scene.display) {
      memory.display = scene.display;
      if (scene.display === 'compact' || !memory.manual || userCameraRequest) {
        memory.collapsed = scene.display === 'compact';
        setCollapsed(memory.collapsed);
      }
      if (memory.collapsed) {
        engine.current?.cancelMotion();
        setPlaying(false);
      }
    }
    if (userCameraRequest && scene.display !== 'compact') {
      memory.collapsed = false;
      setCollapsed(false);
    }
  }, [scene.activeLegId, scene.display, memory, userCameraRequest]);
  useEffect(() => {
    if (!focused) return;
    const previous = document.activeElement as HTMLElement | null;
    const siblings: HTMLElement[] = [];
    let node: HTMLElement | null = container.current;
    while (node?.parentElement) {
      for (const sibling of node.parentElement.children)
        if (sibling !== node && sibling instanceof HTMLElement) siblings.push(sibling);
      node = node.parentElement;
      if (node === document.body) break;
    }
    const old = siblings.map((value) => value.inert);
    siblings.forEach((value) => (value.inert = true));
    container.current
      ?.querySelector<HTMLButtonElement>('.conversation-map-expand')
      ?.focus({ preventScroll: true });
    return () => {
      siblings.forEach((value, index) => (value.inert = old[index]));
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [focused]);
  useEffect(() => {
    if (!ready || !engine.current || !route) return;
    const changed = prior.current.revision !== scene.revision;
    const requested = !!scene.cameraRequestId && memory.cameraRequestId !== scene.cameraRequestId;
    prior.current = { revision: scene.revision, intent: scene.cameraIntent };
    if (!allowCameraRequests) {
      memory.cameraRequestId = scene.cameraRequestId;
      return;
    }
    if ((!changed && !requested) || historical) return;
    if (requested && memory.manual && !scene.cameraUserRequested) {
      memory.cameraRequestId = scene.cameraRequestId;
      return;
    }
    if (!requested) {
      if (!memory.manual && scene.cameraIntent === 'route') engine.current.fitRoute(route);
      return;
    }
    memory.cameraRequestId = scene.cameraRequestId;
    setPlaying(false);
    setProgress(undefined);
    if (scene.cameraIntent === 'explain') {
      void explain();
    } else if (scene.cameraIntent === 'overview') {
      engine.current.overview();
      memory.manual = false;
    } else if (scene.cameraIntent === 'destination' && route.to) {
      engine.current.focusPlace(route.to);
      memory.manual = false;
    } else if (scene.cameraIntent === 'selection' && scene.focusPlaceId) {
      const current = engine.current,
        ticket = current.ownership.ticket();
      void window.zaichang
        .mapPlaces()
        .then((places) => {
          const point = places.find((value) => value.id === scene.focusPlaceId);
          if (
            point &&
            engine.current === current &&
            current.ownership.accepts(ticket) &&
            prior.current.revision === scene.revision
          ) {
            current.focusPlace(point);
            memory.manual = false;
          }
        })
        .catch(() => {});
    } else if (requested || !memory.manual) engine.current.fitRoute(route);
  }, [
    ready,
    scene.revision,
    scene.cameraIntent,
    scene.cameraRequestId,
    scene.focusPlaceId,
    historical,
    route,
    memory,
    allowCameraRequests,
  ]);
  useEffect(() => {
    if (changedRoute) {
      previewRoute.current = route;
      setPlaying(false);
      setProgress(undefined);
      engine.current?.preview(undefined);
    }
  }, [route, changedRoute]);
  useEffect(() => {
    if (ready && !changedRoute) engine.current?.preview(progress === undefined ? undefined : progress / 100);
  }, [ready, progress, route, changedRoute]);
  useEffect(() => {
    if (ready) engine.current?.showEntrances(entrances);
  }, [ready, entrances]);
  useEffect(() => {
    if (ready)
      engine.current?.contextRoutes(
        scene.journey.legs.filter((value) => value.id !== leg?.id).map((value) => value.route),
      );
  }, [ready, scene, leg?.id]);
  useEffect(() => {
    if (cancelled || previousInterruption.current !== interruptionKey) {
      motionRequest.current++;
      engine.current?.cancelMotion();
      setPlaying(false);
      setExplaining(false);
    }
    previousInterruption.current = interruptionKey;
  }, [ready, cancelled, interruptionKey]);
  useEffect(() => {
    if (!playing || progress === undefined || !route) return;
    const current = engine.current,
      ticket = current?.ownership.ticket();
    let frame = 0,
      last = performance.now();
    const duration = Math.max(5000, Math.min(18000, (route.distance?.totalM || 500) * 10));
    const tick = (now: number) => {
      if (!current || ticket === undefined || !current.ownership.accepts(ticket)) {
        setPlaying(false);
        return;
      }
      const step = ((now - last) / duration) * 100;
      last = now;
      setProgress((value) => {
        const next = Math.min(100, (value || 0) + step);
        if (next === 100) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, progress === undefined, route]);
  function takeControl() {
    motionRequest.current++;
    memory.manual = true;
    setExplaining(false);
    setPlaying(false);
  }
  function choose(point: MapPoint) {
    memory.selected = point;
    setSelected(point);
    onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'place', placeId: point.id });
  }
  async function explain() {
    if (!route || !engine.current) return;
    const request = ++motionRequest.current;
    setPlaying(false);
    setProgress(undefined);
    memory.manual = false;
    setExplaining(true);
    await engine.current.explainRoute(route);
    if (request === motionRequest.current) setExplaining(false);
  }
  function pickLeg(id: string) {
    const next = scene.journey.legs.find((value) => value.id === id);
    if (!next) return;
    setLegId(id);
    memory.legId = id;
    memory.manual = false;
    setSelected(undefined);
    setPlaying(false);
    setProgress(undefined);
    engine.current?.takeControl();
    engine.current?.route(next.route);
    engine.current?.select(next.route.to, next.route.from, true);
    engine.current?.fitRoute(next.route);
    onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'leg', legId: id });
  }
  function collapse() {
    memory.manual = true;
    engine.current?.cancelMotion();
    setPlaying(false);
    memory.collapsed = !collapsed;
    setCollapsed(!collapsed);
  }
  return (
    <section
      ref={container}
      className="conversation-map"
      data-focused={focused}
      data-collapsed={collapsed}
      role={focused ? 'dialog' : undefined}
      aria-modal={focused || undefined}
      aria-label="对话中的校园地图"
      onKeyDown={(event) => {
        if (!focused) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          engine.current?.cancelMotion();
          setFocused(false);
        }
        if (event.key === 'Tab') {
          const items = Array.from(
            container.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]',
            ) || [],
          ).filter((value) => value.offsetParent !== null);
          const first = items[0],
            last = items.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header className="conversation-map-heading">
        <span className="conversation-map-heading-icon">
          <MapPinned size={19} />
        </span>
        <div>
          <strong>
            {scene.journey.stops.map((stop) => stop.label).join(' → ') ||
              scene.place?.displayName ||
              '紫金港 · 校园与周边'}
          </strong>
          <small>
            {historical ? '当时的路线 · ' : ''}
            {!leg
              ? ''
              : valid
                ? `${distance(total)}${scene.journey.estimate ? ` · 道路约 ${scene.journey.estimate.walkingMinutes.min}–${scene.journey.estimate.walkingMinutes.max} 分钟` : ''}${dwell ? ` · 停留 ${dwell} 分钟` : ''}`
                : '部分路段待核实'}
          </small>
        </div>
        <button
          ref={expandButton}
          className="conversation-map-expand"
          aria-label={focused ? '返回对话' : '聚焦查看地图'}
          onClick={() => {
            engine.current?.cancelMotion();
            setFocused(!focused);
          }}
        >
          {focused ? <X size={18} /> : <Expand size={17} />}
        </button>
        {!focused && (
          <button aria-label={collapsed ? '展开对话地图' : '收起对话地图'} onClick={collapse}>
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        )}
      </header>
      {!collapsed && (
        <>
          <div className="conversation-map-canvas">
            {active ? (
              <MapSurface
                initialRoute={route}
                inline
                memory={memory}
                onWindowClose={() => {}}
                onClose={() => setFocused(false)}
                onChoose={choose}
                onTakeControl={takeControl}
                onEngine={(value) => {
                  engine.current = value;
                  setReady(!!value);
                }}
              />
            ) : (
              <div className="conversation-map-rest" aria-label="保留的校园地图视图" />
            )}
          </div>
          {!!leg && (
            <div className="conversation-map-journey" aria-label="旅程停靠顺序">
              {scene.journey.stops.map((stop, index) => (
                <span key={stop.id} className="conversation-map-stop">
                  <button
                    aria-label={`查看第${index + 1}站 ${stop.label}`}
                    aria-pressed={leg?.toStopId === stop.id || (index === 0 && leg === scene.journey.legs[0])}
                    onClick={() => {
                      const target = scene.journey.legs[Math.max(0, index - 1)];
                      if (target) pickLeg(target.id);
                    }}
                  >
                    <i>{index + 1}</i>
                    {stop.label}
                    {!!stop.dwellMinutes && <small>{stop.dwellMinutes} 分钟</small>}
                  </button>
                  {index < scene.journey.legs.length && (
                    <button
                      className="conversation-map-leg"
                      aria-label={`查看${stop.label}到${scene.journey.stops[index + 1]?.label}的路段`}
                      aria-pressed={leg?.id === scene.journey.legs[index].id}
                      onClick={() => pickLeg(scene.journey.legs[index].id)}
                    >
                      {scene.journey.legs[index].route.distance
                        ? distance(scene.journey.legs[index].route.distance!.totalM)
                        : '待核'}{' '}
                      →
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="conversation-map-caption">
            <div>
              {selected ? (
                <strong>关于「{selected.displayName}」</strong>
              ) : leg ? (
                <span>
                  {route.from?.displayName} <span aria-hidden="true">→</span> {route.to?.displayName}
                </span>
              ) : (
                <span>{scene.place?.displayName || '紫金港校园'}</span>
              )}
              <small>
                {!leg
                  ? ''
                  : route.status !== 'ready'
                    ? route.reason
                    : routeHasUnverifiedPassages(route)
                      ? '含待核通路，按假设查看'
                      : route.distance?.connectorM
                        ? '虚线为接入估计，实际入口待核'
                        : '沿已记录的步行路网'}
              </small>
            </div>
            {!!leg && (
              <>
                <button
                  disabled={!ready || route.status !== 'ready'}
                  onClick={() => (explaining ? engine.current?.cancelMotion() : void explain())}
                >
                  <Route size={15} />
                  {explaining ? '停止讲解' : '讲解这段路'}
                </button>
                <button
                  disabled={!ready || route.status !== 'ready'}
                  aria-label={playing ? '暂停路线预览' : '播放路线预览'}
                  onClick={() => {
                    memory.manual = true;
                    engine.current?.cancelMotion();
                    if (progress === undefined || progress === 100) setProgress(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button
                  aria-label="回到这段路线"
                  disabled={!ready}
                  onClick={() => {
                    memory.manual = false;
                    engine.current?.fitRoute(route);
                  }}
                >
                  回到路线
                </button>
              </>
            )}
            {!leg && selected && <button onClick={() => choose(selected)}>聊聊这里</button>}
          </div>
          {!!leg && (
            <details className="conversation-map-evidence">
              <summary>入口与路线依据</summary>
              <div>
                <p>
                  {route.from?.displayName}：{route.originEntrance?.name || '实际入口待核'}
                  <br />
                  {route.to?.displayName}：{route.destinationEntrance?.name || '实际入口待核'}
                </p>
                {route.warnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
                <p>
                  地图资料：{scene.source.sourceDate?.slice(0, 10) || '见地图来源'}。
                  {scene.journey.estimate?.estimatedAccessM ? '时间估计另计接入、楼内和现场通行。' : ''}
                </p>
                <button
                  disabled={!ready}
                  onClick={() => {
                    setEntrances(!entrances);
                    engine.current?.showEntrances(!entrances);
                  }}
                >
                  {entrances ? '收起入口标记' : '在图上查看已记录入口'}
                </button>
              </div>
            </details>
          )}
          {progress !== undefined && (
            <div className="conversation-map-preview">
              <span>路线预览 · 非当前位置</span>
              <input
                aria-label="旅程预览进度"
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={progress}
                onChange={(event) => {
                  memory.manual = true;
                  setPlaying(false);
                  setProgress(Number(event.target.value));
                }}
              />
              <button
                onClick={() => {
                  setPlaying(false);
                  setProgress(undefined);
                }}
              >
                结束
              </button>
            </div>
          )}
          {focused && (
            <button
              className="conversation-map-continue"
              onClick={() => {
                setFocused(false);
                onContinue?.();
              }}
            >
              回到对话，接着聊
            </button>
          )}
        </>
      )}
    </section>
  );
}
