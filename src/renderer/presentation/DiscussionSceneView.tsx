import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { discussionArtworkLabel, type DiscussionArtwork, type DiscussionPoint, type DiscussionScene } from '../../shared/discussion-scene';
import type { SemanticSelection } from '../../shared/scenes';
import { CompanionSessionView } from './CompanionSessionView';
import type { CompanionFollowupReference } from '../../shared/companion-source';
import type { LocalSearchLocator } from '../../shared/search';
import bridgeArt from '../../../前端视觉创新设计/精选图稿/C-交互基因/R172-校园桥夜景.png';
import lampArt from '../../../前端视觉创新设计/精选图稿/C-交互基因/R176-雨夜伞下人影.png';
import { RichText } from '../RichText';
import './discussion-scene.css';
import { writeSceneFrameTransfer } from '../../shared/scene-transfer';

export interface DiscussionSceneViewProps {
  scene: DiscussionScene;
  selection?: SemanticSelection | null;
  onSelect: (selection: SemanticSelection) => void;
  onContinue?: (text: string, companionReference?: CompanionFollowupReference) => void;
  hideBranches?: boolean;
  boundaryKey?: string;
  onOpenDocument?: (locator: Extract<LocalSearchLocator, { kind: 'material' }>) => void;
  manuscriptText?: string;
}

/** The manuscript follows one matter. Local focus only points the next
 * utterance at a line; all decisions remain in the original host workflow. */
