"""Read-only ZJU adapters with constrained transport and structured failures.

Protocol evidence is recorded in references/endpoints.json. Live validation is
separate from implementation. Uses Python 3.11+ standard library only.
"""
import copy
import base64
import hashlib
import html
import http.cookiejar
import http.client
import json
import re
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser

HOSTS = {'zjuam.zju.edu.cn','identity.zju.edu.cn','zdbk.zju.edu.cn',
         'courses.zju.edu.cn','yjsy.zju.edu.cn','sztz.zju.edu.cn',
         'elife.zju.edu.cn','booking.lib.zju.edu.cn','classroom.zju.edu.cn',
         'tgmedia.cmc.zju.edu.cn','education.cmc.zju.edu.cn','yjapi.cmc.zju.edu.cn','eta.zju.edu.cn'}
REDIRECTS = {301,302,303,307,308}
MAX_BODY = 8 * 1024 * 1024


class QueryError(Exception):
    def __init__(self, code, message, **details):
        super().__init__(code)
        self.code, self.message, self.details = code, message, details
    def result(self):
        return {'status':'error','error':{'code':self.code,'message':self.message,**self.details}}


def validate_url(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme != 'https' or p.hostname not in HOSTS or p.username or p.password or p.port not in (None,443):
        raise QueryError('UNAPPROVED_DESTINATION','跳转目标不在已确认的 HTTPS 学校站点中。')
    return url


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.inputs, self.refresh = {}, None
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag.lower() == 'input' and a.get('name'):
            self.inputs[a['name']] = a.get('value','')
        if tag.lower() == 'meta' and a.get('http-equiv','').lower() == 'refresh':
            m = re.search(r'url\s*=\s*(.+)',a.get('content',''),re.I)
            if m: self.refresh = m[1].strip(' \"\'')


@dataclass
class Reply:
    status: int
    headers: object
    body: bytes
    url: str
    @property
    def text(self): return self.body.decode('utf8',errors='replace')
    def json(self):
        if 'captcha_error' in self.text:
            raise QueryError('CAPTCHA_REQUIRED','学校要求验证码；请先在官方页面完成验证。')
        if self.status in (401,403) or self.status in REDIRECTS:
            raise QueryError('AUTH_REQUIRED','当前业务会话未建立、已过期或没有权限。',http_status=self.status)
        if self.status == 429:
            raise QueryError('RATE_LIMITED','学校限制请求频率；已停止，不自动重试。',http_status=429)
        if not 200 <= self.status < 300:
            raise QueryError('HTTP_ERROR','学校接口返回非成功 HTTP 状态。',http_status=self.status)
        try: value=json.loads(self.text)
        except (ValueError,TypeError):
            raise QueryError('SCHEMA_MISMATCH','响应不是预期 JSON，可能是登录页或接口变化。',http_status=self.status)
        if isinstance(value,dict):
            if value.get('success') is False:
                raise QueryError('UPSTREAM_REJECTED','学校返回业务失败；未将其当成空数据。')
            code=value.get('code', value.get('statuscode'))
            classroom_ok=(urllib.parse.urlsplit(self.url).hostname=='education.cmc.zju.edu.cn'
                          and urllib.parse.urlsplit(self.url).path=='/personal/courseapi/vlabpassportapi/v1/account-profile/course'
                          and code==1000 and value.get('status')==200)
            if code is not None and str(code) not in ('0','1','200') and not classroom_ok:
                raise QueryError('UPSTREAM_REJECTED','学校返回业务错误。',upstream_code=str(code)[:30])
            if value.get('error'):
                raise QueryError('UPSTREAM_REJECTED','学校返回错误对象。')
        return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): return None


class SchoolHTTPS(urllib.request.HTTPSHandler):
    def https_open(self,req):
        context=ssl.create_default_context()
        if urllib.parse.urlsplit(req.full_url).hostname in ('courses.zju.edu.cn','identity.zju.edu.cn'):
            # Avoid the server's undersized finite-field DH group while retaining
            # default security level, certificate verification and hostname checks.
            context.set_ciphers('DEFAULT:!DHE')
        return self.do_open(http.client.HTTPSConnection,req,context=context)


