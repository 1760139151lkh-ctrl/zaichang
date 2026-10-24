"""Explained academic models based on Celechron, with explicit uncertainty.

Grade/session/course/exam/practice fields retain the repository's semantics.
Every normalized object links to an unabridged encrypted source record.
"""
import datetime as dt
from decimal import Decimal,InvalidOperation
import hashlib
import html
import json
import re
from collections import defaultdict

ZONE=dt.timezone(dt.timedelta(hours=8))
SCORE_EQUIVALENTS={'A+':95,'A':90,'A-':87,'B+':83,'B':80,'B-':77,'C+':73,'C':70,'C-':67,'D':60,'F':0,
    '优秀':90,'良好':80,'中等':70,'及格':60,'不及格':0,'合格':75,'不合格':0,'弃修':0,'缺考':0,'缓考':0,'待录':0,'无效':0}
FOUR43={Decimal('5'):Decimal('4.3'),Decimal('4.8'):Decimal('4.2'),Decimal('4.5'):Decimal('4.1'),Decimal('4.2'):Decimal('4')}


def number(x):
    try:
        d=Decimal(str(x));return float(d) if d.is_finite() else None
    except (InvalidOperation,TypeError,ValueError):return None
def text(x):return None if x is None or str(x).strip()=='' else str(x).strip()
def boolean(x):
    if isinstance(x,bool):return x
    if x in (1,'1','true','True'):return True
    if x in (0,'0','false','False'):return False
    return None
