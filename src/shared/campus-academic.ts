import { z } from 'zod';
import type { CampusScene, SceneRef, SceneSource } from './scenes';
export const campusSensitiveReadSchema = z.object({
  grant: z.enum(['campus:grades:read', 'campus:gpa:read', 'campus:reservations:read', 'campus:card:read', 'campus:transactions:read', 'campus:profile:read']),
  resource: z.enum(['grades', 'retakes', 'gpa_overall', 'gpa_semesters', 'gpa_cumulative', 'reservations', 'reservation_violations', 'card_accounts', 'transactions', 'student_profile', 'roles']),
  sourceId: z.enum(['campus:zju-account', 'campus:local']), sourceVersion: z.string().min(1).max(160),
  authorizationEventId: z.string().min(1).max(160), authorizationContentVersion: z.number().int().positive(),
  privacyEpoch: z.number().int().nonnegative(), policyRevision: z.number().int().positive(),
  sourceBoundary: z.number().int().nonnegative(),
}).strict();
export type CampusSensitiveRead = z.infer<typeof campusSensitiveReadSchema>;
export const campusAcademicReadInputSchema = z.object({ sessionId: z.string().min(1).max(160), sceneId: z.string().min(1).max(160),
  sceneRevision: z.number().int().positive() }).strict();
export type CampusAcademicReadInput = z.infer<typeof campusAcademicReadInputSchema>;
export interface CampusAcademicReference extends SceneRef {
  kind: 'campus_reference'; sessionId: string; createdAt: string; source: SceneSource;
  domain: 'grades' | 'gpa_semesters' | 'gpa_overall' | 'gpa_cumulative';
  owner: { capability: 'campus.query' | 'campus.lookup'; arguments: Record<string, unknown> };
  display: NonNullable<CampusScene['academicDisplay']>;
  sensitiveRead: NonNullable<CampusScene['sensitiveRead']>;
}
/** Persistence keeps a real restricted owner address, never a hidden copy of
 * the transcript, table, grade points or chart values. */
export function campusAcademicReference(scene: CampusScene): CampusAcademicReference {
  if (!scene.academicSessionId || !scene.academicRead || !scene.sensitiveRead || !scene.academicDisplay
    || !['grades', 'gpa_semesters', 'gpa_overall', 'gpa_cumulative'].includes(scene.domain))
    throw new Error('这份成绩画面缺少原读取地址。');
  return { kind: 'campus_reference', id: scene.id, revision: scene.revision, sessionId: scene.academicSessionId,
    createdAt: scene.createdAt, source: { ...scene.source, coverage: undefined }, domain: scene.domain as CampusAcademicReference['domain'],
    owner: structuredClone(scene.academicRead), display: { ...scene.academicDisplay }, sensitiveRead: { ...scene.sensitiveRead } };
}
