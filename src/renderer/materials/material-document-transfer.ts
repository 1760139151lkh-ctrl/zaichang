import { z } from 'zod';
import { MATERIAL_LIMITS, materialReferenceSchema } from '../../shared/materials';

export const MATERIAL_DOCUMENT_MIME = 'application/x-zaichang-material-document';
export const materialDocumentAddressSchema = z.object({
  resourceId: materialReferenceSchema.shape.resourceId,
  sha256: materialReferenceSchema.shape.sha256,
  page: z.number().int().min(1).max(MATERIAL_LIMITS.pages).optional(),
  offset: z.number().int().min(0).max(MATERIAL_LIMITS.textCodePoints).optional(),
}).strict();
export type MaterialDocumentAddress = z.infer<typeof materialDocumentAddressSchema>;

/** Only an address crosses the renderer's drag surface. The receiver must
 * reopen the original owner; a draft's bearer ticket never enters the drag. */
export function writeMaterialDocumentTransfer(transfer: DataTransfer, input: MaterialDocumentAddress) {
  const address = materialDocumentAddressSchema.parse(input);
  transfer.clearData();
  transfer.setData(MATERIAL_DOCUMENT_MIME, JSON.stringify(address));
  transfer.effectAllowed = 'copy';
}
export function readMaterialDocumentTransfer(transfer: DataTransfer): MaterialDocumentAddress | undefined {
  const raw = transfer.getData(MATERIAL_DOCUMENT_MIME);
  if (!raw || raw.length > 1200) return;
  try { const result = materialDocumentAddressSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : undefined; }
  catch { return; }
}