def title(x):return str(x or '').replace('(','（').replace(')','）').strip()
def uid(x):return hashlib.sha256(json.dumps(x,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:20]
def term_id(id):
    m=re.search(r'\((\d{4}-\d{4}-[12])\)',str(id or ''));return m[1] if m else None
def course_code(id):
    m=re.search(r'\([^)]*\)-([^-]+)',str(id or ''));return m[1] if m else None
def ref(dataset,index):return {'dataset':dataset['endpoint'],'dataset_key':dataset.get('dataset_key'),
    'record_index':index,'pointer':dataset['record_refs'][index]}


def grade(row,source,major_ids=()):
    id=text(row.get('xkkh'));original=text(row.get('cj'));credit=number(row.get('xf'));gp=number(row.get('jd'))
    issues=[]
    if id is None:issues.append('missing_course_id')
    if credit is None:issues.append('missing_credit')
    if gp is None:issues.append('missing_grade_point')
    elif not 0<=gp<=5:issues.append('grade_point_out_of_range')
    if credit is not None and credit<0:issues.append('negative_credit')
    if original is None:issues.append('missing_score')
    numeric=number(original)
    equiv=numeric if numeric is not None else SCORE_EQUIVALENTS.get(original)
    credit_included=original not in ('弃修','待录','缓考','无效') and original is not None
    gpa_included=credit_included and original not in ('合格','不合格') and 'xtwkc' not in (id or '')
    exclusion=None
    if not gpa_included:exclusion='二级制或校外课程不计绩点' if credit_included else '弃修/待录/缓考/无效或成绩未提供'
    if gpa_included and (credit is None or gp is None):exclusion='缺少学分或绩点，汇总不完整'
    gp43=None if gp is None else float(FOUR43.get(Decimal(str(gp)),Decimal('4'))) if gp>4 else gp
    gp4=None if gp is None else min(4,gp)
    code=course_code(id)
    # Celechron keeps separate PE attempts across semesters.
    repeat_key=(term_id(id) or '')+':'+code if code and code.startswith(('PPAE','401')) else code
    return {'id':id,'course_code':code,'repeat_group':repeat_key or id,'name':title(row.get('kcmc')),
        'semester_id':term_id(id),'credit':credit,'original':original,'fivePoint':gp,'fourPoint':gp43,
        'fourPointLegacy':gp4,'hundredPoint':equiv,'hundredPoint_kind':'numeric_source' if numeric is not None else 'repository_equivalent',
        'gpaIncluded':gpa_included,'creditIncluded':credit_included,'major':id in major_ids,'isOnline':None,
        'earnedCredit':credit if credit_included and ((gp is not None and gp!=0) or original=='合格' or 'xtwkc' in (id or '')) else 0,
        'earnedCredit_repository':credit if credit_included and gp is not None and (gp!=0 or 'xtwkc' in (id or '')) else 0,
        'gpa_exclusion_reason':exclusion,'quality_issues':issues,'source_ref':source}


def gpa_stats(grades):
    eligible=[g for g in grades if g['gpaIncluded']]
    included=[g for g in eligible if g['credit'] is not None and g['fivePoint'] is not None and g['credit']>0 and 0<=g['fivePoint']<=5]
    omitted=[g['id'] for g in eligible if g['credit'] is None or g['fivePoint'] is None or g['credit']<0 or not 0<=g['fivePoint']<=5]
    denominator=sum((Decimal(str(g['credit'])) for g in included),Decimal(0))
    values={}
    for field in ['fivePoint','fourPoint','fourPointLegacy','hundredPoint']:
        if denominator==0 or any(g[field] is None for g in included):values[field]=None
        else:values[field]=float(sum((Decimal(str(g['credit']))*Decimal(str(g[field])) for g in included),Decimal(0))/denominator)
    return {'gpa':values,'gpa_credit_denominator':float(denominator),'eligible_attempts':len(eligible),
        'counted_attempts':len(included),'earned_credits_sum_attempts':sum(g['earnedCredit'] or 0 for g in grades),
        'excluded_attempts':[{'id':g['id'],'reason':g['gpa_exclusion_reason']} for g in grades if not g['gpaIncluded']],
        'incomplete_attempts':omitted,'complete':not omitted,
        'zero_credit_attempts':[g['id'] for g in eligible if g['credit']==0],
        'formula':'sum(grade_point * course_credit) / sum(included_course_credit)'}


def transcript(dataset,major=None):
    majors={r.get('xkkh') for r in (major or {}).get('records',[])}
    grades=[grade(r,ref(dataset,i),majors) for i,r in enumerate(dataset['records'])]
    semesters=defaultdict(list);groups=defaultdict(list)
    for g in grades:semesters[g['semester_id'] or 'unclassified'].append(g);groups[g['repeat_group'] or g['name']].append(g)
    first=[];highest=[];repository_first=[];repeats=[]
    for key,gs in groups.items():
        ordered=sorted(gs,key=lambda g:g['semester_id'] or '9999')
        best=max(gs,key=lambda g:g['hundredPoint'] if g['hundredPoint'] is not None else -1)
        first.append(ordered[0]);highest.append(best);repository_first.append(gs[0])
        if len(gs)>1:repeats.append({'course_group':key,'attempt_ids':[g['id'] for g in ordered],
            'first_attempt_id':ordered[0]['id'],'highest_attempt_id':best['id'],
            'chronology_quality':'semester_only; same-semester order unresolved'})
    by_semester=[{'semester_id':k,'grade_ids':[g['id'] for g in gs],**gpa_stats(gs)} for k,gs in sorted(semesters.items())]
    cumulative=[];running=[]
    for k,gs in sorted(semesters.items()):
        running+=gs;cumulative.append({'through_semester':k,**gpa_stats(running)})
    all_stats=gpa_stats(grades)
    result={'grades':grades,'semesters':by_semester,'overall_all_attempts':all_stats,
        'overall_first_attempt':gpa_stats(first),'overall_highest_attempt':gpa_stats(highest),
        'overall_repository_first_response':gpa_stats(repository_first),
        'major':{'source_complete':(major or {}).get('completeness',{}).get('complete',False),**gpa_stats([g for g in grades if g['major']])},
        'repeat_groups':repeats,'cumulative_by_semester_all_attempts':cumulative,
        'failed_attempts':[g['id'] for g in grades if g['gpaIncluded'] and g['fivePoint']==0],
        'credit_warning':'earned_credits_sum_attempts may double-count retakes; highest-attempt view is separate.',
        'policy':'Celechron-derived analytical GPA; official graduate recommendation/retake rules may differ.',
        'source_complete':dataset['completeness']['complete'],'quality_issues':[{'id':g['id'],'issues':g['quality_issues']} for g in grades if g['quality_issues']]}
    for stats in [*by_semester,*cumulative,result['overall_all_attempts'],result['overall_first_attempt'],
                  result['overall_highest_attempt'],result['overall_repository_first_response']]:
        stats['source_complete']=dataset['completeness']['complete']
        stats['complete']=stats['complete'] and stats['source_complete']
    return result


def location(raw):
    raw=text(raw)
    if not raw:return {'raw':None,'campus':None,'building':None,'room':None,'display_address':None,'precision':'unknown'}
    norm=raw.translate(str.maketrans({'－':'-','—':'-','–':'-','−':'-'}))
    campus=next((c for c in ['紫金港','玉泉','西溪','华家池','之江','海宁'] if c in norm),None)
    head,sep,room=norm.partition('-');building=head.replace(campus,'',1).strip() if campus else head
    mapped=building
    if campus=='紫金港':
        m=re.fullmatch(r'([东西北])([1-6])([AB]?)',building)
        if m:mapped=m[1]+'一二三四五六'[int(m[2])-1]+'教学楼'+(m[3]+'区' if m[3] else '')
        elif building=='蒙民伟':mapped='蒙民伟楼'
    online='线上' in norm or '在线' in norm
    return {'raw':raw,'campus':campus,'building':mapped or None,'room':room.strip() if sep else None,
        'display_address':('浙江大学'+campus+'校区'+mapped+(' '+room+'教室' if sep else '')) if campus else raw,
        'precision':'online' if online else 'room' if sep and room else 'source_text',
        'coordinates':None,'coordinate_note':'No coordinates inferred from room text.'}


def session(row,source,semester_id):
    raw=str(row.get('kcb') or '');parts=re.split(r'<br\s*/?>',raw,flags=re.I)
    strip=lambda s:html.unescape(re.sub(r'<[^>]+>','',s)).strip()
    name=title(strip(parts[0])) if parts else ''
    recurrence=strip(parts[1]) if len(parts)>1 else None
    teacher=strip(parts[2]) if len(parts)>2 else None
    loc=strip(parts[3].split('zwf')[0]) if len(parts)>3 else None
    first=number(row.get('djj'));count=number(row.get('skcd'));weekday=number(row.get('xqj'))
    times=list(range(int(first),int(first+count))) if first and count and count>0 else []
    halves=str(row.get('xxq') or '')
    weeks=None
    if recurrence:
        normalized_recurrence=recurrence.translate(str.maketrans({'—':'-','–':'-','－':'-','～':'-','~':'-'}))
        m=re.search(r'第([\d,，、\-]+)周',normalized_recurrence)
        if m:
            weeks=[]
            for part in re.split('[,，、]',m[1]):
                ends=re.split('[-－~～]',part)
                if len(ends)==2:weeks+=list(range(int(ends[0]),int(ends[1])+1))
                elif part.isdigit():weeks.append(int(part))
    issues=[]
    if len(parts)<4:issues.append('course_block_unparsed')
    if not times:issues.append('missing_period_numbers')
    if weekday is None or not 1<=weekday<=7:issues.append('invalid_weekday')
    if not loc:issues.append('missing_location')
    if not any(h in halves for h in ('秋','冬','春','夏')):issues.append('unknown_half_semester')
    if str(row.get('sfyjskc'))=='1':issues.append('graduate_course_requires_grs_adapter')
    cid=text(row.get('xkkh'))
    # The source often omits xkkh; stable grouping stays explicit and auditable.
    identity=cid or semester_id+':'+name
    return {'id':cid,'uid':uid([identity,teacher,loc,weekday,times,halves,row.get('dsz'),weeks]),
        'course_key':identity,'semester_id':semester_id,'name':name,'teacher':teacher,'teacherId':text(row.get('jszgh')),
        'location':loc,'location_details':location(loc),'confirmed':str(row.get('sfqd'))=='1',
        'day':int(weekday) if weekday is not None else None,'time':times,
        'firstHalf':'秋' in halves or '春' in halves,'secondHalf':'冬' in halves or '夏' in halves,
        'oddWeek':str(row.get('dsz'))!='1','evenWeek':str(row.get('dsz'))!='0',
        'customRepeat':weeks is not None,'customRepeatWeeks':weeks or [],'week_scope':'each_short_term',
        'credit':None,'online':True if loc and '线上' in loc else None,'type':None,
        'recurrence_text':recurrence,'embedded_exam_texts':raw.split('zwf')[1:] if 'zwf' in raw else [],
        'source_refs':[source],'quality_issues':issues}


def exams(dataset):
    result=[]
    for index,row in enumerate(dataset['records']):
        for kind,tk,lk,sk in [('midterm','qzkssj','qzjsmc','qzzwxh'),('final','kssj','jsmc','zwxh')]:
            label=text(row.get(tk))
            if not label:continue
            date=re.search(r'(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})',label)
            times=re.search(r'(\d{1,2}:\d{2})\s*[-–—~～至]\s*(\d{1,2}:\d{2})',label)
            start=end=None;issues=[]
            try:
                if date and times:
                    d=dt.date(*(int(v) for v in date.groups()))
                    start=dt.datetime.combine(d,dt.time.fromisoformat(times[1]),ZONE).isoformat()
                    end=dt.datetime.combine(d,dt.time.fromisoformat(times[2]),ZONE).isoformat()
                else:issues.append('exact_date_or_time_unresolved')
            except ValueError:issues.append('unparsed_date_time')
            result.append({'id':text(row.get('xkkh')),'name':title(row.get('kcmc')),'credit':number(row.get('xf')),
                'semester_id':term_id(row.get('xkkh')),'type':kind,'time':[start,end] if start else [],
                'startTime':start,'endTime':end,'dateLabel':label,'location':text(row.get(lk)),
                'location_details':location(row.get(lk)),'seat':text(row.get(sk)),
                'time_precision':'exact_from_source' if start else 'unresolved','quality_issues':issues,'source_ref':ref(dataset,index)})
    return result


def practice(dataset,profile_dataset):
    result=[]
    for i,row in enumerate(dataset['records']):
        project=row.get('xm') or {};cat=project.get('xmfl') or {};status=row.get('cyrshzt') or {}
        cid=number(cat.get('id')) or {'第二课堂':1,'第三课堂':2,'第四课堂':3}.get(cat.get('mc'));label=text(status.get('label')) or text((row.get('currentState') or {}).get('name'))
        score=number(row.get('jd'));approved=number(status.get('value'))==5 or label=='审核通过';deleted=boolean(row.get('sfsc')) is True
        result.append({'id':row.get('id'),'categoryId':cid,'categoryName':cat.get('mc'),
            'projectName':project.get('mc'),'projectType':(project.get('xmlb') or {}).get('mc'),
            'qualityType':(project.get('xmlx') or {}).get('mc'),'score':score,'statusValue':number(status.get('value')),
            'statusLabel':label,'approved':approved,'deleted':deleted,'role':row.get('hdjjygrcdgz'),
            'remark':row.get('qksm'),'activityStart':row.get('hdsj'),'activityEnd':row.get('hdjssj'),
            'updatedAt':row.get('gxsj'),'countsTowardTotal':approved and not deleted and cid in (1,2,3) and score is not None and score>=0,
            'source_ref':ref(dataset,i)})
    profile=profile_dataset['records'][0] if profile_dataset['records'] else {}
    totals={str(c):sum(x['score'] for x in result if x['countsTowardTotal'] and x['categoryId']==c) for c in (1,2,3)}
    formal={k:profile.get(k) for k in ('dektJf','dsktJf','dsiktJf','dektXf','dsktXf','dsiktXf','dektDj','dsktDj','dsiktDj','dektTg','dsktTg','dsiktTg','myTg','lyTg')}
    return {'items':result,'calculated_approved_points':totals,'official_summary':formal,
        'source_complete':dataset['completeness']['complete'],'formal_summary_source':'sztz.profile/extend.myInfo',
        'note':'jd/Jf are practice points; Xf is credit. Project range scores are not the student-earned score.'}
