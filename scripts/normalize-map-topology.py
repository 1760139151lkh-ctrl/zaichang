"""Normalize current public source occupancy without rerunning image modelling.

Use --apply only after reviewing the full preview and source/member mapping.
No external references, private data or new geometry are acquired here.
"""
from pathlib import Path
import argparse,copy,datetime,gzip,hashlib,json,os,importlib.util
from shapely.geometry import shape,mapping
spec=importlib.util.spec_from_file_location('map_topology',Path(__file__).with_name('map_topology.py'))
topology=importlib.util.module_from_spec(spec);spec.loader.exec_module(topology)
merge_shared_boundary=topology.merge_shared_boundary

ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'assets/map-v2'
encode=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'))
sha=lambda x:hashlib.sha256(x if isinstance(x,bytes) else encode(x).encode('utf8')).hexdigest()
parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--report',required=True);args=parser.parse_args()
names=['manifest.json','geography.geojson','display-geography.geojson','places.json','network.json','shared-facts.json','venues.json','sports-details.geojson']
blobs={name:(ASSETS/name).read_bytes() for name in names};data={name:json.loads(blob) for name,blob in blobs.items()}
source_blob=(ASSETS/'source.osm.json.gz').read_bytes();raw=json.loads(gzip.decompress(source_blob));source={e['type']+'/'+str(e['id']):e for e in raw['elements']}
changes=[];blocked=[];tested=0
for name in ['geography.geojson','display-geography.geojson']:
    for f in data[name]['features']:
        if f['properties'].get('kind')!='building' or f['geometry']['type']!='MultiPolygon':continue
        tested+=1;before=copy.deepcopy(f['geometry']);geometry=shape(before);after,result=merge_shared_boundary(geometry)
        if result['result']=='BLOCKED':blocked.append({'layer':name,'feature_id':f['id'],**result})
        if result['result']!='NORMALIZED':continue
        original=source.get(str(f['id']))
        if not original or original['type']!='relation':raise ValueError('Normalization lacks original source relation: '+str(f['id']))
        members=[m for m in original['members'] if m['type']=='way' and m['role'] in ['outer','inner']]
        assert members and all('way/'+str(m['ref']) in source for m in members)
        f['geometry']=mapping(after)
        f['properties']['sourceOutlineMembers']=[{'sourceId':'way/'+str(m['ref']),'role':m['role']} for m in members]
        changes.append({'layer':name,'feature_id':f['id'],'before_geometry_hash':sha(before),'after_geometry_hash':sha(f['geometry']),
            'source_relation_version':original.get('version'),'source_relation_timestamp':original.get('timestamp'),
            'source_outline_members':f['properties']['sourceOutlineMembers'],**result})
# Identity fields missed by the old generator are independent of alignment.
parent_changes=[];known={str(f['id']) for f in data['display-geography.geojson']['features']}
legacy={**{f'island/amphitheatre-step-{n}':'island/amphitheatre' for n in range(12)},
        **{f'island/waterfront-terrace-{n}':'island/waterfront' for n in range(3)}}
for f in data['sports-details.geojson']['features']:
    if f['properties'].get('kind')=='landscape-step' and not f['properties'].get('parentId') and f['id'] in legacy:
        parent=legacy[f['id']];assert parent in known
        f['properties']['parentId']=parent;parent_changes.append({'feature_id':f['id'],'parent_id':parent})
report={'template_only':False,'executed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'input_hashes':{name:sha(blob) for name,blob in blobs.items()},'raw_source_sha256':sha(source_blob),
    'original_version':data['manifest.json']['version'],'tested_building_MultiPolygon_instances':tested,
    'geometry_changes':changes,'blocked_candidates':blocked,'parent_changes':parent_changes,
    'entity_ids_changed':False,'coordinates_moved_or_added':False,'height_or_mesh_changes':False,
    'physics_source_acceptance':'UNCHECKED','applied':False}
if args.apply and (changes or parent_changes):
    facts=data['shared-facts.json'];facts.setdefault('structuralNormalization',[]).append({'method':'exact shared boundary union, no snap or image fit','changes':changes,'identity_repairs':parent_changes,'source_sha256':sha(source_blob)})
    normalized=copy.deepcopy(data)
    normalized.pop('manifest.json');normalized['network.json'].pop('version',None);normalized['shared-facts.json'].pop('version',None)
    for venue in normalized['venues.json']:venue.pop('geometryVersion',None)
    for venue in normalized['shared-facts.json'].get('venues',[]):venue.pop('geometryVersion',None)
    version='campus-v3-'+sha(normalized)[:16]
    data['manifest.json']['version']=version;data['network.json']['version']=version;facts['version']=version
    for collection in [data['venues.json'],facts.get('venues',[])]:
        for venue in collection:venue['geometryVersion']=version
    bodies={name:encode(value).encode('utf8') for name,value in data.items() if name!='manifest.json'}
    data['manifest.json']['componentHashes']={name:sha(blob) for name,blob in bodies.items()}
    # Each file replacement is atomic; manifest is replaced last so readers
    # reject a mixed update rather than silently accepting partial new data.
    for name,blob in blobs.items():assert (ASSETS/name).read_bytes()==blob,('input changed',name)
    for name,blob in bodies.items():
        if blob==blobs[name]:continue
        p=ASSETS/name;temp=p.with_suffix(p.suffix+'.normalizing');temp.write_bytes(blob);os.replace(temp,p)
    p=ASSETS/'manifest.json';temp=p.with_suffix('.json.normalizing');temp.write_text(encode(data['manifest.json']),encoding='utf8');os.replace(temp,p)
    report.update(applied=True,new_version=version,output_hashes={name:sha((ASSETS/name).read_bytes()) for name in names})
out=Path(args.report);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(encode({'applied':report['applied'],'tested_instances':tested,'geometry_changes':len(changes),'parent_repairs':len(parent_changes),'blocked':len(blocked),'report':str(out),**({'version':report['new_version']} if report.get('new_version') else {})}))
