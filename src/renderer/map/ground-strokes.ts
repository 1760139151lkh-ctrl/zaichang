import {MercatorCoordinate, type Map as MapLibreMap, type CustomLayerInterface, type CustomRenderMethodInput, type LineLayerSpecification} from 'maplibre-gl';
import {Color, createExpression, latest, type StyleExpression, type StylePropertySpecification} from '@maplibre/maplibre-gl-style-spec';
import type {Feature, FeatureCollection} from 'geojson';
import {groundFillOrigin, groundFillRings, groundFillNodes} from './ground-fills';

type XY = [number, number];
type StrokeState = Record<string, boolean | number>;
type StrokeGroup = {feature: Feature; type: 2 | 3; rings: XY[][]; bounds: number[]; first: number; segments: number; count: number};
type PaintKey = 'line-color' | 'line-opacity' | 'line-width' | 'line-blur';
type Program = {program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>};
type Ink = {line: Program; composite: Program; vao: WebGLVertexArrayObject; buffer: WebGLBuffer; texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number; owners: number};
const inks = new WeakMap<WebGL2RenderingContext, Ink>();

/** Solid polygon ink and the selected shoreline use the same uncut plane as
 * their fill. Dashed areas and ordinary centreline roads stay native. */
export const groundStrokeLayers = new Set([
  'garden-edge', 'water-depth', 'shore', 'sports-inset', 'sports-edge',
  'pedestrian-area-edges', 'building-soft-shadow', 'building-edges', 'roof-light',
  'selection-aura', 'selected-shore', 'selected-part',
]);

function expression(value: unknown, key: string, property?: PaintKey): StyleExpression {
  const parsed = createExpression(value, key, property ? latest.paint_line[property] as StylePropertySpecification : undefined);
  if (parsed.result !== 'success') throw new Error(`${key}: ${parsed.value.map(e => e.message).join('; ')}`);
  return parsed.value;
}

function program(gl: WebGL2RenderingContext, vertex: string, fragment: string, names: string[]): Program {
  const compile = (type: number, source: string) => {
    const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Ground stroke shader');return shader;
  };
  const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram()!;
  gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Ground stroke program');
  return {program:p,uniforms:Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(p,name)]))};
}

