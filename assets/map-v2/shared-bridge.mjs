// src/main/mapBridge.ts
import { createInterface } from "node:readline";
import { statSync as statSync2, readFileSync as readFileSync2 } from "node:fs";
import path from "node:path";

// src/main/mapStorage.ts
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { default as default2 } from "node:path";

// src/shared/map-v2.ts
function emptyRoute(reason = "\u9009\u62E9\u4E00\u4E2A\u5730\u70B9\uFF0C\u770B\u770B\u600E\u4E48\u8D70\u3002") {
  return {
    schemaVersion: "map-route/v2",
    status: "idle",
    reason,
    coordinates: [],
    nodeIds: [],
    edgeIds: [],
    warnings: [],
    source: { version: "", kind: "osm", date: "" }
  };
}

// src/shared/map-routing.ts
function metersBetween(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * r / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2;
  return 2 * 63710088e-1 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function inBounds(p, b) {
  return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
}
function abruptFixJump(f, previous) {
  if (!previous || previous.source !== f.source) return false;
  const seconds = (f.timestamp - previous.timestamp) / 1e3;
  return seconds > 0 && seconds < 15 && metersBetween(f.coordinate, previous.coordinate) > Math.max(250, 4 * (f.accuracy + previous.accuracy) + 35 * seconds);
}
function classifyFix(f, bounds, now = Date.now(), previous) {
  if (f.crs !== "EPSG:4326" || !f.coordinate.every(Number.isFinite) || Math.abs(f.coordinate[0]) > 180 || Math.abs(f.coordinate[1]) > 90 || !Number.isFinite(f.accuracy) || f.accuracy <= 0 || !Number.isFinite(f.timestamp) || f.timestamp > now + 1e4)
    return "unavailable";
  if (now - f.timestamp > 12e4) return "stale";
  if (!inBounds(f.coordinate, bounds)) return "outside";
  return f.accuracy > 65 || abruptFixJump(f, previous) ? "approximate" : "fresh";
}
var MinHeap = class {
  a = [];
  push(x) {
    let i = this.a.push(x) - 1;
    while (i > 0) {
      const p = i - 1 >> 1;
      if (this.a[p][0] <= x[0]) break;
      this.a[i] = this.a[p];
      i = p;
    }
    this.a[i] = x;
  }
  pop() {
    const first = this.a[0], last = this.a.pop();
    if (this.a.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && this.a[c + 1][0] < this.a[c][0]) c++;
        if (this.a[c][0] >= last[0]) break;
        this.a[i] = this.a[c];
        i = c;
      }
      this.a[i] = last;
    }
    return first;
  }
};
var prohibitedFootAccess = /* @__PURE__ */ new Set(["no", "private", "customers", "delivery", "permit", "destination", "use_sidepath"]);
function allowsFootAccess(foot) {
  return !prohibitedFootAccess.has(foot || "");
}
var WalkingGraph = class {
  constructor(graph) {
    this.graph = graph;
    this.nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    this.edges = new Map(graph.edges.map((e) => [e.id, e]));
    for (const e of graph.edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to) || !Number.isFinite(e.meters) || e.meters <= 0)
        throw new Error("Invalid walking graph");
      this.adjacency.set(e.from, [...this.adjacency.get(e.from) || [], { to: e.to, edge: e }]);
      if (!e.oneway) this.adjacency.set(e.to, [...this.adjacency.get(e.to) || [], { to: e.from, edge: e }]);
    }
  }
  graph;
  nodes;
  adjacency = /* @__PURE__ */ new Map();
  edges;
  shortest(origins, destinations, avoidStairs = false, originCosts = /* @__PURE__ */ new Map(), destinationCosts = /* @__PURE__ */ new Map(), allowConditional = false) {
    const targets = new Set(destinations.filter((id) => this.nodes.has(id))), dist = /* @__PURE__ */ new Map(), prev = /* @__PURE__ */ new Map(), heap = new MinHeap();
    for (const id of origins)
      if (this.nodes.has(id)) {
        const cost = originCosts.get(id) ?? 0;
        if (!Number.isFinite(cost) || cost < 0) throw new Error("Invalid endpoint cost");
        dist.set(id, cost);
        heap.push([cost, id]);
      }
    let best = Infinity, target;
    while (heap.a.length) {
      const [cost, id] = heap.pop();
      if (cost !== dist.get(id)) continue;
      if (cost > best) break;
      if (targets.has(id)) {
        const endCost = destinationCosts.get(id) ?? 0;
        if (!Number.isFinite(endCost) || endCost < 0) throw new Error("Invalid endpoint cost");
        if (cost + endCost < best) {
          best = cost + endCost;
          target = id;
        }
      }
      for (const { to, edge } of this.adjacency.get(id) || []) {
        if (!allowsFootAccess(edge.foot)) continue;
        if (avoidStairs && edge.stairs) continue;
        if (!allowConditional && edge.conditions?.length) continue;
        const next = cost + edge.meters;
        if (next < (dist.get(to) ?? Infinity)) {
          dist.set(to, next);
          prev.set(to, { id, edge: edge.id });
          heap.push([next, to]);
        }
      }
    }
    if (target === void 0) return null;
    const nodeIds = [target], edgeIds = [];
    let at = target;
    while (prev.has(at)) {
      const p = prev.get(at);
      edgeIds.unshift(p.edge);
      nodeIds.unshift(p.id);
      at = p.id;
    }
    return { meters: best, nodeIds, edgeIds, coordinates: nodeIds.map((n) => this.nodes.get(n).coordinate) };
  }
};

// node_modules/ol/math.js
function toDegrees(angleInRadians) {
  return angleInRadians * 180 / Math.PI;
}
function toRadians(angleInDegrees) {
  return angleInDegrees * Math.PI / 180;
}
function wrap(n, min, max) {
  if (n >= min && n < max) {
    return n;
  }
  const range = max - min;
  return ((n - min) % range + range) % range + min;
}

// node_modules/ol/proj/Units.js
var METERS_PER_UNIT = {
  // use the radius of the Normal sphere
  "radians": 6370997 / (2 * Math.PI),
  "degrees": 2 * Math.PI * 6370997 / 360,
  "ft": 0.3048,
  "m": 1,
  "us-ft": 1200 / 3937
};

// node_modules/ol/proj/Projection.js
var Projection = class {
  /**
   * @param {Options} options Projection options.
   */
  constructor(options) {
    this.code_ = options.code;
    this.units_ = /** @type {import("./Units.js").Units} */
    options.units;
    this.extent_ = options.extent !== void 0 ? options.extent : null;
    this.worldExtent_ = options.worldExtent !== void 0 ? options.worldExtent : null;
    this.axisOrientation_ = options.axisOrientation !== void 0 ? options.axisOrientation : "enu";
    this.global_ = options.global !== void 0 ? options.global : false;
    this.canWrapX_ = !!(this.global_ && this.extent_);
    this.getPointResolutionFunc_ = options.getPointResolution;
    this.defaultTileGrid_ = null;
    this.metersPerUnit_ = options.metersPerUnit;
  }
  /**
   * @return {boolean} The projection is suitable for wrapping the x-axis
   */
  canWrapX() {
    return this.canWrapX_;
  }
  /**
   * Get the code for this projection, e.g. 'EPSG:4326'.
   * @return {string} Code.
   * @api
   */
  getCode() {
    return this.code_;
  }
  /**
   * Get the validity extent for this projection.
   * @return {import("../extent.js").Extent} Extent.
   * @api
   */
  getExtent() {
    return this.extent_;
  }
  /**
   * Get the units of this projection.
   * @return {import("./Units.js").Units} Units.
   * @api
   */
  getUnits() {
    return this.units_;
  }
  /**
   * Get the amount of meters per unit of this projection.  If the projection is
   * not configured with `metersPerUnit` or a units identifier, the return is
   * `undefined`.
   * @return {number|undefined} Meters.
   * @api
   */
  getMetersPerUnit() {
    return this.metersPerUnit_ || METERS_PER_UNIT[this.units_];
  }
  /**
   * Get the world extent for this projection.
   * @return {import("../extent.js").Extent} Extent.
   * @api
   */
  getWorldExtent() {
    return this.worldExtent_;
  }
  /**
   * Get the axis orientation of this projection.
   * Example values are:
   * enu - the default easting, northing, elevation.
   * neu - northing, easting, up - useful for "lat/long" geographic coordinates,
   *     or south orientated transverse mercator.
   * wnu - westing, northing, up - some planetary coordinate systems have
   *     "west positive" coordinate systems
   * @return {string} Axis orientation.
   * @api
   */
  getAxisOrientation() {
    return this.axisOrientation_;
  }
  /**
   * Is this projection a global projection which spans the whole world?
   * @return {boolean} Whether the projection is global.
   * @api
   */
  isGlobal() {
    return this.global_;
  }
  /**
   * Set if the projection is a global projection which spans the whole world
   * @param {boolean} global Whether the projection is global.
   * @api
   */
  setGlobal(global) {
    this.global_ = global;
    this.canWrapX_ = !!(global && this.extent_);
  }
  /**
   * @return {import("../tilegrid/TileGrid.js").default} The default tile grid.
   */
  getDefaultTileGrid() {
    return this.defaultTileGrid_;
  }
  /**
   * @param {import("../tilegrid/TileGrid.js").default} tileGrid The default tile grid.
   */
  setDefaultTileGrid(tileGrid) {
    this.defaultTileGrid_ = tileGrid;
  }
  /**
   * Set the validity extent for this projection.
   * @param {import("../extent.js").Extent} extent Extent.
   * @api
   */
  setExtent(extent) {
    this.extent_ = extent;
    this.canWrapX_ = !!(this.global_ && extent);
  }
  /**
   * Set the world extent for this projection.
   * @param {import("../extent.js").Extent} worldExtent World extent
   *     [minlon, minlat, maxlon, maxlat].
   * @api
   */
  setWorldExtent(worldExtent) {
    this.worldExtent_ = worldExtent;
  }
  /**
   * Set the getPointResolution function (see {@link module:ol/proj.getPointResolution}
   * for this projection.
   * @param {function(number, import("../coordinate.js").Coordinate):number} func Function
   * @api
   */
  setGetPointResolution(func) {
    this.getPointResolutionFunc_ = func;
  }
  /**
   * Get the custom point resolution function for this projection (if set).
   * @return {GetPointResolution|undefined} The custom point
   * resolution function (if set).
   */
  getPointResolutionFunc() {
    return this.getPointResolutionFunc_;
  }
};
var Projection_default = Projection;

// node_modules/ol/proj/epsg3857.js
var RADIUS = 6378137;
var HALF_SIZE = Math.PI * RADIUS;
var EXTENT = [-HALF_SIZE, -HALF_SIZE, HALF_SIZE, HALF_SIZE];
var WORLD_EXTENT = [-180, -85, 180, 85];
var MAX_SAFE_Y = RADIUS * Math.log(Math.tan(Math.PI / 2));
var EPSG3857Projection = class extends Projection_default {
  /**
   * @param {string} code Code.
   */
  constructor(code) {
    super({
      code,
      units: "m",
      extent: EXTENT,
      global: true,
      worldExtent: WORLD_EXTENT,
      getPointResolution: function(resolution, point) {
        return resolution / Math.cosh(point[1] / RADIUS);
      }
    });
  }
};
var PROJECTIONS = [
  new EPSG3857Projection("EPSG:3857"),
  new EPSG3857Projection("EPSG:102100"),
  new EPSG3857Projection("EPSG:102113"),
  new EPSG3857Projection("EPSG:900913"),
  new EPSG3857Projection("http://www.opengis.net/def/crs/EPSG/0/3857"),
  new EPSG3857Projection("http://www.opengis.net/gml/srs/epsg.xml#3857")
];
function fromEPSG4326(input, output, dimension, stride) {
  const length = input.length;
  dimension = dimension > 1 ? dimension : 2;
  stride = stride ?? dimension;
  if (output === void 0) {
    if (dimension > 2) {
      output = input.slice();
    } else {
      output = new Array(length);
    }
  }
  for (let i = 0; i < length; i += stride) {
    output[i] = HALF_SIZE * input[i] / 180;
    let y = RADIUS * Math.log(Math.tan(Math.PI * (+input[i + 1] + 90) / 360));
    if (y > MAX_SAFE_Y) {
      y = MAX_SAFE_Y;
    } else if (y < -MAX_SAFE_Y) {
      y = -MAX_SAFE_Y;
    }
    output[i + 1] = y;
  }
  return output;
}
function toEPSG4326(input, output, dimension, stride) {
  const length = input.length;
  dimension = dimension > 1 ? dimension : 2;
  stride = stride ?? dimension;
  if (output === void 0) {
    if (dimension > 2) {
      output = input.slice();
    } else {
      output = new Array(length);
    }
  }
  for (let i = 0; i < length; i += stride) {
    output[i] = 180 * input[i] / HALF_SIZE;
    output[i + 1] = 360 * Math.atan(Math.exp(input[i + 1] / RADIUS)) / Math.PI - 90;
  }
  return output;
}

