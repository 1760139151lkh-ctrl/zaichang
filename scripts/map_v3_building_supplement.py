"""Reviewed open roofprints with explicit, unmeasured display volumes."""
import copy
from shapely.geometry import shape
from shapely.ops import transform
from map_v3_coordinates import to_local,meters
from map_topology import geojson_right_hand_rule


def supplemental_buildings(supplement,places):
    if supplement['schema']!='campus-building-supplement/v1':
        raise ValueError('Unknown building supplement schema')
    source=supplement['source'];policy=supplement['display']
    if source['coordinateSystem']!='OGC:CRS84':
        raise ValueError('Building supplement requires an explicit longitude/latitude frame')
    features=[];points=[];members=[]
    road_points=[p for p in places if p.get('roadReference')]
    basis='开放资料中的建筑轮廓；体量为示意，实高、楼号与入口待核。'
    for original in supplement['features']:
        geometry=geojson_right_hand_rule(original['geometry'])
        polygon=shape(geometry)
        if polygon.is_empty or polygon.geom_type not in ('Polygon','MultiPolygon'):
            raise ValueError('A building roofprint must contain a polygon')
        metric=transform(to_local,polygon)
        corners=list(metric.minimum_rotated_rectangle.exterior.coords)
        width=min(((b[0]-a[0])**2+(b[1]-a[1])**2)**.5 for a,b in zip(corners,corners[1:]))
        main=metric.area>=policy['mainMinimumAreaM2'] and width>=policy['mainMinimumWidthM']
        height=policy['mainHeightM'] if main else policy['ancillaryHeightM']
        fid='overture/'+original['id']
        position=list(polygon.representative_point().coords[0])
        properties={'id':fid,'sourceId':original['id'],'sourceKind':'overture',
            'kind':'building','role':'building','scope':policy['scope'],'name':'',
            'supplementAreaId':policy['areaId'],'outlineMeaning':'roofprint',
            'groundFootprintKnown':False,'actualHeightM':None,
            'heightM':height,'volumeBasis':'cartographic-proxy','heightBasis':basis}
        features.append({'type':'Feature','id':fid,'geometry':geometry,'properties':properties})
        nearby=sorted(((meters(position,p['coordinate']),p['id']) for p in road_points))
        points.append({'id':fid,'displayName':'未命名建筑','aliases':[],
            'kind':'building','scope':policy['scope'],'coordinate':position,
            'bounds':list(polygon.bounds),'entrances':[],'accessCandidates':[],
            'nearbyRoadReferences':[{'id':pid,'straightM':distance} for distance,pid in nearby[:4] if distance<=150],
            'source':{'url':source['url'],'featureId':original['id'],'version':original['properties']['version']},
            'geometryStatus':'mapped','volumeBasis':'cartographic-proxy',
            'heightM':height,'modelBasis':basis})
        members.append({'id':fid,'sourceId':original['id'],'displayHeightM':height,
            'heightBasis':'cartographic-proxy','actualHeightM':None,'groundFootprintKnown':False})
    if len({f['id'] for f in features})!=len(features):
        raise ValueError('Repeated building supplement identity')
    return features,points,{'source':copy.deepcopy(source),'displayPolicy':copy.deepcopy(policy),'members':members}
