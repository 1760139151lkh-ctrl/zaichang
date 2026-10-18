import { z } from 'zod';

/** A host-issued reference to a selected snapshot. It contains no filesystem
 * path, evidence ID or authority that a renderer could choose. */
export const materialReferenceSchema = z.object({
  resourceId: z.string().regex(/^material-[a-f0-9-]{36}$/),
  accessKey: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(260),
  mediaType: z.enum(['text/plain', 'text/markdown', 'application/pdf']),
  byteLength: z.number().int().nonnegative().max(20_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.literal(1),
}).strict();
export type MaterialReference = z.infer<typeof materialReferenceSchema>;
export const materialCropSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).strict().refine(value => value.x + value.width <= 1 && value.y + value.height <= 1);
export const MATERIAL_LIMITS = { bytes: 20_000_000, pending: 8, textCodePoints: 2_000_000, readCodePoints: 16000, pages: 200, imageDataUrl: 3_000_000 } as const;

/** Native reading is an owner action. These selectors grant no model access. */
export const materialTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pending'), reference: materialReferenceSchema }).strict(),
  z.object({ kind: z.literal('saved'), resourceId: z.string().regex(/^material-[a-f0-9-]{36}$/) }).strict(),
]);
export type MaterialTarget = z.infer<typeof materialTargetSchema>;
export const materialReadSchema = z.object({
  target: materialTargetSchema,
  page: z.number().int().min(1).max(MATERIAL_LIMITS.pages).default(1),
  offset: z.number().int().min(0).max(MATERIAL_LIMITS.textCodePoints).default(0),
  view: z.enum(['text', 'page']).default('text'),
}).strict();
export type MaterialReadInput = { target: MaterialTarget; page?: number; offset?: number; view?: 'text' | 'page' };
export interface MaterialItem {
  resourceId: string;
  name: string;
  mediaType: MaterialReference['mediaType'];
  byteLength: number;
  sha256: string;
  sessionId?: string;
  receivedAt?: string;
}
export interface MaterialPage {
  item: MaterialItem;
  text: string;
  page?: number;
  pageCount?: number;
  start: number;
  end: number;
  total: number;
  nextOffset: number | null;
  needsVisual?: boolean;
  image?: { dataUrl: string; width: number; height: number };
}
/** A user-selected quotation; it contains no access key or implicit send. */
export interface MaterialQuote {
  resourceId: string;
  sha256: string;
  name: string;
  text: string;
  page?: number;
  start: number;
  end: number;
}
export interface MaterialsBridge {
  materialsList(input?: { sessionId?: string }): Promise<MaterialItem[]>;
  materialsRead(input: MaterialReadInput): Promise<MaterialPage>;
  materialsCancel(): Promise<void>;
  materialsExport(input: { target: MaterialTarget }): Promise<boolean>;
  materialsDiscard(input: { reference: MaterialReference }): Promise<void>;
}
