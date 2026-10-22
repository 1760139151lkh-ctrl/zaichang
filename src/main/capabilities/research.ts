import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import type { CapabilityBroker } from './broker';
import { hasCredentials } from '../runtime/redaction';
import type { MaterialService } from '../materials/service';
import { boundedImageSize, type RasterMediaType } from '../materials/raster';
import { parsePdf } from '../materials/pdf';
import type { VisualObservation } from '../runtime/spatial';
import { publicResourceUrl } from './public-network';
export { imageDimensions } from '../materials/raster';

type PageImage = { url: string; alt?: string };
type PageLink = { url: string; label: string };
const HTML_TAG_ATTRIBUTES = String.raw`(?:[^"'<>]|"[^"]*"|'[^']*')*`;
function htmlTags(html: string, names: string) {
  return html.matchAll(new RegExp(`<(${names})\\b${HTML_TAG_ATTRIBUTES}>`, 'gi'));
}
function stripHtmlTags(html: string) {
  return html.replace(new RegExp(`<\\/?[a-z][a-z0-9:-]*\\b${HTML_TAG_ATTRIBUTES}>|<![^>]*>`, 'gi'), '');
}
function htmlAttributes(tag: string) {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(/\s([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) attributes.set(name, unescape(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attributes;
}
function srcsetUrls(value: string) {
  const urls: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    while (cursor < value.length && /[\s,]/.test(value[cursor])) cursor++;
    const start = cursor;
    while (cursor < value.length && !/\s/.test(value[cursor])) cursor++;
    const url = value.slice(start, cursor);
    if (!url) break;
    urls.push(url.replace(/,+$/, ''));
    if (url.endsWith(',')) continue;
    // Commas inside the URL belong to it (e.g. ?resize=300,169).
    // Only descriptor commas delimit candidates after the URL's whitespace.
    let parentheses = 0;
    while (cursor < value.length) {
      const character = value[cursor++];
      if (character === '(') parentheses++;
      if (character === ')') parentheses = Math.max(0, parentheses - 1);
      if (character === ',' && !parentheses) break;
    }
  }
  return urls;
}
function unescape(text: string) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_match, number) => { const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
function activeStaticHtml(html: string) {
  return html.replace(/<!--[\s\S]*?-->|<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
}
function pageBaseUrl(html: string, finalUrl?: string) {
  for (const match of htmlTags(html, 'base')) {
    const attributes = htmlAttributes(match[0]);
    if (!attributes.has('href')) continue;
    // The first base with href governs relative URLs. An HTTP or non-network
    // base must not silently turn relative links into HTTPS at the final URL.
    try { return new URL(attributes.get('href')!, finalUrl).href; }
    catch { return finalUrl; }
  }
  return finalUrl;
}
/** Declared hyperlinks only. Labels are source text, not the linked body or
 * instructions, and a syntactically public URL can still fail when fetched. */
export function pageLinks(html: string, finalUrl?: string): PageLink[] {
  const staticHtml = activeStaticHtml(html), baseUrl = pageBaseUrl(staticHtml, finalUrl);
  const links: PageLink[] = [], seen = new Set<string>();
  for (const match of staticHtml.matchAll(new RegExp(`<a\\b(${HTML_TAG_ATTRIBUTES})>([\\s\\S]*?)<\\/a\\s*>|<area\\b(${HTML_TAG_ATTRIBUTES})>`, 'gi'))) {
    const attributes = htmlAttributes('<a ' + (match[1] ?? match[3]) + '>');
    if (!attributes.has('href')) continue;
    try {
      const url = publicResourceUrl(new URL(attributes.get('href')!, baseUrl).href).href;
      if (hasCredentials(url)) continue;
      const body = (match[2] || '').replace(new RegExp(`<img\\b${HTML_TAG_ATTRIBUTES}>`, 'gi'), tag => htmlAttributes(tag).get('alt') || '');
      const label = Array.from((attributes.get('aria-label') || readableHtml(body).text || attributes.get('alt') || attributes.get('title') || '').replace(/\s+/g, ' ').trim()).slice(0, 400).join('');
      const key = JSON.stringify([url, label]);
      if (seen.has(key)) continue;
      seen.add(key); links.push({ url, label });
    } catch { /* Unsupported, private or malformed links have no public read entry. */ }
  }
  return links;
}
/** Pictures a page actually links: its share image and its <img> elements,
 * resolved against the page and kept only when they are public HTTPS. */
export function pageImages(html: string, baseUrl?: string) {
  const found: PageImage[] = [], seen = new Set<string>();
  const staticHtml = activeStaticHtml(html);
  baseUrl = pageBaseUrl(staticHtml, baseUrl);
  const add = (raw: string | undefined, alt?: string) => {
    if (!raw) return;
    try {
      const url = new URL(raw.trim(), baseUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 8192 || hasCredentials(url.href) || seen.has(url.href)) return;
      seen.add(url.href);
      found.push({ url: url.href, ...(alt?.trim() ? { alt: alt.trim().slice(0, 200) } : {}) });
    } catch { /* A malformed address is not a picture. */ }
  };
  for (const match of htmlTags(staticHtml, 'meta')) {
    const attributes = htmlAttributes(match[0]);
    if (/^(?:og:image(?::(?:url|secure_url))?|twitter:image(?::src)?)$/i.test(attributes.get('property') || attributes.get('name') || ''))
      add(attributes.get('content'));
  }
  for (const match of htmlTags(staticHtml, 'img|source')) {
    const attributes = htmlAttributes(match[0]);
    const pictureSource = /^<source\b/i.test(match[0]);
    if (pictureSource && attributes.get('type') && !/^image\//i.test(attributes.get('type')!)) continue;
    const width = Number(attributes.get('width') || 0);
    if (width && width < 48) continue;
    const alt = attributes.get('alt');
    if (!pictureSource) add(attributes.get('src'), alt);
    add(attributes.get('data-src'), alt);
    add(attributes.get('data-original'), alt);
    for (const set of [attributes.get('srcset'), attributes.get('data-srcset')]) {
      if (set) for (const url of srcsetUrls(set)) add(url, alt);
    }
  }
  return found;
}
export function readableHtml(html: string) {
  const staticHtml = activeStaticHtml(html);
  const title = unescape(stripHtmlTags(staticHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '网页资料')).trim();
  const text = unescape(stripHtmlTags(staticHtml.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<\/(?:p|div|section|article|h[1-6]|tr|li)>/gi, '\n').replace(/<(?:br|hr)\b[^>]*>/gi, '\n').replace(/<\/(?:td|th)>/gi, ' | ')))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n(?:\s*\n)+/g, '\n\n').trim();
  return { title, text, staticComplete: !(text.length < 80 && /<script\b[^>]*\bsrc=/i.test(html)),
    extraction: { kind: 'static_text_no_client_scripts', completeForReturnedStaticRange: true,
      scripts: (html.match(/<script\b/gi) || []).length, externalScripts: (html.match(/<script\b[^>]*\bsrc=/gi) || []).length,
      targetBodyVerified: false, dynamicContent: 'not_executed', targetContentCompleteness: 'unknown' } };
}
export function parseSearchFeed(xml: string) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => {
    const tag = (name: string) => unescape(match[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') || '').trim();
    return { title: tag('title'), url: tag('link'), snippet: readableHtml(tag('description')).text };
  }).filter(item => { try { return new URL(item.url).protocol === 'https:'; } catch { return false; } });
}

function searchTerms(query: string) {
  return [...new Set((query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}_.:-]+/gu) || [])
    .filter(term => term.length > 1 && !/^(?:site:|and$|or$)/.test(term)))];
}
function matchesTerm(text: string, term: string) {
  if (text.includes(term)) return true;
  // Retain close Chinese name variants such as an abbreviation expanded by
  // the source. A short shared province prefix cannot pass this threshold.
  if (!/^[\p{Script=Han}]{4,}$/u.test(term)) return false;
  const points = Array.from(term), pairs = [...new Set(points.slice(0, -1).map((point, index) => point + points[index + 1]))];
  return pairs.filter(pair => text.includes(pair)).length / pairs.length >= 0.75;
}

