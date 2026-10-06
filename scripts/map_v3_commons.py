"""Reviewed communal buildings, laboratories and athletics structures.

These are image-proportioned exterior models. The acquired ground, road graph,
door identities and personal locations are never inferred from roof surfaces.
"""
import math
import numpy as np
from shapely.geometry import Polygon,LineString,Point,box
from shapely.geometry.polygon import orient
from shapely.affinity import scale
from shapely.ops import transform,unary_union,nearest_points
from map_v3_landmarks import SurfaceParts
from map_v3_surfaces import frame,orthogonal_footprint,soften_source_curve


def commons_models(geometries,display_geometries,to_wgs,observations):
    result=[]
    records={r['id']:r for r in observations['objects']}

    def polygons(g):
        if g.geom_type in ('Polygon','MultiPolygon'):return g
        return unary_union([p for p in getattr(g,'geoms',[]) if p.geom_type in ('Polygon','MultiPolygon')])

    def local_model(fid,angle=None):
        source=geometries[fid]
        g,_=orthogonal_footprint(source)
        if angle is None:angle=(frame(g)[4]+math.pi/4)%(math.pi/2)-math.pi/4
        u=np.array([math.cos(angle),math.sin(angle)]);v=np.array([-u[1],u[0]])
        origin=np.array(g.centroid.coords[0])
        def local(x,y,z=None):
            dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
            return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
        def world(x,y,z=None):
            return origin[0]+np.asarray(x)*u[0]+np.asarray(y)*v[0],origin[1]+np.asarray(x)*u[1]+np.asarray(y)*v[1]
        return transform(local,g),world,SurfaceParts(lambda x,y:to_wgs(*world(x,y)))

    def windows(m,g,h,rows,spacing=4.0,material='academic-window'):
        g=polygons(g);vertices=[]
        for poly in list(g.geoms) if g.geom_type=='MultiPolygon' else [g]:
            if poly.is_empty:continue
            poly=orient(poly,sign=-1)
            for ring in [poly.exterior,*poly.interiors]:
                for aa,bb in zip(ring.coords,list(ring.coords)[1:]):
                    a=np.array(aa);b=np.array(bb);length=np.linalg.norm(b-a)
                    if length<4:continue
                    u=(b-a)/length;n=np.array([-u[1],u[0]])*.05
                    count=max(1,int((length-1.5)/spacing));step=(length-1.5)/count
                    for k in range(count):
                        left=a+u*(.75+(k+.15)*step)+n;right=a+u*(.75+(k+.85)*step)+n
                        for j in range(rows):
                            z0=(j+.24)*h/rows;z1=(j+.84)*h/rows
                            p=m.point(*left,z0);q=m.point(*right,z0)
                            r=m.point(*right,z1);s=m.point(*left,z1)
                            vertices.extend([p,q,r,p,r,s])
        if vertices:m.parts.append({'material':material,'vertices':vertices})

    def block(m,g,h,rows=0,material='stone-wall'):
        g=polygons(g)
        if g.is_empty:return
        m.sides(g,0,h,material);m.face(g,h,'roof')
        rim=g.difference(g.buffer(-.25,join_style='mitre'))
        m.sides(rim,h,h+.22,'wall');m.face(rim,h+.22,'roof')
        if rows:windows(m,g,h,rows)

    def roof_cap(m,g,h,x,y,w,d):
        q=polygons(box(x-w/2,y-d/2,x+w/2,y+d/2).intersection(g.buffer(-.6)))
        if q.area<1:return
        m.sides(q,h,h+.9,'wall');m.face(q,h+.9,'roof')

    def profiled_sides(m,g,bottom,top,material='wall'):
        """Close sloping/gabled roof edges against their real wall boundary."""
        lo=bottom if callable(bottom) else lambda x,y:bottom
        vertices=[]
        for poly in list(g.geoms) if g.geom_type=='MultiPolygon' else [g]:
            poly=orient(poly,sign=-1)
            for ring in [poly.exterior,*poly.interiors]:
                for a,b in zip(ring.coords,list(ring.coords)[1:]):
                    length=math.dist(a,b)
                    # Curved end profiles also need samples along straight
                    # plan edges, otherwise a ridge leaves an open end cap.
                    ps=[(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t) for t in np.linspace(0,1,max(2,math.ceil(length/1.2)+1))]
                    for aa,bb in zip(ps[:-1],ps[1:]):
                        p=m.point(*aa,lo(*aa));q=m.point(*bb,lo(*bb));r=m.point(*bb,top(*bb));s=m.point(*aa,top(*aa))
                        vertices.extend([p,q,r,p,r,s])
        if vertices:m.parts.append({'material':material,'vertices':vertices})

    def gallery(m,g,h):
        g=polygons(g)
        if g.is_empty:return
        m.face(g,h,'roof');m.sides(g,h-.24,h,'wall')
        for poly in list(g.geoms) if g.geom_type=='MultiPolygon' else [g]:
            poly=orient(poly,sign=-1)
            for a,b in zip(poly.exterior.coords,list(poly.exterior.coords)[1:]):
                a=np.array(a);b=np.array(b);length=np.linalg.norm(b-a)
                if length<3:continue
                u=(b-a)/length;n=np.array([u[1],-u[0]])
                count=max(1,round(length/6))
                for k in range(count):
                    c=a+u*((k+.5)*length/count)+n*.22
                    pier=polygons(Polygon([c+u*x+n*y for x,y in [(-.22,-.19),(.22,-.19),(.22,.19),(-.22,.19)]]).intersection(g))
                    if pier.area>.01:m.sides(pier,0,h-.24,'wall')

    def finish(fid,g,world,m,h):
        basis=records[fid]['basis']+' 屋高、构件和分格为图像比例概化，非测绘；原地面、入口及路网保持，显示院落不新增通路。'
        result.append((fid,transform(world,g),{'type':'authored-mesh','parts':m.parts,'heightM':h,'basis':basis},records[fid]))

    # The dining building has an open square court and a second T-shaped
    # lightwell. Its southern glazed shelter is lower than the main roof.
    fid='way/161322492';g,w,m=local_model(fid,math.radians(8.59));a,b,c,d=g.bounds
    court=box(-24,-9,1,15).union(box(24,-23,35,10)).union(box(18,8,43,15)).intersection(g.buffer(-3))
    body=g.difference(court);front=body.intersection(box(a-1,b-1,c+1,b+13));main=body.difference(front)
    block(m,main,12.8,3);block(m,front,10.7,3,'glass')
    m.face(front,lambda x,y:10.85+(y-b)*.13,'glass')
    profiled_sides(m,front,10.7,lambda x,y:10.85+(y-b)*.13,'glass')
    for x in np.arange(a+4,c,8):
        seam=polygons(box(x-.06,b-1,x+.06,b+13).intersection(front))
        m.face(seam,lambda xx,yy:10.9+(yy-b)*.13,'mullion')
    m.face(court,0.18,'garden')
    roof_cap(m,main,12.8,a+6,d-8,7,8);roof_cap(m,main,12.8,-28,-5,4,7)
    finish(fid,body,w,m,13.7)

    # Low community hall: keep its actual angled/round terminal and the
    # recessed court. It must not look like another seven-storey dormitory.
    fid='way/408887361';g,w,m=local_model(fid,math.radians(8.59));g=soften_source_curve(g,.35)
    a,b,c,d=g.bounds;court=box(a+12,b+8,a+30,b+24).intersection(g.buffer(-2))
    body=g.difference(court);block(m,body,5.7,1);m.face(court,.15,'garden')
    glass=polygons(body.intersection(box(c-18,b-1,c+1,d+1)))
    m.sides(glass,0,5.6,'glass');m.face(glass,5.75,'roof');finish(fid,body,w,m,6.0)

    for fid,h,rows in [('way/306105478',30.5,9),('way/306105479',26.5,8)]:
        g,w,m=local_model(fid,math.radians(8.59));block(m,g,h,rows,'dorm-wall')
        a,b,c,d=g.bounds
        for y in np.linspace(3,h-.2,rows):m.facade_bands(g,[y],.1)
        roof_cap(m,g,h,(a+c)/2,(b+d)/2,min(10,(c-a)*.25),4)
        finish(fid,g,w,m,h+.9)

    # A tall straight hotel wing rises behind a curved, low entrance plinth.
    fid='way/237812469';g,w,m=local_model(fid,math.radians(8.54));g=soften_source_curve(g,.45)
    tower=polygons(g.intersection(box(-14,-2,34,40)));podium=g.difference(tower)
    block(m,podium,3.4,0);block(m,tower,34.0,10,'glass')
    m.facade_bands(tower,np.arange(3.5,34,3.3),.16)
    spine=polygons(tower.intersection(box(-14,-3,-9,40)))
    m.sides(spine,34,38,'stone-wall');m.face(spine,38,'roof')
    roof_cap(m,tower,34,10,18,22,9);finish(fid,g,w,m,38)

    # The hospital consists of low bars with pitched roofs and connecting
    # necks. The crooked southern arm is a genuine part of its acquired plan.
    fid='way/237812468';g,w,m=local_model(fid);a,b,c,d=g.bounds
    north=polygons(g.intersection(box(a-1,17,c+1,d+1)))
    middle=polygons(g.intersection(box(a-1,-16,c+1,7)))
    south=polygons(g.intersection(box(a-1,b-1,c+1,-24)))
    necks=g.difference(unary_union([north,middle,south]))
    block(m,necks,6.6,2)
    for wing in [north,middle,south]:
        block(m,wing,8.2,2)
        aa,bb,cc,dd=wing.bounds;mid=(bb+dd)/2
        for lo,hi in [(bb,mid),(mid,dd)]:
            half=polygons(wing.intersection(box(aa-1,lo,cc+1,hi)))
            m.face(half,lambda x,y:8.4+1.7*(1-abs(y-mid)/max(.1,(dd-bb)/2)),'roof')
        profiled_sides(m,wing,8.2,lambda x,y:8.4+1.7*(1-abs(y-mid)/max(.1,(dd-bb)/2)))
    finish(fid,g,w,m,10.1)

    # Recorded seating wings flank a separate tensile canopy. Rows are a
    # cartographic stepped surface, not an invented inventory of seats.
    for fid in ['way/478006668','way/478006669']:
        g,w,m=local_model(fid,math.radians(8.6));a,b,c,d=g.bounds;step=(c-a)/9
        for k in range(9):
            strip=polygons(g.intersection(box(a+k*step,b-1,a+(k+1)*step,d+1)))
            z=.65+k*.48;m.sides(strip,0,z,'stone-wall');m.face(strip,z,'roof')
        finish(fid,g,w,m,4.5)
    fid='way/255623996';g,w,m=local_model(fid,math.radians(8.6));g=soften_source_curve(g,.25);a,b,c,d=g.bounds
    def canopy_z(x,y):return 7.4+1.25*math.cos(math.pi*x/(c-a))**2+.65*math.cos(math.pi*y/(d-b))**2
    for x in np.arange(a,c,1.5):
        for y in np.arange(b,d,2):m.face(polygons(g.intersection(box(x,y,min(c,x+1.5),min(d,y+2)))),canopy_z,'dome')
    profiled_sides(m,g,lambda x,y:canopy_z(x,y)-.18,canopy_z,'roof')
    for x in [-10,10]:
        for y in [-13,13]:
            pier=box(x-.22,y-.22,x+.22,y+.22);m.sides(pier,0,canopy_z(x,y),'wall')
    finish(fid,g,w,m,9.3)

    # Metalwork workshop: a high longitudinal shed and lower end/service bays.
    fid='way/252581090';g,w,m=local_model(fid);a,b,c,d=g.bounds
    hall=polygons(g.intersection(box(-10,-45,20,55)));lower=g.difference(hall)
    block(m,lower,8.0,2);block(m,hall,13.0,2)
    for x in np.arange(-10,20,2):m.face(polygons(hall.intersection(box(x,b-1,x+2,d+1))),lambda xx,yy:13.1+1.8*(1-abs(xx-5)/15),'roof')
    profiled_sides(m,hall,13,lambda x,y:13.1+1.8*(1-abs(x-5)/15))
    finish(fid,g,w,m,14.9)

    # Chemistry: three long bars, two open courts and the two glazed end
    # spines. The source rectangle is an enclosing footprint, not a solid roof.
    fid='way/255623998';g,w,m=local_model(fid);a,b,c,d=g.bounds
    court=box(-18,-44,18,-12).union(box(-18,10,18,43)).intersection(g.buffer(-5))
    body=g.difference(court);block(m,body,23.0,6)
    for x in [a,c-3.2]:
        glass=polygons(body.intersection(box(x,b-1,x+3.2,d+1)));m.sides(glass,0,23.1,'glass');m.face(glass,23.12,'glass')
    m.face(court,.12,'garden')
    for y in [b+8,-1,d-8]:roof_cap(m,body,23,0,y,16,4)
    finish(fid,body,w,m,23.9)

    fid='way/255623997';g,w,m=local_model(fid);a,b,c,d=g.bounds
    court=box(-6,-1,10,14).intersection(g.buffer(-3));body=g.difference(court)
    east=polygons(body.intersection(box(4,b-1,c+1,d+1)));west=body.difference(east)
    block(m,west,13.8,4);block(m,east,19.5,5);m.face(court,.12,'garden')
    roof_cap(m,east,19.5,18,-6,7,6);finish(fid,body,w,m,20.4)

    # Source links keep independent IDs. End vertices that really touched a
    # source wall follow that wall's small display correction; no arbitrary
    # nearby structures are joined and no walking connection is created.
    links={
        'way/306107357':['way/232499590','way/237810388'],
        'way/306107358':['way/237810385','way/237810386'],
        'way/306107359':['way/237810386','way/237810387'],
        'way/306107360':['way/252581090','way/255623998'],
        'way/306107361':['way/255623998','way/255623997'],
    }
    model_ground={fid:g for fid,g,_,_ in result}
    for fid,parents in links.items():
        g=geometries[fid];points=[]
        for xy in g.exterior.coords:
            p=Point(xy);fixed=p
            for parent in parents:
                display=model_ground.get(parent,display_geometries.get(parent,geometries[parent]))
                if geometries[parent].boundary.distance(p)<.08:
                    q=nearest_points(p,display.boundary)[1]
                    if p.distance(q)<1.5:fixed=q;break
            points.append(tuple(fixed.coords[0]))
        adjusted=Polygon(points)
        if not adjusted.is_valid:adjusted=g
        m=SurfaceParts(to_wgs);gallery(m,adjusted,5.9)
        finish(fid,adjusted,lambda x,y,z=None:(x,y),m,5.9)

    # The two source appendages touch the south-east Lantian dormitory. They
    # are low service/entrance rooms in the guide, not seven-storey blocks.
    for fid,h in [('way/543895377',5.7),('way/543895378',4.5)]:
        g,w,m=local_model(fid,math.radians(8.59));block(m,g,h,1)
        finish(fid,g,w,m,h+.22)

    # The architect's B group has a tall egg-shaped hall and TWO low wings.
    # It is neither an equal-height C block nor a flat oval lid. The theatre
    # entrance faces east; its doubly curved roof rises towards the west.
    angle=math.atan2(1162.21-1152.36,2314.35-2241.14)
    fid='way/232499325';g,w,m=local_model(fid,angle);g=orient(soften_source_curve(g,.8),sign=-1)
    theatre_ground=g;centre=np.array(g.centroid.coords[0]);g=scale(g,xfact=.96,yfact=.94,origin=tuple(centre))
    a,b,c,d=g.bounds;cy=(b+d)/2;ry=(d-b)/2
    def theatre_roof(x,y):
        return 12.0+8.0*(1-(x-a)/(c-a))+2.4*max(0,1-((y-cy)/ry)**2)
    m.sides(theatre_ground,0,.7,'stone-wall');m.face(theatre_ground,.7,'wall')
    def upper(p):return centre+(np.array(p)-centre)*np.array([.96,.94])
    def on_wall(p,z):
        q=upper(p);height=theatre_roof(*q);xy=np.array(p)+(q-p)*(z/height)
        return m.point(*xy,z)
    def wall_quad(aa,bb,bottom,top):
        za=top(*upper(aa)) if callable(top) else top;zb=top(*upper(bb)) if callable(top) else top
        ba=bottom(*upper(aa)) if callable(bottom) else bottom;bbz=bottom(*upper(bb)) if callable(bottom) else bottom
        p=on_wall(aa,ba);q=on_wall(bb,bbz);r=on_wall(bb,zb);s=on_wall(aa,za)
        return [p,q,r,p,r,s]
    # The paper and built photograph show a slightly tapering shell, with
    # upper perimeter inside the ground wall. Keep every facade band on that
    # same inclined skin instead of stacking a vertical glass cylinder.
    glass=[];bands=[];lip=[]
    ring=list(theatre_ground.exterior.coords)
    for aa,bb in zip(ring,ring[1:]):
        aa=np.array(aa);bb=np.array(bb)
        glass.extend(wall_quad(aa,bb,.7,lambda x,y:theatre_roof(x,y)-.9))
        lip.extend(wall_quad(aa,bb,lambda x,y:theatre_roof(x,y)-.9,theatre_roof))
        for z in [3.5,7.1]:bands.extend(wall_quad(aa,bb,z-.13,z+.13))
    m.parts.extend([{'material':'glass','vertices':glass},{'material':'mullion','vertices':bands},{'material':'wall','vertices':lip}])
    # Vertical frames end at the sloping roof edge, rather than poking through
    # its low entrance end. Their spacing is illustrative exterior structure.
    skin=theatre_ground.buffer(.045).exterior;verts=[]
    for t in np.arange(0,skin.length,3.8):
        left=skin.interpolate(t);right=skin.interpolate(min(t+.13,skin.length))
        aa=np.array([left.x,left.y]);bb=np.array([right.x,right.y])
        verts.extend(wall_quad(aa,bb,.7,lambda x,y:theatre_roof(x,y)-.86))
    m.parts.append({'material':'mullion','vertices':verts})
    crown=g.buffer(-1.6);glazing=g.difference(crown)
    for y in np.arange(b,d,.9):
        strip=box(a-1,y,c+1,min(y+.9,d))
        m.face(polygons(crown.intersection(strip)),theatre_roof,'dome')
        m.face(polygons(glazing.intersection(strip)),theatre_roof,'glass')
    for x in np.arange(a+2,c-1,3.8):
        seam=polygons(g.intersection(box(x-.065,b-1,x+.065,d+1)))
        # Subdivide along the curve. One long seam triangle would chord across
        # the crown, disappearing into the roof instead of following its skin.
        for y in np.arange(b,d,1.1):
            m.face(polygons(seam.intersection(box(a-1,y,c+1,min(d,y+1.1)))),lambda xx,yy:theatre_roof(xx,yy)+.06,'seam')
    finish(fid,theatre_ground,w,m,22.4)

    fid='way/237808500';g,w,m=local_model(fid,angle);g=soften_source_curve(g,.8)
    a,b,c,d=g.bounds;north=g.intersection(box(a-1,d-15.2,c+1,d+1));curved=g.difference(north)
    for wing,h in [(north,10.2),(curved,7.1)]:
        m.sides(wing,0,.65,'stone-wall');m.sides(wing,.65,h,'glass')
        m.facade_bands(wing,([3.3,6.6,h-.3] if h>9 else [3.6,h-.3]),.25);m.facade_divisions(wing,.65,h,3.7,.13)
        m.face(wing,h,'roof')
        rim=wing.difference(wing.buffer(-.28,join_style='mitre'))
        m.sides(rim,h,h+.22,'wall');m.face(rim,h+.22,'skylight')
    # Two original road segments are explicitly building_passage beneath the
    # observed north-south elevated link. They locate the link without using
    # the elevated roof's displacement as a new ground footprint or road.
    pa=np.array([2308.1,1186.7]);pb=np.array([2302.1,1227.8]);axis=(pb-pa)/np.linalg.norm(pb-pa);side=np.array([-axis[1],axis[0]])
    spine=LineString([pa-axis*70,pb+axis*45])
    def stations(part):
        points=[]
        for segment in [part] if part.geom_type=='LineString' else getattr(part,'geoms',[]):
            if segment.geom_type=='LineString':points.extend(spine.project(Point(p)) for p in segment.coords)
        return points
    start=max(stations(spine.intersection(geometries[fid])))-.4
    end=min(stations(spine.intersection(geometries['way/411343683'])))+.4
    ends=np.array([spine.interpolate(start).coords[0],spine.interpolate(end).coords[0]])
    link=LineString(ends).buffer(2.0,cap_style='flat')
    lm=SurfaceParts(to_wgs);lm.face(link,5.0,'wall');lm.sides(link,4.78,5,'wall')
    left,right=ends[0],ends[1];length=np.linalg.norm(right-left)
    def roof_point(t,s):
        p=left+(right-left)*t+side*s
        return lm.point(*p,7.0+.72*math.sqrt(max(0,1-(s/2)**2)))
    vertices=[]
    for ss in np.linspace(-2,2,17)[:-1]:
        q=[roof_point(0,ss),roof_point(1,ss),roof_point(1,ss+.25),roof_point(0,ss+.25)]
        vertices.extend([q[0],q[1],q[2],q[0],q[2],q[3]])
    lm.parts.append({'material':'glass','vertices':vertices})
    for sign in [-1,1]:
        edge=LineString([left+side*sign*2,right+side*sign*2]).buffer(.08,cap_style='flat')
        lm.sides(edge,5.0,7.0,'glass');lm.face(edge,7.05,'mullion')
    for t in np.linspace(0,1,max(2,round(length/5))):
        c0=left+(right-left)*t;rib=LineString([c0-side*2,c0+side*2]).buffer(.055,cap_style='flat')
        lm.face(rib,lambda x,y:7.04+.72*math.sqrt(max(0,1-(np.dot(np.array([x,y])-c0,side)/2)**2)),'mullion')
    m.parts.extend(lm.parts)
    finish(fid,g,w,m,10.42)

    # The northern housing skyline is present in the same guide and current
    # overhead plan. Heights are image proportions, never assigned floor data.
    for item in observations.get('harbourTowers',[]):
        fid=item['id'];g,w,m=local_model(fid);h=item['displayHeightM']
        m.sides(g,0,.7,'stone-wall');m.sides(g,.7,h,'dorm-wall')
        windows(m,g,h,max(2,round(h/3.4)),3.4,'dorm-glass')
        m.facade_divisions(g,.7,h,6.8,.15)
        m.face(g,h,'dorm-roof');rim=g.difference(g.buffer(-.28,join_style='mitre'))
        m.sides(rim,h,h+.65,'dorm-parapet');m.face(rim,h+.65,'dorm-parapet')
        a,b,c,d=g.bounds;roof_cap(m,g,h,(a+c)/2,d-4.5,4.2,4.6)
        finish(fid,g,w,m,h+.9)

    # Five open arches and six paired pillars are confirmed in the school's
    # completion article and photograph. Source length is 88.4m, consistent
    # with the approximately 88m design; the 14.6m design height is labelled.
    fid='way/519369434';g,w,m=local_model(fid);a,b,c,d=g.bounds
    beam=box(a,b*.45,c,d*.45).intersection(g)
    m.sides(beam,12.9,14.25,'wall');m.face(beam,14.25,'roof')
    cornice=box(a-.3,b*.56,c+.3,d*.56)
    m.sides(cornice,14.25,14.6,'roof');m.face(cornice,14.6,'roof')
    piers=np.linspace(a+1.8,c-1.8,6);depth=min(1.35,(d-b)/5)
    for x in piers:
        for offset in [-.66,.66]:
            base=box(x+offset-.65,-depth-.55,x+offset+.65,-depth+.55)
            column=Point(x+offset,-depth).buffer(.46,quad_segs=16)
            m.sides(base,0,1.25,'roof');m.face(base,1.25,'roof')
            m.sides(column,1.25,12.65,'roof');m.face(column,12.65,'roof')
            cap=box(x+offset-.63,-depth-.6,x+offset+.63,-depth+.6)
            m.sides(cap,12.65,13.05,'roof');m.face(cap,13.05,'roof')
        support=box(x-1.12,-.55,x+1.12,.55)
        m.sides(support,0,13,'wall')
    arch_vertices=[];lining=[]
    for left,right in zip(piers[:-1],piers[1:]):
        centre=(left+right)/2;radius=(right-left)/2-1.1
        xs=np.linspace(centre-radius,centre+radius,49)
        zs=[3.4+math.sqrt(max(0,radius*radius-(x-centre)**2)) for x in xs]
        for x0,x1,z0,z1 in zip(xs[:-1],xs[1:],zs[:-1],zs[1:]):
            for y in [-.54,.54]:
                p=m.point(x0,y,z0);q=m.point(x1,y,z1);r=m.point(x1,y,12.95);s=m.point(x0,y,12.95)
                arch_vertices.extend([p,q,r,p,r,s])
                p=m.point(x0,y-.035,z0);q=m.point(x1,y-.035,z1);r=m.point(x1,y-.035,z1+.2);s=m.point(x0,y-.035,z0+.2)
                lining.extend([p,q,r,p,r,s])
            p=m.point(x0,-.54,z0);q=m.point(x1,-.54,z1);r=m.point(x1,.54,z1);s=m.point(x0,.54,z0)
            arch_vertices.extend([p,q,r,p,r,s])
    m.parts.extend([{'material':'wall','vertices':arch_vertices},{'material':'roof','vertices':lining}])
    finish(fid,g,w,m,14.6)

    # This strip disagrees with the old illustrative guide. The current
    # acquired footprints and independently viewed Amap plan/imagery both show
    # low narrow sheds here, rather than the guide's large future-looking mass.
    for fid in ['way/'+str(i) for i in range(1302813127,1302813140)]:
        g,w,m=local_model(fid,math.radians(24.38));a,b,c,d=g.bounds
        block(m,g,3.4,1,'wall');mid=(b+d)/2
        for lo,hi in [(b,mid),(mid,d)]:
            m.face(polygons(g.intersection(box(a-1,lo,c+1,hi))),lambda x,y:3.5+.85*(1-abs(y-mid)/max(.1,(d-b)/2)),'dorm-roof')
        profiled_sides(m,g,3.4,lambda x,y:3.5+.85*(1-abs(y-mid)/max(.1,(d-b)/2)))
        finish(fid,g,w,m,4.35)

    fid='way/1410577281';g,w,m=local_model(fid);a,b,c,d=g.bounds
    block(m,g,7.8,2);inner=g.buffer(-1.2,join_style='mitre');m.face(inner,7.85,'garden')
    roof_cap(m,g,7.8,c-6,b+6,9,4);finish(fid,g,w,m,8.7)
    # An exterior stair at the library group's side is not a little closed
    # building. Preserve its narrow ground plan and its rise towards the wall.
    fid='way/306107906';g,w,m=local_model(fid);a,b,c,d=g.bounds
    for k in range(18):
        lo=b+(d-b)*k/18;hi=b+(d-b)*(k+1)/18
        strip=polygons(g.intersection(box(a-1,lo,c+1,hi)));z=.2+4*k/17
        m.sides(strip,0,z,'wall');m.face(strip,z,'roof')
    finish(fid,g,w,m,4.2)
    fid='way/562767792';g,w,m=local_model(fid);a,b,c,d=g.bounds
    court=box(-8,-4,8,8).intersection(g.buffer(-2));body=g.difference(court)
    canopy=polygons(body.intersection(box(a-1,b-1,c+1,-8)))
    block(m,body.difference(canopy),5.7,1);block(m,canopy,3.6,0,'glass')
    m.face(court,.1,'garden');finish(fid,body,w,m,5.92)
    for fid,h in [('way/652569974',5.8)]:
        g,w,m=local_model(fid);a,b,c,d=g.bounds
        block(m,g,h,1 if h<5 else 2)
        inset=g.buffer(-.5);m.face(inset,h+.07,'dorm-roof')
        finish(fid,g,w,m,h+.22)
    return result
