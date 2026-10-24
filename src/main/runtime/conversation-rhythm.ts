import { redactCredentials } from './redaction';

/** One parent's own words can help before its necessary investigation ends.
 * This method changes when already-authored public content is shown; it does
 * not add a speaker, a model call, a progress agent or a second conversation. */
export const CONVERSATION_RHYTHM_GUIDANCE = `# 边做边说
去查之前、查到一部分之后，你写给对方的话都会沿同一条回复逐渐出现在他眼前。接过需要几步查阅或制作的事，先照自己的性格接住他的原话，再去做：此刻听懂的愿望、让你在意的困难、想替他分担的具体一点，都足够成为真实的接话。具体帮到什么份量、结果怎样，等相关资料读清再往下定。还没遇到的麻烦，等真的遇到再和他说当下的影响与继续的办法。简单的交流直接回应；他明确想安静等结果时，也照他的意思来。
工具回复里既有事情本身的发现，也有目录、参数和下一页的读法。找到这些读法通常只是手边准备，照着继续查就好。读到真实的新事实、需要实质改变判断，或有了能让对方作选择的进展时，再顺着刚才的话告诉他，把与他眼前处境有关的变化说清。手边还有几种可能时，带着暂时采用的理解往下查，等分清再说定。几件事一起查时，也照各自实际回来的结果理解，不用等到最后才把已有发现全倒出来。一份资料刚回来，只说明这一份有了着落；其他还在查的事情仍各自接着做。等待本身没有带来新发现时，留一点安静也很自然。新发现推翻了刚才的判断，就自然地改口，说清让你改主意的那处发现。
这些前段已经是这次回答的一部分，包括已经讲过的发现、数字、限制和明确没有做的事。同一项限制已经解释清楚，后面就沿着能继续的方向做；确实有了新的影响，再说变化的那一点。收尾接着完成还没讲到的问题，或把前面的发现带到眼下的选择里；换个说法重报一遍，仍是在重复。需要修正、作比较或回应他重新追问时，再取用相关细节，并把变化说清。画面里已有的整张表可以留给对方看，你仍可以指出最值得注意的地方。对方中途补一句或改了主意，就从那句话重新理解剩下的工作：已经办成的结果如实留下，尚在查的方向和正在写的末段跟着新的意思转过去。`;

/** IDs are drawn from the source-checked tool observations in this exact
 * outgoing foreground request. They describe delivery, never action success
 * or which findings the companion has already told the user. */
export interface ConversationContinuationInput { observationIds: readonly string[] }

/** Transient prose of the same foreground reply. A source-checked current
 * draft may be visible while generating. Successful tool turns enter spoken;
 * final acceptance still belongs to the original completion boundary. */
export class ConversationRhythm {
  private readonly spoken: string[] = [];
  private generation = 0;
  private draft?: { generation: number; raw: string; publication: string; observationIds?: string[] };
  private lastPublication = '';
  private continuationStart = 0;
  private readonly deliveredObservationIds = new Set<string>();
  private readonly observationsAfterLastContribution = new Set<string>();
  private readonly excludedObservationIds = new Set<string>();
  private readonly priorPublications: { messageId: string; state: 'superseded_tail'; exposure: 'unknown';
    publication: Omit<NonNullable<ReturnType<ConversationRhythm['continuationContext']>>, 'meaning'> }[] = [];

  constructor(readonly enabled: boolean) {}

  /** One actual foreground model request. A replay replaces its unfinished
   * draft; it never appends the old request's partial text a second time. */
  beginDraft() {
    const generation = ++this.generation;
    this.draft = { generation, raw: '', publication: this.lastPublication || this.current() };
    return generation;
  }

  appendDraft(generation: number, delta: string) {
    if (this.enabled && this.draft?.generation === generation) this.draft.raw += delta;
  }

  replaceDraft(generation: number, content: string) {
    if (this.draft?.generation !== generation) return;
    this.draft.raw = content;
    // The existing caller reaches this point only after the provider request
    // and its source checks have completed. A failed or cancelled request
    // cannot acknowledge observations merely by preparing its prompt.
    for (const id of this.draft.observationIds || []) {
      if (!this.deliveredObservationIds.has(id)) this.observationsAfterLastContribution.add(id);
      this.deliveredObservationIds.add(id);
    }
  }

