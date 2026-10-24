"""Read the school-owned team, competition and venue records.

The routes below come from the corresponding official pages and their published
scripts. HTML is accepted only where the server actually renders a record list
or an explicit account state; deferred lists are read from their fixed API.
"""

import base64
import hashlib
from html.parser import HTMLParser
import json
import re
import time
import urllib.parse

from .common import Failure


class _Node:
    def __init__(self, tag="", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def has(self, name):
        return name in self.attrs.get("class", "").split()

    def text(self):
        return " ".join(
            " ".join(
                child.text() if isinstance(child, _Node) else child
                for child in self.children
            ).split()
        )

    def find(self, predicate):
        result = []
        for child in self.children:
            if isinstance(child, _Node):
                if predicate(child):
                    result.append(child)
                result.extend(child.find(predicate))
        return result


class _Document(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.root = _Node()
        self.stack, self.hidden = [self.root], 0
        self.feed(body)

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        node = _Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in (
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
        ):
            self.stack.append(node)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, value):
        if not self.hidden:
            self.stack[-1].children.append(value)


def _url(context, path, params=None):
    origin = urllib.parse.urlsplit(context.url)
    return context.connection.checked_url(
        urllib.parse.urlunsplit(
            origin._replace(
                path=path, query=urllib.parse.urlencode(params or {}), fragment=""
            )
        )
    )


def _page(context, path, params=None):
    url = _url(context, path, params)
    status, body = context.connection.module_page(
        url, context.headers, context.token_base
    )
    if status != 200:
        raise Failure(
            "MODULE_HTTP", "学校这项体艺查询暂时没有返回，请稍后重试。", status
        )
    document = _Document(body)
    text = document.root.text()
    if any(word in text for word in ("登录过期", "登录失效", "请重新登录")):
        raise Failure(
            "MODULE_AUTH_REQUIRED", "这项体艺查询的登录已过期，请重新连接后再查。"
        )
    if document.root.find(
        lambda n: n.tag == "input" and n.attrs.get("name") == "execution"
    ):
        raise Failure("MODULE_AUTH_REQUIRED", "学校需要恢复登录后才能读取这项记录。")
    return url, body, document


def _terms(body):
    # Both formats are present in the published MUI pages. Never evaluate JS.
    matches = re.findall(
        r"(?:picker\.setData\(\s*|var\s+period\s*=\s*\')(?P<array>\[\s*\{[\s\S]*?\}\s*\])",
        body,
    )
    for raw in matches:
        try:
            rows = json.loads(raw)
        except ValueError:
            continue
        if rows and all(
            isinstance(row, dict)
            and isinstance(row.get("text"), str)
            and re.fullmatch(r"[A-Za-z0-9_-]{1,160}", str(row.get("value", "")))
            for row in rows
        ):
            return [{"termId": str(row["value"]), "label": row["text"]} for row in rows]
    raise Failure("TERM_FORMAT_CHANGED", "学校没有返回可选学期，请稍后重新查询。")


def _record_page(context, url, body, document, title, empty_messages):
    text = document.root.text()
    if title not in text or "cgAppMain" not in body:
        raise Failure(
            "MODULE_FORMAT_CHANGED",
            "学校这项记录的页面变了，本次没有把空白当作没有记录。",
        )
    main = document.root.find(lambda n: n.has("cgAppMain"))
    nodes = main[0].find(lambda n: n.tag == "li" and n.has("cgCellItem"))
    rows = [
        {"text": node.text()}
        for node in nodes
        if node.text()
        and node.text() not in empty_messages
        and not node.find(lambda n: n.has("tj"))
    ]
    if not rows:
        table_rows = main[0].find(lambda n: n.tag == "tr")
        rows = [
            {
                "cells": [
                    n.text()
                    for n in row.children
                    if isinstance(n, _Node) and n.tag == "td"
                ]
            }
            for row in table_rows
            if any(isinstance(n, _Node) and n.tag == "td" for n in row.children)
        ]
    empty = next((message for message in empty_messages if message in text), None)
    if not rows and not empty:
        raise Failure(
            "MODULE_RECORDS_NOT_RETURNED", "学校没有完整返回这项个人记录，请稍后重试。"
        )
    return {
        "recordRead": True,
        "personalRecordRead": True,
        "listRead": True,
        "recordCount": len(rows),
        "readState": "no_records" if empty and not rows else "records",
        "sourcePage": context.connection.public(url),
        "records": rows,
        **({"emptyMessage": empty} if empty and not rows else {}),
    }


def _teams(context, args):
    subpage = args.get("subpage")
    if subpage == "attendance":
        terms = _terms(context.body)
        selected = args.get("termId")
        if selected is not None and not any(
            term["termId"] == selected for term in terms
        ):
            raise Failure("TERM_NOT_FOUND", "请从学校返回的运动队考勤学期中选择。")
        url, body, doc = _page(
            context,
            "/cts/app/mySignList",
            {"termId": selected} if selected else {"newPage": 1},
        )
        result = _record_page(
            context, url, body, doc, "考勤", ("暂无考勤记录", "暂无数据")
        )
        # Summary counters are rendered by this authenticated server page.
        counters = doc.root.find(lambda n: n.has("tj-item"))
        result["summary"] = [node.text() for node in counters]
        result["terms"] = terms
        headings = doc.root.find(lambda n: n.attrs.get("id") == "tabsNav")
        result["selectedTerm"] = {
            "termId": selected,
            "label": headings[0].text() if headings else "",
        }
        if not selected:
            result["selectedTerm"]["termId"] = next(
                (
                    term["termId"]
                    for term in terms
                    if term["label"] == result["selectedTerm"]["label"]
                ),
                None,
            )
        return result, "records"
    url, body, doc = _page(context, "/cts/app/sportsTeamList", {"newPage": 1})
    text = doc.root.text()
    if "你不是教练或运动员，暂无查看权限" in text:
        membership = {
            "recordRead": False,
            "personalRecordRead": False,
            "readState": "access_denied",
            "message": "学校显示：你不是教练或运动员，暂无查看权限。",
            "sourcePage": context.connection.public(url),
        }
    else:
        membership = _record_page(
            context, url, body, doc, "代表队", ("暂无代表队", "暂无队伍", "暂无数据")
        )
    if subpage == "mine":
        return membership, "records"
    catalogue = _Document(context.body)
    teams = []
    for node in catalogue.root.find(lambda n: n.tag == "li" and n.has("cgCellItem")):
        match = re.search(
            r"/cts/app/oneSportsTeam\?type=3&sportsTeamId=(\d+)&newPage=1",
            node.attrs.get("onclick", ""),
        )
        if match:
            teams.append({"teamId": match[1], "text": node.text()})
    if not teams and "可申请的代表队" not in catalogue.root.text():
        raise Failure("TEAM_FORMAT_CHANGED", "学校没有完整返回运动队名单，请稍后重试。")
    return {
        **membership,
        "membership": membership,
        "catalogRead": True,
        "availableTeams": teams,
        "availableTeamsMeaning": "这些是学校列出的可申请队伍。",
    }, "records"


def _competitions(context, args):
    routes = {
        "records": ("/gms/app/v3/my_sign", "我的报名", ("暂无报名",)),
        "results": ("/gms/app/v3/my_result", "我的成绩", ("暂无数据",)),
        "certificates": (
            "/gms/app/v3/my_certificates",
            "我的证书",
            ("暂无可下载证书",),
        ),
        "feedback": (
            "/gms/app/v3/competition/my_feed_back",
            "我的反馈",
            ("暂未反馈任何信息",),
        ),
    }
    chosen = [args["subpage"]] if args.get("subpage") else list(routes)
    result = {}
    for key in chosen:
        path, title, messages = routes[key]
        url, body, doc = _page(context, path, {"newPage": 1})
        result[key] = _record_page(context, url, body, doc, title, messages)
    if args.get("subpage"):
        return result[args["subpage"]], "records"
    return {
        "recordRead": True,
        "personalRecordRead": True,
        "listRead": True,
        "recordCount": sum(v["recordCount"] for v in result.values()),
        "readState": "no_records"
        if all(v["readState"] == "no_records" for v in result.values())
        else "records",
        "sections": result,
    }, "records"


def _json_reply(status, body, label):
    if status != 200:
        raise Failure(
            "MODULE_QUERY_HTTP",
            "学校的" + label + "查询暂时不可用，请稍后重试。",
            status,
        )
    try:
        value = json.loads(body)
        if isinstance(value, str):
            value = json.loads(value)
    except ValueError:
        raise Failure(
            "MODULE_FORMAT_CHANGED",
            "学校的" + label + "回复不完整，本次没有当作空记录。",
        )
    if not isinstance(value, dict):
        raise Failure(
            "MODULE_FORMAT_CHANGED",
            "学校的" + label + "回复不完整，本次没有当作空记录。",
        )
    code = str(value.get("code"))
    if code in ("101", "2001", "2003", "401"):
        raise Failure(
            "MODULE_AUTH_REQUIRED", "学校的" + label + "登录已过期，请重新连接后再查。"
        )
    if code == "403":
        raise Failure(
            "MODULE_ACCESS_DENIED", "学校当前没有向这个账号开放" + label + "查询。"
        )
    if code != "200":
        raise Failure(
            "MODULE_QUERY_REJECTED", "学校这次没有返回" + label + "记录，请稍后重试。"
        )
    return value


def _entries(context, args):
    terms = _terms(context.body)
    term_id = args.get("termId")
    if term_id is None:
        current = re.search(r'var\s+termId\s*=\s*"([A-Za-z0-9_-]+)"', context.body)
        term_id = current[1] if current else None
    if not any(term["termId"] == term_id for term in terms):
        raise Failure("TERM_NOT_FOUND", "请从学校返回的场馆入场学期中选择。")
    page = args.get("upstreamPage", 0)
    if type(page) is not int or not 0 <= page <= 100000:
        raise Failure("INVALID_SCHOOL_PAGE", "请沿学校返回的下一页继续查看入场记录。")
    url = _url(context, "/ptm/jwt/app/zju/venue_entrance/student/load")
    body = urllib.parse.urlencode(
        {"start": page + 1, "length": 5, "termId": term_id}
    ).encode()
    status, _, raw = context.connection.fetch(
        url,
        {
            **context.headers,
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
        },
        body,
        "POST",
    )
    value = _json_reply(status, raw, "场馆入场")
    rows = value.get("data")
    if not isinstance(rows, list):
        raise Failure(
            "MODULE_FORMAT_CHANGED",
            "学校没有完整返回入场记录，本次没有把它当成空列表。",
        )
    # The official client continues until an empty response, even for short pages.
    context.connection.resource_coverage = {
        "complete": not rows,
        "upstreamPagination": "paged_response",
    }
    if rows and page < 100000:
        context.connection.resource_coverage["upstreamNext"] = {
            "resource": "venue_entries",
            "termId": term_id,
            "upstreamPage": page + 1,
        }
    return {
        "recordRead": True,
        "personalRecordRead": True,
        "listRead": True,
        "recordCount": len(rows),
        "readState": "records" if rows else "end_of_records" if page else "no_records",
        "pageEmpty": not rows,
        "endReached": not rows,
        "terms": terms,
        "requestScope": {"termId": term_id, "upstreamPage": page, "pageSize": 5},
        "response": value,
    }, "records"


def _live(context):
    parsed = urllib.parse.urlsplit(context.url)
    query = urllib.parse.parse_qs(parsed.query)
    if parsed.path != "/venue/statistic/gate/entry" or query != {
        "siteIds": ["19,20,22,23"],
        "queryType": ["1"],
    }:
        raise Failure(
            "VENUE_LIVE_SCOPE_CHANGED",
            "学校调整了场地实况范围，请先在学校体艺 App 查看。",
        )
    origin = urllib.parse.urlunsplit(parsed._replace(path="", query="", fragment=""))
    config = context.connection.venue_configuration(origin)
    value = context.connection.venue_api(
        config,
        "/api/gate/statistics/venue/today/entry/site",
        {"siteIds": "19,20,22,23", "queryType": "1"},
    )
    data = value.get("data")
    if not isinstance(data, dict) or not isinstance(data.get("entryList"), list):
        raise Failure(
            "VENUE_LIVE_FORMAT_CHANGED", "学校没有完整返回场地人数，本次没有补成零人。"
        )
    return {
        "recordRead": False,
        "personalRecordRead": False,
        "venueLiveRead": True,
        "readState": "records" if data["entryList"] else "no_records",
        "readAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "response": value,
    }, "records"


def _feedback(context):
    path = "/ggtypt/app/feedback/mylist"
    if not re.search(r'url\s*:\s*[\'"][^\'"]*feedback/mylist[\'"]', context.body):
        raise Failure(
            "FEEDBACK_FORMAT_CHANGED",
            "学校意见反馈的读取方式变了，请先在学校体艺 App 查看。",
        )
    status, _, body = context.connection.fetch(
        _url(context, path, {"jToken": ""}),
        {
            **context.headers,
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json",
        },
    )
    if status == 404:
        # The shipped page still exists, but its list endpoint is no longer
        # routed by the school. Report that instead of inventing an empty list.
        return {
            "recordRead": False,
            "personalRecordRead": False,
            "listRead": False,
            "readState": "upstream_unavailable",
            "httpStatus": 404,
            "note": "学校意见反馈列表接口当前返回 404；页面可以打开，但已有反馈暂时没有可读的服务器回复。",
        }, "records"
    value = _json_reply(status, body, "意见反馈")
    if not isinstance(value.get("data"), list):
        raise Failure(
            "FEEDBACK_FORMAT_CHANGED",
            "学校没有完整返回已有反馈，本次没有当作没有反馈。",
        )
    return {
        "recordRead": True,
        "personalRecordRead": True,
        "listRead": True,
        "recordCount": len(value["data"]),
        "readState": "records" if value["data"] else "no_records",
        "response": value,
    }, "records"


def _westward(context):
    scripts = [
        source
        for source in context.page.scripts
        if re.fullmatch(r"/westward/static/js/chingo\.[a-f0-9]{20}\.js", source)
    ]
    if len(scripts) != 1:
        raise Failure(
            "WESTWARD_FORMAT_CHANGED",
            "学校西迁活动的读取方式变了，请先在学校体艺 App 查看。",
        )
    status, _, script = context.connection.fetch(_url(context, scripts[0]))
    if status != 200:
        raise Failure(
            "WESTWARD_CONFIGURATION_UNAVAILABLE",
            "学校西迁活动暂时没有返回连接信息，请稍后重试。",
            status,
        )
    try:
        values = {}
        for name in ("s", "a"):
            matches = re.findall(r"(?<=[{,])" + name + r":\[([^\]]*)\]", script)
            if len(matches) != 1:
                raise ValueError()
            parts = json.loads("[" + matches[0] + "]")
            if not parts or not all(isinstance(part, str) for part in parts):
                raise ValueError()
            encoded = "".join(parts)
            values[name] = base64.b64decode(
                encoded if name == "s" else encoded[::-1], validate=True
            ).decode()
            if not 1 <= len(values[name]) <= 512:
                raise ValueError()
            context.connection.private_values.add(values[name])
        if (
            "t=t.substring(13,t.length)" not in script
            or 'serverUrlA:"http://www.tyys.zju.edu.cn"' not in script
        ):
            raise ValueError()
    except (ValueError, TypeError, UnicodeError):
        raise Failure(
            "WESTWARD_FORMAT_CHANGED", "学校西迁活动的连接方式变了，请稍后重试。"
        )
    activity = _westward_query(
        context, values, "/cgapp-server/api/front/prize/activity", {}
    )
    data = activity.get("data")
    if not isinstance(data, dict):
        raise Failure(
            "WESTWARD_FORMAT_CHANGED",
            "学校没有完整返回西迁活动，本次没有把空白当成没有活动。",
        )
    if not data.get("id"):
        return {
            "recordRead": False,
            "personalRecordRead": False,
            "readState": "activity_unavailable",
            "activityResponse": activity,
        }, "records"
    personal = _westward_query(
        context,
        values,
        "/cgapp-server/api/front/user/sports/total",
        {"activityId": data["id"]},
    )
    if not isinstance(personal.get("data"), dict):
        raise Failure(
            "WESTWARD_FORMAT_CHANGED",
            "学校没有完整返回本人的西迁活动记录，本次没有补成零值。",
        )
    return {
        "recordRead": True,
        "personalRecordRead": True,
        "summaryRead": True,
        "recordCount": 1 if personal["data"] else 0,
        "readState": "records" if personal["data"] else "no_records",
        "activityResponse": activity,
        "personalResponse": personal,
    }, "records"


def _westward_query(context, config, path, parameters):
    if path not in (
        "/cgapp-server/api/front/prize/activity",
        "/cgapp-server/api/front/user/sports/total",
    ):
        raise Failure("WESTWARD_QUERY_NOT_ALLOWED", "请从西迁活动的本人记录继续查询。")
    stamp = str(int(time.time() * 1000))
    params = {**parameters, "nocache": stamp}
    preimage = (
        config["s"]
        + path[13:]
        + "".join(key + str(params[key]) for key in sorted(params))
        + stamp
        + " "
        + config["s"]
    )
    headers = {
        "cgAuthorization": context.connection.session["token"],
        "app-key": config["a"],
        "timestamp": stamp,
        "sign": hashlib.md5(preimage.encode()).hexdigest(),
        "Accept": "application/json",
    }
    # The current official client fixes these two requests to this school host.
    url = context.connection.checked_url(
        "http://www.tyys.zju.edu.cn" + path + "?" + urllib.parse.urlencode(params)
    )
    status, _, raw = context.connection.fetch(url, headers)
    return _json_reply(status, raw, "西迁活动")


def read(context, args):
    resource = args["resource"]
    if resource == "teams":
        return _teams(context, args)
    if resource == "competitions":
        return _competitions(context, args)
    if resource == "venue_entries":
        return _entries(context, args)
    if resource == "venue_live":
        return _live(context)
    if resource == "feedback":
        return _feedback(context)
    if resource == "westward":
        return _westward(context)
    if resource == "codoon":
        parsed = urllib.parse.urlsplit(context.url)
        if (parsed.scheme, parsed.hostname, parsed.path) != (
            "https",
            "mini-club.codoon.com",
            "/v1/open/zju_callback",
        ):
            raise Failure(
                "CODOON_ENTRY_CHANGED", "学校调整了咕咚入口，请先在学校体艺 App 查看。"
            )
        return {
            "recordRead": False,
            "personalRecordRead": False,
            "readState": "external_entry_only",
            "bindingStatus": "unknown",
            "officialEntry": "https://mini-club.codoon.com/v1/open/zju_callback?code=",
            "message": "学校提供了咕咚的独立授权入口；这次没有取得咕咚的绑定状态。",
        }, "records"
    raise Failure("RESOURCE_NOT_FOUND", "没有找到这项体艺查询。")
