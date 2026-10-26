import { z } from 'zod';
import { materialQuoteReferenceSchema, MATERIAL_LIMITS } from './materials';
import { noteQuoteReferenceSchema, notebookQuoteReferenceSchema } from './notes';
import { conversationBookmarkReferenceSchema } from './source-bookmark';
import { agendaFocusSchema } from './agenda';
import { mapRouteReferenceSchema } from './map-context';
import { studyFocusRefSchema } from './study-presentation';
import { interactiveProgramReferenceSchema } from './interactive-program';
import { companionFollowupReferenceSchema } from './companion-source';
import { curiosityFollowupReferenceSchema } from './curiosity-source';
import { preparationFocusReferenceSchema } from './presentation';
import { letterReferenceSchema } from './reflective-letter';
import { noteReferenceSchema } from './note-presentation';
import { rehearsalRefSchema } from './relationship-rehearsal';
import { semanticSelectionSchema } from './scenes';

export const workspaceSurfaceSchema = z.enum(['home', 'conversation', 'keep', 'materials', 'notes', 'study', 'agenda', 'campus',
  'map', 'interactive', 'letter', 'characters', 'appearance', 'memory', 'settings', 'preparation', 'rehearsal']);
export type WorkspaceSurface = z.infer<typeof workspaceSurfaceSchema>;
const id = z.string().min(1).max(160);
const revision = z.number().int().positive();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

/** A position in a retained published assistant reply. It identifies what
 * was said, never a user statement, business fact or permission to act. */
export const assistantTextReferenceSchema = z.object({
  sessionId: id, messageId: id, contentSha256: sha256,
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).strict().refine(value => value.end > value.start && value.end - value.start <= 4000,
  '从这段解释里选一小段，再接着聊。');
export type AssistantTextReference = z.infer<typeof assistantTextReferenceSchema>;

/** Addresses stay with their original owners. This envelope accepts neither
 * copied source bodies, unsent drafts, filesystem paths nor permissions. */
export const workspaceTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('material_quote'), reference: materialQuoteReferenceSchema }).strict(),
  z.object({ kind: z.literal('note_quote'), reference: noteQuoteReferenceSchema }).strict(),
  z.object({ kind: z.literal('notebook_quote'), reference: notebookQuoteReferenceSchema }).strict(),
  z.object({ kind: z.literal('conversation_quote'), reference: conversationBookmarkReferenceSchema }).strict(),
  z.object({ kind: z.literal('assistant_text'), reference: assistantTextReferenceSchema }).strict(),
  z.object({ kind: z.literal('agenda'), reference: agendaFocusSchema }).strict(),
  z.object({ kind: z.literal('map_route'), reference: mapRouteReferenceSchema }).strict(),
  z.object({ kind: z.literal('study'), reference: studyFocusRefSchema }).strict(),
  z.object({ kind: z.literal('interactive'), reference: interactiveProgramReferenceSchema }).strict(),
  z.object({ kind: z.literal('companion'), reference: companionFollowupReferenceSchema.omit({ snapshot: true }) }).strict(),
  z.object({ kind: z.literal('curiosity'), reference: curiosityFollowupReferenceSchema }).strict(),
  z.object({ kind: z.literal('preparation'), reference: preparationFocusReferenceSchema }).strict(),
  z.object({ kind: z.literal('letter'), reference: letterReferenceSchema }).strict(),
  z.object({ kind: z.literal('note'), reference: noteReferenceSchema }).strict(),
  z.object({ kind: z.literal('rehearsal'), reference: rehearsalRefSchema }).strict(),
  z.object({ kind: z.literal('scene'), reference: semanticSelectionSchema }).strict(),
  z.object({ kind: z.literal('material'), reference: z.object({ resourceId: materialQuoteReferenceSchema.shape.resourceId,
    sha256, page: z.number().int().positive().max(MATERIAL_LIMITS.pages).optional(),
    offset: z.number().int().nonnegative().max(MATERIAL_LIMITS.textCodePoints).optional() }).strict() }).strict(),
  z.object({ kind: z.literal('notebook'), reference: z.object({ id: noteQuoteReferenceSchema.shape.id, revision, sha256 }).strict() }).strict(),
]);
export type WorkspaceTarget = z.infer<typeof workspaceTargetSchema>;
export const workspaceObjectSchema = z.object({ slot: z.enum(['A', 'B']), target: workspaceTargetSchema }).strict();
export type WorkspaceObject = z.infer<typeof workspaceObjectSchema>;
const character = z.union([z.enum(['sakiko', 'mutsumi', 'uika', 'umiri', 'nyamu', 'tomori', 'anon', 'rana', 'soyo', 'taki', 'light']),
  z.string().regex(/^custom:[a-zA-Z0-9-]{1,80}$/)]);
const appearance = z.object({ character, palette: z.enum(['apricot', 'mist', 'violet', 'rain']),
  environmentMode: z.enum(['auto', 'manual']), presence: z.enum(['window', 'corner', 'hidden']), reducedMotion: z.boolean(),
  readingScale: z.union([z.literal(1), z.literal(1.15), z.literal(1.3)]), density: z.enum(['comfortable', 'compact']) }).strict();
/** A finite description of an explicit settings selection. Editable words,
 * imported card bodies, images and connection credentials stay in the UI. */
export const workspaceSettingsContextSchema = z.object({
  section: z.enum(['companion', 'persona', 'reading', 'connection', 'campus_connection', 'memory']),
  phase: z.enum(['saved', 'preview', 'editing', 'import_preview']),
  connectionFocus: z.enum(['primary', 'direct', 'webvpn', 'gateway', 'disconnect', 'account-login']).optional(),
  appearance: z.object({ saved: appearance, preview: appearance.optional() }).strict(),
  persona: z.object({ revision: z.number().int().nonnegative(), selectedPreset: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
    previewPreset: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/).optional() }).strict(),
  returnTo: z.object({ view: z.enum(['settings', 'companion', 'memory']), tab: z.enum(['陪伴', '交流', '偏好', '连接', '资料', '记忆']) }).strict(),
}).strict();
export type WorkspaceSettingsContext = z.infer<typeof workspaceSettingsContextSchema>;
export const workspaceContextSchema = z.object({
  surface: workspaceSurfaceSchema,
  objects: z.array(workspaceObjectSchema).max(2),
  settingsContext: workspaceSettingsContextSchema.optional(),
  relation: z.object({ kind: z.enum(['compare', 'same_question', 'continuation']), from: z.literal('A'), to: z.literal('B') }).strict().optional(),
  returnTo: z.object({ surface: workspaceSurfaceSchema, messageId: id.optional(), target: workspaceTargetSchema.optional() }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.objects.some((object, index) => object.slot !== (index === 0 ? 'A' : 'B')))
    context.addIssue({ code: 'custom', path: ['objects'], message: '当前对象按 A、B 顺序排列。' });
  if (!!value.relation !== (value.objects.length === 2))
    context.addIssue({ code: 'custom', path: ['relation'], message: '两处对象须保留它们的关系。' });
});
export type WorkspaceContext = z.infer<typeof workspaceContextSchema>;
