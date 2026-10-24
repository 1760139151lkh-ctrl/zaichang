"""Expand semester recurrence with dated provenance; never invent missing times."""
import datetime as dt
import hashlib
import json
import re
import urllib.request
from pathlib import Path
from academic_models import ZONE,uid


def fetch_calendar(semester):
    if not re.fullmatch(r'20\d{2}-20\d{2}-[12]',semester):raise ValueError('invalid semester')
    # Public calendar only: isolated opener, no school credentials/cookies/session.
    url='http://calendar.celechron.top/'+semester+'.json'
    opener=urllib.request.build_opener(urllib.request.ProxyHandler())
    with opener.open(url,timeout=15) as response:
        raw=response.read(1024*1024+1)
        if len(raw)>1024*1024:raise ValueError('calendar too large')
        data=json.loads(raw)
    validate_calendar(data)
    result={'data':data,'source_url':url,'sha256':hashlib.sha256(raw).hexdigest(),
        'fetched_at':dt.datetime.now(dt.timezone.utc).isoformat(),'authority':'Celechron published calendar configuration',
        'transport':'public_http_without_credentials','official_crosscheck':'not_verified',
        'scope':'mainland ordinary 45-minute class timetable; campus/program exceptions must be checked'}
    profile_path=Path(__file__).resolve().parent.parent/'references/calendars'/f'{semester}.json'
    if profile_path.exists():
        profile=json.loads(profile_path.read_text(encoding='utf8'))
        result['official_profile']=profile
        result['repository_data']=json.loads(json.dumps(data))
        data.setdefault('holiday',{}).update(profile['holidays_add'])
        data['academic_breaks']=profile.get('academic_breaks',[])
        result['official_crosscheck']='verified' if result['sha256']==profile['compared_repository_config_sha256'] else 'source_changed_recheck_required'
        result['pending_makeup']=profile['pending_makeup']
    return result


def day(s):return dt.datetime.strptime(s,'%Y%m%d').date() if re.fullmatch(r'\d{8}',s) else dt.date.fromisoformat(s)
def validate_calendar(c):
    if len(c.get('startEnd',[]))!=4:raise ValueError('calendar requires four boundaries')
    bounds=list(map(day,c['startEnd']))
    if not bounds[0]<=bounds[1]<bounds[2]<=bounds[3]:raise ValueError('invalid term boundaries')
    if (bounds[-1]-bounds[0]).days>240:raise ValueError('calendar too long')
    times=c.get('sessionTime',[])
    if not isinstance(times,list) or len(times)<2:raise ValueError('missing period times')
    for n,pair in enumerate(times):
        if len(pair)!=2:raise ValueError('invalid period pair')
        a,b=map(dt.time.fromisoformat,pair)
        if n and a>=b:raise ValueError('non-positive class period')


def merge_sessions(sessions):
    # Preserve each source rule and its provenance. Exact duplicate rules only.
    out={}
    for s in sessions:
        if s['uid'] in out:out[s['uid']]['source_refs']+=s['source_refs']
        else:out[s['uid']]=s
    groups={}
    for s in out.values():
        key=json.dumps([s['course_key'],s['teacher'],s['location'],s['day'],s['firstHalf'],s['secondHalf'],
                        s['oddWeek'],s['evenWeek'],s['customRepeatWeeks'],s['confirmed']],ensure_ascii=False)
        groups.setdefault(key,[]).append(s)
    merged=[]
    for group in groups.values():
        group.sort(key=lambda s:s['time'][0] if s['time'] else -1)
        current=None
        for s in group:
            if current is not None and current['time'] and s['time'] and s['time'][0]<=current['time'][-1]+1:
                current['time']=sorted(set(current['time']+s['time']));current['source_refs']+=s['source_refs']
                current['uid']=uid([current['course_key'],current['day'],current['time'],current['location'],current['teacher'],
                    current['firstHalf'],current['secondHalf'],current['oddWeek'],current['evenWeek'],current['customRepeatWeeks']])
            else:
                current=json.loads(json.dumps(s));merged.append(current)
    return merged


