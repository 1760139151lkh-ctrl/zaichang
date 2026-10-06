"""Cartographic construction from reviewed ground features.

Source footprints are retained. Playing lines are complete inset rectangles,
never a clipped pattern stretched over an entire sports parcel. Rules supply
proportions, not a claim that campus paint was surveyed to those dimensions.
"""
import math
import numpy as np
from scipy.optimize import least_squares
from shapely.geometry import Polygon, LineString, Point
from shapely.affinity import translate


def frame(g, north=False, angle=None):
    q=np.asarray(g.minimum_rotated_rectangle.exterior.coords)[:4]
    edges=np.roll(q,-1,axis=0)-q
    if angle is None:
        angles=np.arctan2(edges[:,1],edges[:,0]);lengths=np.linalg.norm(edges,axis=1)
        base=math.atan2(np.sum(lengths*np.sin(4*angles)),np.sum(lengths*np.cos(4*angles)))/4
        choices=[base+k*math.pi/2 for k in range(4)]
        if north:angle=min(choices,key=lambda a:abs(math.atan2(math.sin(a-math.pi/2),math.cos(a-math.pi/2))))
        else:
            long=angles[np.argmax(lengths)]
            angle=min(choices,key=lambda a:abs(math.atan2(math.sin(a-long),math.cos(a-long))))
    u=np.array([math.cos(angle),math.sin(angle)]);v=np.array([-u[1],u[0]])
    coords=np.asarray(g.exterior.coords);uv=np.column_stack([coords@u,coords@v])
    return u,v,uv.min(axis=0),uv.max(axis=0),angle


def rectangle(center,u,v,length,width):
    return Polygon([center+u*a+v*b for a,b in [(-length/2,-width/2),(length/2,-width/2),(length/2,width/2),(-length/2,width/2)]])


def inset_playing(g,center,u,v,length,width):
    # Retain whole lines even for tapered runoff areas. No polygon clipping.
    for scale in np.linspace(1,.72,57):
        poly=rectangle(center,u,v,length*scale,width*scale)
        if g.buffer(-.18).covers(poly):return poly,float(scale)
    return None,0


def correct_semantics(features,by_place,observations,changes):
    by_id={f['id']:f for f in features}
    for item in observations.get('buildingIdentities',[]):
        f=by_id[item['id']];p=f['properties'];old=p.get('name','')
        p.update(sourceName=old,name=item['name'],factBasis=item['basis'])
        place=by_place.get(item['id'])
        if place:
            place.update(displayName=item['name'],aliases=item['aliases'])
            place['sourceCorrection']={'previousName':old,'basis':item['basis']}
        changes.append({'id':item['id'],'change':'Separate the actual building identity from conflicting source names.','basis':item['basis']})
    for item in observations['courtGroups']:
        f=by_id[item['id']];p=f['properties'];old=p.get('name','')
        p.update(sourceName=old,name=item['name'],sport=item['sport'],role='court-group',factBasis=item['basis'])
        place=by_place.get(item['id'])
        if place:
            aliases=item.get('aliases',[item['name']])
            if item['name'].startswith('安中'):aliases=[*aliases,'安中灯光'+('网球场' if item['sport']=='tennis' else '排球场')]
            place.update(displayName=item['name'],aliases=list(dict.fromkeys(aliases)))
            place['sourceCorrection']={'previousName':old,'basis':item['basis']}
        changes.append({'id':item['id'],'change':'Separate reviewed individual playing grounds from the enclosing sports parcel; retain source naming in provenance.','basis':item['basis']})
    for item in observations['indoorVenues']:
        f=by_id[item['id']];f['properties'].update(name=item['name'],role='indoor-venue',heightM=item['heightM'],volumeBasis='official-approximate-height',modelBasis=item['modelBasis'])
        p=by_place.get(item['id'])
        if p:p.update(displayName=item['name'],aliases=list(dict.fromkeys([*p.get('aliases',[]),*item['aliases']])),heightM=item['heightM'],volumeBasis='official-approximate-height')


