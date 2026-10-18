import { z } from 'zod';

export const calendarExportInput = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  timeZone: z.string().min(1).max(100),
  includeDetails: z.boolean().default(false),
}).strict();
export type CalendarExportInput = z.input<typeof calendarExportInput>;
export type CalendarExportResult = { saved: boolean; count: number; omitted: number; reasons: string[] };