function inkFor(gl: WebGL2RenderingContext): Ink {
  const old=inks.get(gl);if(old&&gl.isProgram(old.line.program))return old;
  const line=program(gl,`#version 300 es
    precision highp float;
    layout(location=0) in vec2 a_previous;layout(location=1) in vec2 a_point;layout(location=2) in vec2 a_next;layout(location=3) in vec3 a_corner;
    uniform mat4 u_matrix;uniform vec2 u_size;uniform vec2 u_offset;uniform float u_width;uniform float u_blur;uniform float u_aa;uniform float u_join;uniform float u_cap;uniform float u_miter;
    out vec2 position;out float weight;flat out float segmentLength;flat out float primitive;flat out vec2 incoming;flat out vec2 outgoing;flat out vec2 middle;flat out float miter;
    vec2 delta(vec4 p,vec4 d){return (d.xy*p.w-p.xy*d.w)/((p.w+d.w)*p.w)*u_size*.5;}
    bool limit(float a,float b,inout float first,inout float last){if(a<0.0&&b<0.0)return false;if((a<0.0)!=(b<0.0)){float t=a/(a-b);if(a<0.0)first=max(first,t);else last=min(last,t);}return first<=last;}
    void main(){
      primitive=a_corner.z;incoming=vec2(0.0);outgoing=vec2(0.0);middle=vec2(0.0);miter=0.0;segmentLength=0.0;position=vec2(0.0);weight=1.0;
      vec4 p=u_matrix*vec4(a_point,0.0,1.0),d=u_matrix*vec4(a_next-a_point,0.0,0.0);float radius=u_width*.5,padding=u_blur+u_aa;
      if(primitive<.5){
        vec4 end=p+d;float first=0.0,last=1.0;
        if(!limit(p.w-1e-8,end.w-1e-8,first,last)||!limit(p.z+p.w,end.z+end.w,first,last)||!limit(p.w-p.z,end.w-end.z,first,last)){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
        p+=d*first;d*=last-first;vec2 difference=delta(p,d);segmentLength=length(difference);
        if(segmentLength==0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
        vec2 axis=difference/segmentLength,normal=vec2(-axis.y,axis.x);float t=(a_corner.x+1.0)*.5;vec4 q=p+d*t;
        vec2 local=vec2(t*segmentLength+a_corner.x*(radius+padding),a_corner.y*(radius+padding));
        vec2 offset=axis*(local.x-t*segmentLength)+normal*local.y;gl_Position=q;gl_Position.xy+=(offset*2.0/u_size+u_offset)*q.w;
        position=local*q.w;weight=q.w;
      }else{
        if(u_join==0.0||p.w<1e-8||p.z < -p.w||p.z > p.w){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
        vec4 before=u_matrix*vec4(a_previous-a_point,0.0,0.0),beforeEnd=p+before,nextEnd=p+d;float first=0.0,last=1.0;
        if(!limit(p.w-1e-8,beforeEnd.w-1e-8,first,last)||!limit(p.z+p.w,beforeEnd.z+beforeEnd.w,first,last)||!limit(p.w-p.z,beforeEnd.w-beforeEnd.z,first,last)){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}before*=last;
        first=0.0;last=1.0;if(!limit(p.w-1e-8,nextEnd.w-1e-8,first,last)||!limit(p.z+p.w,nextEnd.z+nextEnd.w,first,last)||!limit(p.w-p.z,nextEnd.w-nextEnd.z,first,last)){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}d*=last;
        vec2 da=-delta(p,before),db=delta(p,d);
        float la=length(da),lb=length(db);if(la==0.0||lb==0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
        da/=la;db/=lb;float turn=da.x*db.y-da.y*db.x;
        if(turn==0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
        float side=-sign(turn);vec2 na=vec2(-da.y,da.x)*side,nb=vec2(-db.y,db.x)*side;
        incoming=na*radius;outgoing=nb*radius;float den=1.0+dot(na,nb);middle=(na+nb)*radius/max(den,1e-8);
        miter=float(u_join==1.0&&den>0.0&&length(middle)<=radius*u_miter);float bound=radius*(miter>.5?u_miter:1.0)+padding;
        vec2 local=a_corner.xy*bound;gl_Position=p;gl_Position.xy+=(local*2.0/u_size+u_offset)*p.w;position=local*p.w;weight=p.w;
      }
    }`, `#version 300 es
    precision highp float;in vec2 position;in float weight;flat in float segmentLength;flat in float primitive;flat in vec2 incoming;flat in vec2 outgoing;flat in vec2 middle;flat in float miter;
    uniform vec4 u_color;uniform float u_width;uniform float u_blur;uniform float u_aa;uniform float u_join;uniform float u_cap;out vec4 color;
    float cross2(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
    float edge(vec2 p,vec2 a,vec2 b){vec2 d=b-a;float den=dot(d,d);return den>0.0?length(p-a-d*clamp(dot(p-a,d)/den,0.0,1.0)):length(p-a);}
    void main(){
      vec2 p=position/weight;float radius=u_width*.5,d;
      if(primitive<.5){
        if(u_join==0.0||u_cap==1.0)d=length(vec2(max(max(-p.x,p.x-segmentLength),0.0),p.y))-radius;
        else{float extra=u_cap==2.0?radius:0.0;vec2 q=vec2(max(-p.x-extra,p.x-segmentLength-extra),abs(p.y)-radius);d=length(max(q,0.0))+min(max(q.x,q.y),0.0);}
      }else{
        float sign_=sign(cross2(incoming,outgoing));vec2 a=vec2(0.0),b=incoming,c=miter>.5?middle:outgoing,e=outgoing;
        bool inside=cross2(b-a,p-a)*sign_>=0.0&&cross2(c-b,p-b)*sign_>=0.0;
        d=min(edge(p,a,b),edge(p,b,c));
        if(miter>.5){inside=inside&&cross2(e-c,p-c)*sign_>=0.0&&cross2(a-e,p-e)*sign_>=0.0;d=min(d,min(edge(p,c,e),edge(p,e,a)));}
        else{inside=inside&&cross2(a-c,p-c)*sign_>=0.0;d=min(d,edge(p,c,a));}
        if(inside)d=-d;
      }
      float spread=u_blur+u_aa,alpha=1.0-smoothstep(-spread,spread,d);if(alpha==0.0)discard;color=u_color*alpha;
    }`, ['u_matrix','u_size','u_offset','u_width','u_blur','u_aa','u_join','u_cap','u_miter','u_color']);
  const composite=program(gl,`#version 300 es
    precision highp float;layout(location=0) in vec2 a_position;out vec2 uv;void main(){gl_Position=vec4(a_position,0.0,1.0);uv=(a_position+1.0)*.5;}`,`#version 300 es
    precision highp float;in vec2 uv;uniform sampler2D u_ink;uniform mat4 u_matrix;uniform vec2 u_offset;out vec4 color;
    void main(){
      vec4 ink=texture(u_ink,uv);if(ink.a==0.0)discard;vec2 n=uv*2.0-1.0-u_offset;
      float a=u_matrix[0][0]-n.x*u_matrix[0][3],b=u_matrix[1][0]-n.x*u_matrix[1][3],c=n.x*u_matrix[3][3]-u_matrix[3][0];
      float d=u_matrix[0][1]-n.y*u_matrix[0][3],e=u_matrix[1][1]-n.y*u_matrix[1][3],f=n.y*u_matrix[3][3]-u_matrix[3][1];float det=a*e-b*d;if(det==0.0)discard;
      vec2 p=vec2((c*e-b*f)/det,(a*f-c*d)/det);vec4 clip=u_matrix*vec4(p,0.0,1.0);if(clip.w<=0.0||clip.z < -clip.w||clip.z > clip.w)discard;
      gl_FragDepth=gl_DepthRange.near+(clip.z/clip.w+1.0)*.5*gl_DepthRange.diff;color=ink;
    }`,['u_ink','u_matrix','u_offset']);
  const vao=gl.createVertexArray()!,buffer=gl.createBuffer()!,texture=gl.createTexture()!,framebuffer=gl.createFramebuffer()!;
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);gl.bindVertexArray(null);
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const ink={line,composite,vao,buffer,texture,framebuffer,width:0,height:0,owners:old?.owners||0};inks.set(gl,ink);return ink;
}

