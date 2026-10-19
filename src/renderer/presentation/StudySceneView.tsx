import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Bookmark, ChevronDown, LoaderCircle, MoreHorizontal, RefreshCw, X } from 'lucide-react';
import type { Bridge } from '../../shared/types';
import type { MaterialPage } from '../../shared/materials';
import { studyExplorationFollowup, studyFollowup, type StudyFocusRef, type StudyFocusTarget, type StudyHistoryReference,
  type StudyInteraction, type StudyScene } from '../../shared/study-presentation';
import { RichText } from '../RichText';
import { ReadableFocus } from '../LocalTextFocus';
import { ConversationComposerDockContext, StudyComposerSlot } from '../ConversationComposerDock';
import { ExplorableStudyView } from './ExplorableStudyView';
import type { ExplorableStudyValues } from '../../shared/explorable-study';
import { uiError } from '../ui';
import './study-scene.css';

type Followup = { text: string; studyInteraction: StudyInteraction; focusLabel?: string };
export interface StudySceneViewProps {
  scene: StudyScene | StudyHistoryReference;
  sessionId: string;
  messageId?: string;
  boundaryKey: string;
  onFollowup: (value: Followup) => void | Promise<void>;
  api?: Pick<Bridge, 'studyProject' | 'studyRead' | 'materialsRead'>;
  onOpenMaterial?: (value: { resourceId: string; page?: number }) => void | Promise<void>;
  disabled?: boolean;
}

/** Only a current owner response enters the paper. A history reference, a
 * prior render or an old reply never acts as a material/source permission. */
