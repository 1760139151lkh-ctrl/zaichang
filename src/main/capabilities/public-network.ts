import { lookup } from 'node:dns/promises';
import { Agent, request } from 'node:https';
import { isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { HarnessError } from '../../shared/harness';
import { imageMagicMatches } from '../materials/raster';
export { imageMagicMatches } from '../materials/raster';

const MAX_BODY = 2_000_000;
const MAX_PDF_BODY = 8_000_000;
const MAX_IMAGE_BODY = 4_000_000;
const allowedTypes = /^(text\/(?:html|plain|markdown|xml)|application\/(?:json|ld\+json|xml|rss\+xml|atom\+xml|xhtml\+xml|pdf)|image\/(?:png|jpeg|webp|gif))(?:;|$)/i;
const imageType = /^image\/(png|jpeg|webp|gif)(?:;|$)/i;
const bodyLimit = (type: string) => /^application\/pdf(?:;|$)/i.test(type) ? MAX_PDF_BODY : imageType.test(type) ? MAX_IMAGE_BODY : MAX_BODY;
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c, d] = address.split('.').map(Number);
    // IANA reserves 192.0.0.0/24, not all of 192.0.0.0/16. Public
    // 192.0.66.* hosts (including NASA) must keep working. The two globally
    // reachable protocol anycasts are the registry's explicit exceptions.
    if (a === 192 && b === 0 && c === 0) return d === 9 || d === 10;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 && c === 2 || b === 88 && c === 99))
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    // Only global unicast. This excludes mapped IPv4, loopback, link-local,
    // multicast and unique-local addresses rather than guessing their intent.
    return /^[23][0-9a-f]{3}:/.test(normalized) && !normalized.startsWith('2001:db8:') && !normalized.startsWith('2001:0:');
  }
  return false;
}
/** Syntactic public-address check shared with static page navigation. DNS and
 * redirects are still checked again by publicFetch when a link is followed. */
