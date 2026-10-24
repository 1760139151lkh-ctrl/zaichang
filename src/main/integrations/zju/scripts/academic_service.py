"""Collect complete academic datasets, then construct explained semantic views."""
import copy
import datetime as dt
import json
import vault
from collections import defaultdict

from complete_data import collect_endpoint,save_bundle,utcnow,load_bundle
from academic_models import transcript,session,exams,practice,ref,title,term_id,uid,location,course_code,number
from academic_calendar import fetch_calendar,merge_sessions,expand
from client import QueryError,fingerprint


def empty_dataset(id,error):
    return {'endpoint':id,'records':[],'record_refs':[],'pages':[],
        'completeness':{'complete':False,'record_count':0},'issues':[{'code':error}]}


def normalize_academic(datasets,calendar,semester):
    for key,d in datasets.items():d['dataset_key']=key
    grades=transcript(datasets['grades'],datasets['major'])
    tests=exams(datasets['exams'])
    rules=[]
    for key in ['timetable_first','timetable_second']:
        d=datasets[key]
        rules += [session(r,ref(d,i),semester) for i,r in enumerate(d['records'])]
    rules=merge_sessions(rules)
    if calendar is not None:
        schedule=expand(rules,calendar)
    else:
        schedule={'occurrences':[],'cancelled_by_calendar':[],'conflicts':[],'pending_calendar_events':[],
            'unresolved_rules':[{'session_uid':s['uid'],'issues':['calendar_unavailable']} for s in rules],
            'coverage':{'rule_count':len(rules),'occurrence_count':0,'generated_all_resolvable_rules':False,
                        'calendar_is_officially_crosschecked':False,'all_future_dates_final':False}}
    courses={}
    def ensure(key,name,sem):
        if key not in courses:
            courses[key]={'id':None,'key':key,'name':name,'semester_id':sem,'confirmed':None,'credit':None,
                'grade':None,'grades':[],'teacher':None,'teachers':[],'sessions':[],'exams':[],'online':None,'type':None,
                'occurrence_uids':[],'join_basis':[],'source_refs':[]}
        return courses[key]
    # Build from source IDs where possible; otherwise retain semester/name key.
    for rule in rules:
        course=ensure(rule['course_key'],rule['name'],semester)
        course['id']=rule['id'];course['confirmed']=rule['confirmed'];course['sessions'].append(rule)
        if rule['teacher'] and rule['teacher'] not in course['teachers']:course['teachers'].append(rule['teacher'])
        course['source_refs']+=rule['source_refs']
    def match(name,sem,id):
        exact=[c for c in courses.values() if id and c['id']==id]
        if len(exact)==1:return exact[0],'source_id'
        named=[c for c in courses.values() if c['semester_id']==sem and c['name']==name]
        if len(named)==1:return named[0],'unique_semester_and_title'
        key=id or (sem or 'unclassified')+':'+name
        return ensure(key,name,sem),'new_record_no_unique_match' if named else 'source_record'
    for g in grades['grades']:
        c,basis=match(g['name'],g['semester_id'],g['id']);c['grades'].append(g);c['grade']=g;c['credit']=g['credit']
        c['id']=c['id'] or g['id'];c['source_refs'].append(g['source_ref']);c['join_basis'].append(basis)
    for test in tests:
        c,basis=match(test['name'],test['semester_id'],test['id']);c['exams'].append(test)
        if c['credit'] is None:c['credit']=test['credit']
        c['id']=c['id'] or test['id'];c['source_refs'].append(test['source_ref']);c['join_basis'].append(basis)
    exam_dtos=[]
    for i,row in enumerate(datasets['exams']['records']):
        id=row.get('xkkh');name=title(row.get('kcmc'));sem=term_id(id)
        c,basis=match(name,sem,id)
        if c['credit'] is None:c['credit']=number(row.get('xf'))
        c['id']=c['id'] or id
        dto={'id':id,'name':name,'credit':number(row.get('xf')),'semester_id':sem,
             'exams':[e for e in tests if e['source_ref']['record_index']==i],
             'source_ref':ref(datasets['exams'],i),'schedule_state':'published' if any(e['source_ref']['record_index']==i for e in tests) else 'no_exam_time_returned'}
        exam_dtos.append(dto);c['source_refs'].append(dto['source_ref'])
    for c in courses.values():
        c['course_code']=course_code(c['id'])
        c['teacher']=c['teachers'][0] if len(c['teachers'])==1 else None
        c['occurrence_uids']=[o['uid'] for o in schedule['occurrences'] if o['course_key']==c['key']]
        if c['confirmed'] is None:c['confirmed']=True if c['grade'] or c['exams'] else None
    todos=[]
    for i,row in enumerate(datasets.get('todos',{}).get('records',[])):
        todos.append({'id':row.get('id'),'name':row.get('title'),'course':row.get('course_name'),
            'course_id':row.get('course_id'),'endTime':row.get('end_time'),'startTime':row.get('start_time'),
            'is_student':row.get('is_student'),'type':row.get('type',row.get('activity_type')),
            'status':row.get('status'),'source_ref':ref(datasets['todos'],i),
            'detail_fields':row})
    practice_data=practice(datasets.get('practice',empty_dataset('sztz.practice','NOT_REQUESTED')),
        datasets.get('practice_profile',empty_dataset('sztz.profile','NOT_REQUESTED')))
    semantic={'schema_version':2,'semester_id':semester,'timezone':'Asia/Shanghai','courses':list(courses.values()),
        'sessions':rules,'occurrences':schedule['occurrences'],'exams':tests,'exam_course_records':exam_dtos,'transcript':grades,
        'todos':todos,'practice':practice_data,'calendar':calendar,'schedule_quality':{k:v for k,v in schedule.items() if k!='occurrences'},
        'data_quality':{'source_datasets':{k:d['completeness'] for k,d in datasets.items()},
            'all_requested_sources_complete':all(d['completeness']['complete'] for d in datasets.values()),
            'unknown_fields_retained_in_raw':True,'all_future_schedule_details_final':schedule['coverage'].get('all_future_dates_final',False)},
        'scope':{'academic_year':semester[:9],'long_term':semester[-1],
            'grades':'all API-visible grade attempts, all pages','exams':'all API-visible exam records, all pages',
            'timetable':'both short terms within requested long term','learning_details':'separate learning command per own course',
            'local_only_celechron_data':'manual tasks and custom course mappings are not on school APIs; require an explicit local export'}}
    semester_keys=sorted(set([semester]+[g['semester_id'] for g in grades['grades'] if g['semester_id']]))
    semantic['semesters']=[{'id':sid,'courses':[c['key'] for c in courses.values() if c['semester_id']==sid],
        'grades':[g['id'] for g in grades['grades'] if g['semester_id']==sid],
        'exams':[i for i,e in enumerate(tests) if e['semester_id']==sid],
        'sessions':[s['uid'] for s in rules] if sid==semester else [],
        'gpa':next((s['gpa'] for s in grades['semesters'] if s['semester_id']==sid),None),
        'credits':next((s['earned_credits_sum_attempts'] for s in grades['semesters'] if s['semester_id']==sid),None),
        'name':sid[:9]+('秋冬' if sid.endswith('-1') else '春夏'),
        'calendar_ref':'/normalized/calendar' if sid==semester else None} for sid in semester_keys]
    return semantic


