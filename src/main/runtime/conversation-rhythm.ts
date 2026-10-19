/** One parent's own words can help before its necessary investigation ends.
 * This method changes when already-authored public content is shown; it does
 * not add a speaker, a model call, a progress agent or a second conversation. */
export const CONVERSATION_RHYTHM_GUIDANCE = `这是一段能边商量边继续的交流，不必让用户一直面对空白等到所有调查结束。需要工具或独立调查时，若眼前已有足够根据，先在本次assistant content里给一小段真正有用的理解、可开始的一步或已能回答的部分，然后才调用必要工具。它会直接显示给用户，后续调查继续进行；不要写“正在检索”、内部计划、工具名称或固定安慰句来占位。
先说的内容只依靠当前原话和已经取得的真实资料；尚未读到的经历不能说已经记起，尚未执行的动作不能说完成，旧状态不能冒充现在。如果眼前没有可诚实提供的帮助，直接读取，不强凑一段话。你无需在每次工具调用前发言，只在有新实质内容时接话。
工具和调查返回后，接着刚才已经对用户说过的话往前走，不把同一开头再讲一遍，也不逐项播报调查劳动。新材料改变了初步理解时自然说明哪里需要调整；先前的工作假设不是用户必须接受的结论。用户随时可以补充、换方向或停止，新的原话优先于旧调查目标。最终答复给出接下来的实质帮助，不把中间讨论和最后结果冒充已经完成的全部工作。`;

/** Transient prose of the same foreground reply. Only successful parent main
 * completions that will continue with tools enter here. Final candidates stay
 * behind the existing completion boundary until that boundary accepts them. */
export class ConversationRhythm {
  private readonly spoken: string[] = [];

  constructor(readonly enabled: boolean) {}

  offer(content: string): { changed: boolean; text: string } {
    if (!this.enabled || !content.trim()) return { changed: false, text: this.current() };
    const text = content.trim();
    if (this.spoken.at(-1) === text) return { changed: false, text: this.current() };
    this.spoken.push(text);
    return { changed: true, text: this.current() };
  }

  current() { return this.spoken.join('\n\n'); }

  /** Keep a real earlier contribution visible. If the final continuation
   * already includes that exact prefix, do not display it twice. There is no
   * paraphrase, semantic filtering or invented transition by the host. */
  finish(finalContent: string) {
    const before = this.current(), after = finalContent.trim();
    if (!before) return finalContent;
    if (!after) return before;
    if (after.startsWith(before)) return after;
    return before + '\n\n' + after;
  }
}
