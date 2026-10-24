import type { LngLat } from '../../shared/map-v2';
import { workoutFixTime, type WorkoutSessionRecord, type WorkoutState, type WorkoutTrackPoint } from '../../shared/workout';
import type { CampusMapEngine } from './map-engine';
import { inBounds } from '../../shared/map-routing';
import { fromLonLat } from 'ol/proj';
import { mapFitInsets } from './fit-layout';

const namespace = 'http://www.w3.org/2000/svg';
const freshFor = 15_000;
type Track = { accepted: LngLat[][]; weak: LngLat[][]; splits: { kilometer: number; coordinate: LngLat }[]; current?: WorkoutTrackPoint; start?: LngLat };
function element<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string> = {}) {
  const node = document.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
function validCoordinate(coordinate: LngLat | undefined): coordinate is LngLat {
  return !!coordinate && coordinate.length === 2 && coordinate.every(Number.isFinite)
    && Math.abs(coordinate[0]) <= 180 && Math.abs(coordinate[1]) < 85;
}
function coordinate(point: WorkoutTrackPoint): LngLat { return point.quality === 'accepted' && validCoordinate(point.filteredCoordinate) ? point.filteredCoordinate : point.raw.coordinate; }
function drawable(point: WorkoutTrackPoint) {
  return (point.quality === 'accepted' || point.quality === 'accuracy' && workoutFixTime(point.raw, point.raw.receivedAt)?.fresh === true)
    && validCoordinate(coordinate(point));
}
function measuredAt(point: WorkoutTrackPoint) { return workoutFixTime(point.raw, point.raw.receivedAt)?.measuredAt.latest ?? point.raw.timestamp; }
function sameProducer(a: WorkoutTrackPoint, b: WorkoutTrackPoint) {
  return a.raw.source === b.raw.source && a.raw.deviceId === b.raw.deviceId && a.raw.clockId === b.raw.clockId
    && a.raw.provenance === b.raw.provenance && a.raw.provider === b.raw.provider;
}
function ignoredAccuracy(point: WorkoutTrackPoint, accepted: WorkoutTrackPoint | undefined) {
  // The owner keeps a weak, unselected Android provider for provenance without
  // breaking the healthy selected segment. It must not move the visible dot.
  return point.quality === 'accuracy' && accepted?.segment === point.segment && !!point.raw.provider && !!accepted.raw.provider
    && point.raw.provider !== accepted.raw.provider && point.raw.source === accepted.raw.source
    && point.raw.deviceId === accepted.raw.deviceId && point.raw.clockId === accepted.raw.clockId;
}
export function workoutMapCurrent(session: WorkoutSessionRecord | null | undefined) {
  let current: WorkoutTrackPoint | undefined, accepted: WorkoutTrackPoint | undefined;
  for (const point of session?.points || []) {
    if (ignoredAccuracy(point, accepted)) continue;
    if (point.quality === 'accepted' && drawable(point)) accepted = point;
    if (drawable(point) && (!current || measuredAt(point) > measuredAt(current))) current = point;
  }
  return current;
}
function weakEdge(a: WorkoutTrackPoint, b: WorkoutTrackPoint) {
  const dt = b.raw.timestamp - a.raw.timestamp;
  // A weak observation is visible as uncertainty, never as accepted distance.
  // Pauses, provider changes, rejected jumps and unobserved gaps get no bridge.
  return (a.quality === 'accuracy' || b.quality === 'accuracy') && drawable(a) && drawable(b) && sameProducer(a, b)
    && dt > 0 && dt <= freshFor && b.segment >= a.segment && b.segment - a.segment <= 1
    && Math.max(a.raw.accuracy ?? 0, b.raw.accuracy ?? 0) <= 500;
}
function track(session: WorkoutSessionRecord): Track {
  const accepted: LngLat[][] = [], weak: LngLat[][] = [], splits: Track['splits'] = [];
  let previous: WorkoutTrackPoint | undefined, previousAccepted: WorkoutTrackPoint | undefined, run: LngLat[] | undefined;
  let current: WorkoutTrackPoint | undefined, start: LngLat | undefined, splitIndex = 0;
  for (const point of session.points) {
    // Redundant cached reports from an unselected provider are not a gap in the selected track.
    if (point.quality === 'provider-not-selected' || point.quality === 'timestamp' || point.quality === 'stale') {
      if (previous && point.segment !== previous.segment) { previous = undefined; previousAccepted = undefined; run = undefined; }
      continue;
    }
    if (ignoredAccuracy(point, previousAccepted)) continue;
    if (drawable(point) && (!current || measuredAt(point) > measuredAt(current))) current = point;
    if (point.quality === 'accepted' && validCoordinate(coordinate(point))) {
      const c = coordinate(point);
      start ??= c;
      if (run && previous?.quality === 'accepted' && previous.segment === point.segment && sameProducer(previous, point)) run.push(c);
      else { run = [c]; accepted.push(run); }
      while (splitIndex < session.splits.length && session.splits[splitIndex].kilometer * 1000 <= point.cumulativeDistanceMeters) {
        const split = session.splits[splitIndex++], target = split.kilometer * 1000;
        if (!previousAccepted || previousAccepted.segment !== point.segment || !sameProducer(previousAccepted, point)
          || point.deltaDistanceMeters <= 0 || target <= previousAccepted.cumulativeDistanceMeters) continue;
        const a = coordinate(previousAccepted), ratio = Math.max(0, Math.min(1, (target - previousAccepted.cumulativeDistanceMeters)
          / (point.cumulativeDistanceMeters - previousAccepted.cumulativeDistanceMeters)));
        splits.push({ kilometer: split.kilometer, coordinate: [a[0] + (c[0] - a[0]) * ratio, a[1] + (c[1] - a[1]) * ratio] });
      }
      previousAccepted = point;
    } else run = undefined;
    if (previous && weakEdge(previous, point)) weak.push([coordinate(previous), coordinate(point)]);
    previous = point;
  }
  return { accepted, weak, splits, current, start };
}
function accuracyRing(point: WorkoutTrackPoint): LngLat[] {
  const accuracy = point.raw.accuracy;
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 50_000) return [];
  // The native radius is in ground metres. Project its geographic ring through
  // the same map camera, including pitch and bearing, instead of a screen circle.
  const [lon, lat] = point.raw.coordinate, angular = accuracy / 6_371_008.8, latitude = lat * Math.PI / 180;
  return Array.from({ length: 65 }, (_, index) => {
    const bearing = index / 64 * Math.PI * 2;
    const y = Math.asin(Math.sin(latitude) * Math.cos(angular) + Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing));
    const x = lon * Math.PI / 180 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude), Math.cos(angular) - Math.sin(latitude) * Math.sin(y));
    return [x * 180 / Math.PI, y * 180 / Math.PI] as LngLat;
  });
}

