import { useCallback, useMemo, useRef } from 'react';
import { assistantTextReferenceSchema, type AssistantTextReference } from '../shared/workspace-context';
import { LocalTextFocus, type LocalTextRange } from './LocalTextFocus';
import { RichText } from './RichText';

export interface AssistantTextSourceProps {
  text: string;
  sourceStart: number;
  sourceEnd: number;
  referenceBase?: Pick<AssistantTextReference, 'sessionId' | 'messageId' | 'contentSha256'>;
  activeReference?: AssistantTextReference;
  onFocus: (reference: AssistantTextReference, preview: string, kind: 'text' | 'formula') => void;
  disabled?: boolean;
}

/** Both ends and everything between them must be literal source. Markdown
 * syntax, decoded entities and generated mathematics never fill a gap. */
function literalRange(root: HTMLElement | null, points: string[], range: LocalTextRange) {
  if (!root || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
    || range.start < 0 || range.end <= range.start || range.end > points.length
    || range.end - range.start > 4000 || points.slice(range.start, range.end).join('').trim() !== range.preview.trim()) return false;
  const spans = [...root.querySelectorAll<HTMLElement>('[data-focus-start][data-focus-end]')]
    .filter(span => Number(span.dataset.focusStart) < range.end && Number(span.dataset.focusEnd) > range.start);
  let through = range.start;
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index], start = Number(span.dataset.focusStart), end = Number(span.dataset.focusEnd);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > points.length
      || (index ? start !== through : start > range.start || end <= range.start)
      || span.closest('.katex,math,svg,[data-focus-excluded]')
      || points.slice(start, end).join('') !== span.textContent) return false;
    through = end;
  }
  return spans.length > 0 && through >= range.end;
}

/** A view onto one exact plain-text fragment of a published assistant reply.
 * The original message owns the text; this component carries only its address. */
export function AssistantTextSource({ text, sourceStart, sourceEnd, referenceBase, activeReference,
  onFocus, disabled = false }: AssistantTextSourceProps) {
  const root = useRef<HTMLDivElement>(null), points = useMemo(() => Array.from(text), [text]);
  const eligible = !!referenceBase && !!referenceBase.sessionId && referenceBase.sessionId.length <= 160
    && !!referenceBase.messageId && referenceBase.messageId.length <= 160 && /^[a-f0-9]{64}$/.test(referenceBase.contentSha256)
    && Number.isSafeInteger(sourceStart) && Number.isSafeInteger(sourceEnd) && sourceStart >= 0
    && sourceEnd >= sourceStart && sourceEnd - sourceStart === points.length;
  const active = eligible && activeReference && activeReference.sessionId === referenceBase.sessionId
    && activeReference.messageId === referenceBase.messageId && activeReference.contentSha256 === referenceBase.contentSha256
    && assistantTextReferenceSchema.safeParse(activeReference).success
    && activeReference.start >= sourceStart && activeReference.end <= sourceEnd
    ? { start: activeReference.start - sourceStart, end: activeReference.end - sourceStart } : undefined;
  const rangeAllowed = useCallback((range: LocalTextRange, body?: HTMLElement) => literalRange(body || root.current, points, range), [points]);
  const select = (range: LocalTextRange) => {
    if (disabled || !eligible || !rangeAllowed(range)) return;
    const reference = assistantTextReferenceSchema.safeParse({ ...referenceBase,
      start: sourceStart + range.start, end: sourceStart + range.end });
    if (!reference.success) return;
    const preview = Array.from(range.preview);
    onFocus(reference.data, preview.slice(0, 120).join('') + (preview.length > 120 ? '…' : ''), 'text');
  };
  const selectFormula = (range: LocalTextRange) => {
    if (disabled || !eligible) return;
    const reference = assistantTextReferenceSchema.safeParse({ ...referenceBase,
      start: sourceStart + range.start, end: sourceStart + range.end });
    if (reference.success) onFocus(reference.data, '这个公式', 'formula');
  };
  return <div ref={root} className="assistant-text-source"
    data-assistant-text-start={eligible ? sourceStart : undefined} data-assistant-text-end={eligible ? sourceEnd : undefined}>
    <LocalTextFocus source={text} label="这段解释" disabled={disabled || !eligible} activeRange={active}
      rangeAllowed={rangeAllowed} onFocus={select}>
      <RichText text={text} sourceFocus={eligible} activeSourceRange={active}
        onFormulaFocus={!disabled && eligible ? selectFormula : undefined} />
    </LocalTextFocus>
  </div>;
}