export function publicResourceUrl(input: string) {
  const url = new URL(input);
  const address = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.href.length > 8192 ||
      (!isIP(address) && !url.hostname.includes('.')) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) ||
      (isIP(address) && !publicAddress(address)))
    throw new HarnessError('public_address_forbidden', '这个地址不适合用公开网页入口打开，请换成公开HTTPS链接；校园登录资料可从校园连接里查看。');
  return url;
}
type Address = { address: string; family: number };
type RawResponse = { status: number; headers: Record<string, string>; body: Buffer };
export interface PublicNetworkPorts {
  resolve(host: string, signal?: AbortSignal): Promise<Address[]>;
  request(url: URL, addresses: Address[], signal: AbortSignal): Promise<RawResponse>;
}
type Route = { proxy?: string };
function decodedBody(raw: RawResponse, maximum: number) {
  try {
    const encoding = raw.headers['content-encoding'];
    if (encoding === 'gzip') return gunzipSync(raw.body, { maxOutputLength: maximum });
    if (encoding === 'deflate') return inflateSync(raw.body, { maxOutputLength: maximum });
    if (encoding === 'br') return brotliDecompressSync(raw.body, { maxOutputLength: maximum });
    if (encoding && encoding !== 'identity') throw new HarnessError('public_encoding', '资料压缩格式不可读取。');
    return raw.body;
  } catch (error) {
    if ((error as any)?.code === 'ERR_BUFFER_TOO_LARGE') throw new HarnessError('public_body_limit', '资料解压后超过读取上限。');
    throw error;
  }
}
// Match NO_PROXY against the original target, before replacing its transport
// hostname with an IP. These are Node's supported host/port, suffix, wildcard
// and IPv4-range forms; an entry must never turn an unrelated host into DIRECT.
function bypassProxy(url: URL, value: string) {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase(), port = url.port || '443';
  const ipv4Number = (ip: string) => ip.split('.').reduce((total, part) => total * 256 + Number(part), 0);
  return value.split(',').some(raw => {
    let entry = raw.trim().toLowerCase();
    if (isIP(entry) !== 6) {
      const qualified = entry.match(/^(.*):(\d+)$/);
      if (qualified) { if (qualified[2] !== port) return false; entry = qualified[1]; }
    }
    entry = entry.replace(/^\[|\]$/g, '');
    if (entry === '*' || entry === host) return true;
    if (entry.startsWith('.') && (host === entry.slice(1) || host.endsWith(entry))) return true;
    if (entry.startsWith('*.') && host.endsWith(entry.slice(1))) return true;
    if (isIP(host) === 4 && entry.includes('-')) {
      const range = entry.split('-').map(part => part.trim());
      return range.length === 2 && range.every(ip => isIP(ip) === 4) && ipv4Number(host) >= ipv4Number(range[0]) && ipv4Number(host) <= ipv4Number(range[1]);
    }
    return false;
  });
}
function currentRoute(url: URL): Route {
  // Only proxy settings are read. Account/API credentials and inherited request
  // headers are never copied to an agent or a public request.
  const configured = process.env.https_proxy || process.env.HTTPS_PROXY;
  const excluded = process.env.no_proxy || process.env.NO_PROXY || '';
  if (!configured || bypassProxy(url, excluded)) return {};
  try {
    if (configured.length > 8192 || /[\r\n]/.test(configured)) throw new Error();
    const proxy = new URL(configured);
    if (!['http:', 'https:'].includes(proxy.protocol) || !proxy.hostname || proxy.hash || proxy.search || proxy.pathname !== '/') throw new Error();
    // Decode only to validate the configured proxy authentication. The values
    // stay in the agent and are never returned, logged or added to target GET.
    decodeURIComponent(proxy.username); decodeURIComponent(proxy.password);
    return { proxy: proxy.href };
  } catch { throw new HarnessError('public_proxy_config', '当前代理配置不能用于公开HTTPS读取，请检查所选代理。'); }
}
async function localAddresses(host: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let stop: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    if (signal) { stop = () => reject(signal.reason); signal.addEventListener('abort', stop, { once: true }); }
  });
  try { return await Promise.race([lookup(host, { all: true, verbatim: true }), cancelled]); }
  finally { if (stop) signal!.removeEventListener('abort', stop); }
}
function requestEndpoint(url: URL, addresses: Address[] | undefined, signal: AbortSignal, route = currentRoute(url), dns = false): Promise<RawResponse> {
  signal.throwIfAborted();
  if (addresses && (!addresses.length || addresses.some(item => !publicAddress(item.address) || isIP(item.address) !== item.family)))
    throw new HarnessError('public_address_forbidden', '目标解析到了非公开网络，读取已停止。');
  if (!addresses && (!dns || url.origin !== 'https://cloudflare-dns.com' || url.pathname !== '/dns-query' || !route.proxy))
    throw new HarnessError('public_dns', '公开读取没有取得可固定的目标地址。');
  const originalHost = url.hostname.replace(/^\[|\]$/g, '');
  const transport = new URL(url);
  if (addresses) transport.hostname = addresses[0].family === 6 ? `[${addresses[0].address}]` : addresses[0].address;
  let agent: Agent;
  try { agent = new Agent({ keepAlive: false, proxyEnv: route.proxy ? { HTTPS_PROXY: route.proxy } : {} }); }
  catch { throw new HarnessError('public_proxy_config', '当前代理配置不能用于公开HTTPS读取，请检查所选代理。'); }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, data?: RawResponse) => {
      if (settled) return;
      settled = true; agent.destroy();
      if (error) reject(error); else resolve(data!);
    };
    // A numeric transport hostname pins both direct TCP and native proxy
    // CONNECT. Original Host/SNI and certificate identity remain independent.
    const req = request(transport, { method: 'GET', signal, agent, rejectUnauthorized: true,
      servername: isIP(originalHost) ? '' : originalHost,
      checkServerIdentity: (_host, certificate) => checkServerIdentity(originalHost, certificate),
      headers: { Host: url.host, Accept: dns ? 'application/dns-json' : 'text/html,application/json,application/xml,text/plain;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'identity', 'User-Agent': 'Zaichang/0.3 public-resource-reader' },
      ...(addresses ? { lookup: (_host: string, options: any, callback: any) => {
        if (typeof options === 'object' && options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      } } : {}),
    }, response => {
      const chunks: Buffer[] = []; let bytes = 0;
      const maximum = dns ? 20000 : bodyLimit(String(response.headers['content-type'] || ''));
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maximum) {
          const error = new HarnessError(dns ? 'public_dns' : 'public_body_limit', '资料超过声明的读取体积上限。');
          response.destroy(error); req.destroy(error); finish(error); return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('error', error => finish(error));
      response.on('end', () => finish(undefined, { status: response.statusCode || 0,
        headers: Object.fromEntries(Object.entries(response.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), body: Buffer.concat(chunks) }));
    });
    req.on('error', error => finish(error)); req.end();
  });
}
async function resolvePublic(host: string, signal?: AbortSignal): Promise<Address[]> {
  signal?.throwIfAborted();
  if (isIP(host)) return [{ address: host, family: isIP(host) }];
  let local: Address[] = [];
  try { local = await localAddresses(host, signal); }
  catch (error) {
    signal?.throwIfAborted();
    if (!['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL'].includes(String((error as any)?.code))) throw new HarnessError('public_dns', '公开域名解析暂不可用。');
  }
  // Private/mixed local answers cannot be washed into a public answer. Only
  // the established all-Fake-IP exception may cross this rejection boundary.
  const fake = local.length && local.every(item => /^198\.(?:18|19)\./.test(item.address));
  if (local.length && !fake) {
    if (local.some(item => !publicAddress(item.address))) return local;
    // Proxy DNS can differ from the local network's public-looking answers.
    // Authenticate the public hostname through the fixed DoH service whenever
    // its normal route uses a proxy; a normal direct route keeps local DNS.
    if (!currentRoute(new URL(`https://${host}/`)).proxy) return local;
  }
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name', host); url.searchParams.set('type', 'A');
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);
  const route = currentRoute(url);
  // A configured proxy may bootstrap only this fixed DNS service hostname.
  // Direct DNS-service access still pins its separately checked public answers.
  const bootstrap = route.proxy ? undefined : await localAddresses(url.hostname, deadline);
  const raw = await requestEndpoint(url, bootstrap, deadline, route, true);
  deadline.throwIfAborted();
  if (raw.status !== 200 || !/^application\/(?:dns-json|json)(?:;|$)/i.test(raw.headers['content-type'] || ''))
    throw new HarnessError('public_dns', '没有取得固定DNS服务的有效响应。');
  let data: any;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodedBody(raw, 20000))); }
  catch { throw new HarnessError('public_dns', '没有取得固定DNS服务的有效解析。'); }
  if (data.Status !== 0 || !Array.isArray(data.Question) || data.Question.length !== 1 || data.Question[0]?.type !== 1 || typeof data.Question[0]?.name !== 'string' || data.Question[0].name.replace(/\.$/, '').toLowerCase() !== host.toLowerCase() || !Array.isArray(data.Answer))
    throw new HarnessError('public_dns', '没有取得此公开域名的有效解析。');
  const answers = data.Answer.filter((answer: any) => answer.type === 1);
  if (!answers.length || answers.some((answer: any) => typeof answer.data !== 'string' || isIP(answer.data) !== 4))
    throw new HarnessError('public_dns', '没有取得此公开域名的有效地址。');
  return answers.map((answer: any) => ({ address: answer.data, family: 4 }));
}
const defaultPorts: PublicNetworkPorts = { resolve: resolvePublic, request: (url, addresses, signal) => requestEndpoint(url, addresses, signal) };

