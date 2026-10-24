"""Fast CLI adapter; Codex handles language, this layer handles precise semantics."""
import json
from pathlib import Path
import datetime as dt
import copy
from client import QueryError,fingerprint
from complete_data import load_bundle
from student_query import execute
import vault

RESOURCES={
 'classes':'逐次计划上课：时间、教室、教师、节次、调课及原日期',
 'courses':'课程：学分、教师、完整上课规则、成绩和考试关联',
 'exams':'期中/期末考试；这次未返回的日期或时刻保留为空并提示',
 'grades':'逐次修读成绩与绩点，不自动丢弃重修或二级制',
 'gpa_semesters':'每学期按学分加权绩点与排除说明',
 'gpa_overall':'全修读/首次/最高/仓库首条等不同总绩点口径',
 'gpa_cumulative':'截至每学期的累计指标','retakes':'同课程重修与选取策略',
 'projects':'实践项目、本人记点、审核状态、角色、时间',
 'practice_summary':'二三四课堂正式记点、学分和通过状态',
 'todos':'作业待办及截止时间','activities':'单课程活动、完成状态和单项分数（learning 数据集）',
 'holidays':'校历明确停课日期','calendar_pending':'尚未公布的补课日期',
 'cancelled_classes':'因校历停课或被补课安排替换的课次',
 'source_status':'源接口采集时间、完整性、分页和错误','records':'collect 数据集完整原记录',
 'transactions':'校园卡流水：时间、原始金额、摘要与余额；不擅自换算金额单位',
 'reservations':'图书馆座位预约：资源、时间、状态；预约不等于实际入馆',
 'reservation_violations':'图书馆违约记录','card_accounts':'校园卡账户、余额与状态',
 'student_profile':'ETA 本人资料','roles':'ETA 本人角色',
}
ENDPOINT_ALIASES={'transactions':'ecard.transactions','reservations':'booking.seats',
    'reservation_violations':'booking.violations','card_accounts':'ecard.cards','student_profile':'eta.profile','roles':'eta.roles'}
DEFAULT_FIELDS={
 'classes':['uid','summary','startTime','endTime','location','teacher','rescheduled','instruction_minutes'],
 'courses':['key','name','semester_id','credit','teachers','confirmed','online'],
 'exams':['id','name','type','startTime','endTime','dateLabel','location','seat','time_precision'],
 'grades':['id','name','semester_id','credit','original','fivePoint','gpaIncluded','gpa_exclusion_reason'],
 'projects':['id','projectName','categoryName','score','statusLabel','approved','countsTowardTotal','activityStart','activityEnd'],
 'todos':['id','name','course','deadline','status'],
 'transactions':['occurred_at','resume','tranamt','cardBalance','amount_unit'],
 'reservations':['id','nameMerge','no','startTime','endTime','statusName','signInTime'],
}


def resolve_bundle(resource,id=None,refresh=False,endpoint_id=None):
    if id:return load_bundle(id)
    target=endpoint_id or ENDPOINT_ALIASES.get(resource)
    if target:
        import zju
        from complete_data import collect_endpoint,save_bundle
        from field_guide import semantic_envelope
        account=fingerprint(vault.credentials()['username'])
        index=vault.load('source-index.dpapi') or {};entry=index.get(account,{}).get(target)
        if entry and not refresh:return load_bundle(entry['bundle_id'])
        e=zju.endpoint(target)
        if e.get('scope')!='self':raise QueryError('PARAMETER_REQUIRED','带课程 ID 的数据请先使用 learning 或 collect。')
        result=collect_endpoint(zju.credential_client(),e,{})
        id=save_bundle({'kind':'source','dataset':result,'normalized':semantic_envelope(result),'account_scope':account})
        return load_bundle(id)
    if refresh:return refresh_academic_resource(resource)
    return latest()


