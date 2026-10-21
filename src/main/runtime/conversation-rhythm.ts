import { redactCredentials } from './redaction';

/** One parent's own words can help before its necessary investigation ends.
 * This method changes when already-authored public content is shown; it does
 * not add a speaker, a model call, a progress agent or a second conversation. */
export const CONVERSATION_RHYTHM_GUIDANCE = `# 边做边说
你写在 assistant content 里的话会一个字一个字地出现在对方眼前，工具还在跑的时候也一样。所以去查东西之前，可以先用你自己的口吻接一句，再发出工具调用——“我看看今天的课”“等我一下，路线和晚上的天气我一起看”。接话、亲近、一句小玩笑都可以，不必先证明它带来了新信息；但也不用每个工具前都说，简单的事不必假装深思，没什么想说的就直接去查。
查到一部分有用的，可以先告诉对方，再接着查剩下的；新的发现推翻了刚才的判断，就自然地改口，不假装没说过。还没查到的结果不提前说，还没做的事不说做完了。
最后的回答接着你前面已经说过的话往下走：不把开头再说一遍，不复述画面里已有的整张表，也不罗列调用了哪些工具。对方中途补一句或改了主意，就以新的意思为准，已经办成的结果保留。`;

/** Transient prose of the same foreground reply. A source-checked current
 * draft may be visible while generating. Successful tool turns enter spoken;
 * final acceptance still belongs to the original completion boundary. */
export class ConversationRhythm {
  private readonly spoken: string[] = [];
  private generation = 0;
  private draft?: { generation: number; raw: string; visible: string };
  private lastVisibleDraft = '';

  constructor(readonly enabled: boolean) {}

  /** One actual foreground model request. A replay replaces its unfinished
   * draft; it never appends the old request's partial text a second time. */
  beginDraft() {
    const generation = ++this.generation;
    this.draft = { generation, raw: '', visible: '' };
    return generation;
  }

  appendDraft(generation: number, delta: string) {
    if (this.enabled && this.draft?.generation === generation) this.draft.raw += delta;
  }

  replaceDraft(generation: number, content: string) {
    if (this.draft?.generation === generation) this.draft.raw = content;
  }

  get hasDraft() { return this.draft !== undefined; }

  /** The caller admits the current scope/source proof immediately before
   * this projection. No provider completion or action success is implied. */
  previewDraft(generation: number, complete = false): { changed: boolean; text: string } {
    if (!this.enabled || this.draft?.generation !== generation) return { changed: false, text: this.current() };
    const text = redactStreamingDraft(this.draft.raw, complete);
    if (text === this.draft.visible) return { changed: false, text: this.finish(text) };
    this.draft.visible = text;
    this.lastVisibleDraft = text;
    return { changed: true, text: this.finish(text) };
  }

  /** Reconcile to the provider's authoritative complete content only after
   * its original completion/source checks pass. This is still a tool-turn
   * contribution, not the final completion-review verdict. */
  commitDraft(generation: number, content: string) {
    if (this.draft?.generation !== generation) return { changed: false, text: this.current() };
    this.draft = undefined;
    this.lastVisibleDraft = '';
    return this.offer(redactStreamingDraft(content, true));
  }

  /** Failure text stays unfinished and outside the accepted spoken ledger.
   * Revoked sources discard the draft; an ordinary interruption may retain
   * only the safe prefix the user actually saw. */
  interruptDraft(discard: boolean) {
    const visible = this.draft?.visible || this.lastVisibleDraft;
    this.draft = undefined;
    this.lastVisibleDraft = '';
    return discard ? this.current() : this.finish(visible);
  }

  acceptFinal() { this.draft = undefined; this.lastVisibleDraft = ''; }

  invalidateSources() {
    this.spoken.splice(0); this.draft = undefined; this.lastVisibleDraft = '';
  }

  offer(content: string): { changed: boolean; text: string } {
    if (!this.enabled || !content.trim()) return { changed: false, text: this.current() };
    const text = redactStreamingDraft(content, true).trim();
    const before = this.current(), combined = this.finish(text);
    if (combined === before) return { changed: false, text: before };
    // Preview and commit use the same exact reconciliation. A model that
    // resumes with its earlier prefix must not duplicate it at commit time.
    this.spoken.splice(0, this.spoken.length, combined);
    return { changed: true, text: this.current() };
  }

  current() { return this.spoken.join('\n\n'); }

  /** Keep a real earlier contribution visible. If the final continuation
   * already includes that exact prefix or contains the prior text, do not display it twice. */
  finish(finalContent: string) {
    const safeFinal = redactStreamingDraft(finalContent, true);
    const before = this.current(), after = safeFinal.trim();
    if (!before) return safeFinal;
    if (!after) return before;
    if (after.startsWith(before)) return after;
    if (before.startsWith(after)) return before;
    if (after.includes(before)) return after;

    const beforeLines = before.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const afterLines = after.split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (beforeLines.length > 0 && afterLines.length > 0) {
      if (afterLines[0] === beforeLines[beforeLines.length - 1] || beforeLines.includes(afterLines[0])) {
        const remainingAfter = afterLines.filter(line => !beforeLines.includes(line));
        if (remainingAfter.length === 0) return before;
        return before + '\n\n' + remainingAfter.join('\n\n');
      }
    }
    return before + '\n\n' + after;
  }
}
/** The existing credential redactor needs complete spans. Keep an open key
 * token or private-key block out of a live prefix until it can be redacted;
 * never reveal one chunk and try to take it back in the next chunk. */
function redactStreamingDraft(raw: string, complete = false) {
  let end = raw.length;
  const starts = ['-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----',
    '-----BEGIN EC PRIVATE KEY-----', '-----BEGIN OPENSSH PRIVATE KEY-----'];
  for (const start of starts) {
    const index = raw.lastIndexOf(start);
    if (index >= 0 && !raw.includes(start.replace('BEGIN', 'END'), index + start.length)) end = Math.min(end, index);
    if (!complete) for (let length = 1; length < start.length; length++)
      if (raw.endsWith(start.slice(0, length))) end = Math.min(end, raw.length - length);
  }
  if (!complete) for (const pattern of [/\bsk-[A-Za-z0-9_-]*$/, /\bBearer\s+[A-Za-z0-9_.-]*$/i]) {
    const open = pattern.exec(raw);
    if (open) end = Math.min(end, open.index);
  }
  return redactCredentials(raw.slice(0, end)) + (complete && end < raw.length ? '[凭据已隐藏]' : '');
}
