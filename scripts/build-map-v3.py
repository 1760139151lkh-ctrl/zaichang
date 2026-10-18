"""Derive shared, traceable V3 geography and bounded access estimates.

Run after import-map-v2.mjs. No network, credentials, private profiles, or edits
to raw acquisitions. Routing lines stay source lines; only recorded segments
are subdivided at candidate projections, never at arbitrary visual crossings.
"""
from pathlib import Path
import json,math,hashlib,gzip,collections,re,csv,copy
from shapely.geometry import shape,Point,LineString,Polygon,MultiPolygon,mapping,box
from shapely.ops import transform,unary_union
from shapely.strtree import STRtree
from map_v3_coordinates import to_local,to_wgs,meters
from map_v3_surfaces import correct_semantics,court_details,fit_track,frame,rectangle,orthogonal_footprint,soften_source_curve,ellipse_from_source
from map_v3_teaching import teaching_models
from map_v3_pools import pool_complex_models
from map_v3_residential import residential_models
from map_v3_west import west_models
from map_v3_academic import academic_models
from map_v3_south import south_models
from map_v3_commons import commons_models
from map_v3_landscape import landscape_curves,island_landscape
from map_v3_shores import water_display_surface,named_water_display,geographic_water_surface
from map_v3_landmarks import crescent_model,library_complex_models,east_five_model,archives_model
from map_topology import merge_shared_boundary,geojson_right_hand_rule,nonzero_surface_vertices
from map_v3_building_supplement import supplemental_buildings
import numpy as np
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets/map-v2';PUBLIC=ROOT/'public/map-v2'
def read(p):return json.loads(p.read_text(encoding='utf8'))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':')),encoding='utf8')
def metric(g):return transform(lambda x,y,z=None:to_local(x,y),shape(g))
def geographic(g):
 if g.geom_type=='LinearRing':g=LineString(g.coords)
 return mapping(transform(lambda x,y,z=None:to_wgs(x,y),g))
def number(s):
 try:return float(str(s).replace('m','').strip())
 except (ValueError,TypeError):return 0.
def np_angles(a,b,n):return [a+(b-a)*i/n for i in range(n+1)]
def norm(s):
 for a,b in zip('一二三四五六七八九','123456789'):s=s.replace(a,b)
 s=re.sub(r'([东西北])教([0-9]+)',r'\1\2',s)
 return re.sub(r'浙江大学|紫金港校区|紫金港|教学楼|教学|号楼|宿舍|幢|舍|楼|[\s·（）()]','',s)
geography=read(PUBLIC/'geography.geojson');features=geography['features'];by_feature={f['id']:f for f in features}
places=read(ASSETS/'places.json');by_place={p['id']:p for p in places};graph=read(ASSETS/'network.json');manifest=read(ASSETS/'manifest.json')
reference=read(ASSETS/'official-coverage-reference.json')
raw=json.loads(gzip.decompress((ASSETS/'source.osm.json.gz').read_bytes()));raw_by={e['type']+'/'+str(e['id']):e for e in raw['elements']}
source_sha=hashlib.sha256((ASSETS/'source.osm.json.gz').read_bytes()).hexdigest()
for f in features:
 if f['properties'].get('kind')!='building' or f['geometry']['type']!='MultiPolygon':continue
 fixed,normalization=merge_shared_boundary(shape(f['geometry']))
 if normalization['result']=='NORMALIZED':
  source_relation=raw_by[f['id']]
  f['geometry']=mapping(fixed)
  f['properties']['sourceOutlineMembers']=[{'sourceId':m['type']+'/'+str(m['ref']),'role':m['role']} for m in source_relation['members'] if m['type']=='way' and m['role'] in ['outer','inner']]
geometries={f['id']:metric(f['geometry']) for f in features}
changes=[];crosswalk={};held=[];venues=[];detail=[]
fidelity=read(ASSETS/'fidelity-observations.json')
# Overview framing follows the acquired campus parcel. The acquisition/search
# envelope includes neighbourhoods; that envelope is not a campus view frame.
campus_frame=list(shape(by_feature['way/288874844']['geometry']).bounds)
manifest['campusBounds']=[campus_frame[0]-.00025,campus_frame[1]-.0002,campus_frame[2]+.00025,campus_frame[3]+.0002]
fidelity['campusOverview']={'sourceId':'way/288874844','bounds':manifest['campusBounds'],'purpose':'camera framing only; search, acquisition bounds and routing retained'}
south_observations=read(ASSETS/'south-architecture-observations.json')
redeveloped_sites=south_observations.get('redevelopedSites',[])
unverified_site_places={fid for site in redeveloped_sites for fid in [site['canonicalId'],*site['supersededSourceIds']]}
unverified_site_areas=[box(*site['oldAccessReviewBoundsM']) for site in redeveloped_sites]
unverified_site_ways=set()
site_official_ids={site['officialId'] for site in redeveloped_sites}
for site in redeveloped_sites:
 for fid in site['supersededSourceIds']:
  p=by_place.get(fid)
  if p:
   p['historicalReference']=True
   p['aliases']=[a for a in p['aliases'] if '生命科学研究交叉中心' not in a]
   if '生命科学研究交叉中心' in p['displayName']:p['displayName']='未命名旧图建筑记录'
for site,area in zip(redeveloped_sites,unverified_site_areas):
 fid='review/'+site['canonicalId'].replace('/','-')
 feature={'type':'Feature','id':fid,'properties':{'kind':'access-review-area','scope':'campus','accessReviewBasis':'这片楼群已重建，旧图内部通路和当前楼门仍待核实；可以明确另选外围道路点。'},'geometry':geographic(area)}
 features.append(feature);by_feature[fid]=feature;geometries[fid]=area
correct_semantics(features,by_place,fidelity,changes)
climbing_id='way/252088095'
climbing_basis='西田径场北侧户外攀岩与拓展场。原源sport=climbing，学校2016照片和2022报道确认岩壁/高空设施；整个场区不是一栋实体楼。具体设施的地面脚点和现状未完整取得，不虚构柱位、门或开放状态。'
by_feature[climbing_id]['properties'].update(name='攀岩与拓展场',factBasis=climbing_basis)
by_place[climbing_id].update(displayName='攀岩与拓展场',kind='facility',modelBasis=climbing_basis)
west_observations=read(ASSETS/'west-architecture-observations.json')
canonical_review=west_observations.get('silverReferenceModels',{}).get('canonicalCorrectionsForIntegration',[])
if not canonical_review:
 for section in west_observations.values():
  if isinstance(section,dict) and section.get('canonicalCorrectionsForIntegration'):
   canonical_review=section['canonicalCorrectionsForIntegration'];break
explicit_official={}
for reviewed in canonical_review:
 fid=reviewed['id']
 if fid not in by_place:continue
 p=by_place[fid];old=p['displayName'];p['displayName']=reviewed['name']
 p['aliases']=list(dict.fromkeys([*p.get('aliases',[]),*reviewed['aliases'],old]))
 if fid=='way/1502850911':p['aliases']=[a for a in p['aliases'] if norm(a) not in [norm('西区动物中心B座'),norm('西区动物中心C座')]]
 by_feature[fid]['properties'].update(name=reviewed['name'],factBasis=reviewed['reason'])
 for official_id in reviewed.get('officialIds',[]):explicit_official[official_id]=fid
 changes.append({'id':fid,'change':'Apply reviewed shared building identity.','basis':reviewed['reason']})
for reviewed in fidelity.get('reviewedReferenceLinks',[]):
 for oid in reviewed.get('official',[]):explicit_official[oid]=reviewed['id']