export function StudySceneView({ scene, sessionId, messageId, boundaryKey, onFollowup,
  api = window.zaichang, onOpenMaterial, disabled = false }: StudySceneViewProps) {
  const headingId = useId(), originalId = useId();
  const root = useRef<HTMLElement>(null);
  const workRow = useRef<HTMLDivElement>(null), writtenLine = useRef<HTMLDivElement>(null), marginNote = useRef<HTMLElement>(null);
  const manuscript = useRef<HTMLDivElement>(null), question = useRef<HTMLDivElement>(null);
  const paperScroll = useRef<{ owner: string; manuscript: number; atEnd: boolean; question: number } | undefined>(undefined);
  const generation = useRef(0), materialGeneration = useRef(0);
  const lastShown = useRef<{ owner: string; help?: string; attempt?: string } | undefined>(undefined);
  const ownerKey = `${sessionId}:${scene.owner.id}`;
  const requestKey = `${ownerKey}@${scene.owner.revision}:${messageId || ''}:${boundaryKey}`;
  const liveKey = useRef(requestKey); liveKey.current = requestKey;
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; scene: StudyScene }>();
  const [writingAddress, setWritingAddress] = useState<{ key: string; focus: StudyFocusRef }>();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false), [sourcePending, setSourcePending] = useState(false);
  const [source, setSource] = useState<MaterialPage>(), [sourceError, setSourceError] = useState('');
  const [shellHeight, setShellHeight] = useState(0), [reveal, setReveal] = useState({ initial: true, help: false, attempt: false });
  const [pencilLink, setPencilLink] = useState<{ width: number; height: number; path: string; x: number; y: number }>();
  const current = loaded?.key === requestKey ? loaded.scene : undefined;
  const referenced = useContext(ConversationComposerDockContext)?.referenceFocus;
  const referencedPart = current && referenced?.studyId === current.owner.id && referenced.studyRevision === current.owner.revision
    ? referenced.target : undefined;
  const writingFocus = writingAddress?.key === requestKey ? writingAddress.focus : undefined;

  const refresh = useCallback(async (options: { focus?: StudyFocusTarget; historyOffset?: number; historyLimit?: number } = {}) => {
    const turn = ++generation.current, key = requestKey;
    const papers = root.current?.querySelector<HTMLElement>('.study-desk-papers');
    if (papers && !papers.classList.contains('is-waiting')) setShellHeight(papers.getBoundingClientRect().height);
    if (manuscript.current || question.current) paperScroll.current = { owner: ownerKey,
      manuscript: manuscript.current?.scrollTop || 0,
      atEnd: !manuscript.current || manuscript.current.scrollHeight - manuscript.current.clientHeight - manuscript.current.scrollTop < 20,
      question: question.current?.scrollTop || 0 };
    materialGeneration.current++; setSource(undefined); setSourceOpen(false); setSourcePending(false); setSourceError('');
    setLoaded(undefined); setPending(true); setError('');
    try {
      const next = await api.studyProject({ sessionId, messageId, studyId: scene.owner.id,
        studyRevision: scene.owner.revision, historyLimit: 8, ...options });
      if (generation.current !== turn || liveKey.current !== key) return;
      const prior = lastShown.current;
      setReveal({ initial: !prior || prior.owner !== ownerKey,
        help: !prior || prior.owner !== ownerKey || prior.help !== next.help?.id,
        attempt: !prior || prior.owner !== ownerKey || prior.attempt !== next.learnerAttempt?.id });
      lastShown.current = { owner: ownerKey, help: next.help?.id, attempt: next.learnerAttempt?.id };
      setWritingAddress(next.status === 'closed' ? undefined : { key, focus: {
        sceneId: next.id, sceneRevision: next.revision, studyId: next.owner.id, studyRevision: next.owner.revision,
        target: next.nextMove.stepId ? { kind: 'next', stepId: next.nextMove.stepId } : { kind: 'next' },
      } });
      setLoaded({ key, scene: next }); return next;
    } catch (problem) {
      if (generation.current === turn && liveKey.current === key) { setWritingAddress(undefined); setError(uiError(problem)); }
    } finally { if (generation.current === turn && liveKey.current === key) setPending(false); }
  }, [api, requestKey, ownerKey, sessionId, messageId, scene.owner.id, scene.owner.revision]);

  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '80px' });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // This also runs on privacy/source boundary changes, with no old body
    // left on screen while the original source is being opened again.
    generation.current++; materialGeneration.current++;
    setLoaded(undefined); setSource(undefined); setSourceOpen(false); setError(''); setSourceError('');
    if (visible) void refresh();
    return () => { generation.current++; materialGeneration.current++; };
  }, [refresh, visible]);

  useLayoutEffect(() => {
    if (!current) return;
    const kept = paperScroll.current?.owner === ownerKey ? paperScroll.current : undefined;
    if (question.current && kept) question.current.scrollTop = kept.question;
    if (manuscript.current) manuscript.current.scrollTop = !kept || kept.atEnd && reveal.attempt
      ? manuscript.current.scrollHeight : kept.manuscript;
  }, [current?.owner.revision, current?.learnerAttempt?.id, current?.help?.id, ownerKey, reveal.attempt]);

  useLayoutEffect(() => {
    // A material reader can preserve a standalone equation with inline TeX
    // delimiters. Give that original equation its own reading scale without
    // rewriting the material or enlarging mathematics inside ordinary prose.
    for (const paragraph of question.current?.querySelectorAll('p') || []) {
      const content = [...paragraph.childNodes].filter(node => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim());
      paragraph.classList.toggle('study-core-formula', content.length === 1
        && content[0] instanceof HTMLElement && content[0].classList.contains('katex'));
    }
  }, [current?.problem.text, source?.text, sourceOpen]);

  useLayoutEffect(() => {
    const row = workRow.current, attempt = writtenLine.current, note = marginNote.current;
    if (!row || !attempt || !note || !current?.help || !current.learnerAttempt) { setPencilLink(undefined); return; }
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const formula = attempt.querySelector<HTMLElement>('.katex') || attempt.querySelector<HTMLElement>('p') || attempt;
      const frame = row.getBoundingClientRect(), line = formula.getBoundingClientRect();
      if (!frame.width || !frame.height) return;
      const clip = manuscript.current?.getBoundingClientRect();
      if (clip && (line.bottom < clip.top || line.top > clip.bottom)) { setPencilLink(undefined); return; }
      // The margin follows the current real line on a two-column paper. Its
      // position is layout only; it never invents a quote or a learner step.
      const sideBySide = getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length > 1;
      const noteOffset = sideBySide ? Math.max(9, line.top - frame.top - 6) : 0;
      row.style.setProperty('--study-note-offset', `${noteOffset}px`);
      const aside = note.getBoundingClientRect();
      const below = aside.top >= line.bottom - 2;
      const start = below ? { x: line.left - frame.left + Math.min(line.width * .7, line.width - 12), y: Math.min(line.bottom, clip?.bottom || line.bottom) - frame.top + 3 }
        : { x: line.right - frame.left + 3, y: line.top - frame.top + Math.min(line.height * .6, 30) };
      const end = below ? { x: aside.left - frame.left + 23, y: aside.top - frame.top - 5 }
        : { x: aside.left - frame.left - 5, y: aside.top - frame.top + 26 };
      const path = below ? `M ${start.x} ${start.y} C ${start.x} ${start.y + 20}, ${end.x - 20} ${end.y - 18}, ${end.x} ${end.y}`
        : `M ${start.x} ${start.y} C ${start.x + 17} ${start.y - 17}, ${end.x - 16} ${end.y - 8}, ${end.x} ${end.y}`;
      setPencilLink({ width: frame.width, height: frame.height, path, x: start.x, y: start.y });
    };
    const observer = new ResizeObserver(measure); observer.observe(row); observer.observe(attempt); observer.observe(note);
    attempt.addEventListener('animationend', measure); note.addEventListener('animationend', measure);
    const paper = manuscript.current; paper?.addEventListener('scroll', measure, { passive: true });
    measure(); void document.fonts.ready.then(measure);
    return () => { alive = false; observer.disconnect(); attempt.removeEventListener('animationend', measure); note.removeEventListener('animationend', measure); paper?.removeEventListener('scroll', measure); };
  }, [current?.owner.revision, current?.help?.id, current?.learnerAttempt?.id, requestKey]);

  const sameVisibleStep = (before: StudyScene, next: StudyScene) => before.owner.revision === next.owner.revision
    && before.mode === next.mode && before.help?.id === next.help?.id;

  const act = async (actionId: StudyScene['actions'][number]['id']) => {
    if (!current || pending || disabled) return;
    const before = current, key = requestKey, next = await refresh();
    if (!next || key !== liveKey.current || !sameVisibleStep(before, next)) return;
    setPending(true);
    try { await onFollowup(studyFollowup(next, actionId)); }
    catch (problem) { if (liveKey.current === key) setError(uiError(problem)); }
    finally { if (liveKey.current === key) setPending(false); }
  };

  const referencePart = async (target: StudyFocusTarget) => {
    if (!current || pending || disabled) return;
    const before = current, key = requestKey, turn = generation.current;
    let cleared = false;
    setPending(true);
    try {
      // Reopen via the original message address. Its authorized old Scene can
      // project a newer owner; that newer revision is not a stored message ref.
      // Compare the returned current owner before carrying this actual point.
      const next = await api.studyProject({ sessionId, messageId, studyId: scene.owner.id,
        studyRevision: scene.owner.revision, historyLimit: 8 });
      if (key !== liveKey.current || generation.current !== turn) return;
      if (!sameVisibleStep(before, next)
        || target.kind === 'attempt' && !next.learnerLines.some(line => line.id === target.attemptId)
        || target.kind === 'help' && next.help?.id !== target.stepId) { await refresh(); return; }
      await onFollowup({ text: '', focusLabel: target.kind === 'attempt' ? '我写的这一行'
      : target.kind === 'help' ? '眼前这段提示' : target.kind === 'problem' ? '这道原题' : '接着这一处',
      studyInteraction: { kind: 'reference', focus: {
      sceneId: next.id, sceneRevision: next.revision, studyId: next.owner.id, studyRevision: next.owner.revision, target,
    } } }); }
    catch (problem) { if (liveKey.current === key && generation.current === turn) {
      generation.current++; materialGeneration.current++;
      cleared = true;
      setLoaded(undefined); setWritingAddress(undefined); setSource(undefined); setSourceOpen(false); setSourcePending(false);
      setError(uiError(problem));
    } }
    finally { if (liveKey.current === key && (generation.current === turn || cleared)) setPending(false); }
  };

  const park = async () => {
    if (!current || pending || disabled) return;
    const before = current, key = requestKey, next = await refresh();
    if (!next || key !== liveKey.current || !sameVisibleStep(before, next)) return;
    const target: StudyFocusTarget = next.nextMove.stepId ? { kind: 'next', stepId: next.nextMove.stepId } : { kind: 'next' };
    setPending(true);
    try { await onFollowup({ text: '今天先到这里，帮我留着从这一处接下去。', studyInteraction: { kind: 'reference',
      focus: { sceneId: next.id, sceneRevision: next.revision, studyId: next.owner.id, studyRevision: next.owner.revision, target } } }); }
    catch (problem) { if (liveKey.current === key) setError(uiError(problem)); }
    finally { if (liveKey.current === key) setPending(false); }
  };

  const continueExploration = async (values: ExplorableStudyValues) => {
    if (!current?.help?.exploration || pending || disabled || current.status === 'closed') return;
    const before = current, key = requestKey, turn = generation.current;
    let cleared = false;
    setPending(true);
    try {
      // The current graph and local condition stay put while this exact
      // teaching step is reopened. The original message authorizes the read;
      // its stored address may precede the current owner being compared here.
      const next = await api.studyProject({ sessionId, messageId, studyId: scene.owner.id,
        studyRevision: scene.owner.revision, historyLimit: 8 });
      if (key !== liveKey.current || generation.current !== turn) return;
      if (!sameVisibleStep(before, next)) { await refresh(); return; }
      await onFollowup(studyExplorationFollowup(next, values));
    } catch (problem) {
      if (liveKey.current === key && generation.current === turn) {
        generation.current++; materialGeneration.current++; cleared = true;
        setLoaded(undefined); setWritingAddress(undefined); setSource(undefined); setSourceOpen(false); setSourcePending(false);
        setError(uiError(problem));
      }
    } finally { if (liveKey.current === key && (generation.current === turn || cleared)) setPending(false); }
  };

  const openOriginal = async () => {
    if (!current || pending || disabled) return;
    if (sourceOpen) { materialGeneration.current++; setSourceOpen(false); setSource(undefined); return; }
    const before = current, key = requestKey, next = await refresh();
    if (!next || key !== liveKey.current || !sameVisibleStep(before, next)) return;
    const origin = next.problem.origin;
    if (!origin.resourceId) return;
    if (onOpenMaterial) {
      try { await onOpenMaterial({ resourceId: origin.resourceId, page: origin.page }); }
      catch (problem) { if (liveKey.current === key) setError(uiError(problem)); }
      return;
    }
    const turn = ++materialGeneration.current;
    setSourceOpen(true); setSourcePending(true); setSourceError('');
    try {
      const page = await api.materialsRead({ target: { kind: 'saved', resourceId: origin.resourceId },
        ...(origin.page ? { page: origin.page, view: 'page' as const } : { view: 'text' as const, offset: origin.start || 0 }) });
      if (materialGeneration.current === turn && liveKey.current === key) setSource(page);
    } catch (problem) { if (materialGeneration.current === turn && liveKey.current === key) setSourceError(uiError(problem)); }
    finally { if (materialGeneration.current === turn && liveKey.current === key) setSourcePending(false); }
  };

  const sourceName = current?.problem.origin.name || (current?.problem.origin.kind === 'evidence' ? '这次的原题' : '原来的资料');
  const closed = current?.status === 'closed';
  const action = (id: StudyScene['actions'][number]['id']) => current?.actions.find(value => value.id === id);
  const historyMore = current && current.historyWindow.offset + current.attemptChoices.length < current.history.attemptCount;
  const hasExploration = !!current?.help?.exploration;
  const spacious = hasExploration || current?.help?.kind === 'explanation' || (current?.help?.text.length || 0) > 600;
  // A same-boundary read can clear all old source text while the one real
  // editor stays put. This retained address is not permission to send or
  // display anything: App still reopens the owner before a study send.
  const writingPlace = writingFocus && <div key="writing-place" className="study-writing-dock"><StudyComposerSlot
    sessionId={sessionId} messageId={messageId} boundaryKey={boundaryKey} label="接着这一页聊" focus={writingFocus}
    onRefresh={refresh} /></div>;

  return <section ref={root} className={`study-desk${current ? ' is-open' : ' is-folded'}${hasExploration ? ' has-exploration' : ''}`}
    data-paper-reveal={reveal.initial ? 'initial' : 'continuation'}
    aria-labelledby={headingId} aria-busy={pending} data-study-id={scene.owner.id}>
    {!current ? <>{!error && shellHeight > 180 ? <div className="study-desk-papers is-waiting"
      style={{ '--study-shell-height': `${shellHeight}px` } as CSSProperties}>
      <section className="study-source-paper" aria-hidden="true" /><section className="study-work-paper">
        <p className="study-paper-wait" role="status"><LoaderCircle size={15} className="study-spin" aria-hidden="true" />接回现在这一步…</p>
        {writingPlace}
      </section></div> : <div className="study-folded-paper">
      <span className="study-folded-mark" aria-hidden="true"><BookOpen size={23} strokeWidth={1.35} /></span>
      <div><h3 id={headingId}>接着学习这一页</h3>
        {error ? <p role="status">{error}</p> : pending ? <p role="status">把原题和刚才那一步接回来…</p> : null}</div>
      <button type="button" className="study-open" disabled={pending || disabled} onClick={() => void refresh()}>
        {pending ? <LoaderCircle size={16} className="study-spin" aria-hidden="true" /> : error ? <RefreshCw size={16} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />}
        <span>{error ? '重新打开' : pending ? '正在打开' : '打开'}</span>
      </button>
    </div>}</> : <>
      <div className="study-desk-papers">
        <section className="study-source-paper" aria-labelledby={originalId}>
          <header className="study-source-heading"><span>{sourceName}{current.problem.origin.page ? ` · 第 ${current.problem.origin.page} 页` : ''}</span>
            {current.problem.origin.resourceId && <button type="button" onClick={() => void openOriginal()} disabled={pending || disabled}
              aria-expanded={sourceOpen}>{sourceOpen ? '收起原' : '看看原'}{current.problem.origin.page ? '页' : '文'}{sourceOpen ? <X size={13} aria-hidden="true" /> : <ArrowUpRight size={13} aria-hidden="true" />}</button>}</header>
          <div className="study-question-label"><h4 id={originalId}>这一题</h4></div>
          <div ref={question} className="study-question">{sourceOpen ? <div className="study-original-inline" aria-label="原来的学习资料" aria-busy={sourcePending}>
            {sourcePending ? <p role="status">正在打开原{current.problem.origin.page ? '页' : '文'}…</p>
              : sourceError ? <p role="status">{sourceError}</p>
                : source?.image ? <img src={source.image.dataUrl} width={source.image.width} height={source.image.height}
                  alt={`${source.item.name}${source.page ? `第 ${source.page} 页` : ''}原页`} />
                  : source ? <RichText text={source.text} /> : null}
          </div> : <ReadableFocus key={`${current.owner.revision}:problem`} label="这道原题" active={referencedPart?.kind === 'problem'} disabled={pending || disabled}
            onFocus={() => void referencePart({ kind: 'problem' })}><RichText text={current.problem.text} /></ReadableFocus>}</div>
          {!sourceOpen && current.problem.origin.interpretation === 'assistant_page_description' && <span className="study-page-caption">按原页整理的题意</span>}
        </section>

        <section className="study-work-paper" aria-labelledby={headingId}>
          <header className="study-work-heading"><h3 id={headingId}>{current.heading}</h3>
            {current.status === 'active' && <button type="button" className="study-park" onClick={() => void park()} disabled={pending || disabled}>
              <Bookmark size={14} aria-hidden="true" /><span>先放一放</span></button>}</header>
          <div ref={workRow} className={`study-work-row${spacious ? ' is-spacious' : ''}`}>
            {pencilLink && <svg className={`study-pencil-link${reveal.help ? ' is-new' : ''}`} aria-hidden="true"
              width="100%" height="100%" viewBox={`0 0 ${pencilLink.width} ${pencilLink.height}`}>
              <path d={pencilLink.path} pathLength="1" /><circle cx={pencilLink.x} cy={pencilLink.y} r="2.6" />
            </svg>}
            <div className="study-my-work">
              <label>{current.learnerAttempt ? '我想到这里' : '从这里试试看'}</label>
              {current.learnerAttempt ? <div ref={manuscript} className="study-manuscript" aria-label="自己留下的推导">
                {current.learnerLines.map(line => <div className={`study-manuscript-line${line.id === current.learnerAttempt?.id ? ' is-current' : ''}`} key={line.id}>
                  <ReadableFocus key={`${current.owner.revision}:${line.id}`} label="我写的这一行"
                    active={referencedPart?.kind === 'attempt' && referencedPart.attemptId === line.id} disabled={pending || disabled}
                    onFocus={() => void referencePart({ kind: 'attempt', attemptId: line.id })}>
                  <div ref={line.id === current.learnerAttempt?.id ? writtenLine : undefined}
                    className={`study-handwritten${line.id === current.learnerAttempt?.id && reveal.attempt ? ' is-new' : ''}`}><RichText text={line.text} /></div>
                  </ReadableFocus>
                </div>)}
              </div>
                : <p className="study-starting-point">{current.nextMove.text}</p>}
              {(historyMore || current.historyWindow.offset > 0) && <button type="button" className="study-earlier" disabled={pending || disabled}
                onClick={() => void refresh({ historyOffset: current.historyWindow.offset > 0 ? 0 : current.historyWindow.offset + current.historyWindow.limit,
                  historyLimit: current.historyWindow.limit })}>
                {current.historyWindow.offset > 0 ? '回到刚才那一步' : '前面的尝试'}<ChevronDown size={12} aria-hidden="true" /></button>}
            </div>
            {current.help && <aside ref={marginNote} key={current.help.id} className={`study-margin-note${spacious ? ' is-spacious' : ''}${hasExploration ? ' has-exploration' : ''}${reveal.help ? ' is-new' : ''}`} aria-label="现在这一点帮助">
              <ReadableFocus key={`${current.owner.revision}:${current.help.id}`} label="眼前这段提示"
                active={referencedPart?.kind === 'help' && referencedPart.stepId === current.help.id} disabled={pending || disabled}
                onFocus={() => void referencePart({ kind: 'help', stepId: current.help!.id })}>
              {current.help.title && <h4>{current.help.title}</h4>}
              <RichText text={current.help.text} />
              </ReadableFocus>
              {current.help.exploration && <ExplorableStudyView key={current.help.id} spec={current.help.exploration}
                disabled={pending || disabled || closed} onContinue={continueExploration} />}
            </aside>}
          </div>

          {current.status === 'parked' && current.stopPoint && <div className="study-bookmark-point"><Bookmark size={16} aria-hidden="true" />
            <p>{current.stopPoint.text}</p></div>}
          {closed && current.closure ? <p className="study-closed-note">{current.closure.text}</p> : null}
          {!closed && current.learnerAttempt && <p className="study-next-move">{current.nextMove.text}</p>}
          {writingPlace}
          {!closed && <footer className="study-help-choices">
              {action('hint') && <button type="button" className="study-hint" disabled={pending || disabled} onClick={() => void act('hint')}>
                {current.help ? '再给一点提示' : '给我一点提示'}<ArrowRight size={14} aria-hidden="true" /></button>}
              <div className="study-other-choices">
                <details onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}
                  onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}>
                  <summary aria-label="换一种一起学的方式"><MoreHorizontal size={18} aria-hidden="true" /></summary>
                  <div>{action('example') && <button type="button" disabled={pending || disabled} onClick={event => {
                    event.currentTarget.closest('details')?.removeAttribute('open'); void act('example'); }}>换个例子讲</button>}
                    {action('try') && <button type="button" disabled={pending || disabled} onClick={event => {
                      event.currentTarget.closest('details')?.removeAttribute('open'); void act('try'); }}>先让我自己试试</button>}</div>
                </details>
                {action('explain') && <button type="button" className="study-explain" disabled={pending || disabled} onClick={() => void act('explain')}>直接讲清楚</button>}
              </div>
            </footer>}
          {error && <p className="study-inline-error" role="status">{error}</p>}
        </section>
      </div>
    </>}
  </section>;
}
