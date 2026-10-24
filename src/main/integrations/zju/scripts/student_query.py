"""Composable local queries over complete data; no eval, no silent information loss."""
import datetime as dt
from decimal import Decimal
import json
import re
import statistics
from collections import defaultdict
from academic_models import ZONE
from complete_data import at,credential_filtered
from client import QueryError


def moment(value,now):
    if value is None:return None
    if isinstance(value,dt.datetime):return value.astimezone(ZONE) if value.tzinfo else value.replace(tzinfo=ZONE)
    if value=='now':return now
    if value=='today':return now.replace(hour=0,minute=0,second=0,microsecond=0)
    if isinstance(value,(int,float)) or re.fullmatch(r'\d{10}|\d{13}',str(value)):
        numeric=float(value)
        if numeric>=1000000000:return dt.datetime.fromtimestamp(numeric/1000 if numeric>=1000000000000 else numeric,ZONE)
    m=re.fullmatch(r'([+-]?)(\d+(?:\.\d+)?)(m|h|d|w)',str(value))
    if m:
        seconds=float(m[2])*{'m':60,'h':3600,'d':86400,'w':604800}[m[3]]
        return now+dt.timedelta(seconds=(-seconds if m[1]=='-' else seconds))
    try:
        parsed=dt.datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return parsed.astimezone(ZONE) if parsed.tzinfo else parsed.replace(tzinfo=ZONE)
    except (ValueError,TypeError):raise QueryError('INVALID_TIME','无法解析时间；可用 ISO 日期、now、today、-24h。')


def interval(spec,now):
    time=spec.get('time') or {};window=time.get('window')
    if time.get('at'):
        point=moment(time['at'],now);return point,point+dt.timedelta(microseconds=1),'overlap'
    if window:
        m=re.fullmatch(r'(past|next):(\d+(?:\.\d+)?[mhdw])',window)
        if m:
            start,end=(moment('-'+m[2],now),now) if m[1]=='past' else (now,moment('+'+m[2],now))
        elif window in ('today','yesterday','tomorrow'):
            start=moment('today',now)+dt.timedelta(days={'today':0,'yesterday':-1,'tomorrow':1}[window]);end=start+dt.timedelta(days=1)
        elif window in ('this_week','next_week','last_week'):
            start=moment('today',now)-dt.timedelta(days=now.weekday())+dt.timedelta(weeks={'this_week':0,'next_week':1,'last_week':-1}[window]);end=start+dt.timedelta(days=7)
        else:raise QueryError('INVALID_WINDOW','窗口应为 past:24h、next:7d、today、this_week 等。')
    else:start,end=moment(time.get('from'),now),moment(time.get('to'),now)
    if start and end and start>=end:raise QueryError('INVALID_INTERVAL','时间区间必须开始早于结束，采用左闭右开 [from,to)。')
    return start,end,time.get('mode','overlap')


def enrich_event(row,now):
    row=dict(row)
    try:start=moment(row.get('startTime'),now);end=moment(row.get('endTime'),now)
    except QueryError:start=end=None
    if start:
        row.update(date=start.date().isoformat(),weekday=start.isoweekday(),start_hour=start.hour,
            daypart='morning' if start.hour<12 else 'afternoon' if start.hour<18 else 'evening',
            minutes_from_now=(start-now).total_seconds()/60)
    if start and end:
        row.update(duration_minutes=(end-start).total_seconds()/60,ongoing=start<=now<end,ended=end<=now)
        if row.get('periods'):
            row['instruction_minutes']=sum((moment(p['endTime'],now)-moment(p['startTime'],now)).total_seconds()/60 for p in row['periods'])
        else:row['instruction_minutes']=row['duration_minutes']
    row['has_room']=bool((row.get('location_details') or {}).get('room'))
    return row


