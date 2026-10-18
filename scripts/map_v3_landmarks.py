"""Recognisable landmark structure from the reviewed architect's description.

The source footprint and routing remain unchanged. This is an explicitly
simplified display model: roof composition is observed, vertical dimensions
remain estimates from the recorded five levels, not a measured building model.
"""
import math
import numpy as np
from shapely import constrained_delaunay_triangles
from shapely.geometry import Polygon,Point,LineString,box
from shapely.geometry.polygon import orient
from shapely.ops import transform,substring,unary_union
from map_v3_surfaces import soften_source_curve


class SurfaceParts:
    """Small authored surfaces, all attached to the original place identity."""
    def __init__(self,to_wgs):self.parts=[];self.to_wgs=to_wgs
    def point(self,x,y,z):return [*self.to_wgs(float(x),float(y)),float(z)]
    def face(self,poly,z,material):
        if poly.is_empty:return
        height=z if callable(z) else lambda x,y:z
        vertices=[]
        for tri in constrained_delaunay_triangles(poly).geoms:
            vertices.extend(self.point(x,y,height(x,y)) for x,y in list(tri.exterior.coords)[:3])
        if vertices:self.parts.append({'material':material,'vertices':vertices})
    def sides(self,poly,bottom,top,material):
        if poly.is_empty:return
        vertices=[]
        for p in list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly]:
            # Geographic north becomes negative Mercator y. Clockwise in local
            # east/north gives outward wall normals after that axis reversal.
            p=orient(p,sign=-1)
            for ring in [p.exterior,*p.interiors]:
                for a,b in zip(ring.coords,list(ring.coords)[1:]):
                    p0=self.point(*a,bottom);p1=self.point(*b,bottom);q0=self.point(*a,top);q1=self.point(*b,top)
                    vertices.extend([p0,p1,q1,p0,q1,q0])
        if vertices:self.parts.append({'material':material,'vertices':vertices})
    def facade_bands(self,poly,heights,width=.14):
        # Inset horizontal faces vanish behind walls at oblique angles. Put the
        # visible narrow band just outside each wall, including courtyard walls.
        skin=poly.buffer(.035,join_style='mitre')
        for z in heights:self.sides(skin,float(z)-width/2,float(z)+width/2,'mullion')
    def facade_divisions(self,poly,bottom,top,spacing,width=.12):
        skin=poly.buffer(.045,join_style='mitre');vertices=[]
        for p in list(skin.geoms) if skin.geom_type=='MultiPolygon' else [skin]:
            for ring in [p.exterior,*p.interiors]:
                count=max(1,round(ring.length/spacing))
                for k in range(count):
                    a=ring.interpolate(k*ring.length/count);b=ring.interpolate(min(ring.length,k*ring.length/count+width))
                    p0=self.point(a.x,a.y,bottom);p1=self.point(b.x,b.y,bottom);q0=self.point(a.x,a.y,top);q1=self.point(b.x,b.y,top)
                    vertices.extend([p0,p1,q1,p0,q1,q0])
        if vertices:self.parts.append({'material':'mullion','vertices':vertices})


