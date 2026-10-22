import { createHash } from 'node:crypto';
import type { ModelWireMessage } from '../provider';
import type { HermesResult } from './hermes';
import { ConversationRhythm } from './conversation-rhythm';
import { canonical } from './semantics';

/** Host-only proof on the cached, non-system protocol projection. The end
 * coordinate is exclusive; neither these hashes nor provider state are prose. */
export interface ProtocolHistoryCoverage {
  id: string;
  role: 'user' | 'assistant';
  contentFingerprint: string;
  wireStart: number;
  wireEnd: number;
  spanFingerprint: string;
}

/** The earliest still-proven user boundary of this same application reply,
 * including when completion review resumes it through another native turn. */
export interface ProtocolTurnBoundary {
  turnId: string;
  userIndex: number;
  prefixFingerprint: string;
}

function protocolMessages(messages: ModelWireMessage[]) {
  return messages.filter(message => message.role !== 'system');
}

export function protocolBodyFingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function protocolFingerprint(messages: ModelWireMessage[]) {
  return protocolBodyFingerprint(canonical(messages));
}

function boundaryStillPresent(messages: ModelWireMessage[], boundary: ProtocolTurnBoundary) {
  return Number.isSafeInteger(boundary.userIndex) && boundary.userIndex >= 0
    && messages[boundary.userIndex]?.role === 'user'
    && protocolFingerprint(messages.slice(0, boundary.userIndex + 1)) === boundary.prefixFingerprint;
}

export function advanceProtocolTurnBoundary(
  result: Pick<HermesResult, 'messages' | 'currentTurn'>,
  previous?: ProtocolTurnBoundary,
): ProtocolTurnBoundary | undefined {
  const messages = protocolMessages(result.messages);
  if (previous && boundaryStillPresent(messages, previous)) return previous;
  const native = result.currentTurn;
  if (!native || typeof native.id !== 'string' || !native.id.trim()
    || !Number.isSafeInteger(native.userIndex) || native.userIndex < 0
    || result.messages[native.userIndex]?.role !== 'user') return;
  const userIndex = protocolMessages(result.messages.slice(0, native.userIndex + 1)).length - 1;
  return { turnId: native.id, userIndex,
    prefixFingerprint: protocolFingerprint(messages.slice(0, userIndex + 1)) };
}

/** Validate an already host-minted proof on exactly the retained projection.
 * No search or content similarity can relocate its original message identity. */
export function validatedProtocolCoverage(
  retainedMessages: ModelWireMessage[],
  coverage: readonly ProtocolHistoryCoverage[],
): ProtocolHistoryCoverage[] {
  const messages = protocolMessages(retainedMessages);
  return coverage.filter(proof => typeof proof.id === 'string' && !!proof.id
    && (proof.role === 'user' || proof.role === 'assistant')
    && /^[a-f0-9]{64}$/.test(proof.contentFingerprint)
    && Number.isSafeInteger(proof.wireStart) && Number.isSafeInteger(proof.wireEnd)
    && proof.wireStart >= 0 && proof.wireEnd > proof.wireStart && proof.wireEnd <= messages.length
    && (proof.role === 'user'
      ? proof.wireEnd === proof.wireStart + 1 && messages[proof.wireStart].role === 'user'
      : messages[proof.wireEnd - 1].role === 'assistant')
    && protocolFingerprint(messages.slice(proof.wireStart, proof.wireEnd)) === proof.spanFingerprint);
}

/** Only an unchanged complete old prefix inherits old identities. A native
 * compaction may preserve prose in a summary, but that is not full coverage. */
export function retainProtocolCoverage(
  previousMessages: ModelWireMessage[],
  nextMessages: ModelWireMessage[],
  previousCoverage: readonly ProtocolHistoryCoverage[],
): ProtocolHistoryCoverage[] {
  const previous = protocolMessages(previousMessages), next = protocolMessages(nextMessages);
  if (next.length < previous.length
    || protocolFingerprint(previous) !== protocolFingerprint(next.slice(0, previous.length))) return [];
  return validatedProtocolCoverage(next, validatedProtocolCoverage(previous, previousCoverage));
}

export function coverCurrentProtocolMessages(
  result: Pick<HermesResult, 'messages' | 'content'>,
  boundary: ProtocolTurnBoundary | undefined,
  saved: { user: { id: string; content: string }; assistant: { id: string; content: string } },
): ProtocolHistoryCoverage[] {
  const messages = protocolMessages(result.messages);
  if (!boundary || !boundaryStillPresent(messages, boundary)) return [];
  const coverage: ProtocolHistoryCoverage[] = [];
  const proof = (message: { id: string; content: string }, role: ProtocolHistoryCoverage['role'], start: number, end: number) => ({
    id: message.id, role, contentFingerprint: protocolBodyFingerprint(message.content),
    wireStart: start, wireEnd: end, spanFingerprint: protocolFingerprint(messages.slice(start, end)),
  });
  // An attachment wrapper, multimodal representation or transformed user row
  // is not proof that the saved original is present verbatim.
  if (messages[boundary.userIndex].content === saved.user.content)
    coverage.push(proof(saved.user, 'user', boundary.userIndex, boundary.userIndex + 1));
  const final = messages.at(-1);
  if (!final || final.role !== 'assistant' || final.tool_calls?.length || final.content !== result.content) return coverage;
  const rhythm = new ConversationRhythm(true);
  for (const message of messages.slice(boundary.userIndex + 1, -1)) {
    // These are the contributions that the foreground actually commits.
    // Superseded terminal candidates never enter its stable spoken prefix.
    if (message.role === 'assistant' && message.tool_calls?.length && typeof message.content === 'string')
      rhythm.offer(message.content);
  }
  if (rhythm.finish(result.content) === saved.assistant.content)
    coverage.push(proof(saved.assistant, 'assistant', boundary.userIndex + 1, messages.length));
  return coverage;
}