def resource_rows(bundle,resource,now):
    if resource in bundle.get('related',{}):return resource_rows(bundle['related'][resource],resource,now)
    n=bundle.get('normalized',{});t=n.get('transcript',{})
    if resource in ('attendance','sleep','live_location','library_loans'):
        raise QueryError('SOURCE_UNAVAILABLE','现有数据不能证明实际出席、睡眠、实时位置或不可用的图书借阅信息；不能由课表推断事实。',resource=resource)
    required={'classes':'occurrences','courses':'courses','exams':'exams','grades':'transcript','gpa_semesters':'transcript',
        'gpa_cumulative':'transcript','gpa_overall':'transcript','retakes':'transcript','projects':'practice','practice_summary':'practice',
        'todos':'todos','activities':'activities','holidays':'calendar','calendar_pending':'schedule_quality','cancelled_classes':'schedule_quality'}
    if resource in required and required[resource] not in n:raise QueryError('SOURCE_UNAVAILABLE','当前快照不含此数据类别；请同步对应来源。',resource=resource)
    if resource=='classes':
        courses={c['key']:c for c in n.get('courses',[])}
        return [enrich_event({**r,'name':r.get('summary'),'campus':(r.get('location_details') or {}).get('campus'),
            'course_credit':courses.get(r.get('course_key'),{}).get('credit'),'course_code':courses.get(r.get('course_key'),{}).get('course_code')},now) for r in n.get('occurrences',[])]
    if resource=='courses':return list(n.get('courses',[]))
    if resource=='exams':return [enrich_event(r,now) for r in n.get('exams',[])]
    if resource=='grades':return list(t.get('grades',[]))
    if resource=='gpa_semesters':return list(t.get('semesters',[]))
    if resource=='gpa_cumulative':return list(t.get('cumulative_by_semester_all_attempts',[]))
    if resource=='gpa_overall':return [{'policy':key.removeprefix('overall_'),**value} for key,value in t.items() if key.startswith('overall_')]
    if resource=='retakes':return list(t.get('repeat_groups',[]))
    if resource=='projects':return list(n.get('practice',{}).get('items',[]))
    if resource=='practice_summary':return [n.get('practice',{}).get('official_summary',{})]
    if resource=='todos':
        return [{**r,'startTime':r.get('endTime'),'endTime':r.get('endTime'),'deadline':r.get('endTime')} for r in n.get('todos',[])]
    if resource=='activities':return list(n.get('activities',[]))
    if resource=='holidays':
        c=(n.get('calendar') or {}).get('data',{});out=[]
        for date,name in c.get('holiday',{}).items():
            start=dt.datetime.strptime(date,'%Y%m%d').replace(tzinfo=ZONE)
            out.append({'date':start.date().isoformat(),'name':name,'startTime':start.isoformat(),'endTime':(start+dt.timedelta(days=1)).isoformat(),'all_day':True,'kind':'statutory_or_school_holiday'})
        for br in c.get('academic_breaks',[]):
            start=moment(br['from'],now);end=moment(br['to_exclusive'],now)
            out.append({'date':start.date().isoformat(),'name':br['name'],'startTime':start.isoformat(),'endTime':end.isoformat(),'all_day':True,'kind':'academic_break','conditions':br.get('conditions')})
        return out
    if resource=='calendar_pending':return list(n.get('schedule_quality',{}).get('pending_calendar_events',[]))
    if resource=='cancelled_classes':return list(n.get('schedule_quality',{}).get('cancelled_by_calendar',[]))
    if resource=='source_status':
        sources=bundle.get('datasets') or ({'source':bundle['dataset']} if bundle.get('dataset') else {})
        return [{'dataset':k,'endpoint':v.get('endpoint'),'collected_at':v.get('collected_at'),**v.get('completeness',{}),'issues':v.get('issues',[])} for k,v in sources.items()]
    if resource=='records':
        return list(bundle.get('dataset',{}).get('records',[]))
    aliases={'transactions':'ecard.transactions','reservations':'booking.seats','reservation_violations':'booking.violations','card_accounts':'ecard.cards','student_profile':'eta.profile','roles':'eta.roles'}
    if resource in aliases:
        dataset=bundle.get('dataset',{})
        if dataset.get('endpoint')!=aliases[resource]:raise QueryError('SOURCE_UNAVAILABLE','当前数据集不包含此类别；用 quick 自动取得对应数据。')
        result=[]
        for raw in dataset.get('records',[]):
            row=dict(raw)
            if resource=='transactions':
                try:instant=moment(raw.get('jndatetime'),now)
                except QueryError:instant=None
                row.update(startTime=instant.isoformat() if instant else None,endTime=instant.isoformat() if instant else None,
                    occurred_at=instant.isoformat() if instant else None,date=instant.date().isoformat() if instant else None,
                    amount_unit='unverified_source_unit')
            if resource in ('reservations','reservation_violations'):
                def stamp(v):
                    if v is None:return None
                    if re.fullmatch(r'\d{1,2}:\d{2}(?::\d{2})?',str(v)) and raw.get('day'):v=str(raw['day'])[:10]+'T'+str(v)
                    try:return moment(v,now).isoformat()
                    except QueryError:return None
                row.update(startTime=stamp(raw.get('beginTime',raw.get('start'))),endTime=stamp(raw.get('endTime',raw.get('end'))),
                           location=raw.get('nameMerge'),record_semantics='reservation_record_not_observed_attendance')
            result.append(row)
        return result
    raise QueryError('UNKNOWN_RESOURCE','未知数据类别；使用 resources 查看支持项。')


