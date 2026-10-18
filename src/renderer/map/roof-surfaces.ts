import { MercatorCoordinate, type Map, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { surfaceMaterialTokens, type MapPalette } from './map-theme';
import { projectFace,triangleDepth } from './surface-picking';
import type { LabelAnchor } from './label-anchors';
import { drawableTriangle } from './mesh-geometry';
import { groundFillOrigin,groundFillPolygons } from './ground-fills';

type Vec=[number,number,number];
type RoofInk={center:[number,number];inverse:[number,number,number,number];rotation:number};
type Group={id:string;material:string;first:number;count:number;faces:Vec[][];extrusion?:boolean;roofInk?:RoofInk;worldBounds?:number[];screen?:Float64Array;bounds?:number[];wallPixels?:number};
const facadeTextures = new Set(['dorm-band', 'dorm-window', 'academic-window']);
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a:Vec,b:Vec):Vec=>a.map((x,i)=>x-b[i]) as Vec;
const unit=(v:Vec):Vec=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n) as Vec;};

function authoredNormals(faces:Vec[][],smooth:boolean):Vec[][]{
  const areaVectors=faces.map(face=>{let n=cross(sub(face[1],face[0]),sub(face[2],face[0]));if(n[2]<0)n=n.map(x=>-x) as Vec;return n;});
  const normals=areaVectors.map(unit);
  if(!smooth)return normals.map(n=>[n,n,n]);
  // Shared vertices on a gently curved tile roof need continuous lighting.
  // Restrict averaging to neighbours on the same side of a hard roof fold.
  // The sub-millimetre key only joins repeated render coordinates; geometry
  // and picking retain their original vertices and structural roof ridges.
  const key=(p:Vec)=>p.map(x=>Math.round(x*1e11)).join('/');
  const adjacent=new globalThis.Map<string,number[]>();
  faces.forEach((face,i)=>face.forEach(p=>{const k=key(p);const a=adjacent.get(k)||[];a.push(i);adjacent.set(k,a);}));
  const crease=Math.cos(35*Math.PI/180);
  return faces.map((face,i)=>face.map(p=>{
    const sum:Vec=[0,0,0],n=normals[i];
    for(const j of adjacent.get(key(p))||[]){const m=normals[j];if(n[0]*m[0]+n[1]*m[1]+n[2]*m[2]<crease)continue;for(let k=0;k<3;k++)sum[k]+=areaVectors[j][k];}
    return Math.hypot(...sum)?unit(sum):n;
  }));
}

/** Existing roofs and simple volumes in the same uncut draw coordinate frame.
 * Stored heights and authored proportions retain their original evidence limits. */
