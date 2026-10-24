"""Read the school's study, term counts and attendance records.

The PTM pages render their records on the server. Counselling uses the exact
read-only POST published by its record page; start is a one-based page number.
No downloaded JavaScript is executed and no school action is submitted here.
"""
import html
from html.parser import HTMLParser
import json
import re
import urllib.parse

from .common import Failure


STUDY_PATH = '/ptm/jwt/app/zju/study_record'
COUNTS_PATH = '/ptm/jwt/app/bank/exercise/student/query'
COUNSELLING_PATH = '/ms/jwt/app/student/attendance/record'
COUNSELLING_LOAD = '/ms/jwt/app/student/attendance/record/load'
FITNESS_PATH = '/club2/app/v1/club/course-list'


class Element:
    def __init__(self, tag, attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def find(self, tag=None, class_name=None, element_id=None):
        result = []
        for child in self.children:
            if not isinstance(child, Element):
                continue
            if ((tag is None or child.tag == tag)
                    and (class_name is None or class_name in child.attrs.get('class', '').split())
                    and (element_id is None or child.attrs.get('id') == element_id)):
                result.append(child)
            result.extend(child.find(tag, class_name, element_id))
        return result

    @property
    def text(self):
        if self.tag in ('script', 'style'):
            return ''
        return ' '.join(' '.join(child.text if isinstance(child, Element) else child
                                 for child in self.children).split())


class Document(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.root = Element('document')
        self.stack = [self.root]
        self.feed(body)

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Element(tag, attrs))

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def _changed():
    raise Failure('STUDY_FORMAT_CHANGED', '学校的记录页面变了，这次没能读完整；可以稍后再查。')


def _url(context, path, params=None, host=None):
    source = urllib.parse.urlsplit(context.url)
    if source.hostname not in ('tyys.zju.edu.cn', 'www.tyys.zju.edu.cn'):
        raise Failure('MODULE_SCOPE_CHANGED', '这项记录的学校入口变了，请重新打开体艺后再查。')
    return urllib.parse.urlunsplit((source.scheme, host or source.hostname, path,
                                   urllib.parse.urlencode(params or {}), ''))


def _page(context, path, params=None):
    url = _url(context, path, params)
    status, body = context.connection.module_page(url, context.headers, context.token_base)
    if status in (401, 403):
        raise Failure('MODULE_AUTH_REQUIRED', '这项体艺记录的登录过期了，重新连接后就能接着查。', status)
    if status != 200:
        raise Failure('MODULE_HTTP', '学校这项记录暂时没有打开，请稍后再查。', status)
    document = Document(body)
    if '登录过期' in document.root.text or '登录失效' in document.root.text or document.root.find('input', element_id='execution'):
        raise Failure('MODULE_AUTH_REQUIRED', '这项体艺记录的登录过期了，重新连接后就能接着查。')
    return url, body, document


def _terms(body):
    # The school embeds JSON in a single-quoted JavaScript string, then evals
    # it for MUI. Read only that literal; never run eval or downloaded code.
    match = re.search(r"\bvar\s+period\s*=\s*'((?:\\.|[^'\\])*)'\s*;", body)
    if not match:
        _changed()
    try:
        terms = json.loads(html.unescape(match[1]))
    except (ValueError, TypeError):
        _changed()
    if (not isinstance(terms, list) or not 1 <= len(terms) <= 100
            or any(not isinstance(term, dict) or not isinstance(term.get('text'), str)
                   or not term['text'].strip() or not isinstance(term.get('value'), str)
                   or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', term['value']) for term in terms)
            or len({term['value'] for term in terms}) != len(terms)):
        _changed()
    return [{'termId': term['value'], 'label': term['text']} for term in terms]


def _selected(document, terms, resource):
    nodes = document.root.find(element_id='tabsNav') if resource == 'counts' else document.root.find(class_name='term')
    if len(nodes) != 1:
        _changed()
    label = nodes[0].text
    matches = [term for term in terms if term['label'] == label]
    if len(matches) != 1:
        _changed()
    return matches[0]


def _term_page(context, args, path):
    # Always obtain the live school options before accepting a term selector.
    current_path = urllib.parse.urlsplit(context.url).path
    if current_path == path:
        url, body, document = context.url, context.body, Document(context.body)
    else:
        url, body, document = _page(context, path)
    terms = _terms(body)
    current = _selected(document, terms, args['resource'])
    requested = args.get('termId')
    if requested is not None:
        selected = next((term for term in terms if term['termId'] == requested), None)
        if selected is None:
            raise Failure('TERM_NOT_FOUND', '学校没有提供这个学期，请从这次返回的学期里选择。')
        if selected != current:
            url, body, document = _page(context, path, {'termId': selected['termId']})
            fresh_terms = _terms(body)
            actual = _selected(document, fresh_terms, args['resource'])
            if actual['termId'] != selected['termId']:
                _changed()
            terms, current = fresh_terms, actual
    return url, body, document, terms, current


def _base(context, url, count, empty_state='no_records'):
    return {'title': context.module[2], 'url': url, 'recordRead': True,
            'personalRecordRead': True, 'listRead': True, 'recordCount': count,
            'readState': 'records' if count else empty_state}


def _study(context):
    if urllib.parse.urlsplit(context.url).path != STUDY_PATH:
        _changed()
    document = Document(context.body)
    tables = document.root.find('table', class_name='studyRecordTable')
    if len(tables) != 1:
        _changed()
    rows = [[{'text': cell.text, 'kind': cell.tag,
              'colspan': cell.attrs.get('colspan', '1'), 'rowspan': cell.attrs.get('rowspan', '1')}
             for cell in row.children if isinstance(cell, Element) and cell.tag in ('td', 'th')]
            for row in tables[0].find('tr')]
    rows = [row for row in rows if row]
    empty = tables[0].text == '未查询到修学记录'
    if not rows or (not empty and not any(cell['kind'] == 'td' and cell['text'] for row in rows for cell in row)):
        _changed()
    records = [] if empty else [row for row in rows if any(cell['kind'] == 'td' for cell in row)]
    return {**_base(context, context.url, len(records)), 'requestScope': {'kind': 'own_study_records'},
            'records': records,
            'empty': empty, **({'emptyMessage': tables[0].text} if empty else {}),
            'table': {'rows': rows}}, 'records'


def _counts(context, args):
    url, _, document, terms, selected = _term_page(context, args, COUNTS_PATH)
    contents = document.root.find(class_name='tabsContent')
    if len(contents) != 1:
        _changed()
    lists = contents[0].find('ul', class_name='cgCell')
    if len(lists) != 1:
        _changed()
    items = [node for node in lists[0].children if isinstance(node, Element) and node.tag == 'li']
    empty = len(items) == 1 and items[0].text == '暂无数据'
    if not items or (not empty and any(not item.text or item.text == '暂无数据' for item in items)):
        _changed()
    records = [] if empty else [{'text': item.text} for item in items]
    return {**_base(context, url, len(records)), 'requestScope': {'kind': 'own_term_counts', 'termId': selected['termId']},
            'terms': terms, 'selectedTerm': selected,
            'records': records,
            'empty': empty, **({'emptyMessage': '暂无数据'} if empty else {})}, 'records'


def _counselling(context, args):
    url, body, _, terms, selected = _term_page(context, args, COUNSELLING_PATH)
    # Fail closed if the published data request has changed, rather than
    # mistaking the initial empty <ul id=data> for an empty attendance list.
    if not re.search(r'getUrl\(\s*[\'"]jwt/app/student/attendance/record/load[\'"]\s*\)', body):
        _changed()
    page = args.get('upstreamPage', 0)
    if type(page) is not int or not 0 <= page <= 100000:
        raise Failure('INVALID_PAGE', '请选择有效的考勤页数。')
    headers = {**context.headers, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'}
    data_url = _url(context, COUNSELLING_LOAD, host='www.tyys.zju.edu.cn')
    if 'Authorization' in headers:
        scope = urllib.parse.urlsplit(context.token_base or '')
        target = urllib.parse.urlsplit(data_url)
        if ((scope.scheme, scope.netloc) != (target.scheme, target.netloc)
                or not target.path.startswith(scope.path.rstrip('/')+'/')):
            headers.pop('Authorization')
    status, _, reply = context.connection.fetch(data_url, headers,
        urllib.parse.urlencode({'start': page+1, 'length': 5, 'termId': selected['termId']}).encode())
    if status in (401, 403):
        raise Failure('MODULE_AUTH_REQUIRED', '辅导站的登录过期了，重新连接后就能继续查。', status)
    if status != 200:
        raise Failure('MODULE_HTTP', '学校暂时没有返回辅导站考勤，请稍后再查。', status)
    try:
        value = json.loads(reply)
    except ValueError:
        _changed()
    if not isinstance(value, dict):
        _changed()
    if str(value.get('code')) in ('401', '403', '2001'):
        raise Failure('MODULE_AUTH_REQUIRED', '辅导站的登录过期了，重新连接后就能继续查。')
    if str(value.get('code')) != '200':
        raise Failure('MODULE_QUERY_REJECTED', '学校没有返回这次辅导站考勤，请稍后再查。')
    records = value.get('data')
    if not isinstance(records, list) or len(records) > 5 or any(not isinstance(row, dict) for row in records):
        _changed()
    # Its JavaScript ends only on an empty reply, not on a short nonempty page.
    complete = not records
    context.connection.resource_coverage = {'complete': complete, 'upstreamPagination': 'paged_response'}
    if not complete and page < 100000:
        context.connection.resource_coverage['upstreamNext'] = {
            'resource': 'counselling', 'subpage': 'records', 'termId': selected['termId'], 'upstreamPage': page+1}
    return {**_base(context, url, len(records), 'no_records' if page == 0 else 'end_of_records'),
            'requestScope': {'kind': 'own_counselling_attendance', 'termId': selected['termId'],
                             'upstreamPage': page, 'schoolStart': page+1, 'pageSize': 5, 'dataSource': data_url},
            'terms': terms, 'selectedTerm': selected, 'records': records, 'response': value,
            'pageEmpty': not records, 'endReached': complete,
            **({'empty': True, 'emptyMessage': '已无辅导站考勤数据'} if page == 0 and complete else {})}, 'records'


def _fitness_attendance(context):
    if urllib.parse.urlsplit(context.url).path != FITNESS_PATH:
        _changed()
    document = Document(context.body)
    headings = document.root.find(element_id='tabsNav')
    contents = document.root.find(class_name='tabsContent')
    if len(headings) != 1 or headings[0].text != '课程列表' or len(contents) != 1:
        _changed()
    lists = contents[0].find('ul', class_name='cgCell')
    if len(lists) != 1:
        _changed()
    items = [node for node in lists[0].children if isinstance(node, Element) and node.tag == 'li']
    empty = len(items) == 1 and items[0].text == '无课程数据'
    if not items or (not empty and any(not item.text or item.text == '无课程数据' for item in items)):
        _changed()
    courses = []
    for item in [] if empty else items:
        tables = []
        for table in item.find('table'):
            rows = [[cell.text for cell in row.children if isinstance(cell, Element) and cell.tag in ('td', 'th')]
                    for row in table.find('tr')]
            tables.append({'rows': [row for row in rows if row]})
        courses.append({'text': item.text, **({'tables': tables} if tables else {})})
    # This is the personal course/attendance page returned by club2, not a
    # catalogue of all courses. Its current empty course list says nothing
    # about terms the school does not expose on this page.
    return {**_base(context, context.url, len(courses)), 'courseListRead': True,
            'requestScope': {'kind': 'own_fitness_courses', 'termSelection': 'school_default'},
            'records': courses, 'empty': empty,
            **({'emptyMessage': '无课程数据'} if empty else {})}, 'records'


def read(context, args):
    resource = args['resource']
    if args.get('schoolYear') is not None:
        raise Failure('TERM_FILTER_UNAVAILABLE', '这项查询使用学校列出的学期，请选择相应学期后再查。')
    if resource not in ('counts', 'counselling') and args.get('termId') is not None:
        raise Failure('TERM_FILTER_UNAVAILABLE', '学校这页没有学期选择，请查看这次返回的课程范围。')
    if resource != 'counselling' and args.get('upstreamPage') is not None:
        raise Failure('PAGE_FILTER_UNAVAILABLE', '学校这页已经返回完整内容，不需要另选页数。')
    if resource == 'study_records':
        return _study(context)
    if resource == 'counts':
        return _counts(context, args)
    if resource == 'counselling':
        return _counselling(context, args)
    if resource == 'fitness_attendance':
        return _fitness_attendance(context)
    raise Failure('RESOURCE_NOT_FOUND', '没有找到这项体艺查询。')
