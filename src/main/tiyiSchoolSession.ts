import { BrowserWindow, net, session, type Session } from 'electron';
import { createCipheriv } from 'node:crypto';
import { TiyiTransportError, type TiyiHttpRequest, type TiyiHttpReply } from './integrations/tiyi-transport';

const GATEWAY = 'https://webvpn.zju.edu.cn';
const SCHOOL_HOSTS = ['tyys.zju.edu.cn', 'www.tyys.zju.edu.cn', 'zjuam.zju.edu.cn'] as const;
const MODULE_PATH = /^\/(?:cgapp-server|ptm|pft|cts|ms|venue|gms|club2|westward|ggtypt)(?:\/|$)/;
const VENUE_READ_PATHS = new Set([
  '/venue-server/api/orders/mine',
  '/venue-server/api/venue/trains',
  '/venue-server/api/buddies',
  '/venue-server/api/reservation/campus/venue/info',
  '/venue-server/api/reservation/day/info',
]);
const VENUE_AUTH_METHODS = new Map([
  ['/venue-server/api/app/login/init', 'GET'],
  ['/venue-server/api/login', 'POST'],
]);
const MAX_BODY = 8 * 1024 * 1024;
const CAS_SERVICES = new Set([
  'http://www.tyys.zju.edu.cn/cgapp-server/cas/appLogin',
  'https://www.tyys.zju.edu.cn/cgapp-server/cas/appLogin',
  'https://tyys.zju.edu.cn/cgapp-server/cas/appLogin',
]);

export interface TiyiSchoolSessionState {
  gatewayAuthenticated: boolean;
  gatewayStatus: 'authenticated' | 'login_required' | 'unavailable';
  windowOpen: boolean;
  reason?: string;
  /** Local diagnostics only; no URL, headers, response body or credentials. */
  diagnostic?: { code: string; httpStatus?: number; networkCode?: string };
}

/** Product-owned school session. Never reads Chrome, Codex or another profile. */
export class TiyiSchoolSession {
  private readonly profile: Session;
  private loginWindow?: BrowserWindow;
  private routing?: { key: Buffer; iv: Buffer; at: number };
  private gatewayStatus: TiyiSchoolSessionState['gatewayStatus'] = 'login_required';
  private disposed = false;
  private routingSequence = 0;
  private lastRoutingUpdate = 0;
  private diagnostic?: TiyiSchoolSessionState['diagnostic'];
  private reason = '请在校园连接窗口登录学校 WebVPN，登录信息只由本产品的独立窗口保存。';
  private readonly pending = new Set<AbortController>();

  constructor(private options: { parent?: () => BrowserWindow | undefined; partition?: string } = {}) {
    const partition = options.partition ?? 'persist:zaichang-tiyi-school';
    if (!/^persist:zaichang-tiyi-school(?:-[a-z0-9-]{1,64})?$/.test(partition)) throw new Error('校园连接分区不完整。');
    this.profile = session.fromPartition(partition);
    this.profile.setPermissionRequestHandler((_web, _permission, done) => done(false));
    this.profile.setPermissionCheckHandler(() => false);
    this.profile.on('will-download', event => event.preventDefault());
    // Only the official gateway and the three explicitly registered upstreams
    // can load in this partition. No external browser or arbitrary campus URL.
    this.profile.webRequest.onBeforeRequest((details, done) => done({ cancel: !this.windowUrlAllowed(details.url, details.method) }));
  }

  state(): TiyiSchoolSessionState {
    return { gatewayAuthenticated: this.gatewayStatus === 'authenticated', gatewayStatus: this.gatewayStatus,
      windowOpen: !!this.loginWindow && !this.loginWindow.isDestroyed(),
      ...(this.gatewayStatus !== 'authenticated' ? { reason: this.reason, ...(this.diagnostic ? { diagnostic: this.diagnostic } : {}) } : {}) };
  }

  private routePrefix(origin: string): string {
    if (!this.routing) throw new TiyiTransportError('WEBVPN_LOGIN_REQUIRED', this.reason);
    const original = new URL(origin);
    if (!SCHOOL_HOSTS.includes(original.hostname as typeof SCHOOL_HOSTS[number]) || !['http:', 'https:'].includes(original.protocol))
      throw new TiyiTransportError('SCHOOL_ROUTE_FORBIDDEN', '这个地址不在体艺连接范围内。');
    // Matches the school's published portal JavaScript (c68346a.js): UTF-8,
    // zero padding, AES-CFB with 16-byte segments, IV prefix and hostname bytes.
    // These are public routing parameters, not authentication credentials.
    const host = Buffer.from(original.hostname, 'utf8');
    const padded = Buffer.concat([host, Buffer.alloc((16 - host.length % 16) % 16, 0x30)]);
    const cipher = createCipheriv('aes-128-cfb', this.routing.key, this.routing.iv);
    const encoded = Buffer.concat([cipher.update(padded), cipher.final()]).subarray(0, host.length).toString('hex');
    return `${GATEWAY}/${original.protocol.slice(0, -1)}/${this.routing.iv.toString('hex')}${encoded}`;
  }

