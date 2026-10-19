import { z } from 'zod';
import { curiosityChapterAddressSchema, curiosityHistoryReadSchema, curiosityHistoryCatalogSchema } from './curiosity-source';
import { storySettingRequestSchema, type StorySettingSnapshot } from './story-setting';

const id = z.string().min(1).max(160);
export const curiositySourceSchema = z.object({
  eventId: id, contentVersion: z.number().int().positive(),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  quote: z.string().min(1).max(2000),
}).strict().refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start,
  '探索原话需要准确的Unicode范围。');

export const curiosityPublicCitationSchema = z.object({
  observationId: id,
  quote: z.string().min(1).max(1200).describe('本轮实际research.read正文中的逐字依据，搜索摘要不是已读原文。'),
}).strict();

/** One ready-to-try thing, rather than a preference category or a new goal. */
export const curiositySeedSchema = z.object({
  title: z.string().min(1).max(160),
  opening: z.string().min(1).max(1000).describe('自然邀请；当次想看陌生东西可以压过旧兴趣，不自称用户一定喜欢或从未见过。'),
  experience: z.string().min(1).max(7000).describe('已经准备好的具体内容，如一段一起玩的创作、一个可读片段或有出处的发现；不能只有听歌/散步等类别。'),
  firstMove: z.string().min(1).max(1200).describe('现在就能开始的一步或可接着聊的一点；不创建打卡、日程或承诺。'),
  origin: z.enum(['created', 'public', 'mixed']).describe('created只用于自己的创作/想象，不能把外部事实换标成创作绕过来源。'),
  citations: z.array(curiosityPublicCitationSchema).max(6).default([]),
}).strict().superRefine((seed, context) => {
  if (seed.origin === 'created' && seed.citations.length)
    context.addIssue({ code: 'custom', path: ['citations'], message: '纯创作不附冒充事实核验的引用。' });
  if (seed.origin !== 'created' && !seed.citations.length)
    context.addIssue({ code: 'custom', path: ['citations'], message: '公开事实需要本轮实际读到的正文依据；也可以改为不含该事实的纯创作。' });
});

const target = { id, expectedRevision: z.number().int().positive(), expectedMatterRevision: z.number().int().positive() };
export const curiosityInvitationInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('brief'), source: curiositySourceSchema,
    publicTopic: z.string().min(1).max(300).describe('可公开的发现主题；不抄私人原话、画像、课程/健康/位置或其他私人背景。'),
    queries: z.array(z.string().min(1).max(300)).min(1).max(4),
  }).strict(),
  z.object({ operation: z.literal('offer'), source: curiositySourceSchema, seed: curiositySeedSchema,
    setting: storySettingRequestSchema.optional() }).strict(),
  z.object({ operation: z.literal('read'), id }).strict(),
  curiosityHistoryReadSchema.extend({ operation: z.literal('read_history') }).strict(),
  curiosityHistoryCatalogSchema.extend({ operation: z.literal('history') }).strict(),
  z.object({ operation: z.literal('continue'), ...target, source: curiositySourceSchema, seed: curiositySeedSchema,
    setting: storySettingRequestSchema.nullable().optional().describe('仅在共同作品确实需要公共地点取景时给出；省略保留原取景，null回到不依赖地图的创作。地图点选不证明到达，不授予真实出行。'),
    fromChapter: curiosityChapterAddressSchema.optional().describe('确实读过并打算接着写的原章地址；当前版本与新用户原话仍另核，不回滚原对象或恢复旧动作。') }).strict(),
  z.object({ operation: z.literal('another'), ...target, source: curiositySourceSchema, seed: curiositySeedSchema,
    setting: storySettingRequestSchema.optional() }).strict(),
  z.object({ operation: z.literal('put_aside'), ...target, source: curiositySourceSchema }).strict(),
]);
export type CuriosityInvitationInput = z.infer<typeof curiosityInvitationInput>;
export type CuriositySeed = z.infer<typeof curiositySeedSchema>;
export type CuriositySource = z.infer<typeof curiositySourceSchema>;

export interface CuriosityPublicSource {
  observationId: string;
  url: string;
  title: string;
  quote: string;
  fetchedAt: string;
  resourceId?: string;
}
export interface CuriosityInvitationView {
  id: string;
  revision: number;
  matterId: string;
  matterRevision: number;
  status: 'offered' | 'playing' | 'put_aside' | 'replaced' | 'historical';
  title: string;
  opening: string;
  experience: string;
  firstMove: string;
  origin: CuriositySeed['origin'];
  originLabel: string;
  publicSources: CuriosityPublicSource[];
  setting?: StorySettingSnapshot;
  presentation: 'experience_first';
  choices: { intent: 'continue' | 'another' | 'put_aside'; label: string }[];
  meaning: string;
}
