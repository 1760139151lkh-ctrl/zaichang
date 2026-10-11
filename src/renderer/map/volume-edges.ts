import { MercatorCoordinate, type Map, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { MapPalette } from './map-theme';
import { roofBoundaryEdges } from './mesh-geometry';

/** Thin roof rims at the very same stored heights as the building volumes.
 * No invented floors, windows or roof plans. Shares the map depth buffer. */
export class VolumeEdges implements CustomLayerInterface {
  id='volume-rims';type='custom' as const;renderingMode='3d' as const;
  private map?:Map;private gl?:WebGL2RenderingContext;private program?:WebGLProgram;private vao?:WebGLVertexArrayObject;private buffer?:WebGLBuffer;
  private groups:{id:string;first:number;count:number;authored?:boolean}[]=[];
  private vertices:Float32Array;private selected=new Set<string>();private ghost=new Set<string>();
  private origin=MercatorCoordinate.fromLngLat([120.078,30.306]);
  private restore=()=>{if(this.gl)this.setup(this.gl);};
  constructor(data:FeatureCollection,private palette:MapPalette){
    const vertices:number[]=[];
    const segment=(a:number[],b:number[],height?:number)=>{
      const x=MercatorCoordinate.fromLngLat([a[0],a[1]],(height??a[2])+.04),y=MercatorCoordinate.fromLngLat([b[0],b[1]],(height??b[2])+.04);
      for(const corner of [[0,-1],[1,-1],[1,1],[0,-1],[1,1],[0,1]])vertices.push(x.x-this.origin.x,x.y-this.origin.y,x.z,y.x-this.origin.x,y.y-this.origin.y,y.z,...corner);
    };
    for(const f of data.features){
      const model=f.properties?.surfaceModel;
      if(model?.type==='authored-mesh'){
        const first=vertices.length/8;
        for(const e of roofBoundaryEdges(model.parts))segment(e.a,e.b);
        this.groups.push({id:String(f.id),first,count:vertices.length/8-first,authored:true});continue;
      }
      const height=Number(f.properties?.heightM||0);if(f.properties?.kind!=='building'||!height||model)continue;
      const first=vertices.length/8;const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
      for(const poly of polygons)for(const ring of poly)for(let i=1;i<ring.length;i++)segment(ring[i-1],ring[i],height);
      this.groups.push({id:String(f.id),first,count:vertices.length/8-first});
    }
    this.vertices=new Float32Array(vertices);
  }
  onAdd(map:Map,gl:WebGL2RenderingContext){this.map=map;this.gl=gl;this.setup(gl);map.on('webglcontextrestored',this.restore);}
  private setup(gl:WebGL2RenderingContext){
    const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Roof rim shader');return s;};
    const v=shader(gl.VERTEX_SHADER,`#version 300 es
      precision highp float;
      in vec3 a_start;in vec3 a_end;in vec2 a_corner;
      uniform mat4 u_matrix;uniform vec2 u_size;uniform float u_width;uniform float u_height;
      void main(){vec4 a=u_matrix*vec4(a_start.xy,a_start.z*u_height,1.0),b=u_matrix*vec4(a_end.xy,a_end.z*u_height,1.0);
        vec2 delta=(b.xy/b.w-a.xy/a.w)*u_size;
        vec2 normal=vec2(-delta.y,delta.x)/max(length(delta),0.001);
        vec4 p=mix(a,b,a_corner.x);p.xy+=normal*a_corner.y*u_width/u_size*p.w;
        p.z-=0.00001*p.w;gl_Position=p;}`);
    const f=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;uniform vec4 u_color;out vec4 color;
      void main(){color=vec4(u_color.rgb*u_color.a,u_color.a);}`);
    const program=gl.createProgram()!;gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Roof rim program');
    this.program=program;this.vao=gl.createVertexArray()!;gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.STATIC_DRAW);
    for(const [name,size,offset] of [['a_start',3,0],['a_end',3,12],['a_corner',2,24]] as const){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,32,offset);}gl.bindVertexArray(null);
  }
  update(palette:MapPalette,selected:string[],ghost:string[]){this.palette=palette;this.selected=new Set(selected);this.ghost=new Set(ghost);this.map?.triggerRepaint();}
  render(gl:WebGL2RenderingContext,options:CustomRenderMethodInput){
    if(!this.program||!this.map||this.map.getPitch()<1)return;
    const m=Array.from(options.defaultProjectionData.mainMatrix),o=this.origin;
    // Do the world-origin translation in double precision before uploading.
    for(let i=0;i<4;i++)m[12+i]+=m[i]*o.x+m[4+i]*o.y;
    gl.useProgram(this.program);gl.bindVertexArray(this.vao!);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program,'u_matrix'),false,new Float32Array(m));gl.uniform2f(gl.getUniformLocation(this.program,'u_size'),gl.drawingBufferWidth,gl.drawingBufferHeight);
    const dpr=gl.drawingBufferWidth/this.map.getContainer().clientWidth,opacity=Math.min(1,Math.max(0,(this.map.getZoom()-15)/2))*Math.min(1,this.map.getPitch()/12);
    for(const group of this.groups){const ghost=this.ghost.has(group.id);if(group.authored&&!ghost)continue;
      const active=this.selected.has(group.id),hex=active?this.palette.selected:this.palette.text,alpha=(ghost?(group.authored?.38:.12):active?.85:.32)*opacity;
      gl.uniform1f(gl.getUniformLocation(this.program,'u_height'),group.authored?Math.min(1,this.map.getPitch()/12):1);
      gl.uniform1f(gl.getUniformLocation(this.program,'u_width'),(active?1.2:group.authored?.75:.6)*dpr);
      gl.uniform4f(gl.getUniformLocation(this.program,'u_color'),parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,alpha);gl.drawArrays(gl.TRIANGLES,group.first,group.count);
    }
    gl.bindVertexArray(null);
  }
  onRemove(map:Map,gl:WebGL2RenderingContext){map.off('webglcontextrestored',this.restore);if(this.program)gl.deleteProgram(this.program);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.vao)gl.deleteVertexArray(this.vao);}
}
