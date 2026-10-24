"""Read-only Tiyi connection. Credentials and complete observations stay in DPAPI.

The optional application signing component is installed by the host separately;
its official client binary is not redistributed with this project.
"""

import base64
import ctypes
from ctypes import wintypes
import hashlib
import html
from html.parser import HTMLParser
import http.cookiejar
from email.message import Message
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import ssl
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timezone
from tiyi_modules.common import Failure, ModuleContext
from tiyi_modules import read as read_module

try:
    from tiyi_signer import TiyiSigner
except ImportError:  # The optional long-lived signer is not installed.
    TiyiSigner = None

SOURCE = "campus:zju-tiyi"
HOSTS = {"www.tyys.zju.edu.cn", "tyys.zju.edu.cn", "zjuam.zju.edu.cn"}
# Keep the official application's registered service and business protocol.
# The public website's HTTPS origin does not serve the same working API.
BASE = "http://www.tyys.zju.edu.cn/cgapp-server/"
SERVICE = BASE + "cas/appLogin"
MODULE_PATH = re.compile(
    r"^/(?:cgapp-server|ptm|pft|cts|ms|venue|gms|club2|westward|ggtypt)(?:/|$)"
)
VENUE_READ_PATHS = {
    "/venue-server/api/orders/mine",
    "/venue-server/api/venue/trains",
    "/venue-server/api/buddies",
    "/venue-server/api/reservation/campus/venue/info",
    "/venue-server/api/reservation/day/info",
    "/venue-server/api/gate/statistics/venue/today/entry/site",
}
VENUE_AUTH_PATHS = {"/venue-server/api/app/login/init", "/venue-server/api/login"}
VENUE_PROFILE_PATH = re.compile(
    r"^/venue-server/api/(?:venue/(?:students|teachers)|register/users)/[A-Za-z0-9_-]{1,160}$"
)
READ_POST_PATHS = {
    "/ms/jwt/app/student/attendance/record/load",
    "/ptm/jwt/app/zju/venue_entrance/student/load",
}
# Sport submission is only reachable when the host explicitly authorises it.
SPORT_SUBMIT_PATHS = {
    "/cgapp-server/api/l/v6.1/prejudgment",
    "/cgapp-server/api/l/v7/savesports",
    "/api/l/v6.1/prejudgment",
    "/api/l/v7/savesports",
}
AGENT = "zdapp/2.9.6(Linux;Android 12;Zaichang/Windows)"
MODULES = [
    (77, "study_records", "修学记录"),
    (5, "exercise", "课外锻炼"),
    (76, "notices", "活动预告"),
    (43, "teams", "运动队"),
    (78, "westward", "西迁活动"),
    (75, "counselling", "辅导站"),
    (69, "counts", "次数查询"),
    (61, "venues", "场馆服务"),
    (50, "fitness_attendance", "身体素质课考勤"),
    (67, "training", "培训课程"),
    (3, "fitness", "体测"),
    (37, "competitions", "我的比赛"),
    (23, "classes", "上课考勤"),
    (73, "venue_entries", "场馆出入记录"),
    (72, "feedback", "意见反馈"),
    (62, "venue_live", "场地实况"),
    (81, "graduation_courses", "体测与锻炼课"),
    (84, "graduation_report", "毕业体艺报告"),
    (85, "codoon", "咕咚运动"),
]
SENSITIVE = re.compile(
    r"token|secret|password|cookie|authorization|ticket|session|^(?:doorPwd|orderNoCode|orderCode(?:List)?|buddyNo|lockCode)$",
    re.I,
)
IDENTITY_FIELDS = {
    "xh",
    "xm",
    "uid",
    "userid",
    "basestudentid",
    "faceuuid",
    "username",
    "studentname",
    "phone",
    "phonenumber",
    "userphone",
    "mobile",
    "email",
    "idcard",
    "cardid",
    "photobyte",
    "identitycard",
    "orderuid",
    "orderuserid",
    "ordername",
    "feedbackuid",
    "uidandname",
}


def now():
    return datetime.now(timezone.utc).isoformat()


class Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def crypt(value, decrypt=False):
    if os.name != "nt":
        raise Failure(
            "WINDOWS_DPAPI_REQUIRED", "这台设备没有 Windows 用户加密存储，未保存明文。"
        )
    buf = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
    source, target = Blob(len(value), buf), Blob()
    library = ctypes.WinDLL("crypt32", use_last_error=True)
    if decrypt:
        fn = library.CryptUnprotectData
        fn.argtypes = [
            ctypes.POINTER(Blob),
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_void_p,
            wintypes.DWORD,
            ctypes.POINTER(Blob),
        ]
        args = (ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target))
    else:
        fn = library.CryptProtectData
        fn.argtypes = [
            ctypes.POINTER(Blob),
            wintypes.LPCWSTR,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_void_p,
            wintypes.DWORD,
            ctypes.POINTER(Blob),
        ]
        args = (
            ctypes.byref(source),
            "Zaichang Tiyi",
            None,
            None,
            None,
            1,
            ctypes.byref(target),
        )
    fn.restype = wintypes.BOOL
    if not fn(*args):
        raise Failure(
            "DPAPI_FAILED",
            "本机加密记录暂时打不开；请使用原 Windows 用户重新连接体艺。",
        )
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    try:
        return ctypes.string_at(target.pbData, target.cbData)
    finally:
        kernel.LocalFree(target.pbData)


def load(file):
    return json.loads(crypt(file.read_bytes(), True)) if file.exists() else None


def save(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_name(file.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        temp.write_bytes(crypt(json.dumps(value, ensure_ascii=False).encode("utf8")))
        temp.replace(file)
    finally:
        temp.unlink(missing_ok=True)


def safe_url(url):
    try:
        p = urllib.parse.urlsplit(url)
        allowed = (
            p.scheme in ("http", "https")
            and p.hostname in HOSTS
            and p.port in (None, 80 if p.scheme == "http" else 443)
            and not p.username
            and not p.password
        )
    except ValueError:
        allowed = False
    if not allowed:
        raise Failure(
            "SOURCE_NOT_ALLOWED",
            "这个入口需要单独的服务授权，请在学校体艺 App 中继续。",
        )
    decoded = urllib.parse.unquote(p.path)
    if (
        "\\" in decoded
        or any(part in (".", "..") for part in decoded.split("/"))
        or any(ord(char) < 32 for char in url + decoded)
    ):
        raise Failure(
            "SOURCE_NOT_ALLOWED", "这个体艺地址不完整，请从学校目录重新打开。"
        )
    if p.hostname == "zjuam.zju.edu.cn":
        if p.scheme != "https" or p.path not in ("/cas/login", "/cas/v2/getPubKey"):
            raise Failure(
                "SOURCE_NOT_ALLOWED", "统一认证只通过学校的安全登录入口继续。"
            )
    elif (
        p.path not in ("", "/", "/api/l/v6/token", "/venue-server")
        and not MODULE_PATH.match(p.path)
        and p.path not in VENUE_READ_PATHS | VENUE_AUTH_PATHS
        and not VENUE_PROFILE_PATH.fullmatch(p.path)
    ):
        raise Failure(
            "SOURCE_NOT_ALLOWED", "这个页面不在体艺查询范围内，请从学校体艺入口继续。"
        )
    return urllib.parse.urlunsplit(p._replace(netloc=p.hostname))


class SchoolCookiePolicy(http.cookiejar.DefaultCookiePolicy):
    def set_ok(self, cookie, request):
        # UAA cookies stay on encrypted requests even if its server omits Secure.
        if urllib.parse.urlsplit(request.full_url).hostname == "zjuam.zju.edu.cn":
            cookie.secure = True
        return super().set_ok(cookie, request)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Page(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.parts, self.inputs, self.links, self.images, self.selects = (
            [],
            {},
            [],
            [],
            [],
        )
        self.hidden = 0
        self.scripts = []
        self.current_select = None
        self.option = None
        self.feed(body)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"):
            self.hidden += 1
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        if tag in ("br", "p", "div", "tr", "li", "h1", "h2", "h3"):
            self.parts.append("\n")
        if tag == "input" and a.get("name"):
            self.inputs[a["name"]] = a.get("value", "")
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])
        if tag == "img" and a.get("src"):
            self.images.append(a["src"])
        if tag == "select":
            self.current_select = {
                "name": a.get("name", a.get("id", "")),
                "options": [],
            }
            self.selects.append(self.current_select)
        if tag == "option" and self.current_select is not None:
            self.option = {
                "value": a.get("value", ""),
                "label": "",
                "selected": "selected" in a,
            }
            self.current_select["options"].append(self.option)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)
        if tag == "select":
            self.current_select = None
        if tag == "option":
            self.option = None

    def handle_data(self, text):
        if not self.hidden:
            self.parts.append(text)
        if self.option is not None:
            self.option["label"] += text

    @property
    def text(self):
        return "\n".join(
            line.strip() for line in "".join(self.parts).splitlines() if line.strip()
        )


