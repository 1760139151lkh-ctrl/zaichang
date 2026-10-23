import { createHash } from 'node:crypto';
import { reminderSpeakerSchema, type ReminderSpeaker } from '../../shared/harness';

export const reminderTextSha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Only a matching original text keeps its speaking turn. Changing a title,
 * time or recurrence is independent of changing the words of the reminder. */
export function reminderSpeakerForText(raw: unknown, text: unknown): ReminderSpeaker | undefined {
  if (typeof text !== 'string' || !text.trim()) return;
  const parsed = reminderSpeakerSchema.safeParse(raw);
  if (!parsed.success || parsed.data.textSha256 !== reminderTextSha256(text)) return;
  return parsed.data;
}

export function actionReminderText(capability: string, args: Record<string, unknown>): unknown {
  if (capability === 'local.agenda.save') return args.reminderMessage;
  if (capability === 'local.agenda.change' && args.changes && typeof args.changes === 'object')
    return (args.changes as Record<string, unknown>).reminderMessage;
}