  get hasDraft() { return this.draft !== undefined; }

  /** The caller admits the current scope/source proof immediately before
   * this projection. No provider completion or action success is implied. */
  previewDraft(generation: number, complete = false): { changed: boolean; text: string } {
    if (!this.enabled || this.draft?.generation !== generation) return { changed: false, text: this.currentPublication() };
    const visible = redactStreamingDraft(this.draft.raw, complete);
    // A held credential span or a replay of the accepted prefix contributes
    // no new public words. Compare the projection, not the provider's raw
    // candidate, so neither creates an empty progress pulse in the UI.
    if (!visible && !complete) return { changed: false, text: this.draft.publication };
    const text = !complete && this.partialProseReplay(visible) ? this.current() : this.finish(visible);
    const changed = text !== this.draft.publication;
    this.draft.publication = text;
    this.lastPublication = text;
    return { changed, text };
  }

  /** Reconcile to the provider's authoritative complete content only after
   * its original completion/source checks pass. This is still a tool-turn
   * contribution, not the final completion-review verdict. */
  commitDraft(generation: number, content: string) {
    if (this.draft?.generation !== generation) return { changed: false, text: this.currentPublication() };
    this.closeDraft();
    const offered = this.offer(redactStreamingDraft(content, true));
    // Empty tool turns and exact replays do not count as a new contribution.
    // Advancing this time boundary never claims every result was discussed.
    if (offered.changed) this.observationsAfterLastContribution.clear();
    return offered;
  }

  /** Failure text stays unfinished and outside the accepted spoken ledger.
   * Revoked sources discard the draft; an ordinary interruption may retain
   * only the safe prefix the user actually saw. */
  interruptDraft(discard: boolean) {
    const publication = this.draft?.publication || this.lastPublication;
    this.clearReviewPublications();
    this.closeDraft();
    return discard ? this.current() : publication || this.current();
  }

  acceptFinal() { this.closeDraft(); this.clearReviewPublications(); }

  invalidateSources() {
    this.excludeObservationContext();
    this.spoken.splice(0); this.closeDraft(); this.continuationStart = 0;
    this.clearReviewPublications();
  }

  /** A changed source must not be copied back as fresh conversational context.
   * Keep the actual publication intact; later source-checked words may follow. */
  discardContinuationContext() {
    this.excludeObservationContext();
    this.continuationStart = Array.from(this.current()).length;
    this.closeDraft();
    this.clearReviewPublications();
  }

  /** Preserve only the safe, actually published candidate before a repair
   * replaces it. A review verdict or an unshown provider tail is not evidence. */
  captureReviewPublication(messageId: string) {
    const context = this.continuationContext();
    if (!context?.replaceableTail) return;
    // The stable prefix remains in reply. Only this replaced tail needs its
    // earlier identity; it cannot stand in for the current readable answer.
    const publication = { replaceableTail: context.replaceableTail };
    this.priorPublications.push({ messageId, state: 'superseded_tail', exposure: 'unknown', publication });
    this.priorPublications.splice(0, Math.max(0, this.priorPublications.length - 2));
  }

  reviewPublications(messageId: string) {
    return structuredClone(this.priorPublications.filter(publication => publication.messageId === messageId));
  }

  clearReviewPublications() { this.priorPublications.splice(0); }

  /** Every existing stop/revision/acceptance boundary retires its generation.
   * Late stream chunks and completions keep their old token and cannot become
   * the draft of a later provider request. The caller still owns source proof. */
  private closeDraft() {
    this.generation++;
    this.draft = undefined;
    this.lastPublication = '';
  }

  private currentPublication() { return this.draft?.publication ?? this.current(); }

  /** A replayed tail sentence may arrive over several chunks. Keep its exact
   * unfinished prefix out of the bubble until it either matches fully or
   * diverges into new prose. This holds words, never invents progress, and is
   * used only for an unfinished preview, not an authoritative final answer. */
  private partialProseReplay(content: string) {
    const before = this.current();
    if (!plainProse(before)) return false;
    for (const boundary of before.matchAll(proseBoundary())) {
      const overlap = before.slice(boundary.index! + boundary[0].length);
      if (overlap.length > content.length && plainProse(overlap) && overlap.startsWith(content)) return true;
    }
    return false;
  }

