import type { EvidenceEvent } from '../../shared/harness';
import { codePointSlice } from './semantics';

export interface SourceQuoteInput {
  eventId: string;
  quote: string;
  contentVersion?: number;
  start?: number;
  end?: number;
}
export interface ResolvedSourceQuote {
  eventId: string;
  quote: string;
  contentVersion: number;
  start: number;
  end: number;
}

/** A unique literal fragment in the supplied text, in Unicode coordinates.
 * The caller owns the text's existing scope; this grants no wider source. */
export function resolveUniqueQuoteRange(text: string, quote: string): { start: number; end: number } | undefined {
  if (!quote.length) return;
  const offset = text.indexOf(quote);
  if (offset < 0 || text.indexOf(quote, offset + 1) >= 0) return;
  const start = Array.from(text.slice(0, offset)).length, end = start + Array.from(quote).length;
  // A UTF-16 substring inside a surrogate pair is not a Unicode source range.
  if (end > Array.from(text).length || codePointSlice(text, start, end) !== quote) return;
  return { start, end };
}

/** Resolve an address, never permission. An existing coordinate must match
 * exactly; a stale/partial address cannot fall back to a similar occurrence.
 * Legacy quote-only sources admit an address only when the quote is unique. */
export function resolveSourceQuote(event: Pick<EvidenceEvent, 'id' | 'text' | 'contentVersion'>,
  raw: unknown): ResolvedSourceQuote | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const input = raw as Record<string, unknown>;
  if (input.eventId !== event.id || typeof input.quote !== 'string' || !input.quote.length) return;
  const quote = input.quote, length = Array.from(event.text).length;
  if (['contentVersion', 'start', 'end'].some(field => Object.hasOwn(input, field))) {
    if (!Number.isSafeInteger(input.contentVersion) || input.contentVersion !== event.contentVersion
      || !Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.end)
      || Number(input.start) < 0 || Number(input.end) <= Number(input.start) || Number(input.end) > length
      || codePointSlice(event.text, Number(input.start), Number(input.end)) !== quote) return;
    return { eventId: event.id, quote, contentVersion: event.contentVersion, start: Number(input.start), end: Number(input.end) };
  }
  const range = resolveUniqueQuoteRange(event.text, quote);
  return range ? { eventId: event.id, quote, contentVersion: event.contentVersion, ...range } : undefined;
}

/** Only for an already-saved legacy source. Older request records retained a
 * version without coordinates. Honor that version before resolving one unique
 * quote; a stored partial/complete coordinate is never moved to another match.
 * New model citations continue to use resolveSourceQuote's complete address. */
export function resolveRetainedSourceQuote(event: Pick<EvidenceEvent, 'id' | 'text' | 'contentVersion'>,
  raw: unknown): ResolvedSourceQuote | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const source = raw as Record<string, unknown>;
  if (Object.hasOwn(source, 'start') || Object.hasOwn(source, 'end')) return resolveSourceQuote(event, raw);
  if (Object.hasOwn(source, 'contentVersion')
    && (!Number.isSafeInteger(source.contentVersion) || source.contentVersion !== event.contentVersion)) return;
  return resolveSourceQuote(event, { eventId: source.eventId, quote: source.quote });
}