/** Source endpoints stay Float32 in the common local origin. The GPU expands
 * their screen-space strokes, including joins, without integer GeoJSON tiles.
 * A shared transient ink buffer unions a stroke's overlapping segments before
 * compositing its premultiplied colour at the map's ground depth. */
export class GroundStroke implements CustomLayerInterface {
  readonly type='custom' as const;
  readonly renderingMode='2d' as const;
  readonly id:string;
  private map?:MapLibreMap;
  private gl?:WebGL2RenderingContext;
  private ink?:Ink;
  private vao?:WebGLVertexArrayObject;
  private buffer?:WebGLBuffer;
  private vertices=new Float32Array();
  private groups:StrokeGroup[]=[];
  private data?:FeatureCollection;
  private color!:StyleExpression;
  private opacity!:StyleExpression;
  private width!:StyleExpression;
  private blur!:StyleExpression;

  constructor(private specification:LineLayerSpecification,data:FeatureCollection,private states:Map<string,StrokeState>){
    this.id='ground-stroke-'+specification.id;this.updateStyle(specification);this.updateData(data);
  }
  updateStyle(specification:LineLayerSpecification){
    const changedJoin=(this.specification.layout?.['line-join']??'miter')!==(specification.layout?.['line-join']??'miter');
    this.specification=specification;
    this.color=expression(specification.paint?.['line-color']??'#000000',`${this.id}.line-color`,'line-color');
    this.opacity=expression(specification.paint?.['line-opacity']??1,`${this.id}.line-opacity`,'line-opacity');
    this.width=expression(specification.paint?.['line-width']??1,`${this.id}.line-width`,'line-width');
    this.blur=expression(specification.paint?.['line-blur']??0,`${this.id}.line-blur`,'line-blur');
    if(changedJoin&&this.data)this.updateData(this.data);
    this.map?.triggerRepaint();
  }
  updateData(data:FeatureCollection){
    this.data=data;
    const filter=expression(this.specification.filter??true,`${this.id}.filter`),nodes=groundFillNodes(data),vertices:number[]=[];this.groups=[];
    const quad=(previous:XY,point:XY,next:XY,kind:number)=>{for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]])vertices.push(...previous,...point,...next,x,y,kind);};
    for(const feature of data.features){
      const g=feature.geometry,type=g.type==='Polygon'||g.type==='MultiPolygon'?3:g.type==='LineString'||g.type==='MultiLineString'?2:undefined;
      if(!type||!filter.evaluate({zoom:0},{type,id:feature.id,properties:feature.properties||{}}))continue;
      const rings:XY[][]=type===3?groundFillRings(feature,nodes.get(feature.properties?.venueId)).flat():
        (g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[]).map(ring=>ring.map(p=>{const q=MercatorCoordinate.fromLngLat([p[0],p[1]]);return [Math.fround(q.x-groundFillOrigin.x),Math.fround(q.y-groundFillOrigin.y)];}));
      const first=vertices.length/9,bounds=[Infinity,Infinity,-Infinity,-Infinity],paths=[];
      for(const ring of rings){
        for(const [x,y] of ring){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
        const points=ring.filter((p,i)=>!i||p[0]!==ring[i-1][0]||p[1]!==ring[i-1][1]);
        const closed=points.length>1&&points[0][0]===points[points.length-1][0]&&points[0][1]===points[points.length-1][1];
        for(let i=1;i<points.length;i++)quad(points[i-1],points[i-1],points[i],0);
        if(closed)points.pop();
        paths.push({points,closed});
      }
      const segments=vertices.length/9-first;
      // Round joins already come from the union of the segment capsules.
      // Only bevel/miter styles draw separate corner primitives.
      for(const {points,closed} of this.specification.layout?.['line-join']==='round'?[]:paths){
        for(let i=closed?0:1;i<(closed?points.length:points.length-1);i++)quad(points[(i+points.length-1)%points.length],points[i],points[(i+1)%points.length],1);
      }
      this.groups.push({feature,type,rings,bounds,first,segments,count:vertices.length/9-first});
    }
    this.vertices=new Float32Array(vertices);if(this.gl)this.upload(this.gl);this.map?.triggerRepaint();
  }
  private upload(gl:WebGL2RenderingContext){
    if(this.buffer)gl.deleteBuffer(this.buffer);if(this.vao)gl.deleteVertexArray(this.vao);
    this.vao=gl.createVertexArray()!;gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.STATIC_DRAW);
    for(const [location,size,offset] of [[0,2,0],[1,2,8],[2,2,16],[3,3,24]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,36,offset);}gl.bindVertexArray(null);
  }
  onAdd(map:MapLibreMap,gl:WebGL2RenderingContext){this.map=map;this.gl=gl;this.ink=inkFor(gl);this.ink.owners++;this.upload(gl);}
  render(gl:WebGL2RenderingContext,input:CustomRenderMethodInput){
    if(!this.map||!this.ink||this.specification.layout?.visibility==='none')return;
    const zoom=this.map.getZoom();if(zoom<(this.specification.minzoom??0)||zoom>=(this.specification.maxzoom??Infinity))return;
    const width=this.map.getContainer().clientWidth,height=this.map.getContainer().clientHeight;if(!width||!height)return;
    const values=Array.from(input.defaultProjectionData.mainMatrix);for(let i=0;i<4;i++)values[12+i]+=values[i]*groundFillOrigin.x+values[4+i]*groundFillOrigin.y;const matrix=new Float32Array(values);
    const ink=this.ink,framebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING),viewport=gl.getParameter(gl.VIEWPORT),depth=gl.isEnabled(gl.DEPTH_TEST),stencil=gl.isEnabled(gl.STENCIL_TEST),scissor=gl.isEnabled(gl.SCISSOR_TEST);
    const offset=this.specification.paint?.['line-translate'] as number[]|undefined,translate=[(offset?.[0]||0)*2/width,-(offset?.[1]||0)*2/height];
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,ink.texture);
    if(ink.width!==gl.drawingBufferWidth||ink.height!==gl.drawingBufferHeight){ink.width=gl.drawingBufferWidth;ink.height=gl.drawingBufferHeight;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,ink.width,ink.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,ink.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,ink.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Ground stroke ink buffer');gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);}
    const layout=this.specification.layout,join=layout?.['line-join']==='round'?0:layout?.['line-join']==='bevel'?2:1,cap=layout?.['line-cap']==='round'?1:layout?.['line-cap']==='square'?2:0;
    let ranges:{first:number;count:number}[]=[],previous:number[]=[];
    const flush=()=>{
      if(!ranges.length)return;
      gl.bindFramebuffer(gl.FRAMEBUFFER,ink.framebuffer);gl.viewport(0,0,ink.width,ink.height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.STENCIL_TEST);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.CULL_FACE);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendEquation(gl.MAX);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      const line=ink.line.uniforms;gl.useProgram(ink.line.program);gl.bindVertexArray(this.vao!);gl.uniformMatrix4fv(line.u_matrix,false,matrix);gl.uniform2f(line.u_size,width,height);gl.uniform2f(line.u_offset,translate[0],translate[1]);gl.uniform1f(line.u_width,previous[4]);gl.uniform1f(line.u_blur,previous[5]);gl.uniform1f(line.u_aa,width/ink.width*.5);gl.uniform1f(line.u_join,join);gl.uniform1f(line.u_cap,cap);gl.uniform1f(line.u_miter,Number(layout?.['line-miter-limit']??2));gl.uniform4fv(line.u_color,previous.slice(0,4));for(const range of ranges)gl.drawArrays(gl.TRIANGLES,range.first,range.count);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(viewport[0],viewport[1],viewport[2],viewport[3]);if(depth)gl.enable(gl.DEPTH_TEST);if(stencil)gl.enable(gl.STENCIL_TEST);if(scissor)gl.enable(gl.SCISSOR_TEST);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      const composite=ink.composite.uniforms;gl.useProgram(ink.composite.program);gl.bindVertexArray(ink.vao);gl.uniformMatrix4fv(composite.u_matrix,false,matrix);gl.uniform2f(composite.u_offset,translate[0],translate[1]);gl.uniform1i(composite.u_ink,0);gl.drawArrays(gl.TRIANGLES,0,6);
    };
    for(const group of this.groups){
      const feature={type:group.type,id:group.feature.id,properties:group.feature.properties||{}},state=this.states.get(String(group.feature.id))||{},globals={zoom};
      const color=this.color.evaluate(globals,feature,state) as Color,opacity=Number(this.opacity.evaluate(globals,feature,state)),lineWidth=Number(this.width.evaluate(globals,feature,state)),blur=Number(this.blur.evaluate(globals,feature,state));
      if(opacity<=0||lineWidth<=0||!group.count)continue;
      const m=matrix,b=group.bounds,margin=lineWidth*.5*(join===1?Number(layout?.['line-miter-limit']??2):1)+blur+width/ink.width*.5+Math.max(...(offset||[0,0]).map(Math.abs));
      const corners=[[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(([x,y])=>[m[0]*x+m[4]*y+m[12],m[1]*x+m[5]*y+m[13],m[2]*x+m[6]*y+m[14],m[3]*x+m[7]*y+m[15]]);
      if(corners.every(q=>q[3]<1e-8)||corners.every(q=>q[2]<-q[3])||corners.every(q=>q[2]>q[3])||corners.every(q=>q[0]<-(1+2*margin/width)*q[3])||corners.every(q=>q[0]>(1+2*margin/width)*q[3])||corners.every(q=>q[1]<-(1+2*margin/height)*q[3])||corners.every(q=>q[1]>(1+2*margin/height)*q[3]))continue;
      const paint=[color.r*opacity,color.g*opacity,color.b*opacity,color.a*opacity,lineWidth,blur];
      if(!ranges.length||paint.some((v,i)=>v!==previous[i])){flush();ranges=[];previous=paint;}
      const count=join===0?group.segments:group.count,last=ranges[ranges.length-1];if(last&&last.first+last.count===group.first)last.count+=count;else ranges.push({first:group.first,count});
    }
    flush();gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.blendEquation(gl.FUNC_ADD);
  }
  onRemove(map:MapLibreMap,gl:WebGL2RenderingContext){
    if(this.buffer)gl.deleteBuffer(this.buffer);if(this.vao)gl.deleteVertexArray(this.vao);
    const ink=this.ink;if(ink&&!--ink.owners){gl.deleteProgram(ink.line.program);gl.deleteProgram(ink.composite.program);gl.deleteVertexArray(ink.vao);gl.deleteBuffer(ink.buffer);gl.deleteTexture(ink.texture);gl.deleteFramebuffer(ink.framebuffer);inks.delete(gl);}this.map=undefined;this.gl=undefined;this.ink=undefined;
  }
}