def archives_model(site,to_wgs):
    """A bounded display interpretation of a campus-scale source outline.

    The published architect's photographs and site plan establish a central
    tower, low connected wings, court openings and an east-facing entrance. Their
    placement and low-wing dimensions below are cartographic proportions, not
    traced/surveyed footprints. The source site and route facts stay intact.
    """
    north_west=np.array(site.exterior.coords[0]);north_east=np.array(site.exterior.coords[3])
    u=north_east-north_west;span=np.linalg.norm(u);u/=span
    v=np.array([u[1],-u[0]])
    depth=max(np.dot(np.array(p)-north_west,v) for p in site.exterior.coords)
    def local(x,y,z=None):
        dx=np.asarray(x)-north_west[0];dy=np.asarray(y)-north_west[1]
        return (dx*u[0]+dy*u[1])/span,(dx*v[0]+dy*v[1])/depth
    def ground(x,y,z=None):
        return north_west[0]+u[0]*np.asarray(x)*span+v[0]*np.asarray(y)*depth,north_west[1]+u[1]*np.asarray(x)*span+v[1]*np.asarray(y)*depth
    boundary=transform(local,site)
    tower=box(.43,.34,.62,.70)
    # A continuous low body keeps its two small inner courts open. The larger
    # western garden and eastern entrance forecourt remain outside the model.
    low=unary_union([box(.17,.16,.79,.33),box(.28,.71,.79,.88),box(.69,.30,.79,.75),
                     box(.41,.30,.46,.38),box(.41,.66,.46,.75),box(.59,.30,.71,.75)]).intersection(boundary)
    low=low.difference(unary_union([box(.46,.19,.59,.34),box(.46,.70,.59,.78)]))
    footprint=unary_union([low,tower])
    entrance=box(.71,.43,.80,.62).intersection(low)
    low,tower,footprint,entrance=[transform(ground,g) for g in [low,tower,footprint,entrance]]
    m=SurfaceParts(to_wgs)
    lower_height=17.5;shaft_height=57.5;top_height=67.2
    m.sides(footprint.difference(entrance),0,10.5,'stone-wall')
    m.sides(footprint,10.5,lower_height,'stone-wall')
    m.face(entrance,10.5,'wall')
    m.face(low.difference(tower),lower_height,'roof')
    m.sides(tower,lower_height,shaft_height,'stone-wall')
    m.sides(tower,shaft_height,top_height,'glass');m.face(tower,top_height,'roof')
    m.sides(transform(ground,box(.7098,.43,.7102,.62)),.7,10.5,'glass')
    m.sides(transform(ground,box(.6198,.496,.6202,.544)),lower_height,shaft_height,'glass')
    # The low wings have tall recessed glazed bays between stone piers. Work in
    # east/north metres so the shared wall winding and lighting stay correct.
    skin=orient(footprint.buffer(.025,join_style='mitre'),sign=-1)
    panes=[]
    for ring in [skin.exterior,*skin.interiors]:
        for a,b in zip(ring.coords,list(ring.coords)[1:]):
            a=np.array(a);b=np.array(b);length=np.linalg.norm(b-a)
            count=int(length/6)
            if not count:continue
            direction=(b-a)/length;pitch=length/count;width=min(4,pitch-1.2)
            for index in range(count):
                middle=a+direction*pitch*(index+.5)
                bottom=11.5 if entrance.buffer(.06).covers(Point(*middle)) else 1.4
                left=middle-direction*width/2;right=middle+direction*width/2
                p0=m.point(*left,bottom);p1=m.point(*right,bottom);q0=m.point(*left,15.5);q1=m.point(*right,15.5)
                panes.extend([p0,p1,q1,p0,q1,q0])
    if panes:m.parts.append({'material':'glass','vertices':panes})
    # The published description explicitly calls out vertical recessed seams.
    # These lines express that rhythm, without claiming actual panel counts.
    for x in np.linspace(.43,.62,12)[1:-1]:
        for y in [.34,.70]:
            strip=box(x-.00065,y-.0001,x+.00065,y+.0001)
            m.sides(transform(ground,strip),lower_height,top_height,'facade-recess')
    for y in np.linspace(.34,.70,12)[1:-1]:
        for x in [.43,.62]:
            strip=box(x-.0001,y-.0012,x+.0001,y+.0012)
            m.sides(transform(ground,strip),lower_height,top_height,'facade-recess')
    basis='高塔、低层裙房和院落按公开设计资料作比例示意。资料记载主楼15层、总高67.2米；裙房按17.5米示意，各部分位置、门廊与立面细节未经实地测量。实际出入口和院区内通行仍待核实。'
    return footprint,{'type':'authored-mesh','parts':m.parts,'heightM':top_height,'basis':basis,
        'groundIsProjection':True,'groundFootprintKnown':False,'massingInterpretation':{
            'basis':'cartographic-proxy','sourceOutlineMeaning':'site-extent, not a single building footprint',
            'reportedMainHeightM':67.2,'reportedMainLevels':15,'lowWingDisplayHeightM':lower_height,
            'positionAndDimensionsMeasured':False,'actualEntranceClearanceKnown':False,
            'sourceUrl':'https://www.archina.com/index.php?a=show&g=works&id=159031&m=index',
            'sourceGeometryChanged':False,'displayTreatment':'Central stone tower and glazed crown, continuous low wings, open courts and east entrance portico.'}}