/** A private, disposable projection over an existing engine; it never owns a map or GPS stream. */
export class DesktopWorkoutLayer {
  private root = element('svg', { class: 'workout-map-layer', 'aria-hidden': 'true' });
  private accuracy = element('path', { class: 'workout-map-accuracy' });
  private halo = element('path', { class: 'workout-map-halo' });
  private casing = element('path', { class: 'workout-map-casing' });
  private accepted = element('path', { class: 'workout-map-accepted' });
  private weak = element('path', { class: 'workout-map-weak' });
  private splits = element('g', { class: 'workout-map-splits' });
  private start = element('circle', { class: 'workout-map-start', r: '3.5' });
  private position = element('g', { class: 'workout-map-position' });
  private session?: WorkoutSessionRecord;
  private geometry?: Track;
  private key = '';
  private cameraKey = '';
  private circle: LngLat[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private cameraFrame = 0;
  private target: HTMLElement;
  private detach: () => void;
  constructor(private engine: CampusMapEngine) {
    this.target = engine.supportsSpace ? engine.map.getContainer() : engine.map.getTargetElement();
    this.position.append(element('circle', { class: 'workout-map-pulse', r: '14' }),
      element('circle', { class: 'workout-map-dot', r: '6' }));
    this.root.append(this.accuracy, this.halo, this.casing, this.accepted, this.weak, this.start, this.splits, this.position);
    this.root.style.display = 'none';
    this.target.append(this.root);
    const render = () => this.render();
    if (engine.supportsSpace) { engine.map.on('render', render); this.detach = () => { engine.map.off('render', render); }; }
    else { engine.map.on('postrender', render); this.detach = () => { engine.map.un('postrender', render); }; }
  }
  update(state: WorkoutState | undefined) {
    const session = state?.access === 'active' && !state.pendingStop && state.session?.status !== 'cancelled' ? state.session : undefined;
    this.session = session || undefined;
    if (!session) {
      this.geometry = undefined; this.key = ''; this.cameraKey = ''; this.circle = []; this.splits.replaceChildren();
      for (const path of [this.accepted, this.weak, this.accuracy, this.halo, this.casing]) path.removeAttribute('d');
      this.position.removeAttribute('transform'); this.start.removeAttribute('transform');
      this.root.style.display = 'none'; clearTimeout(this.timer); return;
    }
    const key = `${session.id}:${session.revision}:${session.sampleRevision}`;
    if (key !== this.key) {
      this.key = key; this.geometry = track(session);
      this.circle = this.geometry.current ? accuracyRing(this.geometry.current) : [];
      this.splits.replaceChildren(...this.geometry.splits.map(split => {
        const group = element('g');
        group.append(element('circle', { r: '10' }));
        const label = element('text', { 'text-anchor': 'middle', dy: '.35em' }); label.textContent = String(split.kilometer); group.append(label);
        return group;
      }));
    }
    this.root.style.display = this.geometry?.current ? '' : 'none';
    clearTimeout(this.timer);
    const timing = this.geometry?.current && workoutFixTime(this.geometry.current.raw, Date.now(), freshFor);
    if (session.status === 'recording' && timing?.fresh && this.geometry?.current) {
      const receivedAge = Date.now() - this.geometry.current.raw.receivedAt;
      this.timer = setTimeout(() => this.render(), Math.max(1, Math.min(freshFor - timing.ageMs.latest, freshFor - receivedAge) + 1));
    }
    this.render();
  }
  private pixel(coordinate: LngLat) {
    const pixel = this.engine.project(coordinate);
    return pixel?.length === 2 && pixel.every(Number.isFinite) ? pixel : undefined;
  }
  private path(lines: LngLat[][], close = false) {
    let path = '';
    for (const line of lines) {
      let last: number[] | undefined;
      for (let index = 0; index < line.length; index++) {
        const point = this.pixel(line[index]);
        if (!point) { last = undefined; continue; }
        if (last && index < line.length - 1 && Math.hypot(point[0] - last[0], point[1] - last[1]) < .7) continue;
        path += `${last ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
        last = point;
      }
      if (close && last) path += 'Z';
    }
    return path;
  }
  private render() {
    if (!this.engine.ownership.alive || !this.session || !this.geometry || this.root.style.display === 'none') return;
    const { current, start } = this.geometry;
    const live = !!current && this.session.status === 'recording' && this.session.signal === 'good' && current.quality === 'accepted'
      && workoutFixTime(current.raw, Date.now(), freshFor)?.fresh === true;
    this.root.dataset.live = String(live);
    this.root.dataset.weak = String(current?.quality === 'accuracy');
    this.root.dataset.status = this.session.status;
    const camera = this.engine.snapshot(), cameraKey = `${this.key}:${camera.center}:${camera.resolution}:${camera.rotation}:${camera.pitch}:${this.target.clientWidth}:${this.target.clientHeight}`;
    if (cameraKey === this.cameraKey) return;
    this.cameraKey = cameraKey;
    const path = this.path(this.geometry.accepted);
    for (const node of [this.halo, this.casing, this.accepted]) node.setAttribute('d', path);
    this.weak.setAttribute('d', this.path(this.geometry.weak));
    this.accuracy.setAttribute('d', this.path([this.circle], true));
    const place = (node: SVGElement, coordinate: LngLat | undefined) => {
      const pixel = coordinate && this.pixel(coordinate);
      node.setAttribute('visibility', pixel ? 'visible' : 'hidden');
      if (pixel) node.setAttribute('transform', `translate(${pixel[0]} ${pixel[1]})`);
      return pixel;
    };
    place(this.start, start);
    const currentPixel = place(this.position, current?.raw.coordinate);
    let previousLabel: number[] | undefined;
    this.geometry.splits.forEach((split, index) => {
      const group = this.splits.children[index] as SVGGElement, pixel = place(group, split.coordinate);
      const label = group.querySelector('text')!;
      const visible = !!pixel && (!previousLabel || Math.hypot(pixel[0] - previousLabel[0], pixel[1] - previousLabel[1]) > 28)
        && (!currentPixel || Math.hypot(pixel[0] - currentPixel[0], pixel[1] - currentPixel[1]) > 24);
      group.setAttribute('data-label', String(visible));
      if (visible) previousLabel = pixel;
      label.textContent = visible ? String(split.kilometer) : '';
    });
  }
  locate() {
    const point = this.geometry?.current;
    if (!point || !inBounds(point.raw.coordinate, this.engine.data.manifest.bounds)) return;
    this.engine.locate({ coordinate: point.raw.coordinate, crs: 'EPSG:4326', timestamp: point.raw.timestamp,
      accuracy: point.raw.accuracy ?? 0, source: point.raw.provenance === 'simulated' ? 'test' : 'phone-synced', deviceLabel: point.raw.deviceLabel });
    this.target.focus({ preventScroll: true });
  }
  overview() {
    const coordinates = this.geometry?.accepted.flat().filter(coordinate => inBounds(coordinate, this.engine.data.manifest.bounds));
    if (!coordinates?.length) { this.locate(); return; }
    const ticket = this.engine.takeControl();
    cancelAnimationFrame(this.cameraFrame);
    // The panel has just closed. Measure its actual remaining obstruction after
    // React places the next frame; a gesture in between retains camera ownership.
    this.cameraFrame = requestAnimationFrame(() => {
      if (!this.engine.ownership.accepts(ticket)) return;
      if (this.engine.supportsSpace) this.engine.fitCoordinates(coordinates, ticket);
      else {
        const bounds = [Infinity, Infinity, -Infinity, -Infinity];
        for (const c of coordinates) { const [x, y] = fromLonLat(c); bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y); bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y); }
        const { top, right, bottom, left } = mapFitInsets(this.target);
        this.engine.view.fit(bounds, { padding: [top, right, bottom, left], maxZoom: 18,
          duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300 });
      }
      this.target.focus({ preventScroll: true });
    });
  }
  dispose() { clearTimeout(this.timer); cancelAnimationFrame(this.cameraFrame); this.detach(); this.root.remove(); this.session = undefined; this.geometry = undefined; this.circle = []; this.key = ''; this.cameraKey = ''; }
}