  private schoolUrl(value: string): URL {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !SCHOOL_HOSTS.includes(url.hostname as typeof SCHOOL_HOSTS[number])
      || url.username || url.password || url.port)
      throw new TiyiTransportError('SCHOOL_ROUTE_FORBIDDEN', '这个地址不在体艺连接范围内。');
    if (url.hostname === 'zjuam.zju.edu.cn') {
      if (url.protocol !== 'https:' || !['/cas/login', '/cas/v2/getPubKey'].includes(url.pathname))
        throw new TiyiTransportError('SCHOOL_ROUTE_FORBIDDEN', '这个认证步骤不在体艺连接范围内。');
      this.checkService(url);
    } else if (!MODULE_PATH.test(url.pathname) && !VENUE_READ_PATHS.has(url.pathname) && !VENUE_AUTH_METHODS.has(url.pathname))
      throw new TiyiTransportError('SCHOOL_ROUTE_FORBIDDEN', '这个页面不在体艺连接范围内。');
    return url;
  }

  private checkService(url: URL): void {
    const targets = url.searchParams.getAll('service');
    if (!targets.length) return;
    if (targets.length !== 1 || !CAS_SERVICES.has(targets[0]))
      throw new TiyiTransportError('SCHOOL_ROUTE_FORBIDDEN', '这次认证没有指向学校体艺。');
  }

  private windowUrlAllowed(value: string, method?: string): boolean {
    if (value === 'about:blank') return true;
    try {
      const url = new URL(value);
      if (url.origin !== GATEWAY || url.username || url.password) return false;
      // A differently encoded proxy prefix must not pass as a portal asset.
      const first = url.pathname.split('/')[1];
      if (decodeURIComponent(first) !== first || url.pathname.startsWith('//')) return false;
      if (!/^\/(?:https?)(?:-\d+)?\//.test(url.pathname)) return true;
      if (!this.routing) return false;
      return SCHOOL_HOSTS.some(host => ['http:', 'https:'].some(scheme => {
        const prefix = new URL(this.routePrefix(`${scheme}//${host}`)).pathname;
        if (!url.pathname.startsWith(prefix + '/')) return false;
        const path = url.pathname.slice(prefix.length);
        if (host === 'zjuam.zju.edu.cn') {
          if (scheme !== 'https:' || !/^\/(?:cas|zjuam-main)(?:\/|$)/.test(path)) return false;
          this.checkService(new URL(`${scheme}//${host}${path}${url.search}`));
          return true;
        }
        return MODULE_PATH.test(path) || VENUE_READ_PATHS.has(path) && (method === undefined || method === 'GET')
          || VENUE_AUTH_METHODS.has(path) && (method === undefined || method === VENUE_AUTH_METHODS.get(path));
      }));
    } catch { return false; }
  }

  async inspect(signal?: AbortSignal): Promise<TiyiSchoolSessionState> {
    const operation = this.operation(signal);
    try { await this.refreshRouting(operation.signal, true); } catch { /* refreshRouting records the actual connection state. */ }
    finally { operation.end(); }
    return this.state();
  }

  private async refreshRouting(signal?: AbortSignal, force = false): Promise<void> {
    if (!force && this.gatewayStatus === 'authenticated' && this.routing && Date.now() - this.routing.at < 30000) return;
    const sequence = ++this.routingSequence;
    let httpStatus: number | undefined;
    try {
      const response = await this.hop(`${GATEWAY}/user/info`, 'GET', {}, undefined, signal);
      httpStatus = response.status;
      const location = response.headers.location ? new URL(response.headers.location, GATEWAY) : undefined;
      if ([401, 403].includes(response.status) || location?.origin === GATEWAY && location.pathname === '/login')
        throw new TiyiTransportError('WEBVPN_LOGIN_REQUIRED', '学校 WebVPN 需要登录，请在校园连接窗口继续。');
      if (response.status !== 200)
        throw new TiyiTransportError('WEBVPN_UNAVAILABLE', '学校校园连接暂时没有完整答复；原有登录仍保留，可以稍后重试。');
      let root: Record<string, unknown>;
      try { root = JSON.parse(response.body.toString('utf8')); } catch {
        throw new TiyiTransportError('WEBVPN_ROUTE_UNAVAILABLE', '这次没有读到学校校园连接的完整回复；原有登录仍保留，请稍后重试。');
      }
      const value = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
      const key = typeof value.wrdvpnKey === 'string' ? Buffer.from(value.wrdvpnKey, 'utf8') : undefined;
      const iv = typeof value.wrdvpnIV === 'string' ? Buffer.from(value.wrdvpnIV, 'utf8') : undefined;
      if (!key || !iv || key.length !== 16 || iv.length !== 16 || !Array.isArray(value.canVisitProtocol)
        || !value.canVisitProtocol.includes('http') || !value.canVisitProtocol.includes('https')) {
        throw new TiyiTransportError('WEBVPN_ROUTE_UNAVAILABLE', '学校 WebVPN 没有提供体艺需要的网页访问方式，请在校园连接窗口查看。');
      }
      signal?.throwIfAborted();
      if (sequence < this.lastRoutingUpdate) {
        if (this.gatewayStatus === 'authenticated' && this.routing) return;
        throw new TiyiTransportError('WEBVPN_RECHECK_REQUIRED', this.reason);
      }
      this.routing = { key, iv, at: Date.now() };
      this.lastRoutingUpdate = sequence;
      this.gatewayStatus = 'authenticated';
      this.diagnostic = undefined;
      this.reason = '';
    } catch (error) {
      // Neither an earlier cancellation nor an earlier success can replace a
      // newer connection check, including a newer observed logout.
      if (sequence >= this.lastRoutingUpdate) {
        this.lastRoutingUpdate = sequence;
        this.gatewayStatus = error instanceof TiyiTransportError && error.code === 'WEBVPN_LOGIN_REQUIRED' ? 'login_required' : 'unavailable';
        if (this.gatewayStatus === 'login_required') this.routing = undefined;
        this.reason = error instanceof TiyiTransportError ? error.message
          : '这次暂时没能确认学校校园连接；原有登录仍保留，可以稍后重试。';
        const networkCode = error instanceof Error ? (error as Error & { networkCode?: string }).networkCode : undefined;
        this.diagnostic = { code: error instanceof TiyiTransportError && /^[A-Z_]{1,64}$/.test(error.code) ? error.code : 'SCHOOL_TRANSPORT_FAILED',
          ...(httpStatus !== undefined ? { httpStatus } : {}),
          ...(networkCode && /^net::ERR_[A-Z0-9_]+$/.test(networkCode) ? { networkCode } : {}) };
      }
      throw error;
    }
  }

  async openLogin(accountLogin = false): Promise<TiyiSchoolSessionState> {
    if (this.disposed) throw new TiyiTransportError('SCHOOL_CONNECTION_CLOSED', '校园连接已关闭。');
    let target = GATEWAY;
    if (accountLogin) {
      const state = await this.inspect();
      if (!state.gatewayAuthenticated) throw new TiyiTransportError(
        state.gatewayStatus === 'login_required' ? 'WEBVPN_LOGIN_REQUIRED' : 'WEBVPN_UNAVAILABLE', state.reason!);
      const login = new URL('https://zjuam.zju.edu.cn/cas/login');
      login.searchParams.set('service', 'http://www.tyys.zju.edu.cn/cgapp-server/cas/appLogin');
      target = this.routePrefix(login.origin) + login.pathname + login.search;
    }
    if (!this.loginWindow || this.loginWindow.isDestroyed()) {
      const win = new BrowserWindow({ width: 1080, height: 820, minWidth: 760, minHeight: 600,
        title: accountLogin ? '浙大体艺 · 统一身份认证' : '浙大体艺 · 校园连接', parent: this.options.parent?.(),
        autoHideMenuBar: true, webPreferences: { session: this.profile, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
      this.loginWindow = win;
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (!this.disposed && this.loginWindow === win && !win.isDestroyed() && this.windowUrlAllowed(url))
          void win.loadURL(url).catch(() => undefined);
        return { action: 'deny' };
      });
      win.webContents.on('will-navigate', (event, url) => { if (!this.windowUrlAllowed(url)) event.preventDefault(); });
      win.webContents.on('will-redirect', (event, url) => { if (!this.windowUrlAllowed(url)) event.preventDefault(); });
      win.webContents.on('did-finish-load', () => {
        if (!this.disposed && this.loginWindow === win && !win.isDestroyed()) void this.inspect().catch(() => undefined);
      });
      win.once('closed', () => { if (this.loginWindow === win) this.loginWindow = undefined; });
    }
    const win = this.loginWindow;
    try { await win.loadURL(target); } catch {
      if (win.isDestroyed() || this.disposed) return this.state();
      throw new TiyiTransportError('SCHOOL_PAGE_UNAVAILABLE', '学校登录页面这次没有打开，请稍后重试。');
    }
    if (!win.isDestroyed() && !this.disposed) { win.show(); win.focus(); }
    return this.state();
  }

  private operation(signal?: AbortSignal): { signal: AbortSignal; end: () => void } {
    if (this.disposed) throw new TiyiTransportError('SCHOOL_CONNECTION_CLOSED', '校园连接已关闭。');
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(new TiyiTransportError('SCHOOL_CANCELLED', '这次校园查询已停下。'));
    signal?.addEventListener('abort', abort, { once: true });
    this.pending.add(controller);
    const timer = setTimeout(() => controller.abort(new TiyiTransportError('SCHOOL_TIMEOUT', '学校这次还没有完整答复，可以稍后重试。')), 25000);
    return { signal: controller.signal, end: () => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); this.pending.delete(controller);
    } };
  }

  private hop(url: string, method: 'GET' | 'POST', headers: Record<string, string>, body?: Buffer, signal?: AbortSignal):
    Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const request = net.request({ url, method, session: this.profile, credentials: 'include', redirect: 'manual', cache: 'no-store' });
      let settled = false;
      const finish = (error?: Error, value?: { status: number; headers: Record<string, string>; body: Buffer }) => {
        if (settled) return;
        settled = true; signal?.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(value!);
      };
      const abort = () => {
        finish(signal?.reason instanceof TiyiTransportError ? signal.reason : new TiyiTransportError('SCHOOL_CANCELLED', '这次校园查询已停下。'));
        request.abort();
      };
      const publicHeaders = (values: Record<string, string | string[]>): Record<string, string> => {
        const result: Record<string, string> = {};
        for (const [name, value] of Object.entries(values)) if (/^(?:content-type|location)$/i.test(name))
          result[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
        return result;
      };
      const networkError = (error: unknown, message: string): TiyiTransportError & { networkCode?: string } => {
        const code = error instanceof Error ? error.message.match(/\bnet::ERR_[A-Z0-9_]+\b/)?.[0] : undefined;
        return Object.assign(new TiyiTransportError('SCHOOL_TRANSPORT_FAILED', message), code ? { networkCode: code } : {});
      };
      // Electron 44's fetch({redirect:'manual'}) rejects redirects. Capture the
      // redirect event instead, then stop before forwarding any header or body.
      request.on('redirect', (status, _method, target, values) => {
        finish(undefined, { status, headers: { ...publicHeaders(values), location: target }, body: Buffer.alloc(0) });
        request.abort();
      });
      request.on('response', response => {
        const parts: Buffer[] = []; let length = 0;
        response.on('data', (chunk: Buffer) => {
          if (settled) return;
          length += chunk.length;
          if (length > MAX_BODY) {
            finish(new TiyiTransportError('SCHOOL_RESPONSE_TOO_LARGE', '学校返回的内容超过本次容量，请缩小范围。'));
            request.abort(); return;
          }
          parts.push(Buffer.from(chunk));
        });
        response.on('end', () => finish(undefined, { status: response.statusCode, headers: publicHeaders(response.headers), body: Buffer.concat(parts) }));
        response.on('error', error => finish(networkError(error, '学校的回复中途断开了，请稍后重试。')));
        response.on('aborted', () => finish(new TiyiTransportError('SCHOOL_TRANSPORT_FAILED', '学校的回复中途断开了，请稍后重试。')));
      });
      request.on('error', error => finish(networkError(error, '校园连接暂时没有完成，请稍后重试。')));
      // This Writable may close after its upload ends while Chromium is still
      // waiting for HTTP. Only response/error/abort or our deadline ends a hop.
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      try {
        for (const [key, value] of Object.entries(headers)) request.setHeader(key, value);
        request.end(body);
      } catch {
        finish(new TiyiTransportError('SCHOOL_TRANSPORT_FAILED', '这次校园请求没有发出，请稍后重试。'));
        request.abort();
      }
    });
  }

  /** Only our trusted connector can call this; no IPC or model-controlled URL. */
  async request(input: TiyiHttpRequest, signal?: AbortSignal): Promise<TiyiHttpReply> {
    const upstream = this.schoolUrl(input.url);
    const venueAuthMethod = VENUE_AUTH_METHODS.get(upstream.pathname);
    const venueLogin = venueAuthMethod === 'POST' && input.method === 'POST';
    if (!['GET', 'POST'].includes(input.method) || venueAuthMethod !== undefined && input.method !== venueAuthMethod || input.method === 'POST'
      && !(upstream.hostname === 'zjuam.zju.edu.cn' && upstream.pathname === '/cas/login')
      && !/\/api\/l\/v6\/token$/.test(upstream.pathname) && !venueLogin)
      throw new TiyiTransportError('SCHOOL_WRITE_FORBIDDEN', '这项连接只查询体艺内容，不提交学校业务。');
    const operation = this.operation(signal);
    try {
      await this.refreshRouting(operation.signal);
      const target = this.routePrefix(upstream.origin) + upstream.pathname + upstream.search;
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(input.headers)) {
        if (!/^(?:user-agent|accept|content-type|cgauthorization|cgappauthorization|authorization|oauth-token|timestamp|sign|imei|v1|client|buildversion|app-key)$/i.test(key)
          || typeof value !== 'string' || /[\r\n]/.test(value)
          || /^cgappauthorization$/i.test(key) && !VENUE_READ_PATHS.has(upstream.pathname) && venueAuthMethod === undefined
          || /^oauth-token$/i.test(key) && !venueLogin
          || upstream.hostname === 'zjuam.zju.edu.cn' && /^(?:cgauthorization|authorization|timestamp|sign|imei|v1|client|buildversion|app-key)$/i.test(key))
          throw new TiyiTransportError('SCHOOL_HEADER_FORBIDDEN', '体艺连接的请求格式变了，我先停下了；可以重新检查连接。');
        headers[key] = value;
      }
      const body = input.bodyBase64 ? Buffer.from(input.bodyBase64, 'base64') : undefined;
      if (venueLogin && body?.length) throw new TiyiTransportError('SCHOOL_WRITE_FORBIDDEN', '场馆连接只提交空的登录表单，不提交学校业务。');
      if (body && body.length > 65536) throw new TiyiTransportError('SCHOOL_REQUEST_TOO_LARGE', '这次校园请求内容过长。');
      const response = await this.hop(target, input.method, headers, body, operation.signal);
      const location = response.headers.location;
      let publicLocation: string | undefined;
      if (location) {
        const absolute = new URL(location, target);
        if (absolute.origin === GATEWAY && absolute.pathname === '/login') {
          this.routing = undefined;
          this.gatewayStatus = 'login_required';
          this.reason = '学校 WebVPN 登录已过期，请在校园连接窗口恢复登录。';
          throw new TiyiTransportError('WEBVPN_LOGIN_REQUIRED', '学校 WebVPN 登录已过期，请在校园连接窗口恢复登录。');
        }
        if (absolute.origin === GATEWAY) {
          outer: for (const host of SCHOOL_HOSTS) for (const scheme of ['http:', 'https:']) {
            const prefix = new URL(this.routePrefix(`${scheme}//${host}`)).pathname;
            if (absolute.pathname.startsWith(prefix + '/')) {
              publicLocation = `${scheme}//${host}${absolute.pathname.slice(prefix.length)}${absolute.search}`;
              break outer;
            }
          }
          if (!publicLocation) throw new TiyiTransportError('SCHOOL_REDIRECT_FORBIDDEN', '学校跳转离开了体艺连接范围，本次已停下。');
        } else publicLocation = absolute.href;
        publicLocation = this.schoolUrl(publicLocation).href;
      }
      return { status: response.status, headers: { 'Content-Type': response.headers['content-type'] ?? 'application/octet-stream',
        ...(publicLocation ? { Location: publicLocation } : {}) }, bodyBase64: response.body.toString('base64') };
    } finally {
      operation.end();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancelRequests();
    this.routing = undefined;
    this.gatewayStatus = 'unavailable';
    this.reason = '校园连接已关闭。';
    this.closeLogin();
  }

  closeLogin(): void {
    const win = this.loginWindow;
    this.loginWindow = undefined;
    // A school page's beforeunload handler cannot keep a private window open
    // after the host switches to a public surface. The persistent login stays.
    if (win && !win.isDestroyed()) win.destroy();
  }

  cancelRequests(): void {
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
  }
}