// node_modules/ol/proj/epsg4326.js
var RADIUS2 = 6378137;
var EXTENT2 = [-180, -90, 180, 90];
var METERS_PER_UNIT2 = Math.PI * RADIUS2 / 180;
var EPSG4326Projection = class extends Projection_default {
  /**
   * @param {string} code Code.
   * @param {string} [axisOrientation] Axis orientation.
   */
  constructor(code, axisOrientation) {
    super({
      code,
      units: "degrees",
      extent: EXTENT2,
      axisOrientation,
      global: true,
      metersPerUnit: METERS_PER_UNIT2,
      worldExtent: EXTENT2
    });
  }
};
var PROJECTIONS2 = [
  new EPSG4326Projection("CRS:84"),
  new EPSG4326Projection("EPSG:4326", "neu"),
  new EPSG4326Projection("urn:ogc:def:crs:OGC:1.3:CRS84"),
  new EPSG4326Projection("urn:ogc:def:crs:OGC:2:84"),
  new EPSG4326Projection("http://www.opengis.net/def/crs/OGC/1.3/CRS84"),
  new EPSG4326Projection("http://www.opengis.net/gml/srs/epsg.xml#4326", "neu"),
  new EPSG4326Projection("http://www.opengis.net/def/crs/EPSG/0/4326", "neu")
];

// node_modules/ol/proj/projections.js
var cache = {};
function get(code) {
  return cache[code] || cache[code.replace(/urn:(x-)?ogc:def:crs:EPSG:(.*:)?(\w+)$/, "EPSG:$3")] || null;
}
function add(code, projection) {
  cache[code] = projection;
}

// node_modules/ol/proj/transforms.js
var transforms = {};
function add2(source, destination, transformFn) {
  const sourceCode = source.getCode();
  const destinationCode = destination.getCode();
  if (!(sourceCode in transforms)) {
    transforms[sourceCode] = {};
  }
  transforms[sourceCode][destinationCode] = transformFn;
}
function get2(sourceCode, destinationCode) {
  if (sourceCode in transforms && destinationCode in transforms[sourceCode]) {
    return transforms[sourceCode][destinationCode];
  }
  return null;
}

// node_modules/ol/proj/utm.js
var K0 = 0.9996;
var E = 669438e-8;
var E2 = E * E;
var E3 = E2 * E;
var E_P2 = E / (1 - E);
var SQRT_E = Math.sqrt(1 - E);
var _E = (1 - SQRT_E) / (1 + SQRT_E);
var _E2 = _E * _E;
var _E3 = _E2 * _E;
var _E4 = _E3 * _E;
var _E5 = _E4 * _E;
var M1 = 1 - E / 4 - 3 * E2 / 64 - 5 * E3 / 256;
var M2 = 3 * E / 8 + 3 * E2 / 32 + 45 * E3 / 1024;
var M3 = 15 * E2 / 256 + 45 * E3 / 1024;
var M4 = 35 * E3 / 3072;
var P2 = 3 / 2 * _E - 27 / 32 * _E3 + 269 / 512 * _E5;
var P3 = 21 / 16 * _E2 - 55 / 32 * _E4;
var P4 = 151 / 96 * _E3 - 417 / 128 * _E5;
var P5 = 1097 / 512 * _E4;
var R = 6378137;
function toLonLat(easting, northing, zone) {
  const x = easting - 5e5;
  const y = zone.north ? northing : northing - 1e7;
  const m = y / K0;
  const mu = m / (R * M1);
  const pRad = mu + P2 * Math.sin(2 * mu) + P3 * Math.sin(4 * mu) + P4 * Math.sin(6 * mu) + P5 * Math.sin(8 * mu);
  const pSin = Math.sin(pRad);
  const pSin2 = pSin * pSin;
  const pCos = Math.cos(pRad);
  const pTan = pSin / pCos;
  const pTan2 = pTan * pTan;
  const pTan4 = pTan2 * pTan2;
  const epSin = 1 - E * pSin2;
  const epSinSqrt = Math.sqrt(1 - E * pSin2);
  const n = R / epSinSqrt;
  const r = (1 - E) / epSin;
  const c = E_P2 * pCos ** 2;
  const c2 = c * c;
  const d = x / (n * K0);
  const d2 = d * d;
  const d3 = d2 * d;
  const d4 = d3 * d;
  const d5 = d4 * d;
  const d6 = d5 * d;
  const latitude = pRad - pTan / r * (d2 / 2 - d4 / 24 * (5 + 3 * pTan2 + 10 * c - 4 * c2 - 9 * E_P2)) + d6 / 720 * (61 + 90 * pTan2 + 298 * c + 45 * pTan4 - 252 * E_P2 - 3 * c2);
  let longitude = (d - d3 / 6 * (1 + 2 * pTan2 + c) + d5 / 120 * (5 - 2 * c + 28 * pTan2 - 3 * c2 + 8 * E_P2 + 24 * pTan4)) / pCos;
  longitude = wrap(
    longitude + toRadians(zoneToCentralLongitude(zone.number)),
    -Math.PI,
    Math.PI
  );
  return [toDegrees(longitude), toDegrees(latitude)];
}
var MIN_LATITUDE = -80;
var MAX_LATITUDE = 84;
var MIN_LONGITUDE = -180;
var MAX_LONGITUDE = 180;
function fromLonLat(longitude, latitude, zone) {
  longitude = wrap(longitude, MIN_LONGITUDE, MAX_LONGITUDE);
  if (latitude < MIN_LATITUDE) {
    latitude = MIN_LATITUDE;
  } else if (latitude > MAX_LATITUDE) {
    latitude = MAX_LATITUDE;
  }
  const latRad = toRadians(latitude);
  const latSin = Math.sin(latRad);
  const latCos = Math.cos(latRad);
  const latTan = latSin / latCos;
  const latTan2 = latTan * latTan;
  const latTan4 = latTan2 * latTan2;
  const lonRad = toRadians(longitude);
  const centralLon = zoneToCentralLongitude(zone.number);
  const centralLonRad = toRadians(centralLon);
  const n = R / Math.sqrt(1 - E * latSin ** 2);
  const c = E_P2 * latCos ** 2;
  const a = latCos * wrap(lonRad - centralLonRad, -Math.PI, Math.PI);
  const a2 = a * a;
  const a3 = a2 * a;
  const a4 = a3 * a;
  const a5 = a4 * a;
  const a6 = a5 * a;
  const m = R * (M1 * latRad - M2 * Math.sin(2 * latRad) + M3 * Math.sin(4 * latRad) - M4 * Math.sin(6 * latRad));
  const easting = K0 * n * (a + a3 / 6 * (1 - latTan2 + c) + a5 / 120 * (5 - 18 * latTan2 + latTan4 + 72 * c - 58 * E_P2)) + 5e5;
  let northing = K0 * (m + n * latTan * (a2 / 2 + a4 / 24 * (5 - latTan2 + 9 * c + 4 * c ** 2) + a6 / 720 * (61 - 58 * latTan2 + latTan4 + 600 * c - 330 * E_P2)));
  if (!zone.north) {
    northing += 1e7;
  }
  return [easting, northing];
}
function zoneToCentralLongitude(zone) {
  return (zone - 1) * 6 - 180 + 3;
}
var epsgRegExes = [
  /^EPSG:(\d+)$/,
  /^urn:ogc:def:crs:EPSG::(\d+)$/,
  /^http:\/\/www\.opengis\.net\/def\/crs\/EPSG\/0\/(\d+)$/
];
function zoneFromCode(code) {
  let epsgId = 0;
  for (const re of epsgRegExes) {
    const match = code.match(re);
    if (match) {
      epsgId = parseInt(match[1]);
      break;
    }
  }
  if (!epsgId) {
    return null;
  }
  let number = 0;
  let north = false;
  if (epsgId > 32700 && epsgId < 32761) {
    number = epsgId - 32700;
  } else if (epsgId > 32600 && epsgId < 32661) {
    north = true;
    number = epsgId - 32600;
  }
  if (!number) {
    return null;
  }
  return { number, north };
}
function makeTransformFunction(transformer, zone) {
  return function(input, output, dimension, stride) {
    const length = input.length;
    dimension = dimension > 1 ? dimension : 2;
    stride = stride ?? dimension;
    if (!output) {
      if (dimension > 2) {
        output = input.slice();
      } else {
        output = new Array(length);
      }
    }
    for (let i = 0; i < length; i += stride) {
      const x = input[i];
      const y = input[i + 1];
      const coord = transformer(x, y, zone);
      output[i] = coord[0];
      output[i + 1] = coord[1];
    }
    return output;
  };
}
function makeProjection(code) {
  const zone = zoneFromCode(code);
  if (!zone) {
    return null;
  }
  return new Projection_default({ code, units: "m" });
}
function makeTransforms(projection) {
  const zone = zoneFromCode(projection.getCode());
  if (!zone) {
    return null;
  }
  return {
    forward: makeTransformFunction(fromLonLat, zone),
    inverse: makeTransformFunction(toLonLat, zone)
  };
}

// node_modules/ol/proj.js
var transformFactories = [makeTransforms];
var projectionFactories = [makeProjection];
function cloneTransform(input, output) {
  if (output !== void 0) {
    for (let i = 0, ii = input.length; i < ii; ++i) {
      output[i] = input[i];
    }
    output = output;
  } else {
    output = input.slice();
  }
  return output;
}
function addProjection(projection) {
  add(projection.getCode(), projection);
  add2(projection, projection, cloneTransform);
}
function addProjections(projections) {
  projections.forEach(addProjection);
}
function get3(projectionLike) {
  if (!(typeof projectionLike === "string")) {
    return projectionLike;
  }
  const projection = get(projectionLike);
  if (projection) {
    return projection;
  }
  for (const makeProjection2 of projectionFactories) {
    const projection2 = makeProjection2(projectionLike);
    if (projection2) {
      return projection2;
    }
  }
  return null;
}
function addEquivalentProjections(projections) {
  addProjections(projections);
  projections.forEach(function(source) {
    projections.forEach(function(destination) {
      if (source !== destination) {
        add2(source, destination, cloneTransform);
      }
    });
  });
}
function addEquivalentTransforms(projections1, projections2, forwardTransform, inverseTransform) {
  projections1.forEach(function(projection1) {
    projections2.forEach(function(projection2) {
      add2(projection1, projection2, forwardTransform);
      add2(projection2, projection1, inverseTransform);
    });
  });
}
function getTransformFromProjections(source, destination) {
  const sourceCode = source.getCode();
  const destinationCode = destination.getCode();
  let transformFunc = get2(sourceCode, destinationCode);
  if (transformFunc) {
    return transformFunc;
  }
  let sourceTransforms = null;
  let destinationTransforms = null;
  for (const makeTransforms2 of transformFactories) {
    if (!sourceTransforms) {
      sourceTransforms = makeTransforms2(source);
    }
    if (!destinationTransforms) {
      destinationTransforms = makeTransforms2(destination);
    }
  }
  if (!sourceTransforms && !destinationTransforms) {
    return null;
  }
  const intermediateCode = "EPSG:4326";
  if (!destinationTransforms) {
    const toDestination = get2(intermediateCode, destinationCode);
    if (toDestination) {
      transformFunc = composeTransformFuncs(
        sourceTransforms.inverse,
        toDestination
      );
    }
  } else if (!sourceTransforms) {
    const fromSource = get2(sourceCode, intermediateCode);
    if (fromSource) {
      transformFunc = composeTransformFuncs(
        fromSource,
        destinationTransforms.forward
      );
    }
  } else {
    transformFunc = composeTransformFuncs(
      sourceTransforms.inverse,
      destinationTransforms.forward
    );
  }
  if (transformFunc) {
    addProjection(source);
    addProjection(destination);
    add2(source, destination, transformFunc);
  }
  return transformFunc;
}
function composeTransformFuncs(t1, t2) {
  return function(input, output, dimensions, stride) {
    output = t1(input, output, dimensions, stride);
    return t2(output, output, dimensions, stride);
  };
}
function getTransform(source, destination) {
  const sourceProjection = get3(source);
  const destinationProjection = get3(destination);
  return getTransformFromProjections(sourceProjection, destinationProjection);
}
function transform(coordinate, source, destination) {
  const transformFunc = getTransform(source, destination);
  if (!transformFunc) {
    const sourceCode = get3(source).getCode();
    const destinationCode = get3(destination).getCode();
    throw new Error(
      `No transform available between ${sourceCode} and ${destinationCode}`
    );
  }
  return transformFunc(coordinate, void 0, coordinate.length);
}
function addCommon() {
  addEquivalentProjections(PROJECTIONS);
  addEquivalentProjections(PROJECTIONS2);
  addEquivalentTransforms(
    PROJECTIONS2,
    PROJECTIONS,
    fromEPSG4326,
    toEPSG4326
  );
}
addCommon();

