"""Swimming/warm-up complex from reviewed built photographs and public plans.

The measured-looking precision of a mesh is not a survey claim. The swimming
hall height has a construction-document source; the warm-up height remains an
explicit image-proportioned display estimate. Ground routing is not altered.
"""
import math
import numpy as np
from shapely.geometry import Polygon, box
from shapely.ops import transform
from map_v3_landmarks import SurfaceParts
from map_v3_surfaces import frame, soften_source_curve


def wall_to_roof(m,poly,bottom,height,material,spacing=1.2):
    vertices=[]
    for part in list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly]:
        for ring in [part.exterior,*part.interiors]:
            ps=[ring.interpolate(t) for t in np.linspace(0,ring.length,max(4,math.ceil(ring.length/spacing))+1)]
            for a,b in zip(ps,ps[1:]):
                p=m.point(a.x,a.y,bottom);q=m.point(b.x,b.y,bottom)
                r=m.point(b.x,b.y,height(b.x,b.y));s=m.point(a.x,a.y,height(a.x,a.y))
                vertices.extend([p,q,r,p,r,s])
    m.parts.append({'material':material,'vertices':vertices})


def beam(m,a,b,width,depth,material):
    a=np.asarray(a,dtype=float);b=np.asarray(b,dtype=float);d=b-a;d/=np.linalg.norm(d)
    u=np.array([1.,0,0]);v=np.cross(d,u);v/=np.linalg.norm(v)
    points=[a+u*s*depth/2+v*t*width/2 for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    points.extend([p+b-a for p in points[:4]])
    vertices=[]
    for face in [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]:
        for ids in [(face[0],face[1],face[2]),(face[0],face[2],face[3])]:
            vertices.extend(m.point(*points[i]) for i in ids)
    m.parts.append({'material':material,'vertices':vertices})


def pool_complex_models(geometries,to_wgs):
    models=[]
    pool='way/519369449';source=geometries[pool];g=soften_source_curve(source,.65)
    # The source's small pointed return at the south-east entrance belongs to
    # the lower approach, not to the continuous built roof seen from above.
    outline=list(source.exterior.coords)[:-1]
    roof_outline=Polygon([p for p in outline if math.hypot(p[0]-2619.5184,p[1]-1513.5287)>.2])
    upper=soften_source_curve(roof_outline,.65).buffer(-1.35,join_style='round');center=g.centroid
    u=np.array([math.cos(math.pi/4),math.sin(math.pi/4)]);v=np.array([-u[1],u[0]])
    def roof_height(x,y):return 19.25+1.0*np.clip(((x-center.x)*u[0]+(y-center.y)*u[1])/65,-1,1)
    def world(x,y,z=None):
        return center.x+np.asarray(x)*u[0]+np.asarray(y)*v[0],center.y+np.asarray(x)*u[1]+np.asarray(y)*v[1]
    m=SurfaceParts(to_wgs)
    m.sides(g,0,3.1,'wall');m.face(g,3.1,'roof')
    wall_to_roof(m,upper,3.1,roof_height,'glass')
    m.facade_divisions(upper,3.2,17.7,2.0,.14)
    m.face(upper,roof_height,'roof')
    rim=upper.difference(upper.buffer(-.32))
    m.face(rim,lambda x,y:roof_height(x,y)+.12,'skylight')
    # Two fields of dark roof equipment are visible on the built photograph
    # and satellite. Module counts/material notation are not an inventory.
    for x0,y0,x1,y1 in [(-43,9,-26,26),(-22,9,1,26),(5,9,26,26),(-8,-24,12,-7),(15,-24,39,-7)]:
        panels=transform(world,box(x0,y0,x1,y1)).intersection(upper.buffer(-2))
        m.face(panels,lambda x,y:roof_height(x,y)+.17,'glass')
        for y in np.arange(y0,y1,1.45):
            joint=transform(world,box(x0,y-.07,x1,y+.07)).intersection(panels)
            m.face(joint,lambda x,y:roof_height(x,y)+.21,'seam')
        for x in np.arange(x0,x1,6):
            joint=transform(world,box(x-.06,y0,x+.06,y1)).intersection(panels)
            m.face(joint,lambda x,y:roof_height(x,y)+.22,'mullion')
    basis='室内游泳馆：官方导览、校方2022建成配图和高德卫星核对曲尺形屋面、独立前庭与成组屋顶设备板。总高20.50米来自监理单位2016施工记录（室外地坪至屋面最高点），非本次现场复测。基座、缓坡、竖向分格及设备板节距为图像支持的概化；不按旧效果图二手文字虚挖内院，不生成室内泳道或楼层路线。'
    models.append((pool,g,{'type':'authored-mesh','parts':m.parts,'heightM':20.5,'basis':basis}))

    warmup='way/322445520';source=geometries[warmup]
    north,west,lo,hi,_=frame(source,north=True);east=-west
    width=hi[1]-lo[1];length=hi[0]-lo[0];origin=np.array([source.centroid.x,source.centroid.y])
    def world_h(x,y,z=None):
        return origin[0]+(np.asarray(x)-width/2)*east[0]+(np.asarray(y)-length/2)*north[0],origin[1]+(np.asarray(x)-width/2)*east[1]+(np.asarray(y)-length/2)*north[1]
    m=SurfaceParts(lambda x,y:to_wgs(*world_h(x,y)))
    bay=length/8
    def roof(x,y):
        r=np.clip(x/(width*.52),0,1)
        base=5.2+16.4*(2*r-r*r)
        if x>width*.52:base-=1.6*((x-width*.52)/(width*.48))**1.4
        phase=(y/bay)%1
        return base+2.2*math.sin(math.pi*phase)*(.55+.45*math.sin(math.pi*x/width*.95))
    # The 2019 scheme and built view distinguish the east enclosed hall from
    # the descending open cover over the former outdoor pools to its west.
    hall=box(width-29,0,width,length)
    m.sides(hall,0,6.2,'wall');m.face(hall,6.2,'roof')
    wall_to_roof(m,hall,6.2,roof,'glass')
    m.facade_divisions(hall,6.2,19.4,4.2,.2)
    m.facade_bands(hall,[3.1,6.2],.20)
    vertices=[]
    def quad(points,target=vertices):
        for ids in [(0,1,2),(0,2,3)]:target.extend(m.point(*points[i]) for i in ids)
    for j in range(8):
        for a,b in zip(np.linspace(0,width,37),np.linspace(0,width,37)[1:]):
            for c,d in zip(np.linspace(j*bay,(j+1)*bay,13),np.linspace(j*bay,(j+1)*bay,13)[1:]):
                quad([(a,c,roof(a,c)),(b,c,roof(b,c)),(b,d,roof(b,d)),(a,d,roof(a,d))])
    m.parts.append({'material':'roof','vertices':vertices})
    seams=[]
    for j in range(1,8):
        y=j*bay
        for a,b in zip(np.linspace(0,width,37),np.linspace(0,width,37)[1:]):
            quad([(a,y-.09,roof(a,y-.09)+.025),(b,y-.09,roof(b,y-.09)+.025),(b,y+.09,roof(b,y+.09)+.025),(a,y+.09,roof(a,y+.09)+.025)],seams)
    m.parts.append({'material':'seam','vertices':seams})
    # The seven east V supports are visible in the school's 2023 photograph;
    # their thickness and roof heights remain a proportioned simplification.
    for j in range(1,8):
        for side in [-1,1]:
            top_y=(j+side*.47)*bay
            beam(m,[width+.55,j*bay,1.2],[width+.55,top_y,roof(width,top_y)-.2],1.25,1.05,'skylight')
    # Give the shell an actual thin edge, not a tall closed extrusion.
    fascia=[]
    for y in [0,length]:
        for a,b in zip(np.linspace(0,width,65),np.linspace(0,width,65)[1:]):
            quad([(a,y,roof(a,y)),(b,y,roof(b,y)),(b,y,roof(b,y)-.3),(a,y,roof(a,y)-.3)],fascia)
    for x in [0,width]:
        for a,b in zip(np.linspace(0,length,129),np.linspace(0,length,129)[1:]):
            quad([(x,a,roof(x,a)),(x,b,roof(x,b)),(x,b,roof(x,b)-.3),(x,a,roof(x,a)-.3)],fascia)
    m.parts.append({'material':'wall','vertices':fascia})
    basis='亚运热身馆：校方2019公示、官方定位70000068、2023建成大图及高德卫星核对同一馆体；连续八跨屋盖、西侧低落的开放覆盖和东侧七组V形柱分别表达。实际总高未取得，24米级体量、分区宽度、曲率及柱截面按图像比例概化，不是实测高度或构件图。原地面占地和路网保留，不把原泳池上方的屋盖补成可步行地面或室内路线。'
    models.append((warmup,source,{'type':'authored-mesh','parts':m.parts,'heightM':24,'basis':basis}))
    return models