def sync_academic(client,endpoints,year,long_term='1',progress=None):
    semester=year+'-'+long_term
    seasons=['1|秋','1|冬'] if long_term=='1' else ['2|春','2|夏']
    spec=[('grades','zdbk.grades',{}),('major','zdbk.major',{}),('exams','zdbk.exams',{}),
          ('timetable_first','zdbk.timetable',{'xnm':year,'xqm':seasons[0]}),
          ('timetable_second','zdbk.timetable',{'xnm':year,'xqm':seasons[1]}),
          ('practice','sztz.practice',{}),('practice_profile','sztz.profile',{}),('todos','courses.todos',{})]
    datasets={}
    for key,id,params in spec:
        d=collect_endpoint(client,endpoints[id],params)
        datasets[key]=d
        if progress:progress(key,d['completeness'])
    try:calendar=fetch_calendar(semester)
    except Exception:calendar=None
    id=save_bundle({'kind':'academic','datasets':datasets,'normalized':{},'calendar':calendar,'normalization_status':'pending','account_scope':fingerprint(client.username)})
    try:normalized=normalize_academic(datasets,calendar,semester)
    except Exception as error:
        return {'status':'partial','bundle_id':id,'raw_data_preserved':True,'normalization_error_type':type(error).__name__,
            'message':'源数据已完整保留，整理过程需要修复；不丢弃原始数据。'}
    bundle=load_bundle(id);bundle['normalized']=normalized;bundle['normalization_status']='complete'
    vault.save('datasets/'+id+'.dpapi',bundle)
    vault.save('latest-academic.dpapi',{'bundle_id':id,'account_scope':fingerprint(client.username),'created_at':utcnow()})
    return manifest(id,normalized)