// scripts/map-geometry.mjs
function ringContains(p, ring) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])
      yes = !yes;
  }
  return yes;
}
function contains(p, g) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  return polys.some((rings) => ringContains(p, rings[0]) && !rings.slice(1).some((r) => ringContains(p, r)));
}
var cross = (x, y, u, v) => x * v - y * u;
function boundary(p, g) {
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polygons.some(
    (rings) => rings.some(
      (ring) => ring.slice(1).some((b, i) => {
        const a = ring[i], dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
        if (!len) return false;
        const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
        return t >= 0 && t <= 1 && Math.abs(cross(p[0] - a[0], p[1] - a[1], dx, dy)) / Math.sqrt(len) < 1e-11;
      })
    )
  );
}
function crossesInterior(a, b, g) {
  const rx = b[0] - a[0], ry = b[1] - a[1], times = [0, 1];
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  for (const rings of polygons)
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++) {
        const c = ring[i - 1], d = ring[i], sx = d[0] - c[0], sy = d[1] - c[1], denom = cross(rx, ry, sx, sy);
        if (Math.abs(denom) < 1e-22) continue;
        const qx = c[0] - a[0], qy = c[1] - a[1], t = cross(qx, qy, sx, sy) / denom, u = cross(qx, qy, rx, ry) / denom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) times.push(t);
      }
  times.sort((x, y) => x - y);
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] < 1e-12) continue;
    const t = (times[i] + times[i - 1]) / 2, p = [a[0] + rx * t, a[1] + ry * t];
    if (contains(p, g) && !boundary(p, g)) return true;
  }
  return false;
}

// src/main/mapProfile.ts
function fromLocal(e, n) {
  return transform([e + 217e3, n + 3355200], "EPSG:32651", "EPSG:4326");
}
function toLocal(c) {
  const p = transform(c, "EPSG:4326", "EPSG:32651");
  return [p[0] - 217e3, p[1] - 3355200];
}
function project(p, a, b) {
  const cos = Math.cos(p[1] * Math.PI / 180), x = (b[0] - a[0]) * cos, y = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * cos * x + (p[1] - a[1]) * y) / (x * x + y * y || 1)));
  return { t, q: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
}
var cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
var intersect = (a, b, c, d) => cross2(a, b, c) * cross2(a, b, d) <= 0 && cross2(c, d, a) * cross2(c, d, b) <= 0 && Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) && Math.min(a[0], b[0]) <= Math.max(c[0], d[0]) && Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) && Math.min(a[1], b[1]) <= Math.max(c[1], d[1]);
function estimateAccess(points, graph, geography, changed, scope = "personal") {
  if (!changed.size) return graph;
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const obstacles = (geography.features || []).filter((f) => !f.properties.undergroundStation && ["building", "water", "barrier", "access-review-area"].includes(f.properties.kind));
  const reviewAreas = obstacles.filter((f) => f.properties.kind === "access-review-area");
  const flows = (geography.features || []).filter((f) => f.properties.kind === "waterway" && !["culvert", "yes"].includes(f.properties.tunnel)).flatMap((f) => f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : []);
  const walls = obstacles.filter((f) => f.properties.kind === "barrier").flatMap((f) => f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : []);
  const gates = graph.nodes.filter((n) => n.barrier?.includes("gate"));
  const splits = /* @__PURE__ */ new Map();
  for (const place of points.filter((p) => changed.has(p.id))) {
    const review = reviewAreas.find((f) => contains(place.coordinate, f.geometry));
    if (review) {
      place.accessCandidates = [];
      place.accessReviewBasis = review.properties.accessReviewBasis;
      continue;
    }
    delete place.accessReviewBasis;
    const station = place.undergroundStation && !place.personal?.referencePoint;
    if (!station && place.entrances.some((e) => e.connected)) continue;
    const origins = station ? place.entrances : [{ id: "", name: "", coordinate: place.coordinate, source: "", structureId: void 0 }];
    place.accessCandidates = station ? (place.accessCandidates || []).filter((candidate) => candidate.kind === "entrance") : [];
    for (const origin of origins) {
      const start = origin.coordinate, candidates = [];
      if (reviewAreas.some((f) => contains(start, f.geometry))) continue;
      for (const edge of graph.edges) {
        if (edge.conditions?.length || !allowsFootAccess(edge.foot)) continue;
        const a = nodes.get(edge.from).coordinate, b = nodes.get(edge.to).coordinate;
        if (Math.abs((a[1] + b[1]) / 2 - start[1]) > Math.abs(a[1] - b[1]) / 2 + 8e-4) continue;
        const { t, q } = project(start, a, b), meters = metersBetween(start, q);
        if (meters > 80) continue;
        const blocked = obstacles.some((f) => {
          if (!["Polygon", "MultiPolygon"].includes(f.geometry.type)) return false;
          if (f.properties.kind === "building" && (f.id === place.id || f.id === origin.structureId || contains(start, f.geometry))) return false;
          return crossesInterior(start, q, f.geometry);
        }) || walls.some((ring) => ring.slice(1).some((d, i) => intersect(start, q, ring[i], d))) || flows.some((ring) => ring.slice(1).some((d, i) => intersect(start, q, ring[i], d) && cross2(ring[i], d, start) * cross2(ring[i], d, q) < 0)) || gates.some((g) => metersBetween(g.coordinate, project(g.coordinate, start, q).q) < 1.5);
        if (!blocked) candidates.push({ edge, t, q, meters });
      }
      const chosen = [];
      for (const c of candidates.sort((a, b) => a.meters - b.meters || a.edge.id.localeCompare(b.edge.id))) {
        if (chosen.some((x) => metersBetween(x.q, c.q) < 3)) continue;
        chosen.push(c);
        if (chosen.length === 6) break;
      }
      place.accessCandidates.push(...chosen.map((c, i) => {
        const suffix = origin.id ? `${origin.id}/${i}` : String(i);
        const existing = splits.get(c.edge.id)?.find((split) => Math.abs(split.t - c.t) < 1e-8);
        const id = c.t < 1e-8 ? c.edge.from : c.t > 1 - 1e-8 ? c.edge.to : existing?.id || `${scope}-access/${place.id}/${suffix}`;
        if (!nodes.has(id)) {
          nodes.set(id, { id, coordinate: c.q });
          splits.set(c.edge.id, [...splits.get(c.edge.id) || [], { t: c.t, id }]);
        }
        return { id: `estimate/${place.id}/${suffix}`, entranceId: origin.id || void 0, nodeId: id, kind: "estimate", name: origin.id ? `${origin.name}\u63A5\u5165\u4F30\u8BA1` : scope === "public" ? "\u8DEF\u7F51\u63A5\u5165\u4F30\u8BA1" : "\u4E2A\u4EBA\u53C2\u8003\u70B9\u63A5\u5165\u4F30\u8BA1", coordinate: c.q, coordinates: [start, c.q], meters: c.meters, source: origin.source ? `${origin.source}; ${c.edge.way}` : c.edge.way, conditions: [], stairs: c.edge.stairs };
      }));
    }
  }
  const edges = graph.edges.flatMap((e) => {
    const split = splits.get(e.id);
    if (!split) return [e];
    const chain = [{ t: 0, id: e.from }, ...split, { t: 1, id: e.to }].sort((a, b) => a.t - b.t);
    return chain.slice(1).map((b, i) => ({ ...e, id: e.id + (scope === "public" ? ":public:" : ":profile:") + i, sourceEdge: e.sourceEdge || e.id, from: chain[i].id, to: b.id, meters: Math.max(1e-8, (b.t - chain[i].t) * e.meters) }));
  });
  return { ...graph, nodes: [...nodes.values()], edges };
}

// src/shared/map-names.ts
function normalizeMapName(value) {
  let s = value.toLowerCase();
  const digits = "\u96F6\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D";
  s = s.replace(/[一二三四五六七八九]?十[一二三四五六七八九]?/g, (part) => {
    const [tens, ones] = part.split("\u5341");
    return String((tens ? digits.indexOf(tens) : 1) * 10 + (ones ? digits.indexOf(ones) : 0));
  });
  for (const [i, c] of [..."\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D"].entries()) s = s.replaceAll(c, String(i + 1));
  return s.replace(/([东西北])教([0-9]+)/g, "$1$2").replace(/教学楼|教学|号楼|宿舍|幢|舍|楼|[\s·（）()\-]/g, "");
}
function mapQueryTexts(query, scopeLabel) {
  const text = query.trim(), scope = scopeLabel?.split(/[·•|｜]/, 1)[0].trim().replace(/\s+/g, ""), compact = text.replace(/\s+/g, "");
  if (!scope || !compact.toLowerCase().startsWith(scope.toLowerCase())) return [text];
  const local = compact.slice(scope.length).replace(/^[·•:：/\-\s]+/, "");
  return local ? [text, local] : [text];
}
function mapNameScore(point, text) {
  const normalized = normalizeMapName(text);
  const literalCategory = !normalized && !!text;
  const normalize = literalCategory ? (value) => value.trim().toLowerCase() : normalizeMapName;
  const q = normalized || text.toLowerCase();
  const names = [point.displayName, ...point.aliases].map(normalize), display = normalize(point.displayName);
  return literalCategory ? display.includes(q) ? normalizeMapName(point.displayName) ? 200 : 100 : names.some((n) => n.includes(q)) ? 50 : 0 : display === q ? 200 : names.includes(q) ? 180 : names.some((n) => n.startsWith(q)) ? 100 : names.some((n) => n.includes(q)) ? 50 : 0;
}
function rankMapPoints(points, query, scopeLabel) {
  const terms = mapQueryTexts(query, scopeLabel);
  return points.filter((p) => !p.historicalReference || !!p.personal || p.id === query).map((p) => {
    if (p.id === query) return { p, score: 1e3, tier: 4 };
    const direct = mapNameScore(p, terms[0]), qualified = terms.length > 1 ? mapNameScore(p, terms[1]) : 0;
    return direct >= 180 ? { p, score: direct, tier: 3 } : qualified >= 180 ? { p, score: qualified, tier: 2 } : direct > 0 ? { p, score: direct, tier: 1 } : { p, score: qualified, tier: 0 };
  }).filter((v) => v.score > 0).sort((a, b) => b.tier - a.tier || b.score - a.score || a.p.displayName.localeCompare(b.p.displayName, "zh-CN")).map((v) => v.p);
}

