import { z } from 'zod';
import type { WorkSourceBinding } from './harness';

/** A temporary UI condition, separate from the user's authored message. */
export const planningTrialConditionSchema = z.union([
  z.object({ proposedStart: z.string().max(60).datetime({ offset: true }) }).strict(),
  z.object({ localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/) }).strict(),
]);
export type PlanningTrialCondition = z.infer<typeof planningTrialConditionSchema>;
export interface PlanningTrialObservation {
  origin: 'ui_trial_condition';
  status: 'hypothetical_not_evaluated';
  originalStart: string;
  originalEnd: string;
  proposedStart: string;
  proposedEnd: string;
  durationMinutes: number;
  timeZone: string;
  executionAuthorized: false;
}

/** Facts from the original planner, for one unchanged amount of work. */
export interface PlanningWorkRhythm {
  taskId: string;
  title: string;
  requested: { kind: 'continuous' } | { kind: 'split'; maximumChunkMinutes: number };
  requestedMinutes: number;
  scheduledMinutes: number;
  segments: { start: string; end: string; workMinutes: number; setupMinutes: number; cleanupMinutes: number }[];
  setupCleanupMinutes: number;
  complete: boolean;
  matchesRequest: boolean;
}

/** A comparison header only joins host-authored timeline scenes. It carries
 * no executable calendar arguments or browser-authored time arithmetic. */
export interface PlanningComparisonView {
  comparisonId: string;
  matterId?: string;
  matterRevision?: number;
  window: { from: string; to: string; timeZone: string };
  sourceIds: string[];
  sourceBinding?: WorkSourceBinding;
  branches: {
    branchId: string;
    title: string;
    intent: string;
    optionRef?: { id: string; revision: number };
    sceneRef?: { id: string; revision: number };
    /** Hypothetical branches have no executable planner ticket. */
    planId: string | null;
    hypothetical: boolean;
    feasibility: string;
    issues: string[];
    workRhythms?: PlanningWorkRhythm[];
    removed?: { id: string; title: string; occurrenceDate?: string }[];
    unscheduled?: { title: string; reason: string }[];
    metrics: {
      changedObjects: number; removedObjects: number; proposedActivities: number;
      scheduledMinutes: number; unscheduledTasks: number; longestWorkMinutes: number;
      largestFreeWindowMinutes: number; occupiedMinutes: number;
    };
  }[];
  selectionMeaning: 'continue_discussion_not_execution';
}
