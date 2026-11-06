import { clipboard, ClipboardItem } from 'electron';
import type { SpeechClipboardOutcome } from '../../shared/speech';

/*
 * After a dictation the words stay on the clipboard, so they can be pasted again if
 * the field they were typed into is gone. That must not cost the person what they
 * had copied before:
 *   - plain or formatted text is remembered (in memory only, never sent to the page,
 *     never logged) and can be put back with one click, as long as nothing else was
 *     copied in between;
 *   - anything else (an image, files) is left alone, and the person is told.
 * On Windows the system clipboard history (Win+V), when it is on, also keeps what was
 * copied before.
 *
 * Electron 44's clipboard is the asynchronous W3C-style one (read / write / ClipboardItem).
 *
 * MOBILE: UIPasteboard / ClipboardManager follow the same rule. iOS: write with
 * localOnly so the words do not travel to the person's other Apple devices, and never
 * read the pasteboard (it shows a paste prompt; remember only what this app wrote).
 * Android 13+ shows its own "copied" confirmation; mark the clip sensitive so it is
 * hidden from previews.
 */

const TEXTUAL = new Set(['text/plain', 'text/html', 'text/rtf']);
const MAX_REMEMBERED_CHARS = 400_000;
const REMEMBER_MS = 10 * 60_000;
const lines = (value: string) => value.replace(/\r\n/g, '\n');

export class SpeechClipboard {
  private note: { written: string; previous: Record<string, string>; at: number } | null = null;
  private expiry: ReturnType<typeof setTimeout> | undefined;

  /** Leave the dictated words on the clipboard without destroying what was there. */
  async keep(text: string, allowed: () => boolean = () => true): Promise<SpeechClipboardOutcome> {
    if (!text.trim()) return { state: 'empty' };
    try {
      const items = await clipboard.read();
      const types = items.flatMap(item => item.types);
      if (types.some(type => !TEXTUAL.has(type))) return { state: 'left_alone', reason: 'other_content' };
      const previous: Record<string, string> = {};
      let size = 0;
      for (const item of items) {
        for (const type of item.types) {
          const value = await (await (item.getType(type) as Promise<Blob>)).text();
          size += value.length;
          if (size > MAX_REMEMBERED_CHARS) return { state: 'left_alone', reason: 'too_large' };
          previous[type] = value;
        }
      }
      if (!allowed()) return { state: 'off' };
      await clipboard.write([new ClipboardItem({ 'text/plain': text })]);
      clearTimeout(this.expiry);
      this.note = { written: text, previous, at: Date.now() };
      // Cancellation or a public-surface switch may arrive while the native write is pending.
      if (!allowed()) { await this.restore(); return { state: 'off' }; }
      this.expiry = setTimeout(() => this.forget(), REMEMBER_MS);
      this.expiry.unref();
      return { state: 'kept', restorable: types.length > 0 };
    } catch { return { state: 'failed' }; }
  }

  /** Puts back what was there before, unless something newer was copied since. */
  async restore(): Promise<boolean> {
    const note = this.note;
    this.note = null;
    clearTimeout(this.expiry);
    if (!note || Date.now() - note.at > REMEMBER_MS) return false;
    try {
      const items = await clipboard.read();
      if (items.some(item => item.types.some(type => type !== 'text/plain'))) return false;
      if (lines(await clipboard.readText()) !== lines(note.written)) return false;
      if (Object.keys(note.previous).length) await clipboard.write([new ClipboardItem(note.previous)]);
      else await clipboard.writeText('');
      return true;
    } catch { return false; }
  }

  forget(): void { clearTimeout(this.expiry); this.note = null; }
}
