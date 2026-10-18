"""Observed northern dormitories and their lower halls, view geometry only.

The public ground footprints, holes and routing never derive from this model.
Sources and vertical uncertainty live in residential-observations.json.
"""
import math
import numpy as np
from shapely.geometry import Polygon,LineString,box
from shapely.ops import transform
from shapely.geometry.polygon import orient
from map_v3_landmarks import SurfaceParts
from map_v3_surfaces import frame,soften_source_curve,orthogonal_footprint


def residential_models(geometries,to_wgs,observations):
    models=[]
    for item in [*observations['bodies'],*observations['connectors']]:
        fid=item['id'];g=geometries[fid];height=item['displayHeightM']
        if fid=='way/305829555':g=soften_source_curve(g,.85)
        alignment=observations.get('groupAlignment',{}).get(item['group'])
        shared_angle=math.radians(alignment['axisDeg']) if alignment else None
        if alignment:
            # These seven parallel dormitory plans were reviewed as a group.
            # A separate minimum box picked a different noisy source edge for
            # each building. Retain every centre and the real campus bearing;
            # regularise only bounded near-orthogonal tracing errors.
            g,_=orthogonal_footprint(g,max_shift=alignment['maxDisplayShiftM'],
                                     angle=shared_angle,angular_tolerance=6)
        u,v,lo,hi,angle=frame(g,angle=shared_angle)
        local=lambda x,y,z=None:(np.asarray(x)*u[0]+np.asarray(y)*u[1],np.asarray(x)*v[0]+np.asarray(y)*v[1])
        world=lambda x,y,z=None:(np.asarray(x)*u[0]+np.asarray(y)*v[0],np.asarray(x)*u[1]+np.asarray(y)*v[1])
        flat=transform(local,g);a,b,c,d=flat.bounds
        m=SurfaceParts(lambda x,y:to_wgs(*world(x,y)))
        is_hall=item in observations['connectors']
        if is_hall:
            # Each hall keeps its own recorded identity; it is not a new door.
            passage=item.get('recordedPassage')
            base=passage['displayClearanceM'] if passage else 0
            m.sides(flat,base,height-.35,'dorm-glass')
            if passage:
                # Reuse the existing storey band as an illustrative lower
                # deck. A recorded ground crossing cannot be a glass prism.
                m.face(flat,base,'dorm-roof');m.sides(flat,base-.24,base,'dorm-wall')
                crossing=transform(local,geometries[passage['roadId']]).buffer(passage['displaySupportExclusionWidthM']/2)
                for x,y in [(a+.3,b+.3),(a+.3,d-.3),(c-.3,b+.3),(c-.3,d-.3)]:
                    pier=box(x-.22,y-.22,x+.22,y+.22).intersection(flat)
                    if not pier.is_empty and not pier.intersects(crossing):m.sides(pier,0,base-.24,'dorm-wall')
            m.face(flat,height-.35,'dorm-roof')
            rim=flat.difference(flat.buffer(-.24))
            m.sides(rim,height-.35,height,'dorm-parapet');m.face(rim,height,'dorm-parapet')
            glazing=flat.buffer(-.8)
            m.face(glazing,height-.28,'glass')
            for x in np.arange(a+1.3,c,3.8):
                joint=box(x-.065,b-.1,x+.065,d+.1).intersection(glazing)
                if not joint.is_empty:m.face(joint,height-.22,'dorm-band')
            m.facade_bands(flat,[3.1] if height>6 else [height-.65],.12)
        else:
            if item.get('lowerLink'):
                link=item['lowerLink'];origin=flat.centroid
                # The two long wings and their low connecting hall are one
                # acquired outline. Split at its actual re-entrant corners,
                # sharing the very same boundary to avoid gaps or skew joints.
                lo_y,hi_y=[origin.y+v for v in link['betweenLocalY']]
                corner_y=[p[1] for p in flat.exterior.coords]
                lo_y=min(corner_y,key=lambda y:abs(y-lo_y))
                hi_y=min(corner_y,key=lambda y:abs(y-hi_y))
                auxiliary=flat.intersection(box(a-1,lo_y,c+1,hi_y)).buffer(0)
                flat=flat.difference(auxiliary).buffer(0)
                lh=link['displayRoofM']
                m.sides(auxiliary,0,lh,'dorm-glass');m.face(auxiliary,lh,'dorm-roof')
                rim=auxiliary.difference(auxiliary.buffer(-.22,join_style='mitre'))
                m.sides(rim,lh,lh+.26,'dorm-parapet');m.face(rim,lh+.26,'dorm-parapet')
                m.facade_bands(auxiliary,[3.2,lh-.2],.11)
            if fid in ['way/237808342','way/305829554','way/302556946','way/305829556']:
                # The four C-shaped dormitories have a lower auxiliary wing.
                # Its footprint is the existing rear spine, not a new corridor
                # or a guessed doorway. The lower height is image-proportioned.
                cross=flat.intersection(LineString([(a-1,(b+d)/2),(c+1,(b+d)/2)]))
                if not cross.is_empty:
                    segments=list(cross.geoms) if cross.geom_type=='MultiLineString' else [cross]
                    east=fid in ['way/237808342','way/305829556']
                    cross=sorted(segments,key=lambda segment:world(segment.centroid.x,segment.centroid.y)[0],reverse=east)[0]
                    x0,_,x1,_=cross.bounds
                    auxiliary=flat.intersection(box(x0-.02,b-1,x1+.02,d+1))
                    flat=flat.difference(auxiliary)
                    m.sides(auxiliary,0,7.7,'dorm-wall');m.face(auxiliary,7.7,'dorm-roof')
                    aux_rim=auxiliary.difference(auxiliary.buffer(-.3,join_style='mitre'))
                    m.sides(aux_rim,7.7,8.05,'dorm-parapet');m.face(aux_rim,8.05,'dorm-parapet')
                    m.facade_bands(auxiliary,[3.2,6.3],.11)
            m.sides(flat,0,height,'dorm-wall');m.face(flat,height,'dorm-roof')
            # The parapet follows the real asymmetric plan, including holes.
            parapet=flat.difference(flat.buffer(-.28,join_style='mitre'))
            m.sides(parapet,height,height+.5,'dorm-parapet');m.face(parapet,height+.5,'dorm-parapet')
            inset=flat.buffer(-1.1,join_style='mitre')
            m.face(inset,height+.025,'dorm-roof')
            levels=max(1,round(height/3))
            # The end walls stay masonry. Glazed ribbons and balcony slabs
            # belong to the long inhabited facades, rather than a uniform grid.
            def facade(a0,b0,z0,z1,material,offset=.045):
                a0=np.asarray(a0);b0=np.asarray(b0);edge=b0-a0
                normal=np.array([-edge[1],edge[0]])/np.linalg.norm(edge)
                aa=a0+normal*offset;bb=b0+normal*offset
                pts=[m.point(*aa,z0),m.point(*bb,z0),m.point(*bb,z1),m.point(*aa,z1)]
                m.parts.append({'material':material,'vertices':[pts[0],pts[1],pts[2],pts[0],pts[2],pts[3]]})
            for poly in (list(flat.geoms) if flat.geom_type=='MultiPolygon' else [flat]):
                poly=orient(poly,sign=-1)
                for ring in [poly.exterior,*poly.interiors]:
                    for aa,bb in zip(ring.coords,list(ring.coords)[1:]):
                        pa=np.asarray(aa);pb=np.asarray(bb);edge=pb-pa;length=np.linalg.norm(edge)
                        if length<7:continue
                        direction=edge/length;normal=np.array([-direction[1],direction[0]])
                        if length<21 and abs(direction[0])<.88:continue
                        edge_start=pa+direction*1.2;edge_end=pb-direction*1.2
                        south=normal[0]*u[1]+normal[1]*v[1]<-.6
                        balcony=item['group']=='lantian' or item['name'] in ['紫云1舍','紫云2舍','碧峰1舍','碧峰2舍']
                        for floor in range(levels):
                            z=3*floor
                            if balcony:
                                facade(edge_start,edge_end,z+.7,z+2.55,'dorm-window')
                                facade(pa,pb,z+2.6,z+2.74,'dorm-band',.10)
                            else:
                                for distance in np.arange(1.6,length-2.4,3.65):
                                    start=pa+direction*distance;end=start+direction*2.05
                                    facade(start,end,z+.75,z+2.5,'dorm-window')
                                    facade(start-direction*.08,end+direction*.08,z+2.48,z+2.57,'dorm-band',.06)
                            if balcony and south and floor>0:
                                slab=Polygon([pa,pb,pb+normal*.42,pa+normal*.42])
                                m.face(slab,z+.12,'dorm-parapet');m.sides(slab,z-.08,z+.12,'dorm-wall')
                        if balcony:
                            for distance in np.arange(1.2,length-.8,4.2):
                                start=pa+direction*distance;end=start+direction*.22
                                facade(start,end,.2,height-.24,'dorm-wall',.09)
            # Rectangular roof housings are visible in the sources. Positions
            # and sizes remain labelled cartographic approximations.
            strip_roof=item['name'].startswith(('紫云3','紫云4','紫云5','碧峰3','碧峰4','碧峰5'))
            if strip_roof:
                strip=box(a+(c-a)*.15,(b+d)/2-1.9,c-(c-a)*.15,(b+d)/2+1.9).intersection(inset)
                m.sides(strip,height+.025,height+.42,'dorm-wall');m.face(strip,height+.42,'dorm-roof')
                m.face(strip.difference(strip.buffer(-.16)),height+.45,'dorm-parapet')
            if not strip_roof:
                for roof in (list(inset.geoms) if inset.geom_type=='MultiPolygon' else [inset]):
                    if roof.is_empty:continue
                    ra,rb,rc,rd=roof.bounds
                    for x in ([ra+(rc-ra)*.28,ra+(rc-ra)*.73] if rc-ra>34 else [(ra+rc)/2]):
                        hood=box(x-2.6,(rb+rd)/2-4.2,x+2.6,(rb+rd)/2+4.2).intersection(roof)
                        if hood.area>7:
                            m.sides(hood,height+.03,height+1.0,'dorm-wall');m.face(hood,height+1.0,'dorm-roof')
                            m.face(hood.difference(hood.buffer(-.18)),height+1.05,'dorm-parapet')
        for part in m.parts:
            if part['material']=='mullion':part['material']='dorm-band'
        documented=item.get('documentedLevels')
        evidence=(f'已有明确{documented}层依据，米制屋高仍按层数估算。' if documented else '未取得精确屋高；体量按已查看官方鸟瞰与地面影像的层次比例概化。')
        basis=item['name']+'：'+evidence+'主体、低连接、院落与女儿墙分开。屋面小构件和立面节奏为概化，非构件测绘或室内导航；地面占地及原路网不变。'
        if alignment:basis+='同组平行关系按官方图和高德影像复核，显示轴采用原地面长边共同方向；仅作限定范围的轮廓修正，未将校园楼群转为正北朝向。'
        if item.get('lowerLink'):basis+=item['lowerLink']['basis']
        if fid in ['way/237808342','way/305829554','way/302556946','way/305829556']:
            basis+='较低辅楼有官方鸟瞰与新生指引支持；8米级屋面只是图像比例概化，不用整体六层资料把辅楼等高拉起。'
        model={'type':'authored-mesh','parts':m.parts,'heightM':height+(0 if is_hall else 1.05),'basis':basis,'family':'residential'}
        if is_hall and item.get('recordedPassage'):
            model['recordedPassage']={**item['recordedPassage'],'priorModelBasis':basis,'sourceGeometryChanged':False}
            model['basis']=item['name']+'：上层连通宿舍，底层按已记录的穿行通路留空。楼高、净空和柱位为示意。'
            model['groundIsProjection']=True
        models.append((fid,g,model,item))
    return models
