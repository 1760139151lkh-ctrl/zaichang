import { z } from 'zod';
import type { MaterialItem } from './materials';
import type { NoteSummary } from './notes';
import type { Conversation } from './types';

const offset = z.number().int().nonnegative().max(1_000_000).default(0);
export const keepSnapshotInputSchema = z.object({
  limit: z.number().int().min(1).max(60).default(24),
  notesOffset: offset,
  materialsOffset: offset,
  conversationsOffset: offset,
  worksOffset: offset,
}).strict();
export type KeepSnapshotInput = z.input<typeof keepSnapshotInputSchema>;

/** A projection of original owners, never another content or search store.
 * nextOffset advances across candidates whose current source is unavailable. */
export interface KeepPage<T> {
  items: T[];
  offset: number;
  hasMore: boolean;
  nextOffset?: number;
  total?: number;
}

export interface KeepWorkLocator {
  sessionId: string;
  messageId: string;
  programId: string;
  revision: number;
  programHash: string;
  nodeId?: string;
}

export interface KeepWorkItem {
  kind: 'interactive_program';
  title: string;
  createdAt: string;
  locator: KeepWorkLocator;
  /** Bound data must be read again by its original owner before evaluation. */
  status: 'ready' | 'needs_refresh';
  /** Existence only. Inputs, program text and running clocks never cross here. */
  localState: { stateRevision: number; updatedAt: string } | null;
}

export interface KeepSnapshot {
  boundary: { privacyEpoch: number; policyRevision: number; sourceBoundary: number };
  notes: KeepPage<NoteSummary>;
  materials: KeepPage<MaterialItem>;
  conversations: KeepPage<Conversation>;
  works: KeepPage<KeepWorkItem>;
}

export interface KeepBridge {
  keepSnapshot(input?: KeepSnapshotInput): Promise<KeepSnapshot>;
}
