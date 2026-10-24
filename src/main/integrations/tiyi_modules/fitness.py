"""Read the PFT and graduation pages used by the official student client.

PFT results and graduation courses are server rendered. The reservation and
feedback pages load separate, read-only lists. No booking, cancellation or
feedback submission URL is requested here.
"""
import base64
import hashlib
from html.parser import HTMLParser
import json
import re
import struct
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit

from .common import Failure


_DYNAMIC_REQUEST = re.compile(r'\$\.(?:ajax|get(?:JSON)?|post)\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b')


class _Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []

    def has(self, name):
        return name in self.attrs.get('class', '').split()

    def find(self, *, tag=None, cls=None, identity=None):
        found = []
        for child in self.children:
            if not isinstance(child, _Node):
                continue
            if ((tag is None or child.tag == tag) and
                    (cls is None or child.has(cls)) and
                    (identity is None or child.attrs.get('id') == identity)):
                found.append(child)
            found.extend(child.find(tag=tag, cls=cls, identity=identity))
        return found

    def text(self):
        if self.tag in ('script', 'style'):
            return ''
        return re.sub(r'\s+', ' ', ''.join(
            child.text() if isinstance(child, _Node) else child
            for child in self.children)).strip()


class _Document(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.root = _Node()
        self.stack = [self.root]
        self.feed(body)

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img',
                       'input', 'link', 'meta', 'param', 'source', 'wbr'):
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(_Node(tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def _first(node, **filters):
    found = node.find(**filters)
    return found[0] if found else None


def _text(node, **filters):
    item = _first(node, **filters)
    return item.text() if item else ''


def _url(context, path, parameters=None):
    # Paths in this file are literals derived from the official page/script.
    # Caller-selected IDs can only enter the encoded query after membership
    # validation against the account's current response.
    parsed = urlsplit(context.url)
    value = urlunsplit(parsed._replace(path=path, query=urlencode(parameters or {}), fragment=''))
    return context.connection.checked_url(value)


def _page(context, path, parameters=None):
    url = _url(context, path, parameters)
    status, body = context.connection.module_page(url, context.headers, context.token_base)
    doc = _Document(body).root
    text = doc.text()
    if (status in (401, 403) or '登录过期' in text or '登录失效' in text or
            any(node.attrs.get('name') == 'execution' for node in doc.find(tag='input'))):
        raise Failure('MODULE_AUTH_REQUIRED', '这项体艺登录已过期，请重新连接后再查。')
    if status != 200:
        raise Failure('MODULE_HTTP', '学校这项体艺查询暂时没有返回，请稍后重试。', status)
    if re.search(r'^\s*<script[^>]*>.*(?:rebuildToken|zjuam\.zju\.edu\.cn/cas/login)', body, re.S) and not _first(doc, tag='body'):
        raise Failure('MODULE_AUTH_REQUIRED', '这项体艺登录已过期，请重新连接后再查。')
    return url, body, doc


def _token(context):
    value = context.headers.get('Authorization')
    if not isinstance(value, str) or not value:
        raise Failure('MODULE_AUTH_REQUIRED', '体测登录没有完成，请重新连接体艺后再查。')
    return value


def _json(context, path):
    url = _url(context, path, {'jToken': _token(context)})
    status, _, body = context.connection.fetch(url, context.headers)
    if status in (401, 403):
        raise Failure('MODULE_AUTH_REQUIRED', '体测登录已过期，请重新连接后再查。')
    if status != 200:
        raise Failure('MODULE_HTTP', '学校这次没有返回体测记录，请稍后重试。', status)
    if (re.fullmatch(r'\s*<script\b[^>]*>[\s\S]*</script>\s*', body, re.I) and
            ('rebuildToken' in body or 'zjuam.zju.edu.cn/cas/login' in body)):
        raise Failure('MODULE_AUTH_REQUIRED', '体测登录已过期，请重新连接后再查。')
    try:
        value = json.loads(body)
        # Some deployments encode the JSON object as a JSON string.
        if isinstance(value, str):
            value = json.loads(value)
    except (ValueError, TypeError):
        raise Failure('PFT_FORMAT_CHANGED', '体测记录的格式变了，这次没有把它当作空记录。')
    if isinstance(value, dict) and str(value.get('code')) in ('401', '403', '2001'):
        raise Failure('MODULE_AUTH_REQUIRED', '体测登录已过期，请重新连接后再查。')
    if not isinstance(value, dict) or not isinstance(value.get('data'), list):
        raise Failure('PFT_FORMAT_CHANGED', '体测记录没有完整返回，请稍后再查。')
    if any(not isinstance(item, dict) for item in value['data']):
        raise Failure('PFT_FORMAT_CHANGED', '体测记录的格式变了，请稍后再查。')
    code = value.get('code')
    if code is not None and str(code) not in ('0', '200'):
        raise Failure('PFT_QUERY_REJECTED', '学校没有接受这次体测查询，请稍后再查。')
    return value


def _person_fields(connection, rows):
    for row in rows:
        for key in ('name', 'tel', 'uidAndName', 'feedbackuid', 'replyuid'):
            value = row.get(key)
            if isinstance(value, str) and value.strip():
                connection.private_values.add(value)
                connection.identity_values.add(value)


def _periods(body, graduation=False):
    pattern = r"\bvar\s+period\s*=\s*'([^']*)'" if graduation else r'picker\.setData\(\s*(\[[\s\S]*?\])\s*\)'
    match = re.search(pattern, body)
    try:
        rows = json.loads(match.group(1)) if match else None
    except ValueError:
        rows = None
    if not isinstance(rows, list) or not rows or any(
            not isinstance(row, dict) or 'value' not in row or not isinstance(row.get('text'), str)
            for row in rows):
        raise Failure('PFT_TERMS_CHANGED', '学校的学年或学期选项没有完整返回，请稍后再查。')
    return [{'id': str(row['value']), 'label': row['text']} for row in rows]


def _selection(args, periods, graduation=False):
    term, year = args.get('termId'), args.get('schoolYear')
    if term is None and year is None:
        return None
    if not graduation and term is not None:
        raise Failure('PFT_YEAR_REQUIRED', '体测成绩按学年查询，请使用学校列表里的学年。')
    matches = periods
    if term is not None:
        matches = [p for p in matches if p['id'] == str(term)]
    if year is not None:
        # Both the official year ID and its complete academic-year label are
        # supported. Do not silently truncate an unknown input to four digits.
        matches = [p for p in matches if str(year) in (
            p['id'] if not graduation else p['label'][:4],
            p['label'].split('学年')[0], p['label'])]
    if len(matches) != 1:
        raise Failure('TERM_NOT_FOUND' if not matches else 'TERM_REQUIRED',
                      '请选择学校列表里的一个学期。' if graduation else '请选择学校列表里的一个体测学年。')
    return matches[0]


def _result_items(doc):
    content = _first(doc, cls='sportContent')
    if content is None:
        return None
    rows = []
    for item in content.find(tag='li', cls='cgCellItem'):
        label = _text(item, cls='cgCellItemLabel')
        if not label:
            continue
        value = _text(item, cls='cgCellItemRight')
        row = {'item': label, 'valueText': value}
        status = _text(item, cls='cgCellItemMain')
        if status:
            row['status'] = status
        # The source renders measurement / score / bonus in this exact order.
        # Keep source strings and units; numeric conversion can lose a 1000 m
        # time such as 3'32, or mistake a score for a measurement.
        parts = [part.strip() for part in value.split('/')]
        if label == '总分':
            row['totalScore'] = value
        elif len(parts) > 1:
            row['measurement'] = parts[0]
            row['score'] = parts[1]
            if len(parts) > 2 and parts[2]:
                row['bonus'] = parts[2]
        elif label != '体测状态':
            row['measurement'] = value
        rows.append(row)
    return rows


def _results(context, args):
    if urlsplit(context.url).path == '/pft/app/resultList':
        url, body, doc = context.url, context.body, _Document(context.body).root
    else:
        url, body, doc = _page(context, '/pft/app/resultList', {'newPage': 1})
    periods = _periods(body)
    selected = _selection(args, periods)
    if selected and _text(doc, identity='pickerBtn') != selected['label']:
        url, body, doc = _page(context, '/pft/app/resultList', {'periodId': selected['id']})
    academic_year = _text(doc, identity='pickerBtn')
    if not academic_year or selected and academic_year != selected['label']:
        raise Failure('PFT_YEAR_NOT_RETURNED', '学校没有返回所选学年的体测成绩，请稍后再查。')
    items = _result_items(doc)
    if items is None:
        # The official empty view must say so; missing markup is not absence.
        message = doc.text()
        if '未开放' in message or '尚未开放' in message:
            raise Failure('MODULE_UNAVAILABLE', '学校目前还没有开放这个学年的体测成绩。')
        if any(word in message for word in ('暂无成绩', '暂无数据', '未查询到', '没有体测成绩')):
            items = []
        else:
            raise Failure('PFT_FORMAT_CHANGED', '学校没有完整返回体测成绩，请稍后再查。')
    return {'recordRead': True, 'personalRecordRead': True, 'resultListRead': True,
            'listRead': True, 'recordCount': len(items),
            'readState': 'records' if items else 'no_records',
            'sourcePage': url, 'academicYear': academic_year,
            'periodType': 'academic_year',
            'selectedPeriod': selected or next((p for p in periods if p['label'] == academic_year), None),
            'availablePeriods': periods, 'items': items,
            'summary': next((item for item in items if item['item'] == '总分'), None)}


def _pft_list(context, args, feedback=False):
    if args.get('termId') is not None or feedback and args.get('schoolYear') is not None:
        raise Failure('PFT_FILTER_UNAVAILABLE', '这项体测列表不按学期筛选，可先读完整列表再查看具体记录。')
    if args.get('upstreamPage', 0) != 0:
        raise Failure('PFT_FILTER_UNAVAILABLE', '学校一次返回这份体测列表，可沿已返回的记录继续查看。')
    path = '/pft/app/feedback/mylist' if feedback else '/pft/app/schedule/mine/list'
    value = _json(context, path)
    rows = value['data']
    _person_fields(context.connection, rows)
    total = value.get('recordsFiltered', value.get('recordsTotal'))
    if total is not None and (type(total) is not int or total < len(rows)):
        raise Failure('PFT_FORMAT_CHANGED', '学校返回的记录数量与正文不一致，请稍后再查。')
    context.connection.resource_coverage = {
        'complete': total is None or total == len(rows),
        'upstreamPagination': 'whole_response' if total is None or total == len(rows) else 'unknown'}
    year = args.get('schoolYear')
    if year is not None:
        match = re.fullmatch(r'(\d{4})(?:-(\d{4})(?:学年)?)?', str(year))
        if not match or match[2] and int(match[2]) != int(match[1]) + 1:
            raise Failure('PFT_YEAR_REQUIRED', '请使用学校列表里的体测学年。')
        year = match[1]
        rows = [row for row in rows if str(row.get('schoolYear')) == year]
    record_id = args.get('recordId')
    if record_id is not None:
        row = next((item for item in rows if str(item.get('id')) == str(record_id)), None)
        if row is None:
            raise Failure('RECORD_SCOPE_UNCONFIRMED', '没有在本人的体测记录里找到这一条，请先刷新列表。')
        if feedback:
            url, body, doc = _page(context, '/pft/app/feedback/reply', {'newPage': 1, 'id': row['id']})
            content = _first(doc, cls='cgAppMain')
            if content is None or not content.text():
                raise Failure('PFT_FORMAT_CHANGED', '这条反馈的正文没有完整返回，请稍后再查。')
            return {'recordRead': True, 'personalRecordRead': True, 'feedbackListRead': True,
                    'listRead': True, 'recordCount': 1, 'readState': 'records', 'sourcePage': url,
                    'feedback': row, 'text': content.text()}
        rows = [row]
    # Existing reservations are distinct from the open booking calendar.
    return {'recordRead': True, 'personalRecordRead': True, 'listRead': True,
            'recordCount': len(rows),
            'feedbackListRead' if feedback else 'reservationListRead': True,
            'readState': 'records' if rows else 'no_records',
            'sourcePage': _url(context, path),
            'requestScope': {'kind': 'own_fitness_feedback' if feedback else 'own_fitness_reservations',
                             **({'schoolYear': year, 'filter': 'within_returned_list'} if year else {})},
            'records': rows, **({'sourceTotal': total} if total is not None else {})}


def _graduation_courses(context, args):
    periods = _periods(context.body, graduation=True)
    selected = _selection(args, periods, graduation=True)
    if selected:
        url, body, doc = _page(context, '/ptm/jwt/app/zju/graduation/student/home', {'termId': selected['id']})
    else:
        url, body, doc = context.url, context.body, _Document(context.body).root
    displayed_term = _text(doc, identity='selectTerm')
    if selected and displayed_term != selected['label']:
        raise Failure('TERM_NOT_RETURNED', '学校没有返回所选学期的体测与锻炼课，请稍后再查。')
    selected = selected or next((p for p in periods if p['label'] == displayed_term), None)
    content = _first(doc, cls='tabsContent')
    listing = _first(content, tag='ul', cls='cgCell') if content else None
    if listing is None or selected is None:
        raise Failure('GRADUATION_COURSES_FORMAT_CHANGED', '学校没有完整返回这个学期的体测与锻炼课，请稍后再查。')
    # This view is server rendered; the only scripts set the term picker and
    # open course details. An empty authenticated list means only that this
    # selected term's view has no published course rows, never graduation pass.
    records = []
    for item in listing.find(tag='li'):
        if item.text():
            records.append({'text': item.text(), 'fields': [
                {'label': _text(cell, cls='cgCellItemLabel'),
                 'value': _text(cell, cls='cgCellItemRight')}
                for cell in item.find(cls='cgCellItem')
                if _text(cell, cls='cgCellItemLabel')]})
    if _DYNAMIC_REQUEST.search(body):
        raise Failure('GRADUATION_COURSES_FORMAT_CHANGED', '学校改了这项课程的加载方式，这次没有把空白当作没有课程。')
    return {'recordRead': True, 'personalRecordRead': True, 'courseListRead': True,
            'listRead': True, 'recordCount': len(records),
            'readState': 'records' if records else 'no_records',
            'sourcePage': url, 'selectedPeriod': selected, 'availablePeriods': periods,
            'periodType': 'semester',
            'records': records, 'graduationStatus': None,
            **({'message': '学校这个学期的体测与锻炼课页面没有列出成绩。'} if not records else {})}


# These exact public decorations were downloaded and visually read on 2026-10-24.
# A changed or additional image is never silently treated as a decoration or OCR.
_REPORT_DECORATIONS = {
    '886e216730249b37cad789cab416ffb8c1f34db713445e7b70cb72ee48538a9a':
        ('/ggtypt/app/views_v3/images/header-background.png', 'report_cover'),
    '7c04a790c05c6256e5a3cee406709881a15fc9d45d7b4dcbd2d73a8b1b2f8595':
        ('/ggtypt/app/views_v3/images/bottom.png', 'report_footer'),
}


def _report_image(context, source):
    connection = context.connection
    url = connection.checked_url(urljoin(context.url, source))
    origin, target = urlsplit(context.url), urlsplit(url)
    if ((origin.scheme, origin.netloc) != (target.scheme, target.netloc) or
            not target.path.startswith('/ggtypt/app/')):
        raise Failure('REPORT_SOURCE_CHANGED', '报告的图片来源变了，请先在学校体艺 App 查看。')
    status, headers, _ = connection.fetch(url, context.headers)
    if status != 200:
        raise Failure('REPORT_IMAGE_UNAVAILABLE', '报告图片这次没有完整返回，请稍后再查。', status)
    # Connection keeps exact bytes in its encrypted observation. Do not add
    # plaintext medical images or a second file owner to the repository.
    raw = base64.b64decode(connection.responses[-1]['bytes'])
    digest = hashlib.sha256(raw).hexdigest()
    dimensions = None
    if raw.startswith(b'\x89PNG\r\n\x1a\n') and len(raw) >= 24:
        dimensions = list(struct.unpack('>II', raw[16:24]))
    known = _REPORT_DECORATIONS.get(digest)
    decoration = known is not None and target.path == known[0] and not target.query
    return {**({'source': urlunsplit(target._replace(fragment=''))} if decoration else {}),
            'sha256': digest, 'bytes': len(raw),
            'contentType': headers.get_content_type(), 'dimensions': dimensions,
            'role': known[1] if decoration else 'unread_image'}


def _graduation_report(context, args):
    if any(args.get(field) is not None for field in ('schoolYear', 'termId', 'courseId', 'recordId')):
        raise Failure('REPORT_FILTER_UNAVAILABLE', '学校的毕业体艺报告只有当前这一份，没有学年或课程筛选。')
    doc = _Document(context.body).root
    content = _first(doc, cls='content')
    if content is None:
        raise Failure('GRADUATION_REPORT_FORMAT_CHANGED', '毕业体艺报告没有完整返回，请稍后再查。')
    images = doc.find(tag='img')
    if len(images) > 12:
        raise Failure('REPORT_TOO_LARGE', '这份报告的图片较多，请先在学校体艺 App 查看。')
    observed_images = [_report_image(context, image.attrs['src']) for image in images if image.attrs.get('src')]
    unread_count = sum(image['role'] == 'unread_image' for image in observed_images)
    unread = unread_count > 0
    sections = []
    for item in content.find(cls='item-box'):
        sections.append({'text': item.text(), 'values': [node.text() for node in item.find(cls='data-item')],
                         'tableRows': [row.text() for row in item.find(cls='info-item')]})
    text = content.text()
    dynamic = _DYNAMIC_REQUEST.search(context.body)
    personal_read = bool(text) and not unread and not dynamic
    if not personal_read:
        context.connection.resource_coverage = {'complete': False, 'upstreamPagination': 'unknown'}
    return {'recordRead': personal_read, 'reportRead': personal_read,
            'reportPageRead': True, 'personalRecordRead': personal_read,
            'readState': 'image_content_unread' if unread else 'report_loading_changed' if dynamic else 'records' if text else 'report_not_available',
            'sourcePage': context.url,
            'personalReportPublished': True if personal_read else None,
            'text': text, 'sections': sections,
            'images': [image for image in observed_images if image['role'] != 'unread_image'],
            'unreadImageCount': unread_count,
            'graduationStatus': None,
            **({'message': '学校这次只返回了报告封面和底图，尚未读到个人指标。'} if not text and not unread and not dynamic else {}),
            **({'relatedQueries': [{'resource': 'fitness', 'subpage': subpage}
                                  for subpage in ('results', 'schedule', 'feedback')]}
               if not personal_read else {})}


def read(context, args):
    resource = args['resource']
    if resource == 'graduation_courses':
        result = _graduation_courses(context, args)
    elif resource == 'graduation_report':
        result = _graduation_report(context, args)
    elif resource == 'fitness':
        subpage = args.get('subpage')
        if subpage == 'results':
            result = _results(context, args)
        elif subpage == 'feedback':
            result = _pft_list(context, args, feedback=True)
        elif subpage in (None, 'schedule'):
            result = _pft_list(context, args)
        else:
            raise Failure('SUBPAGE_NOT_FOUND', '体测可查询成绩、已有预约和本人反馈。')
    else:
        raise Failure('RESOURCE_NOT_FOUND', '没有找到这项体测查询。')
    return result, 'records'
