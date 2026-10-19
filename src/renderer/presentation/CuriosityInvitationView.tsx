import { useContext, useId, useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import type { CuriosityInvitationView as CuriosityView } from '../../shared/curiosity-invitation';
import { RichText } from '../RichText';
import { LocalTextFocus, type LocalTextRange } from '../LocalTextFocus';
import type { CuriosityFocus, CuriosityChapterAddress } from '../../shared/curiosity-source';
import { ConversationTextFocusContext } from '../ConversationTextFocus';
import './curiosity-invitation.css';

export interface CuriosityInvitationViewProps {
  view: CuriosityView;
  /** Normal composer text only. The parent keeps the exact owner/scene address
   * alongside it; clicking does not write, accept or send anything by itself. */
  onContinue?: (text: string, focus?: CuriosityFocus, focusLabel?: string) => void;
  disabled?: boolean;
  chapter?: CuriosityChapterAddress;
}

const request = (view: CuriosityView, intent: CuriosityView['choices'][number]['intent']) =>
  intent === 'continue' ? `想接着「${view.title}」一起玩。`
    : intent === 'another' ? `这次想换个新东西，先放下「${view.title}」这一段。`
      : `今天先放下「${view.title}」这一段。`;
const readTime = (value: string) => new Date(value).toLocaleString('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** One prepared experience, inside the original conversation. The content
 * comes first; there is no interest picker, recommendation feed or task state. */
export function CuriosityInvitationView({ view, onContinue, disabled = false, chapter }: CuriosityInvitationViewProps) {
  const headingId = useId(), [failedLink, setFailedLink] = useState<string | null>(null);
  const closed = !['offered', 'playing'].includes(view.status);
  const currentFocus = useContext(ConversationTextFocusContext)?.curiosityReference;
  const matchingFocus = currentFocus?.id === view.id && currentFocus.revision === view.revision
    && currentFocus.matterId === view.matterId && currentFocus.matterRevision === view.matterRevision
    && (chapter ? currentFocus.chapter?.messageId === chapter.messageId && currentFocus.chapter.sceneId === chapter.sceneId
      && currentFocus.chapter.sceneRevision === chapter.sceneRevision : !currentFocus.chapter) ? currentFocus.focus : undefined;
  const canFocus = !closed || !!chapter && view.status === 'historical' && view.origin === 'created';
  const focus = (field: CuriosityFocus['field'], range: LocalTextRange) =>
    onContinue?.('', { field, start: range.start, end: range.end }, range.preview);
  const paper = <article className="curiosity-paper" key={`${view.id}:${view.revision}`} data-origin={view.origin}>
      <header className="curiosity-heading">
        <span className="curiosity-origin">{view.originLabel}</span>
        <h3 id={headingId}>{view.title}</h3>
      </header>
      <LocalTextFocus source={view.experience} label="这段内容" disabled={disabled || !onContinue || !canFocus}
        activeRange={matchingFocus?.field === 'experience' ? matchingFocus : undefined}
        onFocus={range => focus('experience', range)}><div className="curiosity-story"><RichText text={view.experience} publicSurface sourceFocus /></div></LocalTextFocus>
      <LocalTextFocus source={view.firstMove} label="这一点" disabled={disabled || !onContinue || !canFocus}
        activeRange={matchingFocus?.field === 'firstMove' ? matchingFocus : undefined}
        onFocus={range => focus('firstMove', range)}><p className="curiosity-first-move">{view.firstMove}</p></LocalTextFocus>
      {view.publicSources.length > 0 && <details className="curiosity-sources">
        <summary>从哪里来的<ChevronDown size={13} aria-hidden="true" /></summary>
        <div className="curiosity-source-passages">
          {view.publicSources.map(source => <div key={`${source.observationId}:${source.quote}`} className="curiosity-source">
            <a href={source.url} onClick={event => {
              event.preventDefault(); setFailedLink(null);
              void window.zaichang.openLink(source.url).catch(() => setFailedLink(source.url));
            }}>{source.title}<ArrowUpRight size={13} aria-hidden="true" /></a>
            <span className="curiosity-source-url">{source.url}</span>
            <time dateTime={source.fetchedAt} title={source.fetchedAt}>{readTime(source.fetchedAt)}读到</time>
            <blockquote>{source.quote}</blockquote>
            {failedLink === source.url && <p role="status" className="curiosity-link-error">链接暂时没有打开</p>}
          </div>)}
        </div>
      </details>}
      {view.choices.length > 0 && <footer className="curiosity-actions">
        {view.choices.map(choice => <button type="button" key={choice.intent}
          className={choice.intent === 'continue' ? 'curiosity-continue' : undefined}
          disabled={disabled || !onContinue} onClick={() => onContinue?.(request(view, choice.intent))}>
          {choice.label}{choice.intent === 'continue' && <ArrowUpRight size={15} aria-hidden="true" />}
        </button>)}
      </footer>}
    </article>;
  return <section className="curiosity-invitation" aria-label={view.title}
    data-curiosity-id={view.id} data-curiosity-state={view.status}>
    {closed ? <details className="curiosity-kept">
      <summary><span>{view.status === 'put_aside' ? '今天先留在这里' : view.status === 'replaced' ? '换过的那一段' : '那次带来的小东西'}<span>{view.title}</span></span><ChevronDown size={15} aria-hidden="true" /></summary>
      <div className="curiosity-kept-body">
        <LocalTextFocus source={view.opening} label="开头" disabled={disabled || !onContinue || !canFocus}
          activeRange={matchingFocus?.field === 'opening' ? matchingFocus : undefined}
          onFocus={range => focus('opening', range)}><p className="curiosity-opening">{view.opening}</p></LocalTextFocus>
        {paper}
      </div>
      {chapter && view.status === 'historical' && view.origin === 'created' && onContinue && <button type="button" className="curiosity-history-open"
        disabled={disabled} onClick={() => onContinue('想从这一章接着写。')}>从这一章接着写<ArrowUpRight size={14} aria-hidden="true" /></button>}
    </details> : <><LocalTextFocus source={view.opening} label="开头" disabled={disabled || !onContinue}
      activeRange={matchingFocus?.field === 'opening' ? matchingFocus : undefined}
      onFocus={range => focus('opening', range)}><p className="curiosity-opening">{view.opening}</p></LocalTextFocus>{paper}</>}
  </section>;
}
