"""Small JSON CLI: catalogue, doctor, credentials, auth, query, snapshot."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time

from client import Client, QueryError, Transport, bounded, build_request, checked_params, extract, fingerprint
import vault

ROOT=Path(__file__).resolve().parent.parent
REGISTRY=json.loads((ROOT/'references/endpoints.json').read_text(encoding='utf8'))
ENDPOINTS={e['id']:e for e in REGISTRY['endpoints']}


def now():return datetime.now(timezone.utc).isoformat()
def credential_client():
    try:c=vault.credentials()
    except RuntimeError as e:
        code=str(e) if str(e) in ('CREDENTIALS_REQUIRED','WINDOWS_DPAPI_REQUIRED','DPAPI_FAILED') else 'VAULT_ERROR'
        raise QueryError(code,'请先通过本机凭据窗口保存账号；不要在聊天或命令参数中填写密码。')
    return Client(c['username'],c['password'])


def endpoint(id):
    if id not in ENDPOINTS:raise QueryError('UNKNOWN_ENDPOINT','未登记的接口；先运行 catalog。')
    return ENDPOINTS[id]


def params_from_args(values):
    result={}
    for v in values:
        if '=' not in v:raise QueryError('INVALID_PARAMETER','参数格式为 --param 名称=值。')
        k,value=v.split('=',1)
        if k in result:raise QueryError('INVALID_PARAMETER','同一参数不能重复。')
        result[k]=value
    return result


def authorize_course(client,e,params):
    if e['scope'] not in ('own_course','own_classroom_course'):return
    course=str(params['course_id'])
    parent=ENDPOINTS['courses.list' if e['scope']=='own_course' else 'classroom.courses']
    for page in range(1,6):
        raw=client.fetch(parent,{},100,page)
        rows,_=extract(raw,parent['extract'])
        if not isinstance(rows,list):raise QueryError('SCHEMA_MISMATCH','我的课程列表结构发生变化。')
        if any(isinstance(r,dict) and str(r.get('id',r.get('Id')))==course for r in rows):return
        if len(rows)<100:break
    raise QueryError('COURSE_SCOPE_UNCONFIRMED','课程 ID 未在本人的课程列表中确认；不会猜测或遍历其他课程。')


def apply_changes(account,e,params,page,limit,records,store=vault):
    key=fingerprint({'account':account,'endpoint':e['id'],'params':params,'page':page,'limit':limit,'version':1})
    filename='snapshots/'+key+'.dpapi'
    current=Counter(fingerprint(r) for r in records)
    old=store.load(filename)
    result={'kind':'initial' if old is None else 'comparison','scope':'returned_page_only',
        'previous_at':None if old is None else old['at'],
        'added_or_changed':0 if old is None else sum((current-Counter(old['hashes'])).values()),
        'no_longer_in_returned_page':0 if old is None else sum((Counter(old['hashes'])-current).values()),
        'note':'分页移动、排序变化或限量会改变比较结果；不表示全账户新增或删除。'}
    store.save(filename,{'at':now(),'hashes':dict(current)})
    return result


def query(client,id,params=None,limit=10,page=1,changes=False):
    e=endpoint(id);params=params or {}
    build_request(e,params,limit,page) # Validate before authentication/network.
    params=checked_params(e,params)
    authorize_course(client,e,params)
    if hasattr(client.net,'deadline'):client.net.deadline=time.monotonic()+120
    raw=client.fetch(e,params,limit,page)
    data,path=extract(raw,e['extract'],e.get('nullable_paths',()))
    if id=='sztz.profile' and isinstance(data,dict) and data.get('xh') and str(data['xh']).strip()!=client.username:
        raise QueryError('ACCOUNT_SCOPE_MISMATCH','响应账号与本机登录账号不一致；不返回数据。')
    source_count=len(data) if isinstance(data,list) else None
    records=data[:limit] if isinstance(data,list) else ([] if data=={} and e.get('empty_map_is_empty') else [data])
    clean=[bounded(record,limit=limit) for record in records]
    metadata={}
    if isinstance(raw,dict):
        for k in ('total','totalcount','total_count','count','page','pageNo','pageSize','chart','totaltime'):
            if k in raw:metadata[k]=bounded(raw[k],limit)
        for key in ('data','result'):
            obj=raw.get(key)
            if isinstance(obj,dict):
                for k in ('total','totalcount','page','current','size','pages'):
                    if k in obj:metadata[key+'.'+k]=obj[k]
    result={'schema_version':1,'status':'ok','endpoint':id,'fetched_at':now(),
        'source':{'service':e['service'],'url':e['url'],'evidence':e['source']},
        'validation':{'catalogue_status':e['status'],'this_request':'authenticated_response_parsed',
                      'meaning':'本次请求和已知字段解析成功；不保证字段语义全部经过人工核验。'},
        'query':{'parameters':params,'page':page,'limit':limit},
        'returned':len(clean),'server_returned_count':source_count,
        'pagination':{'server_pagination':e['paging'] is not None,
                      'possibly_more':(source_count>=limit) if source_count is not None else None,
                      'local_truncation':source_count>limit if source_count is not None else False},
        'data_path':path,'records':clean,'response_metadata':metadata,
        'empty_result':not records,
        'note':'字段保留源系统命名；敏感凭据已过滤，长文本及嵌套数组限量。'}
    # Keep output small even when a source ignores server-side paging.
    while len(json.dumps(result,ensure_ascii=False).encode())>40000 and result['records']:
        result['records'].pop();result['returned']=len(result['records'])
        result['pagination']['local_truncation']=True
    if changes:result['changes']=apply_changes(client.username,e,params,page,limit,result['records'])
    return result


def parser():
    p=argparse.ArgumentParser(description='浙大本人信息查询：默认只列接口；凭据由本机窗口输入。')
    s=p.add_subparsers(dest='command')
    cat=s.add_parser('catalog');cat.add_argument('--service',choices=list(REGISTRY['services']));cat.add_argument('--details',action='store_true')
    d=s.add_parser('doctor');d.add_argument('--network',action='store_true');d.add_argument('--service',choices=list(REGISTRY['services']))
    c=s.add_parser('credentials');c.add_argument('action',choices=['set','status','forget'])
    s.add_parser('auth')
    q=s.add_parser('query');q.add_argument('endpoint');q.add_argument('--param',action='append',default=[]);q.add_argument('--limit',type=int,default=10);q.add_argument('--page',type=int,default=1);q.add_argument('--changes',action='store_true')
    snap=s.add_parser('snapshot');snap.add_argument('--only',required=True,help='1–5 个逗号分隔的接口 ID，不自动遍历所有类别');snap.add_argument('--limit',type=int,default=5);snap.add_argument('--changes',action='store_true')
    col=s.add_parser('collect',help='完整采集一个接口全部字段和分页，保存到加密库');col.add_argument('endpoint');col.add_argument('--param',action='append',default=[]);col.add_argument('--page-size',type=int,default=100);col.add_argument('--max-pages',type=int,default=200)
    read=s.add_parser('read',help='按 JSON Pointer 分批读取完整对象，不截短字段');read.add_argument('--bundle',required=True);read.add_argument('--pointer',default='');read.add_argument('--offset',type=int,default=0);read.add_argument('--limit',type=int,default=5)
    ac=s.add_parser('academic',help='完整采集并整理整学期课程、逐次日程、成绩与实践');ac.add_argument('--year',required=True);ac.add_argument('--term',choices=['1','2'],default='1')
    learn=s.add_parser('learning',help='完整整理本人的一门课程活动、成绩与完成状态');learn.add_argument('--course-id',required=True)
    s.add_parser('resources',help='直接查询可用的数据类别')
    schema=s.add_parser('schema',help='只读取一个业务模型的中文字段解释');schema.add_argument('model')
    hist=s.add_parser('history',help='列出本机当前账号保存的数据快照');hist.add_argument('--limit',type=int,default=10)
    hist.add_argument('--offset',type=int,default=0)
    diff=s.add_parser('diff',help='比较两个完整快照的观察变化，不伪造公布时间');diff.add_argument('--from-bundle',required=True);diff.add_argument('--to-bundle',required=True);diff.add_argument('--resource',default='grades');diff.add_argument('--fields');diff.add_argument('--limit',type=int,default=5)
    diff.add_argument('--offset',type=int,default=0)
    quick=s.add_parser('quick',help='一次调用完成时间筛选、字段选择与汇总');quick.add_argument('resource');quick.add_argument('--bundle');quick.add_argument('--window');quick.add_argument('--from',dest='start');quick.add_argument('--to',dest='end');quick.add_argument('--at');quick.add_argument('--time-mode',choices=['overlap','starts','contained'],default='overlap');quick.add_argument('--filter',action='append',default=[]);quick.add_argument('--fields');quick.add_argument('--sort');quick.add_argument('--group');quick.add_argument('--metric',action='append',default=[]);quick.add_argument('--operation',default='select',choices=['select','aggregate','conflicts','transitions','gaps']);quick.add_argument('--limit',type=int,default=5);quick.add_argument('--offset',type=int,default=0)
    select=s.add_parser('select',help='组合 JSON 查询：嵌套条件、关联、分组、汇总');select.add_argument('--bundle');group=select.add_mutually_exclusive_group(required=True);group.add_argument('--spec');group.add_argument('--spec-file')
    quick.add_argument('--refresh',action='store_true');quick.add_argument('--endpoint')
    return p


def main(argv=None):
    args=parser().parse_args(argv)
    cmd=args.command or 'catalog'
    if cmd in ('history','diff'):
        from snapshot_history import history,diff
        if cmd=='history':return history(args.limit,args.offset)
        return diff(args.from_bundle,args.to_bundle,args.resource,args.fields.split(',') if args.fields else None,args.limit,args.offset)
    if cmd=='schema':
        models=json.loads((ROOT/'references/model-schema.json').read_text(encoding='utf8'))['models']
        if args.model not in models:raise QueryError('UNKNOWN_MODEL','未知模型。',models=list(models))
        return {'status':'ok','model':args.model,'fields':models[args.model]}
    if cmd in ('quick','select','resources'):
        from quick_query import latest,from_args,RESOURCES,resolve_bundle,attach_related
        from student_query import execute
        if cmd=='resources':return {'status':'ok','resources':RESOURCES,'source':'full encrypted datasets; local queries do not refresh the network'}
        if cmd=='quick':spec=from_args(args)
        else:
            try:spec=json.loads(args.spec if args.spec else Path(args.spec_file).read_text(encoding='utf8'))
            except ValueError:raise QueryError('INVALID_SPEC','查询规范必须为有效 JSON。')
        data=resolve_bundle(spec.get('resource','classes'),args.bundle,getattr(args,'refresh',False),getattr(args,'endpoint',None))
        return execute(attach_related(data,spec),spec)
    if cmd=='read':
        from complete_data import read_bundle
        return read_bundle(args.bundle,args.pointer,args.offset,args.limit)
    if cmd=='collect':
        from complete_data import collect_endpoint,save_bundle
        e=endpoint(args.endpoint);params=params_from_args(args.param)
        build_request(e,params,args.page_size,1)
        if not 1<=args.max_pages<=1000:raise QueryError('INVALID_PARAMETER','max-pages 为 1–1000。')
        params=checked_params(e,params);client=credential_client();authorize_course(client,e,params)
        result=collect_endpoint(client,e,params,args.page_size,args.max_pages)
        from field_guide import semantic_envelope
        id=save_bundle({'kind':'source','dataset':result,'normalized':semantic_envelope(result),'account_scope':fingerprint(client.username)})
        return {'status':'ok' if result['completeness']['complete'] else 'partial','bundle_id':id,
            'endpoint':e['id'],'completeness':result['completeness'],'issues':result['issues'],
            'read_pointer':'/normalized/items','raw_pointer':'/dataset/pages','field_dictionary_pointer':'/normalized/field_dictionary','nested_values_truncated':False}
    if cmd=='academic':
        from academic_service import sync_academic
        checked_params(ENDPOINTS['zdbk.timetable'],{'xnm':args.year,'xqm':'1|秋'})
        return sync_academic(credential_client(),ENDPOINTS,args.year,args.term)
    if cmd=='learning':
        from academic_service import learning
        p=checked_params(ENDPOINTS['courses.activities'],{'course_id':args.course_id})
        return learning(credential_client(),ENDPOINTS,p['course_id'],authorize_course)
    if cmd=='catalog':
        entries=[e for e in ENDPOINTS.values() if not getattr(args,'service',None) or e['service']==args.service]
        if not getattr(args,'details',False):entries=[{k:e[k] for k in ('id','title','status')} for e in entries]
        return {'status':'ok','researched_at':REGISTRY['researched_at'],'total':len(entries),'endpoints':entries}
    if cmd=='credentials':
        if args.action=='set':
            vault.credential_dialog()
            return {'status':'ok','credentials_saved':vault.load('credentials.dpapi') is not None,'network_requests':0}
        if args.action=='status':return {'status':'ok','credentials_saved':(vault.state_dir()/'credentials.dpapi').exists()}
        path=vault.state_dir()/'credentials.dpapi'
        path.unlink(missing_ok=True)
        return {'status':'ok','credentials_removed':True,'note':'仅删除本机保存的凭据；不修改学校账户。'}
    if cmd=='doctor':
        result={'status':'ok','python':sys.version.split()[0],'windows_dpapi':os.name=='nt',
            'credentials_saved':(vault.state_dir()/'credentials.dpapi').exists() if os.name=='nt' else False,
            'catalogued':len(ENDPOINTS),'implemented_candidates':sum(e['status'] in ('implemented_unverified','verified') for e in ENDPOINTS.values()),
            'previously_verified':sum(e['status']=='verified' for e in ENDPOINTS.values()),
            'account_verification':'not_tested_by_doctor','note':'doctor 不读取凭据，不代表账号验证；网络检测只 GET 站点首页。'}
        if args.network:
            net=Transport();checks=[]
            targets={args.service:REGISTRY['services'][args.service]} if args.service else {k:v for k,v in REGISTRY['services'].items() if k!='library'}
            for k,v in targets.items():
                if k=='library':checks.append({'service':k,'status':'transport_unverified'});continue
                try:
                    r=net.request('https://'+v['host']+'/')
                    checks.append({'service':k,'http_status':r.status,'tls_connection':True,'authenticated':False})
                except QueryError as e:checks.append({'service':k,**e.result()})
            result['network']=checks
        return result
    if cmd=='auth':
        client=credential_client();client.login()
        return {'status':'ok','authenticated_at':now(),'sso':True,'business_systems_tested':[],'student_data_fetched':False}
    if cmd=='query':
        params=params_from_args(args.param)
        build_request(endpoint(args.endpoint),params,args.limit,args.page)
        return query(credential_client(),args.endpoint,params,args.limit,args.page,args.changes)
    if cmd=='snapshot':
        ids=args.only.split(',')
        if not 1<=len(ids)<=5 or len(set(ids))!=len(ids):raise QueryError('INVALID_PARAMETER','每次选择 1–5 个不同接口。')
        if not 1<=args.limit<=20:raise QueryError('INVALID_PARAMETER','snapshot limit 范围为 1–20。')
        for id in ids:build_request(endpoint(id),{},args.limit,1)
        client=credential_client();results=[]
        for id in ids:
            try:results.append(query(client,id,{},args.limit,1,args.changes))
            except QueryError as e:
                results.append({'endpoint':id,**e.result()})
                if e.code in ('AUTH_FAILED','AUTH_FLOW_CHANGED','RATE_LIMITED'):break
        return {'status':'ok' if all(r['status']=='ok' for r in results) else 'partial',
                'requested':ids,'executed':len(results),'results':results}


if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf8')
    try:result=main()
    except QueryError as e:result=e.result()
    except (RuntimeError,OSError):result={'status':'error','error':{'code':'LOCAL_STORAGE_ERROR','message':'本机加密存储或文件不可用。'}}
    except Exception:result={'status':'error','error':{'code':'CLIENT_ERROR','message':'客户端未完成请求；不输出可能含凭据的异常细节。'}}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    sys.exit(0 if result.get('status') in ('ok','partial','navigate_required') else 1)
