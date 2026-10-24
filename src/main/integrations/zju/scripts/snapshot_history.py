"""Compare complete saved observations without inventing publication timestamps."""
import json
from pathlib import Path
from complete_data import load_bundle,credential_filtered
from client import QueryError,fingerprint
from student_query import resource_rows,coverage
from academic_models import ZONE
import datetime as dt
import vault
import copy


VOLATILE={'source_ref','source_refs','collected_at','created_at','fetched_at','evaluated_at','lastUpdateTime',
          'minutes_from_now','ongoing','ended','_resource'}


def history(limit=10,offset=0):
    if not 1<=limit<=100:raise QueryError('INVALID_LIMIT','limit 为 1–100。')
    if offset<0:raise QueryError('INVALID_LIMIT','offset 不能为负数。')
    account=fingerprint(vault.credentials()['username']);items=[]
    folder=vault.state_dir()/'datasets'
    if folder.exists():
        for file in folder.glob('*.dpapi'):
            b=load_bundle(file.stem)
            if b.get('account_scope')!=account:continue
            items.append({'bundle_id':file.stem,'created_at':b.get('created_at'),'kind':b.get('kind'),
                'semester_id':b.get('normalized',{}).get('semester_id'),'endpoint':b.get('dataset',{}).get('endpoint')})
    items.sort(key=lambda x:x['created_at'] or '',reverse=True)
    return {'status':'ok','total':len(items),'items':items[offset:offset+limit],'next_offset':offset+limit if offset+limit<len(items) else None,'note':'These are saved observations, not server publication times.'}


def clean(value):
    if isinstance(value,dict):return {k:clean(v) for k,v in value.items() if k not in VOLATILE}
    if isinstance(value,list):return [clean(v) for v in value]
    return value


def identity(row):
    for key in ('uid','id','key','activity_id','course_id','policy','semester_id'):
        if row.get(key) is not None:return key+':'+str(row[key])
    return 'content:'+fingerprint(clean(row))


def diff(old_id,new_id,resource='grades',fields=None,limit=5,offset=0):
    if not 1<=limit<=100:raise QueryError('INVALID_LIMIT','limit 为 1–100。')
    if offset<0:raise QueryError('INVALID_LIMIT','offset 不能为负数。')
    old,new=load_bundle(old_id),load_bundle(new_id)
    if not old.get('account_scope') or old.get('account_scope')!=new.get('account_scope'):
        raise QueryError('ACCOUNT_SCOPE_MISMATCH','不能混合不同账号或归属未确认的数据集。')
    if resource in ('classes','courses','holidays') and old.get('normalized',{}).get('semester_id')!=new.get('normalized',{}).get('semester_id'):
        raise QueryError('INCOMPARABLE_SCOPE','两个快照的学期不同；不能把另一学期的课当作新增或删除。')
    from academic_service import normalize_academic
    for bundle in (old,new):
        if bundle.get('kind')=='academic' and 'timetable_first' in bundle.get('datasets',{}):
            current=bundle['normalized']
            bundle['normalized']=normalize_academic(copy.deepcopy(bundle['datasets']),current.get('calendar'),current['semester_id'])
    now=dt.datetime.now(ZONE)
    a=resource_rows(old,resource,now);b=resource_rows(new,resource,now)
    oldmap={identity(r):r for r in a};newmap={identity(r):r for r in b}
    if len(oldmap)!=len(a) or len(newmap)!=len(b):
        raise QueryError('AMBIGUOUS_RECORD_ID','记录ID重复，不能可靠地把变化归到某一条；请先查完整记录。')
    def selected(r):return {k:r.get(k) for k in fields} if fields else clean(r)
    added=[{'key':k,'after':selected(newmap[k])} for k in newmap.keys()-oldmap.keys()]
    gone=[{'key':k,'before':selected(oldmap[k])} for k in oldmap.keys()-newmap.keys()]
    changed=[]
    for key in oldmap.keys()&newmap.keys():
        before,after=selected(oldmap[key]),selected(newmap[key])
        if before!=after:changed.append({'key':key,'changed_fields':sorted(k for k in set(before)|set(after) if before.get(k)!=after.get(k)),'before':before,'after':after})
    for rows in (added,gone,changed):rows.sort(key=lambda r:r['key'])
    complete=coverage(old,[resource],None,None)['complete'] and coverage(new,[resource],None,None)['complete']
    redactions=[]
    return {'status':'ok' if complete else 'partial','resource':resource,'from_bundle':old_id,'to_bundle':new_id,
        'observation_interval':{'from':old.get('created_at'),'to':new.get('created_at')},
        'counts':{'newly_observed':len(added),'no_longer_observed':len(gone),'changed':len(changed)},
        'changes':credential_filtered({'newly_observed':added[offset:offset+limit],'no_longer_observed':gone[offset:offset+limit],'changed':changed[offset:offset+limit]},redactions),
        'next_offsets':{k:offset+limit if offset+limit<len(v) else None for k,v in [('newly_observed',added),('no_longer_observed',gone),('changed',changed)]},
        'source_completeness_sufficient':complete,'display_limit_per_kind':limit,'credential_redactions':redactions,
        'comparison_policy':'academic snapshots are normalized with current code before comparison; calendar/configuration changes may also affect derived views',
        'meaning':'Only changes between saved observations. No-longer-observed does not prove deletion; the exact upstream change time is unknown.'}