// src/main/map-workout.ts
var minimumSearchM = 5;
var maximumAccuracyM = 30;
var outputCandidateLimit = 6;
function validCoordinate(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
function project2(point, a, b) {
  const cos = Math.cos(point[1] * Math.PI / 180);
  const x = (b[0] - a[0]) * cos, y = b[1] - a[1];
  const fraction = Math.max(0, Math.min(
    1,
    ((point[0] - a[0]) * cos * x + (point[1] - a[1]) * y) / (x * x + y * y || 1)
  ));
  const coordinate = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  return { coordinate, fraction, residualM: metersBetween(point, coordinate) };
}
function validArea(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return false;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return Array.isArray(polygons) && polygons.length > 0 && polygons.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(validCoordinate) && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]));
}
function boundaryDistance(point, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let nearest = Infinity;
  for (const polygon of polygons) for (const ring of polygon)
    for (let i = 1; i < ring.length; i++) nearest = Math.min(nearest, project2(point, ring[i - 1], ring[i]).residualM);
  return nearest;
}
var CampusWorkoutMatcher = class {
  constructor(graph, manifest, venues, geography) {
    this.graph = graph;
    this.manifest = manifest;
    const nodes = new Map(graph.nodes.map((node) => [node.id, node.coordinate]));
    this.segments = [];
    let invalidEdges = false;
    for (const edge of graph.edges) {
      const a = nodes.get(edge.from), b = nodes.get(edge.to);
      if (!a || !b || !validCoordinate(a) || !validCoordinate(b) || !Number.isFinite(edge.meters) || edge.meters <= 0) {
        invalidEdges = true;
        continue;
      }
      if (!edge.way.startsWith("way/") || !allowsFootAccess(edge.foot)) continue;
      this.segments.push({ edge: structuredClone(edge), a: [...a], b: [...b] });
    }
    const byId = new Map(venues.map((venue) => [venue.id, venue]));
    this.venueAreas = [];
    for (const [index, feature] of geography.features.entries()) {
      const venue = byId.get(String(feature.id));
      if (!venue) continue;
      if (!validArea(feature.geometry)) {
        invalidEdges = true;
        continue;
      }
      this.venueAreas.push({ venue, geometry: structuredClone(feature.geometry), index, role: String(feature.properties?.role || "") });
    }
    this.ready = !invalidEdges && this.venueAreas.length === venues.length && venues.every((venue) => venue.geometryVersion === manifest.version) && manifest.dataStatus !== "error" && manifest.dataStatus !== "partial" && manifest.crs === "EPSG:4326" && graph.version === manifest.version && this.segments.length > 0;
  }
  graph;
  manifest;
  segments;
  venueAreas;
  ready;
  match(fix) {
    const accuracy = typeof fix.accuracy === "number" && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 ? fix.accuracy : null;
    const result = {
      method: "campus-local-candidates/v1",
      state: "unavailable",
      reason: "invalid-fix",
      mapVersion: this.manifest.version,
      mapLabel: this.manifest.label,
      mapSourceDate: this.manifest.sourceDate,
      networkSha256: this.manifest.componentHashes?.["network.json"] || null,
      geographySha256: this.manifest.componentHashes?.["geography.geojson"] || null,
      sharedFactsSha256: this.manifest.componentHashes?.["shared-facts.json"] || null,
      observedAt: fix.timestamp,
      fixSource: fix.source,
      provenance: fix.mock === true || fix.provenance === "simulated" ? "simulated" : fix.provenance === "device" && fix.mock === false ? "device" : "unknown",
      horizontalAccuracyM: accuracy,
      mapAccuracyM: null,
      searchRadiusM: null,
      candidates: [],
      candidateCount: 0,
      venues: [],
      interpolated: false,
      lapCount: null
    };
    if (fix.crs !== "EPSG:4326" || !validCoordinate(fix.coordinate) || !Number.isFinite(fix.timestamp) || fix.timestamp <= 0 || fix.accuracy !== null && accuracy === null) return result;
    if (!this.ready) return { ...result, reason: "map-unavailable" };
    if (!inBounds(fix.coordinate, this.manifest.bounds)) return { ...result, state: "unmatched", reason: "outside-map" };
    if (accuracy === null) return { ...result, state: "weak-signal", reason: "accuracy-missing" };
    if (accuracy > maximumAccuracyM) return { ...result, state: "weak-signal", reason: "accuracy-too-wide" };
    const radius = Math.max(minimumSearchM, accuracy);
    result.searchRadiusM = radius;
    result.venues = this.observeVenues(fix.coordinate, radius);
    const nearestBySource = /* @__PURE__ */ new Map();
    for (const { edge, a, b } of this.segments) {
      const nearest = project2(fix.coordinate, a, b);
      if (nearest.residualM > radius) continue;
      const candidate = {
        edgeId: edge.id,
        sourceEdgeId: edge.sourceEdge || edge.id,
        wayId: edge.way,
        name: edge.name,
        ...nearest,
        conditions: [...edge.conditions || []],
        sourceLocator: "assets/map-v2/network.json"
      };
      const previous = nearestBySource.get(candidate.sourceEdgeId);
      if (!previous || candidate.residualM < previous.residualM || candidate.residualM === previous.residualM && candidate.edgeId.localeCompare(previous.edgeId) < 0)
        nearestBySource.set(candidate.sourceEdgeId, candidate);
    }
    const candidates = [...nearestBySource.values()];
    candidates.sort((a, b) => a.residualM - b.residualM || a.edgeId.localeCompare(b.edgeId));
    result.candidateCount = candidates.length;
    result.candidates = candidates.slice(0, outputCandidateLimit);
    if (!candidates.length) return { ...result, state: "unmatched", reason: "no-recorded-road" };
    if (candidates.length > 1) return { ...result, state: "ambiguous", reason: "multiple-candidates" };
    return { ...result, state: "candidate", reason: "one-candidate", selected: candidates[0] };
  }
  observeVenues(point, radius) {
    return this.venueAreas.flatMap(({ venue, geometry, index, role }) => {
      const inside = contains(point, geometry), distance = boundaryDistance(point, geometry);
      if (!inside && distance > radius) return [];
      return [{
        venueId: venue.id,
        name: venue.name,
        relation: inside && distance > radius ? "inside-recorded-area" : "near-recorded-boundary",
        boundaryDistanceM: distance,
        geometryVersion: venue.geometryVersion,
        geometryBasis: role === "running-track" ? "source-track-area" : "source-venue-outline",
        nominalLapM: venue.nominalLapM,
        nominalLapBasis: venue.nominalLapBasis || venue.lapBasis,
        referenceLoopM: venue.loop && Number.isFinite(venue.geometricLoopM) ? venue.geometricLoopM : null,
        referenceLoopBasis: venue.lapBasis,
        venueSourceLocator: `assets/map-v2/venues.json#${venue.id}`,
        sourceLocator: `assets/map-v2/geography.geojson#/features/${index}`,
        lapCount: null
      }];
    });
  }
};

// src/shared/map-v3.ts
function retainUnverifiedOfficialCorrespondences(facts) {
  const reviewed = /* @__PURE__ */ new Map();
  for (const [index, link] of (facts.fidelityObservations?.reviewedReferenceLinks || []).entries()) {
    const locator = `shared-facts.json#/fidelityObservations/reviewedReferenceLinks/${index}`;
    for (const id of link.official || []) reviewed.set("wfs/" + id, { id: link.id, locator });
    for (const id of link.legacy || []) reviewed.set(id, { id: link.id, locator });
  }
  const corrections = facts.fidelityObservations?.westArchitectureObservations?.silverSupplement?.canonicalCorrectionsForIntegration || [];
  for (const [index, link] of corrections.entries()) {
    const locator = `shared-facts.json#/fidelityObservations/westArchitectureObservations/silverSupplement/canonicalCorrectionsForIntegration/${index}`;
    for (const id of link.officialIds || []) reviewed.set("wfs/" + id, { id: link.id, locator });
  }
  const officialToCanonical = Object.fromEntries(Object.entries(facts.officialToCanonical || {}).map(([id, record]) => {
    if (record.basis === "official reference only; footprint not identified" || record.basis === "legacy official reference only; footprint not identified") {
      return [id, { ...record, identityStatus: "reference-only", evidence: { kind: "reference-only" } }];
    }
    if (record.basis !== "public name/spatial correspondence" && record.basis !== "legacy official name and nearby ground location") return [id, record];
    const link = reviewed.get(id), recorded = link?.id === record.id;
    return [id, {
      ...record,
      reportedBasis: record.basis,
      basis: recorded ? "recorded link; physical identity unverified" : "retained name/spatial candidate; physical identity unverified",
      identityStatus: "unverified",
      evidence: recorded ? { kind: "recorded-link", locator: link.locator } : { kind: "name-spatial-candidate" }
    }];
  }));
  return { ...facts, officialToCanonical };
}
function qualifyUndergroundStations(points, graph, geography, display, observations) {
  const sources = new Map(geography.features.map((feature) => [String(feature.id), feature.properties]));
  for (const station of observations) {
    const source = sources.get(station.id);
    if (source?.version !== station.sourceVersion || source.building !== "train_station" || !(Number(source.layer) < 0)) throw new Error("Underground station source changed");
    for (const way of station.interiorWays) {
      const source2 = sources.get(way.id);
      if (source2?.version !== way.version || !(Number(source2.layer) < 0) || !["yes", "culvert"].includes(String(source2.tunnel))) throw new Error("Station passage source changed");
    }
    for (const entrance of station.entrances) if (entrance.structureId && sources.get(entrance.structureId)?.version !== entrance.structureVersion) throw new Error("Station entrance structure changed");
  }
  const stations = new Map(observations.map((item) => [item.id, item]));
  const interiors = new Set(observations.flatMap((station) => station.interiorWays.map((way) => way.id)));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const feature of geography.features) if (stations.has(String(feature.id)) && feature.properties) feature.properties.undergroundStation = true;
  for (const feature of display.features) {
    if (!feature.properties) continue;
    if (stations.has(String(feature.id))) feature.properties.kind = "underground-station";
    else if (interiors.has(String(feature.id))) feature.properties.kind = "station-interior";
  }
  for (const point of points) {
    const record = stations.get(point.id);
    if (!record) continue;
    point.undergroundStation = true;
    point.aliases = [.../* @__PURE__ */ new Set([...point.aliases, point.displayName + "\u7AD9", point.displayName + "\u5730\u94C1\u7AD9"])];
    point.entrances = record.entrances.map((entrance) => ({ ...entrance, connected: entrance.coordinate.every((value, i) => nodes.get(entrance.id)?.coordinate[i] === value) }));
    point.accessCandidates = point.entrances.filter((entrance) => entrance.connected).map((entrance) => ({
      id: "entrance/" + entrance.id,
      entranceId: entrance.id,
      nodeId: entrance.id,
      kind: "entrance",
      name: entrance.name,
      coordinate: entrance.coordinate,
      coordinates: [entrance.coordinate],
      meters: 0,
      source: entrance.source
    }));
    point.modelBasis = "\u5730\u4E0B\u8F66\u7AD9\uFF1B\u8F6E\u5ED3\u53EA\u8868\u793A\u6E90\u6570\u636E\u4E2D\u7684\u7AD9\u4F53\u8303\u56F4\u3002\u6B65\u884C\u8DEF\u7EBF\u4EE5\u5DF2\u8BB0\u5F55\u51FA\u5165\u53E3\u4E3A\u7AEF\u70B9\uFF0C\u4E0D\u5305\u542B\u8FDB\u7AD9\u3001\u4E58\u8F66\u6216\u7AD9\u5185\u6362\u4E58\u3002";
  }
  return { ...graph, edges: graph.edges.map((edge) => interiors.has(edge.way) ? { ...edge, conditions: [.../* @__PURE__ */ new Set([...edge.conditions || [], "indoor_passage_unverified"])] } : edge) };
}
var bridgeStatusUnverified = "bridge_status_unverified";
var inactiveBridgeValues = /* @__PURE__ */ new Set(["abandoned", "disused", "demolished", "dismantled", "removed", "razed"]);
function retainBridgeStatusConditions(graph, geography) {
  const uncertain = new Set(geography.features.filter((feature) => {
    const value = feature.properties?.bridge;
    return typeof value === "string" && inactiveBridgeValues.has(value.trim().toLowerCase());
  }).map((feature) => String(feature.id)));
  return { ...graph, edges: graph.edges.map((edge) => uncertain.has(edge.way) && !edge.conditions?.includes(bridgeStatusUnverified) ? { ...edge, conditions: [...edge.conditions || [], bridgeStatusUnverified] } : edge) };
}
var publishedFootRestrictions = [{
  way: "way/588262375",
  foot: "no",
  version: 6,
  sourceTimestamp: "2026-09-29T08:04:59Z",
  sourceUrl: "https://api.openstreetmap.org/api/0.6/way/588262375.json",
  sourceSegments: ["way/588262375:0", "way/588262375:1", "way/588262375:2", "way/588262375:3"]
}];
function retainPublishedFootRestrictions(graph) {
  return { ...graph, edges: graph.edges.map((edge) => publishedFootRestrictions.some((observation) => observation.way === edge.way && observation.sourceSegments.includes(edge.sourceEdge || edge.id)) ? { ...edge, foot: "no" } : edge) };
}
var publishedPlaceAccessUncertainty = [{
  placeId: "official/hotmap_221027.1264",
  name: "\u4E1C\u4E00\u95E8\uFF08\u6E38\u6CF3\u9986\u95E8\uFF09",
  sourceUrl: "http://www.zwc.zju.edu.cn/2026/0930/c22012a3210902/page.htm",
  publishedDate: "2026-09-30",
  scheduledStart: "2026-10-01",
  expectedCompletion: "2026-10-11",
  conditions: ["gate_opening_unverified"]
}];
function retainPublishedPlaceAccessConditions(points) {
  return points.map((point) => {
    const observation = publishedPlaceAccessUncertainty.find((item) => item.placeId === point.id);
    if (!observation) return point;
    const candidates = point.accessCandidates ?? point.entrances.filter((e) => e.connected).map((e) => ({
      id: "entrance/" + e.id,
      nodeId: e.id,
      kind: "entrance",
      name: e.name,
      coordinate: e.coordinate,
      coordinates: [e.coordinate],
      meters: 0,
      source: e.source
    }));
    return { ...point, accessCandidates: candidates.map((candidate) => ({
      ...candidate,
      conditions: [.../* @__PURE__ */ new Set([...candidate.conditions || [], ...observation.conditions])]
    })) };
  });
}
function routeConditionWarning(conditions) {
  const remaining = new Set(conditions);
  if (!remaining.size) return;
  const descriptions = [
    [bridgeStatusUnverified, "\u5386\u53F2\u6865\u4F4D", "\u8FD9\u6761\u5047\u8BBE\u8DEF\u7EBF\u7ECF\u8FC7\u5386\u53F2\u6865\u4F4D\uFF0C\u6865\u7684\u73B0\u72B6\u5C1A\u672A\u6838\u5B9E\u3002"],
    ["redeveloped_site_access_unverified", "\u91CD\u5EFA\u7247\u533A\u7684\u65E7\u901A\u8DEF", "\u8FD9\u6761\u5047\u8BBE\u8DEF\u7EBF\u7ECF\u8FC7\u91CD\u5EFA\u7247\u533A\uFF0C\u65E7\u901A\u8DEF\u7684\u73B0\u72B6\u5C1A\u672A\u6838\u5B9E\u3002"],
    ["indoor_passage_unverified", "\u5BA4\u5185\u901A\u9053", "\u8FD9\u6761\u5047\u8BBE\u8DEF\u7EBF\u5305\u542B\u5BA4\u5185\u901A\u9053\uFF0C\u5F53\u524D\u901A\u884C\u6761\u4EF6\u5C1A\u672A\u6838\u5B9E\u3002"],
    ["gate_opening_unverified", "\u95E8\u7981", "\u5DF2\u6309\u4F60\u7684\u9009\u62E9\u5305\u542B\u5F85\u6838\u901A\u8DEF\uFF1B\u8FD9\u662F\u5047\u8BBE\u8DEF\u7EBF\uFF0C\u4E0D\u4EE3\u8868\u95E8\u5DF2\u5F00\u653E\u3002"]
  ];
  const labels = [];
  for (const [id, label, single] of descriptions) if (remaining.has(id)) {
    if (conditions.every((c) => c === id)) return single;
    labels.push(label);
    remaining.delete(id);
  }
  if (remaining.size) labels.push("\u5176\u4ED6\u5F85\u6838\u901A\u8DEF");
  return `\u8FD9\u6761\u5047\u8BBE\u8DEF\u7EBF\u6D89\u53CA${labels.join("\u3001")}\uFF0C\u76F8\u5173\u901A\u884C\u73B0\u72B6\u5C1A\u672A\u6838\u5B9E\u3002`;
}
var legacyIslandParents = new Map([
  ...Array.from({ length: 12 }, (_, n) => [`island/amphitheatre-step-${n}`, "island/amphitheatre"]),
  ...Array.from({ length: 3 }, (_, n) => [`island/waterfront-terrace-${n}`, "island/waterfront"])
]);
function restoreLandscapeDetailParents(details, parentIds) {
  const result = structuredClone(details);
  for (const feature of result.features) {
    const p = feature.properties, id = String(feature.id);
    if (!p || p.kind !== "landscape-step" || p.parentId) continue;
    const parent = legacyIslandParents.get(id);
    if (parent && parentIds.has(parent)) p.parentId = parent;
  }
  return result;
}
function restoreRecordedRoadDisplays(display, graph) {
  const result = { ...display, features: [...display.features] }, nodes = new Map(graph.nodes.map((n) => [n.id, n.coordinate]));
  const byWay = /* @__PURE__ */ new Map();
  for (const edge of graph.edges) {
    const edges = byWay.get(edge.way) || [];
    edges.push(edge);
    byWay.set(edge.way, edges);
  }
  for (let index = 0; index < result.features.length; index++) {
    const feature = result.features[index];
    const p = feature.properties;
    if (!p || p.kind !== "source-history") continue;
    const edges = byWay.get(String(feature.id)) || [], ordinary = edges.filter((e) => !e.conditions?.length);
    if (!ordinary.length) continue;
    if (!feature.geometry || !["LineString", "MultiLineString"].includes(feature.geometry.type))
      throw new Error("Source road display requires line geometry");
    const runs = [];
    for (const edge of ordinary) {
      const from = nodes.get(edge.from), to = nodes.get(edge.to);
      if (!from || !to || [from, to].some((c) => c.length !== 2 || !c.every(Number.isFinite) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90))
        throw new Error("Source road display node is unavailable");
      const run = runs.at(-1);
      if (run?.end === edge.from) {
        run.coordinates.push([...to]);
        run.end = edge.to;
      } else if (run?.end === edge.to) {
        run.coordinates.push([...from]);
        run.end = edge.from;
      } else if (run?.start === edge.to) {
        run.coordinates.unshift([...from]);
        run.start = edge.from;
      } else if (run?.start === edge.from) {
        run.coordinates.unshift([...to]);
        run.start = edge.to;
      } else runs.push({ start: edge.from, end: edge.to, coordinates: [[...from], [...to]] });
    }
    const geometry = runs.length === 1 ? { type: "LineString", coordinates: runs[0].coordinates } : { type: "MultiLineString", coordinates: runs.map((r) => r.coordinates) };
    result.features[index] = { ...feature, geometry, properties: {
      ...p,
      kind: "road",
      sourceDisplayKind: "source-history",
      recordedDisplayEdgeIds: ordinary.map((e) => e.id),
      conditionalSourceEdgeIds: edges.filter((e) => e.conditions?.length).map((e) => e.id)
    } };
  }
  return result;
}