def expand(sessions,calendar):
    config=calendar['data'];validate_calendar(config)
    bounds=list(map(day,config['startEnd']));holidays={day(k):v for k,v in config.get('holiday',{}).items()}
    swaps={}
    one_way=set(calendar.get('official_profile',{}).get('one_way_exchanges',[]));replaced_days=set()
    for key,label in config.get('exchange',{}).items():
        if not re.fullmatch(r'\d{16}',key):raise ValueError('invalid exchange dates')
        a,b=day(key[:8]),day(key[8:]);swaps[a]=(b,label)
        if key in one_way:replaced_days.add(b)
        else:swaps[b]=(a,label)
    occurrences=[];cancelled=[];unresolved=[]
    for s in sessions:
        if s['quality_issues'] and any(x in s['quality_issues'] for x in ('missing_period_numbers','invalid_weekday','unknown_half_semester','course_block_unparsed','graduate_course_requires_grs_adapter')):
            unresolved.append({'session_uid':s['uid'],'issues':s['quality_issues']});continue
        if not s['confirmed']:
            unresolved.append({'session_uid':s['uid'],'issues':['enrollment_not_confirmed']});continue
        # Refuse main-campus time assumptions for special programs/campuses.
        unsupported=s['location_details']['campus']=='海宁' or '工程师学院' in (s['location'] or '')
        if unsupported:
            unresolved.append({'session_uid':s['uid'],'issues':['campus_specific_period_times_required']});continue
        for half,enabled in [(0,s['firstHalf']),(1,s['secondHalf'])]:
            if not enabled:continue
            start,end=bounds[half*2:half*2+2]
            d=start
            while d<=end:
                week=((d-start).days+start.weekday())//7+1
                odd=week%2==1
                matches=(d.isoweekday()==s['day'] and ((odd and s['oddWeek']) or (not odd and s['evenWeek'])))
                if s['customRepeatWeeks'] and week not in s['customRepeatWeeks']:matches=False
                if matches:
                    if d in replaced_days and d not in swaps:
                        cancelled.append({'session_uid':s['uid'],'original_date':str(d),'reason':'该日期按官方补课安排授其他日期的课'})
                    elif d in holidays and d not in swaps:
                        cancelled.append({'session_uid':s['uid'],'original_date':str(d),'reason':holidays[d]})
                    else:
                        actual,reason=swaps.get(d,(d,None));period_times=[];missing=False
                        for n in s['time']:
                            if n<1 or n>=len(config['sessionTime']):missing=True;break
                            a,b=config['sessionTime'][n]
                            period_times.append({'period':n,'startTime':dt.datetime.combine(actual,dt.time.fromisoformat(a),ZONE).isoformat(),
                                'endTime':dt.datetime.combine(actual,dt.time.fromisoformat(b),ZONE).isoformat()})
                        if missing:
                            unresolved.append({'session_uid':s['uid'],'issues':['period_time_missing']})
                        else:
                            occurrences.append({'uid':uid([s['uid'],str(actual)]),'fromUid':s['uid'],'course_key':s['course_key'],
                                'type':'classes','summary':s['name'],'description':'教师: '+str(s['teacher'] or '未提供'),
                                'teacher':s['teacher'],'location':s['location'],'location_details':s['location_details'],
                                'startTime':period_times[0]['startTime'],'endTime':period_times[-1]['endTime'],
                                'timezone':'Asia/Shanghai','periods':period_times,'short_term_index':half+1,'week_in_short_term':week,
                                'original_date':str(d),'actual_date':str(actual),'rescheduled':actual!=d,'reschedule_reason':reason,
                                'time_precision':'minute_resolution_derived_from_source_calendar',
                                'calendar_source':calendar['source_url'],'calendar_sha256':calendar['sha256'],
                                'period_times_officially_verified':all(n in calendar.get('official_profile',{}).get('verified_periods',[]) for n in s['time']),
                                'source_refs':s['source_refs'],'location_precision':s['location_details']['precision']})
                d+=dt.timedelta(days=1)
    # Collapse duplicate cross-query instances, preserving original source refs.
    unique={}
    for o in occurrences:
        key=(o['course_key'],o['startTime'],o['endTime'],o['location'],o['teacher'])
        if key in unique:unique[key]['source_refs']+=o['source_refs']
        else:unique[key]=o
    occurrences=sorted(unique.values(),key=lambda o:(o['startTime'],o['course_key']))
    conflicts=[]
    for i,a in enumerate(occurrences):
        for b in occurrences[i+1:]:
            if b['startTime']>=a['endTime']:break
            if a['course_key']!=b['course_key']:
                conflicts.append({'first_uid':a['uid'],'second_uid':b['uid'],'date':a['actual_date'],'type':'time_overlap'})
    pending=[]
    for event in calendar.get('pending_makeup',[]):
        affected=[c['session_uid'] for c in cancelled if c['original_date']==event['original_date']]
        pending.append({**event,'affected_session_uids':affected})
    return {'occurrences':occurrences,'cancelled_by_calendar':cancelled,'unresolved_rules':unresolved,'conflicts':conflicts,'pending_calendar_events':pending,
        'coverage':{'rule_count':len(sessions),'occurrence_count':len(occurrences),'generated_all_resolvable_rules':not unresolved,
                    'location_missing_occurrences':sum(o['location_precision']=='unknown' for o in occurrences),
                    'first_date':occurrences[0]['actual_date'] if occurrences else None,'last_date':occurrences[-1]['actual_date'] if occurrences else None,
                    'calendar_is_officially_crosschecked':calendar.get('official_crosscheck')=='verified',
                    'all_future_dates_final':not pending and not unresolved,
                    'warning':'Published schedules can change. Resolution is minute/room where sources provide it, not a guarantee of future execution.'}}