def library_complex_models(geometries,to_wgs):
    """A/B/C ground identities and visible architectural parts, kept distinct.

    The render geometry does not open new walkable space. Facade subdivisions,
    roof fittings and atrium proportions are image-based cartographic detail;
    their counts are not surveyed window or structural-member inventories.
    """
    models=[]
    tower_id='way/161324040';g=soften_source_curve(geometries[tower_id],.65);c=g.centroid
    m=SurfaceParts(to_wgs)
    m.sides(g,0,3.2,'wall');m.sides(g,3.2,52.5,'glass')
    m.face(g,52.5,'roof')
    # Eighteen levels are recorded in the source, but no indoor rooms are made.
    m.facade_bands(g,np.linspace(3.2,52.5,18))
    m.facade_divisions(g,3.2,52.5,g.exterior.length/48)
    # The two square corners and two curved corners are real source features;
    # forcing this tower into a generic cylinder would lose its silhouette.
    inner=Point(c.x,c.y).buffer(7.4,quad_segs=64)
    crown=g.difference(inner)
    m.face(inner,52.56,'glass');m.sides(crown,52.5,55.8,'wall')
    m.face(crown,55.8,'roof')
    glazed=crown.intersection(g.buffer(-1)).difference(inner.buffer(1.4))
    m.face(glazed,55.84,'glass')
    for phi in np.linspace(0,2*math.pi,21)[:-1]:
        ray=LineString([[c.x,c.y],[c.x+60*math.cos(phi),c.y+60*math.sin(phi)]]).buffer(.13,cap_style='flat').intersection(crown)
        m.face(ray,55.92,'skylight')
    tower_basis='图书信息C楼：独立行政塔楼，校方资料与官方地图对应确认；轮廓保留对角直边与对角圆弧，环形冠顶和玻璃分格参照可见图像概化。当前沿用OSM源56米／18层，其他转引高度尚有分歧；分格、冠顶尺寸非实测，无室内导航。'
    models.append((tower_id,g,{'type':'authored-mesh','parts':m.parts,'heightM':56,'basis':tower_basis}))

    library_id='way/237812466';g=geometries[library_id];m=SurfaceParts(to_wgs)
    m.sides(g,0,16,'wall');m.face(g,16,'roof')
    # The eastern glazed roof is not an open ground-level courtyard.
    glass=box(2559,1106,2581.3,1140.8).intersection(g.buffer(-1))
    m.face(glass,16.08,'glass')
    for x in np.arange(2559,2582,3.2):m.face(box(x-.075,1105,x+.075,1142).intersection(glass),16.12,'mullion')
    for y in np.arange(1106,1142,3.2):m.face(box(2558,y-.075,2583,y+.075).intersection(glass),16.12,'mullion')
    m.face(g.difference(g.buffer(-.4)),16.18,'skylight')
    library_basis='基础图书馆（A楼）：L形低楼与C塔楼分别表达，16米／4层沿用地面源属性；玻璃屋面位置和比例参照官方鸟瞰概化，未将玻璃屋顶虚构为地面通路。'
    models.append((library_id,g,{'type':'authored-mesh','parts':m.parts,'heightM':16.18,'basis':library_basis}))

    # B has two courtyards, a lower western wing and a round lecture hall.
    # Roof openings are visible in both the official guide and overhead imagery.
    # They belong to the display model; the raw obstacle/route polygon is kept.
    b_id='way/255623995';source=soften_source_curve(geometries[b_id],.65)
    origin=np.array([2749.7,1056.8]);u=np.array([71.52,-1.89]);u=u/np.linalg.norm(u);v=np.array([-u[1],u[0]])
    def local_b(x,y,z=None):
        dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
        return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
    def ground_b(x,y,z=None):
        return origin[0]+u[0]*np.asarray(x)+v[0]*np.asarray(y),origin[1]+u[1]*np.asarray(x)+v[1]*np.asarray(y)
    footprint=transform(local_b,source)
    courts=box(12,16,58,61).union(box(-35,15,-10,46)).intersection(footprint.buffer(-1))
    body=footprint.difference(courts)
    main=body.intersection(box(-1,-20,100,110))
    hall=body.intersection(box(-100,28,-14,110))
    west=body.difference(main.union(hall))
    m=SurfaceParts(lambda x,y:to_wgs(*ground_b(x,y)))
    # The source service road passes below both low wings. Keep the roof and
    # upper storeys continuous, but do not seal that crossing with wall faces.
    # Width and clearance are cartographic proportions, not measured access.
    passage=transform(local_b,geometries['way/479437312']).buffer(2,cap_style='flat')
    for part,height,material in [(main,20,'glass'),(west,11.5,'wall'),(hall,12.5,'glass')]:
        opening=part.intersection(passage)
        if opening.is_empty:
            m.sides(part,0,height,material)
        else:
            m.sides(part.difference(passage),0,3.5,material)
            m.sides(part,3.5,height,material)
            m.face(opening,3.5,material)
        m.face(part,height,'roof')
        m.face(part.difference(part.buffer(-.32)),height+.08,'skylight')
    # A short glazed section in the low southern wing is a roof, not a third
    # open courtyard. Its grid is material notation rather than window counts.
    glazing=box(-35,4,-10,15).intersection(west.buffer(-.45))
    m.face(glazing,11.56,'glass')
    for x in np.arange(-35,-9,3.5):m.face(box(x-.08,3,x+.08,16).intersection(glazing),11.6,'mullion')
    for y in np.arange(4,16,3.5):m.face(box(-36,y-.08,-9,y+.08).intersection(glazing),11.6,'mullion')
    # Quiet facade bands preserve the different heights without inventing rooms.
    for part,height,levels in [(main,20,6),(west,11.5,3),(hall,12.5,3)]:
        m.facade_bands(part,np.linspace(0,height,levels+1)[1:-1])
    m.facade_divisions(main,0,20,3.6)
    m.face(courts,.12,'garden')
    b_basis='蒙民伟楼（B楼）：官方固定鸟瞰与高德卫星共同可见东、西两个院落、圆形报告厅及较低西翼；按同一楼轴分开表达，南侧玻璃段保留为屋顶。主楼20米／6层沿用OSM，西翼11.5米、报告厅12.5米及院落边界为图像支持的比例概化，非测绘尺寸。原地面障碍与楼下通道路网不改，院落不等于新开放通路。'
    models.append((b_id,transform(ground_b,body),{'type':'authored-mesh','parts':m.parts,'heightM':20.08,
        'basis':'蒙民伟楼：保留两处院落、报告厅和较低西翼，按已记录的楼下通道留出穿行口。主楼高度沿用来源记录；西翼比例、通道宽度和净空为示意。',
        'groundIsProjection':True,
        'recordedPassage':{'roadId':'way/479437312','tunnel':'building_passage','covered':'yes',
            'displayWidthM':4,'displayClearanceM':3.5,'measuredWidthM':None,'measuredClearanceKnown':False,
            'sourceGeometryChanged':False,'priorModelBasis':b_basis}}))
    return models


