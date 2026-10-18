import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Layer from 'ol/layer/Layer';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import { Fill, Stroke, Style, Text, Circle as CircleStyle } from 'ol/style';
import { Point, LineString, Polygon, MultiPolygon, MultiPoint, Circle as CircleGeometry } from 'ol/geom';
import type Geometry from 'ol/geom/Geometry';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import { defaults as interactions } from 'ol/interaction/defaults';
import DragRotate from 'ol/interaction/DragRotate';
import PinchRotate from 'ol/interaction/PinchRotate';
import MouseWheelZoom from 'ol/interaction/MouseWheelZoom';
import { shiftKeyOnly } from 'ol/events/condition';
import { easeOut } from 'ol/easing';
import { unByKey } from 'ol/Observable';
import { getCenter } from 'ol/extent';
import { measureTextHeight } from 'ol/render/canvas';
import type { Bounds, LocationFix, MapPoint, MapRouteResult, LngLat } from '../../shared/map-v2';
import { mapRoutePointName } from '../../shared/map-v2';
import { redundantReferenceCaptions } from '../../shared/map-names';
import { metersBetween } from '../../shared/map-routing';
import { CameraOwnership, SelectedMapPoints, contextRouteSegments } from './map-state';
import { darkMapPalette, lightMapPalette, landSurfacePaint, sportSurfacePaint, type MapPalette } from './map-theme';
import { geometryLayer } from './geometry-layer';
import { isPedestrianHighway, isCoveredRoad, isMajorHighway, isBuildingPassage, isHistoricalBridge } from './road-semantics';
import { planarGpuStyle } from './gpu-style';
import { endpointCaptionGap, pairedCaptionSides, mapFitInsets, mapLabelObstructions, observeLabelObstructions, captionControlOffset, captionWidth, measureCaptions, wrapCaption, type FitInsets, type LabelObstruction } from './fit-layout';
import { namedWaterAreas, namedWaterHit } from './named-water';
import type { FeatureCollection, Feature as WaterFeature } from 'geojson';

