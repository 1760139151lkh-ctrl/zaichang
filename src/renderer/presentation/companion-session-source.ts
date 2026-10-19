import type { Bridge } from '../../shared/types';
import type { CompanionSourceInput } from '../../shared/companion-source';
import type { LocalSearchLocator } from '../../shared/search';

export interface CompanionOpenedSource {
  title: string;
  text: string;
  origin: 'user_statement' | 'quotation' | 'assistant_history' | 'material';
  page?: number;
  image?: { dataUrl: string; width: number; height: number };
  continuesOutsideExcerpt?: boolean;
  document?: Extract<LocalSearchLocator, { kind: 'material' }>;
}

/** Open one owner-selected address through existing native reading. No tool,
 * model request, file path or new saved copy is created by this UI helper. */
export async function openCompanionSource(api: Pick<Bridge, 'companionSessionSource' | 'materialsRead'>,
  input: CompanionSourceInput): Promise<CompanionOpenedSource> {
  const source = await api.companionSessionSource(input);
  if (source.kind === 'excerpt') return source;
  const page = await api.materialsRead({ target: { kind: 'saved', resourceId: source.resourceId },
    ...(source.page === undefined ? {} : { page: source.page }), offset: source.offset,
    view: source.mediaType === 'application/pdf' ? 'page' : 'text' });
  if (page.item.resourceId !== source.resourceId || page.item.sha256 !== source.sha256)
    throw new Error('原文件已经换过，请重新打开这份停点里的材料。');
  // Native reading may yield while another turn changes the working point.
  const current = await api.companionSessionSource(input);
  if (current.kind !== 'file' || current.resourceId !== source.resourceId || current.sha256 !== source.sha256
    || current.version !== source.version || current.offset !== source.offset || current.limit !== source.limit
    || current.page !== source.page)
    throw new Error('材料或停点刚有了变化，请从当前页面重新打开。');
  const start = Math.max(0, source.offset - page.start), points = Array.from(page.text);
  if (!page.image && (source.offset < page.start || source.offset > page.end))
    throw new Error('这段位置现在不在原文件中，请重新找回原来的页。');
  return { title: source.title, text: points.slice(start, start + source.limit).join(''), origin: 'material',
    ...(page.page === undefined ? {} : { page: page.page }), ...(page.image ? { image: page.image } : {}),
    document: { kind: 'material', resourceId: source.resourceId, sha256: source.sha256,
      ...(source.page === undefined ? {} : { page: source.page }), offset: source.offset,
      end: Math.max(source.offset, Math.min(page.total, source.offset + source.limit)), field: 'body' },
    continuesOutsideExcerpt: page.total > source.offset + source.limit };
}