class Transport:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar(policy=http.cookiejar.DefaultCookiePolicy(
            strict_ns_domain=http.cookiejar.DefaultCookiePolicy.DomainStrictNonDomain))
        # Follow the user's existing environment/system route. School host,
        # redirect and TLS checks still apply to every authenticated request.
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler(),NoRedirect(),
            urllib.request.HTTPCookieProcessor(self.jar),SchoolHTTPS())
        self.last=0
        self.deadline=time.monotonic()+120
    def request(self,url,method='GET',body=None,headers=None):
        validate_url(url)
        remaining=self.deadline-time.monotonic()
        if remaining<=0:raise QueryError('TIMEOUT','本次请求已达到 120 秒上限。')
        time.sleep(max(0,0.18-(time.monotonic()-self.last)))
        self.last=time.monotonic()
        h={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','Accept':'*/*'}
        h.update(headers or {})
        req=urllib.request.Request(url,data=body,headers=h,method=method)
        try:
            try:resp=self.opener.open(req,timeout=min(15,remaining))
            except urllib.error.HTTPError as e:resp=e
            with resp:
                b=resp.read(MAX_BODY+1)
                if len(b)>MAX_BODY:raise QueryError('RESPONSE_TOO_LARGE','响应超过 8 MiB；请缩小查询范围。')
                result=Reply(resp.code,resp.headers,b,url)
                self.last_response=result
                return result
        except QueryError:raise
        except (urllib.error.URLError,ssl.SSLError,OSError,socket.timeout) as error:
            cause=getattr(error,'reason',error)
            reason=getattr(cause,'reason',type(cause).__name__)
            raise QueryError('NETWORK_OR_TLS','无法建立可信连接；检查校园网络、VPN 和系统证书。',network_reason=reason)


def encode_form(value):return urllib.parse.urlencode(value).encode('utf8')


class Client:
    def __init__(self,username,password,transport=None):
        self.username,self.password=username,password
        self.net=transport or Transport()
        self.sso=False
        self.logged=set()
        self.tokens={}
    def login(self):
        if self.sso:return
        base='https://zjuam.zju.edu.cn/cas/login'
        first=self.net.request(base)
        execution=Page(first.text).inputs.get('execution')
        if first.status!=200 or not execution:
            raise QueryError('AUTH_FLOW_CHANGED','统一认证登录页未提供预期表单；可能需要浏览器或二次认证。')
        key=self.net.request('https://zjuam.zju.edu.cn/cas/v2/getPubKey').json()
        try:
            number=int.from_bytes(self.password.encode('utf8'),'big')
            encrypted=format(pow(number,int(key['exponent'],16),int(key['modulus'],16)),'x').zfill(128)
        except (KeyError,ValueError,TypeError):
            raise QueryError('AUTH_FLOW_CHANGED','统一认证公钥格式发生变化。')
        reply=self.net.request(base,'POST',encode_form({'username':self.username,'password':encrypted,
            'execution':execution,'_eventId':'submit','rememberMe':'true'}),{'Content-Type':'application/x-www-form-urlencoded'})
        if not any(c.name=='iPlanetDirectoryPro' and c.value and not c.is_expired() for c in self.net.jar):
            raise QueryError('AUTH_FAILED','统一认证未成功；请检查本机凭据，或在官网处理验证码/二次认证。',http_status=reply.status)
        self.sso=True
    def service_callback(self,service):
        self.login()
        r=self.net.request('https://zjuam.zju.edu.cn/cas/login?'+urllib.parse.urlencode({'service':service}))
        location=r.headers.get('Location')
        if r.status not in REDIRECTS or not location:
            raise QueryError('AUTH_REQUIRED','未取得 CAS 业务票据。')
        target=urllib.parse.urljoin(r.url,location)
        p,s=urllib.parse.urlsplit(target),urllib.parse.urlsplit(service)
        if (p.scheme,p.netloc,p.path)!=(s.scheme,s.netloc,s.path) or not urllib.parse.parse_qs(p.query).get('ticket'):
            raise QueryError('AUTH_FLOW_CHANGED','CAS 回调与申请的业务系统不匹配。')
        if service=='http://eta.zju.edu.cn/zftal-xgxt-web/teacher/xtgl/index/check.zf':
            # Registered CAS service identifier is HTTP; consume its ticket only
            # through the confirmed HTTPS endpoint, never over plaintext.
            target=urllib.parse.urlunsplit(p._replace(scheme='https'))
        validate_url(target)
        return target
    def walk(self,url,token_name=None):
        for _ in range(15):
            validate_url(url)
            r=self.net.request(url,headers={'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'})
            location=r.headers.get('Location') if r.status in REDIRECTS else Page(r.text).refresh
            if location:
                target=urllib.parse.urljoin(url,html.unescape(location))
                parsed=urllib.parse.urlsplit(target)
                if (parsed.scheme=='http' and parsed.hostname=='eta.zju.edu.cn'
                    and urllib.parse.urlsplit(url).hostname=='eta.zju.edu.cn'):
                    target=urllib.parse.urlunsplit(parsed._replace(scheme='https'))
                validate_url(target)
                if token_name:
                    p=urllib.parse.urlsplit(target)
                    q=urllib.parse.parse_qs(p.query)
                    # E-life can put the token in a SPA fragment query.
                    q.update(urllib.parse.parse_qs(p.fragment.split('?',1)[-1]))
                    if q.get(token_name) and p.hostname=='elife.zju.edu.cn':return q[token_name][0]
                url=target
                continue
            if r.status!=200:raise QueryError('AUTH_REQUIRED','业务认证跳转未成功。',http_status=r.status)
            if 'execution' in Page(r.text).inputs:raise QueryError('AUTH_REQUIRED','业务系统返回登录表单。')
            return r
        raise QueryError('REDIRECT_LIMIT','认证跳转超过 15 次；已停止。')
    def auth(self,service):
        if service in self.logged:return
        self.login()
        if service=='zdbk':
            self.walk(self.service_callback('https://zdbk.zju.edu.cn/jwglxt/xtgl/login_ssologin.html'))
        elif service=='courses':self.walk('https://courses.zju.edu.cn/user/index')
        elif service=='grs':
            target=self.service_callback('https://yjsy.zju.edu.cn/')
            ticket=urllib.parse.parse_qs(urllib.parse.urlsplit(target).query)['ticket'][0]
            data=self.net.request('https://yjsy.zju.edu.cn/dataapi/sys/cas/client/validateLogin?'+urllib.parse.urlencode({'ticket':ticket,'service':'https://yjsy.zju.edu.cn/'})).json()
            token=data.get('result',{}).get('token')
            if not token:raise QueryError('AUTH_REQUIRED','研究生院未返回业务 token。')
            self.tokens[service]=token
        elif service=='sztz':
            self.walk(self.service_callback('https://sztz.zju.edu.cn/dekt/'))
            payload=self.net.request('https://sztz.zju.edu.cn/dekt/ctx','POST',b'',{'Content-Type':'application/x-www-form-urlencoded','Origin':'https://sztz.zju.edu.cn','Referer':'https://sztz.zju.edu.cn/dekt/'}).json()
            try:
                context=json.loads(base64.b64decode(payload['data']))
                valid=(payload.get('success') is True and str(payload.get('code'))=='0'
                       and context.get('anonymous') is False and context.get('userId')
                       and str(context['userId']).upper()!='ANONYMOUS'
                       and 'ANONYMOUS_USER_ROLE' not in json.dumps(context.get('roles')))
            except (KeyError,ValueError,TypeError):valid=False
            if not valid:raise QueryError('AUTH_REQUIRED','素拓未返回本人登录上下文。')
        elif service=='ecard':
            token=self.walk('https://elife.zju.edu.cn/berserker-auth/cas/oauth2?resultUrl=https://elife.zju.edu.cn/plat-pc','synjones-auth')
            if not isinstance(token,str):raise QueryError('AUTH_REQUIRED','校园卡未返回业务 token。')
            self.tokens[service]=token
        elif service=='booking':
            current=self.service_callback('https://booking.lib.zju.edu.cn/api/cas/cas')
            cas=None
            for _ in range(15):
                r=self.net.request(current)
                loc=r.headers.get('Location')
                if r.status not in REDIRECTS or not loc:break
                current=urllib.parse.urljoin(current,loc)
                validate_url(current)
                p=urllib.parse.urlsplit(current)
                q=urllib.parse.parse_qs(p.fragment.split('?',1)[-1])
                if p.hostname=='booking.lib.zju.edu.cn' and q.get('cas'):
                    cas=q['cas'][0];break
            if not cas:raise QueryError('AUTH_FLOW_CHANGED','预约系统未返回预期 CAS 回调。')
            data=self.net.request('https://booking.lib.zju.edu.cn/api/cas/user','POST',json.dumps({'cas':cas}).encode(),{'Content-Type':'application/json'}).json()
            token=data.get('member',{}).get('token')
            if not token:raise QueryError('AUTH_REQUIRED','预约系统未返回 token。')
            self.tokens[service]=token
        elif service=='classroom':
            landing=self.walk('https://tgmedia.cmc.zju.edu.cn/index.php?r=auth%2Flogin&forward=https%3A%2F%2Fclassroom.zju.edu.cn%2F')
            query=urllib.parse.parse_qs(urllib.parse.urlsplit(landing.url).query)
            if query.get('token'):self.tokens[service]=query['token'][0]
            for cookie in self.net.jar:
                if cookie.name=='_token' and cookie.domain.lstrip('.') in ('zju.edu.cn','cmc.zju.edu.cn','classroom.zju.edu.cn'):
                    value=urllib.parse.unquote(cookie.value)
                    match=re.search(r'\{i:\d+;s:\d+:"_token";i:\d+;s:\d+:"(.+?)";\}',value)
                    if match:self.tokens[service]=match[1];break
            if service not in self.tokens:raise QueryError('AUTH_FLOW_CHANGED','智云未返回前端使用的业务 token。')
        elif service=='eta':
            self.walk(self.service_callback('http://eta.zju.edu.cn/zftal-xgxt-web/teacher/xtgl/index/check.zf'))
        else:raise QueryError('NOT_IMPLEMENTED','该系统仍在调查登记阶段。')
        self.logged.add(service)
    def fetch(self,endpoint,params,limit,page):
        url,body,headers=build_request(endpoint,params,limit,page)
        service=endpoint['service']
        self.auth(service)
        if service=='grs':headers['X-Access-Token']=self.tokens[service]
        elif service=='ecard':headers['Synjones-Auth']='Bearer '+self.tokens[service]
        elif service=='booking':headers['Authorization']='bearer'+self.tokens[service]
        elif service=='classroom':headers['Authorization']='Bearer '+self.tokens[service]
        elif service=='zdbk':headers.update({'Referer':'https://zdbk.zju.edu.cn/jwglxt/xtgl/index_initMenu.html','X-Requested-With':'XMLHttpRequest'})
        return self.net.request(url,endpoint['method'],body,headers).json()


def checked_params(endpoint,params):
    spec=endpoint['params']
    if set(params)-set(spec):raise QueryError('INVALID_PARAMETER','参数不在此接口的已确认列表中。',allowed=list(spec))
    out={}
    for key,kind in spec.items():
        required=kind.startswith('required:');kind=kind.removeprefix('required:')
        if key not in params:
            if required:raise QueryError('PARAMETER_REQUIRED','缺少查询参数。',parameter=key)
            continue
        v=params[key]
        if kind in ('int','year'):
            if not re.fullmatch(r'\d{1,12}',str(v)):raise QueryError('INVALID_PARAMETER','参数必须为非负整数。',parameter=key)
            v=int(v)
            if kind=='year' and not 1990<=v<=2100:raise QueryError('INVALID_PARAMETER','学年必须在 1990–2100。',parameter=key)
        elif kind=='yearrange':
            if not re.fullmatch(r'20\d{2}-20\d{2}',str(v)) or int(str(v)[5:])!=int(str(v)[:4])+1:
                raise QueryError('INVALID_PARAMETER','本科课表学年格式为 2026-2027。',parameter=key)
        elif kind=='month':
            if not re.fullmatch(r'20\d{2}-(0[1-9]|1[0-2])',str(v)):
                raise QueryError('INVALID_PARAMETER','月份格式为 YYYY-MM。',parameter=key)
        elif kind=='season':
            if v not in ('1|秋','1|冬','2|春','2|夏'):
                raise QueryError('INVALID_PARAMETER','本科课表学期应为 1|秋、1|冬、2|春或 2|夏。',parameter=key)
        elif kind=='date':
            import datetime
            try:datetime.date.fromisoformat(str(v))
            except ValueError:raise QueryError('INVALID_PARAMETER','日期应为 YYYY-MM-DD。',parameter=key)
        elif not isinstance(v,str) or len(v)>100:
            raise QueryError('INVALID_PARAMETER','字符串参数过长或类型错误。',parameter=key)
        out[key]=v
    return out


def build_request(e,params,limit,page):
    if e['status'] not in ('implemented_unverified','verified'):
        raise QueryError('ENDPOINT_NOT_READY','接口已登记，但认证、参数或传输仍待验证。',catalogue_status=e['status'])
    if not 1<=limit<=100 or not 1<=page<=1000:raise QueryError('INVALID_PARAMETER','limit 范围为 1–100，page 范围为 1–1000。')
    supplied=checked_params(e,params)
    url=e['url']
    for k in list(supplied):
        if '{'+k+'}' in url:url=url.replace('{'+k+'}',urllib.parse.quote(str(supplied.pop(k)),safe=''))
    values=copy.deepcopy(e['defaults']);values.update(supplied)
    if e['paging']:
        values[e['paging']['page']]=page;values[e['paging']['size']]=limit
    elif page!=1:raise QueryError('PAGING_UNSUPPORTED','此接口尚未确认服务端分页；不能把重复第一页当成下一页。')
    headers={};body=None
    if e['encoding']=='query':
        if values:url+=('&' if '?' in url else '?')+urllib.parse.urlencode(values)
    elif e['encoding']=='json':
        body=json.dumps(values,ensure_ascii=False).encode('utf8');headers['Content-Type']='application/json'
    elif e['encoding']=='form':
        body=encode_form(values);headers['Content-Type']='application/x-www-form-urlencoded'
    validate_url(url)
    return url,body,headers


SENSITIVE=re.compile(r'password|passwd|token|ticket|cookie|authorization|synjones|secret|openid|unionid|accesskey|qrcode|qr_code|barcode|voucher',re.I)
def bounded(value,limit=10,depth=0):
    if depth>10:return '[depth limit]'
    if isinstance(value,dict):
        out={}
        for k,v in list(value.items())[:120]:
            out[k]='[redacted]' if SENSITIVE.search(k) else bounded(v,limit,depth+1)
        if len(value)>120:out['_omitted_fields']=len(value)-120
        return out
    if isinstance(value,list):
        out=[bounded(x,limit,depth+1) for x in value[:limit]]
        if len(value)>limit:out.append({'_omitted_items':len(value)-limit})
        return out
    if isinstance(value,str):
        value=re.sub(r'(?i)((?:token|ticket|code|synjones-auth|password)=)[^&\s"<>]+',r'\1[redacted]',value)
        value=re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b','[redacted]',value)
        return value[:1500]+('…' if len(value)>1500 else '')
    return value


def extract(data,paths,nullable_paths=()):
    for path in paths:
        cur=data;found=True
        if path:
            for k in path.split('.'):
                if isinstance(cur,dict) and k in cur:cur=cur[k]
                else:found=False;break
        if found and cur is not None:return cur,path
        if found and cur is None and path in nullable_paths:return [],path
    raise QueryError('SCHEMA_MISMATCH','JSON 缺少已知的数据字段；未作为空列表处理。',expected_paths=paths)


def fingerprint(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