export class RoofSurfaces implements CustomLayerInterface {
  id='roof-surfaces';type='custom' as const;renderingMode='3d' as const;
  private map?:Map;private gl?:WebGL2RenderingContext;private program?:WebGLProgram;
  private vao?:WebGLVertexArrayObject;private buffer?:WebGLBuffer;private vertices:Float32Array;
  private groups:Group[]=[];private active=new Set<string>();private ghost=new Set<string>();
  private elevations=new globalThis.Map<string,[number,number]>();
  private hovered?:string;
  private origin=groundFillOrigin;private projectionKey='';
  private matrix?:number[];private heightFactor=0;private flatDepthBias=0;
  private restore=()=>{if(this.gl)this.setup(this.gl);};
  constructor(
    data: FeatureCollection,
    private palette: MapPalette,
    private states = new globalThis.Map<string, Record<string, boolean | number>>(),
    private extrusionOpacity = 0.86,
  ) {
    const vertices: number[] = [];
    for (const f of data.features) {
      const model = f.properties?.surfaceModel;
      if (!model && f.properties?.kind === 'building' && Number(f.properties.heightM) > 0) {
        this.appendExtrusion(f, vertices);
      } else if (model?.type === 'authored-mesh') {
        this.appendAuthoredMesh(f, vertices);
      } else if (['air-dome', 'elliptical-roof'].includes(model?.type)) {
        this.appendCurvedRoof(f, vertices);
      }
    }
    for (const group of this.groups) {
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const face of group.faces)
        for (const p of face)
          for (let i = 0; i < 3; i++) {
            b[i] = Math.min(b[i], p[i]);
            b[i + 3] = Math.max(b[i + 3], p[i]);
          }
      group.worldBounds = b;
      const range=this.elevations.get(group.id)||[Infinity,-Infinity];
      range[0]=Math.min(range[0],b[2]);range[1]=Math.max(range[1],b[5]);
      this.elevations.set(group.id,range);
    }
    this.vertices = new Float32Array(vertices);
  }
  private appendExtrusion(f: Feature, vertices: number[]) {
    const polygons =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates]
        : f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates
          : [];
    // The same uncut Float32 plan as the ground fill. Tile rounding must
    // not collapse a short side into an undefined extrusion normal.
    const first = vertices.length / 6,
      faces: Vec[][] = [];
    const add = (face: Vec[]) => {
      if (!drawableTriangle(face)) return;
      faces.push(face);
      const normal = unit(cross(sub(face[1], face[0]), sub(face[2], face[0])));
      for (const p of face) vertices.push(...p, ...normal);
    };
    for (const [index, polygon] of groundFillPolygons(f).entries()) {
      const coordinates = polygons[index].flat(),
        v = polygon.vertices;
      const at = (i: number, height: number): Vec => [
        v[i * 2],
        v[i * 2 + 1],
        Math.fround(
          MercatorCoordinate.fromLngLat([coordinates[i][0], coordinates[i][1]], height).z,
        ),
      ];
      const roof = coordinates.map((_, i) => at(i, Number(f.properties!.heightM))),
        floor = coordinates.map((_, i) => at(i, Number(f.properties!.minHeightM || 0)));
      for (let i = 0; i < polygon.indices.length; i += 3) {
        const face = polygon.indices.slice(i, i + 3).map((k) => roof[k]);
        if (cross(sub(face[1], face[0]), sub(face[2], face[0]))[2] < 0) face.reverse();
        add(face);
      }
      let offset = 0;
      for (const [ringIndex, ring] of polygon.rings.entries()) {
        const area = ring
          .slice(1)
          .reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0);
        const outward = (area > 0) === (ringIndex === 0);
        for (let i = 1; i < ring.length; i++)
          for (const face of [
            [roof[offset + i - 1], floor[offset + i], roof[offset + i]],
            [roof[offset + i - 1], floor[offset + i - 1], floor[offset + i]],
          ]) {
            if (!outward) face.reverse();
            add(face);
          }
        offset += ring.length;
      }
    }
    this.groups.push({
      id: String(f.id),
      material: 'extrusion',
      first,
      count: vertices.length / 6 - first,
      faces,
      extrusion: true,
    });
  }
  private appendAuthoredMesh(f: Feature, vertices: number[]) {
    const model = f.properties!.surfaceModel;
    for (const part of model.parts) {
      const first = vertices.length / 6,
        faces: Vec[][] = [];
      for (let i = 0; i < part.vertices.length; i += 3) {
        const face: Vec[] = part.vertices.slice(i, i + 3).map((p: number[]) => {
          const q = MercatorCoordinate.fromLngLat([p[0], p[1]], p[2]);
          return [q.x - this.origin.x, q.y - this.origin.y, q.z];
        });
        if (drawableTriangle(face)) faces.push(face);
      }
      const normals = authoredNormals(
        faces,
        part.material === 'tile-roof' || part.material === 'dome',
      );
      faces.forEach((face, i) => face.forEach((p, j) => vertices.push(...p, ...normals[i][j])));
      this.groups.push({
        id: String(f.id),
        material: part.material,
        first,
        count: vertices.length / 6 - first,
        faces,
      });
    }
  }
  private appendCurvedRoof(f: Feature, vertices: number[]) {
    const model = f.properties!.surfaceModel;
    const c = MercatorCoordinate.fromLngLat(model.center),
      a = MercatorCoordinate.fromLngLat(model.axisEnds[1]),
      b = MercatorCoordinate.fromLngLat(model.sideEnds[1]);
    const axis = [a.x - c.x, a.y - c.y],
      side = [b.x - c.x, b.y - c.y],
      height = c.meterInMercatorCoordinateUnits() * model.heightM,
      base = c.meterInMercatorCoordinateUnits() * (model.baseHeightM || 0);
    const lensRadius = (phi: number) => {
      const p = phi - (model.lensRotationRad || 0),
        A = Math.cos(p) ** 2 / 0.77 ** 2,
        B = Math.abs(Math.sin(p)) / 0.24;
      return A < 1e-8 ? 1 / B : 2 / (B + Math.sqrt(B * B + 4 * A));
    };
    // A smooth rounded rectangle in plan, with a continuous barrel-like crown.
    const position = (theta: number, phi: number): Vec => {
      const k = model.type === 'elliptical-roof' ? 1 : 0.42,
        cos = Math.cos(phi),
        sin = Math.sin(phi),
        edge = lensRadius(phi),
        t = theta / (Math.PI / 2);
      const r =
        model.type === 'elliptical-roof'
          ? t <= 0.25
            ? (edge * t) / 0.25
            : edge + ((1 - edge) * (t - 0.25)) / 0.75
          : Math.sin(theta);
      const u = r * Math.sign(cos) * Math.abs(cos) ** k,
        v = r * Math.sign(sin) * Math.abs(sin) ** k;
      const top =
        model.type === 'elliptical-roof'
          ? base + (height - base) * (r < edge ? 1 : Math.max(0, (1 - r) / (1 - edge)))
          : base + (height - base) * Math.cos(theta);
      return [
        c.x - this.origin.x + axis[0] * u + side[0] * v,
        c.y - this.origin.y + axis[1] * u + side[1] * v,
        top,
      ];
    };
    const vertex = (theta: number, phi: number) => {
      const p = position(theta, phi),
        dt = sub(
          position(Math.min(Math.PI / 2, theta + 0.0001), phi),
          position(Math.max(0.00001, theta - 0.0001), phi),
        );
      const dp = sub(position(theta, phi + 0.0001), position(theta, phi - 0.0001));
      let n = unit(cross(dt, dp));
      if (n[2] < 0) n = n.map((x) => -x) as Vec;
      if (theta < 0.0001) n = [0, 0, 1];
      return { p, n };
    };
    const first = vertices.length / 6,
      faces: Vec[][] = [];
    const rings = 32,
      sectors = 96;
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < sectors; j++) {
        const t0 = Math.max(0.00001, ((i / rings) * Math.PI) / 2),
          t1 = (((i + 1) / rings) * Math.PI) / 2,
          p0 = (j / sectors) * 2 * Math.PI,
          p1 = ((j + 1) / sectors) * 2 * Math.PI;
        const q = [vertex(t0, p0), vertex(t1, p0), vertex(t1, p1), vertex(t0, p1)];
        for (const ids of [
          [0, 1, 2],
          [0, 2, 3],
        ]) {
          const face = ids.map((k) => q[k].p);
          if (!drawableTriangle(face)) continue;
          faces.push(face);
          for (const k of ids) vertices.push(...q[k].p, ...q[k].n);
        }
      }
    const determinant=axis[0]*side[1]-axis[1]*side[0];
    this.groups.push({
      id: String(f.id),
      material: model.type === 'elliptical-roof' ? 'roof' : 'dome',
      first,
      count: vertices.length / 6 - first,
      faces,
      roofInk:model.type==='elliptical-roof'?{
        center:[c.x-this.origin.x,c.y-this.origin.y],
        inverse:[side[1]/determinant,-side[0]/determinant,-axis[1]/determinant,axis[0]/determinant],
        rotation:model.lensRotationRad||0,
      }:undefined,
    });
    if (base) {
      const first = vertices.length / 6,
        faces: Vec[][] = [];
      for (let i = 0; i < sectors; i++) {
        const pa = position(Math.PI / 2, (i / sectors) * 2 * Math.PI),
          pb = position(Math.PI / 2, ((i + 1) / sectors) * 2 * Math.PI),
          ga: Vec = [pa[0], pa[1], 0],
          gb: Vec = [pb[0], pb[1], 0];
        const n = unit(cross(sub(pb, pa), sub(ga, pa)));
        for (const face of [
          [pa, pb, gb],
          [pa, gb, ga],
        ]) {
          if (!drawableTriangle(face)) continue;
          faces.push(face);
          for (const p of face) vertices.push(...p, ...n);
        }
      }
      this.groups.push({
        id: String(f.id),
        material: 'wall',
        first,
        count: vertices.length / 6 - first,
        faces,
      });
    }
  }
  onAdd(map:Map,gl:WebGL2RenderingContext){this.map=map;this.gl=gl;this.setup(gl);map.on('webglcontextrestored',this.restore);}
  private setup(gl:WebGL2RenderingContext){
    const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Roof surface shader');return s;};
    const v=shader(gl.VERTEX_SHADER,`#version 300 es
      precision highp float;in vec3 a_position;in vec3 a_normal;uniform mat4 u_matrix;uniform float u_height;uniform float u_flat_bias;out vec3 normal;out vec3 position;
      void main(){normal=a_normal;position=a_position;gl_Position=u_matrix*vec4(a_position.xy,a_position.z*u_height,1.0);
        gl_Position.z-=a_position.z*u_flat_bias*gl_Position.w;}`);
    const f=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;in vec3 normal;in vec3 position;
      uniform vec4 u_color;uniform float u_ghost;uniform float u_detail;uniform float u_crown;uniform float u_solid_roof;
      uniform vec2 u_elevation;
      uniform float u_roof_ink;uniform vec2 u_roof_center;uniform vec4 u_roof_inverse;uniform float u_roof_rotation;uniform vec3 u_seam;
      out vec4 color;
      void main(){vec3 n=normalize(normal);float light=.63+.37*max(0.0,dot(n,normalize(vec3(-.45,-.55,.9))));
        float crown=u_crown*pow(max(n.z,0.0),5.0);vec3 rgb=u_color.rgb*light+vec3(crown*.95,crown*.88,crown*.72);
        float elevation=clamp((position.z-u_elevation.x)/max(u_elevation.y-u_elevation.x,.000000000001),0.0,1.0);
        rgb*=mix(1.0,mix(.78,1.0,smoothstep(0.0,.8,elevation)),1.0-abs(n.z));
        float ink=0.0,alpha=u_color.a;
        if(u_roof_ink>0.0){
          vec2 p=position.xy-u_roof_center;vec2 uv=vec2(dot(p,u_roof_inverse.xy),dot(p,u_roof_inverse.zw));
          float phi=atan(uv.y,uv.x),r=length(uv),theta=phi-u_roof_rotation;
          float a=pow(cos(theta)/.77,2.0),b=abs(sin(theta))/.24;
          float edge=2.0/(b+sqrt(b*b+4.0*a));
          float rimDistance=abs(r-edge)/max(fwidth(r-edge),.000001);
          float cycle=phi*48.0/6.28318530718;
          vec2 dx=dFdx(uv),dy=dFdy(uv);
          float angleWidth=(abs(uv.x*dx.y-uv.y*dx.x)+abs(uv.x*dy.y-uv.y*dy.x))/max(dot(uv,uv),.000001);
          float spokeDistance=abs(fract(cycle+.5)-.5)/max(angleWidth*48.0/6.28318530718,.000001);
          ink=max(1.0-smoothstep(.15,.85,rimDistance),(1.0-smoothstep(.1,.75,spokeDistance))*step(edge,r))*u_roof_ink;
          rgb=mix(rgb,u_seam*light,ink*.42);
        }
        if(abs(n.z)>.65)alpha=max(alpha,u_solid_roof);
        if(u_ghost>.5 && u_detail<.5 && abs(n.z)>.65){if(ink==0.0)discard;alpha=.17*ink;rgb=u_seam;}
        color=vec4(rgb*alpha,alpha);}`);
    this.program=gl.createProgram()!;gl.attachShader(this.program,v);gl.attachShader(this.program,f);gl.linkProgram(this.program);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program)||'Roof surface program');
    this.vao=gl.createVertexArray()!;gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.STATIC_DRAW);
    for(const [name,offset] of [['a_position',0],['a_normal',12]] as const){const i=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,24,offset);}gl.bindVertexArray(null);
  }
  update(palette:MapPalette,active:string[],ghost:string[],hovered?:string){this.palette=palette;this.active=new Set(active);this.ghost=new Set(ghost);this.hovered=hovered;this.map?.triggerRepaint();}
  render(gl:WebGL2RenderingContext,input:CustomRenderMethodInput){
    if(!this.program||!this.map)return;
    const m=Array.from(input.defaultProjectionData.mainMatrix);for(let i=0;i<4;i++)m[12+i]+=m[i]*this.origin.x+m[4+i]*this.origin.y;
    const height=Math.min(1,this.map.getPitch()/12),w=this.map.getContainer().clientWidth,h=this.map.getContainer().clientHeight;
    // Keep every vertex on the ground in planar view, while retaining the
    // authored roof stack in depth. Otherwise merging by material makes glass,
    // crown rims and skylights overwrite one another at exactly the same z.
    this.matrix=m;this.heightFactor=height;this.flatDepthBias=500*Math.pow(1-height,12);
    const key=m.join(',')+','+height+','+w+','+h;
    if(key!==this.projectionKey){this.projectionKey=key;for(const g of this.groups){
      // Only eight box corners during a camera gesture. Exact triangle
      // projection is deferred until a pointer actually enters this roof.
      const b=g.worldBounds!,bounds=[Infinity,Infinity,-Infinity,-Infinity];let front=0,behind=0,nearCut=false;
      for(const x0 of [b[0],b[3]])for(const y0 of [b[1],b[4]])for(const z0 of [b[2],b[5]]){const z=z0*(g.extrusion?1:height),q=m[3]*x0+m[7]*y0+m[11]*z+m[15];
        if(q<=1e-8){behind++;continue;}front++;
        const clipZ=m[2]*x0+m[6]*y0+m[10]*z+m[14]-z0*(g.extrusion?0:this.flatDepthBias)*q;if(clipZ < -q || clipZ > q)nearCut=true;
        const x=((m[0]*x0+m[4]*y0+m[8]*z+m[12])/q+1)*w/2,y=(1-(m[1]*x0+m[5]*y0+m[9]*z+m[13])/q)*h/2;
        bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
      g.screen=undefined;g.bounds=front&&(behind||nearCut)?[-Infinity,-Infinity,Infinity,Infinity]:bounds;
      const x=(b[0]+b[3])/2,y=(b[1]+b[4])/2,z0=b[2]*(g.extrusion?1:height),z1=b[5]*(g.extrusion?1:height);
      const q0=m[3]*x+m[7]*y+m[11]*z0+m[15],q1=m[3]*x+m[7]*y+m[11]*z1+m[15];
      g.wallPixels=q0>1e-8&&q1>1e-8
        ? Math.abs((m[1]*x+m[5]*y+m[9]*z1+m[13])/q1-(m[1]*x+m[5]*y+m[9]*z0+m[13])/q0)*h/2
        : Infinity;
    }}
    gl.useProgram(this.program);gl.bindVertexArray(this.vao!);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.depthMask(true);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program,'u_matrix'),false,new Float32Array(m));
    gl.uniform1f(gl.getUniformLocation(this.program,'u_height'),height);
    gl.uniform1f(gl.getUniformLocation(this.program,'u_flat_bias'),this.flatDepthBias);
    const nearTexture = Math.max(0, Math.min(1, (this.map.getZoom() - 16.4) / 1.5));
    const groups=this.groups.filter(g=>{
      const b=g.bounds!;
      return b[2]>=0&&b[3]>=0&&b[0]<=w&&b[1]<=h&&(!g.extrusion||height>0);
    }).sort((a,b)=>Number(this.ghost.has(a.id))-Number(this.ghost.has(b.id)));
    // Resolve visible surfaces before translucent color. Authored buildings
    // and simple volumes then have the same glass/stone depth behavior, without
    // accumulating hidden rear walls. Fading facade ink must not punch holes
    // in its supporting wall; cutaways retain the scene beneath them.
    gl.colorMask(false,false,false,false);
    gl.uniform1f(gl.getUniformLocation(this.program,'u_ghost'),0);
    gl.uniform1f(gl.getUniformLocation(this.program,'u_roof_ink'),0);
    for(const g of groups){
      if(this.ghost.has(g.id)||facadeTextures.has(g.material))continue;
      gl.uniform1f(gl.getUniformLocation(this.program,'u_height'),g.extrusion?1:height);
      gl.uniform1f(gl.getUniformLocation(this.program,'u_flat_bias'),g.extrusion?0:this.flatDepthBias);
      gl.drawArrays(gl.TRIANGLES,g.first,g.count);
    }
    gl.colorMask(true,true,true,true);
    const seam=[1,3,5].map(i=>parseInt(this.palette.recess.slice(i,i+2),16)/255);
    gl.uniform3f(gl.getUniformLocation(this.program,'u_seam'),seam[0],seam[1],seam[2]);
    for(const g of groups){
      gl.uniform1f(gl.getUniformLocation(this.program,'u_height'),g.extrusion?1:height);gl.uniform1f(gl.getUniformLocation(this.program,'u_flat_bias'),g.extrusion?0:this.flatDepthBias);
      gl.depthMask(!this.ghost.has(g.id));
      // One restrained contact gradient spans every material of a building.
      // It shades the retained mesh; it does not introduce floors or change height.
      gl.uniform2fv(gl.getUniformLocation(this.program,'u_elevation'),this.elevations.get(g.id)!);
      // Panel lines are material ink on this exact roof, not thin independent
      // faces competing with it for depth. Derivatives keep them antialiased
      // at every scale; the retained 48 divisions are illustrative, not a survey.
      gl.uniform1f(gl.getUniformLocation(this.program,'u_roof_ink'),g.roofInk?nearTexture:0);
      if(g.roofInk){
        gl.uniform2fv(gl.getUniformLocation(this.program,'u_roof_center'),g.roofInk.center);
        gl.uniform4fv(gl.getUniformLocation(this.program,'u_roof_inverse'),g.roofInk.inverse);
        gl.uniform1f(gl.getUniformLocation(this.program,'u_roof_rotation'),g.roofInk.rotation);
      }

      const active = this.active.has(g.id);
      const roofMaterial = ['roof', 'tile-roof', 'dorm-roof'].includes(g.material);
      const materialToken = surfaceMaterialTokens[g.material] || 'roof';
      let hex = this.palette[materialToken];
      let blend = active ? (roofMaterial ? .09 : .14) : this.hovered === g.id ? .05 : 0;
      if (g.extrusion) {
        hex = active ? this.palette.selectedBuilding : this.palette.building;
        blend = active ? 0 : Number(this.states.get(g.id)?.hoverValue || 0);
      }
      const accent = g.extrusion ? this.palette.hover : this.palette.selected;
      const rgb=[1,3,5].map(i=>(parseInt(hex.slice(i,i+2),16)*(1-blend)+parseInt(accent.slice(i,i+2),16)*blend)/255);
      // A focused cutaway keeps the enclosing sides and fine rim structure.
      // Stacking translucent roof slabs would wash out the selected building
      // below them, and writing their depth would hide the route again.
      const ghost=this.ghost.has(g.id),detail=['mullion','skylight','seam','dorm-band','dorm-parapet'].includes(g.material);
      gl.uniform1f(gl.getUniformLocation(this.program,'u_ghost'),Number(ghost));gl.uniform1f(gl.getUniformLocation(this.program,'u_detail'),Number(detail));
      // Matte tile slopes should read through shape and diffuse light. A
      // bright horizontal crown made their eaves look like a raised bowl rim.
      gl.uniform1f(gl.getUniformLocation(this.program,'u_crown'),['tile-roof','dorm-roof','garden'].includes(g.material)?0:.025);
      const texture=facadeTextures.has(g.material);
      // Tall buildings reach facade scale before the map's close-detail zoom.
      // Fade by projected wall height as well, keeping small overview volumes,
      // glazing and explicit cutaways on their existing transparency paths.
      const wallDetail=Math.max(nearTexture,Math.max(0,Math.min(1,((g.wallPixels||0)-32)/40)));
      const wallOpacity=this.extrusionOpacity+(1-this.extrusionOpacity)*wallDetail;
      let alpha = texture ? nearTexture*.45 : materialToken==='glass' ? this.extrusionOpacity*.82
        : materialToken==='wall' ? wallOpacity : 1;
      if (g.extrusion) alpha = height * wallOpacity;
      if (ghost) alpha = g.extrusion ? height * .18 : detail ? .17 : .045;
      // A simple roof is the same continuous surface as an authored roof.
      // Keep translucent walls, without projecting ground ink through its lid.
      gl.uniform1f(gl.getUniformLocation(this.program,'u_solid_roof'),g.extrusion&&!ghost?height:0);
      gl.uniform4f(gl.getUniformLocation(this.program,'u_color'),rgb[0],rgb[1],rgb[2],alpha);
      gl.drawArrays(gl.TRIANGLES,g.first,g.count);}
    gl.depthMask(false);gl.bindVertexArray(null);
  }
  /** Pick the visible roof triangles, including the raised silhouette. */
  pickHit(x:number,y:number,ignoreId?:string,includeGhost=true):{id:string;depth:number}|undefined {
    if(!this.map||!this.matrix)return;const m=this.matrix,w=this.map.getContainer().clientWidth,h=this.map.getContainer().clientHeight;
    let hit:{id:string;depth:number}|undefined;
    for(const g of this.groups){if(g.id===ignoreId||g.extrusion&&!this.heightFactor||!includeGhost&&this.ghost.has(g.id))continue;const b=g.bounds;if(!b||x<b[0]||y<b[1]||x>b[2]||y>b[3])continue;
      if(!g.screen){const s:number[]=[];
        for(const face of g.faces){const polygon=projectFace(face,m,w,h,g.extrusion?1:this.heightFactor,g.extrusion?0:this.flatDepthBias);for(let i=1;i<polygon.length-1;i++)s.push(...polygon[0],...polygon[i],...polygon[i+1]);}
        g.screen=new Float64Array(s);}
      const s=g.screen;
      for(let k=0;k<s.length;k+=9){
        if(x<Math.min(s[k],s[k+3],s[k+6])||x>Math.max(s[k],s[k+3],s[k+6])||y<Math.min(s[k+1],s[k+4],s[k+7])||y>Math.max(s[k+1],s[k+4],s[k+7]))continue;
        const depth=triangleDepth(x,y,[s[k],s[k+1],s[k+2]],[s[k+3],s[k+4],s[k+5]],[s[k+6],s[k+7],s[k+8]]);if(Number.isFinite(depth)&&(!hit||depth<hit.depth))hit={id:g.id,depth};}}
    return hit;
  }
  pick(x:number,y:number):string|undefined {return this.pickHit(x,y)?.id;}
  get cameraKey(){return this.projectionKey;}
  projectLabel(anchor:LabelAnchor):Vec|undefined {
    if(!this.matrix||!this.map)return;
    const p=MercatorCoordinate.fromLngLat(anchor.coordinate,anchor.height),x=p.x-this.origin.x,y=p.y-this.origin.y,z=p.z,m=this.matrix,q=m[3]*x+m[7]*y+m[11]*z+m[15];
    if(q<=1e-8)return;
    const depth=(m[2]*x+m[6]*y+m[10]*z+m[14])/q;if(depth< -1||depth>1)return;
    return [((m[0]*x+m[4]*y+m[8]*z+m[12])/q+1)*this.map.getContainer().clientWidth/2,(1-(m[1]*x+m[5]*y+m[9]*z+m[13])/q)*this.map.getContainer().clientHeight/2,depth];
  }
  /** A caption must not be painted through a different, nearer building. The
   * object's own mesh is skipped, avoiding needless projection of thousands
   * of curved-roof triangles for the common unoccluded case. */
  labelOccluder(anchor:LabelAnchor,id:string,includeGhost=false):string|undefined {
    const p=this.projectLabel(anchor);if(!p||!this.map)return;
    const [x,y,z]=p;if(x<0||y<0||x>this.map.getContainer().clientWidth||y>this.map.getContainer().clientHeight)return;
    const roof=this.pickHit(x,y,id,includeGhost);
    return roof&&roof.depth+1e-6<z?roof.id:undefined;
  }
  onRemove(map:Map,gl:WebGL2RenderingContext){map.off('webglcontextrestored',this.restore);if(this.program)gl.deleteProgram(this.program);if(this.vao)gl.deleteVertexArray(this.vao);if(this.buffer)gl.deleteBuffer(this.buffer);}
}
