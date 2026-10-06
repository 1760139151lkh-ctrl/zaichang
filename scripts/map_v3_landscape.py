"""Reviewed landscape curves, separate from acquired ground and routing."""
import math
import numpy as np
from scipy.interpolate import CubicSpline
from shapely.geometry import Polygon,LineString
from map_v3_surfaces import soften_source_curve
from map_v3_landmarks import SurfaceParts


def landscape_curves(geometries):
    result=[]
    # The guide shows a straight western lawn edge and a curved eastern edge.
    # Interpolate only that sampled arc, retaining the two straight corners.
    fid='way/306105484';source=geometries[fid]
    q=np.asarray(source.exterior.coords)[:-1];arc=q[2:]
    s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(arc,axis=0),axis=1))]
    samples=np.unique(np.r_[s,np.arange(0,s[-1],.5)])
    curve=CubicSpline(s,arc,bc_type='natural',axis=0)(samples)
    garden=Polygon(np.vstack([q[:2],curve]))
    if not garden.is_valid or garden.boundary.hausdorff_distance(source.boundary)>1.5:
        raise ValueError('Reviewed Danqing lawn curve exceeded its source envelope')
    basis='官方鸟瞰可见丹青中央绿地沿弯道的弧边，西侧直边保留；只对原7点中东侧5点插值，最大偏离原折边1.5米以内。树木遮挡处不补画精确种植位置，原地面与路网独立保留。'
    result.append((fid,garden,basis))

    # This is the same physical bend. Shared junctions and all acquisition
    # vertices remain fixed, so the display cannot introduce a new connection.
    fid='way/305829541';source=geometries[fid];q=np.asarray(source.coords)
    arc=q[2:8];s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(arc,axis=0),axis=1))]
    samples=np.unique(np.r_[s,np.arange(0,s[-1],.5)])
    line=LineString(np.vstack([q[:2],CubicSpline(s,arc,bc_type='natural',axis=0)(samples),q[8:]]))
    if source.hausdorff_distance(line)>1.5 or garden.distance(line)<2.5:
        raise ValueError('Reviewed Danqing bend conflicts with its ground envelope')
    result.append((fid,line,'丹青绿地东侧的真实弯道：保留原共享路口和节点，只细化路口之间的弧段；路线计算仍按原记录折线。'))

    fid='way/306105483';source=geometries[fid]
    garden=soften_source_curve(source,1.4)
    result.append((fid,garden,'官方鸟瞰可见蓝田中央绿地两端的圆缓边界；保留长直边、原范围和内部记录步道，仅细化低角度采样折线。'))
    return result


def island_landscape(to_wgs):
    """Ground-level plazas visible in the reviewed official island crop.

    Pixel samples are on paving/shore edges, never roof corners. Their display
    interpretation does not create walkable edges or surveyed level changes.
    """
    bbox=(1865753.119972906,1976696.2238591146,1869546.194225722,1978972.0684108036)
    res=.37041740750148167;origin=(5644,2486)
    def ground(px,py):
        x=bbox[0]+(px+origin[0])*res
        y=(bbox[3]-(py+origin[1])*res)/math.cos(math.pi/4)
        return np.array([math.cos(math.pi/6)*x-.5*y-217000,.5*x+math.cos(math.pi/6)*y-3355200])
    basis='中心岛官方鸟瞰原图的可见地面铺装、水缘与露天剧场对应；仅地面边缘采样，未使用高处屋顶或阴影。地坪高差、座椅及台阶数量不是实测，细线只表达阶梯关系；不据此新增通路。'
    def paved_outline(points,start,end):
        q=np.array([ground(*p) for p in points]);arc=q[start:end+1]
        s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(arc,axis=0),axis=1))]
        samples=np.unique(np.r_[s,np.arange(0,s[-1],.5)])
        return Polygon(np.vstack([q[:start],CubicSpline(s,arc,bc_type='natural',axis=0)(samples),q[end+1:]]))
    amphitheatre=paved_outline([(512,811),(550,846),(558,884),(588,881),(605,893),(632,899),(654,893),(674,880),(676,869),(725,866),(760,822),(778,792),(743,792),(716,797),(677,798),(636,797),(595,799),(553,804)],3,8)
    waterfront=paved_outline([(782,648),(1007,695),(1018,723),(1045,738),(1002,764),(955,779),(899,787),(842,785),(790,778),(780,753),(764,730),(758,702),(765,673)],3,8)
    amphitheatre=soften_source_curve(amphitheatre,1.0)
    waterfront=soften_source_curve(waterfront,1.0)
    surfaces=[('island/amphitheatre',amphitheatre,'paving',basis),('island/waterfront',waterfront,'paving',basis)]
    marks=[]
    def arc(center,r,start,end):
        return LineString([center+np.array([math.cos(t),math.sin(t)])*r for t in np.linspace(math.radians(start),math.radians(end),121)])
    center=ground(632,867)
    surfaces.append(('island/amphitheatre-stage',Polygon([center+np.array([math.cos(t),math.sin(t)])*4.5 for t in np.linspace(0,2*math.pi,97)]),'stage',basis))
    for i,r in enumerate(np.linspace(13.8,26,12)):
        marks.append(('island/amphitheatre-step-'+str(i),arc(center,r,48,194)))
    for n,r in enumerate([29.2,33.4]):
        for k,(a,b) in enumerate([(55,91),(99,137),(145,183)]):
            g=arc(center,r,a,b).buffer(.95,cap_style='flat').intersection(amphitheatre)
            surfaces.append((f'island/amphitheatre-green-{n}-{k}',g,'garden',basis))
    pole=ground(852,675)
    for i,r in enumerate([17.5,22.5,28.0]):
        marks.append(('island/waterfront-terrace-'+str(i),arc(pole,r,208,343)))
    # The 30 m light tower and its 4 m globe above 21 m are described by the
    # architects. Ground position is sampled at its visible base, not its tip.
    from shapely.geometry import Point
    m=SurfaceParts(to_wgs)
    pedestal=Point(*pole).buffer(1.2,quad_segs=32);shaft=Point(*pole).buffer(.17,quad_segs=12)
    m.sides(pedestal,0,.25,'wall');m.face(pedestal,.25,'roof');m.sides(shaft,.25,30,'mullion')
    for z in [21.4,22.2,23.0,23.8,24.6]:
        r=math.sqrt(max(0,4-(z-23)**2));ring=Point(*pole).buffer(r,quad_segs=32).difference(Point(*pole).buffer(max(0,r-.045),quad_segs=32))
        m.face(ring,z,'mullion')
    return surfaces,marks,{'type':'authored-mesh','parts':m.parts,'heightM':30,'basis':basis+' 灯塔30米及21米以上直径4米灯球来自原设计论文；地面基点与构件为图像概化。'},pole
