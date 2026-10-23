import { z } from 'zod';
import { workSourceBindingSchema } from './harness';
import type { SceneRef, SceneSource } from './scenes';
import type { CuriosityInvitationView } from './curiosity-invitation';
import type { CuriosityChapterAddress } from './curiosity-source';
import { storySettingSnapshotSchema } from './story-setting';
import type { NoteSourceProof } from './notes-source';

const id = z.string().min(1).max(160);
const revision = z.number().int().positive();
const readTime = z.string().refine(value => Number.isFinite(Date.parse(value)), '需要实际读取时间。');
const publicUrl = z.string().max(4000).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}, '需要实际公开来源的HTTPS地址。');

/** Only the original owner creates this body. The model can request an owner
 * address, never submit a new scene's story or a source proof. */
export const curiosityViewSchema = z.object({
  id, revision, matterId: id, matterRevision: revision,
  status: z.enum(['offered', 'playing', 'put_aside', 'replaced', 'historical']),
  title: z.string().min(1).max(160), opening: z.string().min(1).max(1000),
  experience: z.string().min(1).max(7000), firstMove: z.string().min(1).max(1200),
  origin: z.enum(['created', 'public', 'mixed']), originLabel: z.string().min(1).max(100),
  publicSources: z.array(z.object({
    observationId: id, url: publicUrl, title: z.string().min(1).max(400),
    quote: z.string().min(1).max(1200), fetchedAt: readTime, resourceId: z.string().optional(),
  }).strict()).max(6),
  setting: storySettingSnapshotSchema.optional(),
  presentation: z.literal('experience_first'),
  choices: z.array(z.object({ intent: z.enum(['continue', 'another', 'put_aside']), label: z.string().min(1).max(100) }).strict()).max(3),
  meaning: z.string().min(1).max(2000),
}).strict().superRefine((view, context) => {
  if ((view.origin === 'created') !== (view.publicSources.length === 0))
    context.addIssue({ code: 'custom', path: ['publicSources'], message: '创作和真实公开依据必须保持各自身份。' });
  if (new Set(view.choices.map(choice => choice.intent)).size !== view.choices.length
    || !['offered', 'playing'].includes(view.status) && view.choices.length)
    context.addIssue({ code: 'custom', path: ['choices'], message: '只能继续当前仍开放的这份体验。' });
});

export const curiosityPresentationInput = z.object({
  id, expectedRevision: revision, expectedMatterRevision: revision,
}).strict().describe('用curiosity_invitation真实返回的id/revision/matterRevision，把已准备的体验放进原对话。主角是可读可玩的正文，不是推荐菜单；当前公开来源由宿主实际回读核验。');

/** A transient view of one Work option. No second invitation, interest profile,
 * saved recommendation queue or public-fact owner lives in the scene. */
export interface CuriosityScene extends SceneRef {
  kind: 'curiosity';
  sessionId: string;
  createdAt: string;
  source: SceneSource;
  view: CuriosityInvitationView;
  provenance: { sourceBinding: z.infer<typeof workSourceBindingSchema>; assistantWorkSources?: CuriosityChapterAddress[];
    noteSources?: NoteSourceProof[] };
}

/** A normal synchronous history response carries an address, never an old
 * public body disguised as a fresh discovery. It also keeps the rest of the
 * original conversation readable while the source is reopened on demand. */
export interface CuriosityHistoryReference extends SceneRef {
  kind: 'curiosity_reference';
  sessionId: string;
  createdAt: string;
  source: SceneSource;
  owner: { id: string; revision: number; matterId: string; matterRevision: number };
  label: '接着那次小发现';
  requiresCurrentRead: true;
  read: { tool: 'curiosity_invitation'; arguments: { operation: 'read'; id: string } };
}

export function curiosityHistoryReference(scene: CuriosityScene): CuriosityHistoryReference {
  return { kind: 'curiosity_reference', id: scene.id, revision: scene.revision, sessionId: scene.sessionId,
    createdAt: scene.createdAt,
    source: { sourceId: 'work:self', fetchedAt: scene.source.fetchedAt, ...(scene.source.version ? { version: scene.source.version } : {}) },
    owner: { id: scene.view.id, revision: scene.view.revision, matterId: scene.view.matterId, matterRevision: scene.view.matterRevision },
    label: '接着那次小发现', requiresCurrentRead: true,
    read: { tool: 'curiosity_invitation', arguments: { operation: 'read', id: scene.view.id } } };
}

/** Our shared fiction can remain a readable past work. Its fictional claims
 * stay inside the work, and old controls never pose as a current invitation. */
export function curiosityHistoricalProjection(scene: CuriosityScene): CuriosityScene | CuriosityHistoryReference {
  return scene.view.origin === 'created'
    ? { ...scene, view: { ...scene.view, status: 'historical', choices: [] } }
    : curiosityHistoryReference(scene);
}
