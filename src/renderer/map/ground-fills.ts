import {MercatorCoordinate, type Map as MapLibreMap, type CustomLayerInterface, type CustomRenderMethodInput, type FillLayerSpecification} from 'maplibre-gl';
import {Color, createExpression, latest, type StyleExpression, type StylePropertySpecification} from '@maplibre/maplibre-gl-style-spec';
import earcut from 'earcut';
import type {Feature, FeatureCollection, Position} from 'geojson';

type XY = [number, number];
type FillState = Record<string, boolean | number>;
type FillGroup = {feature: Feature; first: number; count: number; bounds: [number, number, number, number]};
export type FillPolygon = {rings: XY[][]; vertices: Float32Array; indices: number[]};
export type SharedFillNode = {coordinate: Position; owners: Set<string>};
export const groundFillOrigin = MercatorCoordinate.fromLngLat([120.078, 30.306]);

/** A boolean difference can add a node to an apron without splitting the
 * sibling track edge. Restrict shared nodes to the declared venue family.
 * The angular bound below is floating-point arithmetic, not a map accuracy
 * or QA tolerance; nearby unrelated edges and vertices are not snapped.
 */
export function groundFillNodes(data: FeatureCollection): Map<string, SharedFillNode[]> {
  const venues = new Map<string, Map<string, SharedFillNode>>();
  for (const feature of data.features) {
    const venue = feature.properties?.venueId;
    if (!venue || feature.properties?.kind !== 'sport') continue;
    const g = feature.geometry, polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const nodes = venues.get(venue) || new Map<string, SharedFillNode>();
    venues.set(venue, nodes);
    for (const polygon of polygons) for (const ring of polygon) for (const p of ring) {
      const key = p.slice(0, 2).join(','), node = nodes.get(key) || {coordinate: p, owners: new Set<string>()};
      node.owners.add(String(feature.id)); nodes.set(key, node);
    }
  }
  return new Map([...venues].map(([id, nodes]) => [id, [...nodes.values()]]));
}

function splitSharedRing(ring: Position[], nodes: SharedFillNode[], id: string): Position[] {
  const result: Position[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    result.push(a);
    if (!length2) continue;
    const inserted: {t: number; p: Position}[] = [];
    for (const node of nodes) {
      if (node.owners.size === 1 && node.owners.has(id)) continue;
      const p = node.coordinate, px = p[0] - a[0], py = p[1] - a[1], t = (px * dx + py * dy) / length2;
      if (t <= 0 || t >= 1) continue;
      const epsilon = 8 * Number.EPSILON * Math.max(1, ...a.slice(0, 2).map(Math.abs), ...b.slice(0, 2).map(Math.abs), ...p.slice(0, 2).map(Math.abs));
      if (Math.min(Math.hypot(px, py), Math.hypot(p[0] - b[0], p[1] - b[1])) <= epsilon) continue;
      if (Math.abs(dx * py - dy * px) <= epsilon * Math.sqrt(length2)) inserted.push({t, p});
    }
    for (const {p} of inserted.sort((a, b) => a.t - b.t)) result.push(p);
  }
  result.push(ring[ring.length - 1]);
  return result;
}

/** Triangulate the actual local Float32 draw coordinates, retaining every ring.
 * Native GeoJSON tile rounding can fold a narrow apron and independently
 * simplify opposite sides of the same boundary. These fills do neither.
 * Source geography, native outlines, extrusions and routing stay independent.
 */
export function groundFillPolygons(feature: Feature, sharedNodes: SharedFillNode[] = []): FillPolygon[] {
  const geometry = feature.geometry;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.map(polygon => {
    const rings: XY[][] = polygon.map(ring => (sharedNodes.length ? splitSharedRing(ring, sharedNodes, String(feature.id)) : ring).map(p => {
      if (!p.slice(0, 2).every(Number.isFinite)) throw new Error('Invalid ground coordinate');
      const q = MercatorCoordinate.fromLngLat([p[0], p[1]]);
      return [Math.fround(q.x - groundFillOrigin.x), Math.fround(q.y - groundFillOrigin.y)];
    }));
    const holes: number[] = [];
    let count = 0;
    for (const [i, ring] of rings.entries()) {
      if (ring.length < 4) throw new Error('Incomplete ground ring');
      if (i) holes.push(count);
      count += ring.length;
    }
    const vertices = new Float32Array(rings.flat().flat());
    const indices = earcut(vertices, holes, 2);
    return {rings, vertices, indices};
  });
}