def compare_value(value,op,target):
    if op not in ('missing','exists','eq','ne','in','not_in','contains','starts_with','ends_with','length_gt','length_eq','gt','gte','lt','lte'):
        raise QueryError('INVALID_OPERATOR','未知筛选运算。',operator=op)
    if op=='missing':return value is None
    if op=='exists':return value is not None
    if op=='eq':return value==target
    if op=='ne':return value!=target
    if op=='in':return value in target
    if op=='not_in':return value not in target
    if value is None:return False
    if op=='contains':return target in value if isinstance(value,(list,dict)) else str(target).casefold() in str(value).casefold()
    if op=='starts_with':return str(value).startswith(str(target))
    if op=='ends_with':return str(value).endswith(str(target))
    if op in ('length_gt','length_eq'):
        if not isinstance(value,(list,dict,str)):raise QueryError('INVALID_FILTER_TYPE','长度条件只适用于列表、对象或字符串。')
        return len(value)>target if op=='length_gt' else len(value)==target
    try:
        if op=='gt':return value>target
        if op=='gte':return value>=target
        if op=='lt':return value<target
        if op=='lte':return value<=target
    except TypeError:return False
    raise QueryError('INVALID_OPERATOR','未知筛选运算。',operator=op)


def matches(row,where):
    if not where:return True
    if 'and' in where:return all(matches(row,x) for x in where['and'])
    if 'or' in where:return any(matches(row,x) for x in where['or'])
    if 'not' in where:return not matches(row,where['not'])
    if 'any' in where:
        block=where['any'];value=at(row,block['field']) or []
        return isinstance(value,list) and any(matches(x,block['where']) for x in value if isinstance(x,dict))
    if 'all' in where:
        block=where['all'];value=at(row,block['field']) or []
        return bool(value) and isinstance(value,list) and all(matches(x,block['where']) for x in value if isinstance(x,dict))
    return compare_value(at(row,where['field']),where.get('op','eq'),where.get('value'))


def validate_where(where,depth=0):
    if where is None:return
    if depth>20 or not isinstance(where,dict):raise QueryError('INVALID_FILTER','筛选结构无效或嵌套过深。')
    for logical in ('and','or'):
        if logical in where:
            if not isinstance(where[logical],list):raise QueryError('INVALID_FILTER','and/or 必须是条件列表。')
            for sub in where[logical]:validate_where(sub,depth+1)
            return
    if 'not' in where:validate_where(where['not'],depth+1);return
    for logical in ('any','all'):
        if logical in where:
            block=where[logical]
            if not isinstance(block,dict) or not isinstance(block.get('field'),str):raise QueryError('INVALID_FILTER','数组条件需要field和where。')
            validate_where(block.get('where'),depth+1);return
    allowed={'missing','exists','eq','ne','in','not_in','contains','starts_with','ends_with','length_gt','length_eq','gt','gte','lt','lte'}
    if where.get('op','eq') not in allowed:raise QueryError('INVALID_OPERATOR','未知筛选运算。',operator=where.get('op'))
    if not isinstance(where.get('field'),str):raise QueryError('INVALID_FILTER','筛选必须指定字段。')
    if where.get('op') in ('in','not_in') and not isinstance(where.get('value'),list):raise QueryError('INVALID_FILTER','in/not_in 的值必须是列表。')


