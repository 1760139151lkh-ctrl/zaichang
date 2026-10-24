import { z } from 'zod';
import { semanticSelectionSchema } from './scenes';

/** A drag carries only an existing scene address, never image bytes/URIs,
 * story text, a saved choice or a second work object. */
export const SCENE_FRAME_MIME = 'application/x-zaichang-scene-frame';
export const sceneFrameTransferSchema = z.object({
  version: z.literal(1), sessionId: z.string().min(1).max(160),
  selection: semanticSelectionSchema.refine(value => value.kind === 'discussion_artwork' && !!value.artwork
    && !value.placeId && !value.legId && !value.date && !value.recordId && !value.blockId && !value.sampleId && !value.pointId && !value.optionId
    && !value.mapView && !value.planningTrial && !value.campusScale, '拿起原作品中这一张场景。'),
}).strict();
export type SceneFrameTransfer = z.infer<typeof sceneFrameTransferSchema>;
export function writeSceneFrameTransfer(transfer: DataTransfer, value: SceneFrameTransfer) {
  transfer.clearData();
  transfer.setData(SCENE_FRAME_MIME, JSON.stringify(sceneFrameTransferSchema.parse(value)));
  transfer.effectAllowed = 'copy';
}
export function readSceneFrameTransfer(transfer: DataTransfer): SceneFrameTransfer | undefined {
  const raw = transfer.getData(SCENE_FRAME_MIME);
  if (!raw || raw.length > 2048) return;
  try { const parsed = sceneFrameTransferSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : undefined; }
  catch { return; }
}