def court_details(features,geometries,observations,geographic):
    result=[];models=[];groups={i['id']:i for i in observations['courtGroups']}
    courts=[f for f in features if f['properties']['kind']=='sport' and f['properties'].get('sport') in ['soccer','basketball','tennis','volleyball','badminton']]
    dims={'basketball':(28.,15.),'tennis':(23.77,10.97),'volleyball':(18.,9.),'badminton':(13.4,6.1),'soccer':(105.,68.)}

    def draw(fid,parent,sport,poly,scale=1,half=False,baseline_north=False,small_sided=False):
        props={'parentId':parent,'sport':sport,'basis':'reviewed ground parcel; regulation proportions fitted inside runoff, not surveyed paint','halfCourt':half}
        result.append({'type':'Feature','id':fid+':inlay','properties':{**props,'kind':'court-inlay'},'geometry':geographic(poly)})
        co=np.asarray(poly.exterior.coords)[:4];a,b,d=co[0],co[1],co[3]
        length=np.linalg.norm(b-a);width=np.linalg.norm(d-a)
        def at(x,y):return a+(b-a)*x/length+(d-a)*y/width
        def line(points,label,kind='marking'):
            result.append({'type':'Feature','id':fid+':'+label,'properties':{**props,'kind':kind},'geometry':geographic(LineString([at(x,y) for x,y in points]))})
        def arc(cx,cy,r,begin,end,label):line([(cx+r*math.cos(t),cy+r*math.sin(t)) for t in np.linspace(begin,end,49)],label)
        line([(0,0),(length,0),(length,width),(0,width),(0,0)],'boundary')
        if not half:line([(length/2,0),(length/2,width)],'middle','net' if sport in ('tennis','volleyball','badminton') else 'marking')
        if sport=='basketball':
            k=width/15
            if not half:arc(length/2,width/2,1.8*k,0,2*math.pi,'centre')
            ends=[(length,-1)] if half and baseline_north else [(0,1)] if half else [(0,1),(length,-1)]
            for n,(end,sign) in enumerate(ends):
                conv=lambda x,y:(end+sign*x*k,width/2+y*k)
                line([conv(0,-2.45),conv(5.8,-2.45),conv(5.8,2.45),conv(0,2.45)],'key'+str(n))
                line([conv(5.8+1.8*math.cos(t),1.8*math.sin(t)) for t in np.linspace(-math.pi/2,math.pi/2,37)],'free'+str(n))
                theta=math.asin(6.6/6.75);x=1.575+math.sqrt(6.75**2-6.6**2)
                line([conv(0,-6.6),conv(x,-6.6)],'corner-a'+str(n))
                line([conv(1.575+6.75*math.cos(t),6.75*math.sin(t)) for t in np.linspace(-theta,theta,61)],'three'+str(n))
                line([conv(x,6.6),conv(0,6.6)],'corner-b'+str(n))
                line([conv(1.2,-.9),conv(1.2,.9)],'backboard'+str(n),'equipment')
                line([conv(1.575+.225*math.cos(t),.225*math.sin(t)) for t in np.linspace(0,2*math.pi,25)],'hoop'+str(n),'equipment')
        elif sport=='tennis':
            for y in [width*(1.37/10.97),width*(9.60/10.97)]:line([(0,y),(length,y)],'singles'+str(y))
            for x in [length/2-6.4*scale,length/2+6.4*scale]:line([(x,width*1.37/10.97),(x,width*9.60/10.97)],'service'+str(x))
            line([(length/2-6.4*scale,width/2),(length/2+6.4*scale,width/2)],'service-centre')
        elif sport=='volleyball':
            for x in [length/2-3*scale,length/2+3*scale]:line([(x,0),(x,width)],'attack'+str(x))
        elif sport=='soccer':
            if small_sided:
                arc(length/2,width/2,3*scale,0,2*math.pi,'centre')
                for n,(end,sign) in enumerate([(0,1),(length,-1)]):
                    pts=[(end+sign*6*scale*math.cos(t),width/2-1.5*scale+6*scale*math.sin(t)) for t in np.linspace(-math.pi/2,0,25)]
                    pts.extend([(end+sign*6*scale,width/2+1.5*scale)])
                    pts.extend((end+sign*6*scale*math.cos(t),width/2+1.5*scale+6*scale*math.sin(t)) for t in np.linspace(0,math.pi/2,25))
                    line(pts,'penalty'+str(n))
                    line([(end,width/2-1.5*scale),(end-sign*1.5*scale,width/2-1.5*scale),(end-sign*1.5*scale,width/2+1.5*scale),(end,width/2+1.5*scale)],'goal'+str(n),'equipment')
                return
            k=min(length/105,width/68);arc(length/2,width/2,9.15*k,0,2*math.pi,'centre')
            for n,(end,sign) in enumerate([(0,1),(length,-1)]):
                for depth,w,label in [(16.5,40.32,'penalty'),(5.5,18.32,'goal-area')]:
                    line([(end,width/2-w*k/2),(end+sign*depth*k,width/2-w*k/2),(end+sign*depth*k,width/2+w*k/2),(end,width/2+w*k/2)],label+str(n))
                line([(end,width/2-3.66*k),(end-sign*1.6*k,width/2-3.66*k),(end-sign*1.6*k,width/2+3.66*k),(end,width/2+3.66*k)],'goal'+str(n),'equipment')

    for f in courts:
        g=geometries[f['id']];p=f['properties'];sport=p['sport']
        if g.geom_type!='Polygon' or g.area<60:continue
        if p.get('indoor')=='yes':continue
        if f['id'] in groups:
            group=groups[f['id']];u,v,lo,hi,angle=frame(g,north=group.get('axis')=='north')
            if group.get('axis')=='short':u,v,lo,hi,angle=frame(g,angle=angle+math.pi/2)
            if group.get('cells'):
                for i,cell in enumerate(group['cells']):
                    center=u*(lo[0]+cell['u']*(hi[0]-lo[0]))+v*(lo[1]+cell['v']*(hi[1]-lo[1]))
                    cu,cv=(v,-u) if cell.get('cross') else (u,v)
                    poly,scale=inset_playing(g,center,cu,cv,*cell['sizeM'])
                    if poly is not None:draw(f['id']+':pitch-'+str(i),f['id'],sport,poly,scale,small_sided=group.get('smallSided',False))
                p['role']='court-group';continue
            du=(hi[0]-lo[0])/group['rows'];dv=(hi[1]-lo[1])/group['columns']
            for row in range(group['rows']):
                for col in range(group['columns']):
                    center=u*(lo[0]+(row+.5)*du)+v*(lo[1]+(col+.5)*dv)
                    length,width=dims[sport];poly,scale=inset_playing(g,center,u,v,length,width)
                    if poly is not None:draw(f['id']+f':court-{row}-{col}',f['id'],sport,poly,scale)
            p['role']='court-group';continue
        contained=[c for c in courts if c['id']!=f['id'] and c['properties'].get('sport')==sport and geometries[c['id']].area<g.area/2 and g.covers(geometries[c['id']].representative_point())]
        if len(contained)>=2 or (sport in dims and g.area>dims[sport][0]*dims[sport][1]*3):
            p['role']='court-group';continue
        half=sport=='basketball' and str(p.get('hoops',''))=='1'
        # Four tapered southern parcels share the clearly recorded main-court
        # axis. Their longest edge can be transverse; it is not a court axis.
        north_group=f['id'] in ['way/'+str(i) for i in range(817997264,817997281)]
        u,v,lo,hi,angle=frame(g,north=north_group,angle=math.radians(98.74) if north_group else None)
        center=np.array([g.centroid.x,g.centroid.y])
        if sport=='soccer':length,width=np.minimum(hi-lo-np.array([.8,.8]),[105.,68.])
        else:length,width=dims[sport]
        if half:
            length=14.;center=u*(hi[0]-2-length/2)+v*((lo[1]+hi[1])/2)
        poly,scale=inset_playing(g,center,u,v,length,width)
        if poly is None:continue
        p['role']='court-runoff' if sport!='soccer' else p.get('role','infield')
        draw(f['id'],p.get('venueId',f['id']),sport,poly,scale,half,north_group)
        models.append({'id':f['id'],'halfCourt':half,'rotationDeg':round(math.degrees(angle),3),'playingScale':round(scale,3),'lineConstruction':'whole inset rectangle; no clipped lines'})
    return result,models


