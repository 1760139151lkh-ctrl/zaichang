import { emptyRoute, type MapPoint, type MapRouteResult } from '../../shared/map-v2';
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
      return {...next,origin:s.origin&&byId.get(s.origin.id),destination:s.destination&&byId.get(s.destination.id)};
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
  take() {
    this.interacted = true;
    return ++this.revision;
  }
  ticket() {
    return this.revision;
  }
  accepts(ticket: number) {
    return this.alive && ticket === this.revision;
  }
  destroy() {
    this.alive = false;
    this.revision++;
  }
}
