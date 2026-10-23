import { z } from 'zod';
import { workSourceBindingSchema, workSourceRefSchema } from './harness';
import { curiosityFollowupReferenceSchema, curiosityChapterAddressSchema } from './curiosity-source';
import { mapViewSchema } from './map-view';
import { noteSourceProofSchema } from './notes-source';

const id = z.string().min(1).max(160);
/** The model identifies a public anchor and map version. Saved names,
 * coordinates, camera, endpoint kinds and source proofs come from the host. */
export const storySettingRequestSchema = z.object({
  placeId: id, mapVersion: z.string().min(1).max(300),
}).strict();
const storySettingEndpointSchema = z.object({ id, kind: z.enum(['place', 'node']) }).strict();
/** Host-verified public endpoints. A node ID is resolved through the route
 * adapter, never looked up as a public place or supplied by the model. */
export const storySettingRouteSchema = z.object({
  from: storySettingEndpointSchema, to: storySettingEndpointSchema,
}).strict();
export type StorySettingRoute = z.infer<typeof storySettingRouteSchema>;
export const storySettingSnapshotSchema = z.object({
  kind: z.literal('fictional_setting'), placeId: id, label: z.string().min(1).max(300),
  mapVersion: z.string().min(1).max(300), sourceDate: z.string().min(1), capturedAt: z.string().min(1),
  sourceUrl: z.string().min(1).max(4000), evidenceRef: workSourceRefSchema,
  view: mapViewSchema.optional(), route: storySettingRouteSchema.optional(),
}).strict();
export type StorySettingSnapshot = z.infer<typeof storySettingSnapshotSchema>;
/** A map retains its normal public geometry and local camera. This optional
 * relation is an address of a shared work, never a real journey or arrival. */
export const mapStorySettingSchema = z.object({
  kind: z.literal('fictional_setting'), work: curiosityFollowupReferenceSchema,
  mapVersion: z.string().min(1).max(300), place: storySettingSnapshotSchema.optional(), sourceBinding: workSourceBindingSchema,
  // Explicitly empty is independent of notes. Older missing proofs must be
  // rebuilt through the original Work owner, never inferred from its current state.
  noteSources: z.array(noteSourceProofSchema).max(256),
  assistantWorkSources: z.array(curiosityChapterAddressSchema).max(32).optional(),
}).strict();
export type MapStorySetting = z.infer<typeof mapStorySettingSchema>;
export const storySettingPresentationInput = z.object({
  id, expectedRevision: z.number().int().positive(), expectedMatterRevision: z.number().int().positive(),
  map: z.object({ id, revision: z.number().int().positive() }).strict().optional(),
}).strict().describe('为原共同作品在同一公共地图上找取景，或展开已经保存的取景。已有地图用map精确地址继续，镜头不自动移动；点选只形成临时焦点，实际取景由原continue.setting保存。普通小体验不必用地图。');