const cross = (a: XY, b: XY, c: XY) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const inTriangle = (p: XY, a: XY, b: XY, c: XY) => {
  const x = cross(a, b, p), y = cross(b, c, p), z = cross(c, a, p);
  return !(x < 0 || y < 0 || z < 0) || !(x > 0 || y > 0 || z > 0);
};

/** Invert the same uploaded matrix at z=0; reject points behind the camera. */
export function groundFillCoordinate(matrix: Float32Array, width: number, height: number, x: number, y: number): XY | undefined {
  const m = matrix, nx = x * 2 / width - 1, ny = 1 - y * 2 / height;
  const a = m[0] - nx * m[3], b = m[4] - nx * m[7], c = nx * m[15] - m[12];
  const d = m[1] - ny * m[3], e = m[5] - ny * m[7], f = ny * m[15] - m[13];
  const determinant = a * e - b * d;
  if (!determinant) return;
  const px = (c * e - b * f) / determinant, py = (a * f - c * d) / determinant;
  const w = m[3] * px + m[7] * py + m[15], z = m[2] * px + m[6] * py + m[14];
  if (!Number.isFinite(px) || !Number.isFinite(py) || w <= 0 || z < -w || z > w) return;
  return [px, py];
}

function intersectsConvex(a: XY[], b: XY[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], axis = [p[1] - q[1], q[0] - p[0]];
    const av = a.map(v => v[0] * axis[0] + v[1] * axis[1]), bv = b.map(v => v[0] * axis[0] + v[1] * axis[1]);
    if (Math.max(...av) < Math.min(...bv) || Math.max(...bv) < Math.min(...av)) return false;
  }
  return true;
}

function expression(value: unknown, key: string, property?: 'fill-color' | 'fill-opacity'): StyleExpression {
  const parsed = createExpression(value, key, property ? latest.paint_fill[property] as StylePropertySpecification : undefined);
  if (parsed.result !== 'success') throw new Error(`${key}: ${parsed.value.map(e => e.message).join('; ')}`);
  return parsed.value;
}