def refresh_academic_resource(resource):
    import zju
    from complete_data import collect_endpoint,save_bundle,utcnow
    from academic_service import normalize_academic
    from academic_calendar import fetch_calendar
    bundle=latest();datasets=copy.deepcopy(bundle['datasets']);n=bundle['normalized'];semester=n['semester_id']
    dependencies={'classes':['timetable_first','timetable_second'],'courses':['timetable_first','timetable_second','grades','major','exams'],
       'grades':['grades','major'],'gpa_overall':['grades','major'],'gpa_semesters':['grades','major'],'gpa_cumulative':['grades','major'],'retakes':['grades','major'],
       'projects':['practice','practice_profile'],'practice_summary':['practice_profile'],'todos':['todos'],'exams':['exams'],
       'holidays':[],'calendar_pending':[],'cancelled_classes':['timetable_first','timetable_second']}
    if resource not in dependencies:raise QueryError('REFRESH_NOT_AVAILABLE','此数据类别请用 collect 或 learning 刷新。')
    client=zju.credential_client();refresh_errors=[]
    for key in dependencies[resource]:
        old=datasets[key];new=collect_endpoint(client,zju.ENDPOINTS[old['endpoint']],old.get('parameters',{}))
        if new['completeness']['complete']:datasets[key]=new
        else:
            old['failed_refresh_attempt']=new;old['freshness']={'stale':True,'reason':'latest_refresh_failed'}
            refresh_errors.append(key)
    calendar=n.get('calendar')
    if resource in ('classes','courses','holidays','calendar_pending','cancelled_classes'):
        try:calendar=fetch_calendar(semester)
        except Exception:
            refresh_errors.append('calendar')
            if calendar:calendar={**calendar,'stale':True}
    normalized=normalize_academic(datasets,calendar,semester)
    normalized['data_quality']['refresh_errors']=refresh_errors
    id=save_bundle({'kind':'academic','datasets':datasets,'normalized':normalized,'calendar':calendar,
         'normalization_status':'complete','account_scope':bundle['account_scope']})
    vault.save('latest-academic.dpapi',{'bundle_id':id,'account_scope':bundle['account_scope'],'created_at':utcnow()})
    return load_bundle(id)


def attach_related(bundle,spec):
    from student_query import resource_rows
    needed=set(spec.get('resources',[spec.get('resource','classes')]))
    if spec.get('join'):needed.add(spec['join']['resource'])
    root=dict(bundle);root['related']=dict(bundle.get('related',{}))
    for resource in needed:
        try:resource_rows(root,resource,dt.datetime.now(dt.timezone.utc))
        except QueryError as error:
            if error.code!='SOURCE_UNAVAILABLE':raise
            if resource not in RESOURCES:continue
            other=resolve_bundle(resource)
            if other.get('bundle_id')!=root.get('bundle_id'):root['related'][resource]=other
    return root


def latest(id=None):
    if id:return load_bundle(id)
    entry=vault.load('latest-academic.dpapi')
    if not entry:raise QueryError('DATASET_REQUIRED','尚无完整学业数据集；先执行 academic --year YYYY-YYYY --term 1。')
    try:account=fingerprint(vault.credentials()['username'])
    except RuntimeError:raise QueryError('CREDENTIALS_REQUIRED','无法确认当前学校账号；请先录入凭据。')
    if account!=entry['account_scope']:raise QueryError('ACCOUNT_SCOPE_MISMATCH','完整数据属于之前的账号，请为当前账号重新同步。')
    return load_bundle(entry['bundle_id'])


def filter_arg(raw):
    parts=raw.split(':',2)
    if len(parts)<2:raise QueryError('INVALID_FILTER','筛选格式为 field:operator:value。')
    field,op=parts[:2];value=parts[2] if len(parts)>2 else None
    if value is not None:
        try:value=json.loads(value)
        except ValueError:pass
    return {'field':field,'op':op,'value':value}


def from_args(args):
    spec={'resource':args.resource,'limit':args.limit,'offset':args.offset,'operation':args.operation}
    if args.window:spec['time']={'window':args.window}
    elif args.start or args.end:spec['time']={'from':args.start,'to':args.end}
    elif args.at:spec['time']={'at':args.at}
    if 'time' in spec:spec['time']['mode']=args.time_mode
    if args.fields and args.fields!='*':spec['fields']=args.fields.split(',')
    elif not args.fields and args.resource in DEFAULT_FIELDS and args.operation=='select' and not args.metric:spec['fields']=DEFAULT_FIELDS[args.resource]
    if args.filter:spec['where']={'and':[filter_arg(x) for x in args.filter]}
    if args.sort:spec['sort']=[{'field':x.removeprefix('-'),'descending':x.startswith('-')} for x in args.sort.split(',')]
    if args.group:spec['group_by']=args.group.split(',')
    if args.metric:
        spec['operation']='aggregate';spec['metrics']=[]
        for raw in args.metric:
            parts=raw.split(':');item={'op':parts[0]}
            if len(parts)>1:item['field']=parts[1]
            if len(parts)>2:item['weight']=parts[2]
            spec['metrics'].append(item)
        if spec.get('sort'):spec['order_by']=spec.pop('sort')
    return spec
