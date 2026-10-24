import type { ModelWireMessage } from '../provider';
import { redactCredentialValues } from './redaction';

/** Keep actual source content, IDs, versions, gaps and errors intact. Tool
 * schemas and repeated host instructions are not new evidence for a reviewer. */
export function observationsForReview(observations: unknown[]): unknown[] {
  return observations.map(value => {
    if (!value || typeof value !== 'object' || !('result' in value)) return value;
    const observation = value as Record<string, unknown>, result = observation.result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) return value;
    const { inputSchema: _schema, hostUsageGuidance: _guide, guidanceMeaning: _meaning, ...evidence } = result as Record<string, unknown>;
    // map_route's conditionalOrigins are generated from nearby buildings with
    // route-connected entrances. The unknown connection belongs to the user's
    // original place -> candidate entrance, not to the candidate's own route.
    // Keep both meanings explicit without changing the original tool result.
    const routeData = evidence.data && typeof evidence.data === 'object' && !Array.isArray(evidence.data) ? evidence.data as Record<string, unknown> : null;
    if (observation.tool === 'map_route' && Array.isArray(routeData?.conditionalOrigins)) {
      evidence.reviewConditionalSegments = routeData.conditionalOrigins.slice(0, 5).map(candidate => {
        const item = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
        const originEntrance = item.originEntrance && typeof item.originEntrance === 'object' ? item.originEntrance as Record<string, unknown> : null;
        const destinationEntrance = item.destinationEntrance && typeof item.destinationEntrance === 'object' ? item.destinationEntrance as Record<string, unknown> : null;
        return { candidateOriginId: item.id, candidateOriginLabel: item.label, knownSegmentMinutes: item.minutes,
          candidateEntranceId: originEntrance?.id, candidateEntranceName: originEntrance?.name,
          destinationEntranceId: destinationEntrance?.id,
          candidateEntranceRouteConnected: originEntrance?.connected === true ? true : null,
          originalPlaceToCandidateConnection: item.connection,
          condition: item.condition, originalRouteStatus: routeData.status };
      });
    }
    if (evidence.catalogOnly && Array.isArray(evidence.items)) evidence.items = evidence.items.map(item => {
      if (!item || typeof item !== 'object') return item;
      const { inputSchema: _input, outputSchema: _output, ...metadata } = item; return metadata;
    });
    return { ...observation, result: evidence };
  });
}

/** Only actual retained tool messages qualify; model summaries and reasoning
 * are never reconstructed as observations. The caller must validate the chain
 * against the current scope before using this projection. */
export function conversationObservations(messages: ModelWireMessage[]): unknown[] {
  const calls = new Map<string, { tool: string; requestedArguments?: unknown }>();
  for (const message of messages) for (const call of message.tool_calls || []) {
    let requestedArguments: unknown;
    try { requestedArguments = redactCredentialValues(JSON.parse(call.function.arguments)); } catch { /* Malformed input is not reconstructed. */ }
    calls.set(call.id, { tool: call.function.name, requestedArguments });
  }
  return messages.flatMap(message => {
    if (message.role !== 'tool' || !message.tool_call_id || typeof message.content !== 'string' || !calls.has(message.tool_call_id)) return [];
    let result: unknown;
    try { result = JSON.parse(message.content); } catch { result = { text: message.content }; }
    return [{ ...calls.get(message.tool_call_id), toolCallId: message.tool_call_id, origin: 'prior_conversation', result: redactCredentialValues(result) }];
  });
}