import type { SavedCamera, MapData, MapCallbacks, MapSurfaceOptions, MapMotionResult } from './map-types';
export type { SavedCamera, MapData, MapCallbacks } from './map-types';
const gray = (hex: string, alpha: number) => {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/** V3 compatibility renderer when WebGL cannot start. Uses the same ground facts. */
export class PlanarCampusMap {
  readonly supportsSpace = false;
  readonly map: Map;
  readonly view: View;
  readonly ownership = new CameraOwnership();
  private source: VectorSource;
  private waterAreas: WaterFeature[];
  private waterKind: 'water' | 'water-surface';
  private waterDisplay = new globalThis.Map<string, { area?: Geometry; shore?: Geometry }>();
  private bridges: Feature[];
  private highlight = new VectorSource();
  private routeSource = new VectorSource();
  private locationSource = new VectorSource();
  private selection = new SelectedMapPoints();
  private captionSides:boolean[]=[false,false];
  private entrancesVisible=false;
  private activeRoute?:MapRouteResult;
  private contextRouteResults:MapRouteResult[]=[];
  private routeMeasures:{coordinate:LngLat;meters:number}[]=[];
  private routeSpans:{coordinates:LngLat[];start:number;end:number;dashed:boolean;unverified:boolean}[]=[];
  private revealFrame=0;
  private revealStop?:()=>void;
  private routeMotion=false;
  private hovered?: string;
  private hoverLevels = new globalThis.Map<string, number>();
  private frame = 0;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private blockedClick = 0;
  private pointIndex: globalThis.Map<string, MapPoint>;
  private palette: MapPalette;
  private dark = matchMedia('(prefers-color-scheme: dark)');
  private reduce = matchMedia('(prefers-reduced-motion: reduce)');
  private contrast = matchMedia('(prefers-contrast: more)');
  private baseLayer: Layer | WebGLVectorLayer<VectorSource>;
  private geography?: ReturnType<typeof geometryLayer>;
  private styleRevision = 0;
  private labelLayer: VectorLayer<VectorSource>;
  private overlayLayer: VectorLayer<VectorSource>;
  private routeLayer: VectorLayer<VectorSource>;
  private locationLayer: VectorLayer<VectorSource>;
  private styles = new globalThis.Map<string, Style | Style[]>();
  private labelBlockers:LabelObstruction[]=[];
  private redundantNames=new Set<string>();
  private observer: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private renderCount = 0;
  private lastScale = '';
  private detailedNames = false;
  private closeScale = false;
  private detailedSports = false;
  private fineSports = false;
  private loadedAt = performance.now();
  private disposed = false;
  constructor(
    private target: HTMLDivElement,
    readonly data: MapData,
    private callbacks: MapCallbacks,
    saved?: SavedCamera,
    options: MapSurfaceOptions = {},
  ) {
    target.dataset.ready='false';delete target.dataset.graphicsFallbackReason;
    this.palette = document.documentElement.dataset.theme === 'dark' ? darkMapPalette : lightMapPalette;
    this.pointIndex = new globalThis.Map(data.places.map((p) => [p.id, p]));
    this.redundantNames=redundantReferenceCaptions(this.pointIndex.values());
    const format = new GeoJSON();
    const features = format.readFeatures(data.geography, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });
    if (data.sports) features.push(...format.readFeatures(data.sports, {
      dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
    }));
    this.source = new VectorSource({ features, wrapX: false });
    this.waterAreas = namedWaterAreas(data.geography as FeatureCollection);
    this.waterKind = features.some(f => f.get('kind') === 'water-surface') ? 'water-surface' : 'water';
    for (const feature of features) {
      const kind = feature.get('kind'), id = feature.get('waterId');
      if (!id || !['named-water-hit', 'named-water-shore'].includes(kind)) continue;
      const display = this.waterDisplay.get(id) || {};
      display[kind === 'named-water-hit' ? 'area' : 'shore'] = feature.getGeometry();
      this.waterDisplay.set(id, display);
    }
    this.bridges = features.filter(f => f.get('kind') === 'road' && f.get('bridge') === 'yes');
    for (const feature of features) {
      // Use the existing kind input for this derived styling role. Adding a
      // geometry-type input can exceed the WebGL 1 stroke shader's limit.
      const type=feature.getGeometry()?.getType();
      if(feature.get('kind')==='road'&&feature.get('highway')==='pedestrian'&&(type==='Polygon'||type==='MultiPolygon'))
        feature.set('kind','pedestrian-area',true);
      for (const key of ['highway', 'bridge', 'tunnel', 'covered'])
        if (feature.get(key) === undefined) feature.set(key, '', true);
    }
    const ext = transformExtent(data.manifest.bounds, 'EPSG:4326', 'EPSG:3857');
    const margin = 1200;
    this.view = new View({
      center: saved?.center || getCenter(ext),
      resolution: saved?.resolution,
      zoom: saved ? undefined : 15.5,
      rotation: saved?.rotation || 0,
      constrainRotation: false,
      enableRotation: true,
      constrainResolution: false,
      minZoom: 13.5,
      maxZoom: 20,
      extent: [ext[0] - margin, ext[1] - margin, ext[2] + margin, ext[3] + margin],
      constrainOnlyCenter: true,
      smoothExtentConstraint: false,
      smoothResolutionConstraint: false,
      multiWorld: false,
    });
    const probe = document.createElement('canvas').getContext('webgl');
    if (probe) {
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      this.baseLayer = new WebGLVectorLayer({
        className: 'campus-v2-geography-gl',
        source: this.source,
        style: planarGpuStyle(this.palette, this.contrast.matches, this.waterKind),
        variables: { near: 0, sports: 0, equipment: 0 },
        disableHitDetection: true,
      });
      target.dataset.renderer = 'webgl-2d';
    } else {
      this.geography = geometryLayer(
        this.source,
        (f, r) => this.baseStyle(f, r),
        () => this.styleRevision,
      );
      this.baseLayer = this.geography.layer;
      target.dataset.renderer = 'canvas-2d-fallback';
    }
    const labelFeatures = features
      .filter((f) => !!f.get('name'))
      .map((f) => {
        const p = this.pointIndex.get(String(f.getId()));
        const g = f.getGeometry();
        let anchor = p
          ? fromLonLat(p.coordinate)
          : g instanceof Polygon
            ? g.getInteriorPoint().getCoordinates()
            : g instanceof MultiPolygon
              ? g.getInteriorPoints().getCoordinates()[0]
              : undefined;
        if (!anchor || ['road','pedestrian-area','barrier'].includes(f.get('kind'))) return null;
        return new Feature({
          geometry: new Point(anchor.slice(0, 2)),
          name: f.get('name'),
          kind: f.get('kind'),
          sourceId: String(f.getId()),
        });
      })
      .filter((f): f is Feature<Point> => !!f);
    this.labelLayer = new VectorLayer({
      source: new VectorSource({ features: labelFeatures, wrapX: false }),
      declutter: true,
      style: (f, r) => this.labelStyle(f as Feature, r),
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    this.overlayLayer = new VectorLayer({
      source: this.highlight,
      declutter: true,
      style: (f) => this.highlightStyle(f as Feature),
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    this.routeLayer = new VectorLayer({
      className: 'campus-v2-route-layer',
      source: this.routeSource,
      style: (f) => this.routeStyle(f as Feature),
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    this.locationLayer = new VectorLayer({
      source: this.locationSource,
      style: (f) =>
        f.get('accuracy')
          ? new Style({
              fill: new Fill({ color: gray(this.palette.location, 0.045) }),
              stroke: new Stroke({ color: gray(this.palette.location, 0.32), width: 1 }),
            })
          : new Style({
              image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: this.palette.location }),
                stroke: new Stroke({ color: this.palette.halo, width: 2 }),
              }),
              text: new Text({
                text: f.get('label') || '本机',
                offsetY: 19,
                font: '12px "Noto Sans SC Variable", sans-serif',
                fill: new Fill({ color: this.palette.text }),
                stroke: new Stroke({ color: this.palette.halo, width: 4 }),
              }),
            }),
    });
    this.map = new Map({
      target,
      view: this.view,
      layers: [this.baseLayer, this.labelLayer, this.overlayLayer, this.routeLayer, this.locationLayer],
      controls: [],
      interactions: interactions({
        altShiftDragRotate: false,
        pinchRotate: false,
        doubleClickZoom: false,
        mouseWheelZoom: false,
        keyboard: false,
        onFocusOnly: true,
      }).extend([
        new MouseWheelZoom({duration:0,timeout:0,maxDelta:4,constrainResolution:false,condition:event=>!options.cooperativeGestures||(event.originalEvent as WheelEvent).ctrlKey||(event.originalEvent as WheelEvent).metaKey}),
        new PinchRotate({ threshold: 0.04, duration: 160 }),
        new DragRotate({ condition: shiftKeyOnly }),
      ]),
      moveTolerance: 5,
    });
    const useCanvas = () => {
      if (this.disposed || this.geography) return;
      this.cancelMotion();
      const old = this.baseLayer;
      this.geography = geometryLayer(this.source, (f, r) => this.baseStyle(f, r), () => this.styleRevision);
      this.baseLayer = this.geography.layer;
      this.map.getLayers().setAt(0, this.baseLayer);
      old.dispose();
      target.dataset.renderer = 'canvas-2d-fallback';
      this.map.render();
    };
    const lost = (event: Event) => { event.preventDefault();queueMicrotask(useCanvas); };
    target.addEventListener('webglcontextlost', lost, true);
    this.cleanup.push(() => target.removeEventListener('webglcontextlost', lost, true));
    if(options.initialRoute?.status==='ready')this.route(options.initialRoute);
    else if(options.initialRoute?.to)this.select(options.initialRoute.to,undefined,false);
    if (!saved&&options.initialRoute?.status==='ready')this.fitRoute(options.initialRoute,this.ownership.ticket(),false);
    else if(!saved&&options.initialRoute?.to)this.view.fit(transformExtent(options.initialRoute.to.bounds,'EPSG:4326','EPSG:3857'),{padding:this.padding(),maxZoom:18.5,duration:0});
    else if (!saved)
      this.view.fit(transformExtent(data.manifest.campusBounds, 'EPSG:4326', 'EPSG:3857'), {
        padding: [88, 68, 75, 28],
        duration: 0,
      });
    this.updateDetail();
    const onInput = (event:Event) => {
      if(event instanceof WheelEvent&&options.cooperativeGestures&&!event.ctrlKey&&!event.metaKey)return;
      target.focus({ preventScroll: true });
      this.takeControl();
      this.setHover(undefined);
      this.callbacks.user();
    };
    target.addEventListener('pointerdown', onInput, { capture: true });
    target.addEventListener('wheel', onInput, { capture: true, passive: true });
    this.cleanup.push(
      () => target.removeEventListener('pointerdown', onInput, true),
      () => target.removeEventListener('wheel', onInput, true),
    );
    const keydown = (e: KeyboardEvent) => this.keyboard(e);
    target.addEventListener('keydown', keydown);
    this.cleanup.push(() => target.removeEventListener('keydown', keydown));
    const leave = () => this.setHover(undefined);
    target.addEventListener('pointerleave', leave);
    this.cleanup.push(() => target.removeEventListener('pointerleave', leave));
    const keys = [
      this.map.on('pointerdrag', () => {
        this.blockedClick = Date.now() + 180;
        this.setHover(undefined);
      }),
      this.map.on('pointermove', (e) => {
        if (e.dragging || this.view.getInteracting()) return;
        const points = this.hit(e.coordinate);
        this.setHover(points[0]);
        target.style.cursor = points.length ? 'pointer' : 'grab';
      }),
      this.map.on('click', (e) => {
        if (Date.now() < this.blockedClick) return;
        const points = this.hit(e.coordinate);
        const touch = e.originalEvent instanceof PointerEvent && e.originalEvent.pointerType === 'touch';
        if (!points.length && touch) {
          const toler = 9 * (this.view.getResolution() || 1);
          const nearby = this.source
            .getFeaturesInExtent([
              e.coordinate[0] - toler,
              e.coordinate[1] - toler,
              e.coordinate[0] + toler,
              e.coordinate[1] + toler,
            ])
            .filter((f) => f.get('kind') === 'building')
            .map((f) => this.pointIndex.get(String(f.getId())))
            .filter((p): p is MapPoint => !!p);
          if (nearby.length) {
            this.callbacks.candidates(nearby.slice(0, 6));
            return;
          }
        }
        if (points.length > 1 && touch) {
          this.callbacks.candidates(points.slice(0, 6));
          return;
        }
        if (points[0]) this.callbacks.choose(points[0]);
        else this.callbacks.blank();
      }),
      this.view.on('change', () => this.reportCamera()),
      this.view.on('change:resolution', () => this.updateDetail()),
      this.map.on('postrender', () => {
        this.renderCount++;
        target.dataset.renders = String(this.renderCount);
        this.reportCamera();
      }),
      this.map.once('rendercomplete', () => {
        target.dataset.ready = 'true';
        target.dataset.loadMs = (performance.now() - this.loadedAt).toFixed(1);
        if (!this.reduce.matches)
          target.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
        this.callbacks.ready();
      }),
    ];
    this.cleanup.push(() => unByKey(keys));
    const theme = () => {
      this.palette = document.documentElement.dataset.theme === 'dark' ? darkMapPalette : lightMapPalette;
      this.styles.clear();
      this.styleRevision++;
      if (this.baseLayer instanceof WebGLVectorLayer)
        this.baseLayer.setStyle(planarGpuStyle(this.palette, this.contrast.matches, this.waterKind));
      [this.baseLayer, this.labelLayer, this.overlayLayer, this.routeLayer, this.locationLayer].forEach((l) =>
        l.changed(),
      );
    };
    this.dark.addEventListener('change', theme);
    const themeObserver = new MutationObserver(theme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.contrast.addEventListener('change', theme);
    this.cleanup.push(
      () => this.dark.removeEventListener('change', theme),
      () => themeObserver.disconnect(),
      () => this.contrast.removeEventListener('change', theme),
    );
    const reduced = () => {
      if (this.reduce.matches) this.cancelMotion();
    };
    this.reduce.addEventListener('change', reduced);
    this.cleanup.push(() => this.reduce.removeEventListener('change', reduced));
    this.observer = new ResizeObserver(() => {
      if (!this.disposed) {
        this.map.updateSize();
        this.reportCamera();
      }
    });
    this.observer.observe(target);
    this.cleanup.push(observeLabelObstructions(target,()=>{this.labelBlockers=mapLabelObstructions(target);this.labelLayer.changed();}));
    const visible = () => {
      if (document.visibilityState === 'visible') {
        this.map.updateSize();
        this.map.render();
      }
    };
    document.addEventListener('visibilitychange', visible);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', visible));
    // A context probe can succeed while the actual style exceeds its limits.
    // Compile the first frame here so that failure takes the same Canvas path
    // as context loss, instead of leaving an empty asynchronous render loop.
    try { this.map.renderSync(); }
    catch (error) {
      if (this.geography) { this.dispose();throw error; }
      target.dataset.graphicsFallbackReason=error instanceof Error?error.message:String(error);
      try { useCanvas();this.map.renderSync(); }
      catch (fallbackError) { this.dispose();throw fallbackError; }
    }
  }
  private baseStyle(f: Feature, res: number): Style | Style[] | undefined {
    const p = this.palette,
      kind = f.get('kind'),
      highway = f.get('highway'),
      close = this.closeScale;
    const context = f.get('scope') === 'context';
    const geometryType = f.getGeometry()?.getType();
    const pedestrianArea = highway === 'pedestrian' && (geometryType === 'Polygon' || geometryType === 'MultiPolygon');
    const key = [
      kind,
      highway,
      geometryType,
      f.get('role'),
      close,
      this.detailedSports,
      this.fineSports,
      f.get('bridge'),
      f.get('tunnel'),
      f.get('covered'),
      context,
      this.contrast.matches,
    ].join('/');
    if (this.styles.has(key)) return this.styles.get(key);
    let style: Style | Style[] | undefined;
    if (kind === 'building')
      style = new Style({
        fill: new Fill({ color: gray(p.building, context ? 0.7 : 1) }),
        stroke: new Stroke({
          color: gray(this.contrast.matches ? p.text : p.outline, context ? 0.65 : 1),
          width: close ? 0.85 : 0.65,
        }),
        zIndex: 3,
      });
    if (kind === 'landmark')
      style = new Style({
        fill: new Fill({ color: gray(p.selected, 0.16) }),
        stroke: new Stroke({ color: p.selected, width: 1.2, lineDash: [3, 2] }),
        zIndex: 12,
      });
    if (kind === this.waterKind)
      style = [
        new Style({ stroke: new Stroke({ color: gray(p.waterBank, 0.48), width: 1.4 }), zIndex: 0.3 }),
        new Style({ fill: new Fill({ color: p.water }), zIndex: 0.5 }),
      ];
    if (kind === 'sport') {
      const surface = sportSurfacePaint(p, f.get('role'));
      style = new Style({fill:new Fill({color:gray(surface.color,surface.opacity)}),stroke:new Stroke({color:p.outline,width:.9}),zIndex:1});
    }
    if (kind === 'court-inlay' && this.detailedSports)
      style = new Style({ fill: new Fill({ color: gray(p.courtInlay, 0.5) }), zIndex: 1.1 });
    if (this.detailedSports && ['marking','track-lane','net','equipment','landscape-step'].includes(kind)) {
      if (kind === 'equipment' && !this.fineSports) return;
      style = new Style({
        stroke: new Stroke({
          color: gray(kind === 'landscape-step' ? p.outline : p.text, kind === 'net' ? 0.55 : 0.42),
          width: kind === 'net' ? 1 : kind === 'equipment' ? 1.1 : kind === 'track-lane' ? 0.7 : 0.8,
          lineCap: 'round', lineJoin: 'round',
        }),
        zIndex: 1.5,
      });
    }
    if (kind === 'land') {
      const surface = landSurfacePaint(p, f.get('role'));
      style = new Style({ fill: new Fill({ color: gray(surface.color, surface.opacity) }), zIndex: 0 });
    }
    if (kind === 'area')
      style = new Style({
        stroke: new Stroke({ color: gray(p.outline, 0.23), width: 0.65, lineDash: [3, 5] }),
        zIndex: 0,
      });
    if (kind === 'waterway') {
      const covered = f.get('tunnel') === 'culvert' || f.get('tunnel') === 'yes';
      style = new Style({
        stroke: new Stroke({ color: covered ? gray(p.waterBank, .5) : p.water,
          width: covered ? .9 : close ? 3.5 : 2, lineDash: covered ? [2, 3] : undefined,
          lineCap: covered ? 'butt' : 'round' }),
        zIndex: 0.4,
      });
    }
    if (kind === 'barrier' && close)
      style = new Style({ stroke: new Stroke({ color: p.barrier, width: 0.8 }), zIndex: 3 });
    if ((kind === 'road' || kind === 'pedestrian-area') && pedestrianArea)
      style = new Style({
        fill: new Fill({ color: context ? gray(p.paving, 0.35) : p.paving }),
        stroke: new Stroke({ color: gray(p.outline, 0.3), width: 0.65 }),
        zIndex: 1.8,
      });
    if (kind === 'road' && !pedestrianArea) {
      const major = isMajorHighway(highway);
      const pathlike = isPedestrianHighway(highway), covered = isCoveredRoad(f.get('tunnel'), f.get('covered'));
      const historical = isHistoricalBridge(f.get('bridge'));
      const width = major ? (close ? 2.8 : 1.9) : pathlike ? (close ? 1.05 : 0.7) : 1.2;
      style = new Style({
        stroke: new Stroke({
          color: historical ? gray(p.minorRoad,.8) : isBuildingPassage(f.get('tunnel'), f.get('covered')) ? gray(p.passage,.85)
            : gray(pathlike ? p.minorRoad : context ? p.contextRoad : p.road, covered ? .55 : 1),
          width,
          lineDash: historical ? [1, 3] : covered ? [3, 4] : highway === 'steps' ? [1, 2] : undefined,
          lineCap: historical || covered || highway === 'steps' ? 'butt' : 'round',
          lineJoin: 'round',
        }),
        // Match the spatial renderer: subdued context ends sit below campus
        // continuations, and bridge casings sit below every bridge foreground.
        zIndex: (isBuildingPassage(f.get('tunnel'),f.get('covered')) ? 4 : covered ? 1.9 : f.get('bridge') === 'yes' ? 2.3 : 2) + (context ? 0 : 0.1),
      });
      if (f.get('bridge') === 'yes')
        style = [new Style({ stroke: new Stroke({ color: p.roadCasing, width: width + 2.4, lineCap: 'butt', lineJoin: 'round' }), zIndex: 2.2 }), style];
    }
    if (style) this.styles.set(key, style);
    return style;
  }
  private labelStyle(f: Feature, res: number): Style | undefined {
    if (f.get('sourceId') === this.selection.selected || f.get('sourceId') === this.selection.origin) return;
    const place=this.pointIndex.get(f.get('sourceId'));
    if(place?.historicalReference&&!place.personal)return;
    if (this.redundantNames.has(f.get('sourceId'))) return;
    const kind = f.get('kind'),
      name = f.get('name') as string;
    if (kind === 'building' && !place?.undergroundStation && !this.detailedNames && !/图书馆|博物馆|体育|食堂/.test(name)) return;
    if (kind === 'land' && res > 1.5) return;
    if (kind === 'area' && !/紫金港|望月/.test(name)) return;
    if (kind === 'landmark') {
      const landmarkKey = `label/landmark/${name}`;
      if (this.styles.has(landmarkKey)) return this.map?this.positionLabel(f,this.styles.get(landmarkKey) as Style):this.styles.get(landmarkKey) as Style;
      const landmarkStyle = new Style({
        text: new Text({
          text: name,
          font: '600 12px "Noto Sans SC Variable", sans-serif',
          fill: new Fill({ color: this.palette.text }),
          stroke: new Stroke({ color: this.palette.halo, width: 4 }),
          padding: [3, 4, 3, 4],
          rotateWithView: false,
        }),
        zIndex: 18,
      });
      this.styles.set(landmarkKey, landmarkStyle);
      return this.map?this.positionLabel(f,landmarkStyle):landmarkStyle;
    }
    const key = `label/${kind}/${name}`;
    if (this.styles.has(key)) return this.map?this.positionLabel(f,this.styles.get(key) as Style):this.styles.get(key) as Style;
    const style = new Style({
      text: new Text({
        text: name,
        font: `${kind === 'area' ? '13' : '11'}px "Noto Sans SC Variable", "Microsoft YaHei", sans-serif`,
        fill: new Fill({
          color: kind === 'water' || kind === 'area' ? this.palette.secondaryText : this.palette.text,
        }),
        stroke: new Stroke({ color: this.palette.halo, width: 3 }),
        padding: [3, 4, 3, 4],
        overflow: false,
        rotateWithView: false,
      }),
      zIndex: kind === 'area' ? 10 : 5,
    });
    this.styles.set(key, style);
    return this.map?this.positionLabel(f,style):style;
  }
  private positionLabel(f:Feature,style:Style,retain=false):Style|undefined {
    if(!this.map||!this.labelBlockers.length)return style;
    const geometry=style.getGeometry() instanceof Point?style.getGeometry():f.getGeometry(),text=style.getText();
    if(!(geometry instanceof Point)||!text)return style;
    const label=text.getText();if(typeof label!=='string')return style;
    const font=text.getFont()||'11px sans-serif',padding=text.getPadding()||[0,0,0,0],stroke=text.getStroke()?.getWidth()||0;
    // OL widens text rasters by two pixels for italic overhang, then rounds
    // raster dimensions up. Include that ink box before its label padding.
    const width=Math.ceil(captionWidth(label,font)+stroke+2)+padding[1]+padding[3],height=Math.ceil(measureTextHeight(font)*label.split('\n').length+stroke)+padding[0]+padding[2];
    const pixel=this.map.getPixelFromCoordinate(geometry.getCoordinates()),x=text.getOffsetX()||0,y=text.getOffsetY()||0;
    const centreY=y+(text.getTextBaseline()==='bottom'?-height/2:text.getTextBaseline()==='top'?height/2:0);
    const offset=captionControlOffset([pixel[0]+x,pixel[1]+centreY],width,height,this.labelBlockers);
    if(!offset)return retain?style:undefined;
    if(!offset[0]&&!offset[1])return style;
    const moved=style.clone(),caption=moved.getText()!;caption.setOffsetX(x+offset[0]);caption.setOffsetY(y+offset[1]);return moved;
  }
  private highlightStyle(f: Feature): Style[] {
    const p = this.palette,
      id = String(f.getId()),
      selected = id === this.selection.selected || id === this.selection.origin,
      a = selected ? 1 : this.hoverLevels.get(id) || 0;
    const place = this.selection.point(id,this.pointIndex);
    const water = place?.kind === 'water' ? this.waterDisplay.get(id) : undefined;
    const styles = [
      new Style({
        geometry: water?.area,
        fill: place?.kind==='water'||place?.undergroundStation ? undefined : new Fill({ color: gray(selected ? p.selected : p.hover, selected ? 0.22 : 0.18 * a) }),
        stroke: water?.shore ? undefined : new Stroke({
          color: gray(selected ? p.selected : p.hover, selected ? 1 : a),
          width: selected ? 1.45 : 1.1,
          lineDash: place?.undergroundStation ? [3,4] : undefined,
        }),
        zIndex: 10,
      }),
    ];
    if (water?.shore) styles.push(new Style({
      geometry: water.shore,
      stroke: new Stroke({ color: gray(selected ? p.selected : p.hover, selected ? 1 : a), width: selected ? 1.45 : 1.1 }),
      zIndex: 10,
    }));
    if (selected && place) {
      const role=id===this.selection.origin?'A':'B',route=this.activeRoute;
      const end=this.selection.routeEnd(role,route,this.pointIndex),endpoint=end?.coordinate;
      if(endpoint&&route?.from&&route.to){this.captionSides=pairedCaptionSides([
        {pixel:this.map.getPixelFromCoordinate(fromLonLat(route.coordinates[0])),name:mapRoutePointName(route.from,route.originAccess)},
        {pixel:this.map.getPixelFromCoordinate(fromLonLat(route.coordinates.at(-1)!)),name:mapRoutePointName(route.to,route.destinationAccess)},
      ],{font:'500 12px "Noto Sans SC Variable", sans-serif',size:12,offsetY:0,padding:4,horizontalPadding:5,marker:13.5,maxWidthEm:14,lineHeightPx:measureTextHeight('500 12px "Noto Sans SC Variable", sans-serif')},this.captionSides);}
      const below=!!endpoint&&this.captionSides[role==='A'?0:1];
      const selectedCaption=new Style({
          geometry: new Point(fromLonLat(endpoint||place.coordinate)),
          text: new Text({
            text: endpoint ? wrapCaption(mapRoutePointName(place,end?.access),'500 12px "Noto Sans SC Variable", sans-serif',12,14) : (this.selection.routeRoles?role+' · ':'') + place.displayName,
            font: '500 12px "Noto Sans SC Variable", sans-serif',
            fill: new Fill({ color: p.text }),
            stroke: new Stroke({ color: p.halo, width: 4 }),
            padding: [4, 5, 4, 5],
            offsetY: endpoint?(below?endpointCaptionGap:-endpointCaptionGap):-9,
            textBaseline: endpoint?(below?'top':'bottom'):'middle',
            // Selected names stay visible and reserve space before ordinary
            // labels; their source identities are never filtered out.
            declutterMode: 'obstacle',
            rotateWithView: false,
          }),
          zIndex: 20,
        });
      styles.push(this.map?(this.positionLabel(f,selectedCaption,true)||selectedCaption):selectedCaption);
      const used = this.selection.routeEnd(role,route,this.pointIndex)?.access;
      for (const e of place.entrances.filter(e=>this.entrancesVisible||used?.entranceId===e.id||used?.kind==='entrance'&&used.nodeId===e.id))
        styles.push(
          new Style({
            geometry: new Point(fromLonLat(e.coordinate)),
            image: new CircleStyle({
              radius: 3,
              declutterMode: 'none',
              fill: new Fill({ color: e.connected ? p.selected : p.halo }),
              stroke: new Stroke({ color: p.selected, width: 1 }),
            }),
            zIndex: 15,
          }),
        );
    }
    return styles;
  }
  private routeStyle(f: Feature): Style | Style[] {
    const p = this.palette;
    if(f.get('context'))return new Style({zIndex:0,stroke:new Stroke({color:gray(p.secondaryText,.45),width:2,lineDash:f.get('dashed')?[4,6]:undefined,lineCap:f.get('dashed')?'butt':'round',lineJoin:'round'})});
    if(f.get('reveal'))return new Style({zIndex:3,stroke:new Stroke({color:p.selected,width:f.get('dashed')?2.6:4,lineDash:f.get('dashed')?[5,5]:undefined,lineCap:f.get('unverified')?'butt':'round',lineJoin:'round'})});
    if(f.get('preview')) return f.getGeometry() instanceof Point ? new Style({zIndex:4,image:new CircleStyle({radius:6,fill:new Fill({color:p.halo}),stroke:new Stroke({color:p.text,width:2})})}) : new Style({zIndex:4,stroke:new Stroke({color:p.text,width:f.get('dashed')?2.6:4,lineDash:f.get('dashed')?[5,5]:undefined,lineCap:f.get('unverified')?'butt':'round'})});
    if (f.get('endpoint'))
      return new Style({
        zIndex: 3,
        image: new CircleStyle({
          radius: 12,
          fill: new Fill({ color: f.get('endpoint') === 'A' ? p.halo : p.route }),
          stroke: new Stroke({ color: p.route, width: 2 }),
        }),
        text: new Text({
          text: f.get('endpoint'),
          font: '600 11px sans-serif',
          fill: new Fill({ color: f.get('endpoint') === 'A' ? p.text : p.halo }),
        }),
      });
    return [
      new Style({ zIndex: 1, stroke: new Stroke({ color: p.halo, width: 5.4, lineCap: 'round', lineJoin: 'round' }) }),
      new Style({ zIndex: 2, stroke: new Stroke({ color: p.route, width: 2.6, lineCap: f.get('unverified')?'butt':'round', lineJoin: 'round',lineDash:f.get('estimated')||f.get('unverified')?[5,5]:undefined }) }),
    ];
  }
  private hit(coordinate: number[]) {
    const pixel = this.map.getPixelFromCoordinate(coordinate);
    const caption = this.map.forEachFeatureAtPixel(pixel,(feature,layer,geometry)=>{
      // The callback supplies the actual drawn geometry. A selected polygon's
      // fill must not capture a click meant for a building or bridge beneath it.
      if (!(geometry instanceof Point)) return;
      const role = feature.get('endpoint');
      if (layer === this.routeLayer && (role === 'A' || role === 'B')) {
        if (!this.selection.routeEnd(role,this.activeRoute,this.pointIndex)) return;
        const point = this.selection.point(role === 'A' ? this.selection.origin : this.selection.selected,this.pointIndex);
        return point && { point, explicit: true };
      }
      const id = layer === this.labelLayer ? feature.get('sourceId') : layer === this.overlayLayer ? String(feature.getId()) : undefined;
      const point = this.selection.point(id,this.pointIndex);
      return point && { point, explicit: layer === this.overlayLayer };
    });
    const bodies = this.source
      .getFeaturesAtCoordinate(coordinate)
      .filter(
        (f) => ['building', 'landmark', 'sport'].includes(f.get('kind')) || String(f.getId()) === 'way/322644186',
      )
      .map((f) => this.pointIndex.get(String(f.getId())))
      .filter((p): p is MapPoint => !!p)
      .sort((a, b) => (a.kind === 'building' ? 0 : 1) - (b.kind === 'building' ? 0 : 1));
    const building = bodies.find(p => p.kind === 'building');
    if (caption && (caption.explicit || !building || caption.point.id === building.id)) return [caption.point];
    if (bodies.length) return bodies;
    const water = namedWaterHit(this.waterAreas,this.pointIndex,toLonLat(coordinate) as LngLat);
    return water && !this.bridgeAt(coordinate,pixel) ? [water] : [];
  }
  private bridgeAt(coordinate: number[], pixel: number[]) {
    const resolution = this.view.getResolution()!;
    return this.bridges.some(feature => {
      const style = this.baseStyle(feature,resolution), geometry = feature.getGeometry();
      if (!style || !geometry) return false;
      const styles = Array.isArray(style) ? style : [style];
      if (styles.some(s => !!s.getFill()) && geometry.intersectsCoordinate(coordinate)) return true;
      const width = Math.max(0,...styles.map(s => s.getStroke()?.getWidth() || 0));
      const closest = this.map.getPixelFromCoordinate(geometry.getClosestPoint(coordinate));
      // CSS stroke width, including the existing round caps and bridge casing;
      // this is a display hit region, never a physical road-width claim.
      return Math.hypot(pixel[0]-closest[0],pixel[1]-closest[1]) <= width/2;
    });
  }
  private cancelTooltip() {
    clearTimeout(this.hoverTimer);
    this.hoverTimer = undefined;
    this.callbacks.hover(undefined);
  }
  private setHover(point?: MapPoint) {
    if (point?.id === this.hovered) return;
    this.cancelTooltip();
    cancelAnimationFrame(this.frame);
    this.hovered = point?.id;
    if (point && !this.hoverLevels.has(point.id)) this.hoverLevels.set(point.id, 0);
    const levels = new globalThis.Map(this.hoverLevels);
    this.refreshHighlights();
    const started = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const t = this.duration(130) === 0 ? 1 : Math.min(1, (performance.now() - started) / 130);
      for (const [id, level] of levels) {
        const target = id === this.hovered ? 1 : 0;
        this.hoverLevels.set(id, level + (target - level) * t);
        if (t === 1 && !target) this.hoverLevels.delete(id);
      }
      this.overlayLayer.changed();
      if (t < 1) this.frame = requestAnimationFrame(tick);
      else this.refreshHighlights();
    };
    tick();
    if (point)
      this.hoverTimer = setTimeout(() => {
        if (this.hovered === point.id) this.callbacks.hover(point);
      }, 330);
  }
  private refreshHighlights() {
    this.highlight.clear();
    for (const id of new Set([this.selection.selected, this.selection.origin, this.hovered, ...this.hoverLevels.keys()]))
      if (id) {
        const supplied=this.selection.point(id,this.pointIndex);
        const feature = supplied?.graphNodeId?new Feature(new Point(fromLonLat(supplied.coordinate))):this.source.getFeatureById(id);
        if (feature) {
          const copy = feature.clone();
          copy.setId(id);
          this.highlight.addFeature(copy);
        }
      }
  }
  select(destination?: MapPoint, origin?: MapPoint,routeRoles=true) {
    this.selection.set(destination,origin,routeRoles);
    this.redundantNames=redundantReferenceCaptions(this.pointIndex.values(),new Set([destination?.id,origin?.id].filter(Boolean) as string[]));
    this.captionSides=[false,false];
    this.refreshHighlights();
    this.labelLayer.changed();
  }
  route(result: MapRouteResult) {
    if(this.activeRoute!==result){
      if(this.routeMotion)this.cancelMotion();
      else this.stopReveal();
    }
    this.activeRoute=result;this.refreshHighlights();
    this.routeSource.clear();
    this.routeMeasures=[];this.routeSpans=[];
    this.target.dataset.routeStatus = result.status;
    if (result.status !== 'ready' || result.coordinates.length < 2) {this.contextRoutes(this.contextRouteResults);return;}
    const coords = result.coordinates.map((c) => fromLonLat(c));
    let total=0;for(const [i,coordinate] of result.coordinates.entries()){if(i)total+=metersBetween(result.coordinates[i-1],coordinate);this.routeMeasures.push({coordinate,meters:total});}
    let vertex=0;this.routeSpans=(result.segments||[{coordinates:result.coordinates,kind:'network' as const}]).map(s=>{const start=this.routeMeasures[vertex]?.meters||0;vertex+=Math.max(0,s.coordinates.length-1);return {coordinates:s.coordinates,start,end:this.routeMeasures[vertex]?.meters||start,dashed:s.kind==='estimate'||'conditions' in s&&!!s.conditions?.length,unverified:'conditions' in s&&!!s.conditions?.length};});
    this.routeSource.addFeatures([
      ...(result.segments?.map(s=>new Feature({geometry:new LineString(s.coordinates.map(c=>fromLonLat(c))),estimated:s.kind==='estimate',unverified:!!s.conditions?.length}))||[new Feature(new LineString(coords))]),
      new Feature({ geometry: new Point(coords[0]), endpoint: 'A' }),
      new Feature({ geometry: new Point(coords.at(-1)!), endpoint: 'B' }),
    ]);
    this.contextRoutes(this.contextRouteResults);
  }
  contextRoutes(routes:MapRouteResult[]){this.contextRouteResults=routes;for(const feature of this.routeSource.getFeatures().filter(f=>f.get('context')))this.routeSource.removeFeature(feature);const segments=contextRouteSegments(this.activeRoute,routes);this.routeSource.addFeatures(segments.map(s=>new Feature({context:true,dashed:s.dashed,geometry:new LineString(s.coordinates.map(c=>fromLonLat(c)))})));this.target.dataset.contextEdges=String(segments.length);}
  location(fix?: LocationFix) {
    this.locationSource.clear();
    if (!fix) return;
    const p = fromLonLat(fix.coordinate),
      radius = fix.accuracy / Math.cos((fix.coordinate[1] * Math.PI) / 180);
    this.locationSource.addFeatures([
      new Feature({ geometry: new CircleGeometry(p, radius), accuracy: true }),
      new Feature({
        geometry: new Point(p),
        label:
          fix.source === 'test' ? '测试位置（模拟）' : fix.source === 'phone-synced' ? '已同步手机' : '本机',
      }),
    ]);
  }
  snapshot(): SavedCamera {
    return {
      center: this.view.getCenter()!.slice(),
      resolution: this.view.getResolution()!,
      rotation: this.view.getRotation(),
    };
  }
  project(coordinate: LngLat) { return this.map.getPixelFromCoordinate(fromLonLat(coordinate)); }
  setPitch(_pitch: number) { /* Compatibility view remains planar, explicitly labelled. */ }
  preview(progress?: number) {
    this.stopReveal();
    for(const f of this.routeSource.getFeatures().filter(f=>f.get('preview')))this.routeSource.removeFeature(f);
    const r=this.activeRoute;if(progress===undefined||r?.status!=='ready')return;
    const distance=Math.max(0,Math.min(1,progress))*(this.routeMeasures.at(-1)?.meters||0),s=this.routeSpans.find(s=>s.end>=distance)||this.routeSpans.at(-1);if(!s)return;
    this.routeSource.addFeatures([new Feature({geometry:new LineString(s.coordinates.map(c=>fromLonLat(c))),preview:true,dashed:s.dashed,unverified:s.unverified}),new Feature({geometry:new Point(fromLonLat(this.atDistance(distance))),preview:true})]);
  }
  private atDistance(distance:number):LngLat {
    const ms=this.routeMeasures,i=ms.findIndex(p=>p.meters>=distance);
    if(i<=0)return (i===0?ms[0]:ms.at(-1))?.coordinate||[0,0];
    const a=ms[i-1],b=ms[i],t=(distance-a.meters)/(b.meters-a.meters||1);
    return [a.coordinate[0]+t*(b.coordinate[0]-a.coordinate[0]),a.coordinate[1]+t*(b.coordinate[1]-a.coordinate[1])];
  }
  private clearReveal(){for(const f of this.routeSource.getFeatures().filter(f=>f.get('reveal')))this.routeSource.removeFeature(f);}
  private stopReveal(){this.revealStop?.();cancelAnimationFrame(this.revealFrame);this.revealFrame=0;this.clearReveal();}
  private reveal(ticket:number):Promise<boolean>{
    this.stopReveal();const total=this.routeMeasures.at(-1)?.meters||0;
    if(!total||this.reduce.matches)return Promise.resolve(this.ownership.accepts(ticket));
    return new Promise(resolve=>{
      let settled=false,unsubscribe=()=>{};
      const finish=(complete:boolean)=>{if(settled)return;settled=true;unsubscribe();cancelAnimationFrame(this.revealFrame);this.revealFrame=0;this.revealStop=undefined;this.clearReveal();resolve(complete);};
      this.revealStop=()=>finish(false);unsubscribe=this.ownership.onCancel(ticket,this.revealStop);if(settled)return;
      const start=performance.now(),duration=Math.max(640,Math.min(1400,480+total*.65));
      const frame=(now:number)=>{if(!this.ownership.accepts(ticket)){finish(false);return;}const t=Math.min(1,(now-start)/duration),from=Math.max(0,t-.12)*total,to=t*total;
        this.clearReveal();this.routeSource.addFeatures(this.routeSpans.filter(s=>s.end>from&&s.start<to).map(s=>new Feature({reveal:true,dashed:s.dashed,unverified:s.unverified,geometry:new LineString((s.dashed?s.coordinates:[this.atDistance(Math.max(from,s.start)),...this.routeMeasures.filter(p=>p.meters>Math.max(from,s.start)&&p.meters<Math.min(to,s.end)).map(p=>p.coordinate),this.atDistance(Math.min(to,s.end))]).map(c=>fromLonLat(c)))})));
        if(t<1)this.revealFrame=requestAnimationFrame(frame);else finish(true);};this.revealFrame=requestAnimationFrame(frame);
    });
  }
  showEntrances(visible: boolean) { this.entrancesVisible=visible;this.refreshHighlights(); }
  updatePlaces(places: MapPoint[]) { this.pointIndex = new globalThis.Map(places.map(p=>[p.id,p])); this.redundantNames=redundantReferenceCaptions(this.pointIndex.values(),new Set([this.selection.selected,this.selection.origin].filter(Boolean) as string[])); this.refreshHighlights(); this.labelLayer.changed(); }
  private reportCamera() {
    if (this.disposed || !this.view.getCenter()) return;
    const camera = this.snapshot(),
      size = this.map.getSize() || [0, 0];
    this.target.dataset.camera = JSON.stringify({
      ...camera,
      size,
      pitch: 0,
      projection: 'EPSG:3857',
      animating: this.view.getAnimating(),
      interacting: this.view.getInteracting(),
    });
    const ground = camera.resolution * Math.cos((toLonLat(camera.center)[1] * Math.PI) / 180),
      desired = ground * 90;
    const power = 10 ** Math.floor(Math.log10(desired));
    const meters =
      [1, 2, 5, 10]
        .map((v) => v * power)
        .filter((v) => v <= desired)
        .at(-1) || power;
    const scale = JSON.stringify({ meters, width: meters / ground });
    if (scale !== this.lastScale) {
      this.target.dataset.scale = scale;
      this.lastScale = scale;
    }
    this.callbacks.camera(camera);
  }
  private updateDetail() {
    const r = this.view.getResolution() || 5;
    const before = [this.detailedNames, this.closeScale, this.detailedSports, this.fineSports].join('/');
    this.detailedNames = this.detailedNames ? r < 4.15 : r < 3.5;
    this.closeScale = this.closeScale ? r < 3.3 : r < 2.7;
    this.detailedSports = this.detailedSports ? r < 1 : r < 0.85;
    this.fineSports = this.fineSports ? r < 0.29 : r < 0.25;
    if (before !== [this.detailedNames, this.closeScale, this.detailedSports, this.fineSports].join('/')) this.styleRevision++;
    if (this.baseLayer instanceof WebGLVectorLayer)
      this.baseLayer.updateStyleVariables({
        near: this.closeScale ? 1 : 0,
        sports: this.detailedSports ? 1 : 0,
        equipment: this.fineSports ? 1 : 0,
      });
  }
  takeControl() {
    const ticket=this.ownership.take();
    this.routeMotion=false;
    this.view.cancelAnimations();
    this.stopReveal();this.target.dataset.motion='cancelled';return ticket;
  }
  cancelMotion(){this.ownership.cancel();this.routeMotion=false;this.view.cancelAnimations();this.stopReveal();this.target.dataset.motion='cancelled';}
  restore(camera:SavedCamera){this.takeControl();this.view.setCenter(camera.center.slice());this.view.setResolution(camera.resolution);this.view.setRotation(camera.rotation);}
  private cameraMotion(ticket:number,move:(complete:(completed:boolean)=>void)=>void):Promise<boolean>{
    if(!this.ownership.accepts(ticket))return Promise.resolve(false);
    return new Promise(resolve=>{let settled=false,unsubscribe=()=>{};const finish=(completed:boolean)=>{if(settled)return;settled=true;unsubscribe();resolve(completed&&this.ownership.accepts(ticket));};unsubscribe=this.ownership.onCancel(ticket,()=>finish(false));if(!settled)move(finish);});
  }
  async explainRoute(result:MapRouteResult):Promise<MapMotionResult>{
    if(this.disposed||result.status!=='ready'||result.coordinates.length<2)return 'cancelled';
    this.route(result);const ticket=this.takeControl();this.routeMotion=true;this.target.dataset.motionTicket=String(ticket);this.target.dataset.motion='overview';
    if(!await this.cameraMotion(ticket,complete=>this.fitRoute(result,ticket,true,complete)))return 'cancelled';
    this.target.dataset.motion='route';if(!await this.reveal(ticket))return 'cancelled';
    const access=result.destinationAccess,total=this.routeMeasures.at(-1)?.meters||0;
    if(!this.reduce.matches&&access?.kind==='entrance'&&!access.conditions?.length&&total>200){
      this.target.dataset.motion='entrance';const cs=[this.atDistance(Math.max(0,total-110)),...this.routeMeasures.filter(p=>p.meters>=total-110).map(p=>p.coordinate),access.coordinate];
      if(!await this.cameraMotion(ticket,callback=>this.view.fit(new MultiPoint(cs.map(c=>fromLonLat(c))),{padding:this.padding(),maxZoom:18.1,duration:this.duration(340),easing:easeOut,callback})))return 'cancelled';
    }
    if(!this.ownership.accepts(ticket))return 'cancelled';this.routeMotion=false;this.target.dataset.motion='completed';return 'completed';
  }
  private duration(ms: number) {
    return this.reduce.matches || this.geography ? 0 : ms;
  }
  zoom(delta: number) {
    this.takeControl();
    this.view.animate({
      zoom: (this.view.getZoom() || 16) + delta,
      duration: this.duration(180),
      easing: easeOut,
    });
  }
  rotate(delta: number) {
    this.takeControl();
    this.view.animate({
      rotation: this.view.getRotation() + delta,
      duration: this.duration(180),
      easing: easeOut,
    });
  }
  north() {
    this.takeControl();
    const r = this.view.getRotation(),
      turn = Math.round(r / (2 * Math.PI)) * 2 * Math.PI;
    this.view.animate({ rotation: turn, duration: this.duration(260), easing: easeOut });
  }
  overview() {
    this.takeControl();
    this.view.fit(transformExtent(this.data.manifest.campusBounds, 'EPSG:4326', 'EPSG:3857'), {
      padding: this.padding(),
      duration: this.duration(350),
      easing: easeOut,
    });
  }
  focusPlace(p: MapPoint) {
    this.takeControl();
    this.view.fit(transformExtent(p.bounds, 'EPSG:4326', 'EPSG:3857'), {
      padding: this.padding(),
      maxZoom: 18.5,
      duration: this.duration(320),
      easing: easeOut,
    });
  }
  private padding(caption?: FitInsets) {
    const p = mapFitInsets(this.target, caption);
    return [p.top, p.right, p.bottom, p.left];
  }
  fitRoute(result: MapRouteResult, ticket?: number, animate=true, complete?:(completed:boolean)=>void) {
    if (result.status !== 'ready' || !result.coordinates.length) {complete?.(false);return;}
    if (ticket !== undefined && !this.ownership.accepts(ticket)) {complete?.(false);return;}
    if (ticket === undefined) this.takeControl();
    if (ticket === undefined) {this.routeMotion=true;this.target.dataset.motion='route-fit';}
    const wasAnimating = this.view.getAnimating();
    this.view.cancelAnimations();
    const fitCoordinates = result.coordinates.slice();
    for (const p of [result.from, result.to])
      if (p) {
        const [w, s, e, n] = p.bounds;
        fitCoordinates.push([w, s], [w, n], [e, s], [e, n]);
      }
    const coords = fitCoordinates.map((c) => fromLonLat(c)),
      size = this.map.getSize()!,
      pad = this.padding(measureCaptions([mapRoutePointName(result.from,result.originAccess), mapRoutePointName(result.to,result.destinationAccess)].filter(Boolean),
        { font: '500 12px "Noto Sans SC Variable", sans-serif', size: 12, offsetY: -endpointCaptionGap, padding: 5, horizontalPadding: 8, marker: 13.5, maxWidthEm: 14, anchor: 'bottom', lineHeightPx: measureTextHeight('500 12px "Noto Sans SC Variable", sans-serif') }));
    const visible = coords.every((c) => {
      const p = this.map.getPixelFromCoordinate(c);
      return !!p&&p[0] >= pad[3] && p[0] <= size[0] - pad[1] && p[1] >= pad[0] && p[1] <= size[1] - pad[2];
    });
    if (visible && !wasAnimating) {complete?.(true);return;}
    this.view.cancelAnimations();
    const geometry = new MultiPoint(coords), rotated = geometry.clone();
    rotated.rotate(-this.view.getRotation(), [0, 0]);
    const resolution = this.view.getResolutionForExtent(rotated.getExtent(), [Math.max(1, size[0] - pad[1] - pad[3]), Math.max(1, size[1] - pad[0] - pad[2])]);
    const requiredZoom = this.view.getZoomForResolution(resolution);
    if (typeof requiredZoom === 'number' && Number.isFinite(requiredZoom)) this.view.setMinZoom(Math.max(0, Math.min(this.view.getMinZoom(), requiredZoom)));
    this.view.fit(geometry, {
      padding: pad,
      maxZoom: 18.3,
      duration: animate?this.duration(340):0,
      easing: easeOut,
      callback:complete,
    });
  }
  locate(fix: LocationFix, intro = false, ticket?: number) {
    if (ticket !== undefined && !this.ownership.accepts(ticket)) return;
    if (!intro) this.takeControl();
    const center = fromLonLat(fix.coordinate);
    this.view.cancelAnimations();
    if (intro) {
      const extent = transformExtent(this.data.manifest.campusBounds, 'EPSG:4326', 'EPSG:3857'),
        size = this.map.getSize()!;
      const resolution =
        (Math.max(Math.abs(center[0] - extent[0]), Math.abs(extent[2] - center[0])) * 2) /
        Math.max(220, size[0] - 130);
      const vertical =
        (Math.max(Math.abs(center[1] - extent[1]), Math.abs(extent[3] - center[1])) * 2) /
        Math.max(180, size[1] - 230);
      const finalResolution = Math.min(10, Math.max(resolution, vertical));
      this.view.setCenter(center);
      if (this.duration(760)) {
        this.view.setZoom(18.2);
        this.view.animate(
          { center, duration: 190 },
          { center, resolution: finalResolution, duration: 760, easing: easeOut },
        );
      } else this.view.setResolution(finalResolution);
    } else this.view.animate({ center, zoom: 18, duration: this.duration(300), easing: easeOut });
  }
  private keyboard(e: KeyboardEvent) {
    if (e.target !== this.target) return;
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '=', '-', 'q', 'e', 'n', '0'].includes(e.key)
    ) {
      e.preventDefault();
      this.takeControl();
      this.callbacks.user();
      if (e.key === '+' || e.key === '=') this.zoom(0.5);
      else if (e.key === '-') this.zoom(-0.5);
      else if (e.key === 'q') this.rotate(-Math.PI / 12);
      else if (e.key === 'e') this.rotate(Math.PI / 12);
      else if (e.key === 'n') this.north();
      else if (e.key === '0') this.overview();
      else {
        const s = this.map.getSize()!,
          p = [s[0] / 2, s[1] / 2];
        p[0] += e.key === 'ArrowLeft' ? -75 : e.key === 'ArrowRight' ? 75 : 0;
        p[1] += e.key === 'ArrowUp' ? -75 : e.key === 'ArrowDown' ? 75 : 0;
        this.view.setCenter(this.map.getCoordinateFromPixel(p));
      }
    }
  }
  dispose() {
    this.disposed = true;
    this.ownership.destroy();
    this.stopReveal();
    this.view.cancelAnimations();
    clearTimeout(this.hoverTimer);
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.cleanup.forEach((f) => f());
    this.map.setTarget(undefined);
    this.map.dispose();
    if (this.geography) this.geography.dispose();
    else this.baseLayer.dispose();
    [this.labelLayer, this.overlayLayer, this.routeLayer, this.locationLayer].forEach((l) => l.dispose());
    this.target.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  }
}
