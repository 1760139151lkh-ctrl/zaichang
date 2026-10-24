"""Lossless, encrypted collection plus bounded *navigation*, never truncation."""
import base64
import copy
import datetime
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.parse
import uuid

import vault
from client import QueryError,extract,fingerprint,SENSITIVE


def utcnow():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def at(value,path):
    for key in path.split('.') if path else []:
        if isinstance(value,dict) and key in value:value=value[key]
        else:return None
    return value


def projection_free(e):
    e=copy.deepcopy(e)
    e['defaults'].pop('fields',None);e['defaults'].pop('field',None)
    u=urllib.parse.urlsplit(e['url'])
    query=[(k,v) for k,v in urllib.parse.parse_qsl(u.query,keep_blank_values=True) if k not in ('fields','field')]
    e['url']=urllib.parse.urlunsplit(u._replace(query=urllib.parse.urlencode(query)))
    return e


TOTAL_PATHS={
    'zdbk':['totalResult'],
    'courses':['total_count','total','count','meta.total_count'],
    'booking':['data.total','totalcount','total'],
    'ecard':['data.total','total'],
    'classroom':['params.result.total','result.total'],
    'grs':['result.total','total'],
}


def total_for(data,e):
    for path in TOTAL_PATHS.get(e['service'],[]):
        val=at(data,path)
        if isinstance(val,(int,str)) and str(val).isdigit():return int(val),path
    return None,None


def identify(row):
    if not isinstance(row,dict):return fingerprint(row)
    for k in ('id','Id','xkkh','flowId'):
        if row.get(k) is not None:return str(row[k])
    return fingerprint(row)


def collect_endpoint(client,e,params=None,page_size=100,max_pages=200):
    """All returned fields, full nested values, exact response bytes, all pages.

    Completeness means the declared endpoint/query scope, not the whole university.
    Pagination failures preserve prior pages and explicitly mark partial results.
    """
    e=projection_free(e);params=params or {};pages=[];records=[];refs=[];issues=[]
    totals=[];seen_pages=set();termination=None
    result={'endpoint':e['id'],'parameters':params,'collected_at':utcnow(),'pages':pages,
            'records':records,'record_refs':refs,'completeness':{},'issues':issues,
            'fields_projection_removed':True,'source_evidence':e['source']}
    for page in range(1,max_pages+1):
        client.net.deadline=time.monotonic()+120
        try:
            try:data=client.fetch(e,params,page_size,page)
            except QueryError as first_error:
                if first_error.code!='NETWORK_OR_TLS':raise
                time.sleep(0.5)
                data=client.fetch(e,params,page_size,page)
            reply=getattr(client.net,'last_response',None)
            item,path=extract(data,e['extract'],e.get('nullable_paths',()))
        except QueryError as error:
            issues.append(error.result()['error']);termination='request_failed';break
        rows=item if isinstance(item,list) else ([] if item=={} and e.get('empty_map_is_empty') else [item])
        # Always retain the received page before evaluating completeness.
        raw=reply.body if reply is not None else json.dumps(data,ensure_ascii=False).encode()
        capture={'page':page,'response':data,'records_path':path,'record_count':len(rows),
                 'http_status':reply.status if reply else None,
                 'body_b64':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest(),
                 'byte_length':len(raw),'wire_bytes_captured':reply is not None}
        pages.append(capture)
        signature=fingerprint([identify(r) for r in rows])
        if rows and signature in seen_pages and e['paging']:
            issues.append({'code':'REPEATED_PAGE','message':'服务器重复返回同一记录页，停止以避免虚假全量。'})
            termination='repeated_page';break
        seen_pages.add(signature)
        base='/pages/'+str(len(pages)-1)+'/response'+(''.join('/'+p for p in path.split('.')) if path else '')
        for i,row in enumerate(rows):
            records.append(row);refs.append(base+('/'+str(i) if isinstance(item,list) else ''))
        total,totalpath=total_for(data,e)
        if total is not None:totals.append(total)
        if totals and any(t!=totals[0] for t in totals):
            issues.append({'code':'SOURCE_CHANGED_DURING_FETCH','message':'采集期间服务端总数发生变化，需重采确认。'})
        if not e['paging']:
            if total is not None and total>len(rows):
                issues.append({'code':'UNDOCUMENTED_PAGINATION','message':'响应提示还有记录，但当前适配器没有已确认分页协议。'})
                termination='unknown_pagination'
            else:termination='unpaginated_response'
            break
        if total is not None and len(records)>=total:
            if len(records)!=total:issues.append({'code':'COUNT_MISMATCH','message':'累计条数与服务器声明不一致。'})
            termination='declared_total_reached';break
        if not rows:
            termination='empty_terminal_page'
            if total is not None and len(records)<total:issues.append({'code':'PREMATURE_EMPTY_PAGE','message':'尚未到声明总数就返回空页。'})
            break
        if len(rows)<page_size:
            if total is not None and len(records)<total:
                # A server may cap page size below our request; keep following.
                continue
            termination='short_terminal_page';break
    else:
        termination='page_limit';issues.append({'code':'PAGE_LIMIT','message':'达到安全页数上限，数据仍为部分。'})
    result['completeness']={'complete':bool(pages) and not issues,'record_count':len(records),
        'pages_fetched':len(pages),'reported_totals':totals,'termination':termination,
        'scope':'all_fields_and_pages_returned_for_this_endpoint_and_parameters',
        'nested_values_truncated':False,'raw_bytes_preserved':bool(pages) and all(p['wire_bytes_captured'] for p in pages)}
    from field_guide import field_catalogue
    result['field_dictionary']=field_catalogue(e['id'],records)
    return result