class Connection:
    def __init__(self, request):
        self.request = request
        self.root = Path(request["privateDirectory"]).resolve()
        self.legacy = Path(
            request.get("legacyDirectory")
            or Path(os.environ.get("LOCALAPPDATA", "")) / "local.zju.sports.desktop"
        )
        self.config = (
            json.loads((self.root / "connector.json").read_text("utf8"))
            if (self.root / "connector.json").exists()
            else {}
        )
        self.jar = http.cookiejar.CookieJar(policy=SchoolCookiePolicy())
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            NoRedirect(),
            urllib.request.HTTPCookieProcessor(self.jar),
        )
        self.session = None
        self.expected_user = None
        self.host_transport = request.get("hostTransport") is True
        self.private_values = set()
        self.identity_values = set()
        self.responses = []
        self.resource_coverage = None
        self.venue_session = None
        self.venue_profile_path = None
        self.allow_sport_submit = request.get("allowSportSubmit") is True
        self.sport_encoder = (
            request.get("sportEncoder")
            if request.get("sportEncoder") in ("plain", "aes")
            else "plain"
        )
        self._signer_client = None
        self.deadline = time.monotonic() + 105

    def checked_url(self, url):
        return safe_url(url)

    def fetch(self, url, headers=None, body=None, method=None):
        url = self.checked_url(url)
        parsed = urllib.parse.urlsplit(url)
        method = method or ("POST" if body is not None else "GET")
        if method not in ("GET", "POST") or body is not None and method != "POST":
            raise Failure(
                "SCHOOL_WRITE_FORBIDDEN", "这项连接只查询体艺内容，不提交学校业务。"
            )
        if method == "POST" and not (
            parsed.hostname == "zjuam.zju.edu.cn"
            and parsed.path == "/cas/login"
            or re.fullmatch(
                r"/(?:cgapp-server|ptm|pft|cts|ms|gms|club2|westward|ggtypt)?/?api/l/v6/token",
                parsed.path,
            )
            or parsed.path in READ_POST_PATHS
            or self.allow_sport_submit
            and parsed.path in SPORT_SUBMIT_PATHS
            or parsed.path == "/venue-server/api/login"
        ):
            raise Failure(
                "SCHOOL_WRITE_FORBIDDEN", "这项连接只查询体艺内容，不提交学校业务。"
            )
        if parsed.path in READ_POST_PATHS and method == "POST":
            try:
                fields = urllib.parse.parse_qs(
                    body.decode("utf8"), strict_parsing=True, keep_blank_values=True
                )
                valid = set(fields) == {"start", "length", "termId"} and all(
                    len(value) == 1 for value in fields.values()
                )
                valid = (
                    valid
                    and fields["start"][0].isdigit()
                    and 1 <= int(fields["start"][0]) <= 100001
                    and fields["length"] == ["5"]
                )
                valid = valid and bool(
                    re.fullmatch(r"[A-Za-z0-9_-]{1,160}", fields["termId"][0])
                )
            except (ValueError, UnicodeError, AttributeError):
                valid = False
            if not valid:
                raise Failure(
                    "SCHOOL_QUERY_INVALID", "学校查询条件不完整，请重新选择学期。"
                )
        if parsed.path == "/venue-server/api/login" and body:
            raise Failure("SCHOOL_WRITE_FORBIDDEN", "场馆登录只提交空表单。")
        body_limit = 4 * 1024 * 1024 if parsed.path in SPORT_SUBMIT_PATHS else 65536
        if body is not None and len(body) > body_limit:
            raise Failure("SCHOOL_REQUEST_TOO_LARGE", "这次校园请求内容过长。")
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise Failure("TIMEOUT", "学校这次还没有完整答复；请稍后重试。")
        h = {"User-Agent": AGENT, "Accept": "*/*"}
        h.update(headers or {})
        if self.host_transport:
            request_id = uuid.uuid4().hex
            print(
                json.dumps(
                    {
                        "kind": "tiyi_http_request",
                        "id": request_id,
                        "request": {
                            "url": url,
                            "method": method or ("POST" if body is not None else "GET"),
                            "headers": h,
                            **(
                                {"bodyBase64": base64.b64encode(body).decode()}
                                if body is not None
                                else {}
                            ),
                        },
                    },
                    separators=(",", ":"),
                ),
                flush=True,
            )
            line = sys.stdin.buffer.readline(12 * 1024 * 1024)
            try:
                response = json.loads(line)
                if response.get("id") != request_id:
                    raise ValueError()
                if response.get("error"):
                    error = response["error"]
                    raise Failure(
                        error.get("code", "SCHOOL_TRANSPORT_FAILED"),
                        error.get("message", "校园连接没有完成，请稍后重试。"),
                    )
                response = response["response"]
                raw = base64.b64decode(response["bodyBase64"], validate=True)
                if len(raw) > 8 * 1024 * 1024:
                    raise Failure(
                        "RESPONSE_TOO_LARGE",
                        "学校返回内容超过本次读取容量，请缩小范围。",
                    )
                response_headers = Message()
                for key, value in response["headers"].items():
                    if key.lower() not in ("content-type", "location"):
                        continue
                    response_headers[key] = value
                status = response["status"]
                if not isinstance(status, int) or not 100 <= status <= 599:
                    raise ValueError()
                text = raw.decode(
                    response_headers.get_content_charset() or "utf8", errors="replace"
                )
                self.responses.append(
                    {
                        "url": url,
                        "status": status,
                        "at": now(),
                        "bytes": base64.b64encode(raw).decode(),
                    }
                )
                return status, response_headers, text
            except Failure:
                raise
            except (ValueError, KeyError, TypeError):
                raise Failure(
                    "SCHOOL_TRANSPORT_FAILED", "校园连接的回复不完整，请重新查询。"
                )
        try:
            try:
                reply = self.opener.open(
                    urllib.request.Request(url, data=body, headers=h, method=method),
                    timeout=min(20, remaining),
                )
            except urllib.error.HTTPError as error:
                reply = error
            with reply:
                raw = reply.read(8 * 1024 * 1024 + 1)
                self.private_values.update(
                    cookie.value for cookie in self.jar if len(cookie.value) >= 8
                )
                if len(raw) > 8 * 1024 * 1024:
                    raise Failure(
                        "RESPONSE_TOO_LARGE",
                        "学校返回内容超过本次读取容量，请缩小范围。",
                    )
                text = raw.decode(
                    reply.headers.get_content_charset() or "utf8", errors="replace"
                )
                self.responses.append(
                    {
                        "url": url,
                        "status": reply.code,
                        "at": now(),
                        "bytes": base64.b64encode(raw).decode(),
                    }
                )
                return reply.code, reply.headers, text
        except Failure:
            raise
        except (urllib.error.URLError, OSError, TimeoutError) as error:
            cause = getattr(error, "reason", error)
            if isinstance(cause, ssl.SSLCertVerificationError):
                detail = (
                    "安全证书与域名不匹配"
                    if "hostname mismatch" in str(cause).lower()
                    else "安全证书未通过校验"
                )
                raise Failure(
                    "TLS_CERTIFICATE_INVALID",
                    "学校体艺入口的"
                    + detail
                    + "，本次没有向该入口发送登录信息。可先在学校体艺 App 查询，待学校修复入口后重试。",
                )
            raise Failure(
                "NETWORK_OR_TLS",
                "无法安全连接学校体艺服务；请检查校园网或 VPN，稍后重试。",
            )

    def public(self, value):
        if isinstance(value, dict):
            return {
                k: (
                    "[protected]"
                    if SENSITIVE.search(k) or k.lower() in IDENTITY_FIELDS
                    else self.public(v)
                )
                for k, v in value.items()
            }
        if isinstance(value, list):
            return [self.public(v) for v in value]
        if isinstance(value, str):
            for secret in sorted(self.private_values, key=len, reverse=True):
                if secret:
                    value = value.replace(secret, "[protected]")
            value = re.sub(
                r'(?i)([?&](?:\w*token|ticket|secret|password|session\w*|authorization)=)[^&#\s"\']+',
                r"\1[protected]",
                value,
            )
            value = re.sub(r'(?i)(;jsessionid=)[^/?#;\s"\']+', r"\1[protected]", value)
            return value
        return value

    def remember_identities(self, value):
        if isinstance(value, dict):
            for key, item in value.items():
                if SENSITIVE.search(key) and isinstance(item, str) and item:
                    self.private_values.add(item)
                if (
                    key.lower() in IDENTITY_FIELDS
                    and isinstance(item, str)
                    and item.strip()
                ):
                    self.private_values.add(item)
                    self.identity_values.add(item)
                self.remember_identities(item)
        elif isinstance(value, list):
            for item in value:
                self.remember_identities(item)

    def use_session(self, session):
        if not isinstance(session, dict) or not all(
            isinstance(session.get(k), str) and session[k]
            for k in ("user", "token", "secret", "expires")
        ):
            return False
        if (
            len(session["user"]) > 128
            or len(session["token"]) > 32768
            or len(session["secret"]) < 16
            or not re.fullmatch(
                r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", session["token"]
            )
        ):
            return False
        if self.expected_user and session["user"] != self.expected_user:
            return False
        try:
            expiry = float(session["expires"])
            if not math.isfinite(expiry) or expiry < 0:
                return False
            if expiry > 10_000_000_000:
                expiry /= 1000
            if expiry > 0 and expiry <= time.time():
                return False
        except (ValueError, OverflowError):
            return False
        self.session = session
        self.private_values.update(
            [session["token"], session["secret"], session["user"]]
        )
        self.identity_values.add(session["user"])
        return True

    def authenticate(self, force=False):
        if self.session and not force:
            return
        if os.name != "nt":
            return self._authenticate(force)
        # Native logins replace the previous native session. All helper
        # processes for this product profile share one short renewal lock.
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateMutexW.argtypes = [
            ctypes.c_void_p,
            wintypes.BOOL,
            wintypes.LPCWSTR,
        ]
        kernel.CreateMutexW.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD
        kernel.ReleaseMutex.argtypes = [wintypes.HANDLE]
        kernel.ReleaseMutex.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle.restype = wintypes.BOOL
        name = (
            "Local\\ZaichangTiyiAuth-"
            + hashlib.sha256(str(self.root).casefold().encode("utf8")).hexdigest()
        )
        handle = kernel.CreateMutexW(None, False, name)
        if not handle:
            raise Failure("SESSION_LOCK_FAILED", "体艺登录暂时没能打开，请稍后重试。")
        acquired = False
        try:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise Failure("TIMEOUT", "学校这次还没有完整答复；请稍后重试。")
            result = kernel.WaitForSingleObject(handle, max(1, int(remaining * 1000)))
            acquired = result in (0, 0x80)  # A killed helper releases its owned mutex.
            if result == 0x102:
                raise Failure(
                    "SESSION_BUSY", "另一项体艺查询还在恢复登录，请稍后再试。"
                )
            if not acquired:
                raise Failure(
                    "SESSION_LOCK_FAILED", "体艺登录暂时没能打开，请稍后重试。"
                )
            return self._authenticate(force)
        finally:
            if acquired:
                kernel.ReleaseMutex(handle)
            kernel.CloseHandle(handle)

    def _authenticate(self, force=False):
        if self.session and not force:
            return
        if force and self.session:
            # Another active reader may already have renewed the shared login.
            # Reuse that reply instead of replacing its healthy school session.
            latest = load(self.root / "session.dpapi")
            if (
                latest
                and latest.get("token") != self.session["token"]
                and self.use_session(latest)
            ):
                return
        if force:
            self.jar.clear()
        if not force:
            for file in (
                self.root / "session.dpapi",
                self.legacy / "app-session.dpapi",
            ):
                if self.use_session(load(file)):
                    if file.parent != self.root:
                        save(self.root / "session.dpapi", self.session)
                    return
        credentials = load(
            Path(os.environ.get("LOCALAPPDATA", ""))
            / "CodexZjuStudentInfo"
            / "credentials.dpapi"
        )
        username = credentials.get("username") if credentials else self.expected_user
        password = credentials.get("password") if credentials else None
        if password:
            self.private_values.add(password)
        login = "https://zjuam.zju.edu.cn/cas/login"
        registered_service = SERVICE
        service_url = (
            login + "?" + urllib.parse.urlencode({"service": registered_service})
        )
        service = urllib.parse.urlsplit(registered_service)
        status, headers, body = (
            self.fetch(service_url) if self.host_transport else (0, {}, "")
        )
        existing = urllib.parse.urlsplit(
            urllib.parse.urljoin(login, headers.get("Location", ""))
        )
        reusable = (
            status in (301, 302, 303, 307, 308)
            and (existing.scheme, existing.hostname, existing.path)
            == (service.scheme, service.hostname, service.path)
            and urllib.parse.parse_qs(existing.query).get("ticket")
        )
        if not reusable:
            if not username or not password:
                raise Failure(
                    "AUTH_REQUIRED" if self.host_transport else "CREDENTIALS_REQUIRED",
                    "请在校园连接窗口完成体艺的统一身份认证，再继续查询。"
                    if self.host_transport
                    else "校园登录已过期。请在本机校园账号窗口保存账号，再重新连接体艺。",
                )
            # The actual school's form action preserves its original service.
            status, _, body = self.fetch(service_url)
            execution = Page(body).inputs.get("execution")
            if status != 200 or not execution:
                raise Failure(
                    "AUTH_FLOW_CHANGED",
                    "统一登录页发生变化，请在校园连接窗口完成学校认证后重试。",
                    status,
                )
            _, _, body = self.fetch("https://zjuam.zju.edu.cn/cas/v2/getPubKey")
            try:
                key = json.loads(body)
                encrypted = format(
                    pow(
                        int.from_bytes(password.encode(), "big"),
                        int(key["exponent"], 16),
                        int(key["modulus"], 16),
                    ),
                    "x",
                ).zfill(128)
            except (ValueError, KeyError, TypeError):
                raise Failure(
                    "AUTH_FLOW_CHANGED",
                    "统一登录的加密参数发生变化，请在校园连接窗口继续。",
                )
            self.fetch(
                service_url,
                {"Content-Type": "application/x-www-form-urlencoded"},
                urllib.parse.urlencode(
                    {
                        "username": username,
                        "password": encrypted,
                        "execution": execution,
                        "_eventId": "submit",
                        "rememberMe": "true",
                    }
                ).encode(),
            )
            if not self.host_transport and not any(
                c.name == "iPlanetDirectoryPro" and c.value and not c.is_expired()
                for c in self.jar
            ):
                raise Failure(
                    "AUTH_REQUIRED",
                    "统一登录未成功；验证码或二次认证可在校园连接窗口继续，已有查询保留。",
                )
            status, headers, _ = self.fetch(service_url)
        target = urllib.parse.urljoin(login, headers.get("Location", ""))
        parsed = urllib.parse.urlsplit(target)
        if (
            status not in (301, 302, 303, 307, 308)
            or (parsed.scheme, parsed.hostname, parsed.path)
            != (service.scheme, service.hostname, service.path)
            or not urllib.parse.parse_qs(parsed.query).get("ticket")
        ):
            raise Failure(
                "APP_AUTH_REQUIRED",
                "体艺尚未取得统一认证的业务入口；请在校园连接窗口完成学校认证后继续。",
            )
        for _ in range(10):
            status, headers, body = self.fetch(target)
            if status in (301, 302, 303, 307, 308):
                target = urllib.parse.urljoin(target, headers.get("Location", ""))
                continue
            break
        if status >= 500:
            raise Failure(
                "APP_SERVICE_UNAVAILABLE",
                "学校体艺的登录服务暂时不可用，本次没有读到个人记录。可稍后重试，或先在学校体艺 App 查询。",
                status,
            )
        if status != 200:
            raise Failure(
                "APP_AUTH_REQUIRED",
                "体艺登录没有完成，请稍后重试或在学校 App 重新登录。",
                status,
            )
        match = re.search(
            r"getUserName\s*\(\s*[\'\"]([^\'\"]+)[\'\"]\s*,\s*[\'\"]([^\'\"]+)[\'\"]",
            body,
        )
        if not match:
            raise Failure(
                "APP_AUTH_FLOW_CHANGED",
                "体艺的登录回复发生变化，暂时无法读取；可先在学校体艺 App 查询。",
            )
        user, raw = map(html.unescape, match.groups())
        parts = raw.split(".")
        if (
            not user
            or len(user) > 128
            or username is not None
            and user != username
            or len(parts) != 5
            or len(parts[3]) < 16
        ):
            raise Failure(
                "ACCOUNT_SCOPE_MISMATCH",
                "体艺返回的账号或应用登录格式不匹配，本次没有读取个人记录。",
            )
        if not self.use_session(
            {
                "user": user,
                "token": ".".join(parts[:3]),
                "secret": parts[3],
                "expires": parts[4],
            }
        ):
            raise Failure("APP_AUTH_REQUIRED", "体艺返回的登录已过期，请重新登录。")
        save(self.root / "session.dpapi", self.session)

    def signed(self, uri):
        directory = self.request.get("signerDirectory") or self.config.get(
            "signerDirectory"
        )
        dependencies = self.request.get("signerDependencies") or self.config.get(
            "signerDependencies"
        )
        if not directory or not (Path(directory) / "main.py").is_file():
            raise Failure(
                "SIGNER_REQUIRED",
                "本机缺少体艺应用连接组件，请在连接设置中配置原体艺兼容组件后重试。",
            )
        device_file = self.root / "device.dpapi"
        device = load(device_file)
        if not device:
            old = self.legacy / "desktop-device-id.txt"
            device = (
                old.read_text("utf8").strip() if old.exists() else str(uuid.uuid4())
            )
            save(device_file, device)
        if TiyiSigner is not None:
            try:
                if self._signer_client is None:
                    self._signer_client = TiyiSigner(
                        directory, dependencies, device, self.deadline
                    )
                    if not self._signer_client.available():
                        self._signer_client = None
                if self._signer_client is not None:
                    self._signer_client.set_secret(self.session["secret"])
                    headers = self._signer_client.headers(uri)
                    if headers is not None:
                        return headers
            except (OSError, RuntimeError, ValueError):
                self._signer_client = None
        env = {
            k: v
            for k, v in os.environ.items()
            if not re.search(
                r"API_KEY|TOKEN|AUTHORIZATION|COOKIE|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY",
                k,
                re.I,
            )
        }
        env.update({"PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1"})
        dependency_paths = [str(Path(dependencies).resolve())] if dependencies else []
        helper_directory = Path(__file__).resolve().parent
        packaged_dependencies = helper_directory / "signing-dependencies"
        if not packaged_dependencies.is_dir() and tuple(
            helper_directory.parts[-3:]
        ) == ("src", "main", "integrations"):
            packaged_dependencies = (
                helper_directory.parent.parent.parent
                / "dist-electron/tiyi-runtime/signing-dependencies"
            )
        if packaged_dependencies.is_dir():
            dependency_paths.append(str(packaged_dependencies))
        if dependency_paths:
            env["PYTHONPATH"] = os.pathsep.join(dependency_paths)
        try:
            result = subprocess.run(
                [sys.executable, str(Path(directory) / "main.py")],
                input=json.dumps(
                    {"secret": self.session["secret"], "uri": uri, "deviceId": device}
                ),
                text=True,
                encoding="utf8",
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=min(40, max(1, self.deadline - time.monotonic())),
                env=env,
                creationflags=0x08000000 if os.name == "nt" else 0,
            )
            value = json.loads(result.stdout) if len(result.stdout) < 65536 else {}
            if result.returncode or value.get("ok") is not True:
                raise ValueError()
            headers = {
                k: value["headers"][k]
                for k in ("timestamp", "sign", "imei", "v1", "client")
            }
            if any(
                not isinstance(v, str) or "\n" in v or "\r" in v
                for v in headers.values()
            ):
                raise ValueError()
            return headers
        except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
            raise Failure(
                "SIGNER_UNAVAILABLE",
                "体艺的应用连接组件暂时不能使用，请在本机重新安装该组件后再试。",
            )

    def api(self, endpoint, params=None, base=None, post=False, retry=True):
        self.authenticate()
        base = base or BASE
        query = urllib.parse.urlencode(params or {})
        uri = "/api/" + endpoint + (("?" + query) if query else "")
        headers = self.signed(uri)
        headers.update(
            {"cgAuthorization": self.session["token"], "Accept": "application/json"}
        )
        url = self.checked_url(base) + "api/" + endpoint
        body = None
        if post:
            body = query.encode()
            headers.update(
                {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "app-key": "cgsoft",
                }
            )
        elif query:
            url += "?" + query
        status, _, text = self.fetch(url, headers, body)
        if status in (401, 403) and retry:
            self.authenticate(True)
            return self.api(endpoint, params, base, post, False)
        if status != 200:
            raise Failure(
                "UPSTREAM_HTTP",
                "学校体艺服务暂时没有返回这项内容，请稍后重试。",
                status,
            )
        try:
            value = json.loads(text)
        except ValueError:
            raise Failure(
                "UPSTREAM_FORMAT_CHANGED",
                "学校返回的内容格式发生变化，本次未把它当成空记录。",
            )
        if not isinstance(value, dict):
            raise Failure(
                "UPSTREAM_FORMAT_CHANGED",
                "学校返回的记录格式发生变化，本次未把它当成空记录。",
            )
        code = str(value.get("code"))
        if code in ("401", "403", "-401", "2001") and retry:
            self.authenticate(True)
            return self.api(endpoint, params, base, post, False)
        if code != "200":
            # The complete school reply is already in encrypted responses. Its
            # error text may contain identifiers or internal server paths; it
            # never becomes product copy or model instructions.
            if code in ("401", "403", "-401", "2001"):
                raise Failure(
                    "AUTH_REQUIRED",
                    "体艺登录已失效，请在校园连接窗口恢复登录后再查询。",
                )
            if code == "2002":
                raise Failure(
                    "UPSTREAM_REJECTED",
                    "学校没有接受这次体艺请求。请重新连接后再查；若仍如此，可先在学校体艺 App 查询并检查本机连接组件。",
                )
            raise Failure(
                "UPSTREAM_REJECTED",
                "学校未接受这次体艺查询，本次没有取得记录。请重新连接后重试，或先在学校体艺 App 查看。",
            )
        return value

    def module_page(self, url, headers, auth_scope):
        """Follow school navigation without forwarding a module token elsewhere."""
        origin = urllib.parse.urlsplit(url)
        for _ in range(10):
            current = urllib.parse.urlsplit(self.checked_url(url))
            bounded = dict(headers)
            if (current.scheme, current.netloc) != (origin.scheme, origin.netloc):
                bounded.pop("cgAuthorization", None)
            if auth_scope is not None:
                scope = urllib.parse.urlsplit(auth_scope)
                if (current.scheme, current.netloc) != (
                    scope.scheme,
                    scope.netloc,
                ) or not current.path.startswith(scope.path.rstrip("/") + "/"):
                    bounded.pop("Authorization", None)
            status, response_headers, body = self.fetch(url, bounded)
            if status not in (301, 302, 303, 307, 308):
                return status, body
            location = response_headers.get("Location")
            if not location:
                raise Failure(
                    "MODULE_AUTH_REQUIRED",
                    "学校页面没有返回完整入口，请在学校体艺 App 重新登录后重试。",
                )
            url = self.checked_url(urllib.parse.urljoin(url, location))
        raise Failure(
            "MODULE_REDIRECT_LIMIT",
            "学校体艺页面反复跳转，已停下；请稍后重新登录查询。",
        )

    def venue_configuration(self, origin):
        """Read the current public site's signing configuration, never browser storage.

        The published venue client uses a separate parameter signature. It is
        not the cgapp native-library signature. Only its two known Base64
        string arrays are decoded; no downloaded JavaScript is executed.
        """
        status, _, body = self.fetch(origin + "/venue/")
        if status != 200:
            raise Failure(
                "VENUE_CONFIGURATION_UNAVAILABLE",
                "学校场馆的连接配置暂时没有返回，请稍后重试。",
                status,
            )
        scripts = []
        for source in Page(body).scripts:
            url = urllib.parse.urlsplit(
                urllib.parse.urljoin(origin + "/venue/", source)
            )
            if urllib.parse.urlunsplit(
                url._replace(path="", query="", fragment="")
            ) == origin and re.fullmatch(
                r"/venue/js/chingo\.[a-f0-9]{8}\.js", url.path
            ):
                scripts.append(url.geturl())
        if len(scripts) != 1:
            raise Failure(
                "VENUE_FORMAT_CHANGED",
                "学校场馆的网页连接方式变了，暂时无法读取记录；可先在学校体艺 App 查看。",
            )
        status, _, script = self.fetch(scripts[0])
        if status != 200:
            raise Failure(
                "VENUE_CONFIGURATION_UNAVAILABLE",
                "学校场馆的连接配置暂时没有返回，请稍后重试。",
                status,
            )
        try:
            values = {}
            for name in ("s", "a"):
                matches = re.findall(r"(?<=[{,])" + name + r":\[([^\]]*)\]", script)
                if len(matches) != 1:
                    raise ValueError()
                parts = json.loads("[" + matches[0] + "]")
                if (
                    not isinstance(parts, list)
                    or not parts
                    or not all(isinstance(part, str) for part in parts)
                ):
                    raise ValueError()
                text = "".join(parts)
                values[name] = base64.b64decode(
                    text if name == "s" else text[::-1], validate=True
                ).decode("utf8")
                if not 1 <= len(values[name]) <= 512:
                    raise ValueError()
                self.private_values.add(values[name])
            site = re.search(
                r'cafb:function\(e,n,t\)\{var a=t\("[^"]+"\)\.default\|\|\{\},c=("[^"]+"),o=\{\}',
                script,
            )
            if site is None or 'serverUrl:c+"/venue-server"' not in script:
                raise ValueError()
            server = urllib.parse.urlsplit(json.loads(site[1]))
            if server.path not in ("", "/") or server.query or server.fragment:
                raise ValueError()
            base = self.checked_url(
                urllib.parse.urlunsplit(
                    server._replace(path="/venue-server", query="", fragment="")
                )
            )
            if urllib.parse.urlsplit(base).hostname not in (
                "tyys.zju.edu.cn",
                "www.tyys.zju.edu.cn",
            ):
                raise ValueError()
            return base, values["s"], values["a"]
        except (ValueError, TypeError, UnicodeError):
            raise Failure(
                "VENUE_FORMAT_CHANGED",
                "学校场馆的网页连接方式变了，暂时无法读取记录；可先在学校体艺 App 查看。",
            )

    def venue_request(
        self, configuration, path, parameters, post=False, oauth_token=None
    ):
        auth_path = path in ("/api/app/login/init", "/api/login")
        if (
            "/venue-server" + path not in VENUE_READ_PATHS | VENUE_AUTH_PATHS
            and path != self.venue_profile_path
            or post != (path == "/api/login")
            or oauth_token is not None
            and not post
        ):
            raise Failure(
                "VENUE_QUERY_NOT_ALLOWED",
                "这项场馆请求不是已确认的只读查询，请从场馆目录继续。",
            )
        base, secret, app_key = configuration
        # The published client drops null/undefined query values entirely.
        params = {
            key: (value.strip() if isinstance(value, str) else value)
            for key, value in parameters.items()
            if value is not None
        }
        timestamp = str(int(time.time() * 1000))
        if not post:
            params["nocache"] = int(timestamp)
        preimage = (
            secret
            + path
            + "".join(
                key + str(params[key]) for key in sorted(params) if params[key] != ""
            )
            + timestamp
            + " "
            + secret
        )
        headers = {
            "app-key": app_key,
            "timestamp": timestamp,
            "sign": hashlib.md5(preimage.encode("utf8")).hexdigest(),
            "cgAuthorization": self.session["token"]
            if auth_path
            else self.venue_session[1],
            "cgappauthorization": self.session["token"],
            "Accept": "application/json",
        }
        if oauth_token is not None:
            headers["oauth-token"] = oauth_token
        if post:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        status, _, body = self.fetch(
            base + path + ("?" + urllib.parse.urlencode(params) if not post else ""),
            headers,
            urllib.parse.urlencode(params).encode() if post else None,
        )
        if status != 200:
            raise Failure(
                "VENUE_HTTP", "学校场馆这次没有返回记录，请稍后重试。", status
            )
        try:
            value = json.loads(body)
        except ValueError:
            raise Failure(
                "VENUE_FORMAT_CHANGED",
                "学校场馆返回的记录格式发生变化，本次没有将它当作空记录。",
            )
        if not isinstance(value, dict):
            raise Failure(
                "VENUE_FORMAT_CHANGED",
                "学校场馆返回的记录格式发生变化，本次没有将它当作空记录。",
            )
        code = str(value.get("code"))
        if (
            code == "408"
            or code == "401"
            and isinstance(value.get("data"), dict)
            and value["data"].get("toLogin") == 1
        ):
            raise Failure(
                "VENUE_AUTH_REQUIRED",
                "场馆登录已过期，请重新连接体艺后再查；也可先在学校体艺 App 查看。",
            )
        if code == "401":
            raise Failure(
                "VENUE_ACCESS_DENIED",
                "学校场馆没有允许这次查询，请先在学校体艺 App 查看本账号可用的内容。",
            )
        if code == "511":
            raise Failure(
                "VENUE_NETWORK_REQUIRED",
                "学校场馆还需要校园网络认证，请检查校园连接后重试。",
            )
        if code != "200":
            raise Failure(
                "VENUE_REJECTED",
                "学校场馆没有接受这次查询，本次未取得记录；请稍后重试或先在学校体艺 App 查看。",
            )
        return value

    def venue_login(self, configuration):
        # /venue/login is only a SPA shell. Its published client exchanges the
        # native login for a separate venue token before reading any records.
        value = self.venue_request(configuration, "/api/app/login/init", {})
        raw = value.get("data")
        if not isinstance(raw, str) or not raw or len(raw) > 8192:
            raise Failure(
                "VENUE_AUTH_FORMAT_CHANGED",
                "学校场馆的登录回复发生变化，请稍后重新连接。",
            )
        self.private_values.add(raw)
        token = raw
        if "oauth_token=" in raw:
            try:
                values = urllib.parse.parse_qs(
                    urllib.parse.urlsplit(raw).query, keep_blank_values=True
                ).get("oauth_token", [])
            except ValueError:
                values = []
            if len(values) != 1:
                raise Failure(
                    "VENUE_AUTH_FORMAT_CHANGED",
                    "学校场馆没有返回完整的登录信息，请稍后重试。",
                )
            token = values[0]
        if not token or len(token) > 8192 or re.search(r"[\r\n\0]", token):
            raise Failure(
                "VENUE_AUTH_FORMAT_CHANGED",
                "学校场馆没有返回完整的登录信息，请稍后重试。",
            )
        self.private_values.add(token)
        value = self.venue_request(
            configuration, "/api/login", {}, post=True, oauth_token=token
        )
        data = value.get("data")
        if (
            not isinstance(data, dict)
            or not isinstance(data.get("username"), str)
            or data["username"] != self.session["user"]
        ):
            raise Failure(
                "ACCOUNT_SCOPE_MISMATCH",
                "学校场馆返回的账号与本次体艺登录不一致，本次没有读取记录。",
            )
        self.remember_identities(data)
        name = data.get("name")
        if isinstance(name, str) and name:
            self.private_values.add(name)
            self.identity_values.add(name)
        access = (
            data.get("token", {}).get("access_token")
            if isinstance(data, dict) and isinstance(data.get("token"), dict)
            else None
        )
        if (
            not isinstance(access, str)
            or not access
            or len(access) > 8192
            or re.search(r"[\r\n\0]", access)
        ):
            raise Failure(
                "VENUE_AUTH_FORMAT_CHANGED",
                "学校场馆没有返回完整的登录信息，请稍后重试。",
            )
        self.private_values.add(access)
        self.venue_session = (configuration[0], access)
        # The personal-centre URL is derived solely from this verified login.
        # A caller cannot select a different person's ID or role.
        self.venue_profile_path = None
        profile_prefix = {
            3: "/api/venue/students/",
            4: "/api/venue/teachers/",
            6: "/api/register/users/",
        }.get(data.get("role"))
        profile_id = data.get("userId")
        if (
            profile_prefix
            and type(profile_id) in (str, int)
            and re.fullmatch(r"[A-Za-z0-9_-]{1,160}", str(profile_id))
        ):
            self.venue_profile_path = profile_prefix + str(profile_id)

    def venue_api(self, configuration, path, parameters):
        if (
            "/venue-server" + path not in VENUE_READ_PATHS
            and path != self.venue_profile_path
        ):
            raise Failure(
                "VENUE_QUERY_NOT_ALLOWED",
                "这项场馆请求不是已确认的只读查询，请从场馆目录继续。",
            )
        if self.venue_session is None or self.venue_session[0] != configuration[0]:
            self.venue_login(configuration)
        return self.venue_request(configuration, path, parameters)

    def venue_discovery(self, args, url, configuration):
        mode = (
            "art_reservation"
            if args.get("subpage") == "art_reservation"
            else "reservation"
        )
        # Current official config enables the 0/1 arts selector. Ordinary
        # student queries never supply the administrator's schoolType nor the
        # whole-court reservationType used by the booking process.
        directory = self.venue_api(
            configuration,
            "/api/reservation/campus/venue/info",
            {"isArt": 1 if mode == "art_reservation" else 0},
        )
        data = directory.get("data")
        if (
            not isinstance(data, dict)
            or not isinstance(data.get("venueInfo"), dict)
            or not isinstance(data.get("venueSiteInfo"), dict)
        ):
            raise Failure(
                "VENUE_FORMAT_CHANGED",
                "学校返回的场馆目录格式发生变化，本次没有将它当作没有场地。",
            )
        site_id, search_date = args.get("venueSiteId"), args.get("searchDate")
        if (site_id is None) != (search_date is None) or args.get(
            "upstreamPage"
        ) is not None:
            raise Failure(
                "VENUE_SELECTION_REQUIRED",
                "请先从学校目录选择场地，并同时提供学校日期，再查看时段。",
            )
        selection = {
            "resource": "venues",
            "subpage": mode,
            "directoryPointer": "/response/data",
            "venueMapField": "venueInfo",
            "siteMapField": "venueSiteInfo",
            "idField": "id",
            "dateFormat": "YYYY-MM-DD",
            "timeZone": "Asia/Shanghai",
        }
        self.resource_coverage = {
            "complete": True,
            "upstreamPagination": "whole_response",
            "venueSelection": selection,
        }
        if site_id is None:
            return {
                "recordRead": False,
                "personalRecordRead": False,
                "venueDataRead": True,
                "requestScope": {
                    "kind": "venue_directory",
                    "mode": mode,
                    "sourcePage": self.public(url),
                },
                "response": directory,
            }, "records"
        if (
            not isinstance(site_id, str)
            or not site_id
            or len(site_id) > 160
            or not isinstance(search_date, str)
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", search_date)
        ):
            raise Failure(
                "VENUE_SELECTION_REQUIRED",
                "场地编号或日期不完整，请从学校目录重新选择。",
            )
        try:
            date.fromisoformat(search_date)
        except ValueError:
            raise Failure(
                "VENUE_DATE_INVALID", "这个学校日期不存在，请重新选择有效日期。"
            )
        selected = None
        for venues in data["venueInfo"].values():
            if not isinstance(venues, list):
                raise Failure(
                    "VENUE_FORMAT_CHANGED",
                    "学校返回的场馆目录格式发生变化，请稍后重试。",
                )
            for venue in venues:
                if not isinstance(venue, dict) or venue.get("id") is None:
                    continue
                sites = data["venueSiteInfo"].get(str(venue["id"]), [])
                if not isinstance(sites, list):
                    raise Failure(
                        "VENUE_FORMAT_CHANGED",
                        "学校返回的场地目录格式发生变化，请稍后重试。",
                    )
                for site in sites:
                    if (
                        isinstance(site, dict)
                        and site.get("id") is not None
                        and str(site["id"]) == site_id
                    ):
                        selected = site
        if selected is None:
            raise Failure(
                "VENUE_SITE_UNCONFIRMED",
                "学校当前这份场馆目录中没有这个场地，请重新读取目录后选择。",
            )
        response = self.venue_api(
            configuration,
            "/api/reservation/day/info",
            {"venueSiteId": selected["id"], "searchDate": search_date},
        )
        slots = response.get("data")
        if (
            not isinstance(slots, dict)
            or not isinstance(slots.get("spaceTimeInfo"), list)
            or not isinstance(slots.get("reservationDateSpaceInfo"), dict)
            or not isinstance(slots.get("reservationDateList"), list)
        ):
            raise Failure(
                "VENUE_FORMAT_CHANGED",
                "学校返回的时段格式发生变化，本次没有将它当成没有可用时段。",
            )
        selection["directoryPointer"] = "/directoryResponse/data"
        return {
            "recordRead": False,
            "personalRecordRead": False,
            "venueDataRead": True,
            "requestScope": {
                "kind": "venue_time_slots",
                "mode": mode,
                "venueSiteId": str(selected["id"]),
                "searchDate": search_date,
                "timeZone": "Asia/Shanghai",
                "sourcePage": self.public(url),
            },
            "directoryResponse": directory,
            "response": response,
            "meaning": "这是学校返回的时段、容量和限制。按实际日期映射阅读；空闲状态不单独证明可预约，也不代表已选位或提交预约。",
        }, "records"

    def venue_records(self, args, url):
        resource, sub = args["resource"], args.get("subpage")
        is_orders = resource == "venues" and sub == "orders"
        is_training = (
            resource == "training"
            and sub is None
            or resource == "venues"
            and sub == "training"
        )
        is_buddies = resource == "venues" and sub == "buddies"
        is_profile = resource == "venues" and sub == "mine"
        is_discovery = resource == "venues" and sub in (
            None,
            "reservation",
            "art_reservation",
        )
        if not (is_orders or is_training or is_buddies or is_discovery or is_profile):
            return None
        page = args.get("upstreamPage", 0)
        if (
            not isinstance(page, int)
            or isinstance(page, bool)
            or not 0 <= page <= 100000
            or args.get("upstreamPage") is not None
            and (args.get("snapshotId") or is_buddies or is_discovery or is_profile)
        ):
            raise Failure(
                "INVALID_SCHOOL_PAGE",
                "学校页码只用于场馆订单或培训列表的新查询；保存的记录请沿原地址继续。",
            )
        parsed = urllib.parse.urlsplit(url)
        origin = urllib.parse.urlunsplit(
            parsed._replace(path="", query="", fragment="")
        )
        configuration = self.venue_configuration(origin)
        if is_profile:
            self.venue_login(configuration)
            if not self.venue_profile_path:
                raise Failure(
                    "VENUE_PROFILE_UNAVAILABLE",
                    "学校场馆没有返回本人的个人中心入口，请先在学校体艺 App 查看。",
                )
            value = self.venue_api(configuration, self.venue_profile_path, {})
            data = value.get("data")
            if (
                not isinstance(data, dict)
                or str(data.get("uid") or data.get("username") or "")
                != self.session["user"]
            ):
                raise Failure(
                    "ACCOUNT_SCOPE_MISMATCH",
                    "学校场馆的个人资料与本次账号不一致，本次未返回。",
                )
            self.remember_identities(data)
            if isinstance(data.get("name"), str) and data["name"]:
                self.private_values.add(data["name"])
                self.identity_values.add(data["name"])
            # The encrypted raw response retains the profile's owner ID. It is
            # not a selectable record and is unnecessary in the public view.
            value = {**value, "data": {**data, "id": "[protected]"}}
            self.resource_coverage = {
                "complete": True,
                "upstreamPagination": "whole_response",
            }
            return {
                "recordRead": True,
                "personalRecordRead": True,
                "profileRead": True,
                "requestScope": {
                    "kind": "own_venue_profile",
                    "sourcePage": self.public(url),
                },
                "response": value,
            }, "records"
        if is_discovery:
            return self.venue_discovery(args, url, configuration)
        path = (
            "/api/orders/mine"
            if is_orders
            else "/api/venue/trains"
            if is_training
            else "/api/buddies"
        )
        value = self.venue_api(
            configuration,
            path,
            {"page": -1 if is_buddies else page, "size": -1 if is_buddies else 5},
        )
        data = value.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("content"), list):
            raise Failure(
                "VENUE_FORMAT_CHANGED",
                "学校场馆返回的记录格式发生变化，本次没有将它当作空记录。",
            )
        if is_buddies:
            # In this specific source, name is a person's name, whereas name in
            # the training catalogue can be a course or venue. Preserve raw
            # contacts locally and carry only verified redactions to offline
            # projections; do not broadly replace unrelated school prose.
            for buddy in data["content"]:
                name = buddy.get("name") if isinstance(buddy, dict) else None
                if isinstance(name, str) and name:
                    self.private_values.add(name)
                    self.identity_values.add(name)
        total = data.get("totalElements")
        pages = data.get("totalPages")
        valid_total = type(total) is int and total >= 0
        valid_pages = type(pages) is int and pages >= 0
        if (
            total is not None
            and not valid_total
            or pages is not None
            and not valid_pages
            or valid_total
            and total < len(data["content"])
        ):
            raise Failure(
                "VENUE_FORMAT_CHANGED",
                "学校场馆返回的分页数量发生变化，本次未将它当成完整或空记录；可先在学校体艺 App 查看。",
            )
        bounded = (
            valid_total and total == len(data["content"])
            if is_buddies
            else valid_total or valid_pages
        )
        has_next = not is_buddies and (
            valid_total and total > (page + 1) * 5 or valid_pages and pages > page + 1
        )
        self.resource_coverage = {
            "complete": bounded and not has_next,
            "upstreamPagination": ("whole_response" if bounded else "unknown")
            if is_buddies
            else "paged_response",
        }
        if has_next and page < 100000:
            self.resource_coverage["upstreamNext"] = {
                "resource": resource,
                "upstreamPage": page + 1,
                **({"subpage": sub} if sub else {}),
            }
        return {
            "recordRead": not is_training,
            **(
                {"personalRecordRead": False, "trainingCatalogRead": True}
                if is_training
                else {}
            ),
            "requestScope": {
                "kind": "related_orders"
                if is_orders
                else "training_catalog"
                if is_training
                else "own_buddies",
                **({"upstreamPage": page, "pageSize": 5} if not is_buddies else {}),
                "sourcePage": self.public(url),
            },
            "response": value,
        }, "records"

    def resource(self, args):
        r = args["resource"]
        user = self.session["user"]
        if r in ("sport_rules", "sports_id", "prejudgment", "savesports"):
            from tiyi_modules import upload as upload_module

            return upload_module.read(self, {**args, "resource": r}), "records"
        if r == "profile":
            value = self.api("l/v6/u/info", {"xh": user})
            if str(value.get("data", {}).get("xh", "")) != user:
                raise Failure(
                    "ACCOUNT_SCOPE_MISMATCH",
                    "体艺返回的个人资料账号不匹配，本次未返回。",
                )
            return value, "records"
        if r == "menus":
            return self.api("l/v6/models", {"uid": user}), "catalog"
        if r == "terms":
            return self.api("l/v6/termlist"), "records"
        if r == "summary":
            return self.api("l/v6/termSportTotal", {"xh": user}), "records"
        if r in ("records", "exercise"):
            return self.api("l/v7/sportlist", {"xh": user, "type": "0"}), "records"
        if r == "notices":
            return {
                "home": self.api("l/v7/home_notice"),
                "advance": self.api("l/v7/advance_notice"),
            }, "records"
        course_base = "http://www.tyys.zju.edu.cn/ptm/"
        if r == "course_terms":
            return self.api("l/v6/termlist", base=course_base), "records"
        if r in ("courses", "classes", "attendance"):
            terms = self.api("l/v6/termlist", base=course_base)["data"]
            year, term = args.get("schoolYear"), args.get("termId")
            if not year or not term:
                raise Failure(
                    "TERM_REQUIRED", "请先查看体艺课程学期，再选择要查的学年和学期。"
                )
            if not isinstance(terms, list) or not any(
                str(t.get("schoolYear")) == year and str(t.get("termId")) == term
                for t in terms
            ):
                raise Failure(
                    "TERM_NOT_FOUND",
                    "学校没有返回这个课程学期，请从学校学期列表重新选择。",
                )
            courses = self.api(
                "l/v6/student/courselist",
                {"termId": term, "schoolYear": year, "uid": user},
                base=course_base,
            )
            if r != "attendance" and not (r == "classes" and args.get("courseId")):
                return courses, "records"
            course = args.get("courseId")
            if not course or not any(
                str(t.get("courseId")) == course for t in courses.get("data", [])
            ):
                raise Failure(
                    "COURSE_SCOPE_UNCONFIRMED",
                    "这门课不在本人所选学期的体育课程中，请从课程列表重新选择。",
                )
            return self.api(
                "l/v6/student/attendancelist",
                {"courseId": course, "uid": user},
                base=course_base,
            ), "records"
        if r == "record_detail":
            records = self.api("l/v7/sportlist", {"xh": user, "type": "0"})["data"]
            row = next(
                (v for v in records if str(v.get("sportId")) == args.get("recordId")),
                None,
            )
            if row is None or not row.get("tableName"):
                raise Failure(
                    "RECORD_SCOPE_UNCONFIRMED",
                    "没有在本人的运动列表中找到这条记录，请先刷新记录列表。",
                )
            return self.api(
                "l/v7/sport/detail",
                {"sportId": row["sportId"], "term": row["tableName"]},
            ), "records"
        if r == "statistics":
            begin, end = args.get("begin"), args.get("end")
            if (
                not isinstance(begin, int)
                or not isinstance(end, int)
                or begin < 0
                or end < begin
                or end - begin > 730 * 86400000
                or args.get("period") not in ("WEEK", "MONTH", "TERM")
            ):
                raise Failure(
                    "INVALID_TIME_RANGE",
                    "请选择不超过两年的起止时间和周、月或学期统计方式。",
                )
            params = {
                "xh": user,
                "beginTime": begin,
                "endTime": end,
                "type": args["period"],
            }
            if args.get("validStatus") is not None:
                if args["validStatus"] not in (-1, 0, 1):
                    raise Failure(
                        "INVALID_RECORD_STATE", "请选择有效、无效或待审核记录。"
                    )
                params["validStatus"] = args["validStatus"]
            return self.api("l/v6/statistics", params), "records"
        if r == "rules":
            profile = self.resource({"resource": "profile"})[0]["data"]
            types = self.api(
                "l/v6/sporttype", {"gender": str(profile.get("xb", "0")), "uid": user}
            )
            invalid = self.api("l/v6.1/sports/invalidconf")
            return {
                "sportTypes": types,
                "invalidRules": invalid,
                "officialSubmissionAvailable": False,
            }, "records"
        module = next((m for m in MODULES if m[1] == r), None)
        if not module:
            raise Failure("RESOURCE_NOT_FOUND", "没有找到这项体艺查询。")
        menus = self.api("l/v6/models", {"uid": user})["data"]
        row = next(
            (
                v
                for v in menus
                if str(v.get("id")) == str(module[0]) and str(v.get("enable")) == "1"
            ),
            None,
        )
        if row is None:
            raise Failure(
                "MODULE_UNAVAILABLE", "学校当前没有向本账号开放这项体艺功能。"
            )
        url = row.get("url")
        if not url:
            raise Failure(
                "NATIVE_APP_REQUIRED",
                "这项功能需要手机传感器或学校 App 页面，请在学校体艺 App 中继续。",
            )
        if (
            r in ("codoon", "westward")
            and urllib.parse.urlsplit(url).hostname not in HOSTS
        ):
            return read_module(
                ModuleContext(self, module, row, url, "", Page(""), {}, None), args
            )
        url = self.checked_url(url)
        try:
            method = int(row.get("authenticationMethod", 1))
        except (ValueError, TypeError):
            raise Failure(
                "MODULE_AUTH_REQUIRED",
                "学校改变了这项功能的登录方式，请在学校 App 中继续。",
            )
        headers = {"cgAuthorization": self.session["token"], "buildVersion": "2.0"}
        auth = None
        token_base = None
        if method == 1:
            token_base = self.checked_url(row.get("tokenUrl", ""))
            if urllib.parse.urlsplit(url).netloc != urllib.parse.urlsplit(
                token_base
            ).netloc or not urllib.parse.urlsplit(url).path.startswith(
                urllib.parse.urlsplit(token_base).path.rstrip("/") + "/"
            ):
                raise Failure(
                    "MODULE_SCOPE_CHANGED",
                    "学校子系统入口与授权范围不匹配，本次没有传送登录信息。",
                )
            auth = self.api(
                "l/v6/token",
                {"uid": user},
                base=token_base.rstrip("/") + "/",
                post=True,
            )["data"]
            if not isinstance(auth, str) or not auth:
                raise Failure(
                    "MODULE_AUTH_REQUIRED",
                    "这个体艺子系统没有返回登录，请在学校 App 重新登录后重试。",
                )
            self.private_values.add(auth)
            headers["Authorization"] = auth
            if r == "fitness_attendance":
                # Club2 chooses the native-auth branch when both are present;
                # its own UUID is the credential for this scoped module.
                headers.pop("cgAuthorization", None)
        elif method not in (4, 5):
            raise Failure(
                "MODULE_AUTH_REQUIRED",
                "这项体艺功能还需要单独登录，请在学校 App 中继续。",
            )
        sub = args.get("subpage")
        p = urllib.parse.urlsplit(url)
        routes = {
            43: {
                "mine": "/cts/app/sportsTeamList",
                "attendance": "/cts/app/mySignList",
            },
            75: {"records": "/ms/jwt/app/student/attendance/record"},
            3: {
                "results": "/pft/app/resultList",
                "schedule": "/pft/app/schedulestudent",
                "feedback": "/pft/app/feedback/my",
            },
            37: {
                "records": "/gms/app/v3/my_sign",
                "results": "/gms/app/v3/my_result",
                "certificates": "/gms/app/v3/my_certificates",
                "feedback": "/gms/app/v3/competition/my_feed_back",
            },
            61: {
                "mine": "/venue/mobileSelf",
                "orders": "/venue/mobileOrders",
                "buddies": "/venue/mobileBuddies",
                "training": "/venue/mobileTrains",
                "reservation": "/venue/mobileReservation",
                "art_reservation": "/venue/mobileArtReservation",
            },
        }
        if sub:
            target = routes.get(module[0], {}).get(sub)
            if not target or p.path.split("/")[1] != target.split("/")[1]:
                raise Failure(
                    "SUBPAGE_NOT_FOUND",
                    "这个体艺入口没有这项子页面，请从该功能首页继续。",
                )
        else:
            target = (
                "/venue/mobileTrains"
                if module[0] == 67 and p.path.startswith("/venue/")
                else None
            )
        # Establish the venue cookie before its deferred destination.
        status, body = self.module_page(url, headers, token_base)
        records = (
            self.venue_records(args, url) if p.path.startswith("/venue/") else None
        )
        if records is not None:
            return records
        if target:
            url = urllib.parse.urlunsplit(
                p._replace(
                    path=target,
                    query="newPage=1" if module[0] in (3, 43) else "",
                    fragment="",
                )
            )
            status, body = self.module_page(url, headers, token_base)
        if status != 200:
            raise Failure(
                "MODULE_HTTP", "学校的这项体艺页面暂时不可用，请稍后重试。", status
            )
        page = Page(body)
        # A normal page may define rebuildToken inside its AJAX error handler.
        # Its source text is not evidence that the handler actually ran.
        login_only = not (
            page.text or page.selects or page.images or page.links
        ) and re.fullmatch(
            r'\s*<script>\s*window\.location\.href\s*=\s*([\'"])https://zjuam\.zju\.edu\.cn/cas/login\?[^\'"<>]*\1\s*;?\s*</script>\s*',
            body,
            re.I,
        )
        if (
            "登录过期" in page.text
            or "登录失效" in page.text
            or "execution" in page.inputs
            or login_only
        ):
            raise Failure(
                "MODULE_AUTH_REQUIRED",
                "这个体艺子系统的登录已过期，请在学校体艺 App 重新登录后再查询。",
            )
        return read_module(
            ModuleContext(self, module, row, url, body, page, headers, token_base), args
        )


