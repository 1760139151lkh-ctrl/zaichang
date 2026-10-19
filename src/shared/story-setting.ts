import { z } from 'zod';
import { workSourceBindingSchema, workSourceRefSchema } from './harness';
import { curiosityFollowupReferenceSchema, curiosityChapterAddressSchema } from './curiosity-source';

const id = z.string().min(1).max(160);
/** The model requests only an existing public place. Names, map versions and
 * source proofs in the saved setting are supplied by the host. */
export const storySettingRequestSchema = z.object({
  placeId: id, mapVersion: z.string().min(1).max(300),
}).strict();
export const storySettingSnapshotSchema = z.object({
  kind: z.literal('fictional_setting'), placeId: id, label: z.string().min(1).max(300),
  mapVersion: z.string().min(1).max(300), sourceDate: z.string().min(1), capturedAt: z.string().min(1),
  sourceUrl: z.string().min(1).max(4000), evidenceRef: workSourceRefSchema,
}).strict();
export type StorySettingSnapshot = z.infer<typeof storySettingSnapshotSchema>;
/** A map retains its normal public geometry and local camera. This optional
 * relation is an address of a shared work, never a real journey or arrival. */
export const mapStorySettingSchema = z.object({
  kind: z.literal('fictional_setting'), work: curiosityFollowupReferenceSchema,
  mapVersion: z.string().min(1).max(300), place: storySettingSnapshotSchema.optional(), sourceBinding: workSourceBindingSchema,
  assistantWorkSources: z.array(curiosityChapterAddressSchema).max(32).optional(),
}).strict();
export type MapStorySetting = z.infer<typeof mapStorySettingSchema>;
export const storySettingPresentationInput = z.object({
  id, expectedRevision: z.number().int().positive(), expectedMatterRevision: z.number().int().positive(),
  map: z.object({ id, revision: z.number().int().positive() }).strict().optional(),
}).strict().describe('为原共同作品在同一公共地图上找取景，或展开已经保存的取景。已有地图用map精确地址继续，镜头不自动移动；点选只形成临时焦点，实际取景由原continue.setting保存。普通小体验不必用地图。');