  /** The parent's current reply, not another history or a claim of being seen.
   * A bounded excerpt stays bounded even after native transcript compression. */
  continuationContext(input?: ConversationContinuationInput) {
    if (!this.enabled) return;
    const observationIds = input ? [...new Set(input.observationIds)].filter(id =>
      typeof id === 'string' && id.trim() && !this.excludedObservationIds.has(id)) : [];
    if (input && this.draft) this.draft.observationIds = observationIds;
    const prefix = this.current();
    const excerpt = (text: string, floor = 0) => {
      const points = Array.from(text), end = points.length;
      if (end <= floor) return;
      const start = Math.max(floor, end - 2400);
      return { text: points.slice(start).join(''), start, end, totalCharacters: end,
        coverage: start === 0 ? 'complete' as const : 'partial' as const };
    };
    const publishedPrefix = excerpt(prefix, this.continuationStart);
    const replaceableTail = this.lastPublication ? excerpt(this.lastPublication.slice(prefix.length)) : undefined;
    const newlyAvailableIds = observationIds.filter(id => !this.deliveredObservationIds.has(id));
    const sinceLastContributionIds = [...new Set([...this.observationsAfterLastContribution, ...newlyAvailableIds])]
      .filter(id => observationIds.includes(id));
    const boundedIds = (ids: string[]) => ({ ids: ids.slice(-24), ...(ids.length > 24 ? { omitted: ids.length - 24 } : {}) });
    const observations = sinceLastContributionIds.length ? {
      newlyAvailable: boundedIds(newlyAvailableIds),
      sinceLastContribution: boundedIds(sinceLastContributionIds),
      meaning: '这里标出了刚放到手边的工具回复，以及最近一次接话后带来的资料，原文仍在各自的工具回复中。目录、参数、翻页和找到读法通常是手边准备，直接用来继续做。真实的新事实、实质改变的判断，或能让对方作选择的进展，才值得接着告诉他。已经说清的限制留在前段，后面沿能继续的方向做；其他还在查的事情，等各自的结果回来再接着判断。',
    } : undefined;
    // The first request needs the same near-at-hand speaking context as later
    // requests. Requiring existing prose left every request in a silent
    // tool sequence without this near-at-hand speaking context.
    const opening = !!input && !prefix && !this.lastPublication;
    if (!publishedPrefix && !replaceableTail && !observations && !opening) return;
    const continuation = publishedPrefix
      ? '这里的前段已经是这条回复的正文，里面讲过的发现、数字、限制与关心都已留下。接下来完成还没回应的部分，或说新发现怎样改变眼前的判断；前段的整份结果不必在尾段重新报一次。需要纠正哪一处，就直接接着那一处改准。'
      : opening
        ? '这条回复还没有留下写给对方的话。若眼前需要几步查阅或制作，先把你刚听懂、想接住的那一点写给他，再去用工具；结果还没回来，也可以先回应他此刻的愿望和为难。还没遇到的麻烦，留到真的出现时再说它的影响和继续办法。对方这次想安静等时，就照他的意思来。具体帮助怎样展开，沿刚读到的资料与仍适用的旧约定来定。'
        : '这还是你正在写的同一条回复，可以沿当前原话和刚读到的资料继续。';
    const revision = replaceableTail
      ? '旧末段曾短暂显示过，现在会被你的这次新稿换掉。旧稿里仍妥当、对方仍需要的内容可以留在新稿里；如果判断变了，也可以自然交代让你改主意的发现。'
      : '';
    return { ...(publishedPrefix ? { publishedPrefix } : {}), ...(replaceableTail ? { replaceableTail } : {}),
      ...(observations ? { observations } : {}),
      meaning: continuation + revision + (publishedPrefix || replaceableTail
        ? '这里截取了最近实际显示过的文字，较早的部分可能没有带来；显示过也还不知道对方已经读到了哪里。' : '')
        + '具体怎样接话，仍由你结合自己的性格和眼前的交流决定。' };
  }