def east_five_model(source,to_wgs):
    """Separate the photographed roof platform/frame from the teaching wings.

    OSM's single outside outline includes the curved architectural edge. A
    uniform extrusion makes that edge a solid 19-metre-high wedge. The visible
    composition supports a main block plus a thin terrace and open frame.
    """
    source=soften_source_curve(source,.65)
    origin=np.array([2720.2,930.71]);u=np.array([97.84,-3.17]);u=u/np.linalg.norm(u);v=np.array([-u[1],u[0]])
    def local(x,y,z=None):
        dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
        return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
    def ground(x,y,z=None):
        return origin[0]+u[0]*np.asarray(x)+v[0]*np.asarray(y),origin[1]+u[1]*np.asarray(x)+v[1]*np.asarray(y)
    g=transform(local,source);m=SurfaceParts(lambda x,y:to_wgs(*ground(x,y)))
    main=g.intersection(box(-2,-2,98,56.2))
    roof_opening=box(58.5,26,63,34)
    main=main.difference(roof_opening)
    m.sides(main,0,19,'glass');m.face(main,19,'roof')
    m.facade_bands(main,[4.75,9.5,14.25]);m.facade_divisions(main,0,19,3.8)
    # The photographed western crosspiece closes the courtyard above the open
    # ground approach. Keeping it elevated avoids inventing a blocking wall.
    crosspiece=box(0,18.8,4.8,39.5)
    bridge=crosspiece.difference(g)
    m.face(bridge,19,'roof');m.sides(bridge,16.8,19,'glass')
    terrace=g.difference(box(-2,-2,98,56.2))
    m.face(terrace,19,'garden');m.sides(terrace,18.5,19,'wall')
    m.face(terrace.difference(terrace.buffer(-.65)),19.08,'roof')
    m.face(main.difference(main.buffer(-.3)),19.08,'skylight')
    # A thin curved frame is visible in both images. Its vertical scale and
    # support spacing are simplified architectural notation, not a survey.
    arc=substring(source.exterior,source.exterior.project(Point(2842.04,957.75)),source.exterior.project(Point(2816.57,1002.41)))
    arc=transform(local,arc);beam=arc.buffer(.25,cap_style='flat',join_style='round')
    m.face(beam,22.6,'skylight');m.sides(beam,22.15,22.6,'skylight')
    for t in [0,.33,.66,1]:
        p=arc.interpolate(t,normalized=True);support=Point(p.x,p.y).buffer(.25,quad_segs=8)
        m.sides(support,0 if t in [0,1] else 19,22.15,'skylight')
    # The narrow bars above the two classroom roofs are visible skylight strips;
    # their grille subdivision is material detail rather than a room inventory.
    for strip in [box(8,2.8,45,5),box(8,51,45,53.2)]:
        strip=strip.intersection(main);m.face(strip,19.22,'glass')
        for x in np.arange(8,46,3.7):m.face(box(x-.1,0,x+.1,57).intersection(strip),19.28,'mullion')
    # Compose the full existing operands once. Re-adding the clipped
    # crosspiece creates a boundary return that becomes self-crossing when
    # tiled to integer coordinates. The roof opening is disjoint from it.
    display=g.union(crosspiece).difference(roof_opening)
    basis='东5教学楼：官方鸟瞰与高德卫星核对主体、内院、小开口、屋顶平台和外侧弧形构架；不再把整个弧形范围等高拉成厚实体。主体19米／4层沿用OSM；平台、架高、支撑及采光带为图像支持的简化，不是测绘或构件清单。西侧连接段保留为架空屋面，原地面障碍及路网未据此改变。'
    return transform(ground,display),{'type':'authored-mesh','parts':m.parts,'heightM':22.6,'basis':basis}