def metric(rows,spec):
    op=spec['op'];values=[at(r,spec.get('field','')) for r in rows]
    values=[v for v in values if v is not None]
    if op=='count':return len(rows)
    if op=='count_where':return sum(matches(r,spec.get('where')) for r in rows)
    if op=='fraction':return sum(matches(r,spec.get('where')) for r in rows)/len(rows) if rows else None
    if op=='count_distinct':return len({json.dumps(v,sort_keys=True,ensure_ascii=False) for v in values})
    if not values:return None
    if op=='min':return min(values)
    if op=='max':return max(values)
    if op in ('first','last'):return values[0 if op=='first' else -1]
    nums=[Decimal(str(v)) for v in values if isinstance(v,(int,float)) and not isinstance(v,bool)]
    if op=='sum':return float(sum(nums,Decimal(0)))
    if op=='mean':return float(sum(nums)/len(nums)) if nums else None
    if op=='median':return float(statistics.median(nums)) if nums else None
    if op=='weighted_mean':
        pairs=[(at(r,spec['field']),at(r,spec['weight'])) for r in rows]
        pairs=[(Decimal(str(v)),Decimal(str(w))) for v,w in pairs if isinstance(v,(int,float)) and isinstance(w,(int,float)) and w>0]
        denominator=sum((w for v,w in pairs),Decimal(0))
        return float(sum((v*w for v,w in pairs),Decimal(0))/denominator) if denominator else None
    raise QueryError('INVALID_METRIC','不支持的汇总方式。',metric=op)


def aggregate(rows,group_by,metrics):
    groups=defaultdict(list)
    for row in rows:
        key=tuple(json.dumps(at(row,f),sort_keys=True,ensure_ascii=False) for f in group_by);groups[key].append(row)
    if not group_by and not groups:groups[()]=[]
    return [{**{f:json.loads(k) for f,k in zip(group_by,key)},
            **{m.get('as',m['op']+'_'+m.get('field','records')):metric(group,m) for m in metrics}} for key,group in groups.items()]


def coverage(bundle,resources,start,end):
    n=bundle.get('normalized',{});q=n.get('data_quality',{});issues=[]
    dependencies={'classes':['timetable_first','timetable_second'],'courses':['timetable_first','timetable_second','grades','exams'],
        'grades':['grades'],'gpa_semesters':['grades'],'gpa_cumulative':['grades'],'gpa_overall':['grades'],'retakes':['grades'],
        'projects':['practice'],'practice_summary':['practice_profile'],'todos':['todos'],'exams':['exams']}
    needed={d for r in resources for d in dependencies.get(r,[])}
    ds=bundle.get('datasets',{})
    source=all(ds[d].get('completeness',{}).get('complete',False) for d in needed if d in ds)
    if bundle.get('dataset'):source=bundle['dataset'].get('completeness',{}).get('complete',False)
    for r in resources:
        related=bundle.get('related',{}).get(r)
        if related:
            source=source and coverage(related,[r],start,end)['complete']
    if not source:issues.append('one_or_more_source_datasets_incomplete')
    if (n.get('calendar') or {}).get('stale') and any(r in ('classes','holidays','calendar_pending') for r in resources):issues.append('using_cached_calendar_after_failed_refresh')
    if any(ds[d].get('freshness',{}).get('stale') for d in needed if d in ds):issues.append('using_cached_data_after_failed_refresh')
    if any(r in ('classes','holidays') for r in resources) and (start or end):
        cal=n.get('calendar') or {};bounds=cal.get('data',{}).get('startEnd',[])
        if len(bounds)==4:
            first=dt.datetime.strptime(bounds[0],'%Y%m%d').replace(tzinfo=ZONE)
            last=dt.datetime.strptime(bounds[3],'%Y%m%d').replace(tzinfo=ZONE)+dt.timedelta(days=1)
            occurrences=n.get('occurrences',[])
            if occurrences:
                last_event=max(moment(r['endTime'],first) for r in occurrences)
                last=max(last,last_event.replace(hour=0,minute=0,second=0,microsecond=0)+dt.timedelta(days=1))
            if resources==['holidays']:
                breaks=cal.get('data',{}).get('academic_breaks',[])
                if breaks:
                    first=min(first,*[moment(x['from'],first) for x in breaks]);last=max(last,*[moment(x['to_exclusive'],first) for x in breaks])
            if start and start<first:issues.append('query_starts_before_collected_teaching_period')
            if end and end>last:issues.append('query_ends_after_collected_teaching_period')
        else:issues.append('calendar_coverage_unknown')
    pending=n.get('schedule_quality',{}).get('pending_calendar_events',[])
    if 'classes' in resources and any(end is None or end>moment(p['original_date'],dt.datetime.now(ZONE)) for p in pending):
        issues.append('some_future_makeup_dates_unpublished')
    timestamps={k:d.get('collected_at') for k,d in bundle.get('datasets',{}).items() if not needed or k in needed}
    if bundle.get('dataset'):timestamps[bundle['dataset']['endpoint']]=bundle['dataset'].get('collected_at')
    for r in resources:
        related=bundle.get('related',{}).get(r)
        if related:timestamps.update(coverage(related,[r],start,end)['source_fetched_at'])
    breaks=[]
    for br in (((n.get('calendar') or {}).get('data') or {}).get('academic_breaks',[]) if any(r in ('classes','holidays') for r in resources) else []):
        a=moment(br['from'],dt.datetime.now(ZONE));b=moment(br['to_exclusive'],a)
        if (start is None or b>start) and (end is None or a<end):breaks.append(br)
    return {'complete':not issues,'issues':issues,'data_is':'published_schedule_or_source_records, not observed behavior','source_fetched_at':timestamps,'known_calendar_breaks':breaks}