export function DiscussionSceneView({ scene, selection, onSelect, onContinue, hideBranches = false, boundaryKey, onOpenDocument, manuscriptText }: DiscussionSceneViewProps) {
  const selected = selection?.sceneId === scene.id && selection.sceneRevision === scene.revision ? selection : null;
  const conditions = scene.points.filter(point => point.role === 'condition');
  const thought = scene.points.find(point => point.role === 'thought');
  const open = scene.points.find(point => point.role === 'open_question');
  const next = scene.points.find(point => point.role === 'next_step');
  const showNext = next && (!scene.history || scene.history.currentStatus === 'active')
    && !scene.coWork.some(work => work.state !== 'active' || work.nextStep === next.text || work.returnPoint === next.text);
  const anchor = scene.points.find(point => point.role === 'anchor');
  const selectedPoint = selected?.kind === 'discussion_point' ? scene.points.find(point => point.id === selected.pointId) : undefined;
  const visibleConditions = selectedPoint?.role === 'condition'
    ? [selectedPoint, ...conditions.filter(point => point.id !== selectedPoint.id)].slice(0, 2) : conditions.slice(0, 2);
  const sourcePoints = scene.points.filter(point => point.source);
  const primaryArt = manuscriptText ? scene.artwork[0] : undefined;
  const pointSelection = (point: DiscussionPoint) => onSelect({ sceneId: scene.id, sceneRevision: scene.revision,
    kind: 'discussion_point', pointId: point.id });
  const isPointSelected = (point: DiscussionPoint) => selected?.kind === 'discussion_point' && selected.pointId === point.id;
  const artworkFrame = (art: DiscussionArtwork, className: string) => {
    const reference: SemanticSelection = { sceneId: scene.id, sceneRevision: scene.revision, kind: 'discussion_artwork', artwork: art };
    const active = selected?.kind === 'discussion_artwork' && selected.artwork?.assetId === art.assetId && selected.artwork.optionId === art.optionId;
    return <button type="button" key={`${art.assetId}:${art.optionId || ''}`} className={`discussion-artwork-frame ${className}`}
      aria-label={`把「${discussionArtworkLabel(art.assetId)}」拿到这句话旁`} aria-pressed={active} draggable
      onDragStart={event => { event.stopPropagation(); writeSceneFrameTransfer(event.dataTransfer, { version: 1, sessionId: scene.sessionId, selection: reference }); }}
      onClick={() => onSelect(reference)}><img src={art.assetId === 'night_bridge' ? bridgeArt : lampArt} alt={discussionArtworkLabel(art.assetId)} draggable={false} /></button>;
  };

  return <section className={`discussion-paper ${scene.coWork.length && !scene.branches.length ? 'is-continuation' : ''}`} aria-label={`一起商量：${scene.matter.question}`}>
    <header className="discussion-paper-heading">
      <h3>{scene.matter.question}</h3>
      {visibleConditions.length > 0 && <div className="discussion-marginalia">
        {visibleConditions.map(point => <button type="button" key={point.id} onClick={() => pointSelection(point)}
          className="discussion-condition" aria-pressed={isPointSelected(point)}>{point.text}</button>)}
      </div>}
    </header>
    {manuscriptText && <div className="discussion-main-manuscript">
      {primaryArt && artworkFrame(primaryArt, 'discussion-main-art')}
      <RichText text={manuscriptText} />
    </div>}
    {!hideBranches && scene.branches.length > 0 && <div className="discussion-manuscripts" aria-label="接着想的几种可能">
      {scene.branches.map(branch => {
        const focused = selected?.kind === 'discussion_option' && selected.optionId === branch.id;
        const repeatedInManuscript = !!(manuscriptText && branch.rationale
          && scene.provenance.optionRefs.some(ref => ref.id === branch.id && ref.revision === branch.revision)
          && manuscriptText.replace(/\s/gu, '').includes(branch.rationale.replace(/\s/gu, '')));
        return <article className="discussion-manuscript" key={branch.id} data-selected={focused || selected?.kind === 'discussion_artwork' && selected.artwork?.optionId === branch.id || undefined}
          data-in-manuscript={repeatedInManuscript || undefined}
          data-changed={scene.continuity.changedOptionIds.includes(branch.id) || undefined}>
          {scene.artwork.filter(art => art.optionId === branch.id && art !== primaryArt).map(art => artworkFrame(art, 'discussion-story-art'))}
          <button type="button" className="discussion-manuscript-copy" aria-pressed={focused}
          onClick={() => onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'discussion_option', optionId: branch.id })}>
          <span className="discussion-manuscript-title">{branch.title}</span>
          {branch.selected && <span className="discussion-chosen">{scene.history ? '当时选的这一版' : '你选的这一版'}</span>}
          {branch.rationale && !repeatedInManuscript && <span className="discussion-manuscript-text">{branch.rationale}</span>}
          <ArrowUpRight className="discussion-manuscript-arrow" size={16} aria-hidden="true" />
          </button>
        </article>;
      })}
    </div>}
    {scene.artwork.filter(art => !art.optionId && art !== primaryArt).map(art => artworkFrame(art, 'discussion-story-lead'))}
    {open && <button type="button" className="discussion-open-question" onClick={() => pointSelection(open)} aria-pressed={isPointSelected(open)}>
      {open.text}
    </button>}
    {next && showNext && <button type="button" className="discussion-next-line" onClick={() => pointSelection(next)} aria-pressed={isPointSelected(next)}>
      <span>{next.text}</span><ArrowUpRight size={17} aria-hidden="true" />
    </button>}
    {scene.coWork.map(projection => <CompanionSessionView key={projection.id} projection={projection}
      boundaryKey={boundaryKey} onOpenDocument={onOpenDocument}
      onContinue={(text, _projection, reference) => onContinue?.(text, reference)} disabled={!onContinue} />)}
    {thought && <details className="discussion-working-note"><summary>还有一个想法<ChevronDown size={13} aria-hidden="true" /></summary>
      <button type="button" className="discussion-thought" onClick={() => pointSelection(thought)} aria-pressed={isPointSelected(thought)}>{thought.text}</button>
    </details>}
    {sourcePoints.length > 0 && <details className="discussion-originals">
      <summary>说过的话<ChevronDown size={13} aria-hidden="true" /></summary>
      <div className="discussion-original-passages">
        {sourcePoints.map(point => <button type="button" key={point.id} onClick={() => pointSelection(point)} aria-pressed={isPointSelected(point)}>
          <blockquote>{point.source!.quote}</blockquote>
        </button>)}
      </div>
    </details>}
    {!scene.branches.length && !thought && !open && !next && !scene.coWork.length && anchor
      && <button type="button" className="discussion-unfolded-quote" onClick={() => pointSelection(anchor)} aria-pressed={isPointSelected(anchor)}>{anchor.text}</button>}
  </section>;
}