// src/main/mapService.ts
var unavailablePersonalMapRead = (error) => error instanceof SyntaxError || !!error && typeof error === "object" && "code" in error && ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(String(error.code));
var CampusMapAdapter = class _CampusMapAdapter {
  constructor(directory2, options = {}) {
    this.directory = directory2;
    this.options = options;
    const read = (name) => JSON.parse(readFileSync(default2.join(directory2, name), "utf8"));
    this.points = [];
    this.manifest = {
      schemaVersion: "campus-map/v2",
      version: "unavailable",
      sourceDate: "",
      acquiredAt: "",
      bounds: [120.06, 30.293, 120.101, 30.326],
      campusBounds: [120.063, 30.296, 120.088, 30.319],
      label: "\u7D2B\u91D1\u6E2F \xB7 \u5DF2\u8BB0\u5F55\u7684\u5468\u8FB9",
      crs: "EPSG:4326",
      coordinateOrder: "longitude, latitude",
      renderProjection: "EPSG:3857",
      distance: "meters",
      license: "ODbL-1.0",
      attribution: "\xA9 OpenStreetMap contributors",
      source: "https://www.openstreetmap.org",
      copyright: "https://www.openstreetmap.org/copyright",
      buildings: 0,
      selectable: 0,
      entrances: 0,
      connectedEntrances: 0,
      routableBuildings: 0,
      nodes: 0,
      edges: 0,
      features: 0,
      rejected: {},
      limitations: []
    };
    let walking;
    try {
      const manifest = read("manifest.json");
      if (manifest.schemaVersion !== "campus-map/v2") throw new Error("incompatible");
      this.manifest = { ...manifest, dataStatus: "ready" };
      for (const [name, expected] of Object.entries(manifest.componentHashes || {})) {
        if (!/^[a-z-]+\.(json|geojson)$/.test(name)) throw new Error("Invalid map component name");
        if (createHash("sha256").update(readFileSync(default2.join(directory2, name))).digest("hex") !== expected) throw new Error("Map components changed during load");
      }
      this.points = read("places.json");
      try {
        const facts = retainUnverifiedOfficialCorrespondences(read("shared-facts.json"));
        if (facts.version !== manifest.version) throw new Error("Shared fact version mismatch");
        this.redirects = facts.legacyPlaceRedirects || {};
        this.official = facts.officialToCanonical || {};
        this.originalReferences = facts.originalLocatorReferences || {};
        this.sharedFacts = facts;
        this.geography = read("geography.geojson");
        const display = read("display-geography.geojson");
        this.displayGeography = display;
        this.sports = restoreLandscapeDetailParents(read("sports-details.geojson"), new Set(display.features.map((f) => String(f.id))));
      } catch (error) {
        if (manifest.implementation === "campus-map/v3") throw error;
      }
      if (!Array.isArray(this.points) || this.points.some(
        (p) => !p || typeof p.id !== "string" || typeof p.displayName !== "string" || !Array.isArray(p.coordinate) || p.coordinate.length !== 2 || !p.coordinate.every(Number.isFinite) || !Array.isArray(p.bounds) || p.bounds.length !== 4 || !p.bounds.every(Number.isFinite) || !Array.isArray(p.entrances)
      )) {
        this.points = [];
        throw new Error("places");
      }
      this.points = retainPublishedPlaceAccessConditions(this.points);
      const recordedGraph = read("network.json");
      const qualifiedGraph = qualifyUndergroundStations(this.points, retainPublishedFootRestrictions(retainBridgeStatusConditions(recordedGraph, this.geography)), this.geography, this.displayGeography, this.sharedFacts?.fidelityObservations?.undergroundStations || []);
      const supplementIds = new Set((this.sharedFacts?.buildingSupplement?.members || []).map((member) => member.id));
      const missingAccess = new Set(this.points.filter((point) => point.undergroundStation || supplementIds.has(point.id) && !point.accessCandidates?.length && !point.accessReviewBasis).map((point) => point.id));
      const graph = estimateAccess(this.points, qualifiedGraph, this.geography, missingAccess, "public");
      if (missingAccess.size) this.manifest = {
        ...this.manifest,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        entrances: this.points.reduce((n, p) => n + p.entrances.length, 0),
        connectedEntrances: this.points.reduce((n, p) => n + p.entrances.filter((e) => e.connected).length, 0),
        routableBuildings: this.points.filter((p) => p.kind === "building" && p.accessCandidates?.length).length,
        estimatedAccessCandidates: this.points.reduce((n, p) => n + (p.accessCandidates || []).filter((a) => a.kind === "estimate").length, 0)
      };
      this.baseGraph = graph;
      if (graph.version !== this.manifest.version) throw new Error("version");
      walking = new WalkingGraph(graph);
      if (manifest.implementation === "campus-map/v3")
        this.displayGeography = restoreRecordedRoadDisplays(this.displayGeography, graph);
    } catch {
      this.manifest = {
        ...this.manifest,
        dataStatus: this.points.length ? "partial" : "error",
        dataError: "\u5730\u56FE\u8DEF\u7F51\u6587\u4EF6\u672A\u80FD\u5B8C\u6574\u8F7D\u5165\u3002\u5DF2\u8F7D\u5165\u7684\u5730\u56FE\u4ECD\u53EF\u6D4F\u89C8\uFF0C\u5BF9\u8BDD\u529F\u80FD\u4E0D\u53D7\u5F71\u54CD\u3002"
      };
    }
    this.byId = new Map(this.points.map((p) => [p.id, p]));
    this.publicPoints = structuredClone(this.points);
    this.walking = walking || new WalkingGraph({ version: this.manifest.version, nodes: [], edges: [] });
    try {
      this.dataStamp = statSync(default2.join(directory2, "manifest.json")).mtimeMs;
    } catch {
    }
    this.refreshProfile();
  }
  directory;
  options;
  manifest;
  points;
  byId;
  walking;
  cache = /* @__PURE__ */ new Map();
  publicPoints = [];
  redirects = {};
  official = {};
  profileSignature = "";
  originalReferences = {};
  baseGraph = { version: "", nodes: [], edges: [] };
  geography = { features: [] };
  sharedFacts;
  publicAdapter;
  ephemeralDepth = 0;
  dataStamp = 0;
  displayGeography = { type: "FeatureCollection", features: [] };
  sports = { type: "FeatureCollection", features: [] };
  workoutMatcher;
  refreshData() {
    if (this.ephemeralDepth) return;
    let stamp;
    try {
      stamp = statSync(default2.join(this.directory, "manifest.json")).mtimeMs;
    } catch {
      this.manifest.dataStatus = this.points.length ? "partial" : "error";
      this.manifest.dataError = this.points.length ? "\u5171\u540C\u5730\u56FE\u6E90\u6682\u4E0D\u53EF\u8BFB\uFF1B\u4FDD\u7559\u5DF2\u8F7D\u5165\u7684\u753B\u9762\uFF0C\u6C42\u8DEF\u6682\u505C\u3002" : "\u5171\u540C\u5730\u56FE\u6E90\u6682\u4E0D\u53EF\u8BFB\uFF1B\u8BF7\u68C0\u67E5\u5730\u56FE\u8D44\u6599\u540E\u91CD\u65B0\u8F7D\u5165\u3002";
      return;
    }
    if (stamp === this.dataStamp) return;
    const next = new _CampusMapAdapter(this.directory, this.options);
    if (next.manifest.dataStatus !== "ready") {
      this.manifest.dataStatus = this.points.length ? "partial" : "error";
      this.manifest.dataError = this.points.length ? "\u5171\u540C\u5730\u56FE\u6B63\u5728\u66F4\u65B0\u6216\u6587\u4EF6\u4E0D\u4E00\u81F4\uFF1B\u4FDD\u7559\u5DF2\u8F7D\u5165\u753B\u9762\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002" : "\u5171\u540C\u5730\u56FE\u6587\u4EF6\u672A\u80FD\u5B8C\u6574\u8F7D\u5165\uFF1B\u8BF7\u68C0\u67E5\u5730\u56FE\u8D44\u6599\u540E\u91CD\u65B0\u8F7D\u5165\u3002";
      return;
    }
    this.manifest = next.manifest;
    this.points = next.points;
    this.byId = next.byId;
    this.walking = next.walking;
    this.publicPoints = next.publicPoints;
    this.redirects = next.redirects;
    this.official = next.official;
    this.originalReferences = next.originalReferences;
    this.baseGraph = next.baseGraph;
    this.geography = next.geography;
    this.displayGeography = next.displayGeography;
    this.sports = next.sports;
    this.sharedFacts = next.sharedFacts;
    this.profileSignature = next.profileSignature;
    this.dataStamp = stamp;
    this.cache.clear();
    this.publicAdapter = void 0;
  }
  canonical(id) {
    return this.redirects[id] || this.official[id]?.id || id;
  }
  /** Only main supplies the explicitly connected local profile directory.
   * Tests and standalone adapters default to public data, without private IO. */
  refreshProfile() {
    if (this.ephemeralDepth) return;
    this.refreshData();
    if (!this.options.profileDirectory) return;
    try {
      const root = this.options.profileDirectory;
      const config = JSON.parse(readFileSync(default2.join(root, "profiles/config.json"), "utf8"));
      if (this.options.profileId) config.active = this.options.profileId;
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(config.active)) throw new Error("Invalid profile id");
      const raw = readFileSync(default2.join(root, "profiles", config.active + ".json"));
      const revision = createHash("sha256").update(raw).digest("hex").slice(0, 16);
      const signature = config.active + ":" + revision;
      if (signature === this.profileSignature) return;
      const profile = JSON.parse(raw.toString("utf8"));
      this.points = structuredClone(this.publicPoints);
      this.byId = new Map(this.points.map((p) => [p.id, p]));
      const moved = /* @__PURE__ */ new Set();
      for (const [id, value] of Object.entries(profile.records || {})) {
        const record = value;
        let p = this.byId.get(this.canonical(id));
        if (typeof record.name !== "string") continue;
        if (!p && id.startsWith("u-") && Number.isFinite(record.e_m) && Number.isFinite(record.n_m)) {
          const c = fromLocal(record.e_m, record.n_m);
          p = { id, displayName: record.name, aliases: [], kind: "landmark", coordinate: c, bounds: [...c, ...c], entrances: [], accessCandidates: [], source: { url: "local-personal-profile" }, geometryStatus: "reference-point" };
          this.points.push(p);
          this.byId.set(id, p);
          moved.add(id);
        }
        if (!p) continue;
        p.aliases = [.../* @__PURE__ */ new Set([p.displayName, ...p.aliases, ...record.aliases || []])];
        p.displayName = record.name.slice(0, 160);
        p.personal = { basis: "user", note: record.note?.slice(0, 6e3), roles: [] };
        if (Number.isFinite(record.e_m) && Number.isFinite(record.n_m)) {
          const baseline = this.originalReferences[id] || toLocal(p.coordinate);
          if (Math.hypot(record.e_m - baseline[0], record.n_m - baseline[1]) > 0.2) {
            p.coordinate = fromLocal(record.e_m, record.n_m);
            p.personal.referencePoint = true;
            moved.add(p.id);
            if (p.roadReference) {
              delete p.roadReference;
              p.kind = "landmark";
            }
            if (p.geometryStatus === "reference-point") p.bounds = [...p.coordinate, ...p.coordinate];
          }
        }
      }
      for (const [roleKey, value] of Object.entries(profile.roles || {})) {
        const role = value;
        const p = role.place_id && this.byId.get(this.canonical(role.place_id));
        if (!p || !role.label) continue;
        const label = role.label.slice(0, 40);
        p.personal = { ...p.personal, basis: "user", roles: [...p.personal?.roles || [], label], roleKeys: [...p.personal?.roleKeys || [], roleKey] };
        p.aliases = [.../* @__PURE__ */ new Set([...p.aliases, label])];
      }
      for (const p of this.points) if (p.personal?.roles?.length) p.displayName = p.personal.roles.join(" / ") + " \xB7 " + p.displayName;
      this.walking = new WalkingGraph(estimateAccess(this.points, this.baseGraph, this.geography, moved));
      for (const p of this.points) if (p.nearbyRoadReferences) p.nearbyRoadReferences = p.nearbyRoadReferences.flatMap((ref) => {
        const point = this.byId.get(ref.id);
        if (!point?.roadReference) return [];
        const straightM = metersBetween(p.coordinate, point.coordinate);
        return straightM <= 150 ? [{ id: ref.id, straightM }] : [];
      });
      this.manifest.profileRevision = revision;
      this.manifest.profileName = String(profile.profile_name || "\u6211\u7684\u6821\u56ED");
      this.profileSignature = signature;
      this.cache.clear();
    } catch {
      this.points = structuredClone(this.publicPoints);
      this.byId = new Map(this.points.map((p) => [p.id, p]));
      this.walking = new WalkingGraph(this.baseGraph);
      this.manifest.profileRevision = "unavailable";
      this.manifest.profileName = void 0;
      this.profileSignature = "";
      this.cache.clear();
    }
  }
  allPoints() {
    this.refreshProfile();
    return structuredClone(this.points);
  }
  dataset() {
    this.refreshProfile();
    return structuredClone({ manifest: this.manifest, places: this.points, geography: this.displayGeography, sports: this.sports, venues: this.sharedFacts?.venues || [] });
  }
  // Send the large immutable display mesh as one value across contextBridge.
  // Copying/freezing hundreds of thousands of nested vertex arrays in the
  // isolated preload world stalls the first usable frame. JSON is decoded in
  // the renderer; the ordinary object API remains available for compatibility.
  serializedDataset() {
    this.refreshProfile();
    return JSON.stringify({ manifest: this.manifest, places: this.points, geography: this.displayGeography, sports: this.sports, venues: this.sharedFacts?.venues || [] });
  }
  /** Public model tools must not inherit the local UI's private profile. */
  publicView() {
    return this.options.profileDirectory ? this.publicAdapter ||= new _CampusMapAdapter(this.directory) : this;
  }
  /** Capture only the explicitly selected personal point. The caller owns
   * scope and selection authorization; later reads never follow active. */
  capturePersonalPoint(pointId) {
    if (!this.options.profileDirectory || typeof pointId !== "string" || !pointId || pointId.length > 160) return;
    try {
      const config = this.options.profileId ? void 0 : JSON.parse(readFileSync(default2.join(this.options.profileDirectory, "profiles/config.json"), "utf8"));
      const profileId = this.options.profileId || config?.active;
      if (typeof profileId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(profileId)) return;
      const selected = this.readPersonalPoint({ profileId, pointId });
      return selected?.selector;
    } catch (error) {
      if (unavailablePersonalMapRead(error)) return;
      throw error;
    }
  }
  /** Read one already-authorized endpoint against the public baseline. No
   * other profile record, note, alias or role is projected into the result. */
  readPersonalPoint(selector) {
    if (!this.options.profileDirectory || !selector || typeof selector.profileId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(selector.profileId) || typeof selector.pointId !== "string" || !selector.pointId || selector.pointId.length > 160) return;
    try {
      const raw = JSON.parse(readFileSync(default2.join(this.options.profileDirectory, "profiles", selector.profileId + ".json"), "utf8"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const profile = raw, publicMap = this.publicView();
      const mapVersion = publicMap.overview().version, pointId = publicMap.canonical(selector.pointId);
      if (typeof pointId !== "string" || !pointId || pointId.length > 160) return;
      const baseline = publicMap.point(pointId);
      let coordinate = baseline ? [...baseline.coordinate] : void 0;
      let name = baseline?.displayName, personal = false;
      const records = profile.records && typeof profile.records === "object" && !Array.isArray(profile.records) ? profile.records : {};
      for (const [id, value] of Object.entries(records)) {
        if (publicMap.canonical(id) !== pointId || !value || typeof value !== "object" || Array.isArray(value)) continue;
        const record = value;
        if (typeof record.name !== "string" || !record.name.trim()) continue;
        const hasCoordinate = typeof record.e_m === "number" && Number.isFinite(record.e_m) && typeof record.n_m === "number" && Number.isFinite(record.n_m);
        if (!coordinate && (!id.startsWith("u-") || !hasCoordinate)) continue;
        if (hasCoordinate) {
          const e = record.e_m, n = record.n_m;
          const reference = coordinate ? publicMap.originalReferences[id] || toLocal(coordinate) : void 0;
          if (!reference || Math.hypot(e - reference[0], n - reference[1]) > 0.2) {
            const next = fromLocal(e, n);
            if (!next.every(Number.isFinite)) return;
            coordinate = [next[0], next[1]];
          }
        }
        name = record.name.slice(0, 160);
        personal = true;
      }
      if (!coordinate || !name) return;
      const labels = [];
      const roles = profile.roles && typeof profile.roles === "object" && !Array.isArray(profile.roles) ? profile.roles : {};
      for (const value of Object.values(roles)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const role = value;
        if (typeof role.place_id === "string" && publicMap.canonical(role.place_id) === pointId && typeof role.label === "string" && role.label.trim()) labels.push(role.label.slice(0, 40));
      }
      if (labels.length) {
        name = labels.join(" / ") + " \xB7 " + name;
        personal = true;
      }
      if (!personal || publicMap.overview().version !== mapVersion) return;
      const selected = { profileId: selector.profileId, pointId };
      const sha256 = createHash("sha256").update(JSON.stringify({ ...selected, name, coordinate })).digest("hex");
      const publicPointId = baseline && coordinate[0] === baseline.coordinate[0] && coordinate[1] === baseline.coordinate[1] ? baseline.id : void 0;
      const proof = { ...selected, mapVersion, sha256, ...publicPointId ? { publicPointId } : {} };
      return { selector: selected, name, coordinate, mapVersion, sha256, ...publicPointId ? { publicPointId } : {}, proof };
    } catch (error) {
      if (unavailablePersonalMapRead(error)) return;
      throw error;
    }
  }
  /** Recheck only the selected endpoint's used name/coordinate and public
   * map version. An unrelated edit elsewhere in the profile changes nothing. */
  personalPointProofCurrent(proof) {
    if (!proof || typeof proof.mapVersion !== "string" || typeof proof.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(proof.sha256)) return false;
    const current = this.readPersonalPoint({ profileId: proof.profileId, pointId: proof.pointId });
    return !!current && current.selector.profileId === proof.profileId && current.selector.pointId === proof.pointId && current.mapVersion === proof.mapVersion && current.sha256 === proof.sha256 && current.publicPointId === proof.publicPointId;
  }
  sharedSnapshot() {
    this.refreshProfile();
    return { manifest: this.overview(), places: this.allPoints(), facts: structuredClone(this.sharedFacts) };
  }
  /** Local derived observations only; the workout owner retains the raw fix and
   * its own distance/segment decisions. Public source geography is used here,
   * never display curves, user landmarks or estimated venue reference loops. */
  matchWorkoutFix(fix) {
    this.refreshData();
    if (!this.workoutMatcher || this.workoutMatcher.graph !== this.baseGraph || this.workoutMatcher.stamp !== this.dataStamp || this.manifest.dataStatus !== "ready") {
      this.workoutMatcher = {
        graph: this.baseGraph,
        stamp: this.dataStamp,
        matcher: new CampusWorkoutMatcher(this.baseGraph, this.manifest, this.sharedFacts?.venues || [], this.geography)
      };
    }
    return this.workoutMatcher.matcher.match(fix);
  }
  verificationGraph() {
    this.refreshProfile();
    return structuredClone(this.walking.graph);
  }
  routeReferences(query, references) {
    this.refreshProfile();
    const prior = { points: this.points, byId: this.byId, walking: this.walking };
    this.ephemeralDepth++;
    try {
      const added = references.map((r) => {
        if (!r.id.startsWith("reference/") || !r.coordinate.every(Number.isFinite) || !inBounds(r.coordinate, this.manifest.bounds)) throw new Error("\u53C2\u8003\u70B9\u4E0D\u5728\u5730\u56FE\u6709\u6548\u8303\u56F4\u5185\u3002");
        return { id: r.id, displayName: r.name.slice(0, 80), aliases: [], kind: "node", coordinate: r.coordinate, bounds: [...r.coordinate, ...r.coordinate], entrances: [], accessCandidates: [], source: { url: "local-reference" }, geometryStatus: "reference-point" };
      });
      this.points = [...this.points, ...added];
      this.byId = new Map(this.points.map((p) => [p.id, p]));
      this.walking = new WalkingGraph(estimateAccess(this.points, this.walking.graph, this.geography, new Set(added.map((p) => p.id))));
      const route = this.route(query);
      return { route, graph: structuredClone(this.walking.graph) };
    } finally {
      this.points = prior.points;
      this.byId = prior.byId;
      this.walking = prior.walking;
      this.ephemeralDepth--;
    }
  }
  overview() {
    this.refreshProfile();
    return structuredClone(this.manifest);
  }
  point(id) {
    this.refreshProfile();
    const value = this.byId.get(this.canonical(id));
    return value ? structuredClone(value) : void 0;
  }
  /** Public geometry candidates, never a connection from the user's position. */
  nearbyConnectedPlaces(id, radiusMeters = 500, limit = 4) {
    const reference = this.byId.get(id);
    if (!reference) return [];
    return this.points.filter((point) => point.id !== id && point.entrances.some((entrance) => entrance.connected)).map((point) => ({ point, distance: metersBetween(reference.coordinate, point.coordinate) })).filter((item) => item.distance <= Math.min(1e3, radiusMeters)).sort((a, b) => a.distance - b.distance).slice(0, Math.min(6, limit)).map((item) => structuredClone(item.point));
  }
  /** A lake/area reference is useful for browsing but may have no walking
   * endpoint. Discover separate named public places with recorded graph access;
   * choosing one remains an explicit change of endpoint, never an invented door. */
  nearbyWalkablePlaces(id, radiusMeters = 600, limit = 6) {
    this.refreshProfile();
    const reference = this.byId.get(this.canonical(id));
    if (!reference || !["water", "area"].includes(reference.kind) || this.manifest.dataStatus !== "ready") return [];
    const radius = Math.max(0, Math.min(1e3, radiusMeters)), seen = /* @__PURE__ */ new Set();
    return this.points.flatMap((point) => {
      if (point.id === reference.id || point.personal || point.historicalReference || ["water", "area", "node"].includes(point.kind) || !point.displayName.trim() || /^未命名/.test(point.displayName)) return [];
      const canonicalId = this.canonical(point.id);
      if (seen.has(canonicalId)) return [];
      const straightM = metersBetween(reference.coordinate, point.coordinate);
      if (straightM > radius) return [];
      const recorded = point.accessCandidates ?? point.entrances.filter((entrance) => entrance.connected).map((entrance) => ({ nodeId: entrance.id, kind: "entrance", conditions: void 0 }));
      const access = recorded.filter((candidate) => !candidate.conditions?.length && (this.walking.adjacency.get(candidate.nodeId) || []).some(({ edge }) => allowsFootAccess(edge.foot) && !edge.conditions?.length));
      if (!access.length) return [];
      const connectedBridgeNames = [...new Set(access.flatMap((candidate) => (this.walking.adjacency.get(candidate.nodeId) || []).flatMap(({ edge }) => edge.bridge && edge.name?.trim() && allowsFootAccess(edge.foot) && !edge.conditions?.length ? [edge.name.trim()] : [])))];
      seen.add(canonicalId);
      return [{
        point: structuredClone(point),
        straightM,
        endpoint: { kind: "place", id: point.id },
        relation: "nearby_alternative",
        forPlaceId: reference.id,
        distanceBasis: "between_public_reference_points",
        accessKinds: [...new Set(access.map((candidate) => candidate.kind))],
        connectedBridgeNames
      }];
    }).sort((a, b) => Number(!a.connectedBridgeNames.includes(a.point.displayName)) - Number(!b.connectedBridgeNames.includes(b.point.displayName)) || Number(a.point.kind !== "landmark") - Number(b.point.kind !== "landmark") || a.straightM - b.straightM).slice(0, Math.max(1, Math.min(8, limit)));
  }
  deviceCandidates(coordinate, accuracy) {
    if (!Number.isFinite(accuracy) || accuracy > 150 || accuracy < 0) return [];
    const latitude = accuracy / 111e3, longitude = latitude / Math.max(0.1, Math.cos(coordinate[1] * Math.PI / 180));
    return this.points.filter((point) => coordinate[0] + longitude >= point.bounds[0] && coordinate[0] - longitude <= point.bounds[2] && coordinate[1] + latitude >= point.bounds[1] && coordinate[1] - latitude <= point.bounds[3]).slice(0, 4).map((point) => structuredClone(point));
  }
  search(query, limit = 20) {
    this.refreshProfile();
    return structuredClone(rankMapPoints(this.points, query, this.manifest.label).slice(0, Math.max(1, Math.min(50, limit))));
  }
  locationStatus() {
    return {
      status: "idle",
      source: "windows-native",
      phoneConnected: false,
      reason: "\u53EF\u5728\u5730\u56FE\u4E2D\u8BFB\u53D6 Windows \u672C\u673A\u4F4D\u7F6E\uFF1B\u6A21\u578B\u5DE5\u5177\u4E0D\u8BFB\u53D6\u6216\u4FDD\u5B58\u5750\u6807\uFF0C\u4E5F\u53EF\u4EE5\u624B\u52A8\u9009\u62E9\u8D77\u70B9\u3002"
    };
  }
  resolve(e) {
    if (e?.kind === "place") return this.byId.get(this.canonical(e.id));
    if (e?.kind === "node") {
      const n = this.walking.nodes.get(e.id);
      if (!n) return;
      return {
        id: `node/${n.id}`,
        graphNodeId: n.id,
        displayName: n.name || "\u9053\u8DEF\u70B9",
        roadReference: { nodeId: n.id, roadName: n.name || this.walking.adjacency.get(n.id)?.find((e2) => e2.edge.name)?.edge.name || "\u9053\u8DEF\u70B9", forPlaceIds: [] },
        aliases: [],
        kind: "node",
        coordinate: n.coordinate,
        bounds: [...n.coordinate, ...n.coordinate],
        entrances: [],
        accessCandidates: [{
          id: "entrance/" + n.id,
          nodeId: n.id,
          kind: "road-point",
          name: n.name || "\u9053\u8DEF\u70B9",
          coordinate: n.coordinate,
          coordinates: [n.coordinate],
          meters: 0,
          source: /^\d+$/.test(n.id) ? `https://www.openstreetmap.org/node/${n.id}` : "local-derived-map-node"
        }],
        source: /^\d+$/.test(n.id) ? { url: `https://www.openstreetmap.org/node/${n.id}` } : { url: "local-derived-map-node", featureId: `${this.manifest.version}/node/${n.id}` },
        geometryStatus: "mapped"
      };
    }
  }
  route(query) {
    this.refreshProfile();
    if (query.from?.kind === "current" && query.from.fix) {
      const fix = query.from.fix;
      const quality = classifyFix(fix, this.manifest.bounds);
      if (quality !== "fresh") return { ...emptyRoute(), status: quality === "outside" ? "outside" : "origin_confirmation", reason: quality === "outside" ? "\u8BBE\u5907\u4F4D\u7F6E\u5728\u5F53\u524D\u8986\u76D6\u8303\u56F4\u4E4B\u5916\uFF1B\u4ECD\u53EF\u624B\u52A8\u9009\u62E9\u4E24\u70B9\u3002" : quality === "stale" ? "\u8BBE\u5907\u4F4D\u7F6E\u5DF2\u8FC7\u671F\uFF1B\u8BF7\u9009\u62E9\u624B\u52A8\u8D77\u70B9\u6216\u91CD\u65B0\u5B9A\u4F4D\u3002" : "\u8BBE\u5907\u4F4D\u7F6E\u683C\u5F0F\u65E0\u6548\u6216\u8BEF\u5DEE\u8F83\u5927\uFF1B\u8BF7\u9009\u62E9\u624B\u52A8\u8D77\u70B9\u3002" };
      const id = "reference/device/" + createHash("sha256").update(JSON.stringify([fix.coordinate, fix.timestamp])).digest("hex").slice(0, 16);
      return this.routeReferences({ ...query, from: { kind: "place", id } }, [{ id, name: "\u672C\u673A\u8BBE\u5907\u4F4D\u7F6E", coordinate: fix.coordinate }]).route;
    }
    const start = performance.now(), from = this.resolve(query.from), to = this.resolve(query.to);
    const base = {
      ...emptyRoute(),
      from,
      to,
      source: { version: this.manifest.version, kind: "osm", date: this.manifest.sourceDate },
      profileRevision: this.manifest.profileRevision
    };
    const fail = (status, reason) => ({
      ...base,
      status,
      reason,
      elapsedMs: performance.now() - start
    });
    if (this.manifest.dataStatus !== "ready") return fail("error", this.manifest.dataError || "\u8DEF\u7F51\u672A\u8F7D\u5165\u3002");
    if (query.version && query.version !== this.manifest.version)
      return fail("error", "\u5730\u56FE\u6570\u636E\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u8D77\u7EC8\u70B9\u3002");
    if (query.profileRevision && query.profileRevision !== this.manifest.profileRevision)
      return fail("error", "\u5730\u70B9\u540D\u79F0\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u5730\u70B9\u540E\u91CD\u65B0\u6C42\u8DEF\u3002");
    if (!query.to) return fail("missing_destination", "\u8BF7\u9009\u62E9\u76EE\u7684\u5730\u3002");
    if (!to) return fail("outside", "\u8FD9\u4E2A\u5730\u70B9\u4E0D\u5728\u5F53\u524D\u5730\u56FE\u7684\u6570\u636E\u8303\u56F4\u5185\u3002");
    if (!query.from) return fail("missing_origin", "\u8BF7\u9009\u62E9\u8D77\u70B9\uFF0C\u6216\u5F00\u542F\u672C\u673A\u5B9A\u4F4D\u3002");
    if (query.from.kind === "current")
      return fail(
        "origin_confirmation",
        "\u4F4D\u7F6E\u5DF2\u663E\u793A\uFF1B\u5C1A\u672A\u786E\u8BA4\u4F60\u5230\u8DEF\u7F51\u7684\u6B65\u884C\u8FDE\u63A5\uFF0C\u8BF7\u9009\u62E9\u4F60\u5B9E\u9645\u6240\u5728\u3001\u4E14\u6709\u5DF2\u77E5\u5165\u53E3\u7684\u5EFA\u7B51\u4F5C\u4E3A\u8D77\u70B9\u3002"
      );
    if (!from) return fail("outside", "\u8D77\u70B9\u4E0D\u5728\u5F53\u524D\u5730\u56FE\u7684\u6570\u636E\u8303\u56F4\u5185\u3002");
    if (from.id === to.id) return fail("same", "\u8D77\u70B9\u4E0E\u7EC8\u70B9\u662F\u540C\u4E00\u5730\u70B9\uFF0C\u65E0\u9700\u7ED8\u5236\u8DEF\u7EBF\u3002");
    const access = (point, chosen) => {
      const recorded = point.accessCandidates ?? point.entrances.filter((e) => e.connected).map((e) => ({ id: "entrance/" + e.id, nodeId: e.id, kind: "entrance", name: e.name, coordinate: e.coordinate, coordinates: [e.coordinate], meters: 0, source: e.source }));
      const eligible = recorded.filter((e) => (!chosen || e.id === chosen || e.entranceId && "entrance/" + e.entranceId === chosen) && (query.allowConditional || !e.conditions?.length) && (!query.avoidStairs || !e.stairs));
      const cheapest = /* @__PURE__ */ new Map();
      for (const candidate of eligible) {
        const current = cheapest.get(candidate.nodeId);
        if (!current || candidate.meters < current.meters || candidate.meters === current.meters && candidate.kind === "entrance") cheapest.set(candidate.nodeId, candidate);
      }
      return [...cheapest.values()];
    };
    const a = access(from, query.originAccessId), b = access(to, query.destinationAccessId);
    if (!a.length || !b.length) {
      const result2 = fail(
        "unknown_entrance",
        (!a.length ? from : to).accessReviewBasis || `\u5F53\u524D\u9650\u5236\u4E0B\uFF0C${!a.length ? from.displayName : to.displayName}\u7684\u9053\u8DEF\u63A5\u5165\u8FD8\u5F85\u6838\u5B9E\u3002\u53EF\u4EE5\u7EE7\u7EED\u6D4F\u89C8\u6216\u53E6\u9009\u5730\u70B9\u3002`
      );
      result2.roadReferences = [["origin", from, a, b], ["destination", to, b, a]].flatMap(([endpoint, place, choices, other]) => choices.length ? [] : (place.nearbyRoadReferences || []).flatMap((ref) => {
        const point = this.byId.get(ref.id);
        if (!point?.roadReference) return [];
        const straightM = metersBetween(place.coordinate, point.coordinate);
        if (straightM > 150) return [];
        if (other.length) {
          const node = point.roadReference.nodeId, otherNodes = other.map((c) => c.nodeId);
          const linked = this.walking.shortest(endpoint === "origin" ? [node] : otherNodes, endpoint === "origin" ? otherNodes : [node], query.avoidStairs, void 0, void 0, query.allowConditional);
          if (!linked) return [];
        }
        return [{ endpoint, point, straightM, forPlace: place.displayName }];
      }).slice(0, 2));
      if (result2.roadReferences.length) result2.reason += "\u4E5F\u53EF\u4EE5\u660E\u786E\u6539\u9009\u9644\u8FD1\u7684\u9053\u8DEF\u70B9\u3002";
      result2.warnings.push("\u6CA1\u6709\u5408\u683C\u7684\u5DF2\u8BB0\u5F55\u5165\u53E3\u621680\u7C73\u5185\u907F\u969C\u63A5\u5165\uFF1B\u672A\u7528\u7A7F\u5899\u3001\u7A7F\u6C34\u7684\u76F4\u7EBF\u8865\u8DEF\u3002\u9644\u8FD1\u9053\u8DEF\u53C2\u8003\u70B9\u662F\u660E\u786E\u53E6\u9009\u7684\u8D77\u7EC8\u70B9\uFF0C\u4E0D\u662F\u697C\u95E8\u3002");
      if (!a.length && b.length) result2.conditionalOrigins = this.nearbyConnectedPlaces(from.id).filter((point) => point.id !== to.id).flatMap((point) => {
        const candidate = this.route({ from: { kind: "place", id: point.id }, to: query.to, avoidStairs: query.avoidStairs });
        if (candidate.status !== "ready" || !candidate.distance || !candidate.originEntrance || !candidate.destinationEntrance || candidate.originAccess?.kind !== "entrance" || candidate.destinationAccess?.kind !== "entrance") return [];
        const networkM2 = candidate.distance.networkM;
        const entrance = (value) => ({ id: value.id, name: value.name, connected: value.connected, source: value.source });
        return [{
          id: point.id,
          label: point.displayName,
          originEntrance: entrance(candidate.originEntrance),
          destinationEntrance: entrance(candidate.destinationEntrance),
          networkM: networkM2,
          minutes: { min: Math.ceil(networkM2 / 90), max: Math.ceil(networkM2 / 48) },
          connection: "unknown",
          condition: "\u8FD9\u6BB5\u8DEF\u4ECE\u6240\u5217\u5019\u9009\u5EFA\u7B51\u81EA\u8EAB\u5DF2\u8BB0\u5F55\u7684\u8FDE\u901A\u5165\u53E3\u5230\u76EE\u7684\u5EFA\u7B51\u5165\u53E3\uFF1B\u53EA\u6709\u5148\u5230\u8BE5\u5019\u9009\u5165\u53E3\u540E\uFF0C\u697C\u5916\u6B65\u884C\u533A\u95F4\u624D\u9002\u7528\u3002\u539F\u5730\u70B9\u5230\u5019\u9009\u5165\u53E3\u3001\u4E24\u7AEF\u697C\u5185\u53CA\u5F53\u5929\u901A\u884C\u4ECD\u672A\u77E5\uFF1B\u5019\u9009\u5165\u53E3\u4E0D\u662F\u539F\u5730\u70B9\u7684\u5DF2\u786E\u8BA4\u51FA\u53E3\u3002"
        }];
      });
      return result2;
    }
    const key = JSON.stringify([this.manifest.version, this.manifest.profileRevision, from.id, from.coordinate, to.id, to.coordinate, !!query.avoidStairs, !!query.allowConditional, query.originAccessId, query.destinationAccessId]);
    const cached = this.cache.get(key);
    if (cached) return structuredClone(cached);
    const found = this.walking.shortest(
      a.map((e) => e.nodeId),
      b.map((e) => e.nodeId),
      query.avoidStairs,
      new Map(a.map((e) => [e.nodeId, e.meters])),
      new Map(b.map((e) => [e.nodeId, e.meters])),
      query.allowConditional
    );
    if (!found) return fail("unreachable", "\u5DF2\u77E5\u8DEF\u7F51\u4E2D\u6CA1\u6709\u8FDE\u901A\u7684\u6B65\u884C\u8DEF\u7EBF\uFF1B\u6CA1\u6709\u7528\u76F4\u7EBF\u66FF\u4EE3\u7F3A\u5931\u8DEF\u6BB5\u3002");
    const used = found.edgeIds.map((id) => this.walking.edges.get(id));
    const originAccess = a.find((e) => e.nodeId === found.nodeIds[0]), destinationAccess = b.find((e) => e.nodeId === found.nodeIds.at(-1));
    const segments = [];
    if (originAccess.kind === "estimate") segments.push({ id: originAccess.id, name: "\u51FA\u53D1\u5904\u63A5\u5165\u4F30\u8BA1", coordinates: originAccess.coordinates, meters: originAccess.meters, kind: "estimate" });
    for (let i = 0; i < used.length; i++) {
      const e = used[i];
      segments.push({ id: e.id, name: e.name || (e.bridge ? "\u6865\u6881" : e.reviewedApproach ? "\u6865\u5934\u6B65\u9053" : e.stairs ? "\u53F0\u9636" : e.buildingPassage ? "\u697C\u4E0B\u901A\u9053" : e.covered ? "\u6709\u9876\u6B65\u9053" : "\u6821\u5185\u6B65\u9053"), coordinates: [found.coordinates[i], found.coordinates[i + 1]], meters: e.meters, kind: "network", stairs: e.stairs, bridge: e.bridge, conditions: e.conditions });
    }
    if (destinationAccess.kind === "estimate") segments.push({ id: destinationAccess.id, name: "\u62B5\u8FBE\u5904\u63A5\u5165\u4F30\u8BA1", coordinates: destinationAccess.coordinates.slice().reverse(), meters: destinationAccess.meters, kind: "estimate" });
    const coordinates = segments.length ? segments.flatMap((s, i) => i ? s.coordinates.slice(1) : s.coordinates) : found.coordinates;
    const connectorM = originAccess.meters + destinationAccess.meters;
    const networkM = used.reduce((sum, e) => sum + e.meters, 0);
    const estimateOnly = networkM === 0 && connectorM > 0;
    const estimateDominant = connectorM > 0 && connectorM / (networkM + connectorM) >= 0.9;
    const warnings = ["\u6309\u5DF2\u8BB0\u5F55\u4E14\u5141\u8BB8\u6B65\u884C\u7684\u8DEF\u6BB5\u957F\u5EA6\u8BA1\u7B97\uFF1B\u95E8\u7981\u3001\u65BD\u5DE5\u548C\u5B9E\u65F6\u901A\u884C\u8BF7\u4EE5\u73B0\u573A\u4E3A\u51C6\u3002"];
    if (used.some((e) => e.stairs)) warnings.push("\u8DEF\u7EBF\u5305\u542B\u53F0\u9636\u3002");
    if (used.some((e) => e.gate)) warnings.push("\u8DEF\u7EBF\u7ECF\u8FC7\u51FA\u5165\u53E3\uFF0C\u901A\u884C\u72B6\u6001\u672A\u5B9E\u65F6\u6838\u5B9E\u3002");
    if (connectorM > 0) warnings.push(from.undergroundStation || to.undergroundStation ? "\u865A\u7EBF\u4E3A\u5DF2\u8BB0\u5F55\u51FA\u5165\u53E3\u6216\u53C2\u8003\u70B9\u81F3\u8DEF\u7F51\u7684\u907F\u969C\u63A5\u5165\u4F30\u8BA1\uFF1B\u73B0\u573A\u8FDE\u63A5\u4E0E\u901A\u884C\u4ECD\u5F85\u6838\u5B9E\u3002" : "\u865A\u7EBF\u4E3A\u697C\u680B\u53C2\u8003\u70B9\u81F3\u8DEF\u7F51\u7684\u907F\u969C\u4F30\u8BA1\uFF1B\u672A\u786E\u8BA4\u771F\u5B9E\u95E8\u6216\u697C\u5185\u901A\u884C\u3002");
    if (from.undergroundStation || to.undergroundStation) warnings.push("\u6B65\u884C\u81F3\u5730\u94C1\u51FA\u5165\u53E3\uFF1B\u4E0D\u542B\u8FDB\u7AD9\u548C\u7AD9\u5185\u6362\u4E58\uFF0C\u51FA\u5165\u53E3\u5F00\u653E\u72B6\u6001\u672A\u5B9E\u65F6\u6838\u5B9E\u3002");
    if (estimateOnly) warnings.push("\u4E24\u5904\u53C2\u8003\u70B9\u63A5\u5230\u540C\u4E00\u8DEF\u7F51\u4F4D\u7F6E\uFF1B\u5F53\u524D\u7ED3\u679C\u53EA\u6709\u63A5\u5165\u4F30\u8BA1\uFF0C\u6CA1\u6709\u5DF2\u8BB0\u5F55\u6B65\u884C\u8DEF\u6BB5\u3002");
    else if (estimateDominant) warnings.push("\u5927\u90E8\u5206\u8DDD\u79BB\u6765\u81EA\u697C\u680B\u53C2\u8003\u70B9\u63A5\u5165\u4F30\u8BA1\uFF1B\u53EA\u542B\u5F88\u77ED\u7684\u8BB0\u5F55\u9053\u8DEF\uFF0C\u4E0D\u80FD\u636E\u6B64\u786E\u8BA4\u5B9E\u9645\u8D70\u6CD5\u3002");
    const assumptionWarning = routeConditionWarning([...used.flatMap((e) => e.conditions || []), ...originAccess.conditions || [], ...destinationAccess.conditions || []]);
    if (assumptionWarning) warnings.push(assumptionWarning);
    const result = {
      ...base,
      status: "ready",
      reason: assumptionWarning ? "\u5DF2\u6309\u6240\u5217\u901A\u884C\u6761\u4EF6\u6210\u7ACB\u65F6\u7684\u60C5\u51B5\u7B97\u51FA\u8DEF\u7EBF\uFF0C\u5F85\u6838\u7684\u901A\u8DEF\u4FDD\u7559\u5728\u5404\u8DEF\u6BB5\u4E2D" : estimateOnly ? "\u4E24\u5904\u53C2\u8003\u70B9\u63A5\u5230\u540C\u4E00\u8DEF\u7F51\u4F4D\u7F6E\uFF0C\u8FD9\u4EFD\u7ED3\u679C\u53EA\u6709\u63A5\u5165\u4F30\u8BA1\uFF0C\u53EF\u5148\u770B\u4E24\u5904\u5173\u7CFB\uFF1B\u5B9E\u9645\u8D70\u6CD5\u4ECD\u5F85\u6838\u5B9E" : estimateDominant ? "\u8FD9\u4EFD\u7ED3\u679C\u4E3B\u8981\u662F\u63A5\u5165\u4F30\u8BA1\uFF0C\u53EA\u6709\u5F88\u77ED\u7684\u5DF2\u8BB0\u5F55\u9053\u8DEF\uFF1B\u5B9E\u9645\u5165\u53E3\u4E0E\u8D70\u6CD5\u4ECD\u5F85\u6838\u5B9E" : connectorM > 0 ? "\u5DF2\u8BB0\u5F55\u9053\u8DEF\u8FD9\u4E00\u6BB5\u5DF2\u7ECF\u7B97\u597D\uFF0C\u53EF\u4EE5\u5148\u5E26\u7740\u4E24\u7AEF\u63A5\u5165\u4F30\u8BA1\u770B\u8FD9\u4EFD\u8DEF\u7EBF\uFF1B\u5B9E\u9645\u95E8\u53E3\u3001\u697C\u5185\u548C\u5F53\u5929\u901A\u884C\u4ECD\u9700\u73B0\u573A\u6838\u5BF9" : from.roadReference || to.roadReference ? "\u5F53\u524D\u9053\u8DEF\u53C2\u8003\u70B9\u4E0E\u5DF2\u8BB0\u5F55\u63A5\u5165\u4E4B\u95F4\u7684\u8DEF\u7F51\u8DEF\u7EBF\u5DF2\u7ECF\u7B97\u597D" : "\u5DF2\u77E5\u5165\u53E3\u4E4B\u95F4\u7684\u8DEF\u7F51\u8DEF\u7EBF\u5DF2\u7ECF\u7B97\u597D",
      routeBasis: estimateOnly ? "access_estimate_only" : estimateDominant ? "access_estimate_dominant" : connectorM > 0 ? "recorded_network_with_estimates" : "recorded_network",
      coordinates,
      nodeIds: found.nodeIds,
      edgeIds: found.edgeIds,
      distance: { totalM: found.meters, networkM, connectorM },
      originEntrance: from.entrances.find((e) => e.id === (originAccess.entranceId || (originAccess.kind === "entrance" ? originAccess.nodeId : void 0))),
      destinationEntrance: to.entrances.find((e) => e.id === (destinationAccess.entranceId || (destinationAccess.kind === "entrance" ? destinationAccess.nodeId : void 0))),
      originAccess,
      destinationAccess,
      segments,
      warnings,
      elapsedMs: performance.now() - start
    };
    this.cache.set(key, result);
    if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value);
    return structuredClone(result);
  }
};