def pointer(value, address):
    for part in address.split("/")[1:] if address else []:
        part = part.replace("~1", "/").replace("~0", "~")
        if SENSITIVE.search(part):
            raise Failure(
                "PRIVATE_FIELD", "这个位置属于登录信息，请从体艺记录正文继续。"
            )
        try:
            value = value[int(part)] if isinstance(value, list) else value[part]
        except (KeyError, IndexError, ValueError, TypeError):
            raise Failure(
                "POINTER_NOT_FOUND", "原记录中没有这个位置，请从已返回的目录继续。"
            )
    return value


def main(request):
    resource = request.get("resource", "menus")
    c = Connection(request)
    base = {
        "sourceId": SOURCE,
        "resource": resource,
        "observedAt": now(),
        "coverage": {"complete": False, "kind": "unknown"},
    }
    try:
        snapshot_id = request.get("snapshotId")
        if "snapshotId" in request and (
            not isinstance(snapshot_id, str)
            or not re.fullmatch("[a-f0-9]{32}", snapshot_id)
        ):
            raise Failure("SNAPSHOT_NOT_FOUND", "这份体艺记录地址不完整，请重新查询。")
        if snapshot_id is not None and (
            request.get("refresh")
            or any(
                request.get(field) is not None
                for field in (
                    "schoolYear",
                    "termId",
                    "courseId",
                    "recordId",
                    "begin",
                    "end",
                    "period",
                    "validStatus",
                    "subpage",
                    "upstreamPage",
                    "venueSiteId",
                    "searchDate",
                )
            )
        ):
            raise Failure(
                "SNAPSHOT_FILTER_CHANGED",
                "续读会保留原来的学期和查询范围；要换条件，请另开一次查询。",
            )
        if request.get("operation") == "catalog":
            return {
                **base,
                "status": "fresh",
                "data": {
                    "modules": [
                        {"id": i, "resource": r, "label": l} for i, r, l in MODULES
                    ],
                    "readOnly": True,
                    "schoolSubmissionAvailable": False,
                },
                "coverage": {"complete": True, "kind": "catalog"},
                "note": "这里列出本机支持的查询；账号当前开放的功能请读取学校菜单。",
            }
        # Reading a saved observation must work offline. Establish the current
        # local account without renewing its remote login first.
        local_session = load(c.root / "session.dpapi") or load(
            c.legacy / "app-session.dpapi"
        )
        credentials = load(
            Path(os.environ.get("LOCALAPPDATA", ""))
            / "CodexZjuStudentInfo"
            / "credentials.dpapi"
        )
        user = (
            credentials.get("username")
            if credentials
            else local_session.get("user")
            if local_session
            else None
        )
        if not user and c.host_transport:
            # A completed product-owned school login is sufficient. The old
            # credential store is an optional migration input, not a dependency.
            c.authenticate()
            user = c.session["user"]
        if not user:
            raise Failure(
                "CREDENTIALS_REQUIRED",
                "本机还没有校园账号，请先在校园连接窗口保存账号。",
            )
        if local_session:
            c.private_values.update(
                [local_session.get("token", ""), local_session.get("secret", "")]
            )
        account = hashlib.sha256(user.encode()).hexdigest()
        if resource in ("prejudgment", "savesports"):
            # Submissions are never cached and never served from a snapshot.
            c.expected_user = user
            c.authenticate()
            if c.session["user"] != user:
                raise Failure(
                    "ACCOUNT_SCOPE_MISMATCH",
                    "本机校园账号已变化，请重新连接体艺后再提交。",
                )
            payload, kind = c.resource(request)
            c.remember_identities(payload)
            return {
                **base,
                "status": "fresh",
                "data": payload,
                "coverage": {"complete": True, "kind": kind},
                "note": "学校回执原样返回；只有 submissionAccepted 为真才表示本次提交被接受。",
            }
        identity = {
            k: v
            for k, v in request.items()
            if k
            not in (
                "offset",
                "limit",
                "pointer",
                "refresh",
                "snapshotId",
                "privateDirectory",
                "legacyDirectory",
                "signerDirectory",
                "signerDependencies",
                "operation",
                "hostTransport",
            )
        }
        key = hashlib.sha256(
            json.dumps([account, identity], sort_keys=True).encode()
        ).hexdigest()
        cachefile = c.root / "cache" / f"{key}.dpapi"
        snapshot = None
        if snapshot_id:
            if not re.fullmatch("[a-f0-9]{32}", snapshot_id):
                raise Failure(
                    "SNAPSHOT_NOT_FOUND", "这份体艺记录地址不完整，请重新查询。"
                )
            snapshot = load(c.root / "observations" / f"{snapshot_id}.dpapi")
            if (
                not snapshot
                or snapshot.get("account") != account
                or snapshot.get("resource") != resource
            ):
                raise Failure(
                    "SNAPSHOT_NOT_FOUND",
                    "这份体艺记录不属于当前账号或查询，请重新打开。",
                )
        elif not request.get("refresh"):
            cached = load(cachefile)
            if cached and time.time() - cached.get("at", 0) < 300:
                snapshot_id = cached["id"]
                snapshot = load(c.root / "observations" / f"{snapshot_id}.dpapi")
        if snapshot is not None and (
            snapshot.get("account") != account or snapshot.get("resource") != resource
        ):
            raise Failure(
                "SNAPSHOT_SCOPE_MISMATCH",
                "保存的体艺记录与当前账号或查询不匹配，请重新查询。",
            )
        saved = bool(snapshot)
        if snapshot is None:
            c.expected_user = user
            c.authenticate()
            if c.session["user"] != user:
                raise Failure(
                    "ACCOUNT_SCOPE_MISMATCH",
                    "本机校园账号已变化，请重新连接体艺后再查询。",
                )
            if resource != "profile":
                profile = c.resource({"resource": "profile"})[0]
                c.remember_identities(profile)
            payload, kind = c.resource({**request, "resource": resource})
            c.remember_identities(payload)
            snapshot_id = uuid.uuid4().hex
            snapshot = {
                "account": account,
                "resource": resource,
                "fetchedAt": now(),
                "payload": payload,
                "kind": kind,
                "responses": c.responses,
                **(
                    {"coverage": c.resource_coverage}
                    if c.resource_coverage is not None
                    else {}
                ),
                "identityRedactions": sorted(c.identity_values),
            }
            save(c.root / "observations" / f"{snapshot_id}.dpapi", snapshot)
            save(cachefile, {"id": snapshot_id, "at": time.time()})
        source_payload = snapshot["payload"]
        venue_profile_source = (
            resource == "venues"
            and isinstance(source_payload, dict)
            and isinstance(source_payload.get("requestScope"), dict)
            and source_payload["requestScope"].get("kind") == "own_venue_profile"
        )
        training_catalog_source = (
            resource in ("training", "venues")
            and isinstance(source_payload, dict)
            and isinstance(source_payload.get("requestScope"), dict)
            and source_payload["requestScope"].get("kind") == "training_catalog"
        )
        source_kind = "catalog" if training_catalog_source else snapshot["kind"]
        address = request.get("pointer")
        if address is None:
            address = (
                "/data"
                if isinstance(snapshot["payload"], dict)
                and "code" in snapshot["payload"]
                and "data" in snapshot["payload"]
                else ""
            )
        if not isinstance(address, str) or any(
            SENSITIVE.search(part)
            or part.lower() in IDENTITY_FIELDS
            or (resource == "profile" or venue_profile_source)
            and part.lower().replace("_", "").replace("-", "")
            in (
                "name",
                "id",
                "birth",
                "birthday",
                "birthdate",
                "birthyear",
                "dateofbirth",
            )
            for part in (
                value.replace("~1", "/").replace("~0", "~")
                for value in address.split("/")[1:]
            )
        ):
            raise Failure(
                "PRIVATE_FIELD", "这个位置只保留在本机，请从体艺记录正文继续。"
            )
        c.private_values.add(user)
        # Only verified identity values, never passwords/application secrets,
        # accompany the encrypted observation so offline text has the same
        # redaction as the original fresh projection.
        c.private_values.update(
            value
            for value in snapshot.get("identityRedactions", [])
            if isinstance(value, str) and value
        )
        c.remember_identities(snapshot["payload"])
        value = c.public(pointer(snapshot["payload"], address))
        coverage = {
            "complete": source_kind != "official_page",
            "kind": source_kind,
            "upstreamPagination": "whole_response"
            if source_kind != "official_page"
            else "unknown",
            "pointer": address,
            "extent": "returned_response",
        }
        coverage.update(snapshot.get("coverage", {}))
        if venue_profile_source:
            coverage["profileRead"] = True
        else:
            coverage.pop("profileRead", None)
        # The complete immutable source, not the currently selected child,
        # establishes catalogue meaning for both old and fresh observations.
        if training_catalog_source:
            coverage["kind"] = "catalog"
        offset, limit = request.get("offset", 0), request.get("limit", 10)
        if (
            not isinstance(offset, int)
            or offset < 0
            or not isinstance(limit, int)
            or not 1 <= limit <= 100
        ):
            raise Failure("INVALID_PAGE", "每次可读取 1 到 100 条体艺记录。")
        if isinstance(value, str):
            # Bound every text leaf, including those below the object-directory
            # threshold. Six thousand code points also fit the broker's twelve
            # thousand UTF-16-unit text window for supplementary characters.
            total = len(value)
            value = value[offset : offset + 6000]
            coverage.update(
                {
                    "total": total,
                    "returned": len(value),
                    "offset": offset,
                    "unit": "unicode_codepoints",
                }
            )
            if offset + len(value) < total:
                coverage["complete"] = False
                coverage["next"] = {
                    "snapshotId": snapshot_id,
                    "offset": offset + len(value),
                    "pointer": address,
                }
        elif isinstance(value, list):
            total = len(value)
            value = value[offset : offset + limit]
            coverage.update({"total": total, "returned": len(value), "offset": offset})
            if offset + len(value) < total:
                coverage["complete"] = False
                coverage["next"] = {
                    "snapshotId": snapshot_id,
                    "offset": offset + len(value),
                    "pointer": address,
                }
        elif len(json.dumps(value, ensure_ascii=False)) > 64000:
            if isinstance(value, dict):
                items = list(value.items())
                value = {
                    "children": [
                        {
                            "key": k,
                            "pointer": address
                            + "/"
                            + k.replace("~", "~0").replace("/", "~1"),
                            "kind": type(v).__name__,
                            "count": len(v)
                            if isinstance(v, (list, dict, str))
                            else None,
                        }
                        for k, v in items[offset : offset + limit]
                    ],
                    "navigationOnly": True,
                }
                coverage.update(
                    {
                        "total": len(items),
                        "returned": len(value["children"]),
                        "offset": offset,
                        "navigationOnly": True,
                    }
                )
                if offset + len(value["children"]) < len(items):
                    coverage["next"] = {
                        "snapshotId": snapshot_id,
                        "offset": offset + len(value["children"]),
                        "pointer": address,
                    }
            coverage["complete"] = False
        return {
            **base,
            "status": (
                "partial" if not coverage["complete"] else "saved" if saved else "fresh"
            ),
            "fetchedAt": snapshot["fetchedAt"],
            "snapshotId": snapshot_id,
            "data": value,
            "coverage": coverage,
            "note": "这是学校的培训课程目录，尚未读取本人的报名记录；课程列表不证明已经报名。"
            if training_catalog_source
            else "学校汇总、原始运动流水和审核状态分别保留；实践积分与本地运动不计作学校有效次数。",
        }
    except Failure as error:
        failure = {
            "id": uuid.uuid4().hex,
            "observedAt": base["observedAt"],
            "resource": resource,
            "code": error.code,
            "httpStatus": error.status,
            "responses": c.responses,
        }
        diagnostics_saved = True
        try:
            save(c.root / "failures" / f"{failure['id']}.dpapi", failure)
            save(c.root / "last-failure.dpapi", failure)
        except (Failure, OSError):
            diagnostics_saved = False
        return {
            **base,
            "status": "auth_required"
            if "AUTH" in error.code
            or error.code
            in (
                "CREDENTIALS_REQUIRED",
                "ACCOUNT_SCOPE_MISMATCH",
                "WEBVPN_LOGIN_REQUIRED",
            )
            else "unavailable",
            "error": {
                "code": error.code,
                "message": error.message,
                "diagnosticsSaved": diagnostics_saved,
                **({"httpStatus": error.status} if error.status else {}),
            },
        }


if __name__ == "__main__":
    request = {}
    try:
        request = json.loads(sys.stdin.buffer.readline(65536))
        result = main(request)
    except Exception:
        result = {
            "sourceId": SOURCE,
            "resource": request.get("resource", "menus"),
            "observedAt": now(),
            "status": "unavailable",
            "coverage": {"complete": False, "kind": "unknown"},
            "error": {
                "code": "CONNECTOR_FAILED",
                "message": "本机体艺连接没有完成；请检查连接设置后重试，个人记录未当作空记录返回。",
            },
        }
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