for water_record in fidelity.get('waterReview',{}).get('waters',[]):
 if water_record['id'] in by_place:by_place[water_record['id']]['waterBasis']=water_record['basis']
pool=by_feature.get('way/519369449')
if pool:
 pool['properties'].update(sourceBuilding=pool['properties'].get('building'),building='sports_hall',factBasis='浙江大学场馆介绍：游泳馆2020建成、2022投入使用；替代OSM保留的2018年construction标签。')
 changes.append({'id':pool['id'],'change':'Indoor pool is operational in the school facility record, not the stale 2018 construction status.','source':fidelity['sources']['officialFacilities']})

# The ring and football pitch have different identities, not competing centres.
venue_defs=[('way/161322822','西田径场','way/817997262',None),('relation/14296233','东田径场','way/817997263',None)]
redirects={'way/817997263':'relation/14296233','official/hotmap_221027.839':'way/161324040','official/legacy/917':'way/161324040','official/legacy/70000068':'way/322445520'}
redirects.update({'official/hotmap_221027.1160':'way/1462301204','official/legacy/1008661':'way/1462301204','official/hotmap_221027.1165':'way/1302813126','official/legacy/1008671':'way/1302813126'})
redirects.update({'official/legacy/1008629':'official/hotmap_221027.1161','official/legacy/1008631':'official/hotmap_221027.1162','official/legacy/1008625':'official/hotmap_221027.1163','official/legacy/100863732':'official/hotmap_221027.1260'})
redirects.update({'official/'+oid:fid for oid,fid in explicit_official.items()})
for reviewed in fidelity.get('reviewedReferenceLinks',[]):
 redirects.update({'official/legacy/'+old:reviewed['id'] for old in reviewed.get('legacy',[])})
redirects.update({'official/legacy/70000037':'official/hotmap_221027.70000037','official/legacy/70000038':'official/hotmap_221027.70000038'})
for site in redeveloped_sites:
 redirects.update({'official/legacy/'+old:site['canonicalId'] for old in site.get('legacyIds',[])})
for old,new in redirects.items():
 if new in by_place:by_place[new].setdefault('legacyIds',[]).append(old)