def save_bundle(value):
    id=uuid.uuid4().hex
    value={'bundle_id':id,'created_at':utcnow(),**value}
    vault.save('datasets/'+id+'.dpapi',value)
    if value.get('kind')=='source' and value.get('account_scope'):
        index=vault.load('source-index.dpapi') or {}
        index.setdefault(value['account_scope'],{})[value['dataset']['endpoint']]={'bundle_id':id,'created_at':value['created_at']}
        vault.save('source-index.dpapi',index)
    return id


def load_bundle(id):
    if not re.fullmatch(r'[0-9a-f]{32}',id):raise QueryError('INVALID_BUNDLE','数据集 ID 格式不正确。')
    bundle=vault.load('datasets/'+id+'.dpapi')
    if bundle is None:raise QueryError('BUNDLE_NOT_FOUND','本机找不到该数据集。')
    return bundle


def pointer(value,path):
    if not path or path=='/':return value
    if not path.startswith('/'):raise QueryError('INVALID_POINTER','使用 JSON Pointer，例如 /normalized/courses。')
    try:
        for raw in path.split('/')[1:]:
            key=raw.replace('~1','/').replace('~0','~')
            value=value[int(key)] if isinstance(value,list) else value[key]
        return value
    except (KeyError,IndexError,ValueError,TypeError):raise QueryError('POINTER_NOT_FOUND','数据集中不存在该路径。')


def credential_filtered(value,removed=None,path=''):
    removed=[] if removed is None else removed
    if isinstance(value,dict):
        out={}
        for key,v in value.items():
            ptr=path+'/'+key.replace('~','~0').replace('/','~1')
            if SENSITIVE.search(key):out[key]='[credential redacted]';removed.append(ptr)
            elif key=='body_b64':out[key]='[exact bytes retained in encrypted store]';removed.append(ptr)
            else:out[key]=credential_filtered(v,removed,ptr)
        return out
    if isinstance(value,list):return [credential_filtered(v,removed,path+'/'+str(i)) for i,v in enumerate(value)]
    if isinstance(value,str):
        # No length/depth truncation. Only credential-bearing URL fragments/JWTs.
        clean=re.sub(r'(?i)((?:token|ticket|code|synjones-auth|password)=)[^&\s"<>]+',r'\1[redacted]',value)
        clean=re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b','[redacted]',clean)
        if clean!=value:removed.append(path)
        return clean
    return value


def read_bundle(id,path='',offset=0,limit=5,max_bytes=60000):
    parts=[p.replace('~1','/').replace('~0','~') for p in path.split('/')]
    if any(SENSITIVE.search(p) or p=='body_b64' for p in parts):
        raise QueryError('CREDENTIAL_FIELD_PROTECTED','凭据字段和原始响应字节只保留在本机加密库；请读取 response 或业务字段。')
    if not 0<=offset or not 1<=limit<=100:raise QueryError('INVALID_PARAMETER','offset 非负，limit 为 1–100。')
    value=pointer(load_bundle(id),path);removed=[]
    if isinstance(value,list):
        selected=value[offset:offset+limit];total=len(value);next_offset=offset+len(selected) if offset+len(selected)<total else None
    else:selected=value;total=None;next_offset=None
    filtered=credential_filtered(selected,removed,path)
    size=len(json.dumps(filtered,ensure_ascii=False).encode())
    if size>max_bytes:
        return {'status':'navigate_required','bundle_id':id,'pointer':path,'byte_length':size,
            'message':'选中对象完整但较大；请缩小到子字段或单条记录。未截短原始值。',
            'available_keys':list(value) if isinstance(value,dict) else None,'total_items':total}
    return {'status':'ok','bundle_id':id,'pointer':path,'data':filtered,'total_items':total,
            'offset':offset if total is not None else None,'next_offset':next_offset,
            'nested_values_truncated':False,'credential_redactions':removed}