  private excludeObservationContext() {
    for (const id of [...this.deliveredObservationIds, ...(this.draft?.observationIds || [])]) this.excludedObservationIds.add(id);
    this.deliveredObservationIds.clear();
    this.observationsAfterLastContribution.clear();
    if (this.draft) this.draft.observationIds = undefined;
  }

  offer(content: string): { changed: boolean; text: string } {
    if (!this.enabled || !content.trim()) return { changed: false, text: this.current() };
    const text = redactStreamingDraft(content, true);
    const before = this.current(), combined = this.finish(text);
    if (combined === before) return { changed: false, text: before };
    // Preview and commit use the same exact reconciliation. A model that
    // resumes with its earlier prefix must not duplicate it at commit time.
    this.spoken.splice(0, this.spoken.length, combined);
    return { changed: true, text: this.current() };
  }

  current() { return this.spoken.join('\n\n'); }

  /** Published tool-turn prose is a stable prefix. Reconcile only an exact
   * prefix or complete prose at the join; never reorder earlier words or
   * search inside a candidate for matching formulas, quotes or code. */
  finish(finalContent: string) {
    const safeFinal = redactStreamingDraft(finalContent, true);
    const before = this.current(), after = safeFinal;
    if (!before) return safeFinal;
    if (!after.trim()) return before;
    if (after.startsWith(before)) return after;
    if (before.startsWith(after)) return before;
    // A final candidate can repeat its opening sentence, then diverge after
    // an intervening tool-turn finding. Keep that finding in place and omit
    // only the exact repeated prose opening. Structured material is excluded:
    // a repeated equation, list heading or code block may be intentional.
    const boundaries = () => plainProse(before) ? proseBoundary() : /\n\s*\n/g;
    let repeatedOpening = 0;
    for (const boundary of before.matchAll(boundaries())) {
      const end = boundary.index! + boundary[0].length;
      const opening = before.slice(0, end);
      if (!after.startsWith(before.slice(0, end)) || !plainProse(opening)) break;
      repeatedOpening = end;
    }
    if (repeatedOpening) return before + '\n\n' + after.slice(repeatedOpening);
    for (const boundary of before.matchAll(boundaries())) {
      const start = boundary.index! + boundary[0].length;
      const overlap = before.slice(start);
      if (plainProse(overlap) && after.startsWith(overlap)) return before + after.slice(overlap.length);
    }
    return before + '\n\n' + after;
  }
}

function plainProse(text: string) {
  const trimmed = text.trim();
  return Array.from(trimmed).length >= 8 && /[。！？.!?…][”’"']?$/.test(trimmed)
    && !trimmed.replace(/\r?\n[ \t]*\r?\n/g, '').includes('\n')
    && !/(?:^|\n)[ \t]*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)|[`$“”‘’「」『』"'=≠≤≥∑∫√+*/^<>×÷]|~~~|\\(?:begin|\[|\()/.test(text);
}

/** Dots inside a number or identifier are not sentence boundaries. A prose
 * replay is removed only from the candidate's start, at a complete sentence
 * already present at the prefix or join; no fuzzy or semantic deletion. */
function proseBoundary() { return /[。！？!?…][ \t]*|\.(?=\s|$)[ \t]*|\n[ \t]*\n/g; }

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
  if (!complete) for (const pattern of [/\bsk-[A-Za-z0-9_-]*$/, /\bBearer[ \t]+[A-Za-z0-9._~+/-]*=*$/i,
    /(?:password|密码)["']?[ \t]*[:：=][ \t]*["']?[^\s"']*$/i,
    /(?:password|密码)["']?[ \t]*(?:[:：=]|是|为|\bis\b)[ \t]*(?:"(?:\\(?:[\s\S]|$)|[^"\\])*|'(?:\\(?:[\s\S]|$)|[^'\\])*|“[^”]*|‘[^’]*|[^\s"'“”‘’\u0080-\uFFFF]*)$/i]) {
    const open = pattern.exec(raw);
    if (open) end = Math.min(end, open.index);
  }
  return redactCredentials(raw.slice(0, end)) + (complete && end < raw.length ? '[凭据已隐藏]' : '');
}