def crescent_model(source,to_wgs):
    # The long southern facade supplies the building's own axis; it is not
    # forced to geographic east or to an unrelated road.
    ring=np.asarray(source.exterior.coords)[:-1]
    edges=np.roll(ring,-1,axis=0)-ring;k=int(np.argmax(np.linalg.norm(edges,axis=1)))
    a,b=ring[k],ring[(k+1)%len(ring)];u=(b-a)/np.linalg.norm(b-a)
    if u[0]<0:u=-u
    v=np.array([-u[1],u[0]]);origin=(a+b)/2
    def local(x,y,z=None):
        dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
        return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
    # The source's tiny notch outlines a roof/stairstack join; the photographed
    # main roof has a continuous curved perimeter. Keep the raw source intact.
    outline=soften_source_curve(transform(local,source.convex_hull),.65)
    # These relative positions were compared in the official guide and Amap
    # overhead imagery, with the courtyard/passages identified in the paper.
    courtyard=box(-49,12,-17,29)
    entrance=Point(26,8).buffer(8.5,quad_segs=48)
    footprint=outline.difference(courtyard.union(entrance))
    depth=outline.bounds[3]
    roof_height=lambda x,y:3+12*max(0,min(1,y/depth))
    parts=[]
    def geo(x,y,z):
        p=origin+u*x+v*y
        return [*to_wgs(float(p[0]),float(p[1])),float(z)]
    def top(poly,height,material):
        if poly.is_empty:return
        verts=[]
        for triangle in constrained_delaunay_triangles(poly).geoms:
            for x,y in list(triangle.exterior.coords)[:3]:verts.append(geo(x,y,height(x,y)))
        if verts:parts.append({'material':material,'vertices':verts})
    def walls(poly,bottom,top_height,material):
        if poly.is_empty:return
        verts=[]
        for component in (list(poly.geoms) if poly.geom_type=='MultiPolygon' else [poly]):
            for r in [component.exterior,*component.interiors]:
                for p,q in zip(r.coords,list(r.coords)[1:]):
                    pa=geo(*p,bottom(*p));pb=geo(*q,bottom(*q));qa=geo(*p,top_height(*p));qb=geo(*q,top_height(*q))
                    verts.extend([pa,pb,qb,pa,qb,qa])
        if verts:parts.append({'material':material,'vertices':verts})
    glass=box(-11,-1,9,depth+1).union(box(9,-1,44,33)).intersection(footprint)
    opaque=footprint.difference(glass)
    top(opaque,roof_height,'roof');top(glass,lambda x,y:roof_height(x,y)+.025,'glass')
    walls(footprint,lambda x,y:0,roof_height,'wall')
    # North-facing light strips in the zones visible in both source images.
    light_zones=box(-51,30,-15,depth+1).union(box(11,34,47,depth+1)).union(box(47,5,100,depth+1))
    for y in np.arange(6,depth,6):
        strip=box(-100,y,100,y+1.2).intersection(light_zones).intersection(opaque.buffer(-.65))
        top(strip,lambda x,y:roof_height(x,y)+.48,'skylight')
        walls(strip,roof_height,lambda x,y:roof_height(x,y)+.48,'glass')
    # Two stair towers are present in the architect's text and photographs.
    # Their top is a photograph-proportion estimate above the levels-derived
    # roof, explicitly separate from the source's building-height attribute.
    for x in [-13,9]:
        tower=Point(x,depth-3).buffer(2.7,quad_segs=32).intersection(outline)
        top(tower,lambda x,y:22,'roof');walls(tower,roof_height,lambda x,y:22,'wall')
    # Thin mullions give the observed glass plane its structure; no interior
    # rooms or new navigable passages are inferred from this roof drawing.
    for x in np.arange(-11,45,4.5):
        strip=box(x-.055,-1,x+.055,depth+1).intersection(glass)
        top(strip,lambda x,y:roof_height(x,y)+.06,'mullion')
    for y in np.arange(0,depth,5):
        strip=box(-20,y-.055,50,y+.055).intersection(glass)
        top(strip,lambda x,y:roof_height(x,y)+.06,'mullion')
    def ground(x,y,z=None):
        return origin[0]+u[0]*np.asarray(x)+v[0]*np.asarray(y),origin[1]+u[1]*np.asarray(x)+v[1]*np.asarray(y)
    return transform(ground,footprint),{'type':'authored-mesh','parts':parts,'roofHeightEstimateM':15,'towerHeightEstimateM':22,'basis':'月牙楼：原设计论文、官方2.5D及高德卫星核对北高南低屋面、采光带、中央玻璃、庭院与双塔；屋面高度按源5层估计，塔筒按照片比例概化；坡度、开口尺寸与塔高均非实测，未新增室内道路。'}