def execute(bundle,spec,now=None):
    now=moment(now or dt.datetime.now(ZONE),dt.datetime.now(ZONE))
    if spec.get('claim') in ('actual_attendance','actual_location','actual_study_hours'):
        raise QueryError('NOT_OBSERVABLE','课表只能证明安排，不能证明实际到课、位置或学习时长。')
    for key in ('where','after_join_where','having'):validate_where(spec.get(key))
    for m in spec.get('metrics',[]):
        if m.get('op') not in ('count','count_where','fraction','count_distinct','sum','mean','median','min','max','first','last','weighted_mean'):raise QueryError('INVALID_METRIC','不支持的汇总方式。')
        if m.get('where'):validate_where(m['where'])
    resource=spec.get('resource','classes');resources=spec.get('resources',[resource])
    rows=[]
    for r in resources:rows += [{'_resource':r,**row} for row in resource_rows(bundle,r,now)]
    start,end,mode=interval(spec,now);unknown_times=0;filtered=[]
    for row in rows:
        if start or end:
            field=(spec.get('time') or {}).get('field','startTime')
            try:a=moment(at(row,field),now);b=moment(at(row,(spec.get('time') or {}).get('end_field','endTime')),now) or a
            except QueryError:a=b=None
            if a is None:unknown_times+=1;continue
            if mode=='starts':keep=(start is None or a>=start) and (end is None or a<end)
            elif mode=='contained':keep=(start is None or a>=start) and (end is None or b<=end)
            elif mode=='overlap':keep=(start is None or b>start or a==b==start) and (end is None or a<end)
            else:raise QueryError('INVALID_TIME_MODE','mode 为 overlap、starts 或 contained。')
            if not keep:continue
        if matches(row,spec.get('where')):filtered.append(row)
    rows=filtered
    calculation_incomplete=any(r.get('complete') is False for r in rows) if resource.startswith('gpa_') else False
    if spec.get('join'):
        j=spec['join'];right=resource_rows(bundle,j['resource'],now);joined=[]
        for left in rows:
            found=[r for r in right if at(left,j['left_on']) is not None and at(left,j['left_on'])==at(r,j['right_on'])]
            if found:
                for r in found:joined.append({**left,j.get('as','joined'):r})
            elif j.get('kind','left')=='left':joined.append({**left,j.get('as','joined'):None})
        rows=joined
        if spec.get('after_join_where'):rows=[r for r in rows if matches(r,spec['after_join_where'])]
    for sort in reversed(spec.get('sort',[])):
        field=sort if isinstance(sort,str) else sort['field'];descending=isinstance(sort,dict) and sort.get('descending',False)
        present=[r for r in rows if at(r,field) is not None];missing=[r for r in rows if at(r,field) is None]
        present.sort(key=lambda r:at(r,field),reverse=descending);rows=present+missing
    if spec.get('distinct'):
        seen=set();unique=[]
        for row in rows:
            key=json.dumps([at(row,f) for f in spec['distinct']],ensure_ascii=False,sort_keys=True)
            if key not in seen:unique.append(row);seen.add(key)
        rows=unique
    op=spec.get('operation','select')
    metric_quality=[]
    if op=='aggregate':
        for m in spec.get('metrics',[]):
            if m['op'] in ('sum','mean','median','weighted_mean'):
                missing=sum(at(r,m['field']) is None for r in rows)
                metric_quality.append({'metric':m.get('as',m['op']+'_'+m['field']),'missing_value_count':missing,
                    'meaning':'aggregates only known numeric values; missing values are not zeros'})
        rows=aggregate(rows,spec.get('group_by',[]),spec.get('metrics',[{'op':'count'}]))
    elif op=='conflicts':
        events=[r for r in rows if r.get('startTime') and r.get('endTime')];pairs=[]
        for i,a in enumerate(events):
            for b in events[i+1:]:
                identity_a=a.get('uid') or a.get('id');identity_b=b.get('uid') or b.get('id')
                if identity_a is not None and identity_a==identity_b and a['_resource']==b['_resource'] and a.get('startTime')==b.get('startTime') and a.get('location')==b.get('location'):continue
                lo=max(moment(a['startTime'],now),moment(b['startTime'],now));hi=min(moment(a['endTime'],now),moment(b['endTime'],now))
                if lo<hi:pairs.append({'first':a,'second':b,'overlap_minutes':(hi-lo).total_seconds()/60})
        rows=pairs
    elif op=='transitions':
        events=sorted([r for r in rows if r.get('startTime') and r.get('endTime')],key=lambda r:r['startTime']);rows=[]
        for a,b in zip(events,events[1:]):
            if a['startTime'][:10]!=b['startTime'][:10]:continue
            rows.append({'first':a,'second':b,'gap_minutes':(moment(b['startTime'],now)-moment(a['endTime'],now)).total_seconds()/60,
                'location_changed':a.get('location')!=b.get('location'),'travel_feasibility':'unknown_without_route_and_mobility_data'})
    elif op=='gaps':
        if start is None or end is None:raise QueryError('TIME_REQUIRED','空闲区间查询需要明确起止。')
        events=sorted([(max(start,moment(r['startTime'],now)),min(end,moment(r['endTime'],now))) for r in rows if r.get('startTime') and r.get('endTime')])
        rows=[];cursor=start
        for a,b in events:
            if a>cursor:rows.append({'startTime':cursor.isoformat(),'endTime':a.isoformat(),'duration_minutes':(a-cursor).total_seconds()/60,'meaning':'no selected scheduled events; not guaranteed personal free time'})
            cursor=max(cursor,b)
        if cursor<end:rows.append({'startTime':cursor.isoformat(),'endTime':end.isoformat(),'duration_minutes':(end-cursor).total_seconds()/60,'meaning':'no selected scheduled events; not guaranteed personal free time'})
    elif op!='select':raise QueryError('INVALID_OPERATION','未知查询操作。')
    if spec.get('having'):rows=[r for r in rows if matches(r,spec['having'])]
    for sort in reversed(spec.get('order_by',[])):
        field=sort if isinstance(sort,str) else sort['field'];descending=isinstance(sort,dict) and sort.get('descending',False)
        present=[r for r in rows if at(r,field) is not None];missing=[r for r in rows if at(r,field) is None]
        present.sort(key=lambda r:at(r,field),reverse=descending);rows=present+missing
    if spec.get('fields'):rows=[{f:at(row,f) for f in spec['fields']} for row in rows]
    total=len(rows);offset=int(spec.get('offset',0));limit=int(spec.get('limit',5))
    if offset<0 or not 1<=limit<=100:raise QueryError('INVALID_LIMIT','offset 非负，limit 为 1–100。')
    selected=rows[offset:offset+limit];redactions=[];selected=credential_filtered(selected,redactions)
    quality=coverage(bundle,resources,start,end)
    if unknown_times:quality['issues'].append('records_with_unresolved_time_excluded');quality['complete']=False
    if calculation_incomplete:quality['issues'].append('gpa_inputs_incomplete');quality['complete']=False
    if any(m['missing_value_count'] for m in metric_quality):quality['issues'].append('aggregate_has_missing_values');quality['complete']=False
    output={'status':'ok' if quality['complete'] else 'partial','resource':resource,'operation':op,
        'evaluated_at':now.isoformat(),'time_interval':{'from':start.isoformat() if start else None,'to':end.isoformat() if end else None,'boundary':'[from,to)','mode':mode},
        'total_matches':total,'offset':offset,'next_offset':offset+len(selected) if offset+len(selected)<total else None,
        'records':selected,'unknown_time_records':unknown_times,'coverage':quality,'credential_redactions':redactions,
        'nested_values_truncated':False,'bundle_id':bundle.get('bundle_id')}
    if metric_quality:output['metric_quality']=metric_quality
    if 'transactions' in resources:output['measurement_notes']=['tranamt/cardBalance retain source units; do not label aggregated values as CNY until the unit is verified.']
    if len(json.dumps(output,ensure_ascii=False).encode())>80000:
        output['records']=[];output['status']='navigate_required';output['message']='匹配对象较大；使用 fields 或更小 limit。原数据未截短。'
    return output
