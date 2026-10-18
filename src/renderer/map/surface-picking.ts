/** Camera-space intersection for authored roofs and neighbouring extrusions.
 * The same matrix drives drawing and picking; points behind the camera cannot
 * become clickable merely because division by a negative w mirrors them. */
export type SurfacePoint=[number,number,number];
type ClipPoint=[number,number,number,number];
const clipPlanes=[(p:ClipPoint)=>p[3]-1e-8,(p:ClipPoint)=>p[2]+p[3],(p:ClipPoint)=>p[3]-p[2]];

export function projectFace(face:SurfacePoint[],m:number[],width:number,height:number,zScale=1,flatDepthBias=0):SurfacePoint[]{
  let whollyVisible=true;
  let polygon:ClipPoint[]=face.map(p=>{
    const z=p[2]*zScale;
    const w=m[3]*p[0]+m[7]*p[1]+m[11]*z+m[15];
    const depth=m[2]*p[0]+m[6]*p[1]+m[10]*z+m[14]-p[2]*flatDepthBias*w;
    whollyVisible &&= w>=1e-8&&depth>=-w&&depth<=w;
    return [m[0]*p[0]+m[4]*p[1]+m[8]*z+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*z+m[13],depth,w];
  });
  if(whollyVisible)return polygon.map(p=>[(p[0]/p[3]+1)*width/2,(1-p[1]/p[3])*height/2,p[2]/p[3]]);
  for(const distance of clipPlanes){
    if(polygon.every(p=>distance(p)>=0))continue;
    const clipped:ClipPoint[]=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b);
      if(da>=0)clipped.push(a);
      if((da>=0)!==(db>=0)){const t=da/(da-db);clipped.push(a.map((x,k)=>x+(b[k]-x)*t) as ClipPoint);}
    }
    polygon=clipped;if(polygon.length<3)return [];
  }
  return polygon.map(p=>[(p[0]/p[3]+1)*width/2,(1-p[1]/p[3])*height/2,p[2]/p[3]]);
}

export function triangleDepth(x:number,y:number,a:SurfacePoint,b:SurfacePoint,c:SurfacePoint,inside=true):number {
  const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(d)<1e-8)return Infinity;
  const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d;
  const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d;
  if(inside&&(u<0||v<0||u+v>1))return Infinity;
  const z=u*a[2]+v*b[2]+(1-u-v)*c[2];
  return Number.isFinite(z)&&z>=-1.000001&&z<=1.000001?z:Infinity;
}
