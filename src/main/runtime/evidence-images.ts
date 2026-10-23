import { createHash } from 'node:crypto';
import { HarnessError, evidenceImageSourceSchema, type ContextPack, type ContextReceipt, type EvidenceEvent, type MemoryReferenceContext, type ScopeHandle } from '../../shared/harness';
import type { ImageAttachment, Message } from '../../shared/types';
import type { KernelRepository } from '../storage/repository';

/** Metadata only; the original user Message continues to own the pixels. */
export function evidenceImageSource(image: ImageAttachment, contentVersion: number) {
  if (image.kind !== 'image' || image.mimeType !== 'image/jpeg' || !image.dataUrl.startsWith('data:image/jpeg;base64,'))
    throw new HarnessError('image_source', '这张图片的原始像素格式没有对应上。');
  return evidenceImageSourceSchema.parse({ contentVersion, mimeType: image.mimeType, width: image.width, height: image.height,
    sha256: createHash('sha256').update(Buffer.from(image.dataUrl.split(',')[1], 'base64')).digest('hex') });
}

export function evidenceImageRead(event: Pick<EvidenceEvent, 'id' | 'contentVersion' | 'imageSource' | 'speaker' | 'kind' | 'status'>) {
  const source = event.imageSource;
  if (!source || event.status !== 'active' || event.speaker !== 'user' || event.kind !== 'user_message'
    || source.contentVersion !== event.contentVersion) return;
  return { ...source, pixelsProvided: false,
    read: { tool: 'read_evidence' as const, arguments: { id: event.id, view: 'image' as const, expectedVersion: event.contentVersion } } };
}

/** Never recover pixels from an assistant copy, an adjacent row, or an old
 * upload receipt lacking an explicit original-event binding. */
export function readEvidenceImage(repo: KernelRepository, handle: ScopeHandle, id: string, version: number) {
  const scope = repo.scope(handle), revoked = repo.getMeta<string[]>('revoked', []), event = repo.evidence(handle, id);
  if (!event || scope.audience !== 'self' || event.label.audience !== 'self'
    || !scope.grants.includes('evidence:read') || revoked.includes('evidence:read')
    || event.speaker !== 'user' || event.kind !== 'user_message' || event.status !== 'active'
    || !event.sessionId || event.parentEventId || event.contentVersion !== version
    || !event.imageSource || event.imageSource.contentVersion !== version
    || event.sourceId === 'profile:self' && !scope.currentEventIds.includes(id)
      && (!scope.grants.includes('memory:read') || revoked.includes('memory:read'))
    || repo.sourceRestrictions(handle, id).length || repo.sourceLineageRestricted(event))
    throw new HarnessError('image_source', '这张图片的原始来源或完整读取范围目前没有对应上。');
  const row = repo.db.prepare("SELECT payload FROM messages WHERE id=? AND session_id=? AND role='user'").get(id, event.sessionId);
  const message = row && JSON.parse(String(row.payload)) as Message | undefined;
  const image = message?.image;
  if (!message || message.id !== id || message.sessionId !== event.sessionId || message.role !== 'user' || !image)
    throw new HarnessError('image_source', '原消息里目前没有这张图片的像素。');
  const current = evidenceImageSource(image, version);
  if (current.sha256 !== event.imageSource.sha256 || current.mimeType !== event.imageSource.mimeType
    || current.width !== event.imageSource.width || current.height !== event.imageSource.height)
    throw new HarnessError('image_changed', '原消息里的图片已变化，需要按当前来源重新读取。');
  return { event, image, source: current };
}

/** Keep each caller's original key semantics while preserving a frozen image
 * dependency across ordinary text reads and detecting conflicting versions. */
export function mergeProvidedObjectVersions(values: ContextReceipt['providedObjectVersions'],
  key: ((value: ContextReceipt['providedObjectVersions'][number]) => string) | null = value => value.kind === 'domain'
    ? JSON.stringify([value.kind, value.id, value.sourceId, value.domain, value.institutionId, value.termId]) : `${value.kind}:${value.id}`) {
  const images = new Map<string, { revision: number; sha256: string }>();
  for (const value of values) if (value.kind === 'evidence' && value.imageSha256 !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(value.imageSha256)) throw new HarnessError('image_changed', '原图的来源校验没有对应上。');
    const previous = images.get(value.id);
    if (previous && (previous.revision !== value.revision || previous.sha256 !== value.imageSha256))
      throw new HarnessError('image_changed', '这次采用的原图来源出现不同版本，尚未合并旧像素结果。');
    images.set(value.id, { revision: value.revision, sha256: value.imageSha256 });
  }
  const normalized = values.map(value => {
    const image = value.kind === 'evidence' ? images.get(value.id) : undefined;
    if (image && image.revision !== value.revision)
      throw new HarnessError('image_changed', '这次原话版本与已采用的原图版本不同，需要重新读取。');
    return image ? { ...value, imageSha256: image.sha256 } : value;
  });
  return key ? [...new Map(normalized.map(value => [key(value), value])).values()] : normalized;
}