def fit_track(outer,inner,pitch):
    """Fit shared tangent straights and circular ends to source boundaries.

    A robust fit separates the surrounding apron from the athletic oval.
    Its radius is inferred from ground observations, never forced to 400 m.
    """
    u,v,lo,hi,angle=frame(pitch);center=np.array([outer.centroid.x,outer.centroid.y])
    op=np.array([outer.exterior.interpolate(t,normalized=True).coords[0] for t in np.linspace(0,1,200,endpoint=False)])
    ip=np.asarray(inner) if isinstance(inner,list) else np.array([inner.exterior.interpolate(t,normalized=True).coords[0] for t in np.linspace(0,1,160,endpoint=False)])
    # More observations do not give a source arbitrary extra influence.
    def residual(x):
        cx,cy,a,s,ri,ro=x;axis=np.array([math.cos(a),math.sin(a)]);side=np.array([-axis[1],axis[0]])
        def distances(points,r):
            d=points-np.array([cx,cy]);long=d@axis;cross=d@side
            return np.sqrt(np.maximum(np.abs(long)-s,0)**2+cross**2)-r
        # Fit the athletic boundary, independently of the separately traced
        # football rectangle. Its lateral source offset must not push a bend
        # or change the track width just to make the green rectangle fit.
        return np.r_[distances(op,ro)/math.sqrt(len(op)),distances(ip,ri)/math.sqrt(len(ip)),max(0,ri-ro+5)]
    x0=[*center,angle,43,37,48]
    fit=least_squares(residual,x0,bounds=([center[0]-8,center[1]-8,angle-.12,30,31,41],[center[0]+8,center[1]+8,angle+.12,57,43,54]),loss='soft_l1',f_scale=.45)
    cx,cy,a,s,ri,ro=fit.x;axis=np.array([math.cos(a),math.sin(a)]);c=np.array([cx,cy]);spine=LineString([c-axis*s,c+axis*s])
    inside=spine.buffer(ri,quad_segs=80);outside=spine.buffer(ro,quad_segs=80)
    return outside,inside,{'centerLocalM':[round(cx,3),round(cy,3)],'axisDeg':round(math.degrees(a),4),'halfStraightM':round(s,3),'innerRadiusM':round(ri,3),'outerRadiusM':round(ro,3),'fitRmsM':round(float(np.sqrt(np.mean(residual(fit.x)**2)*len(op))),3),'purpose':'display only; not a certified measuring line'}