export class GroundFill implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  readonly id: string;
  private map?: MapLibreMap;
  private gl?: WebGL2RenderingContext;
  private program?: WebGLProgram;
  private vao?: WebGLVertexArrayObject;
  private buffer?: WebGLBuffer;
  private uniforms?: {matrix: WebGLUniformLocation | null; color: WebGLUniformLocation | null; offset: WebGLUniformLocation | null};
  private vertices: Float32Array;
  private groups: FillGroup[] = [];
  private color!: StyleExpression;
  private opacity!: StyleExpression;
  private matrix?: Float32Array;
  private restore = () => {if (this.gl) this.setup(this.gl);};

  constructor(private specification: FillLayerSpecification, data: FeatureCollection, private states: Map<string, FillState>) {
    // Native tile buckets retain their original layer IDs during state updates.
    // A custom layer must never reuse one of those IDs.
    this.id = 'ground-fill-' + specification.id;
    this.updateStyle(specification);
    const filter = expression(specification.filter ?? true, `${this.id}.filter`), vertices: number[] = [], nodes = groundFillNodes(data);
    for (const feature of data.features) {
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) continue;
      if (!filter.evaluate({zoom: 0}, {type: 3, id: feature.id, properties: feature.properties || {}})) continue;
      const first = vertices.length / 2, bounds: FillGroup['bounds'] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const polygon of groundFillPolygons(feature, nodes.get(feature.properties?.venueId))) {
        const v = polygon.vertices;
        for (let i = 0; i < polygon.indices.length; i += 3) {
          const points = polygon.indices.slice(i, i + 3).map(k => [v[k * 2], v[k * 2 + 1]] as XY);
          if (cross(points[0], points[1], points[2]) === 0) continue;
          for (const [x, y] of points) {
            vertices.push(x, y);
            bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
            bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
          }
        }
      }
      this.groups.push({feature, first, count: vertices.length / 2 - first, bounds});
    }
    this.vertices = new Float32Array(vertices);
  }

  updateStyle(specification: FillLayerSpecification) {
    this.specification = specification;
    this.color = expression(specification.paint?.['fill-color'] ?? '#000000', `${this.id}.fill-color`, 'fill-color');
    this.opacity = expression(specification.paint?.['fill-opacity'] ?? 1, `${this.id}.fill-opacity`, 'fill-opacity');
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map; this.gl = gl; this.setup(gl);
    map.on('webglcontextrestored', this.restore);
  }

  private setup(gl: WebGL2RenderingContext) {
    const shader = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Ground fill shader');
      return shader;
    };
    const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
      precision highp float; in vec2 a_position; uniform mat4 u_matrix; uniform vec2 u_offset;
      void main() { gl_Position = u_matrix * vec4(a_position, 0.0, 1.0); gl_Position.xy += u_offset * gl_Position.w; }`);
    const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float; uniform vec4 u_color; out vec4 color; void main() { color = u_color; }`);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) || 'Ground fill program');
    this.uniforms = {matrix: gl.getUniformLocation(this.program, 'u_matrix'), color: gl.getUniformLocation(this.program, 'u_color'), offset: gl.getUniformLocation(this.program, 'u_offset')};
    this.vao = gl.createVertexArray()!; gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 8, 0); gl.bindVertexArray(null);
  }

  private visible() {
    const zoom = this.map?.getZoom();
    return zoom !== undefined && this.specification.layout?.visibility !== 'none' && zoom >= (this.specification.minzoom ?? 0) && zoom < (this.specification.maxzoom ?? Infinity);
  }

  render(gl: WebGL2RenderingContext, input: CustomRenderMethodInput) {
    if (!this.program || !this.map || !this.uniforms || !this.visible()) return;
    const m = Array.from(input.defaultProjectionData.mainMatrix);
    for (let i = 0; i < 4; i++) m[12 + i] += m[i] * groundFillOrigin.x + m[4 + i] * groundFillOrigin.y;
    this.matrix = new Float32Array(m);
    gl.useProgram(this.program); gl.bindVertexArray(this.vao!);
    gl.uniformMatrix4fv(this.uniforms.matrix, false, this.matrix);
    // Keep MapLibre's per-layer depth range/read test so opaque roads drawn in
    // the earlier pass still cover the ground beneath them in the right order.
    gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const offset = this.specification.paint?.['fill-translate'] as number[] | undefined;
    gl.uniform2f(this.uniforms.offset, (offset?.[0] || 0) * 2 / this.map.getContainer().clientWidth, -(offset?.[1] || 0) * 2 / this.map.getContainer().clientHeight);
    let first = 0, count = 0, previous: number[] = [];
    const flush = () => {if (count) {gl.uniform4fv(this.uniforms!.color, previous); gl.drawArrays(gl.TRIANGLES, first, count);}};
    const globals = {zoom: this.map.getZoom()};
    for (const group of this.groups) {
      const feature = {type: 3 as const, id: group.feature.id, properties: group.feature.properties || {}}, state = this.states.get(String(group.feature.id)) || {};
      const color = this.color.evaluate(globals, feature, state) as Color, opacity = this.opacity.evaluate(globals, feature, state) as number;
      const rgba = [color.r * opacity, color.g * opacity, color.b * opacity, color.a * opacity];
      if (!count || rgba.some((v, i) => v !== previous[i]) || first + count !== group.first) {
        flush(); first = group.first; count = 0; previous = rgba;
      }
      count += group.count;
    }
    flush(); gl.bindVertexArray(null);
  }

  /** Hit the same uncut triangles that were drawn, including courtyard holes. */
  query(x: number, y: number, tolerance = 0): Feature[] {
    if (!this.matrix || !this.map || !this.visible()) return [];
    const {clientWidth: width, clientHeight: height} = this.map.getContainer();
    const point = groundFillCoordinate(this.matrix, width, height, x, y);
    if (!point) return [];
    const box = tolerance ? [[x - tolerance, y - tolerance], [x + tolerance, y - tolerance], [x + tolerance, y + tolerance], [x - tolerance, y + tolerance]].map(([px, py]) => groundFillCoordinate(this.matrix!, width, height, px, py)) : [];
    const bounds = box.length && box.every(Boolean) ? box as XY[] : [point];
    const minX = Math.min(...bounds.map(p => p[0])), minY = Math.min(...bounds.map(p => p[1])), maxX = Math.max(...bounds.map(p => p[0])), maxY = Math.max(...bounds.map(p => p[1]));
    const hits: Feature[] = [], v = this.vertices;
    for (const group of this.groups) {
      const b = group.bounds;
      if (b[2] < minX || b[3] < minY || b[0] > maxX || b[1] > maxY) continue;
      for (let i = group.first * 2; i < (group.first + group.count) * 2; i += 6) {
        const a: XY = [v[i], v[i + 1]], b: XY = [v[i + 2], v[i + 3]], c: XY = [v[i + 4], v[i + 5]];
        if (inTriangle(point, a, b, c) || bounds.length === 4 && intersectsConvex([a, b, c], bounds)) {hits.push(group.feature); break;}
      }
    }
    return hits.reverse();
  }

  onRemove(map: MapLibreMap, gl: WebGL2RenderingContext) {
    map.off('webglcontextrestored', this.restore);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
    this.map = undefined; this.gl = undefined; this.matrix = undefined;
  }
}