/** Extract only real accepted pixel bindings, or their already inherited
 * version dependency. Unbound legacy uploads and prepared pixels add none. */
export function providedImageVersions(receipt: { providedObjectVersions?: unknown; imageRequests?: unknown }) {
  const versions: ContextReceipt['providedObjectVersions'] = Array.isArray(receipt.providedObjectVersions)
    ? receipt.providedObjectVersions.filter(value => value?.kind === 'evidence' && value.imageSha256 !== undefined) : [];
  if (Array.isArray(receipt.imageRequests)) for (const image of receipt.imageRequests) {
    if (image?.accepted !== true || typeof image.sourceEventId !== 'string' || !image.sourceEventId
      || !Number.isSafeInteger(image.sourceContentVersion) || image.sourceContentVersion < 1) continue;
    versions.push({ id: image.sourceEventId, revision: image.sourceContentVersion, kind: 'evidence', imageSha256: image.sha256 });
  }
  return mergeProvidedObjectVersions(versions);
}

/** Give purpose review the same already-provided conversation address that
 * led the main assistant back to an image. No pixels or unread body are read,
 * and a prior pixel dependency never grants the next image request. */
export function providedImagePurposeContext(repo: KernelRepository, pack: ContextPack, sessionId: string, request: unknown) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return;
  const proposed = request as { tool?: unknown; arguments?: { id?: unknown; view?: unknown; expectedVersion?: unknown } };
  const args = proposed.arguments;
  if (proposed.tool !== 'read_evidence' || args?.view !== 'image' || typeof args.id !== 'string'
    || !Number.isSafeInteger(args.expectedVersion)) return;
  const scope = repo.scope(pack.contract.scope);
  if (scope.child || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
    || !scope.sources.includes('history:self') || !scope.grants.includes('evidence:read') || !Array.isArray(pack.data.history)) return;
  const image = providedImageVersions(pack.receipt).find(ref => ref.id === args.id && ref.revision === args.expectedVersion);
  if (!image) return;
  type Contribution = { id: string; role: 'assistant'; content: string; replyState?: MemoryReferenceContext['replyState'] };
  const history = pack.data.history.filter((value): value is Contribution => {
    if (!value || typeof value !== 'object') return false;
    const row = value as Partial<Contribution>;
    return row.role === 'assistant' && typeof row.id === 'string' && typeof row.content === 'string' && !!row.content;
  });
  for (const message of [...history].reverse()) {
    const row = repo.db.prepare(`SELECT json_extract(payload,'$.contextReceipt.providedObjectVersions') AS versions,
      json_extract(payload,'$.contextReceipt.imageRequests') AS images FROM messages
      WHERE id=? AND session_id=? AND role='assistant'`).get(message.id, sessionId);
    if (!row) continue;
    const versions = providedImageVersions({ providedObjectVersions: row.versions ? JSON.parse(String(row.versions)) : [],
      imageRequests: row.images ? JSON.parse(String(row.images)) : [] });
    if (!versions.some(ref => ref.id === image.id && ref.revision === image.revision && ref.imageSha256 === image.imageSha256)) continue;
    return { image: { eventId: image.id, contentVersion: image.revision, sha256: image.imageSha256 },
      contribution: { messageId: message.id, role: 'assistant' as const, content: message.content,
        ...(message.replyState ? { replyState: structuredClone(message.replyState) } : {}),
        latestProvidedAssistant: message.id === history.at(-1)?.id },
      origin: 'already_provided_same_conversation' as const,
      meaning: '这段原助手文字已实际交给本轮主助手，其原收据绑定这张图的确切版本；这里只沿已有前情认出所指对象，没有重读旧正文或交付像素。中断片段保持原身份，未提供的尾段、本人接受与整图读取许可都没有因此补出。' };
  }
}
