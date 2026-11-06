import type { FieldEdit } from './dictation-text';

/*
 * Writes into a text box the way typing would: through the editing command, so the
 * box's own undo (Ctrl+Z) keeps working, React's onChange sees a normal input event,
 * and a maximum length is honoured. When the browser declines the command (for
 * example while the window is in the background) the text is set directly and the
 * same input event is raised by hand.
 */

export type DictationElement = HTMLTextAreaElement | HTMLInputElement;

const TEXT_INPUTS = new Set(['text', 'search', '']);

export function isDictationElement(element: Element | null): element is DictationElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && TEXT_INPUTS.has(element.type);
}

export function usableElement(element: DictationElement): boolean {
  return element.isConnected && !element.disabled && !element.readOnly;
}

/** Cut at a code-point boundary so a character is never half inserted. */
function fit(text: string, room: number): string {
  if (text.length <= room) return text;
  let end = Math.max(0, room);
  if (end > 0 && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
  return text.slice(0, end);
}

export class FieldWriter {
  /** True while an edit of ours is in flight, so its own input event is not mistaken for typing. */
  editing = false;
  constructor(readonly element: DictationElement) {}

  get value(): string { return this.element.value; }

  /**
   * Replace [edit.start, edit.end) and put the caret at `caret`. Returns what the field holds
   * afterwards and whether the maximum length cut some of the words.
   */
  apply(edit: FieldEdit, caret: number): { edit: FieldEdit; value: string; truncated: boolean } {
    const element = this.element;
    const room = element.maxLength >= 0 ? element.maxLength - (element.value.length - (edit.end - edit.start)) : Number.POSITIVE_INFINITY;
    const insert = fit(edit.insert, room);
    const applied: FieldEdit = insert === edit.insert ? edit : { ...edit, insert };
    const before = element.value;
    const expected = before.slice(0, applied.start) + applied.insert + before.slice(applied.end);
    const active = document.activeElement;
    const foreground = active === element || active instanceof Element && !!active.closest('[data-voice-control]');
    this.editing = true;
    try {
      let done = false;
      if (foreground && active !== element) element.focus({ preventScroll: true });
      element.setSelectionRange(applied.start, applied.end);
      try { done = foreground && (applied.insert ? document.execCommand('insertText', false, applied.insert) : document.execCommand('delete')); }
      catch { done = false; }
      if (!done && element.value === before) {
        element.setRangeText(applied.insert, applied.start, applied.end, 'end');
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: applied.insert }));
      }
      const at = Math.max(0, Math.min(element.value.length, caret));
      element.setSelectionRange(at, at);
    } finally { this.editing = false; }
    return { edit: applied, value: element.value, truncated: applied !== edit || element.value.length < expected.length };
  }
}
