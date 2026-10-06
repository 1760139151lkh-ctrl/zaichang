"""Observed east teaching wings; display only, with explicit height uncertainty."""
import math
import numpy as np
from shapely.geometry import box,LineString
from shapely.ops import transform,unary_union
from map_v3_landmarks import SurfaceParts


def academic_models(geometries,to_wgs):
    origin=np.array([2609.,948.]);u=np.array([1.,-.026]);u/=np.linalg.norm(u);v=np.array([-u[1],u[0]])
    def local(x,y,z=None):
        dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
        return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
    def ground(x,y,z=None):return origin[0]+u[0]*np.asarray(x)+v[0]*np.asarray(y),origin[1]+u[1]*np.asarray(x)+v[1]*np.asarray(y)
    def shape(fid):return transform(local,geometries[fid])
    def parts():return SurfaceParts(lambda x,y:to_wgs(*ground(x,y)))
    out=[]
    def finish(fid,g,m,h,basis,children=()):out.append((fid,transform(ground,g),{'type':'authored-mesh','parts':m.parts,'heightM':h,'basis':basis},list(children)))
    def block(m,g,h,bands):
        if g.is_empty:return
        m.sides(g,0,h,'wall');m.face(g,h,'roof')
        m.sides(g.buffer(.025,join_style='mitre'),.9,h-.45,'glass')
        m.face(g.difference(g.buffer(-.22)),h+.06,'skylight')
        m.facade_bands(g,np.linspace(0,h,bands+1)[1:-1],.13)
        m.facade_divisions(g,.7,h-.35,4.1,.10)
    def gallery(m,g,h=6):
        if g.is_empty:return
        for z in [h/2,h]:m.face(g,z,'glass');m.sides(g,z-.22,z,'wall')
        a,b,c,d=g.bounds
        for y in np.arange(b+.7,d,6.5):
            for x in [a+.28,c-.28]:
                pier=box(x-.17,y-.23,x+.17,y+.23).intersection(g)
                if not pier.is_empty:m.sides(pier,0,h,'wall')
    def fittings(m,g,h):
        a,b,c,d=g.bounds
        for y in [b+3,d-3]:
            strip=box(a+5,y-1.2,c-5,y+1.2).intersection(g.buffer(-.6))
            m.face(strip,h+.12,'glass')
            for x in np.arange(a+5,c-5,4):m.face(box(x-.06,y-1.4,x+.06,y+1.4).intersection(strip),h+.17,'mullion')
        for x in [a+3,c-3]:
            for y in [b+3,d-3]:
                stair=box(x-1.3,y-2.8,x+1.3,y+2.8).intersection(g)
                if stair.area>2:m.sides(stair,h-.1,h+1.15,'glass');m.face(stair,h+1.15,'glass')
    def teaching_fittings(m,g,h,lower,upper):
        a,b,c,d=g.bounds
        for y in [upper+2.1,lower-2.3]:
            strip=box(a+5,y-1.2,c-5,y+1.2).intersection(g.buffer(-.35))
            m.sides(strip,h+.04,h+.65,'glass');m.face(strip,h+.65,'glass')
            for x in np.arange(a+5,c-5,4.0):m.face(box(x-.075,y-1.4,x+.075,y+1.4).intersection(strip),h+.72,'mullion')
        # The dark vertical end cores are visible through the whole facade,
        # rather than detached small boxes on an otherwise anonymous roof.
        for x in [a+2.0,(a+c)/2,c-2.0]:
            for lo,hi in [(b,lower),(upper,d)]:
                core=box(x-1.35,lo-.1,x+1.35,hi+.1).intersection(g)
                if core.area>3:m.sides(core.buffer(.028,join_style='mitre'),.1,h+1.05,'facade-recess');m.face(core,h+1.05,'glass')
    for fid,lower,upper,height,children in [
        ('way/161393058',-218.2,-193.0,16.5,['way/306107365','way/306107366','way/306107367']),
        ('way/161393066',-367.0,-332.2,16.5,['way/306107349','way/306107350','way/306107351'])]:
        g=shape(fid);m=parts();a,b,c,d=g.bounds
        wings=g.intersection(unary_union([box(a-1,b-1,c+1,lower),box(a-1,upper,c+1,d+1)]))
        block(m,wings,height,5);teaching_fittings(m,wings,height,lower,upper);gallery(m,g.difference(wings))
        attached=[]
        for i,child in enumerate(children):
            q=shape(child);attached.append(q)
            if i==2:block(m,q,height,5)
            else:gallery(m,q,6.2)
        name='东3' if fid.endswith('058') else '东4'
        basis=f'{name}教学楼：已实际查看官方固定鸟瞰、高德卫星及百度平面，楼翼、两个院落、低连接与临路端部相互核对；源H形与三条独立连接组成同一显示身份，院落保持空。16.5米级主翼、约6米低廊、屋顶梯间和窗带仅为图像比例概化；五层级分格不表示实测层高或室内房间，精确总高未知。原地面、门点和路网不变。'
        finish(fid,unary_union([g,*attached]),m,height+1.2,basis,children)
    fid='way/232500959';g=shape(fid);m=parts();a,b,c,d=g.bounds
    # Three observed east-facing wings stand above the narrow western spine.
    wings=[g.intersection(box(166,-113.3,c+1,-86.8)),g.intersection(box(166,-180.6,c+1,-146.0)),g.intersection(box(166,-227.0,c+1,-208.0))]
    for wing,h,n in zip(wings,[12.8,12.8,9.6],[4,4,3]):block(m,wing,h,n);fittings(m,wing,h)
    spine=g.difference(unary_union(wings))
    west_rooms=spine.intersection(box(a-1,b-1,146,d+1))
    block(m,west_rooms,8.0,2);gallery(m,spine.difference(west_rooms),6.2)
    child='way/306107905';q=shape(child);gallery(m,q,5.8)
    basis='东6东7组团：官方鸟瞰、高德影像和平面资料可辨东向三排楼翼、西侧窄连接与院落，保留共用源ID及真实斜收，不按同一矩形等高拉起。约13米与10米级楼翼、8米级西侧小翼和6米级透空柱廊分别为图像支持的比例概化，精确总高及层数未确认；屋面与分格不产生室内路线、真实窗数或新入口。'
    finish(fid,g.union(q),m,14,basis,[child])
    fid='way/306107369';g=shape(fid);m=parts();a,b,c,d=g.bounds
    wave=lambda x,y:5.7+.3*math.cos((y-b)*2*math.pi/22)
    m.face(g,2.85,'roof');m.sides(g,0,2.85,'wall')
    for y in np.arange(b,d,1.2):m.face(g.intersection(box(a-1,y,c+1,min(d,y+1.2))),wave,'roof')
    gallery(m,g,5.4)
    basis='东3至东4间的已记录长廊段：学校2019资料描述两层学生长廊与波浪廊顶，官方鸟瞰及高德影像支持该段连接关系。只表达原地面记录；6米级体量、波幅和构件间距为概化，不补室内连通或门禁状态。'
    finish(fid,g,m,6.05,basis)
    fid='way/306107376';g=shape(fid);m=parts();gallery(m,g,6.2)
    basis='东5至东6东7的原记录低长廊：官方固定鸟瞰可见抬起楼层和独立低连接，不将原窄廊拉成主楼高度。6米级比例与柱距概化；只显示既有地面对象，不从外壳补室内路网或新门。'
    finish(fid,g,m,6.2,basis)
    return out
