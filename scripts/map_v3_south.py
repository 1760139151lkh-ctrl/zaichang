"""Observed southern campus composition, separate from routing geography.

The official 2022 birdseye gives visible massing, roof and court relationships.
Its perspective does not supply measured heights or ground routes. Retained
image proportions and the farm's separate cartographic height module remain
unmeasured display interpretations, not room/floor navigation.
"""
import math
import numpy as np
from shapely.geometry import box,Point,LineString,Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.affinity import rotate
from map_v3_landmarks import SurfaceParts

# A visual module for the existing agricultural teaching compound, explicitly
# separate from surveyed heights or storey counts. Keep its acquired plans.
FARM_STOREY_M = 3.5
FARM_PRIOR_HEIGHTS = {
    'way/504974789': [23.5, 27.2, 28.8],
    'way/504974813': [22.0, 17.0, 23.6],
    'way/504974811': [25.5, 25.58],
    'way/504974817': [20.8, 24.2, 25.5, 27.1],
    'way/504974784': [18.7, 24.5, 25.8],
    'way/504974786': [8.0, 8.08],
    'way/411343678': [23.0, 18.5, 24.04],
}


def south_models(geometries,to_wgs,observations):
    out=[]
    def windows(m,g,h,rows,spacing=4.2):
        verts=[]
        for p in g.geoms if g.geom_type=='MultiPolygon' else [g]:
            p=orient(p,sign=-1)
            for ring in [p.exterior,*p.interiors]:
                for a,b in zip(ring.coords,list(ring.coords)[1:]):
                    a=np.array(a);b=np.array(b);length=np.linalg.norm(b-a)
                    if length<2.8:continue
                    u=(b-a)/length;n=np.array([-u[1],u[0]])*.035
                    count=max(1,int(length/spacing));step=length/count
                    for k in range(count):
                        x=a+u*(k*step+step*.12)+n;y=a+u*((k+1)*step-step*.12)+n
                        for level in range(rows):
                            z0=h*(level+.20)/rows;z1=h*(level+.90)/rows
                            p0=m.point(*x,z0);p1=m.point(*y,z0);q0=m.point(*x,z1);q1=m.point(*y,z1)
                            verts.extend([p0,p1,q1,p0,q1,q0])
        if verts:m.parts.append({'material':'academic-window','vertices':verts})
    def block(m,g,h,rows,material='stone-wall'):
        if g.is_empty:return
        m.sides(g,0,h,material);m.face(g,h,'roof')
        m.face(g.difference(g.buffer(-.28)),h+.08,'skylight')
        windows(m,g,h,rows)
        m.facade_bands(g,np.linspace(0,h,rows+1)[1:-1],.11)
    def skylight(m,g,h,w=8,d=6):
        a,b,c,e=g.bounds;cx=(a+c)/2;cy=(b+e)/2
        q=box(cx-w/2,cy-d/2,cx+w/2,cy+d/2).intersection(g.buffer(-.65))
        if q.is_empty:return
        m.sides(q,h+.06,h+1.0,'glass');m.face(q,h+1.0,'glass')
        for x in np.arange(cx-w/2,cx+w/2,2):m.face(box(x-.06,cy-d/2,x+.06,cy+d/2).intersection(q),h+1.04,'mullion')
    def roof_cores(m,g,h,locations):
        for x,y,w,d in locations:
            q=box(x-w/2,y-d/2,x+w/2,y+d/2).intersection(g.buffer(-.4))
            if q.area>2:m.sides(q,h,h+1.6,'wall');m.face(q,h+1.6,'roof')
    def deck(m,g,z,bottom=None):
        if g.is_empty:return
        m.face(g,z,'roof');m.sides(g,z-.28,z,'wall')
        if bottom is not None:m.face(g,bottom,'roof');m.sides(g,bottom-.25,bottom,'wall')
        # Piers follow the actual long centreline of each source arm.
        for p in g.geoms if g.geom_type=='MultiPolygon' else [g]:
            rect=list(p.minimum_rotated_rectangle.exterior.coords)[:4]
            edges=[(np.array(a),np.array(b)) for a,b in zip(rect,rect[1:]+rect[:1])]
            a,b=max(edges,key=lambda pair:np.linalg.norm(pair[1]-pair[0]));u=(b-a)/np.linalg.norm(b-a)
            n=np.array([-u[1],u[0]]);centre=np.array([p.centroid.x,p.centroid.y]);length=np.linalg.norm(b-a)
            width=min(np.linalg.norm(pair[1]-pair[0]) for pair in edges);offset=max(.25,width/2-.55)
            for t in np.arange(-length/2+1.5,length/2,6.5):
                for side in [-1,1]:
                    c=centre+u*t+n*side*offset
                    q=Polygon([c+u*.22+n*.22,c-u*.22+n*.22,c-u*.22-n*.22,c+u*.22-n*.22]).intersection(p)
                    if q.area>.02:m.sides(q,0,z-.3,'wall')
    def finish(fid,g,m,h,children=()):
        item=next(p for p in observations['objects'] if p['id']==fid)
        basis=item['basis']+' 高度、构件尺寸与分格为图像比例概化，精确总高未知；原地面、入口、个人配置及路网不由模型改写。'
        model={'type':'authored-mesh','parts':m.parts,'heightM':h,'basis':basis}
        if fid in FARM_PRIOR_HEIGHTS:
            model['basis']=item['basis']+' 楼体采用连贯的概化高度，分格仅用于辨认建筑；实际高度与层数待核实。'
            model['massingInterpretation']={
                'kind':'cartographic-proxy','verticalModuleM':FARM_STOREY_M,
                'priorDisplayHeightsM':FARM_PRIOR_HEIGHTS[fid],
                'sourceObservationBasis':item['basis'],'actualHeightM':None,
                'basis':'Continuous wing heights and restrained roof detail; visual interpretation, not a physical height or storey claim.',
            }
        out.append((fid,g,model,list(children)))

    # Medicine: long city-facing bar, court wings, a taller north-east block,
    # and the actual elevated connector. A single 30m extrusion loses all four.
    fid='way/237810389';g=geometries[fid];m=SurfaceParts(to_wgs)
    bridge=g.intersection(box(2094.4,299,2131.1,315.0))
    tower=g.intersection(box(2128.9,295,2180,340))
    south=g.intersection(box(2028,180,2233,262)).difference(tower)
    west=g.difference(unary_union([bridge,tower,south]))
    block(m,west,24.5,7);block(m,south,29.0,8);block(m,tower,32.0,9)
    deck(m,bridge,9.6)
    m.face(bridge.buffer(-.4),9.66,'garden')
    roof_cores(m,west,24.5,[(2045,344,9,5)]);roof_cores(m,tower,32,[(2150,326,12,5)])
    finish(fid,g,m,33.6)

    # The independent museum is the white ovoid in the medicine courtyard.
    fid='way/255623985';g=geometries[fid];m=SurfaceParts(to_wgs)
    c=g.centroid;angle=-.20;u=np.array([math.cos(angle),math.sin(angle)]);v=np.array([-u[1],u[0]])
    rx,ry=13.2,9.2
    ring=Polygon([(c.x+rx*math.cos(t)*u[0]+ry*math.sin(t)*v[0],c.y+rx*math.cos(t)*u[1]+ry*math.sin(t)*v[1]) for t in np.linspace(0,2*math.pi,65)[:-1]])
    m.sides(ring,0,1.2,'wall');verts=[]
    def cap(theta,phi):
        q=np.array([c.x,c.y])+u*rx*math.sin(theta)*math.cos(phi)+v*ry*math.sin(theta)*math.sin(phi)
        return m.point(*q,1.2+9.8*math.cos(theta))
    for i in range(18):
        for j in range(64):
            a=cap(i*math.pi/36,j*math.pi/32);b=cap((i+1)*math.pi/36,j*math.pi/32)
            d=cap(i*math.pi/36,(j+1)*math.pi/32);e=cap((i+1)*math.pi/36,(j+1)*math.pi/32)
            verts.extend([a,b,e,a,e,d])
    m.parts.append({'material':'dome','vertices':verts});finish(fid,ring,m,11.0)

    fid='way/255623986';g=geometries[fid];m=SurfaceParts(to_wgs)
    court=box(2270,308,2302,327).intersection(g.buffer(-2.5));body=g.difference(court)
    block(m,body,21.8,6);m.face(court,.1,'garden');roof_cores(m,body,21.8,[(2304,332,7,4)])
    finish(fid,body,m,23.4)
    fid='way/255623987';g=geometries[fid];m=SurfaceParts(to_wgs);block(m,g,12.2,3)
    roof_cores(m,g,12.2,[(2300,199,10,4)]);finish(fid,g,m,13.8)

    # The low cruciform library has a raised central glazed lantern, not an
    # unbuilt footprint or a high administrative tower.
    fid='way/448480118';g=geometries[fid];m=SurfaceParts(to_wgs)
    # The school photograph shows a continuous dark glazed frontage with
    # vertical structural fins. Rows of punched stone-wall windows are wrong.
    m.sides(g,0,12.0,'glass');m.face(g,12.0,'roof')
    m.facade_bands(g,[4,8],.15);m.facade_divisions(g,.2,11.8,3.2,.18)
    skylight(m,g,12.0,11,7);finish(fid,g,m,13.04,['way/448480119'])

    # Nanotechnology: an enclosed glazed court and three surrounding low bars.
    fid='way/411343688';g=geometries[fid];m=SurfaceParts(to_wgs)
    atrium=box(2555,418,2578,441).intersection(g.buffer(-2));body=g.difference(atrium)
    block(m,body,12.8,3,'wall');m.face(atrium,7.6,'glass')
    for x in np.arange(2555,2578,3):m.face(box(x-.07,417,x+.07,442).intersection(atrium),7.65,'mullion')
    for y in np.arange(418,441,3):m.face(box(2554,y-.07,2579,y+.07).intersection(atrium),7.65,'mullion')
    roof_cores(m,body,12.8,[(2547,413,6,5),(2584,454,6,5)]);finish(fid,g,m,14.4)
    for fid,h,n in [('way/411343689',9.0,2),('way/411343690',10.5,3)]:
        g=geometries[fid];m=SurfaceParts(to_wgs);block(m,g,h,n,'wall');finish(fid,g,m,h+.08)

    # Farm A/B/D retain the real diagonals and separate adjoining source wings.
    fid='way/504974789';g=geometries[fid];m=SurfaceParts(to_wgs)
    north=g.intersection(box(2780,298,2870,340));body=g.difference(north)
    block(m,body,7*FARM_STOREY_M,7);block(m,north,8*FARM_STOREY_M,8)
    finish(fid,g,m,8*FARM_STOREY_M+.08)
    fid='way/504974813';g=geometries[fid];m=SurfaceParts(to_wgs)
    block(m,g,6*FARM_STOREY_M,6)
    annex='way/504974812';q=geometries[annex];block(m,q,5*FARM_STOREY_M,5);finish(fid,g.union(q),m,6*FARM_STOREY_M+.08,[annex])
    fid='way/504974811';g=geometries[fid];m=SurfaceParts(to_wgs);block(m,g,7*FARM_STOREY_M,7);finish(fid,g,m,7*FARM_STOREY_M+.08)
    fid='way/504974817';g=geometries[fid];m=SurfaceParts(to_wgs)
    children=['way/504974816','way/504974815'];qs=[geometries[child] for child in children]
    # This connected group reads as one folded wing around its courtyard.
    # Union before extrusion avoids stacked full-height walls at source joins.
    joined=unary_union([g,*qs]);block(m,joined,6*FARM_STOREY_M,6)
    finish(fid,joined,m,6*FARM_STOREY_M+.08,children)
    out[-1][2]['massingInterpretation']['displayTreatment']='One continuous illustrative roof level across the connected wings; all source plans and courtyard holes retained.'

    # C: two projecting blocks, a lower long spine and the dark stair cores.
    fid='way/504974784';g=geometries[fid];m=SurfaceParts(to_wgs)
    blocks=g.intersection(unary_union([box(2613,250,2649,298),box(2683,250,2721,297)]))
    spine=g.difference(blocks);block(m,spine,5*FARM_STOREY_M,5,'wall');block(m,blocks,7*FARM_STOREY_M,7,'wall')
    for x,y in [(2618,266),(2641,265),(2689,264),(2713,263),(2601,306),(2665,304),(2732,303)]:
        core=box(x-1.6,y-3,x+1.6,y+3).intersection(g.buffer(.1,join_style='mitre'))
        if core.area>2:
            # A dark facade strip follows its supporting wing. A single tower
            # height on the lower spine creates isolated, unsupported spikes.
            for part,levels in [(core.intersection(blocks),7),(core.difference(blocks),5)]:
                if not part.is_empty:
                    m.sides(part,0,levels*FARM_STOREY_M,'facade-recess')
                    m.face(part,levels*FARM_STOREY_M,'roof')
    finish(fid,g,m,7*FARM_STOREY_M+.08)
    fid='way/504974786';g=geometries[fid];m=SurfaceParts(to_wgs);block(m,g,2*FARM_STOREY_M,2,'wall');finish(fid,g,m,2*FARM_STOREY_M+.08)

    # E keeps its two oblique arms. One restrained step at their neck makes
    # their relationship visible without turning every outline notch into a tier.
    fid='way/411343678';g=geometries[fid];m=SurfaceParts(to_wgs)
    north=g.intersection(box(2600,458,2685,510));south=g.difference(north)
    block(m,north,6*FARM_STOREY_M,6);block(m,south,5*FARM_STOREY_M,5)
    skylight(m,north,6*FARM_STOREY_M,8,6);finish(fid,g,m,6*FARM_STOREY_M+1.04)
    out[-1][2]['massingInterpretation']['displayTreatment']='Two oblique arms with a single illustrative height step at their neck; not measured floor counts or height.'

    # The northern service building is separate from the redeveloped plot.
    fid='way/415697412';g=geometries[fid];m=SurfaceParts(to_wgs)
    courts=unary_union([box(2514,285,2526,297),box(2544,283.5,2556,295.5)]).intersection(g.buffer(-1.8))
    body=g.difference(courts);block(m,body,6.0,2,'wall');m.face(courts,.1,'garden');finish(fid,body,m,6.08)
    # The old greenhouse fragments do not describe today's towers. In the
    # oblique guide their centres can appear on a new roof, which is not a
    # ground-footprint correspondence. One explicitly approximate compound
    # replaces the misleading cluster of separately extruded old fragments.
    site=observations['redevelopedSites'][0];fid=site['canonicalId'];m=SurfaceParts(to_wgs)
    def placed(bounds):return rotate(box(*bounds),site['displayAxisDeg'],origin=site['displayFrameOrigin'])
    west=placed(site['displayWestBoundsM']);east=placed(site['displayEastBoundsM'])
    link=placed(site['displayPlatformBoundsM']);g=unary_union([west,east,link])
    block(m,west,32.2,7,'glass');block(m,east,49.4,11,'glass')
    for body,h,rows in [(west,32.2,7),(east,49.4,11)]:
        m.facade_bands(body,np.linspace(0,h,rows+1)[1:-1],.20)
        rim=body.difference(body.buffer(-.65,join_style='mitre'))
        m.sides(rim,h,h+.65,'roof');m.face(rim,h+.65,'roof')
        cap=body.buffer(-4.5,join_style='mitre')
        m.sides(cap,h,h+.8,'wall');m.face(cap,h+.8,'roof')
    deck(m,link,8.3,bottom=4.2)
    upper=placed(site['displayUpperPlatformBoundsM']);deck(m,upper,16.4)
    m.face(upper.buffer(-.4),16.46,'garden')
    finish(fid,g,m,50.2,site['supersededSourceIds'])
    out[-1][2].update(placementBasis='ground-context-estimate',groundFootprintKnown=False,positionAccuracyM=None,
                       designPartLevels={'east':11,'west':7},designPartHeightsM={'east':49.4,'west':32.2})
    fid='way/415697397';g=geometries[fid];m=SurfaceParts(to_wgs);deck(m,g,4.4);finish(fid,g,m,4.4)
    fid='way/252581201';g=geometries[fid];m=SurfaceParts(to_wgs);block(m,g,6.8,2,'wall');finish(fid,g,m,6.88)
    return out
