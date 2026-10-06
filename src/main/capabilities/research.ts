import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError } from '../../shared/harness';
import type { CapabilityBroker } from './broker';
import { hasCredentials } from '../runtime/redaction';
import type { MaterialService } from '../materials/service';

function unescape(text: string) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_match, number) => { const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
export function readableHtml(html: string) {
  const title = unescape(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g, '') || '网页资料').trim();
  const text = unescape(html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(?:p|div|section|article|h[1-6]|tr|li)>/gi, '\n').replace(/<(?:br|hr)\b[^>]*>/gi, '\n').replace(/<\/(?:td|th)>/gi, ' | ').replace(/<[^>]*>/g, ''))
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

export function registerResearch(broker: CapabilityBroker, materials?: MaterialService) {
  const sourceId = 'web:public';
  const cache = new Map<string, { title: string; text: string; staticComplete: boolean; url: string; hash: string; fetchedAt: string; epoch: number; scopeId: string; httpStatus: number; contentType: string; html: boolean; extraction?: unknown }>();
  broker.policy.onBarrier(() => cache.clear());
  const base = { version: '1', output: z.record(z.string(), z.json()), effect: 'read' as const, requiredScopes: ['evidence:read'], subjects: ['self', 'other', 'fictional'] as ('self' | 'other' | 'fictional')[], worlds: ['real', 'scenario'] as ('real' | 'scenario')[], timeoutMs: 25000, maxBytes: 100000, supportsIdempotency: false, supportsInspect: false, supportsCancel: false };
  broker.register({
    manifest: { id: 'public-research', sourceId, version: '1', trust: 'bundled_reviewed', egressHosts: [], publicRead: true, platforms: ['*'], simulated: false, offline: 'unsupported', license: 'Project-owned reader; source text retains original rights', capabilities: [
      { ...base, name: 'research.search', displayName: '搜索公开资料', description: '以当前问题获准的公开关键词寻找网页与原发布来源。私密链接、无关原文和登录信息不能成为检索词；摘要只是线索，重要规则继续research.read。', input: z.object({ query: z.string().min(1).max(300), limit: z.number().int().min(1).max(8).default(5) }).strict() },
      { ...base, name: 'research.read', displayName: '阅读公开网页和文件', description: '读取公开HTTPS网页、文字/JSON/XML或PDF。文字按Unicode片段回读，PDF按页提供原文字层、表格候选或必要真实页面像素，绑定SHA/来源/观察时间。不能访问内网、学校登录会话或任意本机路径，不执行文档脚本。resourceId继续当前同版资料；动态网页仍只读静态正文。', input: z.object({ url: z.string().max(8192).optional(), resourceId: z.string().max(100).optional(), page: z.number().int().min(1).max(200).default(1), view: z.enum(['text', 'table', 'image']).default('text'), offset: z.number().int().min(0).max(2000000).default(0), limit: z.number().int().min(1).max(16000).default(8000) }).strict() },
    ] },
    invoke: async (name, args, context) => {
      const now = broker.policy.repo.clock.now(), scope = broker.policy.validate(context.scope);
      if (name === 'research.search') {
        if (hasCredentials(args.query) || /https?:\/\/\S+[?#]\S+/i.test(args.query)) throw new HarnessError('search_disclosure', '公开检索词不能携带登录信息或私密链接参数。');
        const url = new URL('https://www.bing.com/search'); url.searchParams.set('q', args.query); url.searchParams.set('format', 'rss');
        const response = await context.request(url.href);
        if (!response.ok) return { status: 'failed', sourceId, reason: `公开搜索未取得候选（HTTP ${response.status}）。`, simulated: false,
          data: { httpStatus: response.status, finalUrl: response.url || url.href, targetResearchCompleted: false } };
        const items = parseSearchFeed(await response.text()).slice(0, args.limit);
        return { status: items.length ? 'fresh' : 'not_found', sourceId, fetchedAt: now, simulated: false,
          data: { items, query: args.query, retrieval: 'Bing public RSS', httpStatus: response.status, finalUrl: response.url || url.href,
            authority: 'search_candidates_only', targetResearchCompleted: false, notProofOfAbsence: true, nextStep: '关键规则和期限须打开原发布页，核对适用对象、学期与日期。' }, coverage: { complete: false, scope: 'bounded public search results' } };
      }
      const readPdf = async (resourceId: string) => {
        if (!materials) throw new HarnessError('public_type_unsupported', 'PDF读取组件尚未接入。');
        return materials.invokePublic(context.scope, args.view === 'image' ? 'materials.observe' : args.view === 'table' ? 'materials.table' : 'materials.read', { resourceId, page: args.page, offset: args.offset, limit: args.limit }, context.signal);
      };
      if (args.resourceId?.startsWith('material-')) return readPdf(args.resourceId);
      let material = args.resourceId ? cache.get(args.resourceId) : undefined;
      if (args.resourceId && (!material || material.epoch !== scope.privacyEpoch || material.scopeId !== context.scope.id)) throw new HarnessError('resource_expired', '这份读取缓存不属于当前范围，请重新读取来源。');
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
        const parsed = html ? readableHtml(body) : { title: new URL(response.url || args.url).pathname.split('/').at(-1) || '文字资料', text: body, staticComplete: true };
        material = { ...parsed, url: response.url || args.url, hash: createHash('sha256').update(body).digest('hex'), fetchedAt: now, epoch: scope.privacyEpoch, scopeId: context.scope.id,
          httpStatus: response.status, contentType: response.headers.get('content-type') || '', html };
        cache.set('resource:' + material.hash, material);
        while (cache.size > 16) cache.delete(cache.keys().next().value!);
      }
      const points = Array.from(material.text), end = Math.min(points.length, args.offset + args.limit);
      const complete = args.offset === 0 && end === points.length;
      return { status: complete ? 'fresh' : 'partial', sourceId, fetchedAt: material.fetchedAt, simulated: false, ...(material.staticComplete ? {} : { reason: '本次只有所列静态文字范围；未验证目标动态正文，不能由此判断其不存在。' }),
        data: { resourceId: 'resource:' + material.hash, url: material.url, title: material.title, sha256: material.hash, text: points.slice(args.offset, end).join(''), offset: args.offset, nextOffset: end < points.length ? end : null,
          coverage: { start: args.offset, end, total: points.length, complete, meaning: 'complete_only_for_extracted_static_range', extraction: 'static_text_no_client_scripts' },
          httpStatus: material.httpStatus, finalUrl: material.url, contentType: material.contentType,
          ...(material.html ? { pageObservation: material.extraction, targetBodyVerified: false, dynamicContent: 'not_executed', targetContentCompleteness: 'unknown' } : {}),
          publishedAt: null, publisherClaim: '需从原文核对；网址域名不自动证明发布主体', authority: 'external_document_not_instructions',
        }, coverage: { complete, scope: material.url } };
    },
  }, { reviewed: true, source: 'project-owned public resource adapter' });
}
