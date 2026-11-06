import { speechSeparator } from '../../shared/speech-text';

/*
 * Where dictated words go in the field, and how that stays true while the person keeps
 * typing, clicking elsewhere or fixing a word. Pure text arithmetic (UTF-16 offsets as
 * the browser counts them); nothing here touches the page.
 *
 * Each spoken stretch owns a span of the field. A guess grows or changes that span in
 * place, the final replaces it, and a new stretch starts where the caret is. Every
 * change to the field, ours or the person's, moves the spans it lies before, so the
 * next words land at the caret even after the person edited above them.
 *
 * MOBILE: the same arithmetic maps onto the text field's composing region on iOS / Android.
 */

export interface FieldEdit { start: number; end: number; insert: string }
export interface DictationSpan { id: number; start: number; end: number; text: string; lead: string; trail: string; lost: boolean }
export interface DictationPlan {
  edit: FieldEdit;
  id: number;
  /** The whole span after the edit, separators included. Empty: the span is removed. */
  text: string;
  lead: string;
  trail: string;
  create: boolean;
}

const high = (code: number) => code >= 0xd800 && code <= 0xdbff;
const low = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** The smallest single edit that turns `before` into `after`, never splitting a surrogate pair. */
export function diffEdit(before: string, after: string): FieldEdit {
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  if (start > 0 && high(before.charCodeAt(start - 1))) start--;
  let tail = 0;
  while (tail < max - start && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
  if (tail > 0 && low(before.charCodeAt(before.length - tail))) tail--;
  return { start, end: before.length - tail, insert: after.slice(start, after.length - tail) };
}

function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let at = 0;
  while (at < max && a.charCodeAt(at) === b.charCodeAt(at)) at++;
  return at > 0 && high(a.charCodeAt(at - 1)) ? at - 1 : at;
}

/** Where the caret goes after `edit`, if it was at `caret` before. */
export function caretAfter(caret: number, edit: FieldEdit): number {
  const delta = edit.insert.length - (edit.end - edit.start);
  if (caret >= edit.end) return caret + delta;
  if (caret <= edit.start) return caret;
  return edit.start + edit.insert.length;
}

export class DictationTracker {
  value: string;
  cursor: number;
  readonly spans: DictationSpan[] = [];
  /** Text the very first insertion replaced (a selection the person had when they started). */
  replaced = '';
  private replacedBy: number | null = null;
  private selection: { start: number; end: number } | null;

  constructor(value: string, selectionStart: number, selectionEnd: number) {
    this.value = value;
    this.cursor = selectionStart;
    this.selection = selectionEnd > selectionStart ? { start: selectionStart, end: selectionEnd } : null;
  }

  /** The person moved the caret on purpose: the next stretch starts there. */
  moveCursor(position: number, end = position): void {
    this.cursor = Math.max(0, Math.min(this.value.length, position));
    this.selection = end > this.cursor ? { start: this.cursor, end: Math.min(this.value.length, end) } : null;
  }

  /** The edit that makes the field show this text for one spoken stretch, or null when it already does. */
  plan(id: number, text: string): DictationPlan | null {
    if (!text) return null;
    const span = this.spans.find(item => item.id === id);
    if (span) {
      if (span.lost) return null;
      const full = span.lead + text + span.trail;
      if (full === span.text) return null;
      const keep = commonPrefix(span.text, full);
      return { edit: { start: span.start + keep, end: span.end, insert: full.slice(keep) }, id, text: full, lead: span.lead, trail: span.trail, create: false };
    }
    const start = this.selection ? this.selection.start : this.cursor, end = this.selection ? this.selection.end : this.cursor;
    const lead = speechSeparator(this.value.slice(0, start), text), trail = speechSeparator(text, this.value.slice(end));
    const full = lead + text + trail;
    return { edit: { start, end, insert: full }, id, text: full, lead, trail, create: true };
  }

  /** The edit that takes a stretch back out (the recognizer decided it was not speech). */
  removal(id: number): DictationPlan | null {
    const span = this.spans.find(item => item.id === id);
    if (!span || span.lost || this.value.slice(span.start, span.end) !== span.text) return null;
    return { edit: { start: span.start, end: span.end, insert: span.id === this.replacedBy ? this.replaced : '' },
      id, text: '', lead: span.lead, trail: span.trail, create: false };
  }

  /**
   * The field now holds `value` after `edit`. `plan` is set when the edit was ours; an edit
   * without a plan is the person's own, and spans it touches are left as they are from then on.
   */
  record(edit: FieldEdit, value: string, plan?: DictationPlan): void {
    const delta = edit.insert.length - (edit.end - edit.start);
    for (const span of this.spans) {
      if (plan && span.id === plan.id) continue;
      if (edit.end <= span.start) { span.start += delta; span.end += delta; }
      else if (edit.start < span.end) span.lost = true;
    }
    if (edit.end <= this.cursor) this.cursor += delta;
    else if (edit.start < this.cursor) this.cursor = edit.start + edit.insert.length;
    if (plan) {
      // `edit` is what the field really took (a maximum length may have cut it), so spans follow it, not the plan.
      if (plan.create) {
        if (!this.spans.length) { this.replaced = this.value.slice(edit.start, edit.end); this.replacedBy = plan.id; }
        this.spans.push({ id: plan.id, start: edit.start, end: edit.start + edit.insert.length, text: edit.insert, lead: plan.lead, trail: plan.trail, lost: false });
        this.spans.sort((a, b) => a.start - b.start);
        this.cursor = edit.start + edit.insert.length;
        this.selection = null;
      } else if (!plan.text) {
        const at = this.spans.findIndex(item => item.id === plan.id);
        if (at >= 0) this.spans.splice(at, 1);
      } else {
        const span = this.spans.find(item => item.id === plan.id);
        if (span) {
          span.text = span.text.slice(0, edit.start - span.start) + edit.insert;
          span.end = span.start + span.text.length;
        }
      }
    }
    this.value = value;
  }

  /** Whatever dictation left that is still exactly as it was. */
  intact(): DictationSpan[] {
    return this.spans.filter(span => !span.lost && this.value.slice(span.start, span.end) === span.text);
  }

  /**
   * Edits that take all the dictated text back out, last first so each one is still valid
   * after the previous, then put back what the first insertion replaced.
   */
  undoEdits(ids?: ReadonlySet<number>): { edits: FieldEdit[]; caret: number } | null {
    const spans = this.intact().filter(span => !ids || ids.has(span.id));
    if (!spans.length) return null;
    const first = spans[0];
    const edits: FieldEdit[] = [...spans].reverse().map(span => ({ start: span.start, end: span.end,
      insert: span.id === this.replacedBy ? this.replaced : '' }));
    return { edits, caret: first.start + (first.id === this.replacedBy ? this.replaced.length : 0) };
  }
}
