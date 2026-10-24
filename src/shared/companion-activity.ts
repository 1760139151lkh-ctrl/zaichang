export const companionActivities = ['chat', 'study', 'reading', 'planning', 'listening', 'rest', 'play', 'attention', 'resume'] as const;
export type CompanionActivity = typeof companionActivities[number];

/** A host-bound visual choice in one published reply. It is neither a fact
 * about the person nor permission to read, remember, diagnose or act. */
export interface CompanionActivityHint {
  activity: CompanionActivity;
  runId: string;
  messageId: string;
  revision: number;
}

export function validCompanionActivityHint(value: unknown, messageId: string): value is CompanionActivityHint {
  if (!value || typeof value !== 'object') return false;
  const hint = value as Partial<CompanionActivityHint>;
  return companionActivities.includes(hint.activity as CompanionActivity) && hint.messageId === messageId
    && typeof hint.runId === 'string' && hint.runId.length > 0 && Number.isInteger(hint.revision) && hint.revision! > 0;
}

/** A newer human turn or failed reply ends the previous visual invitation.
 * Background messages and historical selections do not become a new hint. */
export function currentCompanionActivity(messages: readonly {
  id: string; role: 'user' | 'assistant'; status: string; proactive?: unknown; companionActivity?: CompanionActivityHint;
}[]): CompanionActivity | undefined {
  let message: typeof messages[number] | undefined;
  for (let index = messages.length - 1; index >= 0; index--) {
    const candidate = messages[index];
    if (candidate.role === 'user') break;
    if (!candidate.proactive) { message = candidate; break; }
  }
  return message && ['running', 'done'].includes(message.status) && validCompanionActivityHint(message.companionActivity, message.id)
    ? message.companionActivity.activity : undefined;
}
