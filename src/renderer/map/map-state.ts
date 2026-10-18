import { emptyRoute, mapPointEndpoint, type MapPoint, type MapRouteResult, type LngLat } from '../../shared/map-v2';

/** Graph endpoints belong to the route graph, not the named-place catalog.
 * The route service validates them against the current dataset on recalculation.
 */
function rebindPoint(point: MapPoint | undefined, places: Map<string, MapPoint>) {
  if (!point) return undefined;
  return mapPointEndpoint(point).kind === 'node' ? point : places.get(point.id);
}

/** Current endpoint identity shared by the spatial and compatibility renderers. */
export class SelectedMapPoints {
  private destination?: MapPoint;
  private start?: MapPoint;
  routeRoles = true;

  get selected() { return this.destination?.id; }
  get origin() { return this.start?.id; }

  set(destination?: MapPoint, origin?: MapPoint, routeRoles = true) {
    this.destination = destination;
    this.start = origin;
    this.routeRoles = routeRoles;
  }

  point(id: string | undefined, places: Map<string, MapPoint>) {
    if (!id) return undefined;
    const supplied = this.start?.id === id ? this.start : this.destination?.id === id ? this.destination : undefined;
    return rebindPoint(supplied, places) || places.get(id) || supplied;
  }

  entries(places: Map<string, MapPoint>) {
    return (['A', 'B'] as const).flatMap(role => {
      const point = this.point(role === 'A' ? this.origin : this.selected, places);
      return point ? [{ role, point }] : [];
    });
  }

  routeEnd(role: 'A' | 'B', route: MapRouteResult | undefined, places: Map<string, MapPoint>) {
    if (!this.routeRoles || route?.status !== 'ready' || route.coordinates.length < 2) return undefined;
    const point = this.point(role === 'A' ? this.origin : this.selected, places);
    const routed = role === 'A' ? route.from : route.to;
    if (!point || !routed || point.id !== routed.id || mapPointEndpoint(point).kind !== mapPointEndpoint(routed).kind) return undefined;
    return {
      coordinate: role === 'A' ? route.coordinates[0] : route.coordinates.at(-1)!,
      access: role === 'A' ? route.originAccess : route.destinationAccess,
    };
  }
}
export interface SelectionState {
  mode: 'browse' | 'current' | 'two';
  stage: 'browse' | 'origin' | 'destination';
  origin?: MapPoint;
  destination?: MapPoint;
  route: MapRouteResult;
  revision: number;
  avoidStairs?: boolean;
  allowConditional?: boolean;
  originAccessId?: string;
  destinationAccessId?: string;
  previous?: Omit<SelectionState, 'previous'>;
}
export type SelectionAction =
  | { type: 'choose'; point: MapPoint }
  | { type: 'start'; point: MapPoint }
  | { type: 'two' }
  | { type: 'origin' }
  | { type: 'destination' }
  | { type: 'swap' }
  | { type: 'clear' }
  | { type: 'current' }
  | { type: 'retry' }
  | { type: 'browse' }
  | { type: 'undo' }
  | { type: 'options'; avoidStairs?: boolean; allowConditional?: boolean }
  | { type: 'access'; endpoint: 'origin' | 'destination'; id?: string }
  | { type: 'rebind'; places: MapPoint[] }
  | { type: 'loading'; revision: number }
  | { type: 'result'; revision: number; route: MapRouteResult };