// src/main/mapBridge.ts
import { createHash as createHash2 } from "node:crypto";
var directory = path.resolve(process.argv[2] || ".");
var runtimeSha256 = createHash2("sha256").update(readFileSync2(process.argv[1])).digest("hex");
var adapters = /* @__PURE__ */ new Map();
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  let request;
  try {
    if (line.length > 1e5) throw new Error("Map request too large");
    request = JSON.parse(line);
    if (!["snapshot", "route", "graph"].includes(request.op)) throw new Error("Unknown map operation");
    const profileDirectory = typeof request.profileDirectory === "string" ? request.profileDirectory : void 0;
    const profileId = typeof request.profileId === "string" ? request.profileId : void 0;
    const key = JSON.stringify([statSync2(path.join(directory, "manifest.json")).mtimeMs, profileDirectory, profileId]);
    let adapter = adapters.get(key);
    if (!adapter) {
      adapter = new CampusMapAdapter(directory, { profileDirectory, profileId });
      adapters.set(key, adapter);
      if (adapters.size > 4) adapters.delete(adapters.keys().next().value);
    }
    let value;
    if (request.op === "snapshot") value = adapter.sharedSnapshot();
    else if (request.op === "graph") value = adapter.verificationGraph();
    else {
      const query = request.query || {}, references = [];
      for (const [endpoint, p] of Object.entries(request.references || {})) {
        if (!["from", "to"].includes(endpoint)) throw new Error("Invalid reference endpoint");
        const v = p;
        if (!Number.isFinite(v.e_m) || !Number.isFinite(v.n_m)) throw new Error("Invalid reference coordinate");
        const coordinate = fromLocal(v.e_m, v.n_m), id = "reference/" + createHash2("sha256").update(JSON.stringify([coordinate, v.name])).digest("hex").slice(0, 16);
        references.push({ id, name: String(v.name || "\u5730\u56FE\u53C2\u8003\u70B9"), coordinate });
        query[endpoint] = { kind: "place", id };
      }
      value = references.length ? adapter.routeReferences(query, references) : { route: adapter.route(query), graph: adapter.verificationGraph() };
      if (value.route.profileRevision !== adapter.overview().profileRevision) throw new Error("\u4E2A\u4EBA\u914D\u7F6E\u5728\u6C42\u8DEF\u4E2D\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5");
    }
    process.stdout.write(JSON.stringify({ id: request.id, ok: true, value: { ...value, bridgeRuntimeSha256: runtimeSha256 } }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ id: request?.id, ok: false, error: String(error instanceof Error ? error.message : error) }) + "\n");
  }
}