export async function publicFetch(input: string, signal: AbortSignal, ports: PublicNetworkPorts = defaultPorts): Promise<Response> {
  let url = publicResourceUrl(input);
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted();
    const addresses = await ports.resolve(url.hostname.replace(/^\[|\]$/g, ''), signal);
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new HarnessError('public_address_forbidden', '目标解析到了非公开网络，读取已停止。');
    const raw = await ports.request(url, addresses, signal);
    signal.throwIfAborted();
    if ([301, 302, 303, 307, 308].includes(raw.status)) {
      if (!raw.headers.location || redirects === 3) throw new HarnessError('public_redirect_limit', '重定向过多或目标缺失。');
      url = publicResourceUrl(new URL(raw.headers.location, url).href); continue;
    }
    // Error pages need not have a supported media type. Preserve the HTTP
    // outcome for the caller without returning an untrusted error body as data.
    if (raw.status < 200 || raw.status >= 300) {
      if (!Number.isInteger(raw.status) || raw.status < 200 || raw.status > 599)
        throw new HarnessError('public_response_status', '来源没有返回有效的HTTP状态。');
      const response = new Response(null, { status: raw.status, headers: raw.headers['content-type'] ? { 'content-type': raw.headers['content-type'] } : {} });
      Object.defineProperty(response, 'url', { value: url.href });
      return response;
    }
    if (!allowedTypes.test(raw.headers['content-type'] || '')) throw new HarnessError('public_type_unsupported', '当前公开读取支持网页、文字/结构化文字、PDF和常见图片；此文件类型尚未接入。');
    const maximum = bodyLimit(raw.headers['content-type'] || '');
    if (raw.body.length > maximum) throw new HarnessError('public_body_limit', '资料超过读取上限。');
    const body = decodedBody(raw, maximum);
    if (/^application\/pdf(?:;|$)/i.test(raw.headers['content-type'] || '') && !body.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new HarnessError('public_type_unsupported', '来源标成PDF，实际收到的内容却不是PDF格式，这次没能打开。');
    if (imageType.test(raw.headers['content-type'] || '') && !imageMagicMatches(raw.headers['content-type'] || '', body))
      throw new HarnessError('public_type_unsupported', '来源说这是一张图片，实际收到的字节却不是对应的格式，这次没能读成图片。');
    const response = new Response(new Uint8Array(body), { status: raw.status, headers: { 'content-type': raw.headers['content-type'] } });
    Object.defineProperty(response, 'url', { value: url.href });
    return response;
  }
  throw new HarnessError('public_redirect_limit', '重定向超过上限。');
}