export const initialSelection: SelectionState = {
  mode: 'browse',
  stage: 'browse',
  route: emptyRoute(),
  revision: 0,
};
export function selectionReducer(s: SelectionState, a: SelectionAction): SelectionState {
  // Every ingress shares this rule, including external places and re-entry.
  if(a.type==='choose'&&a.point.kind==='water'&&s.mode!=='browse')return s;
  if (a.type === 'result') return a.revision === s.revision ? { ...s, route: a.route } : s;
  if (a.type === 'loading')
    return a.revision === s.revision
      ? { ...s, route: { ...emptyRoute(), status: 'loading', reason: '正在查找这两个地点之间的路线…' } }
      : s;
  const { previous: _previous, ...snapshot } = s;
  const next = { ...s, previous: snapshot, revision: s.revision + 1, route: emptyRoute() };
  switch (a.type) {
    case 'start':
      return { ...next, mode: 'two', stage: a.point.kind==='water'?'origin':'destination',
        origin:a.point.kind==='water'?undefined:a.point, destination:undefined,
        originAccessId:undefined, destinationAccessId:undefined };
    case 'choose':
      return s.stage === 'origin'
        ? { ...next, origin: a.point, originAccessId: undefined, stage: s.destination ? 'browse' : 'destination' }
        : { ...next, destination: a.point, destinationAccessId: undefined, stage: 'browse' };
    case 'two':
      if(s.destination?.kind==='water')return {...next,mode:'two',stage:'origin',origin:undefined,destination:undefined,originAccessId:undefined,destinationAccessId:undefined};
      return s.origin && s.destination && s.route.status === 'ready'
        ? { ...next, mode: 'two', stage: 'browse' }
        : { ...next, mode: 'two', stage: s.destination ? 'destination' : 'origin', origin: s.destination, destination: undefined, originAccessId: undefined, destinationAccessId: undefined };
    case 'browse':
      return { ...s, mode: 'browse', stage: 'browse', revision: next.revision };
    case 'undo':
      return s.previous ? { ...s.previous, previous: snapshot, revision: next.revision, route: emptyRoute() } : s;
    case 'options':
      return { ...next, avoidStairs: a.avoidStairs ?? s.avoidStairs, allowConditional: a.allowConditional ?? s.allowConditional };
    case 'access':
      return { ...next, [a.endpoint === 'origin' ? 'originAccessId' : 'destinationAccessId']: a.id };
    case 'rebind': {
      const byId=new Map(a.places.map(p=>[p.id,p]));
      for(const p of a.places)for(const old of p.legacyIds||[])byId.set(old,p);
      return {...next,origin:rebindPoint(s.origin,byId),destination:rebindPoint(s.destination,byId)};
    }
    case 'origin':
      return { ...next, mode: 'two', stage: 'origin' };
    case 'destination':
      return { ...next, stage: 'destination' };
    case 'swap':
      return {
        ...next,
        mode: 'two',
        origin: s.destination,
        destination: s.origin,
        originAccessId: s.destinationAccessId,
        destinationAccessId: s.originAccessId,
        stage: !s.destination ? 'origin' : !s.origin ? 'destination' : 'browse',
      };
    case 'clear':
      return {
        ...initialSelection,
        mode: s.mode,
        stage: s.mode === 'two' ? 'origin' : 'browse',
        revision: next.revision,
      };
    case 'current':
      return { ...next, mode: 'current', origin: undefined, stage: 'browse' };
    case 'retry':
      return next;
  }
}
/** Every asynchronous camera suggestion carries the user's interaction generation. */
export class CameraOwnership {
  revision = 0;
  interacted = false;
  alive = true;
  private cancellations = new Set<() => void>();
  take() {
    this.interacted = true;
    return this.cancel();
  }
  /** Replacing an explanation cancels work without inventing a user gesture. */
  cancel() {
    this.revision++;
    const callbacks = [...this.cancellations];
    this.cancellations.clear();
    callbacks.forEach(cancel => cancel());
    return this.revision;
  }
  onCancel(ticket: number, cancel: () => void) {
    if (!this.accepts(ticket)) { cancel(); return () => {}; }
    this.cancellations.add(cancel);
    return () => { this.cancellations.delete(cancel); };
  }
  ticket() {
    return this.revision;
  }
  accepts(ticket: number) {
    return this.alive && ticket === this.revision;
  }
  destroy() {
    this.alive = false;
    this.cancel();
  }
}
/** Context is the same recorded road geometry. Reversed and shared edges are
 * drawn once, and the active leg always keeps the visual foreground. */
export function contextRouteSegments(active:MapRouteResult|undefined,routes:MapRouteResult[]) {
  const edgeKey=(a:LngLat,b:LngLat)=>{const left=a.join(','),right=b.join(',');return left<right?`${left};${right}`:`${right};${left}`;};
  const activeEdges=new Set((active?.status==='ready'?active.coordinates:[]).slice(1).map((b,i)=>edgeKey(active!.coordinates[i],b)));
  const edges=new Map<string,{coordinates:LngLat[];dashed:boolean;estimated:boolean}>();
  for(const route of routes){
    if(route.status!=='ready')continue;
    for(const segment of route.segments||[{coordinates:route.coordinates,kind:'network' as const}]){
      const estimated=segment.kind==='estimate',dashed=estimated||'conditions' in segment&&!!segment.conditions?.length;
      for(let i=1;i<segment.coordinates.length;i++){
        const a=segment.coordinates[i-1],b=segment.coordinates[i],key=edgeKey(a,b);if(activeEdges.has(key))continue;
        const existing=edges.get(key);if(existing){existing.dashed ||= dashed;existing.estimated ||= estimated;}
        else edges.set(key,{coordinates:[a,b],dashed,estimated});
      }
    }
  }
  return [...edges.values()];
}
