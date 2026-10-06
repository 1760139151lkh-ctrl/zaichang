"""Reviewed east teaching wings and galleries, in their source ground frame.

The guide and overhead image agree on the composition, including the oblique
road-side ends. Roof fittings are cartographic approximations, not room plans.
Only display geometry is assembled here; obstacles and routing stay separate.
"""
import math
import numpy as np
from shapely.geometry import Polygon, LineString, box
from shapely.affinity import scale, rotate, translate
from shapely.ops import transform, unary_union
from map_v3_landmarks import SurfaceParts


def teaching_models(geometries, to_wgs):
    origin=np.array([2609.,948.]);u=np.array([1.,-.026]);u/=np.linalg.norm(u);v=np.array([-u[1],u[0]])
    def local(x,y,z=None):
        dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
        return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
    def ground(x,y,z=None):
        return origin[0]+u[0]*np.asarray(x)+v[0]*np.asarray(y),origin[1]+u[1]*np.asarray(x)+v[1]*np.asarray(y)
    def local_shape(fid):return transform(local,geometries[fid])
    def parts():return SurfaceParts(lambda x,y:to_wgs(*ground(x,y)))
    models=[]

    def finish(fid,g,m,height,basis,children=()):
        models.append((fid,transform(ground,g),{'type':'authored-mesh','parts':m.parts,'heightM':height,'basis':basis},list(children)))

    def building(m,g,height,levels):
        m.sides(g,0,height,'wall');m.face(g,height,'roof')
        m.face(g.difference(g.buffer(-.28)),height+.08,'skylight')
        # Narrow bands describe the observed window rhythm, without supplying
        # imaginary rooms or treating the subdivision as a window inventory.
        m.facade_bands(g,np.linspace(0,height,levels+1)[1:-1],.16)
        m.facade_divisions(g,.7,height-.4,4.3,.10)

    def roof_strip(m,g,y,x0,x1,height,width=2.1):
        strip=box(x0,y-width/2,x1,y+width/2).intersection(g.buffer(-.65))
        if strip.is_empty:return
        m.face(strip,height+.12,'glass')
        for x in np.arange(x0,x1,3.8):
            m.face(box(x-.08,y-width,x+.08,y+width).intersection(strip),height+.18,'mullion')

    def stair_roof(m,g,x,y,height):
        tower=box(x-2.0,y-4.6,x+2.0,y+4.6).intersection(g)
        if tower.area<3:return
        m.sides(tower,height-.3,height+1.15,'glass');m.face(tower,height+1.15,'glass')
        for d in [-1.2,0,1.2]:m.face(box(x+d-.07,y-5,x+d+.07,y+5).intersection(tower),height+1.20,'mullion')

    def gallery(m,g,height,levels):
        # These are the separately recorded thin courtyard connectors. Their
        # open sides must not become solid walls from ground to the roof.
        for z in np.linspace(height/levels,height,levels):
            m.face(g,float(z),'roof');m.sides(g,float(z)-.3,float(z),'wall')
        a,b,c,d=g.bounds;spine=LineString([((a+c)/2,b),((a+c)/2,d)])
        for dist in np.linspace(0,spine.length,max(2,round(spine.length/7)+1)):
            p=spine.interpolate(float(dist))
            # Keep a pair of slender edge piers rather than a solid crosswall.
            for end in [box(a,p.y-.3,a+.4,p.y+.3),box(c-.4,p.y-.3,c,p.y+.3)]:
                pier=end.intersection(g)
                if pier.area>1e-6:m.sides(pier,0,height,'wall');m.face(pier,height+.04,'roof')

    east1='way/161325315';g=local_shape(east1);m=parts()
    north=g.intersection(box(-150,18,100,60));south=g.intersection(box(-150,-65,100,-17))
    wings=north.union(south);spine=g.difference(wings)
    building(m,wings,16,5)
    gallery(m,spine,6,2)
    for wing,y in [(north,34),(south,-23)]:
        for lo,hi in [(-107,-12),(13,49)]:roof_strip(m,wing,y,lo,hi,16)
    for wing,y in [(north,29),(south,-29)]:
        for x in [-110,-60,-9,54]:stair_roof(m,wing,x,y,16)
    children=['way/306107372','way/306107373','way/306107374','way/306107375']
    connectors=[]
    for fid in children:
        q=local_shape(fid);connectors.append(q);gallery(m,q,7 if fid.endswith('374') else 9,2 if fid.endswith('374') else 3)
    display=unary_union([g,*connectors])
    basis='东1教学楼：官方鸟瞰与高德卫星共同可见两排教室楼翼、低连廊、分段采光带和屋顶楼梯间；东侧楼端随藕舫路斜收，保留其斜边。主体16米／5层及四条独立连接的7米或9米沿用OSM，中央长廊按校方两层资料作6米概化；屋面楼梯间、分格和采光带尺寸为图像支持的概化，非构件测绘。原地面障碍、路线和入口未改变。'
    finish(east1,display,m,17.2,basis,children)

    east2='way/161325385';g=local_shape(east2);m=parts()
    building(m,g,9,3)
    # The right connector closes the courtyard at a lower level, while the
    # northern and southern wings retain their documented angled road ends.
    child='way/306107368';connector=local_shape(child);gallery(m,connector,6,2)
    a,b,c,d=g.bounds
    for y in [d-4,b+7]:
        roof_strip(m,g,y,a+8,c-9,9)
        for x in [a+4,c-9]:stair_roof(m,g,x,y,9)
    basis='东2教学楼：保留源三层估算9米与沿路斜收的楼翼，按官方鸟瞰和卫星可见的院落、采光带与较低连接段分件表达；连接段6米、屋顶构件和立面分格为图像支持的概化，不是实测或室内资料。与公共地面、接入和路网分开。'
    finish(east2,g.union(connector),m,10.2,basis,[child])

    # The hall's source outline also surrounds the fan-shaped approach. The
    # official guide and satellite both show one oblique oval roof, not an
    # irregular seven-metre solid occupying that whole outline.
    hall='way/161325273'
    oval=translate(rotate(scale(Polygon([(math.cos(t),math.sin(t)) for t in np.linspace(0,2*math.pi,193)[:-1]]),24.0,15.5,origin=(0,0)),45,origin=(0,0)),2513.7,884.8)
    g=transform(local,oval);outline=local_shape(hall);m=parts()
    center=np.array(local(2513.7,884.8));axis=np.array([math.cos(math.pi/4),math.sin(math.pi/4)])
    roof_height=lambda x,y:6.45+.5*np.clip(((x-center[0])*axis[0]+(y-center[1])*axis[1])/24,-1,1)
    m.face(outline.difference(g),.12,'seam')
    m.sides(g,0,5.6,'glass');m.facade_divisions(g,0,5.6,3.8,.14)
    m.face(g,roof_height,'roof')
    m.face(g.difference(g.buffer(-.32)),lambda x,y:roof_height(x,y)+.08,'skylight')
    vertices=[]
    for a,b in zip(g.exterior.coords,list(g.exterior.coords)[1:]):
        pa=m.point(*a,roof_height(*a));pb=m.point(*b,roof_height(*b));qa=m.point(*a,5.6);qb=m.point(*b,5.6)
        vertices.extend([pa,pb,qb,pa,qb,qa])
    m.parts.append({'material':'wall','vertices':vertices})
    basis='临水报告厅：官方鸟瞰和高德卫星共同可见斜向椭圆屋顶，北侧扇形接近区域与屋顶分开；原混合外轮廓不再整块拉到7米。源7米沿用作高度参考，椭圆24×15.5米半轴、倾斜及立面分格为图像支持的概化，非测绘尺寸。外围只作低位轮廓表达，不认定入口或可通行地面；原地面障碍与路网不变。'
    finish(hall,g.union(outline),m,7.05,basis)

    # The school explicitly describes a two-storey north–south gallery with a
    # wavy roof. Its visible width/footprint stays in the existing ground data.
    corridor='way/1122111924';g=local_shape(corridor);m=parts();a,b,c,d=g.bounds
    m.sides(g,0,2.85,'wall');m.face(g,2.85,'roof')
    wave=lambda x,y:5.62+.38*math.cos((y-b)*2*math.pi/22)
    for y in np.arange(b,d,1.2):
        patch=g.intersection(box(a-1,y,c+1,min(d,y+1.2)))
        m.face(patch,wave,'roof')
    # The fine joints make a continuous roof legible in plan as well as pitch.
    for y in np.arange(b,d,4.4):
        joint=g.intersection(box(a-1,y-.045,c+1,y+.045))
        m.face(joint,lambda x,y:wave(x,y)+.025,'seam')
    for y in np.arange(b+1,d,7):
        for x in [a+.35,c-.35]:
            pier=box(x-.18,y-.18,x+.18,y+.18).intersection(g)
            if pier.area>1e-6:m.sides(pier,2.85,wave(x,y),'wall')
    # Thin roof fascia follows the same wave; no tall solid side wall.
    vertices=[]
    ring=g.exterior
    ps=[ring.interpolate(t) for t in np.linspace(0,ring.length,max(4,math.ceil(ring.length/.8))+1)]
    for p,q in zip(ps,ps[1:]):
        pa=m.point(p.x,p.y,wave(p.x,p.y));pb=m.point(q.x,q.y,wave(q.x,q.y));qa=m.point(p.x,p.y,wave(p.x,p.y)-.18);qb=m.point(q.x,q.y,wave(q.x,q.y)-.18)
        vertices.extend([pa,pb,qb,pa,qb,qa])
    m.parts.append({'material':'wall','vertices':vertices})
    basis='学生文化长廊：浙大报2019-03-15明确为连接东一至东四的两层长廊、波浪廊顶，2022校方文章确认二楼空间；本模型仅表达原源已记录的这一段。沿用两层估算约6米，波幅、节距、立柱和板缝为辨识结构的概化，不据此补室内路线、开放时间或将约500米文字当测量值。'
    finish(corridor,g,m,6,basis)
    return models