for track_id,name,pitch_id,area_id in venue_defs:
 track=by_feature[track_id];g=geometries[track_id];p=by_place[track_id];p['displayName']=name;p['aliases']=list(dict.fromkeys(p['aliases']+[name,'紫金港'+name]));p['kind']='facility'
 track['properties'].update(name=name,venueId=track_id,role='running-track' if any(poly.interiors for poly in (list(g.geoms) if g.geom_type=='MultiPolygon' else [g])) else 'running-venue',landmark=True)
 by_feature[pitch_id]['properties'].update(venueId=track_id,role='infield')
 if area_id and area_id in by_feature:
  by_feature[area_id]['properties'].update(role='venue-reference-area',venueId=track_id)
  if area_id in by_place:
   places.remove(by_place[area_id]);del by_place[area_id]
 # The centroid in the infield is a venue reference, never a surveyed entrance.
 center=geometries[pitch_id].representative_point();p['coordinate']=to_wgs(center.x,center.y)
 outer=max(list(g.geoms) if g.geom_type=='MultiPolygon' else [g],key=lambda x:x.area)
 loop=None
 if outer.interiors:
  inside=Polygon(outer.interiors[0]);widths=[Point(c).distance(inside.exterior) for c in outer.exterior.coords[:-1]]
  width=sorted(widths)[len(widths)//2];middle=Polygon(outer.exterior).buffer(-width/2,quad_segs=24)
  if middle.geom_type=='Polygon' and not middle.is_empty:loop=middle.exterior
 venue={'id':track_id,'name':name,'trackSource':track_id,'infieldSource':pitch_id,'entranceIds':[],'geometryVersion':manifest['version'],'nominalLapM':None,'laneCount':raw_by[track_id].get('tags',{}).get('lanes'),'loop':geographic(loop) if loop else None,'geometricLoopM':loop.length if loop else None,'lapBasis':'由OSM跑道内外沿推得的中间参考环线，非标准测量线、非认证圈长、非GPS实测' if loop else '路由地面数据只有场馆外轮廓和足球内场；显示内沿参考官方2022导览图，未用于圈长或跑道定位，不提供伪环线','markingBasis':'场线结构参照官方2022鸟瞰图与OSM场地类型；细线是示意，不用于尺寸测量'}
 venues.append(venue);changes.append({'id':track_id,'change':'Separate track ring, infield, and venue reference; retain source shape and holes.'})

# One geometry's semantic role survives naming. Unknown heights stay flat.
for f in features:
 p=f['properties'];p['sourceId']=f['id'];p.setdefault('role',p['kind'])
 if p['kind']=='building':
  h=number(p.get('height'));levels=number(p.get('levels'))
  p['heightM']=h if 0<h<250 else levels*3 if 0<levels<70 else 0
  p['volumeBasis']='source-height' if 0<h<250 else 'levels-estimate' if 0<levels<70 else 'footprint-only'
  p['minHeightM']=max(0,min(number(p.get('minHeight')),p['heightM']))
 if p['kind']=='land':
  p['role']='garden' if p.get('leisure') in ['garden','park'] or p.get('landuse') in ['grass','forest','meadow'] else 'ground'
 if f['id'] in by_place:
  by_place[f['id']]['volumeBasis']=p.get('volumeBasis');by_place[f['id']]['heightM']=p.get('heightM',0)

for observation in fidelity.get('reviewedBuildingHeights',[]):
 fid=observation['id'];p=by_feature[fid]['properties']
 p.update(heightM=observation['heightM'],volumeBasis=observation['basis'],heightBasis=observation['description'])
 if fid in by_place:by_place[fid].update(heightM=observation['heightM'],volumeBasis=observation['basis'])

# Ground playing surfaces and whole regulation-proportion linework.
detail,court_models=court_details(features,geometries,fidelity,geographic)

# Name correspondences are explicit. A nearby but contradictory name remains
# a separate official reference; no private home binding enters public files.
for r in reference['records']:
 if not isinstance(r.get('coordinate'),list) or len(r['coordinate'])!=2:
  held.append('wfs/'+r['officialId']);continue
 old='wfs/'+r['officialId'];mapped=explicit_official.get(r['officialId'],redirects.get(r.get('mappedPlaceId'),r.get('mappedPlaceId')));p=by_place.get(mapped)
 preserve_subplace=r['officialId'] in ['hotmap_221027.70000037','hotmap_221027.70000038'] or r['officialId'] in site_official_ids
 if preserve_subplace:p=None
 if p:
  exact=any(norm(n)==norm(r['name']) for n in [p['displayName'],*p.get('aliases',[])])
  close=geometries.get(mapped,Point(0,0)).distance(Point(to_local(*r['coordinate'])))<15
  if not exact and not close and r['officialId'] not in explicit_official:p=None
 if not p and not preserve_subplace:
  matches=[p for p in places if norm(p['displayName'])==norm(r['name']) and (meters(p['coordinate'],r['coordinate'])<75 or geometries.get(p['id'],Point(0,0)).distance(Point(to_local(*r['coordinate'])))<15)]
  p=matches[0] if len(matches)==1 else None
 if p:
  p.setdefault('officialIds',[]).append(old);p['aliases']=list(dict.fromkeys([*p.get('aliases',[]),r['name']]))
  crosswalk[old]={'id':p['id'],'basis':'public name/spatial correspondence','source':r['officialId'],'offsetM':round(meters(p['coordinate'],r['coordinate']),2)}
 else:
  pid='official/'+r['officialId'];p=by_place.get(pid)
  if not p:
   lon,lat=r['coordinate'];p={'id':pid,'displayName':r['name'],'aliases':[],'kind':'landmark','coordinate':[lon,lat],'bounds':[lon,lat,lon,lat],'entrances':[],'source':{'url':'https://map.zju.edu.cn/index','featureId':r['officialId'],'updatedAt':reference.get('retrievedAt')},'geometryStatus':'reference-point','officialIds':[old]}
   places.append(p);by_place[pid]=p
   f={'type':'Feature','id':pid,'properties':{'kind':'reference','name':r['name'],'role':'official-reference','sourceId':r['officialId'],'scope':'campus'},'geometry':{'type':'Point','coordinates':[lon,lat]}}
   features.append(f);by_feature[pid]=f;geometries[pid]=Point(to_local(lon,lat))
  crosswalk[old]={'id':pid,'basis':'official reference only; footprint not identified','source':r['officialId']};held.append(old)

# Preserve the locator's original stable IDs, including entries absent from
# the later WFS name export. A unique name AND nearby ground location bind;
# unresolved identities remain explicit point references instead of guesses.
with (ASSETS/'official-locator-source.tsv').open(encoding='utf8',newline='') as stream:
 legacy_rows=list(csv.DictReader(stream,delimiter='\t'))
for r in legacy_rows:
 old=r['id'];coord=to_wgs(float(r['e_m']),float(r['n_m']));names=[r['name'],*r['aliases'].split('|')];normalized={norm(n) for n in names if n}
 matches=[p for p in places if not p['id'].startswith('official/') and meters(p['coordinate'],coord)<90 and normalized.intersection(norm(n) for n in [p['displayName'],*p['aliases']])]
 p=matches[0] if len(matches)==1 else None
 explicit=redirects.get('official/legacy/'+old)
 for site in redeveloped_sites:
  if old in site.get('legacyIds',[]):explicit=site['canonicalId']
 if explicit in by_place:p=by_place[explicit]
 if p is None and r.get('generic')!='1':
  duplicates=[p for p in places if p['geometryStatus']=='reference-point' and norm(p['displayName'])==norm(r['name']) and meters(p['coordinate'],coord)<2]
  if len(duplicates)==1:p=duplicates[0]
 if p is None:
  pid='official/legacy/'+old;p={'id':pid,'displayName':r['name'],'aliases':[],'kind':'landmark','coordinate':coord,'bounds':[*coord,*coord],'entrances':[],'source':{'url':'https://map.zju.edu.cn/index','featureId':old},'geometryStatus':'reference-point'}
  places.append(p);by_place[pid]=p;f={'type':'Feature','id':pid,'properties':{'kind':'reference','name':r['name'],'role':'official-reference','sourceId':old,'scope':'campus'},'geometry':{'type':'Point','coordinates':coord}};features.append(f);by_feature[pid]=f;geometries[pid]=Point(to_local(*coord))
 p['aliases']=list(dict.fromkeys([*p['aliases'],*names]));p['officialIds']=list(dict.fromkeys([*p.get('officialIds',[]),old]));crosswalk[old]={'id':p['id'],'basis':'legacy official name and nearby ground location' if not p['id'].startswith('official/') else 'legacy official reference only; footprint not identified','source':'official-locator-source.tsv#'+old}

for p in places:
 p['scope']=by_feature.get(p['id'],{}).get('properties',{}).get('scope','campus')

# Endpoint projections: at most six distinct candidates within 80 metres,
# blocked by water, walls, unknown gates, and every other building footprint.
build_ids=[f['id'] for f in features if f['properties']['kind']=='building'];builds=[geometries[i] for i in build_ids];btree=STRtree(builds)
water=[geometries[f['id']] for f in features if f['properties']['kind']=='water'];wtree=STRtree(water)
water_lines=[geometries[f['id']] for f in features if f['properties']['kind']=='waterway' and f['properties'].get('tunnel') not in ('culvert','yes')]
wline_tree=STRtree(water_lines)
review_tree=STRtree(unverified_site_areas)
fences=[geometries[f['id']] for f in features if f['properties']['kind']=='barrier'];ftree=STRtree(fences)
node_by={n['id']:n for n in graph['nodes']};xy={n['id']:to_local(*n['coordinate']) for n in graph['nodes']}
gate_nodes=[(n['id'],Point(xy[n['id']])) for n in graph['nodes'] if n.get('barrier') and 'gate' in n['barrier']]
edge_shapes=[LineString([xy[e['from']],xy[e['to']]]) for e in graph['edges']];etree=STRtree(edge_shapes)
for edge in graph['edges']:
 tags=raw_by.get(edge['way'],{}).get('tags',{})
 conditional=[]
 if edge.get('gate'):conditional.append('gate_opening_unverified')
 # A roof is a physical property, not a pedestrian-access restriction.
 # Actual indoor ways, access restrictions and gates retain their own rules.
 if tags.get('indoor')=='yes':conditional.append('indoor_passage_unverified')
 line=LineString([xy[edge['from']],xy[edge['to']]])
 if any(line.intersection(area).length>.01 for area in unverified_site_areas):
  conditional.append('redeveloped_site_access_unverified');unverified_site_ways.add(edge['way'])
 edge['conditions']=conditional
splits=collections.defaultdict(list);candidate_count=0;rejected=collections.Counter()
for p in places:
 p['accessCandidates']=[]
 if p['id'] in unverified_site_places or any(area.covers(Point(to_local(*p['coordinate']))) for area in unverified_site_areas):
  p['geometryStatus']='reference-point'
  p['accessReviewBasis']='原温室片区已重建为生命科学研究交叉中心；旧图内部通路与当前楼门未核实，请另选外围道路参考点。'
  for entrance in p['entrances']:
   entrance['sourceConnected']=entrance['connected'];entrance['connected']=False
  continue
 known=[e for e in p.get('entrances',[]) if e['connected'] and e['id'] in node_by]
 for e in known:
  p['accessCandidates'].append({'id':'entrance/'+e['id'],'nodeId':e['id'],'kind':'entrance','name':e['name'],'coordinate':e['coordinate'],'meters':0,'coordinates':[e['coordinate']],'source':e['source'],'conditions':['gate_opening_unverified'] if node_by[e['id']].get('barrier','').endswith('gate') else []})
 # Known entrances define an entrance-to-entrance task. A missing building
 # instead exposes an explicitly estimated reference-to-road connection.
 if known or p['kind'] in ['water','area']:
  continue
 point=Point(to_local(*p['coordinate']));own={i for i in btree.query(point) if builds[int(i)].covers(point)}
 if p['id'] in build_ids:own.add(build_ids.index(p['id']))
 options=[]
 for i0 in etree.query(point.buffer(80)):
  i=int(i0);edge=graph['edges'][i];road=edge_shapes[i]
  if edge['conditions']:continue
  t=road.project(point,normalized=True);q=road.interpolate(t,normalized=True);distance=point.distance(q)
  if distance>80:continue
  connector=LineString([point,q]);blocked=False
  for j0 in wline_tree.query(connector):
   flow=water_lines[int(j0)]
   if connector.crosses(flow) or connector.intersection(flow).length>.1:
    blocked=True;rejected['open_waterway']+=1;break
  if blocked:continue
  for pool,tree,kind in [(unverified_site_areas,review_tree,'redeveloped_site'),(water,wtree,'water'),(fences,ftree,'fence'),(builds,btree,'building')]:
   for j0 in tree.query(connector):
    j=int(j0)
    if kind=='building' and j in own:continue
    overlap=connector.intersection(pool[j])
    if not overlap.is_empty and (kind=='fence' or overlap.length>0.01):blocked=True;rejected[kind]+=1;break
   if blocked:break
  if blocked or any(connector.distance(qg)<1.5 for _,qg in gate_nodes):continue
  options.append((distance,edge['id'],t,[q.x,q.y],i))
 chosen=[]
 for distance,edge_id,t,q,i in sorted(options):
  if any(math.dist(q,c[3])<3 for c in chosen):continue
  chosen.append((distance,edge_id,t,q,i))
  if len(chosen)==6:break
 for j,(distance,edge_id,t,q,i) in enumerate(chosen):
  edge=graph['edges'][i];nid=edge['from'] if t<1e-8 else edge['to'] if t>1-1e-8 else f'access/{p["id"]}/{j}'
  coord=to_wgs(*q)
  if nid not in node_by:
   node={'id':nid,'coordinate':coord};node_by[nid]=node;xy[nid]=q;splits[edge_id].append((t,nid))
  p['accessCandidates'].append({'id':f'estimate/{p["id"]}/{j}','nodeId':nid,'kind':'estimate','name':'路网接入估计','coordinate':coord,'meters':meters(p['coordinate'],coord),'coordinates':[p['coordinate'],coord],'source':edge['way'],'conditions':[],'stairs':edge.get('stairs',False)})
  candidate_count+=1
new_edges=[]
for edge in graph['edges']:
 chain=sorted([(0,edge['from']),*splits[edge['id']],(1,edge['to'])])
 for j,((a,u),(b,v)) in enumerate(zip(chain,chain[1:])):
  if u==v:continue
  new_edges.append({**edge,'id':edge['id']+f'@{j}' if splits[edge['id']] else edge['id'],'sourceEdge':edge['id'],'from':u,'to':v,'meters':max(1e-8,(b-a)*edge['meters'])})
graph['nodes']=list(node_by.values());graph['edges']=new_edges

# An honest recovery is a different destination on a recorded road, never a
# longer or obstacle-blind building connector. These references have no line
# to the building and do not represent a door. Only original source nodes on
# unrestricted walking edges qualify; unnamed projections are not new POIs.
road_nodes={};road_reference_points={}
for edge in graph['edges']:
 if edge.get('conditions') or edge.get('stairs') or edge.get('gate'):continue
 for nid in [edge['from'],edge['to']]:
  if str(nid).isdigit() and not node_by[nid].get('barrier') and 'node/'+nid not in by_place:
   road_nodes.setdefault(nid,edge.get('name') or '校园步道')
for p in list(places):
 if (p['kind']!='building' and p['id'] not in {site['canonicalId'] for site in redeveloped_sites}) or p.get('historicalReference') or p.get('scope')!='campus' or p.get('accessCandidates'):continue
 origin=to_local(*p['coordinate']);choices=[]
 for nid,name in road_nodes.items():
  q=Point(xy[nid]);distance=math.dist(origin,xy[nid])
  if any(area.covers(q) for area in unverified_site_areas):continue
  if distance>150 or btree.query(q,predicate='intersects').size or wtree.query(q,predicate='intersects').size:continue
  choices.append((distance,nid,name))
 selected=[]
 for distance,nid,name in sorted(choices):
  if any(math.dist(xy[nid],xy[old[1]])<18 for old in selected):continue
  selected.append((distance,nid,name))
  if len(selected)==6:break
 refs=[]
 for distance,nid,name in selected:
  rid='node/'+nid;coord=node_by[nid]['coordinate']
  if rid not in road_reference_points:
   road_reference_points[rid]={'id':rid,'displayName':name+' · 参考点','aliases':[],'kind':'node','scope':'campus','coordinate':coord,'bounds':[*coord,*coord],'entrances':[],'geometryStatus':'mapped','source':{'url':'https://www.openstreetmap.org/node/'+nid,'featureId':'node/'+nid},'roadReference':{'nodeId':nid,'roadName':name,'forPlaceIds':[]},'accessCandidates':[{'id':'road-point/'+nid,'nodeId':nid,'kind':'road-point','name':'已记录道路点','coordinate':coord,'coordinates':[coord],'meters':0,'source':'https://www.openstreetmap.org/node/'+nid,'conditions':[],'stairs':False}]}
  road_reference_points[rid]['roadReference']['forPlaceIds'].append(p['id'])
  refs.append({'id':rid,'straightM':round(distance,1)})
 if refs:p['nearbyRoadReferences']=refs
for rid,p in road_reference_points.items():
 places.append(p);by_place[rid]=p
 f={'type':'Feature','id':rid,'properties':{'id':rid,'kind':'route-reference','role':'recorded-road-reference','name':'','scope':'campus','sourceId':rid},'geometry':{'type':'Point','coordinates':p['coordinate']}}
 features.append(f);by_feature[rid]=f;geometries[rid]=Point(to_local(*p['coordinate']))
fidelity['roadReferenceRecovery']={'basis':'原路网节点的明确另选参考点，不是楼门或到楼的连接；无自动替换，无穿水接入线。排除重建片区内部点；另一端已选好时，按同图连通性筛选后最多显示两点。','maxNearbyReferenceMeters':150,'referenceDistance':'直线参考，不计入新路线，不表示可以直接走过去。','maxReferencesPerBuilding':6,'maxDisplayedReferencesPerEndpoint':2,'originalAccessPolicyUnchanged':True}

for venue in venues:
 p=by_place[venue['id']];venue['entranceIds']=[e['id'] for e in p['entrances']];venue['accessCandidateIds']=[e['id'] for e in p['accessCandidates']]

# Analytic athletic curves are display derivatives. Source road topology and
# original acquired polygons remain independent and reproducible.
display=copy.deepcopy(geography);curve_checks=[];outline_refinements=[]
for f in display['features']:
 if f['id']==climbing_id:f['properties'].update(kind='sport',role='outdoor-training-ground',displayBasis=climbing_basis)
 if f['id'] in unverified_site_ways:
  f['properties'].update(kind='source-history',displayBasis='重建片区内的旧源道路尚未核实，不当作当前可走的楼内通路显示。')
for f in display['features']:
 source=geometries.get(f['id']);kind=f['properties']['kind']
 if source is None or source.geom_type!='Polygon':continue
 if kind=='building':
  fixed,error=orthogonal_footprint(source)
  if error:
   f['geometry']=geographic(fixed);f['properties']['displayBasis']='近直角源轮廓的小幅描绘噪声校正，最大1.2米；地理原源、道路拓扑不变'
   outline_refinements.append({'id':f['id'],'kind':'orthogonal-source-refinement','maximumOffsetM':error})
  elif len(source.exterior.coords)>10:
   fixed=soften_source_curve(source,.65)
   if not fixed.equals_exact(source,0):
    f['geometry']=geographic(fixed);f['properties']['displayBasis']='曲线建筑的缓弯细分，直角与斜翼转折保留；原轮廓和路网不变'
    outline_refinements.append({'id':f['id'],'kind':'curved-building-contour','maximumOffsetM':round(source.boundary.hausdorff_distance(fixed.boundary),3)})
 elif kind=='water':
  fixed=soften_source_curve(source)
  if not fixed.equals_exact(source,0):
   f['geometry']=geographic(fixed);f['properties']['displayBasis']='水岸缓弯细分；明显折角保留，距原边界不超过0.7米；不是改造真实岸线'
   outline_refinements.append({'id':f['id'],'kind':'gentle-shore-curve','maximumOffsetM':round(source.boundary.hausdorff_distance(fixed.boundary),3)})
fidelity['landscapeCurves']=[]
for fid,ground,basis in landscape_curves(geometries):
 f=next(f for f in display['features'] if f['id']==fid)
 f['geometry']=geographic(ground);f['properties']['displayBasis']=basis
 fidelity['landscapeCurves'].append({'id':fid,'basis':basis,'sourceImageId':'6c9a7e8eac30f3d4','sourceBoundaryDifferenceM':round(geometries[fid].hausdorff_distance(ground),3),'routingGeometryChanged':False})
island_surfaces,island_marks,island_light,island_pole=island_landscape(to_wgs)
for fid,ground,role,basis in island_surfaces:
 display['features'].append({'type':'Feature','id':fid,'properties':{'kind':'land','role':role,'scope':'campus','displayBasis':basis},'geometry':geographic(ground)})
for fid,ground in island_marks:
 parent_id='island/amphitheatre' if fid.startswith('island/amphitheatre-step-') else 'island/waterfront' if fid.startswith('island/waterfront-terrace-') else None
 if parent_id is None:raise ValueError('Unmapped island detail: '+fid)
 detail.append({'type':'Feature','id':fid,'properties':{'kind':'landscape-step','parentId':parent_id},'geometry':geographic(ground)})
display['features'].append({'type':'Feature','id':'island/light-tower','properties':{'kind':'landscape-fixture','scope':'campus','surfaceModel':island_light},'geometry':geographic(Point(*island_pole))})
fidelity['islandLandscape']={'basis':island_light['basis'],'sources':['https://map.zju.edu.cn/index','https://www.mianfeiwendang.com/doc/7e3f675a6801dfc7fce86f35/2'],'sourceImageId':'6c9a7e8eac30f3d4','cropOrigin':[5644,2486],'groundSamplingOnly':True,'routingGeometryChanged':False}
observations=read(ASSETS/'venue-observations.json')
def observation_xy(p):
 x=observations['bbox'][0]+(p[0]+observations['cropOrigin'][0])*observations['resolution']
 y=(observations['bbox'][3]-(p[1]+observations['cropOrigin'][1])*observations['resolution'])/math.cos(math.pi/4)
 return [math.cos(math.pi/6)*x-.5*y-217000,.5*x+math.cos(math.pi/6)*y-3355200]
for observed in observations['venues']:
 source=geometries[observed['id']];venue=next(v for v in venues if v['id']==observed['id'])
 pitch=geometries[venue['infieldSource']]
 inner=Polygon(source.interiors[0]) if source.interiors else [observation_xy(p) for arc in observed['innerArcs'] for p in arc]
 outside,inside,fit=fit_track(Polygon(source.exterior),inner,pitch)
 band=outside.difference(inside)
 f=next(f for f in display['features'] if f['id']==observed['id']);f['geometry']=geographic(band)
 f['properties'].update(role='running-track',displayBasis=fidelity['tracks']['displayBasis'])
 pitch_feature=next(pf for pf in display['features'] if pf['id']==venue['infieldSource'])
 # The reviewed guide and overhead imagery show the two rectangular infields
 # sharing their own oval's centreline. The west source rectangle was displaced
 # laterally by metres, and the old mixed fit distorted the oval to contain it.
 # Keep acquired ground untouched; move the whole display/paint frame together.
 pu,pv,plo,phi,pa=frame(pitch);ta=math.radians(fit['axisDeg'])
 while ta-pa>math.pi/2:ta-=math.pi
 while ta-pa<-math.pi/2:ta+=math.pi
 axis=np.array([math.cos(ta),math.sin(ta)]);side=np.array([-axis[1],axis[0]])
 centre=np.array(fit['centerLocalM']);old_centre=np.array(pitch.centroid.coords[0])
 footprint=rectangle(centre,axis,side,*(phi-plo))
 pitch_feature['geometry']=geographic(footprint.intersection(inside))
 def reposition_paint(x,y,z=None):
  dx=np.asarray(x)-old_centre[0];dy=np.asarray(y)-old_centre[1]
  xx=dx*pu[0]+dy*pu[1];yy=dx*pv[0]+dy*pv[1]
  return centre[0]+axis[0]*xx+side[0]*yy,centre[1]+axis[1]*xx+side[1]*yy
 for paint in detail:
  if paint['id'].startswith(venue['infieldSource']+':'):
   paint['geometry']=geographic(transform(reposition_paint,metric(paint['geometry'])))
   paint['properties']['basis']+='; whole infield display frame aligned to its reviewed athletic oval'
 fit['infieldDisplayShiftM']=round(float(np.linalg.norm(centre-old_centre)),3)
 fit['infieldDisplayRotationDeg']=round(math.degrees(ta-pa),4)
 pitch_feature['properties']['displayBasis']='官方体育片区与高德卫星复核同场内场轴线；修正原足球矩形偏心，草地与场线一同对齐所属跑道，原地面、路网与认证尺寸不变。'
 # Starting extensions are separate apron pieces, never kinks in the oval.
 chute=Polygon([observation_xy(p) for p in observed['chute']]).difference(outside)
 for suffix,g,role in [('inner-ground',inside,'infield-surround'),('apron',chute,'track-apron')]:
  if not g.is_empty:display['features'].append({'type':'Feature','id':observed['id']+':'+suffix,'properties':{'kind':'sport','role':role,'venueId':observed['id'],'displayBasis':fidelity['tracks']['displayBasis']},'geometry':geographic(g)})
 curve_checks.append({'id':observed['id'],**fit,'sourceBoundaryDifferenceM':round(Polygon(source.exterior).boundary.hausdorff_distance(outside.boundary),3)})
 venue.update(nominalLapM=fidelity['tracks']['nominalLapM'],nominalLapBasis=fidelity['tracks']['nominalBasis'],displayBasis=fidelity['tracks']['displayBasis'],displaySourceImageId=observations['imageId'])
 lane=fidelity['tracks'].get('laneObservations',{}).get(observed['id'],{})
 venue['laneCount']=lane.get('laneCount');venue['laneBasis']=lane.get('basis','')
 paint_count=lane.get('laneCount') or fidelity['tracks']['schematicLaneCount']
 paint_basis=lane['basis'] if lane.get('laneCount') else fidelity['tracks']['schematicLaneBasis']
 venue.update(displayLaneCount=paint_count,displayLaneBasis=paint_basis)
 for lane_index in range(1,paint_count):
  outline=inside.buffer((fit['outerRadiusM']-fit['innerRadiusM'])*lane_index/paint_count,quad_segs=80).exterior
  detail.append({'type':'Feature','id':observed['id']+':lane-'+str(lane_index),'properties':{'kind':'track-lane','parentId':observed['id'],'basis':paint_basis,'representationBasis':'observed-count' if lane.get('laneCount') else 'cartographic-proxy'},'geometry':geographic(outline)})
 venue['markingBasis']='球场与外围缓冲区分离；场线按规则比例表达，具体涂线未实测。'+(f"分道按已记录的{lane['laneCount']}道图像依据表达。" if lane.get('laneCount') else fidelity['tracks']['schematicLaneBasis'])

# The air-supported tennis hall is an indoor venue, not one giant outdoor court.
for item in fidelity['indoorVenues']:
 f=next(f for f in display['features'] if f['id']==item['id']);g=geometries[item['id']]
 u,v,lo,hi,angle=frame(g,north=True);center=np.array([g.centroid.x,g.centroid.y]);size=hi-lo
 # A rounded membrane volume lies within the recorded sports parcel. Its
 # exact curvature is explicitly a simplified model, not an acquired 3D mesh.
 length,width=size*.92
 roof=Polygon([center+u*(length/2)*math.copysign(abs(math.cos(t))**.42,math.cos(t))+v*(width/2)*math.copysign(abs(math.sin(t))**.42,math.sin(t)) for t in np.linspace(0,2*math.pi,193)])
 f['geometry']=geographic(roof)
 f['properties']['surfaceModel']={'type':'air-dome','center':to_wgs(*center),'axisEnds':[to_wgs(*(center-u*length/2)),to_wgs(*(center+u*length/2))],'sideEnds':[to_wgs(*(center-v*width/2)),to_wgs(*(center+v*width/2))],'axisDeg':math.degrees(angle),'lengthM':float(length),'widthM':float(width),'heightM':item['heightM'],'basis':item['modelBasis']}
 f['properties']['role']='indoor-venue'
 if item['id'] in by_place:by_place[item['id']]['modelBasis']=item['modelBasis']

moon=next(f for f in display['features'] if f['id']=='way/411343683')
moon_ground,moon_model=crescent_model(geometries[moon['id']],to_wgs)
moon['geometry']=geographic(moon_ground);moon['properties']['surfaceModel']=moon_model
moon['properties']['displayBasis']=moon_model['basis']
by_place[moon['id']]['modelBasis']=moon_model['basis']
fidelity['landmarkModels']=[{'id':moon['id'],'basis':moon_model['basis'],'paperRecord':'https://caup-lab.tongji.edu.cn/69/ff/c10792a92671/page.htm','paperText':'https://www.mianfeiwendang.com/doc/7e3f675a6801dfc7fce86f35/2','sourceImage':'official cached guide and viewed Amap overhead imagery','routingGeometryChanged':False}]
gym=next(f for f in display['features'] if f['id']=='way/161417065')
gym_outline,c,u,v,length,width,angle=ellipse_from_source(geometries[gym['id']])
gym['geometry']=geographic(gym_outline)
gym_basis='体育馆：官方鸟瞰图可见圆形屋盖、中央透镜形屋面与放射分缝，平面由原地面轮廓拟合；14米沿用OSM源高度，檐高、曲率和分缝仅作概化，非精密建筑模型。'
gym['properties']['surfaceModel']={'type':'elliptical-roof','center':to_wgs(*c),'axisEnds':[to_wgs(*(c-u*length/2)),to_wgs(*(c+u*length/2))],'sideEnds':[to_wgs(*(c-v*width/2)),to_wgs(*(c+v*width/2))],'lengthM':length,'widthM':width,'lensRotationRad':math.radians(8.5)-angle,'heightM':14,'baseHeightM':8.5,'basis':gym_basis}
gym['properties']['displayBasis']=gym_basis;by_place[gym['id']]['modelBasis']=gym_basis
fidelity['landmarkModels'].append({'id':gym['id'],'basis':gym_basis,'sourceBoundaryDifferenceM':round(geometries[gym['id']].boundary.hausdorff_distance(gym_outline.boundary),3)})
for id,ground,model in library_complex_models(geometries,to_wgs):
 f=next(f for f in display['features'] if f['id']==id)
 f['geometry']=geographic(ground);f['properties']['surfaceModel']=model;f['properties']['displayBasis']=model['basis']
 by_place[id]['modelBasis']=model['basis']
 fidelity['landmarkModels'].append({'id':id,'basis':model['basis'],'routingGeometryChanged':False})

east5=next(f for f in display['features'] if f['id']=='way/232500019')
east5_ground,east5_model=east_five_model(geometries[east5['id']],to_wgs)
east5['geometry']=geographic(east5_ground);east5['properties']['surfaceModel']=east5_model;east5['properties']['displayBasis']=east5_model['basis']
by_place[east5['id']]['modelBasis']=east5_model['basis']
fidelity['landmarkModels'].append({'id':east5['id'],'basis':east5_model['basis'],'routingGeometryChanged':False})

for fid,ground,model,children in teaching_models(geometries,to_wgs):
 f=next(f for f in display['features'] if f['id']==fid)
 f['geometry']=geographic(ground);f['properties']['surfaceModel']=model;f['properties']['displayBasis']=model['basis']
 by_place[fid]['modelBasis']=model['basis']
 for child in children:
  part=next(p for p in display['features'] if p['id']==child)
  part['properties'].update(kind='building-part',displayParentId=fid,displayBasis='可见连接并入所属教学楼显示模型；原地面数据和对象ID仍保留')
 fidelity['landmarkModels'].append({'id':fid,'basis':model['basis'],'routingGeometryChanged':False,'displayParts':children})

for fid,ground,model in pool_complex_models(geometries,to_wgs):
 f=next(f for f in display['features'] if f['id']==fid)
 f['geometry']=geographic(ground);f['properties']['surfaceModel']=model;f['properties']['displayBasis']=model['basis']
 by_place[fid]['modelBasis']=model['basis']
 fidelity['landmarkModels'].append({'id':fid,'basis':model['basis'],'routingGeometryChanged':False})

# The residential review adds observed massing without replacing the public
# ground geometry, graph, private profile, or independently reviewed venues.
residential=read(ASSETS/'residential-observations.json')
fidelity['residentialObservations']=residential
residential_ground={f['id']:metric(f['geometry']) for f in display['features'] if f['properties']['kind']=='building'}
for item in residential['connectors']:
 if item.get('recordedPassage'):
  road_id=item['recordedPassage']['roadId'];residential_ground[road_id]=geometries[road_id]
for item in residential['bodies']:
 if item['group'] in residential.get('groupAlignment',{}):residential_ground[item['id']]=geometries[item['id']]
for fid,ground,model,item in residential_models(residential_ground,to_wgs,residential):
 f=next(f for f in display['features'] if f['id']==fid)
 basis='levels-estimate' if item.get('documentedLevels') else 'image-proportioned'
 f['geometry']=geographic(ground)
 f['properties'].update(surfaceModel=model,displayBasis=model['basis'],heightM=model['heightM'],volumeBasis=basis,modelFamily='residential',actualHeightM=None)
 by_feature[fid]['properties'].update(heightM=model['heightM'],volumeBasis=basis,heightBasis=model['basis'])
 p=by_place[fid];p.update(modelBasis=model['basis'],heightM=model['heightM'],volumeBasis=basis)
 if item in residential['connectors']:
  f['properties']['name']=item['name'];by_feature[fid]['properties']['name']=item['name'];p['displayName']=item['name'];p['aliases']=list(dict.fromkeys(p['aliases']+[item['name']]))
 fidelity['landmarkModels'].append({'id':fid,'basis':model['basis'],'sourceGroup':item['group'],'routingGeometryChanged':False})

for fid,ground,model,children in academic_models(geometries,to_wgs):
 f=next(f for f in display['features'] if f['id']==fid)
 f['geometry']=geographic(ground);f['properties'].update(surfaceModel=model,displayBasis=model['basis'],heightM=model['heightM'],volumeBasis='image-proportioned',modelFamily='east-academic',actualHeightM=None)
 by_feature[fid]['properties'].update(heightM=model['heightM'],volumeBasis='image-proportioned',heightBasis=model['basis'])
 by_place[fid].update(modelBasis=model['basis'],heightM=model['heightM'],volumeBasis='image-proportioned')
 for child in children:
  part=next(p for p in display['features'] if p['id']==child);part['properties'].update(kind='building-part',displayParentId=fid,displayBasis='原记录连接按实看形态并入同一楼栋显示；地面与路线仍保留原对象')
 fidelity['landmarkModels'].append({'id':fid,'basis':model['basis'],'routingGeometryChanged':False,'displayParts':children})

fidelity['southArchitectureObservations']=south_observations
for fid,ground,model,children in south_models(geometries,to_wgs,south_observations):
 f=next(f for f in display['features'] if f['id']==fid)
 basis='cartographic-proxy' if model.get('massingInterpretation') else 'image-proportioned'
 f['geometry']=geographic(ground);f['properties'].update(surfaceModel=model,displayBasis=model['basis'],heightM=model['heightM'],volumeBasis=basis,modelFamily='south-architecture',actualHeightM=None)
 # An artistic height module belongs to the display, never the ground facts.
 if basis!='cartographic-proxy':by_feature[fid]['properties'].update(heightM=model['heightM'],volumeBasis=basis,heightBasis=model['basis'])
 by_place[fid].update(modelBasis=model['basis'],heightM=model['heightM'],volumeBasis=basis)
 if model.get('groundFootprintKnown') is False:
  by_place[fid].update(groundFootprintKnown=False,positionAccuracyM=None)
  f['properties'].update(groundFootprintKnown=False,positionAccuracyM=None)
 for child in children:
  part=next(p for p in display['features'] if p['id']==child);part['properties'].update(kind='building-part',displayParentId=fid,displayBasis='原记录的同馆/相连部分归并显示；公共地点、地面与路网仍保留原ID')
  if child in unverified_site_places:
   part['properties']['displayBasis']='原温室记录与重建后楼体不再逐块对应；旧源保留，当前显示归整个生命科学研究交叉中心，未据旧片元拉高。'
   by_place[child]['modelBasis']=part['properties']['displayBasis']
 fidelity['landmarkModels'].append({'id':fid,'basis':model['basis'],'routingGeometryChanged':False,'displayParts':children})

fidelity['westArchitectureObservations']=west_observations
for fid,ground,model,children,levels in west_models(geometries,to_wgs):
 f=next(f for f in display['features'] if f['id']==fid)
 # Documented floor count and an image-proportioned roof stack are distinct.
 # A known six-storey building does not make every authored height 6*3 m.
 basis='image-proportioned'
 f['geometry']=geographic(ground)
 f['properties'].update(surfaceModel=model,displayBasis=model['basis'],heightM=model['heightM'],volumeBasis=basis,modelFamily='west-architecture',actualHeightM=None)
 by_feature[fid]['properties'].update(heightM=model['heightM'],volumeBasis=basis,heightBasis=model['basis'])
 by_place[fid].update(modelBasis=model['basis'],heightM=model['heightM'],volumeBasis=basis)
 if levels:
  f['properties']['documentedLevels']=levels;by_place[fid]['documentedLevels']=levels
 for child in children:
  part=next(p for p in display['features'] if p['id']==child)
  part['properties'].update(kind='building-part',displayParentId=fid,displayBasis='原记录建筑分件按实看组成并入同组显示；原地面与路网ID独立保留')
 fidelity['landmarkModels'].append({'id':fid,'basis':model['basis'],'routingGeometryChanged':False,'displayParts':children})

archive_id='way/895390958'
if by_feature[archive_id]['properties']['version']!=2:raise ValueError('Archive site source needs a new display review')
archive_ground,archive_model=archives_model(geometries[archive_id],to_wgs)
archive_display=next(f for f in display['features'] if f['id']==archive_id)
archive_display['geometry']=geographic(archive_ground)
archive_display['properties'].update(surfaceModel=archive_model,displayBasis=archive_model['basis'],heightM=archive_model['heightM'],volumeBasis='cartographic-proxy',modelFamily='context-landmark',actualHeightM=None,groundFootprintKnown=False)
by_place[archive_id].update(modelBasis=archive_model['basis'],heightM=archive_model['heightM'],volumeBasis='cartographic-proxy')
fidelity['archivesModel']={'id':archive_id,'sourceVersion':2,**archive_model['massingInterpretation']}

commons=read(ASSETS/'commons-observations.json')
fidelity['commonsObservations']=commons
display_geometries={f['id']:metric(f['geometry']) for f in display['features'] if f['properties']['kind'] in ['building','building-part']}
for fid,ground,model,item in commons_models(geometries,display_geometries,to_wgs,commons):
 f=next(f for f in display['features'] if f['id']==fid)
 f['geometry']=geographic(ground)
 f['properties'].update(surfaceModel=model,displayBasis=model['basis'],heightM=model['heightM'],volumeBasis='image-proportioned',modelFamily='campus-commons',actualHeightM=None)
 by_feature[fid]['properties'].update(heightM=model['heightM'],volumeBasis='image-proportioned',heightBasis=model['basis'])
 by_place[fid].update(modelBasis=model['basis'],heightM=model['heightM'],volumeBasis='image-proportioned')
 if item.get('name'):
  p=by_place[fid];p['aliases']=list(dict.fromkeys([*p.get('aliases',[]),p['displayName'],item['name']]))
  p['displayName']=item['name'];f['properties']['name']=item['name'];by_feature[fid]['properties']['name']=item['name']
 fidelity['landmarkModels'].append({'id':fid,'basis':model['basis'],'routingGeometryChanged':False})

display_observation={'basis':'reviewed source-ground construction','sourceImageId':observations['imageId'],'objects':[v['id'] for v in observations['venues']],'routingGeometryChanged':False,'sourceDate':observations['sourceDate'],'limitations':fidelity['tracks']['displayBasis']}
for f in display['features']:
 if f['properties']['kind']=='road':
  g=geometries[f['id']]
  for venue in venues:
   area=Polygon(geometries[venue['id']].exterior)
   if area.intersection(g).length>g.length*.75:f['properties']['displayRole']='venue-interior-road'
# Merge same-material authored patches before transport/draw. This changes
# batching only; it does not remove architectural detail or source geometry.
for f in display['features']:
 model=f['properties'].get('surfaceModel')
 if model and model.get('groundIsProjection'):f['properties']['groundIsProjection']=True
 if model and model.get('type')=='authored-mesh':
  materials={}
  for part in model['parts']:materials.setdefault(part['material'],[]).extend(part['vertices'])
  # Display meshes were carrying ~15-decimal geographic strings per vertex.
  # Millimetre-scale serialization is well below the image-derived precision
  # and reduces parse/IPC size without changing acquired ground or road data.
  for vertices in materials.values():
   for vertex in vertices:vertex[:]=[round(vertex[0],8),round(vertex[1],8),round(vertex[2],3)]
  # Serialization and collapsed roof poles can produce empty triangles.
  # Preserve every nonzero face, including narrow and open surfaces.
  for material,vertices in materials.items():
   materials[material]=nonzero_surface_vertices(vertices)
  model['parts']=[{'material':material,'vertices':vertices} for material,vertices in materials.items()]
display['features'].sort(key=lambda f:0 if f['properties'].get('role')=='infield-surround' else 1)
# Adjacent water polygons share one displayed surface; internal acquisition
# boundaries must not appear as dams or double shore lines. Identity and
# routing still use each original water feature.
island_paving=unary_union([g for _,g,role,_ in island_surfaces if role=='paving'])
water=unary_union([geometries[f['id']] for f in features if f['properties']['kind']=='water'])
fidelity['islandLandscape']['sourceWaterOverlapM2']=round(water.intersection(island_paving).area,2)
smooth,channel_records,road_margin_ids,shore_records,channel_policy=water_display_surface(
 features,geometries,fidelity['channelDisplay'],island_paving,soften_source_curve)
for record in channel_records:
 fid=record['id']
 rendered=next(f for f in display['features'] if f['id']==fid)
 rendered['properties'].update(kind='waterway',displayBasis=record['basis'],displayWidthM=record['illustrativeWidthM'],waterSurfaceId='display/water-surface')
fidelity['channelDisplay']['generated']=channel_records
fidelity['channelDisplay']['roadMarginIds']=road_margin_ids
fidelity['channelDisplay']['continuityPolicy']=channel_policy
if not smooth.is_empty:
 display['features'].append({'type':'Feature','id':'display/water-surface','properties':{'kind':'water-surface','role':'water-surface','displayBasis':'Union before shore refinement prevents false seams; no new connections or routing edges.'},'geometry':mapping(geographic_water_surface(smooth,to_wgs))})
 for source_water in [f for f in features if f['properties']['kind']=='water' and f['id'] in by_place and f['geometry']['type'] in ['Polygon','MultiPolygon']]:
  fid=source_water['id'];hit,shore=named_water_display(geometries[fid],smooth)
  for suffix,g,role in [('water-hit',hit,'named-water-hit'),('water-shore',shore,'named-water-shore')]:
   if not g.is_empty:display['features'].append({'type':'Feature','id':fid+':'+suffix,'properties':{'kind':role,'waterId':fid,'displayBasis':'Named identity on displayed water; shore emphasis excludes acquisition seams. Not a routing boundary.'},'geometry':mapping(geographic_water_surface(g,to_wgs))})

# Retain one generator and one public fact directory. Both applications consume
# this snapshot (and its explicit identity adapter), never hand-maintained twins.
for f in display['features']:
 if f['properties'].get('kind')!='building' or f['geometry']['type']!='MultiPolygon':continue
 fixed,normalization=merge_shared_boundary(shape(f['geometry']))
 if normalization['result']=='NORMALIZED':
  f['geometry']=mapping(fixed)
  f['properties']['sourceOutlineMembers']=by_feature[f['id']]['properties']['sourceOutlineMembers']
building_supplement=read(ASSETS/'building-supplement.json')
supplement_features,supplement_places,supplement_facts=supplemental_buildings(building_supplement,places)
features.extend(supplement_features);display['features'].extend(copy.deepcopy(supplement_features));places.extend(supplement_places)
manifest['attribution']='© OpenStreetMap contributors · Overture Maps Foundation · Qian Shi et al.'
with (ASSETS/'official-locator-source.tsv').open(encoding='utf8',newline='') as stream:
 legacy_references={r['id']:[float(r['e_m']),float(r['n_m'])] for r in csv.DictReader(stream,delimiter='\t')}
for old,coordinate in list(legacy_references.items()):legacy_references['official/legacy/'+old]=coordinate
# Normalize the completed exchange output before versioning. Mesh vertices,
# source acquisitions and model construction keep their own conventions.
for collection in [geography,display,{'features':detail}]:
 for f in collection['features']:f['geometry']=geojson_right_hand_rule(f['geometry'])
display_by_id={f['id']:f for f in display['features']}
for context in fidelity.get('placeSearchContexts',[]):
 for fid,name in context['members'].items():
  p=by_place[fid]
  p['aliases']=list(dict.fromkeys([*p.get('aliases',[]),*(prefix+name for prefix in context['prefixes'])]))
# Explicit illustrative volumes belong only to display and place descriptions.
# A later sourced height or authored model takes precedence over this proxy.
for observation in fidelity.get('displayVolumeProxies',[]):
 fid=observation['id'];p=display_by_id[fid]['properties']
 if p.get('surfaceModel') or p.get('heightM',0)>0:continue
 if p['kind']!='building' or observation['basis']!='cartographic-proxy':raise ValueError('Invalid display volume proxy: '+fid)
 p.update(heightM=observation['heightM'],volumeBasis='cartographic-proxy',actualHeightM=None,displayBasis=observation['description'])
 by_place[fid].update(heightM=observation['heightM'],volumeBasis='cartographic-proxy',modelBasis=observation['description'])
version='campus-v3-'+hashlib.sha256(json.dumps([features,places,graph,venues,crosswalk,redirects,detail,display,legacy_references,source_sha,fidelity,building_supplement],sort_keys=True).encode()).hexdigest()[:16]
graph['version']=version
for v in venues:v['geometryVersion']=version
volume_coverage=collections.Counter(display_by_id.get(f['id'],f)['properties'].get('volumeBasis') for f in features if f['properties']['kind']=='building')
manifest.update(version=version,implementation='campus-map/v3',buildings=sum(p['kind']=='building' for p in places),connectedEntrances=sum(e['connected'] for p in places for e in p['entrances']),selectable=len(places),features=len(features),nodes=len(graph['nodes']),edges=len(graph['edges']),routableBuildings=sum(p['kind']=='building' and bool(p['accessCandidates']) for p in places),estimatedAccessCandidates=candidate_count,sourceSha256=source_sha,sharedFacts='shared-facts.json',label='紫金港 · 已记录的周边',volumeCoverage=dict(volume_coverage))
manifest['limitations']=['公开源快照，不是实时开放或现场测绘。','实线沿已记录路网；虚线为80米内避障接入估计，非已确认的门或室内通路。','门禁/时段待核的条件路段默认排除；空白地面不推为通路。','体量区分源高度、层数估计、图像概化与制图示意；示意体量不代表实测高度或建筑用途，不提供室内导航。','学校资料记载东西田径场名义400米；显示曲线与参考环线不是认证测量线，不能用于精确跑道定位。']
facts={'schema':'zju-shared-facts/v3','version':version,'sourceSha256':source_sha,'sourceDate':manifest['sourceDate'],'coordinateSystem':{'geography':'EPSG:4326','order':['longitude','latitude'],'render':'EPSG:3857','locator':'EPSG:32651','originUtmM':[217000,3355200],'distance':'source haversine metres; candidate connector haversine metres','birdseye':'existing official fixed 30deg/45deg transform; no new raster fit'},'officialToCanonical':crosswalk,'legacyPlaceRedirects':redirects,'unmatchedOfficialIds':held,'venues':venues,'changes':changes,'accessPolicy':{'maxMeters':80,'maxCandidates':6,'minSeparationMeters':3,'unknownGates':'excluded by default','ownBuilding':'reference connector may cross own footprint, explicitly estimated','rejected':dict(rejected)}}
facts['originalLocatorReferences']=legacy_references
facts['displayInterpolation']=curve_checks
facts['displayObservations']=display_observation
facts['fidelityObservations']=fidelity
facts['buildingSupplement']=supplement_facts
facts['courtConstruction']=court_models
facts['outlineRefinements']=outline_refinements
facts['reviewedShoreDisplay']=shore_records
write(ASSETS/'network.json',graph);write(ASSETS/'shared-facts.json',facts);write(ASSETS/'sports-details.geojson',{'type':'FeatureCollection','features':detail});write(ASSETS/'geography.geojson',geography)
for folder in [ASSETS,PUBLIC]:
 write(folder/'places.json',places)
write(PUBLIC/'geography.geojson',geography);write(PUBLIC/'sports-details.geojson',{'type':'FeatureCollection','features':detail})
write(PUBLIC/'display-geography.geojson',display)
write(PUBLIC/'venues.json',venues)
write(ASSETS/'display-geography.geojson',display);write(ASSETS/'venues.json',venues)
manifest['componentHashes']={name:hashlib.sha256((ASSETS/name).read_bytes()).hexdigest() for name in ['places.json','network.json','geography.geojson','display-geography.geojson','sports-details.geojson','venues.json','shared-facts.json','building-supplement.json']}
for folder in [ASSETS,PUBLIC]:write(folder/'manifest.json',manifest)
print(json.dumps({'version':version,'places':len(places),'mappedOfficial':sum(not v['id'].startswith('official/') for v in crosswalk.values()),'heldReferences':len(held),'estimatedAccessCandidates':candidate_count,'routableBuildings':manifest['routableBuildings'],'knownEntranceBuildings':sum(p['kind']=='building' and any(e['connected'] for e in p['entrances']) for p in places),'sportMarkings':len(detail),'volumes':manifest['volumeCoverage'],'obstacleRejections':dict(rejected)},ensure_ascii=False))

