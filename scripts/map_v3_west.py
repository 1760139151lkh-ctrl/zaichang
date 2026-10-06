"""West teaching wings and the west cultural buildings, display geometry only.

The images support composition. Dimensions, member spacing and most heights
remain explicit approximations; no courtyard or roof creates a walking edge.
"""
import math
import numpy as np
from shapely.geometry import Polygon, LineString, box
from shapely.geometry import Point
from shapely.ops import transform, unary_union
from shapely.geometry.polygon import orient
from map_v3_landmarks import SurfaceParts
from map_v3_surfaces import frame, orthogonal_footprint


def west_models(geometries,to_wgs):
    models=[]

    def surface_polygons(g):
        # Intersections along an existing wing edge may carry zero-area line
        # remnants. Only polygon surfaces are sent to the display mesh builder;
        # no acquired ground or routing geometry is repaired here.
        if g.geom_type in ['Polygon','MultiPolygon']:return g
        parts=[]
        for part in getattr(g,'geoms',[]):
            q=surface_polygons(part)
            if not q.is_empty and q.area>.001:parts.append(q)
        return unary_union(parts) if parts else Polygon()

    def local_frame(g,angle=None):
        anchor=max(g.geoms,key=lambda p:p.area) if g.geom_type=='MultiPolygon' else g
        u,v,lo,hi,_=frame(anchor,angle=angle);origin=np.array([g.centroid.x,g.centroid.y])
        def local(x,y,z=None):
            dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
            return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
        def world(x,y,z=None):
            return origin[0]+np.asarray(x)*u[0]+np.asarray(y)*v[0],origin[1]+np.asarray(x)*u[1]+np.asarray(y)*v[1]
        return transform(local,g),world

    def campus_axis(source):
        anchor=max(source.geoms,key=lambda p:p.area) if source.geom_type=='MultiPolygon' else source
        angle=frame(anchor)[4]
        return ((angle+math.pi/4)%(math.pi/2))-math.pi/4

    def window_rows(m,g,h,rows):
        """Quiet wall openings; the existing window material fades at overview."""
        g=surface_polygons(g);vertices=[];skin=g.buffer(.04,join_style='mitre')
        for poly in list(skin.geoms) if skin.geom_type=='MultiPolygon' else [skin]:
            poly=orient(poly,sign=-1)
            for ring in [poly.exterior,*poly.interiors]:
                for pa,pb in zip(ring.coords,list(ring.coords)[1:]):
                    edge=LineString([pa,pb]);length=edge.length
                    if length<5:continue
                    count=max(1,round((length-3.4)/3.8));pitch=(length-3.4)/count
                    for k in range(count):
                        t=1.7+(k+.5)*pitch;left=edge.interpolate(t-.92);right=edge.interpolate(t+.92)
                        for centre in rows:
                            z0=max(.6,centre-1.0);z1=min(h-.65,centre+1.0)
                            if z1<=z0:continue
                            p0=m.point(left.x,left.y,z0);p1=m.point(right.x,right.y,z0)
                            q0=m.point(left.x,left.y,z1);q1=m.point(right.x,right.y,z1)
                            vertices.extend([p0,p1,q1,p0,q1,q0])
        if vertices:m.parts.append({'material':'dorm-window','vertices':vertices})

    def body(m,g,h,bands=()):
        g=surface_polygons(g)
        if g.is_empty or g.area<.01:return
        m.sides(g,0,h,'wall');m.face(g,h,'roof')
        edge=g.difference(g.buffer(-.27,join_style='mitre'))
        m.sides(edge,h,h+.32,'roof');m.face(edge,h+.32,'skylight')
        m.facade_bands(g,bands,.13)

    def gallery(m,g,h,levels=2):
        g=surface_polygons(g)
        if g.is_empty or g.area<.01:return
        for z in np.linspace(h/levels,h,levels):
            m.face(g,float(z),'roof');m.sides(g,float(z)-.24,float(z),'wall')
        # Supports follow each real arm edge. A single bounding-box spine made
        # disconnected and L-shaped galleries share an unrelated direction.
        for poly in list(g.geoms) if g.geom_type=='MultiPolygon' else [g]:
            poly=orient(poly,sign=-1)
            for ring in [poly.exterior,*poly.interiors]:
                for pa,pb in zip(ring.coords,list(ring.coords)[1:]):
                    pa=np.array(pa);pb=np.array(pb);length=np.linalg.norm(pb-pa)
                    if length<2:continue
                    u=(pb-pa)/length;n=np.array([u[1],-u[0]])
                    count=max(1,round(length/6));pitch=length/count
                    for k in range(count):
                        centre=pa+u*((k+.5)*pitch)+n*.16
                        pier=Polygon([centre+u*x+n*y for x,y in [(-.22,-.16),(.22,-.16),(.22,.22),(-.22,.22)]])
                        q=surface_polygons(pier.intersection(g))
                        if q.area>.01:m.sides(q,0,h,'wall');m.face(q,h,'roof')

    def aligned_connector(q):
        """Small rectangular recorded connectors share their parent's frame.

        The guide depicts these four links as aligned with the classroom bars.
        This only removes sub-metre tracing skew; irregular real arms are kept.
        """
        if q.geom_type!='Polygon' or len(q.exterior.coords)!=5:return q
        a,b,c,d=q.bounds;cx,cy=q.centroid.x,q.centroid.y
        rect=q.minimum_rotated_rectangle
        lengths=[math.dist(pa,pb) for pa,pb in zip(rect.exterior.coords,list(rect.exterior.coords)[1:])]
        length,width=max(lengths),min(lengths)
        if d-b>c-a:out=box(cx-width/2,cy-length/2,cx+width/2,cy+length/2)
        else:out=box(cx-length/2,cy-width/2,cx+length/2,cy+width/2)
        return out if q.boundary.hausdorff_distance(out.boundary)<1.2 else q

    def stair_caps(m,g,h):
        a,b,c,d=g.bounds
        for x in [a+(c-a)*.22,a+(c-a)*.77]:
            cap=box(x-1.9,(b+d)/2-2.4,x+1.9,(b+d)/2+2.4).intersection(g.buffer(-.5))
            if cap.area>3:m.sides(cap,h,h+1.0,'wall');m.face(cap,h+1.0,'roof')

    def finish(fid,g,m,h,basis,children=(),levels=None):
        models.append((fid,g,{'type':'authored-mesh','parts':m.parts,'heightM':h,'basis':basis},list(children),levels))

    # The four long teaching bars and the two lower side spines enclose three
    # successive courtyards. Only the already recorded narrow connectors join
    # the display identities, never the original obstacle or network polygon.
    for fid,child_ids in [('way/161416716',['way/306107353','way/306107354','way/306107355']),('way/232499590',['way/306107356'])]:
        source=geometries[fid];display_source,_=orthogonal_footprint(source);g,world=local_frame(display_source)
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
        north=g.intersection(box(a-1,d-24,c+1,d+1));south=g.intersection(box(a-1,b-1,c+1,b+24))
        wings=unary_union([north,south])
        # The solid street-side spine is a classroom wing, visibly as tall as
        # the two bars. Only the separately recorded open galleries are low.
        body(m,g,14.2,[3.3,6.6,9.9,13.2])
        window_rows(m,g,14.2,[1.9,5.2,8.5,11.8])
        for wing in [north,south]:
            stair_caps(m,wing,14.2)
            wa,wb,wc,wd=wing.bounds
            upper=box(wa+3,wb+3,wc-3,wd-3).intersection(wing)
            if upper.area>10:m.face(upper,14.28,'roof')
        display=[display_source]
        # Use the same frame for thin source connectors outside the main way.
        u,v,_,_,_=frame(display_source);origin=np.array([display_source.centroid.x,display_source.centroid.y])
        def local_child(x,y,z=None):
            dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
            return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
        for child in child_ids:
            q=aligned_connector(transform(local_child,geometries[child]));gallery(m,q,6.2);display.append(transform(world,q))
        basis=('西教学区：官方固定鸟瞰与高德卫星共同可见连续教室楼翼、三个院落、较低侧廊和屋面层次。'
               '主翼14米级、低廊6米级及屋顶小构件均按图像比例概化，精确总高与构件尺寸未知；'
               '不把缺少height属性作为整栋贴地的理由，也不将显示连接补为新的室内或步行通路。')
        finish(fid,unary_union(display),m,15.2,basis,child_ids)

    for fid in ['way/237810385','way/237810386','way/237810387']:
        source=geometries[fid];g,world=local_frame(source);m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        a,b,c,d=g.bounds;body(m,g,7.4,[3.5])
        window_rows(m,g,7.4,[2.0,5.5])
        # The low eastern teaching/lecture blocks have a recessed upper roof,
        # rather than the tall, identical classroom skin of the main bars.
        upper=box(a+2.5,b+3.5,c-2.5,d-3.5).intersection(g)
        m.sides(upper,7.4,8.25,'wall');m.face(upper,8.25,'roof')
        glass=box(a+4,b+4.3,c-4,b+5.9).intersection(upper)
        m.face(glass,8.29,'glass')
        basis='西三东侧独立楼体：原图与卫星支持三座较低矩形楼、退台屋面和相邻步道；8米级体量与屋面分区为概化，精确层高未知。保留各自源ID，不凭位置顺序新增房间、门或可通行连廊。'
        finish(fid,source,m,8.3,basis)

    fid='way/237810388';source=geometries[fid];g,world=local_frame(source);m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
    a,b,c,d=g.bounds
    # The south complex has two courts, long perimeter teaching bars and a
    # central entrance volume. The rear/side links remain at a lower roof.
    bars=g.intersection(box(a-1,b-1,c+1,b+26)).union(g.intersection(box(a-1,d-22,c+1,d+1)))
    centre=g.intersection(box((a+c)/2-16,b-1,(a+c)/2+16,d+1))
    front=g.intersection(box((a+c)/2-19,d-22,(a+c)/2+19,d+1))
    main=g.difference(front)
    body(m,main,15.6,[3.4,6.8,10.2,13.6]);body(m,front,13.4,[3.4,6.8,10.2])
    window_rows(m,main,15.6,[2.1,5.5,8.9,12.3]);window_rows(m,front,13.4,[2.1,5.5,8.9])
    stair_caps(m,bars,15.6)
    basis='西四教学楼：官方鸟瞰和地面轮廓保留双院落、周缘楼翼和中央入口体量；主体16米级、连接6米级和屋顶分格为图像概化，精确高度未知。显示孔洞不作为路网开口，原源地面与通行约束保留。'
    finish(fid,source,m,16.6,basis)

    def pitched_roof(m,rect,eave,ridge,overhang=1.0,horizontal=None,curve=.70,corner_up=.62,hip_inset=.74,fascia=0,cutout=None):
        """Observed pitched composition, explicitly proportioned in metres.

        A sampled concave slope and upturned corners retain the recognisable
        Chinese roof. Sampling controls the mesh, not a count of real tiles.
        The eave is independent of a roof's inner supports and source ground.
        """
        if rect.is_empty or rect.area<1:return
        x0,y0,x1,y1=rect.bounds
        if x1-x0<2 or y1-y0<2:return
        if horizontal is None:horizontal=x1-x0>=y1-y0
        cx,cy=(x0+x1)/2,(y0+y1)/2
        half_long=((x1-x0) if horizontal else (y1-y0))/2+overhang
        half_short=((y1-y0) if horizontal else (x1-x0))/2+overhang
        outline=box(x0-overhang,y0-overhang,x1+overhang,y1+overhang)
        gable_end=half_long-min(half_long*.32,half_short*hip_inset)
        hip_rise=(ridge-eave)*.36
        def at(along,across):return (cx+along,cy+across) if horizontal else (cx+across,cy+along)
        def profile(across):
            t=max(0.,1-abs(across)/half_short)
            return eave+(ridge-eave)*((1-curve)*t+curve*t*t)
        def hip(along,across):
            t=max(0.,min(1.,(half_long-abs(along))/(half_long-gable_end)))
            corner=(abs(across)/half_short)**6*(abs(along)/half_long)**6*corner_up
            return min(profile(across),eave+hip_rise*((1-curve)*t+curve*t*t))+corner
        gable_t=(-(1-curve)+math.sqrt((1-curve)**2+4*curve*.36))/(2*curve)
        gable_y=half_short*(1-gable_t)
        across_grid=sorted(set([-gable_y,0.,gable_y,*np.linspace(-half_short,half_short,max(7,math.ceil(2*half_short/1.4)))]))
        roof_vertices=[]
        def patch(along_grid,height):
            for sa,sb in zip(along_grid,along_grid[1:]):
                for ta,tb in zip(across_grid,across_grid[1:]):
                    xy=[at(sa,ta),at(sb,ta),at(sb,tb),at(sa,tb)]
                    if cutout is not None and Polygon(xy).intersects(cutout):
                        visible=surface_polygons(Polygon(xy).difference(cutout))
                        def clipped_height(x,y):
                            s,t=(x-cx,y-cy) if horizontal else (y-cy,x-cx)
                            return height(s,t)
                        first=len(m.parts);m.face(visible,clipped_height,'tile-roof')
                        for part in m.parts[first:]:roof_vertices.extend(part['vertices'])
                        del m.parts[first:]
                        continue
                    pts=[m.point(x,y,height(s,t)) for (x,y),(s,t) in zip(xy,[(sa,ta),(sb,ta),(sb,tb),(sa,tb)])]
                    # Explicit common corners avoid independent triangulations
                    # choosing different diagonals for adjacent curved patches.
                    roof_vertices.extend([pts[0],pts[1],pts[2],pts[0],pts[2],pts[3]])
        def edge_strip(points,heights):
            if fascia<=0:return
            vertices=[]
            for (xa,ya),(xb,yb),za,zb in zip(points,points[1:],heights,heights[1:]):
                p0=m.point(xa,ya,za-fascia);p1=m.point(xb,yb,zb-fascia)
                q0=m.point(xa,ya,za);q1=m.point(xb,yb,zb)
                vertices.extend([p0,p1,q1,p0,q1,q0])
            if vertices:m.parts.append({'material':'timber','vertices':vertices})
        centre_grid=np.linspace(-gable_end,gable_end,max(7,math.ceil(2*gable_end/2.2)))
        patch(centre_grid,lambda s,t:profile(t))
        for across in [-half_short,half_short]:
            edge_strip([at(s,across) for s in centre_grid],[profile(across)]*len(centre_grid))
        for sign in [-1,1]:
            end_grid=sorted(sign*np.linspace(gable_end,half_long,max(5,math.ceil((half_long-gable_end)/1.6))))
            patch(end_grid,hip)
            for across in [-half_short,half_short]:
                edge_strip([at(s,across) for s in end_grid],[hip(s,across) for s in end_grid])
            edge_strip([at(sign*half_long,t) for t in across_grid],[hip(sign*half_long,t) for t in across_grid])
            # A real gable face separates the high central roof from the low
            # end hip. The previous continuous min() made a generic hipped
            # pyramid and could not express the observed triangular end wall.
            for ta,tb in zip(across_grid,across_grid[1:]):
                tops=[profile(ta),profile(tb)];bottoms=[min(v,eave+hip_rise) for v in tops]
                p0=m.point(*at(sign*gable_end,ta),bottoms[0]);p1=m.point(*at(sign*gable_end,tb),bottoms[1])
                q0=m.point(*at(sign*gable_end,ta),tops[0]);q1=m.point(*at(sign*gable_end,tb),tops[1])
                faces=[]
                if tops[1]>bottoms[1]+1e-8:faces.extend([p0,p1,q1])
                if tops[0]>bottoms[0]+1e-8:faces.extend([p0,q1,q0])
                if faces:m.parts.append({'material':'stone-wall','vertices':faces})
        # Keep one intermediate material part. The public builder already
        # batches equal materials; this is not a separate lighting fix.
        m.parts.append({'material':'tile-roof','vertices':roof_vertices})
        # Keep a continuous roof and a separately sampled ridge. Removing the
        # first draft's dense seam overlay did not resolve its visible faceting;
        # a smooth curved surface also needs continuous vertex normals.
        # No surveyed tile inventory is claimed by the roof geometry.
        long_coords=np.linspace(-gable_end,gable_end,30)
        pts=[(cx+s,cy) if horizontal else (cx,cy+s) for s in long_coords]
        for p0,p1 in zip(pts,pts[1:]):
            ridge_line=LineString([p0,p1]).buffer(.24,cap_style='flat').intersection(outline)
            m.face(ridge_line,ridge+.13,'roof')

    def stone_body(m,g,h,base=0,glass_from=None,glass_to=None):
        g=surface_polygons(g)
        if g.is_empty or g.area<.01:return
        m.sides(g,base,h,'stone-wall');m.face(g,h,'roof')
        if glass_from is not None:
            skin=g.buffer(.03,join_style='mitre')
            m.sides(skin,glass_from,glass_to or h-.5,'facade-recess')
            m.facade_divisions(g,glass_from,glass_to or h-.5,2.1,.28)

    def library_body(m,g,h,base=0,glass_from=None,glass_to=None):
        """Pale masonry with narrow vertical openings, rather than a glass box.

        The built contractor photo shows substantial corners and a central
        stone panel between window groups. Bay spacing remains cartographic,
        and is not a measured window count or an indoor-floor model.
        """
        g=surface_polygons(g)
        if g.is_empty or g.area<.01:return
        m.sides(g,base,h,'stone-wall');m.face(g,h,'roof')
        if glass_from is None:return
        top=glass_to or h-.8;vertices=[]
        skin=g.buffer(.04,join_style='mitre')
        for polygon in list(skin.geoms) if skin.geom_type=='MultiPolygon' else [skin]:
            polygon=orient(polygon,sign=-1)
            for ring in [polygon.exterior,*polygon.interiors]:
                for pa,pb in zip(ring.coords,list(ring.coords)[1:]):
                    edge=LineString([pa,pb]);length=edge.length
                    if length<4.8:continue
                    count=max(1,round((length-3.2)/2.3));pitch=(length-3.2)/count
                    for k in range(count):
                        centre=1.6+(k+.5)*pitch
                        if length>52 and abs(centre-length/2)<2.8:continue
                        left=edge.interpolate(centre-.43);right=edge.interpolate(centre+.43)
                        intervals=[(glass_from,top)] if top-glass_from<12 else [(glass_from,(glass_from+top)/2-.11),((glass_from+top)/2+.11,top)]
                        for z0,z1 in intervals:
                            p0=m.point(left.x,left.y,z0);p1=m.point(right.x,right.y,z0)
                            q0=m.point(left.x,left.y,z1);q1=m.point(right.x,right.y,z1)
                            vertices.extend([p0,p1,q1,p0,q1,q0])
        if vertices:m.parts.append({'material':'facade-recess','vertices':vertices})

    # Main library: the old rectangular OSM object is not a uniform 35-metre
    # box. The 2023 school aerial and 2024 contractor views show two high
    # pitched wings, four lower side volumes, and a recessed central lightwell.
    # Six above-ground floors are documented, while all individual eaves,
    # member spacing and lightwell coverage are still explicit approximations.
    fid='way/1208408934';source=geometries[fid];g,world=local_frame(source)
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    lightwell=box(a+25,b+33,c-25,d-33).intersection(g)
    base=g.difference(lightwell)
    library_body(m,base,9.2,glass_from=1.1,glass_to=8.4)
    for edge in [g.intersection(box(a+17,b+4,c-17,b+30)),g.intersection(box(a+17,d-30,c-17,d-4))]:
        library_body(m,edge,27.8,base=9.2,glass_from=11.0,glass_to=26.5)
        m.facade_bands(edge,[9.4,27.0],.35)
        pitched_roof(m,edge,28.0,34.3,1.35,curve=.04,corner_up=.06,hip_inset=.18)
    for x0,x1 in [(a+3,a+19),(c-19,c-3)]:
        for y0,y1 in [(b+21,(b+d)/2-9),((b+d)/2+9,d-21)]:
            side=g.intersection(box(x0,y0,x1,y1))
            library_body(m,side,21.7,base=9.2,glass_from=10.7,glass_to=20.8)
            pitched_roof(m,side,21.9,25.9,.85,curve=.04,corner_up=.06,hip_inset=.18)
        link=g.intersection(box(x0,(b+d)/2-9,x1,(b+d)/2+9))
        library_body(m,link,18.0,base=9.2,glass_from=10.7,glass_to=17.0)
        pitched_roof(m,link,18.1,20.5,.45,curve=.04,corner_up=.06,hip_inset=.18)
    # This dark recess says only that the centre is not the same tall roof.
    # Do not invent a garden, a precise glazing system or an open ground route.
    m.face(lightwell,9.23,'facade-recess')
    basis=('主图书馆：校方2023建成航拍、承建方2024正/斜立面、官方固定鸟瞰及高德卫星/百度平面'
           '支持两条较高坡顶楼翼、较低侧翼、中央采光空间与现代竖向立面。校方文字确认地上六层；'
           '本模型最高约34米、分翼/檐口/窗格与采光区尺寸为图像比例概化，精确屋高、采光区覆盖方式与构件数量仍未知。'
           '原矩形占地和路网保留，显示低区不产生真实门、院落通路或室内导航。')
    finish(fid,source,m,34.45,basis,levels=6)

    # The named source is the WEST MAIN HALL, not the entire compound. The
    # eastern halls and links have nine separately acquired polygons. The
    # previous split inside this one envelope both shrank the main hall and
    # invented eastern pavilions in the wrong ground location.
    fid='way/529029530';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    hall=g.intersection(box(a+8,b+5,c-2,d-5))
    inner_hall=hall.buffer(-2.1,join_style='mitre')
    stone_body(m,inner_hall,7.1,base=.95,glass_from=2.3,glass_to=6.65)
    m.sides(g,.05,.95,'stone-wall');m.face(g,.95,'stone-wall')
    ha,hb,hc,hd=hall.bounds
    for side_y in [hb+1.05,hd-1.05]:
        for x in np.arange(ha+2.3,hc-1.2,5.8):
            pier=box(x-.23,side_y-.23,x+.23,side_y+.23).intersection(hall)
            m.sides(pier,.95,7.05,'timber');m.face(pier,7.05,'timber')
        beam=box(ha+1,side_y-.24,hc-1,side_y+.24).intersection(hall)
        m.sides(beam,6.35,6.85,'timber');m.face(beam,6.85,'timber')
    # The river-facing west porch is visible in the original guide/photo. It
    # cannot be represented by columns only on the north and south sides.
    side_x=ha+1.05
    for y in np.arange(hb+2.3,hd-1.2,5.8):
        pier=box(side_x-.23,y-.23,side_x+.23,y+.23).intersection(hall)
        m.sides(pier,.95,7.05,'timber');m.face(pier,7.05,'timber')
    west_beam=box(side_x-.24,hb+1,side_x+.24,hd-1).intersection(hall)
    m.sides(west_beam,6.35,6.85,'timber');m.face(west_beam,6.85,'timber')
    # The lower roof is a ring around the raised room, not a complete second
    # roof intersecting it. Keep the two observed eave levels legible.
    upper=box(a+18,b+14,c-12,d-14).intersection(hall)
    lower_soffit=box(*hall.bounds).buffer(1.55,join_style='mitre').difference(inner_hall)
    m.face(lower_soffit,7.12,'timber');m.sides(lower_soffit,7.12,7.28,'timber')
    pitched_roof(m,hall,7.3,11.3,1.55,horizontal=True,fascia=.32,cutout=upper)
    m.sides(upper,7.1,12.0,'stone-wall')
    upper_soffit=box(*upper.bounds).buffer(1.15,join_style='mitre').difference(upper)
    m.face(upper_soffit,11.85,'timber');m.sides(upper_soffit,11.85,12.06,'timber')
    pitched_roof(m,upper,12.1,16.0,1.15,horizontal=True,fascia=.32)
    basis=('求是大讲堂主殿：校方2017原照和说明、2023主馆航拍、官方固定鸟瞰及高德卫星共同支持'
           '西侧独立主殿的叠层檐口、外围柱廊、石台基与东西向屋脊；本源只含主殿，东侧厅/廊使用其独立源。'
           '约16米主殿/8米附厅、屋面曲率、柱廊与各分件范围为图像比例概化；柱距不当实测柱数，精确高度未知；'
           '不采用与原照冲突的百科单檐描述及未获原始依据的14.7米数字。原占地障碍、独立楼名和路网不改，不新增入口或通路。')
    finish(fid,source,m,16.15,basis)

    # Keep current functional names, including the separately named institute.
    # A shared historical architectural compound does not merge identities.
    for fid,eave,ridge in [('way/703249690',4.8,8.3),('way/703249691',3.7,6.7),
                           ('way/703249692',4.8,8.1),('way/703249693',4.8,8.4)]:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        stone_body(m,g.buffer(-.8,join_style='mitre'),eave-.2,base=.35,glass_from=1.0,glass_to=eave-.65)
        m.sides(g,.05,.35,'stone-wall');m.face(g,.35,'stone-wall')
        pitched_roof(m,g,eave,ridge,.8,fascia=.25)
        finish(fid,source,m,ridge+.15,'讲堂东侧独立厅体：官方固定鸟瞰、原地面独立ID与高德卫星支持低厅/深色坡顶及两个院落之间的位置。本栋使用原源轮廓，不塞回主殿范围；基础交叉研究院等现名保留，不能按旧影像用途改名。7至9米级屋高、窗柱和屋面为图像比例概化，精确层数/总高未知，原地面、门与路网不变。')

    for fid in ['way/703249694','way/703249695','way/703249696','way/703249697','way/703249698']:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));gallery(m,g,3.65,levels=1)
        a,b,c,d=g.bounds
        roof_parts=[g]
        if fid=='way/703249697':
            # Its real right-angle turn is two roof arms. A bbox roof would
            # cover the inner bend and leave the gallery looking diagonal.
            upper=g.intersection(box(a-1,d-6.2,c+1,d+1))
            roof_parts=[upper,surface_polygons(g.difference(upper))]
        for part in roof_parts:
            if part.area>1:pitched_roof(m,part,3.8,5.3,.4,curve=.45,corner_up=.25,fascia=.22)
        finish(fid,source,m,5.45,'讲堂东侧原记录廊道：官方鸟瞰可见低柱廊/坡顶，按独立窄面源布柱；697原折转分两条屋臂，保留实际转角而不拉出包围盒斜廊。5米级屋高和柱距为图像概化，原建筑身份、地面与路网仍独立，不据廊顶添加可走连接或真实门。')

    def shallow_hip(m,g,eave,rise):
        """Shallow four-sided roofs seen on the north teaching bars.

        Clip the sampled surface to its own wing. A roof neither expands the
        ground obstacle nor makes a shortcut through the adjoining courtyard.
        """
        g=surface_polygons(g)
        if g.is_empty or g.area<1:return
        a,b,c,d=g.bounds;half_short=min(c-a,d-b)/2
        def height(x,y):
            return eave+rise*max(0,min(1,min(x-a,c-x,y-b,d-y)/half_short))
        xs=sorted(set([a,(a+c)/2,c,*np.linspace(a,c,max(4,math.ceil((c-a)/3.0)))]))
        ys=sorted(set([b,(b+d)/2,d,*np.linspace(b,d,max(4,math.ceil((d-b)/3.0)))]))
        vertices=[]
        for xa,xb in zip(xs,xs[1:]):
            for ya,yb in zip(ys,ys[1:]):
                cell=surface_polygons(g.intersection(box(xa,ya,xb,yb)))
                if cell.is_empty or cell.area<.001:continue
                first=len(m.parts);m.face(cell,height,'tile-roof')
                for part in m.parts[first:]:vertices.extend(part['vertices'])
                del m.parts[first:]
        if vertices:m.parts.append({'material':'dorm-roof','vertices':vertices})
        return height

    def academic_windows(m,g,h,rows):
        """Visible bay rhythm only, without a claimed window inventory."""
        window_rows(m,g,h,rows)

    # Four courtyard buildings share an architectural family, not one tall
    # filled parcel. Source north-3/north-4 names conflict with the school index;
    # the shared semantic correction owns names, while these stable ground IDs
    # stay in place. Do not swap coordinates to repair a name.
    north_ids=['way/1112645053','way/1112645054','way/1112645055','way/1112645056']
    for fid in north_ids:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
        north=g.intersection(box(a-1,d-20,c+1,d+1))
        south=g.intersection(box(a-1,b-1,c+1,b+23))
        wings=north.union(south);side=g.difference(wings)
        for wing in [north,south]:
            body(m,wing,12.6,[3.8,7.6,11.4]);academic_windows(m,wing,12.6,[2.1,6.1,10.1])
            height=shallow_hip(m,wing,12.95,1.1)
            wa,wb,wc,wd=wing.bounds
            # The school aerial shows dark rooftop panel strips. Their
            # subdivision is deliberately quiet and not a surveyed module count.
            half_short=min(wc-wa,wd-wb)/2
            start,end=wa+half_short+1.4,wc-half_short-1.4
            middle_y=(wb+wd)/2
            if end>start:
                # Keep the dark panels on one observed roof slope. A single
                # polygon straddling a ridge is triangulated only at its outer
                # corners and can sink below the sampled roof in the centre.
                # These bays lie away from both hip breaks and the ridge, so
                # their planar faces follow the same roof slope exactly.
                count=max(1,round((end-start)/6.4));width=(end-start)/count
                for k in range(count):
                    panel=box(start+k*width+.10,middle_y-4.0,start+(k+1)*width-.10,middle_y-1.7).intersection(wing.buffer(-1))
                    m.face(panel,lambda x,y:height(x,y)+.07,'facade-recess')
            if fid in ['way/1112645053','way/1112645054'] or wing is south:
                # The official guide shows a short row of pale roof fittings.
                # Their exact use and inventory are unknown; no extra POI is made.
                for x in np.linspace(wa+25,wc-25,6) if wc-wa>54 else []:
                    cap=box(x-.75,middle_y-.55,x+.75,middle_y+.55).intersection(wing)
                    z=height(x,middle_y)
                    m.sides(cap,z,z+.65,'skylight');m.face(cap,z+.65,'facade-recess')
        body(m,side,9.0,[3.5,7.0]);academic_windows(m,side,9.0,[2.0,5.8])
        shallow_hip(m,side,9.35,.65)
        open_right=fid in ['way/1112645053','way/1112645055']
        na,nb,nc,nd=north.bounds;sa,sb,sc,sd=south.bounds
        # The lower bar and upper bar can have slightly different traced ends.
        # Use their common frontage, so a straight gallery joins both faces
        # without leaning towards the longer bar or stopping in empty ground.
        x=min(nc,sc)-1.65 if open_right else max(na,sa)+1.65
        bridge=box(x-1.5,sd-.24,x+1.5,nb+.24)
        gallery(m,bridge,6.4,levels=2)
        basis=('段永平北教学楼：校方2022建成航拍、官方固定鸟瞰、高德卫星/平面及百度平面交叉核对四座院落组团。'
               '分开两条教室楼翼、较低侧翼、架高低连接、浅四坡屋顶和图像可见屋面深色带；'
               '约15米主翼含屋面小构件、10米侧翼、6米连接及窗格/屋面带均为图像比例概化，精确总高和部件数量未知。'
               '原地面、门与路网不改，架高显示连接不宣称已取得室内通路。北3/北4名称更正由共同事实维护，稳定几何ID不换位。')
        finish(fid,source.union(transform(world,bridge)),m,14.85,basis)

    # Dining: three floors are documented by the school's 2023 article, while
    # total height and the extent of each roof step remain image-proportioned.
    fid='way/1112646412';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    front=g.intersection(box(a-1,b-1,c-15,b+22))
    rear=g.intersection(box(a+13,d-21,c+1,d+1))
    middle=g.difference(front.union(rear))
    body(m,front,12.9,[4.1,8.2]);academic_windows(m,front,12.9,[2.2,6.3,10.4])
    body(m,rear,12.0,[4.0,8.0]);academic_windows(m,rear,12.0,[2.1,6.1,10.1])
    west_low=middle.intersection(box(a-1,b-1,a+22,d+1));east_low=middle.intersection(box(c-18,b-1,c+1,d+1))
    for part in [west_low,east_low]:
        body(m,part,9.0,[4.1,8.2]);academic_windows(m,part,9.0,[2.2,6.3])
    centre=middle.difference(west_low.union(east_low));body(m,centre,8.2)
    basis=('银泉食堂：官方固定鸟瞰和高德卫星支持并列高屋面、错落侧块及较低中央连接；'
           '校方2023英文介绍明确三层，不据此声称任何屋面是3×3米。最高约13米、退台边界、窗带及各屋面高度为图像比例概化，精确高度未知；'
           '中央低区不补成开放地面捷径，原矩形地面及路网保留。')
    finish(fid,source,m,13.25,basis,levels=3)

    fid='relation/20577586';source=geometries[fid]
    ground=unary_union(source);g,world=local_frame(ground,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    # The untouched official birdseye explicitly depicts an upper courtyard.
    # This negative display space does not alter the acquired ground obstacle.
    court=box(a+13,b+(d-b)*.40,c-8,b+(d-b)*.72).intersection(g)
    mass=g.difference(court);body(m,mass,11.6,[3.6,7.2,10.8]);academic_windows(m,mass,11.6,[2,5.7,9.4])
    m.face(court,.15,'garden')
    basis=('银泉学生服务中心：校方2021组团方案的功能与位置，官方固定鸟瞰及高德影像可见的院落/平屋面共同支持显示组成；'
           '12米级体量、院落范围、楼面带和窗格为图像比例概化，方案图不当作建成测量。'
           '源MultiPolygon存在微小接合重叠，仅显示先合并，以免重复墙面；原始地面障碍、路网与个人配置不改，院落不自动增加通路。')
    finish(fid,source,m,11.95,basis)

    # The adjacent engineering compound encloses several courts in a single
    # acquired polygon. Preserve its angled stair returns, courtyard openings
    # and physical compound ID; the school's 1--6 references are not six doors.
    fid='way/1112646413';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    low=g.intersection(box(-20,-32,1,-12)).union(g.intersection(box(-18,50,4,d+1)))
    main=g.difference(low)
    body(m,main,13.2,[3.8,7.6,11.4]);academic_windows(m,main,13.2,[2.1,6.1,10.1])
    gallery(m,low,7.1,levels=2)
    remaining=main
    masks=[box(a-1,d-22,c+1,d+1),box(a-1,29,c+1,51),box(a-1,b-1,c+1,-50),
           box(a-1,b-1,a+21,d+1),box(c-23,b-1,c+1,d+1),box(-42,-33,-18,30)]
    for mask in masks:
        wing=surface_polygons(remaining.intersection(mask));remaining=remaining.difference(mask)
        if wing.area>1:shallow_hip(m,wing,13.55,1.05)
    if remaining.area>1:shallow_hip(m,remaining,13.55,.6)
    # Two bevelled south stair ends are recognisable in the untouched guide.
    # Their raised caps follow the source return rather than rounding the whole
    # compound or replacing its genuinely angled footprint with a rectangle.
    for x0,x1 in [(-24,-8),(38,55)]:
        cap=surface_polygons(main.intersection(box(x0,b-1,x1,-66)))
        if cap.area>3:
            m.sides(cap,13.2,15.0,'wall');m.face(cap,15.0,'roof')
    basis=('开物苑机械学院组团：校方2022搬迁报道确认功能，官方固定鸟瞰/建成航拍与高德卫星支持多个院落、浅坡教学/实验楼翼、较低连接和南端斜切梯间。'
           '约15米主体及7米连接、屋坡/窗格/梯间帽为图像比例概化，精确总高与屋面构件用途未知。'
           '同一源多部件ID保留，校方1至6幢参考位置不当作已取得六个真实门；原障碍、坐标与路网不改。')
    finish(fid,source,m,15.05,basis)

    # Guantong / agricultural research: two bars meet a low connector beside
    # the stream. The acquired southeast bevel is retained as real geography.
    fid='way/1112646409';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    front=g.intersection(box(a-1,b-1,c+1,b+22))
    rear=g.intersection(box(a-1,d-22,c+1,d+1))
    court=box(a+19,b+22,c-18,d-22).intersection(g)
    side=surface_polygons(g.difference(front.union(rear)).difference(court))
    annex=front.intersection(box(a-1,b-1,c+1,b+8))
    for wing in [front.difference(annex),rear]:
        body(m,wing,12.7,[3.8,7.6,11.4]);academic_windows(m,wing,12.7,[2.1,6.1,10.1])
        shallow_hip(m,wing,13.05,1.25)
    gallery(m,side,6.4,levels=2)
    # A low southern appendage is visible; its plan is still clipped to source.
    if annex.area>1:
        body(m,annex,5.6,[3.8]);academic_windows(m,annex,5.6,[2.1])
    basis=('观通楼（农科教大楼，源组织标签为新农村发展研究院）：校方地图索引1008660、官方固定鸟瞰和高德/百度平面定位；两条楼翼、低连接及临水斜收口分开表达。'
           '约14米主翼和6米连接、屋面与院落范围为图像比例概化，精确层数/总高未知；不为方正而移直临水端，不将显示院落改为路网捷径。')
    finish(fid,source,m,14.4,basis)

    def arm_roof(m,g,eave,pitch=.16,max_rise=1.7):
        """A shallow roof follows every arm and courtyard boundary.

        Measuring from the actual boundary avoids a bounding-box mound across
        an L or U. The roof is sampled for display; it is not a roof survey.
        """
        g=surface_polygons(g)
        if g.is_empty:return lambda x,y:eave
        a,b,c,d=g.bounds;boundary=g.boundary
        def height(x,y):return eave+min(max_rise,pitch*boundary.distance(Point(x,y)))
        xs=np.linspace(a,c,max(3,math.ceil((c-a)/3)))
        ys=np.linspace(b,d,max(3,math.ceil((d-b)/3)))
        vertices=[]
        for xa,xb in zip(xs,xs[1:]):
            for ya,yb in zip(ys,ys[1:]):
                part=surface_polygons(g.intersection(box(xa,ya,xb,yb)))
                if part.is_empty or part.area<.001:continue
                first=len(m.parts);m.face(part,height,'tile-roof')
                for item in m.parts[first:]:vertices.extend(item['vertices'])
                del m.parts[first:]
        if vertices:m.parts.append({'material':'dorm-roof','vertices':vertices})
        return height

    def roof_racks(m,g,height):
        """The pale raised roof frames seen on the science courtyard bars.

        Frame centres are inferred within each arm, rather than laid across a
        parcel bounding box. Their purpose and exact count stay unspecified.
        """
        g=surface_polygons(g);used=[]
        for poly in list(g.geoms) if g.geom_type=='MultiPolygon' else [g]:
            poly=orient(poly,sign=-1)
            for ring in [poly.exterior,*poly.interiors]:
                for pa,pb in zip(ring.coords,list(ring.coords)[1:]):
                    pa=np.array(pa);pb=np.array(pb);length=np.linalg.norm(pb-pa)
                    if length<25:continue
                    u=(pb-pa)/length;n=np.array([u[1],-u[0]]);mid=(pa+pb)/2
                    ray=LineString([mid+n*.08,mid+n*40]);inside=ray.intersection(g)
                    lines=list(inside.geoms) if inside.geom_type=='MultiLineString' else [inside]
                    near=[line for line in lines if line.geom_type=='LineString' and Point(mid+n*.08).distance(line)<.01]
                    if not near:continue
                    width=max(near,key=lambda p:p.length).length+.08
                    if not 8<width<30:continue
                    centre=mid+n*width/2
                    if any(np.linalg.norm(centre-p)<8 for p in used):continue
                    used.append(centre);half=min(length*.34,24)
                    # Segmented rails share the current roof height, including
                    # its real arm changes. No frame leans off the roof edge.
                    count=max(2,math.ceil(half*2/4))
                    points=[centre+u*t for t in np.linspace(-half,half,count+1)]
                    for t in range(count):
                        p0,p1=points[t],points[t+1];z0=height(*p0)+1.0;z1=height(*p1)+1.0
                        for side in [-1,1]:
                            q0=p0+n*side*1.05;q1=p1+n*side*1.05
                            m.parts.append({'material':'skylight','vertices':[
                                m.point(*(q0-n*.09),z0),m.point(*(q1-n*.09),z1),m.point(*(q1+n*.09),z1),
                                m.point(*(q0-n*.09),z0),m.point(*(q1+n*.09),z1),m.point(*(q0+n*.09),z0)]})
                    for p in points:
                        z=height(*p);crossbar=Polygon([p+u*x+n*y for x,y in [(-.11,-1.2),(.11,-1.2),(.11,1.2),(-.11,1.2)]]).intersection(g.buffer(-.5))
                        if crossbar.area>.01:
                            m.sides(crossbar,z,z+1.05,'skylight');m.face(crossbar,z+1.05,'skylight')

    def glazed_bays(m,g,h,spacing=3.9):
        # A restrained vertical reading suits the taller laboratory blocks;
        # it is not a repeated full-wall glass skin.
        academic_windows(m,g,h,list(np.arange(2.2,h-1,3.65)))
        m.facade_bands(g,list(np.arange(3.65,h-1,3.65)),.09)

    # The three recently mapped northern envelopes pre-date their OSM edit.
    # Official A/B/C/D references establish identities; an edit timestamp is
    # not a construction date. B and C stay distinct point identities even
    # though one acquired envelope covers their connected massing.
    fid='way/1502850910';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    lightwell=box((a+c)/2-3,(b+d)/2-2.5,(a+c)/2+3,(b+d)/2+2.5).intersection(g)
    body(m,g.difference(lightwell),14.7);academic_windows(m,g.difference(lightwell),14.7,[2.2,5.7,9.2,12.7])
    roof=g.buffer(-.6,join_style='mitre').difference(lightwell);m.face(roof,15.08,'roof')
    service=box(c-8,b+4,c-2,d-4).intersection(g.buffer(-1))
    m.sides(service,14.7,16.0,'wall');m.face(service,16.0,'roof');m.face(lightwell,.15,'facade-recess')
    finish(fid,source,m,16.05,'西区动物中心A座：原官方A座参考点落在本源内，官方固定鸟瞰与高德整体位置支持独立较高方形体量、浅色平顶/小采光区和屋面设备块。学校2023搬迁及2024改造原文明确A幢四楼在使用，但不能推成精确总层数/屋高；16米级体量和窗格/设备/采光口为图像比例概化。原2026-04 OSM编辑时间不是新建时间；原地面/路线/门不改，内部通行未取得。')

    fid='way/1502850911';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    north=g.intersection(box(a-1,d-14,c+1,d+1));south=g.intersection(box(a-1,b-1,c+1,b+15))
    side=g.difference(north.union(south));court=box(a+7,b+15,c-7,d-14).intersection(side)
    for part,h in [(north,8.8),(south,7.0)]:
        body(m,part,h);academic_windows(m,part,h,[2.1,5.8]);m.face(part.buffer(-.7,join_style='mitre'),h+.35,'roof')
    body(m,side.difference(court),5.4);m.face(court,.12,'garden')
    # The pale roof frame is observed over one low bar; no purpose/inventory
    # or indoor route is inferred from it.
    roof_racks(m,north,lambda x,y:9.15)
    finish(fid,source,m,10.25,'西区动物中心B/C连体显示：原官方B与C两个参考点都在此原大矩形面内，北/南两条低楼翼、较低侧连接和院落/浅色屋架在官方鸟瞰及高德整体位置可辨。10米级北翼/7米级南翼与内院、屋架为图像比例概化，精确屋高与楼号分界未知。B/C参考ID与地点仍分开，不将两个地点合为一个入口；原矩形地面障碍/路网保持，显示内院不自动增加可走捷径。')

    fid='way/1502850912';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    body(m,g,6.3);academic_windows(m,g,6.3,[2.1,5.3]);cap=g.buffer(-.7,join_style='mitre')
    m.sides(cap,6.3,6.75,'wall');m.face(cap,6.75,'roof')
    for x in np.linspace(a+5,c-5,5):
        fitting=box(x-.6,(b+d)/2-1.4,x+.6,(b+d)/2+1.4).intersection(cap)
        if fitting.area>1:m.sides(fitting,6.75,7.45,'wall');m.face(fitting,7.45,'roof')
    finish(fid,source,m,7.5,'西区动物中心D座：原官方D点在本源内，官方鸟瞰与高德整体关系支持最南侧独立低长屋面及小屋面构件；8米级体量/构件为图像概化，精确高度/数量与当前设备用途未知。原独立地面、门和路网保留，不凭屋顶设备补室内结构。')

    science_ids=['way/703251458','way/703251460','way/703251461','way/703251462',
                 'way/703251463','way/703251464','way/1122290580','way/1122290581']
    science_heights={'way/703251458':18.1,'way/703251460':20.4,'way/703251461':22.3,
                     'way/703251462':19.2,'way/703251463':18.6,'way/703251464':17.9,
                     'way/1122290580':18.6,'way/1122290581':17.9}
    for fid in science_ids:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));h=science_heights[fid]
        body(m,g,h);glazed_bays(m,g,h)
        roof=arm_roof(m,g,h+.34,.15,1.35);roof_racks(m,g,roof)
        basis=('海纳苑理学组团：官方固定鸟瞰逐对象对应原地面位置，可见独立直条/C形/院落楼体、浅坡屋顶、屋面白色框列和不同楼高；'
               '沿每条实际楼臂建立屋面，保持院落与转角，不用整块包围盒替代结构。'
               '18至24米级体量、框列和窗格为图像比例概化，精确总高/屋顶构件用途和数量未知；原楼名、门与路网不改。')
        children=[];display=source;maximum=h+2.75
        if fid=='way/703251458':
            # The front mathematics wing has its own acquired polygon. The
            # official Haina2 reference lies inside it, while the named source
            # records the lower rear court. Leaving it flat amputated the main
            # street-facing volume. Keep both original ground IDs; display the
            # observed physical compound under its existing named identity.
            child='way/703251459';children=[child]
            u,v,*_=frame(source,angle=campus_axis(source));origin=np.array([source.centroid.x,source.centroid.y])
            # Dot products, not the forward frame, place the acquired child
            # into this parent's local x/y coordinates.
            def math_child_local(x,y,z=None):
                dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
                return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
            front=transform(math_child_local,geometries[child]);body(m,front,27.5);glazed_bays(m,front,27.5)
            front_roof=arm_roof(m,front,27.85,.14,1.4);roof_racks(m,front,front_roof)
            display=source.union(geometries[child]);maximum=30.3
            basis=('海纳苑2（数学科学学院）组团：官方数学大楼参考点hotmap_221027.1210落在原匿名前翼703251459，前翼与已名后院703251458接边；'
                   '官方原鸟瞰的街侧较高长翼/屋面框列、较低后院及高德卫星整体关系共同支持分件。显示归同一已有数学楼身份，两个原地面源保留；'
                   '30米级前翼、20米级后院与窗格/屋面框列为图像比例概化，精确总高和层数仍未知，不用教师房间号推层数。'
                   '原路网/障碍/门与个人配置不改，不把视觉连接推成已取得室内通路。')
        finish(fid,display,m,maximum,basis,children=children)

    material_ids=['way/1125378161','way/1125378162','way/1125378163',
                  'way/1410577278','way/1410577279','way/1410577280']
    for fid in material_ids:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
        if fid in ['way/1125378161','way/1125378162']:
            high=g.intersection(box(a-1,b-1,c+1,b+22) if fid=='way/1125378161' else box(a-1,d-23,c+1,d+1))
            low=g.difference(high);body(m,high,36.8);glazed_bays(m,high,36.8)
            body(m,low,20.5);glazed_bays(m,low,20.5)
            arm_roof(m,high,37.15,.10,1.0);arm_roof(m,low,20.85,.13,1.4)
            maximum=38.2
        else:
            h=20.0 if fid!='way/1410577280' else 15.6
            body(m,g,h);glazed_bays(m,g,h);arm_roof(m,g,h+.34,.13,1.4);maximum=h+1.8
        basis=('和同苑材化高组团：官方固定鸟瞰与地面对象对应，南北两组高主翼对置、低院落翼和独立附楼分开表达；'
               '38米级高翼/20米级院落翼与其他15至22米级体量为图像比例概化，精确楼高和各对号楼分界未知。'
               '同一原物理组团ID、转角与负空间保留，显示分翼不增加真实门或室内连接。')
        finish(fid,source,m,maximum,basis)

    humanities_ids=['way/703251437','way/703251439','way/703251440','way/703251442',
                    'way/703251443','way/703251444','way/703251447','relation/19301440']
    humanities_heights={'way/703251437':20.5,'way/703251439':15.6,'way/703251440':15.6,
                        'way/703251442':22.0,'way/703251443':24.0,'way/703251444':23.5,
                        'way/703251447':27.0,'relation/19301440':26.0}
    for fid in humanities_ids:
        source=geometries[fid];solid=unary_union(source);g,world=local_frame(solid,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));h=humanities_heights[fid]
        body(m,g,h);glazed_bays(m,g,h);arm_roof(m,g,h+.34,.14,1.45)
        basis=('成均苑人文组团：官方固定鸟瞰逐对象可见不同C/L形高低楼翼、院落和浅坡屋面，显示沿原轮廓与负空间构造；'
               '16至29米级体量、窗格与屋面转折为图像比例概化，精确总高与各部件尺寸未知；源多部件仅为显示合并，不改变原地面、名称和路网。')
        finish(fid,source,m,h+1.85,basis)

    # Two acquired pieces were omitted because they have no name: a taller
    # continuous west arm by Chengjun's upper L, and a lower return by
    # Chengjun10. Their different observed massing is retained, not copied
    # from one common box. Unknown proper names remain unknown.
    for fid,h in [('way/703251446',22.0),('way/703251445',10.4)]:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));body(m,g,h)
        academic_windows(m,g,h,list(np.arange(2.2,h-1,3.65)))
        if fid=='way/703251446':
            roof=arm_roof(m,g,h+.34,.14,1.45);roof_racks(m,g,roof);maximum=h+2.65
        else:
            inset=g.buffer(-.8,join_style='mitre');m.sides(inset,h,h+.55,'wall');m.face(inset,h+.55,'roof');maximum=h+.6
        finish(fid,source,m,maximum,'成均苑独立未名分件：原地面与米制相邻关系、已实际看的官方固定鸟瞰、高德平面/卫星和百度成均苑定位交叉核对；446是贴合7幢一侧的较高长楼翼，445是10幢旁较低附属体量。分别表达25米级/11米级显示屋高，窗格/帽顶/框列均为比例概化；精确高度、用途分界和本块正式楼名未知，不凭接边把未名对象改成楼号。原ID、地面障碍、接入与路网保留。')

    # The ancient-book library is a lower courtyard roof within a rectangular
    # acquired envelope. It is distinct from the west main library.
    fid='way/703251441';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    court=box((a+c)/2-5.5,(b+d)/2-5.0,(a+c)/2+5.5,(b+d)/2+5.0).intersection(g)
    perimeter=g.difference(court)
    body(m,perimeter,10.8,[3.5,7.0]);academic_windows(m,perimeter,10.8,[2.0,5.6,9.1])
    arm_roof(m,perimeter,11.15,.16,1.4);m.face(court,.12,'garden')
    finish(fid,source,m,12.6,'古籍图书馆：官方固定鸟瞰可见方形低屋面与中央小院，和北侧主图书馆身份分开；12米级屋高与院落尺度为图像概化，精确高度未知，显示开口不改原矩形地面障碍或增加通路。')

    # Management school: three towers share a low platform. The image's round
    # landscape feature is not a room or a fourth invented tower.
    fid='way/703251450';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    # The named polygon records one tower plus the platform. The other two
    # towers are separate, unnamed acquired polygons; they do not sit inside
    # three arbitrary rectangles cut from the named parcel.
    children=['way/703251448','way/703251449']
    u,v,*_=frame(source,angle=campus_axis(source));origin=np.array([source.centroid.x,source.centroid.y])
    def management_local(x,y,z=None):
        dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
        return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
    tower_one=g.intersection(box(c-47.8,b-.1,c+.1,b+47.5))
    towers=[tower_one,*[transform(management_local,geometries[child]) for child in children]]
    plinth=g.difference(tower_one);stone_body(m,plinth,6.2,glass_from=1.0,glass_to=5.5)
    for tower in towers:
        if tower.area<1:continue
        library_body(m,tower,43.0,glass_from=3.0,glass_to=41.8)
        cap=tower.buffer(-2.2,join_style='mitre')
        m.sides(cap,43.0,45.2,'stone-wall');m.face(cap,45.2,'roof')
        m.face(cap.buffer(-2.0,join_style='mitre'),45.26,'facade-recess')
    finish(fid,unary_union([source,*[geometries[child] for child in children]]),m,45.3,'管理学院组团：官方固定鸟瞰支持三座独立高塔与共同低台地；named源含一塔/台地，另两塔对应原匿名源703251448/449，显示合一但原地面ID保留。方形退台帽与窄竖窗概化；45米级总高与屋面尺度为图像比例，精确高度未知。低台地不当作第四高塔，不据外壳补室内路线。',children=children)

    for fid in ['way/411343679','way/411343681']:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        body(m,g,33.8);glazed_bays(m,g,33.8)
        roof=g.buffer(-.6);m.face(roof,34.2,'roof')
        # Pale, open long roof frames are visible on the two high wings.
        roof_racks(m,g,lambda x,y:34.2)
        finish(fid,source,m,35.4,'安中大楼A/B高翼：官方固定鸟瞰与原L形地面对象对应，长玻璃/砖石立面、院落、架高屋面框列分开表达；35米级体量及构件为图像概化，2016建工报告的整组高度不能未核对分部图就绑定到某一源ID。精确本栋总高未知，原地面与路网保留。')

    fid='way/411343682';source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
    gallery(m,g,6.3,levels=2)
    finish(fid,source,m,6.3,'安中大楼原记录窄连接：官方鸟瞰支持两个高翼之间的低连接，本源仅约19×5米的一段；6米级显示，不把该小源面扩成整栋科研楼，不添加真实门或室内通路。')

    fid='way/411343684';source=geometries[fid];g,world=local_frame(source)
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    m.sides(g,0,17.6,'wall')
    half=(d-b)/2;middle=(b+d)/2;vertices=[]
    xs=np.linspace(a,c,max(3,math.ceil((c-a)/5)));ys=np.linspace(b,d,27)
    def barrel(x,y):return 17.6+4.4*math.sqrt(max(0,1-((y-middle)/half)**2))
    for xa,xb in zip(xs,xs[1:]):
        for ya,yb in zip(ys,ys[1:]):
            cell=surface_polygons(g.intersection(box(xa,ya,xb,yb)))
            first=len(m.parts);m.face(cell,barrel,'tile-roof')
            for p in m.parts[first:]:vertices.extend(p['vertices'])
            del m.parts[first:]
    m.parts.append({'material':'tile-roof','vertices':vertices})
    for pa,pb in zip(g.exterior.coords,list(g.exterior.coords)[1:]):
        pa=np.array(pa);pb=np.array(pb)
        if abs(pb[1]-pa[1])<abs(pb[0]-pa[0]) or np.linalg.norm(pb-pa)<(d-b)*.5:continue
        ends=[pa+(pb-pa)*t for t in np.linspace(0,1,27)]
        for p0,p1 in zip(ends,ends[1:]):
            m.parts.append({'material':'wall','vertices':[
                m.point(*p0,17.6),m.point(*p1,17.6),m.point(*p1,barrel(*p1)),
                m.point(*p0,17.6),m.point(*p1,barrel(*p1)),m.point(*p0,barrel(*p0))]})
    finish(fid,source,m,22.0,'建工试验大厅：官方固定鸟瞰可见长条拱形屋盖，与方形海洋大厅分开；2016建工环保验收报告记载试验大厅22米级，当前檐口/曲率与构件仍按图像比例表达，不能当当前测量或楼内设备地图。原地面与路网保留。')

    fid='way/411343685';source=geometries[fid];g,world=local_frame(source)
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));m.sides(g,0,20.2,'wall');shallow_hip(m,g,20.2,1.8)
    finish(fid,source,m,22.0,'海洋试验大厅：官方固定鸟瞰可见独立方形高跨屋盖，2016建工环保验收报告记载相关大厅22米级；分开四坡顶与长拱形建工厅。具体檐口/屋坡仍为图像概化，非当前实测或室内水槽导航。原地面和路网不改。')

    for fid,h in [('way/306107352',7.5)]:
        source=geometries[fid];g,world=local_frame(source);m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        body(m,g,h,[3.5]);academic_windows(m,g,h,[2.0,5.7])
        a,b,c,d=g.bounds;top=box(a+1.4,b+1.4,c-1.4,d-1.4).intersection(g)
        m.sides(top,h,h+.7,'wall');m.face(top,h+.7,'roof')
        finish(fid,source,m,h+.75,'中央西区小附楼：按官方固定鸟瞰与原单独矩形源面表达较低两层级体量、退台屋面；8米级高度为图像比例，精确高度未知。小对象不扩大为整片研究院或报告厅，不补室内路线。')

    housing_ids=['way/703248079','way/703248080','way/703248086','way/703248087',
                 'way/703248091','way/703248092','way/703248093','way/703248096',
                 'way/703248089','way/703248094','way/703248095']
    housing_heights={'way/703248079':23.0,'way/703248080':22.0,'way/703248086':23.0,
                     'way/703248087':22.0,'way/703248091':24.5,'way/703248092':24.5,
                     'way/703248093':23.0,'way/703248096':24.5,'way/703248089':28.0,
                     'way/703248094':20.5,'way/703248095':18.5}
    for fid in housing_ids:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds;h=housing_heights[fid]
        # Narrowness alone is not evidence of a low connector.
        # Occupied source arms and their negative spaces remain intact.
        body(m,g,h);glazed_bays(m,g,h);arm_roof(m,g,h+.32,.14,1.55)
        basis=('西南住宿/教育片区：官方固定鸟瞰与当前地面源逐对象对应，可见直条/折臂院落、较低连接和灰色浅坡屋盖；'
               '保留共同索引现名，不从历史图外观重命名现用途。19至30米级体量、窗带和屋面尺寸为图像比例概化，精确屋高和现实楼内通行未知；'
               '原几何/路网/个人配置保留，显示负空间不新增可走捷径。')
        finish(fid,source,m,h+1.95,basis)

    for fid,h in [('way/703248081',10.8),('way/703248090',11.2)]:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        body(m,g,h);academic_windows(m,g,h,[2.1,5.7,9.3]);arm_roof(m,g,h+.34,.15,1.2)
        finish(fid,source,m,h+1.6,'澄月/研究生教育片区未名窄翼：独立原源081与1/2舍接边，090与研究生教育综合楼接边；官方原鸟瞰可见相邻高主翼与较低侧翼/连接。12至13米级屋高和窗格为图像比例概化，保留源凹口与折边，不因窄就画成无墙开放廊或替它猜正式名称；实际室内连接、层数与门仍未知，原地面/路网不改。')

    for fid in ['way/703248097','way/703248098']:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        body(m,g,3.8);academic_windows(m,g,3.8,[2.0]);shallow_hip(m,g,4.13,1.2)
        finish(fid,source,m,5.4,'西南片区两座小附楼：原独立小面源与已实际查看的官方鸟瞰南侧矮屋对应，保留各自位置和间隙；5米级屋高/浅坡和窗格为图像概化，用途与正式名称仍未知，不凭临路位置改称门卫/商店，不新增真实门或通路。')

    fid='way/1462552361';source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
    # The source explicitly records a gazebo/shelter, rather than a solid room.
    # The guide shows a small pavilion in this plaza. Keep the acquired polygon
    # and open posts; a bench tag does not locate an invented bench or entrance.
    m.face(g,.12,'stone-wall')
    # A sampled circular boundary may have dozens of vertices. They are not
    # real post positions; eight quiet supports are an explicit simplification.
    for k in range(8):
        p=g.exterior.interpolate(k*g.exterior.length/8);x,y=p.x,p.y
        pier=box(x-.13,y-.13,x+.13,y+.13).intersection(g.buffer(.1,join_style='mitre'))
        m.sides(pier,.12,3.1,'timber');m.face(pier,3.1,'timber')
    shallow_hip(m,g,3.2,1.0)
    finish(fid,source,m,4.25,'成均苑小亭：原OSM记录amenity=shelter/shelter_type=gazebo，官方鸟瞰该广场可见小亭；按原多边形保留开放支柱/低屋盖，不拉成密闭楼。4米级屋高、柱数/尺寸为图像概化，实际高度/名称/座椅位置未知；不把bench=yes变成精确座椅坐标，不据模型改通路或无障碍保证。')

    fid='relation/9772852';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));body(m,g,10.2,[3.4,6.8]);academic_windows(m,g,10.2,[2,5.5,8.9])
    arm_roof(m,g,10.55,.14,1.2)
    finish(fid,source,m,11.8,'澄月食堂：官方固定鸟瞰和原独立地面源支持较低院落/浅坡屋面，12米级体量与窗格为图像概化；不从食堂名称推精确层数或当前开放情况，原地面和路网保留。')

    # The school plan and the built guide show an occupied transverse bar in
    # Silver7/8. It is absent from the acquired C-shaped footprint. Add only
    # that display part; it never becomes a ground obstacle or walking edge.
    # Six approximate plan-outline correspondences (Silver8 and Silver1), with
    # Silver7 held out, establish this small-block display frame. Fit residuals
    # are 1.1--2.1 m; unused Silver7 outline checks are 2.2/7.8/4.2 m. These are
    # drawing/source disagreements, not survey accuracy or current wall fixes.
    plan_matrix=np.array([[.883830403544297,.39048067629432204],
                          [.42125507885124636,-.8600480435497757],
                          [575.5745598218198,1461.8980341994813]])
    def plan_poly(points,holes=()):
        def xy(ring):return [np.array([x,y,1.])@plan_matrix for x,y in ring]
        return Polygon(xy(points),[xy(hole) for hole in holes])

    silver_cross={
        'way/1302813125':[(215,328),(266,328),(266,340),(215,340)],
        'way/1302813126':[(315,328),(368,328),(366,340),(315,340)]}
    for fid,h in [('way/1302813125',18.5),('way/1302813126',18.5),('way/614260757',13.8),('way/703248077',13.8)]:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        rise=2.8 if fid in silver_cross else 1.45
        pitch=.30 if fid in silver_cross else .15
        body(m,g,h);glazed_bays(m,g,h);arm_roof(m,g,h+.34,pitch,rise)
        if fid in silver_cross:
            u,v,*_=frame(source,angle=campus_axis(source));origin=np.array([source.centroid.x,source.centroid.y])
            def silver_local(x,y,z=None):
                dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
                return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
            cross=surface_polygons(transform(silver_local,plan_poly(silver_cross[fid])).difference(g))
            body(m,cross,h);glazed_bays(m,cross,h);arm_roof(m,cross,h+.34,pitch,rise)
            display=source.union(transform(world,cross))
            basis='银泉7/8：2021校方总平面图、2022官方鸟瞰与实际查看高德卫星支持院落及中间横向楼翼；原7幢真实斜翼保留，新增横翼仅用于显示。小片区方案/源轮廓对应的独立检查差异约2至8米，不作为测绘精度；22米级屋高、窗格与内部楼翼尺度概化，原地面障碍、接入和路网不变，不补真实门。'
        else:
            display=source
            basis='惟学独立楼体：官方固定鸟瞰可见低体量和深色屋面，原源轮廓、朝向与现名保留；16米级显示高度为图像比例，精确高度未知，不补造真实门。'
        finish(fid,display,m,h+rise+.36,basis)

    fid='way/1462301204';source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
    a,b,c,d=g.bounds
    # This acquired envelope is rectangular, while the guide depicts an open
    # accommodation court. Express that negative space only in the model.
    court=box(a+(c-a)*.17,b+(d-b)*.13,c-(c-a)*.15,d-(d-b)*.14).intersection(g)
    cross=box(a-1,(b+d)/2-4.8,c+1,(b+d)/2+4.8).intersection(g)
    main=g.difference(court).union(cross);body(m,main,18.5);glazed_bays(m,main,18.5);arm_roof(m,main,18.85,.30,2.8)
    m.face(court.difference(cross),.12,'garden')
    finish(fid,source,m,21.7,'银泉1原矩形源：2021校方总平面和官方固定鸟瞰支持上下两院、横向中翼及坡顶；显示内院/横翼概化，原矩形地面与路由保留。22米级体量非测量，不由模型开口新增门或可走通路。')

    # Missing acquired footprints remain official point references. These five
    # observed masses use existing official identities and a plan-derived
    # DISPLAY placement. No point is promoted into a surveyed building, and no
    # new source ground polygon, routing obstacle, entrance or public ID is made.
    silver_plan=[
        ('official/hotmap_221027.1161',[(450,328),(524,328),(524,411),(421,411)],
         [[(461,340),(514,340),(514,364),(452,364)],[(451,375),(514,375),(514,400),(434,400)]],18.5),
        ('official/hotmap_221027.1162',[(544,262),(618,262),(618,304),(544,304)],
         [[(558,274),(605,274),(605,291),(558,291)]],18.5),
        ('official/hotmap_221027.1163',[(450,262),(526,262),(526,304),(437,304)],
         [[(460,274),(513,274),(513,291),(455,291)]],18.5),
        ('official/hotmap_221027.1260',[(545,217),(615,217),(615,250),(596,250),(596,235),(545,235)],[],47.0),
        ('official/hotmap_221027.1164',[(464,217),(520,217),(520,235),(482,235),(478,247),(457,247)],[],47.0)]
    for fid,outline,courts,h in silver_plan:
        if fid not in geometries:continue
        display=plan_poly(outline,courts);g,world=local_frame(display,campus_axis(display))
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        if h>40:
            body(m,g,h);academic_windows(m,g,h,list(np.arange(2.3,h-1.0,3.35)))
            # The built guide shows flat pale crowns and short end returns on
            # these two high blocks, not the dark hips of the low residences.
            cap=g.buffer(-1.35,join_style='mitre');m.sides(cap,h,h+1.25,'stone-wall');m.face(cap,h+1.25,'roof')
            roof=cap.buffer(-1.6,join_style='mitre')
            m.face(roof,h+1.29,'skylight')
            maximum=h+1.3
        else:
            body(m,g,h);academic_windows(m,g,h,list(np.arange(2.1,h-1,3.35)))
            arm_roof(m,g,h+.34,.30,2.8);maximum=h+3.15
            for poly in list(g.geoms) if g.geom_type=='MultiPolygon' else [g]:
                for ring in poly.interiors:m.face(Polygon(ring),.12,'garden')
        basis=('银泉补充显示体量：使用既有官方楼号参考ID，2021校方总平面、2022官方鸟瞰及实际查看高德卫星交叉支持六座低楼与5/6两座高楼的组成。'
               '地面面源缺失，显示位置/外缘采用小片区方案轮廓与既有1/8幢源轮廓对应，7幢未参与拟合的轮廓差异约2至8米；这是来源差异，不能作为实测精度。'
               '22米级低楼和48米级高塔、院落/窗格/帽顶均为比例概化，精确位置边界、总高和建成层数仍未知。'
               '原官方参考坐标、点身份、地面障碍、路网与接入均未改，不添加真实入口/室内导航或通行保证。')
        finish(fid,display,m,maximum,basis)
        models[-1][2].update(placementBasis='plan-derived-display-only',groundFootprintKnown=False,
                            positionAccuracyM=None,sourceDate='2021-plan/2022-guide',
                            displayReference=to_wgs(display.centroid.x,display.centroid.y))

    for fid,h in [('relation/9772899',19.8),('way/703251451',20.5),('way/703251452',20.5)]:
        source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        body(m,g,h);glazed_bays(m,g,h);arm_roof(m,g,h+.32,.14,1.4)
        # The flat end-terraces contrast with the dark occupied bars in the guide.
        a,b,c,d=g.bounds
        for x0,x1 in [(a+1,a+8),(c-8,c-1)]:
            terrace=box(x0,b+1,x1,d-1).intersection(g.buffer(-.5))
            if terrace.area>1:m.face(terrace,h+.4,'roof')
        finish(fid,source,m,h+1.75,'玉湖3及4/5、6/7宿舍：官方固定鸟瞰与原环形/折臂源对应，内院、深色占用屋面与浅色端头平台分开；22米级体量与窗格为图像比例概化，精确高度未知，原孔洞和地面通路关系不改。')

    fid='way/703251457';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));body(m,g,18.8);glazed_bays(m,g,18.8);arm_roof(m,g,19.12,.14,1.4)
    children=['way/703251455','way/703251456'];u,v,*_=frame(source,angle=campus_axis(source));origin=np.array([source.centroid.x,source.centroid.y])
    def yuhu_local(x,y,z=None):
        dx=np.asarray(x)-origin[0];dy=np.asarray(y)-origin[1]
        return dx*u[0]+dy*u[1],dx*v[0]+dy*v[1]
    for child in children:
        tower=transform(yuhu_local,geometries[child]);body(m,tower,47.0);glazed_bays(m,tower,47.0)
        cap=tower.buffer(-1.4,join_style='mitre');m.sides(cap,47.0,48.1,'wall');m.face(cap,48.1,'roof')
    finish(fid,unary_union([source,*[geometries[child] for child in children]]),m,48.15,'玉湖1/2：官方固定鸟瞰明确两座较高塔和低住宿连接；塔使用两个原匿名源703251455/456，原named面只是较低长连接，不把其包围盒直接拉成塔。48米级高塔/20米级低翼为图像比例，精确高度与内部连接未知；原地面ID保留，显示身份统一而路网不改。',children=children)

    fid='way/322644189';source=geometries[fid];g,world=local_frame(source,campus_axis(source))
    m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)));a,b,c,d=g.bounds
    academic=g.intersection(box(a-1,d-24,c+1,d+1))
    lobby=g.intersection(box(a-1,b-1,c+1,b+12))
    galleries=g.difference(academic.union(lobby))
    # The architect explicitly documents a FOUR-STOREY academic bar facing
    # campus. Raising only a corner of a low north roof misrepresented it.
    # The overall photo and official guide agree on a continuous high bar,
    # lower galleries, and a much lower glazed lobby with thin cantilevers.
    body(m,academic,18.5)
    academic_windows(m,academic,18.5,[2.3,6.4,10.5,14.6])
    # Broad glazed fields interrupt solid masonry; don't put the museum in
    # the identical all-window grid used on ordinary teaching blocks.
    skin=academic.buffer(.04,join_style='mitre')
    for x0,x1,z0,z1 in [(a+7,a+30,10.3,17.6),(a+67,a+81,9.9,17.6),(a+98,c-8,13.6,16.0)]:
        field=skin.intersection(box(x0,d-24.5,x1,d+.5))
        if field.area>1:m.sides(field,z0,z1,'facade-recess')
    academic_cap=academic.buffer(-1.1,join_style='mitre')
    m.sides(academic_cap,18.5,19.05,'wall');m.face(academic_cap,19.05,'roof')
    body(m,galleries,8.6)
    # Quiet broad horizontal relief represents the observed masonry weave;
    # there is no invented literal block/window inventory or building colour.
    m.facade_bands(galleries,[2.2,4.5,6.8],.11)
    gallery_top=galleries.buffer(-1.0,join_style='mitre')
    m.sides(gallery_top,8.6,9.05,'wall');m.face(gallery_top,9.05,'roof')
    lantern=surface_polygons(galleries.intersection(box(a+27,b+38,c-27,b+53)))
    if lantern.area>1:
        m.sides(lantern,8.6,11.0,'glass');m.facade_divisions(lantern,8.7,10.95,4.3,.12)
        m.face(lantern.buffer(.35,join_style='mitre'),11.15,'roof')
    body(m,lobby,6.1)
    m.sides(lobby.buffer(.04,join_style='mitre'),.55,5.8,'facade-recess')
    m.facade_divisions(lobby,.55,5.8,4.6,.13)
    canopy=lobby.buffer(.9,join_style='mitre')
    m.sides(canopy,6.1,6.4,'wall');m.face(canopy,6.4,'roof')
    # A thin entrance canopy reads separately from the occupied lobby. Its
    # small extension is a display overhang; it makes no ground obstacle/door.
    finish(fid,source,m,19.1,'艺术与考古博物馆：Gluckman Tang设计方2019项目说明和原实景航拍/学术翼/入口照片、校方2019文章及官方鸟瞰共同支持四层朝校园长学术翼、较低实体展厅、抬高采光带和低玻璃大厅/薄遮檐。修正旧稿只抬高角部的组成错误；学术翼19米级、展厅9米级/采光带11米级和大厅6米级高度及立面分区均为图像比例概化，精确外部总高/构件数量仍未知。设计方6米仅指一间展厅内净高，未当整栋屋高或室内导航。原地面/折臂与路网保留；有照片的入口组成不等于已取得可靠门坐标，不新增通路。',levels=4)

    fid='way/614260756';source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
    body(m,g,10.5);academic_windows(m,g,10.5,[2.0,5.5,9.0]);arm_roof(m,g,10.82,.15,1.7)
    finish(fid,source,m,12.6,'尧坤楼：官方固定鸟瞰可见非直角长翼与折转屋盖，原临街斜边不正交化；13米级体量与屋坡为图像比例，精确高度未知，保留原地理收口及路网。')

    fid='way/1122290579';source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
    body(m,g,11.5);academic_windows(m,g,11.5,[2.0,5.8,9.5]);arm_roof(m,g,11.82,.14,1.8)
    finish(fid,source,m,13.7,'玉湖餐厅原不规则源：官方固定鸟瞰可见较大宽屋面与多向外缘，13米级高跨和坡面为图像概化；未因餐厅名称推精确层数/当前开放，原斜转角与地面不改。')

    fid='way/1073555298';source=geometries[fid];g,world=local_frame(source,campus_axis(source));m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
    body(m,g,20.2);glazed_bays(m,g,20.2)
    a,b,c,d=g.bounds;inner=g.buffer(-.6);m.face(inner,20.7,'roof')
    m.face(inner.difference(inner.buffer(-1.9)),20.76,'facade-recess')
    finish(fid,source,m,20.8,'海洋大楼原梳形源：官方固定鸟瞰可见较低并列实验/计算楼臂、深色内立面与浅色平屋面，和南侧安中高翼分开；21米级体量为图像比例。2016建工报告的教学/计算中心六层表与正文变更层数有冲突，不以房间号或单表绑定当前精确总高，原坐标/路网不变。')

    return models
