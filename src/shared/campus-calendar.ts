import { z } from 'zod';

export const campusScheduleInput = z.object({
  from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }), timeZone: z.string().min(1).max(100),
}).strict().superRefine((value, context) => {
  const from = Date.parse(value.from), to = Date.parse(value.to);
  if (!(to > from)) { context.addIssue({ code: 'custom', message: '请选择有效的起止时间。' }); return; }
  try {
    const format = new Intl.DateTimeFormat('en', { timeZone: value.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const day = (at: number) => {
      const parts = Object.fromEntries(format.formatToParts(new Date(at)).map(part => [part.type, part.value]));
      return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
    };
    if ((day(to - 1) - day(from)) / 86400000 + 1 > 31)
      context.addIssue({ code: 'custom', message: '一次最多查看31个本地日期，请缩小时间范围。' });
  } catch { context.addIssue({ code: 'custom', path: ['timeZone'], message: '请选择有效的显示时区。' }); }
});
export type CampusScheduleInput = z.infer<typeof campusScheduleInput>;
export interface CampusScheduleBlock {
  id: string; kind: 'class' | 'exam'; title: string; start: string; end: string | null; location?: string; timePrecision?: string;
}
export interface CampusScheduleSnapshot {
  bundleId: string; resource: string; version: string; selection: 'saved_head' | 'historical'; collectedAt?: string; sourceFetchedAt: Record<string, string>;
  coverage: unknown; original: { bundleId: string; pointer: string };
}
export type CampusScheduleQuality = { bundleId: string; status: 'unavailable' } | { bundleId: string; status: 'ok';
  generatedAllResolvableRules: boolean; unresolvedRuleCount: number; calendarOfficiallyCrosschecked: boolean; allFutureDatesFinal: boolean };
/** Read-only campus facts. These never acquire local agenda IDs or acceptance. */
export interface CampusScheduleResult {
  /** Default refresh=false. Authentication and a missing saved snapshot are
   * handled by the configured connector's existing query/read semantics. */
  readMode: 'existing_connector_default';
  status: 'ready' | 'partial' | 'not_read'; window: CampusScheduleInput; sourceId: 'campus:zju-account'; snapshotVersion: string | null;
  items: CampusScheduleBlock[]; snapshots: CampusScheduleSnapshot[]; scheduleQuality: CampusScheduleQuality[];
  issues: string[]; cancelledCount: number | null; pendingCount: number | null;
  coverage: { completeForSavedSnapshot: boolean; live: false; attendanceEstablished: false; realAvailabilityEstablished: false };
  meaning: string;
}
