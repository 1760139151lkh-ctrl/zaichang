import { MercatorCoordinate, type Map, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { MapPalette } from './map-theme';
import { projectFace,triangleDepth,extrusionDepth } from './surface-picking';
import type { LabelAnchor } from './label-anchors';

type Vec=[number,number,number];
type Group={id:string;material:string;first:number;count:number;faces:Vec[][];worldBounds?:number[];screen?:Float64Array;bounds?:number[]};
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

/** Smooth simplified membrane, supported by the school's approximate height.
 * This is not a photogrammetric roof or an indoor model. */
export class RoofSurfaces implements CustomLayerInterface {
  id='roof-surfaces';type='custom' as const;renderingMode='3d' as const;
  private map?:Map;private gl?:WebGL2RenderingContext;private program?:WebGLProgram;
  private vao?:WebGLVertexArrayObject;private buffer?:WebGLBuffer;private vertices:Float32Array;
  private groups:Group[]=[];private active=new Set<string>();private ghost=new Set<string>();
  private hovered?:string;
  private origin=MercatorCoordinate.fromLngLat([120.078,30.306]);private projectionKey='';
  private matrix?:number[];private heightFactor=0;private flatDepthBias=0;
  private nativeVolumes=new globalThis.Map<string,{top:Vec[][][];base:Vec[][][];worldBounds:number[];bounds?:number[]}>();
  private restore=()=>{if(this.gl)this.setup(this.gl);};
  constructor(data:FeatureCollection,private palette:MapPalette){
    const vertices:number[]=[];
    for(const f of data.features){
      const model=f.properties?.surfaceModel;
      if(!model&&f.properties?.kind==='building'&&Number(f.properties.heightM)>0){
        const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
        const world=(height:number):Vec[][][]=>polygons.map(poly=>poly.map(ring=>ring.map(p=>{const q=MercatorCoordinate.fromLngLat([p[0],p[1]],height);return [q.x-this.origin.x,q.y-this.origin.y,q.z];})));
        const top=world(Number(f.properties.heightM)),base=world(Number(f.properties.minHeightM||0)),bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
        for(const p of [...top.flat(2),...base.flat(2)])for(let i=0;i<3;i++){bounds[i]=Math.min(bounds[i],p[i]);bounds[i+3]=Math.max(bounds[i+3],p[i]);}
        this.nativeVolumes.set(String(f.id),{top,base,worldBounds:bounds});
      }
      if(model?.type==='authored-mesh'){
        for(const part of model.parts){const first=vertices.length/6,faces:Vec[][]=[];
          for(let i=0;i<part.vertices.length;i+=3){const face:Vec[]=part.vertices.slice(i,i+3).map((p:number[])=>{const q=MercatorCoordinate.fromLngLat([p[0],p[1]],p[2]);return [q.x-this.origin.x,q.y-this.origin.y,q.z];});
            faces.push(face);
          }
          const normals=authoredNormals(faces,part.material==='tile-roof'||part.material==='dome');
          faces.forEach((face,i)=>face.forEach((p,j)=>vertices.push(...p,...normals[i][j])));
          this.groups.push({id:String(f.id),material:part.material,first,count:vertices.length/6-first,faces});
        }
        continue;
      }
      if(!['air-dome','elliptical-roof'].includes(model?.type))continue;
      const c=MercatorCoordinate.fromLngLat(model.center),a=MercatorCoordinate.fromLngLat(model.axisEnds[1]),b=MercatorCoordinate.fromLngLat(model.sideEnds[1]);
      const axis=[a.x-c.x,a.y-c.y],side=[b.x-c.x,b.y-c.y],height=c.meterInMercatorCoordinateUnits()*model.heightM,base=c.meterInMercatorCoordinateUnits()*(model.baseHeightM||0);
      const lensRadius=(phi:number)=>{const p=phi-(model.lensRotationRad||0),A=Math.cos(p)**2/.77**2,B=Math.abs(Math.sin(p))/.24;return A<1e-8?1/B:2/(B+Math.sqrt(B*B+4*A));};
      // A smooth rounded rectangle in plan, with a continuous barrel-like crown.
      const position=(theta:number,phi:number):Vec=>{
        const k=model.type==='elliptical-roof'?1:.42,cos=Math.cos(phi),sin=Math.sin(phi),edge=lensRadius(phi),t=theta/(Math.PI/2);
        const r=model.type==='elliptical-roof'?(t<=.25?edge*t/.25:edge+(1-edge)*(t-.25)/.75):Math.sin(theta);
        const u=r*Math.sign(cos)*Math.abs(cos)**k,v=r*Math.sign(sin)*Math.abs(sin)**k;
        const top=model.type==='elliptical-roof'?base+(height-base)*(r<edge?1:Math.max(0,(1-r)/(1-edge))):base+(height-base)*Math.cos(theta);
        return [c.x-this.origin.x+axis[0]*u+side[0]*v,c.y-this.origin.y+axis[1]*u+side[1]*v,top];
      };
      const vertex=(theta:number,phi:number)=>{
        const p=position(theta,phi),dt=sub(position(Math.min(Math.PI/2,theta+.0001),phi),position(Math.max(.00001,theta-.0001),phi));
        const dp=sub(position(theta,phi+.0001),position(theta,phi-.0001));let n=unit(cross(dt,dp));if(n[2]<0)n=n.map(x=>-x) as Vec;
        if(theta<.0001)n=[0,0,1];return {p,n};
      };
      const first=vertices.length/6,faces:Vec[][]=[];const rings=32,sectors=96;
      for(let i=0;i<rings;i++)for(let j=0;j<sectors;j++){
        const t0=Math.max(.00001,i/rings*Math.PI/2),t1=(i+1)/rings*Math.PI/2,p0=j/sectors*2*Math.PI,p1=(j+1)/sectors*2*Math.PI;
        const q=[vertex(t0,p0),vertex(t1,p0),vertex(t1,p1),vertex(t0,p1)];
        for(const ids of [[0,1,2],[0,2,3]]){faces.push(ids.map(k=>q[k].p));for(const k of ids)vertices.push(...q[k].p,...q[k].n);}
      }
      this.groups.push({id:String(f.id),material:model.type==='elliptical-roof'?'roof':'dome',first,count:vertices.length/6-first,faces});
      if(model.type==='elliptical-roof'){
        const first=vertices.length/6,faces:Vec[][]=[];const lifted=(r:number,p:number):Vec=>{const edge=lensRadius(p),t=r<=edge?r/edge*.25:.25+(r-edge)/(1-edge)*.75;const q=position(Math.min(1,t)*Math.PI/2,p);q[2]+=c.meterInMercatorCoordinateUnits()*.04;return q;};
        const quad=(q:Vec[])=>{for(const ids of [[0,1,2],[0,2,3]]){const face=ids.map(i=>q[i]);faces.push(face);for(const p of face)vertices.push(...p,0,0,1);}};
        // Quiet panel joints describe the observed radial roof construction.
        // Their density is cartographic material, not a surveyed member count.
        for(let j=0;j<48;j++){const phi=j/48*2*Math.PI,edge=lensRadius(phi);for(let i=0;i<16;i++){const r0=edge+(1-edge)*i/16,r1=edge+(1-edge)*(i+1)/16;quad([lifted(r0,phi-.0009),lifted(r1,phi-.0009),lifted(r1,phi+.0009),lifted(r0,phi+.0009)]);}}
        for(let j=0;j<192;j++){const p0=j/192*2*Math.PI,p1=(j+1)/192*2*Math.PI;quad([lifted(lensRadius(p0)-.002,p0),lifted(lensRadius(p0)+.002,p0),lifted(lensRadius(p1)+.002,p1),lifted(lensRadius(p1)-.002,p1)]);}
        this.groups.push({id:String(f.id),material:'seam',first,count:vertices.length/6-first,faces});
      }
      if(base){const first=vertices.length/6,faces:Vec[][]=[];
        for(let i=0;i<sectors;i++){const pa=position(Math.PI/2,i/sectors*2*Math.PI),pb=position(Math.PI/2,(i+1)/sectors*2*Math.PI),ga:Vec=[pa[0],pa[1],0],gb:Vec=[pb[0],pb[1],0];
          const n=unit(cross(sub(pb,pa),sub(ga,pa)));for(const face of [[pa,pb,gb],[pa,gb,ga]]){faces.push(face);for(const p of face)vertices.push(...p,...n);}}
        this.groups.push({id:String(f.id),material:'wall',first,count:vertices.length/6-first,faces});}
    }
    for(const group of this.groups){const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(const face of group.faces)for(const p of face)for(let i=0;i<3;i++){b[i]=Math.min(b[i],p[i]);b[i+3]=Math.max(b[i+3],p[i]);}group.worldBounds=b;}
    this.vertices=new Float32Array(vertices);
  }
  onAdd(map:Map,gl:WebGL2RenderingContext){this.map=map;this.gl=gl;this.setup(gl);map.on('webglcontextrestored',this.restore);}
  private setup(gl:WebGL2RenderingContext){
    const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Roof surface shader');return s;};
    const v=shader(gl.VERTEX_SHADER,`#version 300 es
      precision highp float;in vec3 a_position;in vec3 a_normal;uniform mat4 u_matrix;uniform float u_height;uniform float u_flat_bias;out vec3 normal;
      void main(){normal=a_normal;gl_Position=u_matrix*vec4(a_position.xy,a_position.z*u_height,1.0);
        gl_Position.z-=a_position.z*u_flat_bias*gl_Position.w;}`);
    const f=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;in vec3 normal;uniform vec4 u_color;uniform float u_ghost;uniform float u_detail;uniform float u_crown;out vec4 color;
      void main(){vec3 n=normalize(normal);float light=.63+.37*max(0.0,dot(n,normalize(vec3(-.45,-.55,.9))));
        if(u_ghost>.5 && u_detail<.5 && abs(n.z)>.65) discard;
        float crown=u_crown*pow(max(n.z,0.0),5.0);vec3 rgb=u_color.rgb*light+vec3(crown*.95,crown*.88,crown*.72);
        color=vec4(rgb*u_color.a,u_color.a);}`);
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
    if(key!==this.projectionKey){this.projectionKey=key;for(const native of this.nativeVolumes.values())native.bounds=undefined;for(const g of this.groups){
      // Only eight box corners during a camera gesture. Exact triangle
      // projection is deferred until a pointer actually enters this roof.
      const b=g.worldBounds!,bounds=[Infinity,Infinity,-Infinity,-Infinity];let front=0,behind=0,nearCut=false;
      for(const x0 of [b[0],b[3]])for(const y0 of [b[1],b[4]])for(const z0 of [b[2],b[5]]){const z=z0*height,q=m[3]*x0+m[7]*y0+m[11]*z+m[15];
        if(q<=1e-8){behind++;continue;}front++;
        const clipZ=m[2]*x0+m[6]*y0+m[10]*z+m[14]-z0*this.flatDepthBias*q;if(clipZ < -q || clipZ > q)nearCut=true;
        const x=((m[0]*x0+m[4]*y0+m[8]*z+m[12])/q+1)*w/2,y=(1-(m[1]*x0+m[5]*y0+m[9]*z+m[13])/q)*h/2;
        bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
      g.screen=undefined;g.bounds=front&&(behind||nearCut)?[-Infinity,-Infinity,Infinity,Infinity]:bounds;
    }}
    gl.useProgram(this.program);gl.bindVertexArray(this.vao!);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.depthMask(true);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program,'u_matrix'),false,new Float32Array(m));
    gl.uniform1f(gl.getUniformLocation(this.program,'u_height'),height);
    gl.uniform1f(gl.getUniformLocation(this.program,'u_flat_bias'),this.flatDepthBias);
    const groups=this.groups.slice().sort((a,b)=>Number(this.ghost.has(a.id))-Number(this.ghost.has(b.id)));
    for(const g of groups){const bounds=g.bounds!;if(bounds[2]<0||bounds[3]<0||bounds[0]>w||bounds[1]>h)continue;
      gl.depthMask(!this.ghost.has(g.id));
      const dark=this.palette.text==='#eeeadf';const materials:Record<string,string>=dark?{dome:'#8a8576',roof:'#787466',skylight:'#97907d',glass:'#62695d',wall:'#787263',mullion:'#938a75',seam:'#5b5e52',garden:'#34372f'}:{dome:'#dedbd1',roof:'#d6d0c2',skylight:'#e3ddcd',glass:'#aab4a5',wall:'#bcb6a9',mullion:'#d9d1bd',seam:'#9d9d8d',garden:'#b7b9aa'};
      Object.assign(materials,dark?{'dorm-roof':'#716c5e','dorm-wall':'#777162','dorm-parapet':'#827b69','dorm-band':'#827b6a','dorm-glass':'#626b5e','dorm-window':'#454c40'}:{'dorm-roof':'#ccc5b4','dorm-wall':'#bcb5a3','dorm-parapet':'#dcd4c0','dorm-band':'#d5ceba','dorm-glass':'#a8b3a1','dorm-window':'#899789'});
      Object.assign(materials,dark?{'tile-roof':'#696757','stone-wall':'#817b6c','facade-recess':'#50574b','timber':'#4e493d','academic-window':'#626b5d'}:{'tile-roof':'#aaa591','stone-wall':'#ccc5b4','facade-recess':'#989e91','timber':'#958771','academic-window':'#9aa397'});
      const roofMaterial=['roof','tile-roof','dorm-roof'].includes(g.material);
      const hex=materials[g.material]||materials.roof,accent=this.palette.selected,blend=this.active.has(g.id)?(roofMaterial?.09:.14):this.hovered===g.id?.05:0;
      const rgb=[1,3,5].map(i=>(parseInt(hex.slice(i,i+2),16)*(1-blend)+parseInt(accent.slice(i,i+2),16)*blend)/255);
      // A focused cutaway keeps the enclosing sides and fine rim structure.
      // Stacking translucent roof slabs would wash out the selected building
      // below them, and writing their depth would hide the route again.
      const ghost=this.ghost.has(g.id),detail=['mullion','skylight','seam','dorm-band','dorm-parapet'].includes(g.material);
      gl.uniform1f(gl.getUniformLocation(this.program,'u_ghost'),Number(ghost));gl.uniform1f(gl.getUniformLocation(this.program,'u_detail'),Number(detail));
      // Matte tile slopes should read through shape and diffuse light. A
      // bright horizontal crown made their eaves look like a raised bowl rim.
      gl.uniform1f(gl.getUniformLocation(this.program,'u_crown'),['tile-roof','dorm-roof','garden'].includes(g.material)?0:.025);
      const texture=g.material==='dorm-band'||g.material==='dorm-window'||g.material==='academic-window';
      const nearTexture=Math.max(0,Math.min(1,(this.map.getZoom()-16.4)/1.5));
      gl.uniform4f(gl.getUniformLocation(this.program,'u_color'),rgb[0],rgb[1],rgb[2],ghost?(detail?.17:.045):texture?nearTexture:1);gl.drawArrays(gl.TRIANGLES,g.first,g.count);}
    gl.depthMask(false);gl.bindVertexArray(null);
  }
  /** Pick the visible roof triangles, including the raised silhouette. */
  pickHit(x:number,y:number,ignoreId?:string,includeGhost=true):{id:string;depth:number}|undefined {
    if(!this.map||!this.matrix)return;const m=this.matrix,w=this.map.getContainer().clientWidth,h=this.map.getContainer().clientHeight;
    let hit:{id:string;depth:number}|undefined;
    for(const g of this.groups){if(g.id===ignoreId||!includeGhost&&this.ghost.has(g.id))continue;const b=g.bounds;if(!b||x<b[0]||y<b[1]||x>b[2]||y>b[3])continue;
      if(!g.screen){const s:number[]=[];
        for(const face of g.faces){const polygon=projectFace(face,m,w,h,this.heightFactor,this.flatDepthBias);for(let i=1;i<polygon.length-1;i++)s.push(...polygon[0],...polygon[i],...polygon[i+1]);}
        g.screen=new Float64Array(s);}
      const s=g.screen;
      for(let k=0;k<s.length;k+=9){
        if(x<Math.min(s[k],s[k+3],s[k+6])||x>Math.max(s[k],s[k+3],s[k+6])||y<Math.min(s[k+1],s[k+4],s[k+7])||y>Math.max(s[k+1],s[k+4],s[k+7]))continue;
        const depth=triangleDepth(x,y,[s[k],s[k+1],s[k+2]],[s[k+3],s[k+4],s[k+5]],[s[k+6],s[k+7],s[k+8]]);if(Number.isFinite(depth)&&(!hit||depth<hit.depth))hit={id:g.id,depth};}}
    return hit;
  }
  pick(x:number,y:number):string|undefined {return this.pickHit(x,y)?.id;}
  nativeDepth(id:string,x:number,y:number):number {
    const volume=this.nativeVolumes.get(id);if(!volume||!this.map||!this.matrix)return Infinity;
    if(!volume.bounds){
      const b=volume.worldBounds,m=this.matrix,w=this.map.getContainer().clientWidth,h=this.map.getContainer().clientHeight,out=[Infinity,Infinity,-Infinity,-Infinity];let clipped=false;
      for(const px of [b[0],b[3]])for(const py of [b[1],b[4]])for(const pz of [b[2],b[5]]){
        const q=m[3]*px+m[7]*py+m[11]*pz+m[15];if(q<=1e-8){clipped=true;continue;}
        const sx=((m[0]*px+m[4]*py+m[8]*pz+m[12])/q+1)*w/2,sy=(1-(m[1]*px+m[5]*py+m[9]*pz+m[13])/q)*h/2;
        out[0]=Math.min(out[0],sx);out[1]=Math.min(out[1],sy);out[2]=Math.max(out[2],sx);out[3]=Math.max(out[3],sy);
      }
      volume.bounds=clipped?[-Infinity,-Infinity,Infinity,Infinity]:out;
    }
    const b=volume.bounds;if(x<b[0]||y<b[1]||x>b[2]||y>b[3])return Infinity;
    return extrusionDepth(x,y,volume.top,volume.base,this.matrix,this.map.getContainer().clientWidth,this.map.getContainer().clientHeight);
  }
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
    const roof=this.pickHit(x,y,id,includeGhost);let found=roof&&roof.depth+1e-6<z?roof:undefined;
    for(const key of this.nativeVolumes.keys()){
      if(key===id||!includeGhost&&this.ghost.has(key))continue;
      const depth=this.nativeDepth(key,x,y);if(depth+1e-6<z&&(!found||depth<found.depth))found={id:key,depth};
    }
    return found?.id;
  }
  onRemove(map:Map,gl:WebGL2RenderingContext){map.off('webglcontextrestored',this.restore);if(this.program)gl.deleteProgram(this.program);if(this.vao)gl.deleteVertexArray(this.vao);if(this.buffer)gl.deleteBuffer(this.buffer);}
}