def orthogonal_footprint(poly,max_shift=1.2,angle=None,angular_tolerance=4):
    """Regularise only an already orthogonal source; keep genuinely angled wings.

    Hole rings use the same axis, and a bounded edit cannot change topology.
    This corrects small tracing noise, not unusual real architecture.
    """
    u,v,_,_,_=frame(poly,angle=angle);rings=[poly.exterior,*poly.interiors];output=[]
    for ring in rings:
        xy=np.array(ring.coords)[:-1];q=np.column_stack([xy@u,xy@v]);count=len(q)
        parents=[list(range(count)),list(range(count))]
        def root(axis,i):
            while parents[axis][i]!=i:i=parents[axis][i]
            return i
        for i in range(count):
            j=(i+1)%count;delta=q[j]-q[i]
            if np.linalg.norm(delta)<.05:return poly,None
            axis=0 if abs(delta[0])<abs(delta[1]) else 1
            if abs(delta[axis])/max(abs(delta[1-axis]),1e-6)>math.tan(math.radians(angular_tolerance)):return poly,None
            parents[axis][root(axis,j)]=root(axis,i)
        for axis in range(2):
            groups={}
            for i in range(count):groups.setdefault(root(axis,i),[]).append(i)
            for ids in groups.values():q[ids,axis]=np.mean(q[ids,axis])
        output.append([(u*a+v*b).tolist() for a,b in q])
    fixed=Polygon(output[0],output[1:])
    if angle is not None:
        fixed=translate(fixed,poly.centroid.x-fixed.centroid.x,poly.centroid.y-fixed.centroid.y)
    shift=poly.boundary.hausdorff_distance(fixed.boundary)
    if fixed.is_valid and abs(fixed.area/poly.area-1)<.03 and .02<shift<=max_shift:return fixed,round(shift,3)
    return poly,None