def manifest(id,normalized):
    return {'status':'ok' if normalized['data_quality']['all_requested_sources_complete'] else 'partial','bundle_id':id,
        'schema_version':2,'source_values_saved':'full encrypted raw JSON and exact response bodies',
        'semester_id':normalized['semester_id'],
        'counts':{k:len(normalized[k]) for k in ['courses','sessions','occurrences','exams','todos']},
        'grade_attempts':len(normalized['transcript']['grades']),'practice_projects':len(normalized['practice']['items']),
        'data_quality':normalized['data_quality'],'schedule_coverage':normalized['schedule_quality']['coverage'],
        'sections':{'courses':'/normalized/courses','each_class_meeting':'/normalized/occurrences',
            'grades':'/normalized/transcript/grades','semester_gpa':'/normalized/transcript/semesters',
            'overall_gpa':'/normalized/transcript/overall_all_attempts','practice':'/normalized/practice',
            'exams':'/normalized/exams','raw':'/datasets','pending_dates':'/normalized/schedule_quality/pending_calendar_events'},
        'read_command':'zju.py read --bundle '+id+' --pointer /normalized/occurrences --limit 5'}


def learning(client,endpoints,course_id,authorize):
    authorize(client,endpoints['courses.activities'],{'course_id':course_id})
    datasets={}
    for key in ['activities','activity_scores','homeworks','exam_scores','exams']:
        datasets[key]=collect_endpoint(client,endpoints['courses.'+key],{'course_id':course_id})
        datasets[key]['dataset_key']=key
    activities={}
    for key,d in datasets.items():
        for i,row in enumerate(d['records']):
            id=str(row.get('activity_id',row.get('id')))
            activities.setdefault(id,{'activity_id':id,'course_id':course_id,'name':None,'type':None,
                'starts_at':None,'deadline':None,'scores':[],'completion':[],'source_records':[]})
            a=activities[id];a['name']=row.get('title',a['name']);a['type']=row.get('type',row.get('activity_type',a['type']))
            a['starts_at']=row.get('start_time',a['starts_at']);a['deadline']=row.get('end_time',a['deadline'])
            if key in ('exam_scores','activity_scores'):
                score=row.get('score',(row.get('data') or {}).get('score'))
                a['scores'].append({'value':score,'source':key,'source_ref':ref(d,i)})
                if key=='activity_scores':a['completion'].append({'completeness':row.get('completeness'),'data':row.get('data'),'source_ref':ref(d,i)})
            a['source_records'].append({'category':key,'fields':row,'source_ref':ref(d,i)})
    normalized={'course_id':course_id,'activities':list(activities.values()),'source_completeness':{k:v['completeness'] for k,v in datasets.items()}}
    id=save_bundle({'kind':'learning','datasets':datasets,'normalized':normalized})
    return {'status':'ok' if all(v['completeness']['complete'] for v in datasets.values()) else 'partial',
        'bundle_id':id,'activities':len(activities),'source_completeness':normalized['source_completeness'],
        'read_pointer':'/normalized/activities','nested_values_truncated':False}