export interface ResearchImage { id: string; url: string; pageUrl?: string; pageTitle?: string; pageResourceId?: string; pageSha256?: string; alt?: string; altAuthority?: 'assistant_description' | 'page_attribute'; caption?: string; mediaType: string;
  width: number; height: number; bytes: number; sha256: string; dataUrl: string; fetchedAt: string; epoch: number; scopeId: string; scope: ScopeHandle;
  original: { sha256: string; mediaType: string; width: number; height: number; bytes: number } }
export function registerResearch(broker: CapabilityBroker, materials?: MaterialService) {
  const sourceId = 'web:public';
  const cache = new Map<string, { id: string; title: string; text: string; staticComplete: boolean; url: string; hash: string; fetchedAt: string; epoch: number; scopeId: string; httpStatus: number; contentType: string; html: boolean; extraction?: unknown; images?: PageImage[]; links?: PageLink[] }>();
  const images = new Map<string, ResearchImage>();
  broker.policy.onBarrier(() => { cache.clear(); images.clear(); });
  const imageResult = (image: ResearchImage, observe: boolean) => ({ status: 'fresh' as const, sourceId, fetchedAt: image.fetchedAt, simulated: false,
    data: { resourceId: image.id, url: image.url, ...(image.pageUrl ? { pageUrl: image.pageUrl, pageResourceId: image.pageResourceId,
      pageSha256: image.pageSha256, pageAttributionVerified: true } : {}), mediaType: image.mediaType,
      width: image.width, height: image.height, bytes: image.bytes, sha256: image.sha256, original: image.original, representation: 'decoded_static_frame',
      ...(image.alt ? { alt: image.alt, altAuthority: image.altAuthority } : {}),
      ...(observe ? { observationId: image.id, hash: image.sha256, version: image.original.sha256 + ':' + image.sha256,
        transport: 'prepared_for_next_model_request' } : {}),
      read: { tool: 'look_up', arguments: { source: 'capability', capability: 'research.read', arguments: { resourceId: image.id, view: 'image' } } },
      authority: 'public_picture_not_a_live_observation' }, coverage: { complete: true, scope: image.url } });
  const base = { version: '3', output: z.record(z.string(), z.json()), effect: 'read' as const, requiredScopes: ['evidence:read'], subjects: ['self', 'other', 'fictional'] as ('self' | 'other' | 'fictional')[], worlds: ['real', 'scenario'] as ('real' | 'scenario')[], timeoutMs: 25000, maxBytes: 100000, supportsIdempotency: false, supportsInspect: false, supportsCancel: false };
  broker.register({
    manifest: { id: 'public-research', sourceId, version: '3', trust: 'bundled_reviewed', egressHosts: [], publicRead: true, platforms: ['*'], simulated: false, offline: 'unsupported', license: 'Project-owned reader; source text retains original rights', capabilities: [
      { ...base, version: '4', name: 'research.search', displayName: '搜索公开资料', description: '以当前问题获准的公开关键词寻找网页与原发布来源。domains可限定域名，宿主会核对实际结果域名。只交付候选，词面命中用于排序，不代你判断语义相关性或研究完成；阅读相关原页再形成结论。私密链接、无关原文和登录信息不能成为检索词；偏题或空候选不能证明不存在。', input: z.object({ query: z.string().trim().min(1).max(300), limit: z.number().int().min(1).max(8).default(5), domains: z.array(z.string().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/)).min(1).max(5).optional() }).strict() },
      { ...base, version: '4', name: 'research.image', displayName: '取一张公开网页上的图片', description: '把公开网页上的真实图片取回来，可在对话里放给对方看，也可由你观察其中细节。url是图片地址（research.read的images是真实页面候选），pageResourceId绑定已读网页版本，pageUrl可核对出处。observe=true把同一解码像素准备到下一次主模型请求；默认只准备展示，返回的read地址可随后观察这一版像素。宿主取得并解码后才返回可呈现的图片；场景入口由外层提供。alt和caption只是文字描述，像素实际送达另有回执。图片不证明此刻现场或转载许可。', input: z.object({ url: z.string().max(8192), pageUrl: z.string().max(8192).optional(), pageResourceId: z.string().max(100).optional(), observe: z.boolean().default(false), alt: z.string().max(200).optional(), caption: z.string().max(160).optional().describe('你想放在图下面对对方说的一句话，可省略。') }).strict() },
      { ...base, version: '6', name: 'research.read', displayName: '阅读公开网页和文件', description: '读取公开HTTPS网页、文字/JSON/XML或PDF。文字按Unicode片段回读，PDF按页提供文字、表格候选或真实像素，绑定SHA/来源/观察时间。网页首段有linkCatalog和imageCatalog；view=links可用query在同版链接的标签/网址中作字面筛选，沿各项read继续取得目标正文；view=images分页找图片地址，research.image再取得图片。view=find以query精确定位同版原文字层，给Unicode片段和read入口，不必猜长页位置或读完全文；offset是原文起点，limit是匹配数，PDF只找指定页。未命中不证明没有相关含义。URL的fragment只保留位置线索，不自动跳到锚点正文。目录和匹配片段各有覆盖，resourceId继续同版；新URL仍核真实读取。view=image也能沿图片resourceId观察同版像素。内网、学校登录会话和本机路径另属各自入口，文档脚本不执行，动态正文完整性仍未知。', input: z.object({ url: z.string().max(8192).optional(), resourceId: z.string().max(100).optional(), page: z.number().int().min(1).max(200).default(1), view: z.enum(['text', 'table', 'image', 'images', 'links', 'find']).default('text'), query: z.string().min(1).max(200).refine(value => value.trim().length > 0 && Array.from(value).every(point => point.length > 1 || point.charCodeAt(0) < 0xd800 || point.charCodeAt(0) > 0xdfff), '查询需要完整的文字字符。').optional().describe('find按大小写相同的原文精确定位；links按标签或网址字面筛选，忽略大小写。仅这两种view使用。'), offset: z.number().int().min(0).max(2000000).default(0), limit: z.number().int().min(1).max(16000).default(8000) }).strict() },
    ] },
    invoke: async (name, args, context) => {
      const now = broker.policy.repo.clock.now(), scope = broker.policy.validate(context.scope);
      if (name === 'research.read') {
        if (args.view === 'find' && args.query === undefined) throw new HarnessError('research_query_required', '精确定位需要query里那段要寻找的原文。');
        if (args.query !== undefined && !['find', 'links'].includes(args.view))
          throw new HarnessError('research_query_view', 'query用于find的原文定位或links的目录筛选；其他读取方式按原页码和片段范围继续。');
      }
      if (name === 'research.search') {
        if (hasCredentials(args.query) || /https?:\/\/\S+[?#]\S+/i.test(args.query)) throw new HarnessError('search_disclosure', '公开检索词不能携带登录信息或私密链接参数。');
        const domains: string[] = args.domains || [];
        const query = domains.length ? `(${domains.map(domain => 'site:' + domain).join(' OR ')}) ${args.query}` : args.query;
        const url = new URL('https://www.bing.com/search'); url.searchParams.set('q', query); url.searchParams.set('format', 'rss');
        const response = await context.request(url.href);
        if (!response.ok) return { status: 'failed', sourceId, reason: `公开搜索未取得候选（HTTP ${response.status}）。`, simulated: false,
          data: { httpStatus: response.status, finalUrl: response.url || url.href, targetResearchCompleted: false } };
        const candidates = parseSearchFeed(await response.text()), terms = searchTerms(args.query);
        const items = candidates.filter(item => !domains.length || domains.some(domain => {
          const host = new URL(item.url).hostname; return host === domain || host.endsWith('.' + domain);
        })).map(item => {
          const text = (item.title + ' ' + item.snippet + ' ' + item.url).normalize('NFKC').toLowerCase();
          const matchedTerms = terms.filter(term => matchesTerm(text, term));
          return { ...item, matchedTerms, queryTermCoverage: terms.length ? matchedTerms.length / terms.length : 0 };
        }).sort((a, b) => b.queryTermCoverage - a.queryTermCoverage).slice(0, args.limit);
        // Retrieval and semantic relevance are different results. A subject
        // page may answer details not repeated in its title/snippet; lexical
        // coverage sorts candidates but cannot reject them on the model's behalf.
        return { status: items.length ? 'fresh' : 'partial', sourceId, fetchedAt: now, simulated: false,
          ...(!items.length ? { reason: '搜索服务已响应，这页没有当前域名范围内的HTTPS候选。是否有相关资料仍未知，其他查询词或已知原来源可以继续查。' } : {}),
          data: { items, query: args.query, domains, retrieval: 'Bing public RSS', httpStatus: response.status, finalUrl: response.url || url.href,
            candidateCount: candidates.length, relevance: items.length ? 'unassessed_candidates' : 'empty_candidates',
            relevanceMeaning: 'queryTermCoverage只度量题名与摘要的词面命中，用于排序；低分不证明内容无关，高分也不证明事实得到支持。',
            authority: 'search_candidates_only', targetResearchCompleted: false, notProofOfAbsence: true, nextStep: '这些是待阅读的网页候选。原页可能含摘要没提到的细节；关键规则和期限的适用对象、日期以原文为准。候选偏题或当前页为空时，简短关键词、另一种语言或已知原发布来源仍是可继续的入口。' }, coverage: { complete: false, scope: 'bounded public search results' } };
      }
      if (name === 'research.image') {
        if (hasCredentials(args.url)) throw new HarnessError('resource_url', '需要一个没有凭据的公开HTTPS图片地址。');
        const requestedUrl = new URL(args.url).href;
        const pageUrl = args.pageUrl ? new URL(args.pageUrl).href : undefined;
        const page = args.pageResourceId ? cache.get(args.pageResourceId) : pageUrl
          ? [...cache.values()].reverse().find(item => item.url === pageUrl && item.scopeId === context.scope.id && item.epoch === scope.privacyEpoch) : undefined;
        const validPage = page && page.scopeId === context.scope.id && page.epoch === scope.privacyEpoch && (!pageUrl || page.url === pageUrl);
        const listed = page?.images?.find(item => item.url === requestedUrl);
        if ((args.pageResourceId || pageUrl) && (!validPage || !listed)) return { status: 'failed', sourceId, simulated: false,
          reason: '尚未在当前可读的这一版网页中找到这张图片。先research.read网页，沿imageCatalog续页并复制真实图片地址和pageResourceId；独立图片可省略网页归属，以图片地址作为出处。',
          data: { pageAttributionVerified: false } };
        const response = await context.request(args.url);
        const mediaType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!response.ok) return { status: 'failed', sourceId, reason: `图片没有取到（HTTP ${response.status}）。`, simulated: false, data: { httpStatus: response.status, url: response.url || args.url } };
        if (!/^image\/(png|jpeg|webp|gif)$/.test(mediaType)) return { status: 'failed', sourceId, simulated: false,
          reason: '这个地址不是一张可以直接显示的图片（可能是网页）；先用research.read打开网页，从它列出的images里挑图片地址。', data: { url: response.url || args.url, contentType: mediaType } };
        const body = Buffer.from(await response.arrayBuffer());
        if (!boundedImageSize(body, mediaType)) return { status: 'failed', sourceId, simulated: false, reason: '图片格式或尺寸不能可靠读取，没有采用。', data: { url: response.url || args.url } };
        const prepared = await parsePdf(body, { operation: 'prepare_image', mediaType: mediaType as RasterMediaType }, context.signal);
        context.signal.throwIfAborted(); broker.policy.validate(context.scope);
        if (!prepared.image || !prepared.originalSize) throw new HarnessError('image_decode', '图片未完成解码，没有采用。');
        const pixels = prepared.image, displayBytes = Buffer.from(pixels.dataUrl.split(',')[1], 'base64');
        const url = response.url || args.url, sha256 = createHash('sha256').update(displayBytes).digest('hex');
        const original = { ...prepared.originalSize, sha256: createHash('sha256').update(body).digest('hex'), mediaType, bytes: body.length };
        // Two concurrent uses of the same pixels can have different page
        // versions or captions. Their handles must not overwrite each other.
        const id = 'image:' + createHash('sha256').update(JSON.stringify({ scopeId: context.scope.id, url, sha256,
          pageResourceId: page?.id || null, alt: args.alt || listed?.alt || null, caption: args.caption || null })).digest('hex');
        const image: ResearchImage = { id, url, ...(page ? { pageUrl: page.url, pageTitle: page.title, pageResourceId: page.id, pageSha256: page.hash } : {}),
          ...(args.alt || listed?.alt ? { alt: args.alt || listed?.alt, altAuthority: args.alt ? 'assistant_description' as const : 'page_attribute' as const } : {}), ...(args.caption ? { caption: args.caption } : {}),
          mediaType: pixels.mimeType, width: pixels.width, height: pixels.height, bytes: displayBytes.length, sha256, original,
          dataUrl: pixels.dataUrl, fetchedAt: now, epoch: scope.privacyEpoch, scopeId: context.scope.id, scope: context.scope };
        images.set(id, image);
        while (images.size > 24) images.delete(images.keys().next().value!);
        return imageResult(image, args.observe);
      }
      if (args.resourceId?.startsWith('image:')) {
        const image = images.get(args.resourceId);
        if (!image || image.scopeId !== context.scope.id || image.epoch !== scope.privacyEpoch)
          throw new HarnessError('resource_expired', '这张图片已经不在当前读取范围里，可以从原出处重新取回。');
        if (args.url && new URL(args.url).href !== image.url) throw new HarnessError('resource_url_mismatch', '图片句柄与网址不是同一来源。');
        if (args.view !== 'image') return { status: 'unsupported', sourceId, simulated: false,
          data: { resourceId: image.id, representation: 'raster_image', read: imageResult(image, false).data.read }, coverage: { complete: false, scope: image.url } };
        return imageResult(image, true);
      }
      const readPdf = async (resourceId: string) => {
        if (!materials) throw new HarnessError('public_type_unsupported', 'PDF读取组件尚未接入。');
        if (args.view === 'images' || args.view === 'links') return { status: 'unsupported', sourceId, simulated: false, reason: 'images和links用于静态网页目录；这份PDF可以按页读取文字、表格候选或view=image的真实像素。' };
        const result = await materials.invokePublic(context.scope, args.view === 'image' ? 'materials.observe' : args.view === 'table' ? 'materials.table' : args.view === 'find' ? 'materials.find' : 'materials.read',
          { resourceId, page: args.page, offset: args.offset, limit: args.view === 'find' ? Math.min(args.limit, 12) : args.limit,
            ...(args.view === 'find' ? { query: args.query } : {}) }, context.signal);
        if (args.view === 'find' && result.data?.matches) result.data.matches = result.data.matches.map((match: any) => ({ ...match,
          read: { tool: 'look_up', arguments: { source: 'capability', capability: 'research.read',
            arguments: { ...match.read.arguments, view: 'text' } } } }));
        return { ...result, ...(['fresh', 'partial'].includes(result.status) && result.data
          ? { delivery: { kind: 'page' as const, complete: true as const } } : {}) };
      };
      if (args.resourceId?.startsWith('material-')) return readPdf(args.resourceId);
      let material = args.resourceId ? cache.get(args.resourceId) : undefined;
      if (args.resourceId && (!material || material.epoch !== scope.privacyEpoch || material.scopeId !== context.scope.id)) throw new HarnessError('resource_expired', '这份读取缓存不属于当前范围，请重新读取来源。');
      if (material && args.url && new URL(args.url).href !== material.url) throw new HarnessError('resource_url_mismatch', '续读句柄与所给网址不一致；继续同版只传resourceId，读取新来源请单独传url。');
      if (!material) {
        if (!args.url || hasCredentials(args.url)) throw new HarnessError('resource_url', '需要一个没有凭据的公开HTTPS来源。');
        const response = await context.request(args.url);
        if (!response.ok) return { status: 'failed', sourceId, reason: `原来源未读取成功（HTTP ${response.status}）。`, simulated: false,
          data: { httpStatus: response.status, finalUrl: response.url || args.url, contentType: response.headers.get('content-type') || '', targetBodyVerified: false } };
        if (/^application\/pdf(?:;|$)/i.test(response.headers.get('content-type') || '')) {
          if (!materials) throw new HarnessError('public_type_unsupported', 'PDF读取组件尚未接入。');
          const bytes = Buffer.from(await response.arrayBuffer());
          const resourceId = materials.publicPdf(context.scope, bytes, response.url || args.url, new URL(response.url || args.url).pathname.split('/').at(-1) || '公开PDF', { httpStatus: response.status, contentType: response.headers.get('content-type') || '' });
          return readPdf(resourceId);
        }
        const body = await response.text(), html = /html/i.test(response.headers.get('content-type') || '');
        if (/^image\//i.test(response.headers.get('content-type') || ''))
          return { status: 'failed', sourceId, simulated: false, reason: '这个地址是一张图片，可用research.image取得；observe=true会把像素准备给你观察，默认准备对话展示。', data: { url: response.url || args.url } };
        const parsed = html ? readableHtml(body) : { title: new URL(response.url || args.url).pathname.split('/').at(-1) || '文字资料', text: body, staticComplete: true };
        const url = response.url || args.url, hash = createHash('sha256').update(body).digest('hex');
        const id = 'resource:' + createHash('sha256').update(context.scope.id + ':' + url + ':' + hash).digest('hex');
        material = { ...parsed, id, url, hash, fetchedAt: now, epoch: scope.privacyEpoch, scopeId: context.scope.id,
          httpStatus: response.status, contentType: response.headers.get('content-type') || '', html, ...(html ? { images: pageImages(body, url), links: pageLinks(body, url) } : {}) };
        cache.set(material.id, material);
        while (cache.size > 16) cache.delete(cache.keys().next().value!);
      }
      if (args.view === 'find') {
        const points = Array.from(material.text), offset = args.offset, query = args.query as string, queryPoints = Array.from(query);
        if (offset > points.length) throw new HarnessError('resource_range', '寻找的起点超出这一版已提取的原文范围。');
        const limit = Math.min(args.limit, 12), matches = [];
        let position = points.slice(0, offset).join('').length, nextOffset: number | null = null;
        while (position <= material.text.length) {
          const found = material.text.indexOf(query, position);
          if (found < 0) break;
          const start = Array.from(material.text.slice(0, found)).length, end = start + queryPoints.length;
          if (matches.length >= limit) { nextOffset = start; break; }
          const excerptStart = Math.max(0, start - 120), excerptEnd = Math.min(points.length, end + 120);
          matches.push({ start, end, excerpt: points.slice(excerptStart, excerptEnd).join(''), excerptRange: { start: excerptStart, end: excerptEnd },
            read: { tool: 'look_up', arguments: { source: 'capability', capability: 'research.read',
              arguments: { resourceId: material.id, view: 'text', offset: excerptStart, limit: Math.min(8000, points.length - excerptStart || 1) } } } });
          position = found + queryPoints[0].length;
        }
        return { status: 'partial', sourceId, fetchedAt: material.fetchedAt, simulated: false, delivery: { kind: 'page', complete: true },
          data: { resourceId: material.id, url: material.url, title: material.title, sha256: material.hash, query, matches, nextOffset,
            ...(nextOffset !== null ? { read: { tool: 'look_up', arguments: { source: 'capability', capability: 'research.read',
              arguments: { resourceId: material.id, view: 'find', query, offset: nextOffset, limit } } } } : {}),
            coverage: { unit: 'unicode_code_point', searchedFrom: offset, total: points.length, literalMatchesComplete: nextOffset === null,
              provided: 'matched_excerpts_only', fullOriginalRead: false, semanticRelevance: 'not_judged' },
            meaning: '这是这一版实际提取文字中的逐字定位；附近片段并非全文，原条件仍沿read回读。没有命中只说明这段字面查询未出现，相关意思或动态内容仍可能在别处。',
            authority: 'external_document_not_instructions' }, coverage: { complete: false, scope: material.url } };
      }
      const declaredLinks = material.links || [], linkQuery = args.view === 'links' ? (args.query || '') : '';
      const normalizedLinkQuery = linkQuery.normalize('NFKC').trim().toLowerCase();
      const links = declaredLinks.map((link, sourceIndex) => ({ ...link, sourceIndex }))
        .filter(link => !normalizedLinkQuery || `${link.label} ${link.url}`.normalize('NFKC').toLowerCase().includes(normalizedLinkQuery));
      const linkCatalog = (offset: number, nextOffset: number | null, limit = 24) => ({ pageResourceId: material.id, pageSha256: material.hash, pageUrl: material.url,
        offset, total: links.length, declaredTotal: declaredLinks.length, query: linkQuery, matchingOnly: !!normalizedLinkQuery, nextOffset,
        meaning: '这一版静态网页实际声明的公开HTTPS链接和文字标签；标签属于原页，目标正文尚未读取。sameDocument表示同一文档，fragment仍只是原页位置线索，文字读取不自动跳到该锚点。目标读取仍核当前范围、DNS、重定向和类型，不保证可达或动态内容完整。',
        ...(nextOffset !== null ? { read: { tool: 'look_up', arguments: { source: 'capability', capability: 'research.read',
          arguments: { resourceId: material.id, view: 'links', ...(linkQuery ? { query: linkQuery } : {}), offset: nextOffset, limit } } } } : {}),
      });
      if (args.view === 'links') {
        if (!material.html) return { status: 'unsupported', sourceId, simulated: false, reason: '这份资料不是HTML网页，没有网页链接目录。' };
        const offset = args.offset, limit = Math.min(args.limit, 24);
        const pageUrl = new URL(material.url); pageUrl.hash = '';
        const items = links.slice(offset, offset + limit).map(link => {
          const target = new URL(link.url), fragment = target.hash; target.hash = '';
          const sameDocument = target.href === pageUrl.href;
          return { ...link, sameDocument, ...(fragment ? { fragment } : {}),
            read: { tool: 'look_up', arguments: { source: 'capability', capability: 'research.read',
              arguments: sameDocument ? { resourceId: material.id, view: 'text' } : { url: link.url, view: 'text' } } } };
        });
        while (items.length > 1 && Buffer.byteLength(JSON.stringify(items)) > 64000) items.pop();
        const end = offset + items.length, nextOffset = end < links.length ? end : null;
        if (offset > links.length) return { status: 'not_found', sourceId, simulated: false,
          data: { linkCatalog: linkCatalog(offset, null) }, reason: '链接目录偏移超出这一版已提取的候选数量。' };
        return { status: nextOffset === null ? 'fresh' : 'partial', sourceId, fetchedAt: material.fetchedAt, simulated: false, delivery: { kind: 'page', complete: true },
          data: { resourceId: material.id, url: material.url, title: material.title, sha256: material.hash,
            links: items, linkCatalog: linkCatalog(offset, nextOffset, limit), authority: 'declared_link_candidates_not_target_bodies' },
          coverage: { complete: offset === 0 && end === links.length, scope: 'declared static webpage link candidates' } };
      }
      const candidates = material.images || [], imageOffset = args.view === 'images' ? args.offset : 0;
      const imageLimit = args.view === 'images' ? Math.min(args.limit, 24) : 12;
      let imageEnd = Math.min(candidates.length, imageOffset + imageLimit);
      // Leave room for the text page and source metadata in the broker's
      // existing output limit. The cursor advances by actual returned rows.
      const imageBytes = args.view === 'images' ? 64000 : 28000;
      while (imageEnd > imageOffset + 1 && Buffer.byteLength(JSON.stringify(candidates.slice(imageOffset, imageEnd))) > imageBytes) imageEnd--;
      const imageCatalog = { pageResourceId: material.id, pageSha256: material.hash, pageUrl: material.url,
        offset: imageOffset, total: candidates.length, nextOffset: imageEnd < candidates.length ? imageEnd : null,
        meaning: '仅为这一版静态网页实际声明的公开图片地址；未下载、未感知，不证明含义、许可或动态页面完整。',
        ...(imageEnd < candidates.length ? { read: { tool: 'look_up', arguments: { source: 'capability', capability: 'research.read',
          arguments: { resourceId: material.id, view: 'images', offset: imageEnd, limit: imageLimit } } } } : {}),
      };
      if (args.view === 'images') {
        if (!material.html) return { status: 'unsupported', sourceId, simulated: false, reason: '这份资料不是HTML网页，没有网页图片目录。' };
        if (imageOffset > candidates.length) return { status: 'not_found', sourceId, simulated: false, data: { imageCatalog }, reason: '图片目录偏移超出这一版已提取的候选数量。' };
        return { status: imageEnd < candidates.length ? 'partial' : 'fresh', sourceId, fetchedAt: material.fetchedAt, simulated: false, delivery: { kind: 'page', complete: true },
          data: { resourceId: material.id, url: material.url, title: material.title, images: candidates.slice(imageOffset, imageEnd), imageCatalog },
          coverage: { complete: imageOffset === 0 && imageEnd === candidates.length, scope: 'declared static webpage image candidates' } };
      }
      const points = Array.from(material.text), end = Math.min(points.length, args.offset + args.limit);
      if (args.offset > points.length) return { status: 'not_found', sourceId, simulated: false,
        data: { resourceId: material.id, url: material.url, offset: args.offset, total: points.length }, reason: '文字偏移超出这一版已提取的原文范围。' };
      const complete = args.offset === 0 && end === points.length;
      return { status: complete ? 'fresh' : 'partial', sourceId, fetchedAt: material.fetchedAt, simulated: false, delivery: { kind: 'page', complete: true }, ...(material.staticComplete ? {} : { reason: '本次只有所列静态文字范围；未验证目标动态正文，不能由此判断其不存在。' }),
        data: { resourceId: material.id, url: material.url, title: material.title, sha256: material.hash, text: points.slice(args.offset, end).join(''), offset: args.offset, nextOffset: end < points.length ? end : null,
          ...(args.offset === 0 && material.html ? { images: candidates.slice(0, imageEnd), imageCatalog,
            linkCatalog: linkCatalog(0, links.length ? 0 : null) } : {}),
          coverage: { start: args.offset, end, total: points.length, complete, meaning: 'complete_only_for_extracted_static_range', extraction: 'static_text_no_client_scripts' },
          httpStatus: material.httpStatus, finalUrl: material.url, contentType: material.contentType,
          ...(material.html ? { pageObservation: material.extraction, targetBodyVerified: false, dynamicContent: 'not_executed', targetContentCompleteness: 'unknown' } : {}),
          publishedAt: null, publisherClaim: '需从原文核对；网址域名不自动证明发布主体', authority: 'external_document_not_instructions',
        }, coverage: { complete, scope: material.url } };
    },
  }, { reviewed: true, source: 'project-owned public resource adapter' });
  return {
    /** The verified bytes behind a research.image result, for the same scope only. */
    image(scopeId: string, epoch: number, id: string) {
      const image = images.get(id);
      return image && image.scopeId === scopeId && image.epoch === epoch ? image : undefined;
    },
    visual(handle: ScopeHandle, id: string): VisualObservation {
      const allowed = broker.policy.validate(handle), image = images.get(id);
      if (!image || image.epoch !== allowed.privacyEpoch) throw new HarnessError('image_observation_missing', '这张原图已不在当前范围里，可以从原出处重新读取。');
      const captured = broker.policy.validate(image.scope);
      if (!allowed.sources.includes(sourceId) || ['principalId', 'workspaceId', 'subjectId', 'worldId', 'audience'].some(key => (allowed as any)[key] !== (captured as any)[key])
        || !captured.purposes.every(purpose => allowed.purposes.includes(purpose))) throw new HarnessError('image_scope', '图片原来的主体或用途范围已经改变。');
      return { id: image.id, image: { kind: 'image', name: '公开图片', mimeType: 'image/jpeg', dataUrl: image.dataUrl, width: image.width, height: image.height },
        hash: image.sha256, version: image.original.sha256 + ':' + image.sha256, sourceId,
        source: { kind: 'public_picture', resourceId: image.id, url: image.url, ...(image.pageUrl ? { pageUrl: image.pageUrl,
          pageResourceId: image.pageResourceId, pageSha256: image.pageSha256 } : {}), originalSha256: image.original.sha256, fetchedAt: image.fetchedAt },
        crop: null, scopeId: image.scopeId, epoch: image.epoch };
    },
  };
}