def gentle_ring(ring,max_offset=.7):
    """Round low-angle sampled curves while retaining corners and long edges."""
    ps=np.array(ring.coords)[:-1];out=[]
    for i,p in enumerate(ps):
        before=ps[i-1];after=ps[(i+1)%len(ps)];a=p-before;b=after-p;la=np.linalg.norm(a);lb=np.linalg.norm(b)
        if min(la,lb)<.2:out.append(p.tolist());continue
        turn=math.acos(float(np.clip(np.dot(a,b)/(la*lb),-1,1)))
        if not math.radians(2)<turn<math.radians(48):out.append(p.tolist());continue
        distance=min(la*.38,lb*.38,8,max_offset/max(math.sin(turn/2),.01)*1.7)
        start=p-a/la*distance;end=p+b/lb*distance
        for t in np.linspace(0,1,max(5,math.ceil(2*distance/.6))):out.append(((1-t)**2*start+2*(1-t)*t*p+t*t*end).tolist())
    return out+[out[0]]


def soften_source_curve(poly,max_offset=.7):
    out=Polygon(gentle_ring(poly.exterior,max_offset),[gentle_ring(r,max_offset) for r in poly.interiors])
    if out.is_valid and poly.boundary.hausdorff_distance(out.boundary)<=max_offset and abs(out.area/poly.area-1)<.02:return out
    return poly


def ellipse_from_source(poly):
    points=np.asarray(poly.exterior.coords)[:-1];u,v,lo,hi,angle=frame(poly);center=np.array([poly.centroid.x,poly.centroid.y]);radii=(hi-lo)/2
    def residual(x):
        cx,cy,a,b,t=x;q=points-[cx,cy];xx=q@np.array([math.cos(t),math.sin(t)]);yy=q@np.array([-math.sin(t),math.cos(t)])
        return (np.sqrt((xx/a)**2+(yy/b)**2)-1)*math.sqrt(a*b)
    fit=least_squares(residual,[*center,*radii,angle],bounds=([center[0]-4,center[1]-4,radii[0]*.8,radii[1]*.8,angle-math.pi/2],[center[0]+4,center[1]+4,radii[0]*1.2,radii[1]*1.2,angle+math.pi/2]))
    cx,cy,a,b,t=fit.x;u=np.array([math.cos(t),math.sin(t)]);v=np.array([-u[1],u[0]]);c=np.array([cx,cy])
    ring=Polygon([c+u*a*math.cos(phi)+v*b*math.sin(phi)for phi in np.linspace(0,2*math.pi,257)])
    return ring,c,u,v,float(a*2),float(b*2),float(t)
