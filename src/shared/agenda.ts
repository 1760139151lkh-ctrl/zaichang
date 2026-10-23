import { z } from 'zod';
import { calendarDate, localCalendarChangeSchema } from './calendar';
import type { Action } from './types';

const boundary = {
  privacyEpoch: z.number().int().nonnegative(),
  policyRevision: z.number().int().nonnegative(),
  sourceBoundary: z.number().int().nonnegative(),
};
const timeZone = z.string().min(1).max(100);

/** A calendar owner address. Selecting it does not authorize a change. */
export const agendaReferenceSchema = z.object({
  id: z.string().min(1).max(160),
  revision: z.number().int().positive(),
  occurrenceDate: calendarDate.optional(),
}).strict();
export type AgendaReference = z.infer<typeof agendaReferenceSchema>;

export const agendaFocusSchema = z.object({
  record: agendaReferenceSchema,
  trial: z.object({ proposedStart: z.string().datetime({ offset: true }) }).strict().optional(),
}).strict();
export type AgendaFocus = z.infer<typeof agendaFocusSchema>;

export const agendaDayInputSchema = z.object({ date: calendarDate, timeZone, ...boundary }).strict();
export type AgendaDayInput = z.infer<typeof agendaDayInputSchema>;

export interface AgendaOccurrence {
  record: AgendaReference;
  occurrenceId: string;
  /** The host-expanded occurrence. The stored series keeps the same owner. */
  item: Action;
  start: string;
  end: string | null;
}
export interface AgendaDayResult {
  date: string;
  timeZone: string;
  window: { from: string; to: string };
  items: AgendaOccurrence[];
  issues: { id: string; date?: string; status: string; startsAt?: string }[];
  complete: boolean;
  fetchedAt: string;
  privacyEpoch: number;
  policyRevision: number;
  sourceBoundary: number;
}

export const agendaPreviewChangeInputSchema = z.object({
  record: agendaReferenceSchema,
  changes: localCalendarChangeSchema.shape.changes.unwrap(),
  timeZone,
  includeCampus: z.boolean().default(false),
  ...boundary,
}).strict();
export type AgendaPreviewChangeInput = z.input<typeof agendaPreviewChangeInputSchema>;

export interface AgendaChangePreview {
  record: AgendaReference;
  window: { from: string; to: string; timeZone: string };
  conflicts: { id: string; title: string; start: string; end: string | null; source: 'agenda' | 'campus' }[];
  unknown: string[];
  violations: string[];
  sourceCoverage: { sourceId: string; status: string; reason?: string }[];
  recurringScope: 'once' | 'series' | 'single';
  assessedOccurrence: AgendaOccurrence | null;
  fetchedAt: string;
  /** This is a calculation, never a receipt or an adoption ticket. */
  applied: false;
}

export interface AgendaBridge {
  agendaDay(input: AgendaDayInput): Promise<AgendaDayResult>;
  agendaPreviewChange(input: AgendaPreviewChangeInput): Promise<AgendaChangePreview>;
}
