import { z } from 'zod';

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, '日期不存在');
export const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(52).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().describe('0=周日，1=周一，…，6=周六'),
  count: z.number().int().min(1).max(1000).optional(),
  untilDate: calendarDate.optional(),
}).strict();
export const occurrenceExceptionSchema = z.object({
  onDate: calendarDate,
  cancelled: z.boolean().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  detail: z.string().max(1500).optional(),
}).strict();
export const calendarPlanningSchema = z.object({
  state: z.enum(['invitation', 'wish', 'proposed', 'accepted']),
  flexibility: z.enum(['fixed', 'movable']),
  sourceEventId: z.string().min(1).max(160).optional(),
  sourceVersion: z.number().int().positive().optional(),
  placeId: z.string().min(1).max(160).optional(),
  constraints: z.array(z.string().min(1).max(300)).max(12).optional(),
}).strict();
export const calendarFieldsSchema = z.object({
  goalId: z.string().max(160).optional(),
  createNew: z.boolean().optional().describe('true表示本人明确另建一份重复副本。相同工作的重试或再次确认仍沿原对象进行。'),
  kind: z.enum(['event', 'todo', 'deadline', 'reminder', 'time_block']).optional(),
  timeZone: z.string().max(100).optional(),
  allDayDate: calendarDate.optional(),
  recurrence: recurrenceSchema.optional(),
  exceptions: z.array(occurrenceExceptionSchema).max(100).optional(),
  remindAt: z.string().datetime({ offset: true }).optional(),
  reminderMessage: z.string().max(200).optional().describe('到点时出现在系统通知里、你对对方说的一句话。你可以用自己的口吻，比如“早呀，记得把资料带上～”。这里表达所提醒的这件事，私人详情仍在原资料里；省略时通知只显示事项名。'),
  planning: calendarPlanningSchema.optional().describe('state分别标识未答应的邀请、愿望、未接受方案和已接受安排。它在prepare_action的待确认参数里描述采用后将保存的业务状态；卡片当前是否等待接受、是否真正提交，仍由动作的awaiting_approval、saved和真实回执表示，参数含accepted不会自行写入日历。旧对象没有这个字段时，仍沿用原已登记安排的含义；movable说明有讨论调整的空间，实际改动另归本人托付与原动作事务。'),
});
export type CalendarFields = z.infer<typeof calendarFieldsSchema>;
export const localCalendarChangeSchema = z.object({
  operation: z.enum(['update', 'delete', 'change_occurrence']),
  targetId: z.string().min(1).max(160),
  expectedRevision: z.number().int().positive(),
  occurrenceDate: calendarDate.optional(),
  cancelled: z.boolean().optional(),
  changes: z.object({
    ...calendarFieldsSchema.omit({ createNew: true }).shape,
    title: z.string().min(1).max(160).optional(), detail: z.string().max(1500).optional(),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    allDayDate: calendarDate.nullable().optional(), recurrence: recurrenceSchema.nullable().optional(),
    remindAt: z.string().datetime({ offset: true }).nullable().optional(), done: z.boolean().optional(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.operation === 'update' && !Object.keys(value.changes || {}).length) ctx.addIssue({ code: 'custom', message: '更新需要具体变更字段。' });
  if (value.operation === 'update' && (value.occurrenceDate !== undefined || value.cancelled !== undefined)) ctx.addIssue({ code: 'custom', path: ['operation'], message: 'occurrenceDate和cancelled描述重复系列中的单次发生，change_occurrence对应这个范围；update描述整个日历对象。这两种操作范围没有对应，本次没有提交修改。' });
  if (value.operation === 'delete' && (value.changes || value.occurrenceDate || value.cancelled !== undefined)) ctx.addIssue({ code: 'custom', message: '删除不接受额外字段变更。' });
  if (value.operation === 'change_occurrence' && (!value.occurrenceDate || (!Object.keys(value.changes || {}).length && value.cancelled === undefined))) ctx.addIssue({ code: 'custom', message: '单次例外需要发生日期和具体变更。' });
});
