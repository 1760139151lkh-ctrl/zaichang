import type { WorkspaceContext, WorkspaceSurface, WorkspaceTarget } from '../shared/workspace-context';
import type { SemanticSelection } from '../shared/scenes';
import type { MaterialQuoteReference } from '../shared/materials';
import type { NoteQuoteReference } from '../shared/notes';
import type { ConversationBookmarkReference } from '../shared/source-bookmark';
import type { AgendaFocus } from '../shared/agenda';
import type { MapRouteReference } from '../shared/map-context';
import type { StudyFocusRef } from '../shared/study-presentation';
import type { ProgramFollowupReference, ProgramStateValues } from '../shared/interactive-program';
import type { CompanionFollowupReference } from '../shared/companion-source';
import type { CuriosityFollowupReference } from '../shared/curiosity-source';
import type { PreparationFocusReference } from '../shared/presentation';
import type { LetterReference } from '../shared/reflective-letter';
import type { NoteReference } from '../shared/note-presentation';
import type { RehearsalRef } from '../shared/relationship-rehearsal';

export interface CurrentWorkspaceReferences {
  selection?: SemanticSelection; materialQuote?: MaterialQuoteReference; noteQuote?: NoteQuoteReference;
  conversationQuote?: ConversationBookmarkReference; agendaFocus?: AgendaFocus; mapRouteReference?: MapRouteReference;
  study?: StudyFocusRef; programReference?: ProgramFollowupReference; companionReference?: CompanionFollowupReference;
  curiosityReference?: CuriosityFollowupReference; preparationReference?: PreparationFocusReference; letterReference?: LetterReference;
  noteReference?: NoteReference; rehearsal?: RehearsalRef;
}
export function currentWorkspaceTarget(input: CurrentWorkspaceReferences): WorkspaceTarget | undefined {
  if (input.materialQuote) return { kind: 'material_quote', reference: input.materialQuote };
  if (input.noteQuote) return { kind: 'note_quote', reference: input.noteQuote };
  if (input.conversationQuote) return { kind: 'conversation_quote', reference: input.conversationQuote };
  if (input.selection) return { kind: 'scene', reference: input.selection };
  if (input.agendaFocus) return { kind: 'agenda', reference: input.agendaFocus };
  if (input.mapRouteReference) return { kind: 'map_route', reference: input.mapRouteReference };
  if (input.study) return { kind: 'study', reference: input.study };
  if (input.programReference) return { kind: 'interactive', reference: input.programReference };
  if (input.companionReference) {
    const { snapshot: _snapshot, ...reference } = input.companionReference;
    return { kind: 'companion', reference };
  }
  if (input.curiosityReference) return { kind: 'curiosity', reference: input.curiosityReference };
  if (input.preparationReference) return { kind: 'preparation', reference: input.preparationReference };
  if (input.letterReference) return { kind: 'letter', reference: input.letterReference };
  if (input.noteReference) return { kind: 'note', reference: input.noteReference };
  if (input.rehearsal) return { kind: 'rehearsal', reference: input.rehearsal };
}
export function sameWorkspaceTarget(a: WorkspaceTarget | undefined, b: WorkspaceTarget | undefined) {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}
export function workspaceTargetAtSend(target: WorkspaceTarget | undefined, readProgramInputs?: () => ProgramStateValues | undefined): WorkspaceTarget | undefined {
  if (target?.kind !== 'interactive' || !readProgramInputs) return target;
  const inputs = readProgramInputs();
  if (inputs === undefined) return;
  return { ...target, reference: { ...target.reference, inputs: structuredClone(inputs) } };
}
export function workspaceTargetKey(target: WorkspaceTarget) {
  const reference = target.kind === 'interactive' ? (({ inputs: _inputs, ...address }) => address)(target.reference) : target.reference;
  return JSON.stringify([target.kind, reference]);
}
export interface WorkspaceGeometryState {
  view: string; notesUnsaved: boolean;
  note?: { id: string; revision?: number; sha256?: string };
  material?: { resourceId: string; sha256: string; page: number };
  noteChanges: ReadonlyMap<string, { revision: number; sha256: string; state: 'active' | 'deleted' }>;
  isCurrent: () => boolean;
}
function visibleRect(rect: DOMRectReadOnly, clip?: DOMRectReadOnly) {
  const left = Math.max(0, rect.left, clip?.left ?? 0), top = Math.max(0, rect.top, clip?.top ?? 0);
  const right = Math.min(innerWidth, rect.right, clip?.right ?? innerWidth), bottom = Math.min(innerHeight, rect.bottom, clip?.bottom ?? innerHeight);
  return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null;
}
function elementClip(element: HTMLElement) {
  let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
  }
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}
function elementRect(element: HTMLElement) {
  if (element.closest('[inert],[aria-hidden="true"]') || getComputedStyle(element).visibility !== 'visible') return null;
  return visibleRect(element.getBoundingClientRect(), elementClip(element));
}
function nodePoint(root: Node, codePoints: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = codePoints;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const points = Array.from(node.textContent || '');
    if (remaining <= points.length) return { node, offset: points.slice(0, remaining).join('').length };
    remaining -= points.length;
  }
}
function literalRangeRect(root: HTMLElement, start: number, end: number, clip?: DOMRectReadOnly) {
  const boundary = (point: number, upper: boolean) => {
    const spans = [...root.querySelectorAll<HTMLElement>('[data-focus-start][data-focus-end]')].filter(span => {
      const from = Number(span.dataset.focusStart), to = Number(span.dataset.focusEnd);
      return !span.closest('.katex,math,svg') && from <= point && point <= to && to > from
        && Array.from(span.textContent || '').length === to - from;
    });
    const span = upper ? spans[0] : spans.at(-1);
    return span ? nodePoint(span, point - Number(span.dataset.focusStart)) : undefined;
  };
  const from = boundary(start, false), to = boundary(end, true);
  if (!from || !to) return null;
  const range = document.createRange(); range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset);
  return [...range.getClientRects()].map(rect => visibleRect(rect, clip)).find(Boolean) || null;
}
function plainRangeRect(root: HTMLElement, start: number, end: number) {
  const from = nodePoint(root, start), to = nodePoint(root, end);
  if (!from || !to || end <= start) return null;
  const range = document.createRange(); range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset);
  return [...range.getClientRects()].map(rect => visibleRect(rect, elementClip(root))).find(Boolean) || null;
}
async function notebookRect(reference: { id: string; revision: number; sha256: string; start: number; end: number },
  current: () => WorkspaceGeometryState, signal: AbortSignal) {
  const state = current(), owner = state.note;
  if (state.view !== 'notes' || state.notesUnsaved || owner?.id !== reference.id || owner.revision !== reference.revision
    || owner.sha256 !== reference.sha256) return null;
  const control = document.querySelector<HTMLTextAreaElement>('textarea.notes-body'), title = document.querySelector<HTMLInputElement>('input.notes-title');
  if (!control || !title || !elementRect(control)) return null;
  const body = control.value, heading = title.value, points = Array.from(body);
  if (reference.start < 0 || reference.end > points.length || reference.end <= reference.start) return null;
  // NotesService hashes the saved title and body together. Geometry never
  // treats an unsaved editor string as the old owner's original document.
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ title: heading, body })));
  const digest = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  const latest = current();
  if (signal.aborted || !latest.isCurrent() || latest.view !== 'notes' || latest.notesUnsaved || control.value !== body || title.value !== heading
    || latest.note?.id !== reference.id || latest.note.revision !== reference.revision || latest.note.sha256 !== reference.sha256
    || digest !== reference.sha256 || !control.isConnected) return null;
  const changed = latest.noteChanges.get(reference.id);
  if (changed && (changed.state !== 'active' || changed.revision !== reference.revision || changed.sha256 !== reference.sha256)) return null;
  const mirror = document.createElement('div'), style = getComputedStyle(control);
  mirror.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;border:0;box-sizing:border-box;';
  for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'text-indent', 'tab-size']) mirror.style.setProperty(property, style.getPropertyValue(property));
  mirror.style.width = `${control.clientWidth}px`; mirror.append(document.createTextNode(points.slice(0, reference.start).join('')));
  const mark = document.createElement('span'); mark.textContent = points.slice(reference.start, reference.end).join(''); mirror.append(mark);
  document.body.append(mirror);
  try {
    const origin = mirror.getBoundingClientRect(), paper = control.getBoundingClientRect(), clip = elementRect(control);
    if (!clip) return null;
    return [...mark.getClientRects()].map(rect => visibleRect(new DOMRect(paper.left + rect.left - origin.left - control.scrollLeft,
      paper.top + rect.top - origin.top - control.scrollTop, rect.width, rect.height), clip)).find(Boolean) || null;
  } finally { mirror.remove(); }
}
/** Local geometry only. The original owner and Unicode range choose the
 * object; text matching, copied source bodies and remembered rectangles do not. */
export async function resolveWorkspaceTargetRect(target: WorkspaceTarget, current: () => WorkspaceGeometryState, signal: AbortSignal): Promise<DOMRectReadOnly | null> {
  const state = current();
  if (signal.aborted || document.hidden || !state.isCurrent()) return null;
  const note = target.kind === 'note_quote' ? target.reference : target.kind === 'notebook_quote'
    ? { ...target.reference, id: target.reference.noteId } : target.kind === 'note'
      ? { ...target.reference, id: target.reference.noteId, sha256: undefined } : undefined;
  if (note) {
    const changed = state.noteChanges.get(note.id);
    if (changed && (changed.state !== 'active' || target.kind !== 'note'
      && (changed.revision !== note.revision || changed.sha256 !== note.sha256))) return null;
    if (note.sha256) {
      const native = await notebookRect({ ...note, sha256: note.sha256 }, current, signal);
      if (native) return native;
      if (state.view === 'notes') return null;
    }
    const latestChange = current().noteChanges.get(note.id);
    if (latestChange && (latestChange.state !== 'active' || target.kind !== 'note'
      && (latestChange.revision !== note.revision || latestChange.sha256 !== note.sha256))) return null;
    const papers = [...document.querySelectorAll<HTMLElement>('.note-reading-paper')].filter(paper => paper.dataset.noteId === note.id
      && Number(paper.dataset.noteRevision) === note.revision && (!note.sha256 || paper.dataset.noteSha256 === note.sha256)
      && (target.kind !== 'note' || paper.dataset.noteSceneId === target.reference.sceneId
        && Number(paper.dataset.noteSceneRevision) === target.reference.sceneRevision
        && paper.closest('[data-message-id]')?.getAttribute('data-message-id') === target.reference.messageId)
      && !!elementRect(paper));
    if (papers.length === 1) {
      const paper = papers[0], start = Number(paper.dataset.noteStart), end = Number(paper.dataset.noteEnd);
      if (note.start >= start && note.end <= end) {
        const body = paper.querySelector<HTMLElement>('.note-reading-body');
        const rect = body && literalRangeRect(body, note.start - start, note.end - start, elementClip(body));
        if (rect) return rect;
      }
    }
  }
  if (signal.aborted || !current().isCurrent()) return null;
  if (target.kind === 'interactive') {
    const ref = target.reference;
    const nodes = [...document.querySelectorAll<HTMLElement>(`[data-program-id="${CSS.escape(ref.programId)}"][data-program-revision="${ref.revision}"] [data-program-node="${CSS.escape(ref.nodeId)}"]`)]
      .filter(node => node.closest('[data-message-id]')?.getAttribute('data-message-id') === ref.messageId && !!elementRect(node));
    if (nodes.length === 1) return elementRect(nodes[0]);
  }
  if (target.kind === 'material_quote' && state.view === 'materials' && state.material?.resourceId === target.reference.resourceId
    && state.material.sha256 === target.reference.sha256 && (target.reference.page === undefined || state.material.page === target.reference.page)) {
    const spans = [...document.querySelectorAll<HTMLElement>('.materials-reader[data-source-current="true"] [data-material-start][data-material-end]')]
      .filter(span => Number(span.dataset.materialStart) < target.reference.end && Number(span.dataset.materialEnd) > target.reference.start);
    const rect = spans.map(span => {
      const from = Number(span.dataset.materialStart), to = Number(span.dataset.materialEnd);
      return Array.from(span.textContent || '').length === to - from ? plainRangeRect(span,
        Math.max(0, target.reference.start - from), Math.min(to, target.reference.end) - from) : null;
    }).find(Boolean);
    if (rect) return rect;
  }
  const chips = [...document.querySelectorAll<HTMLElement>('[data-workspace-target]')].filter(chip => chip.dataset.workspaceTarget === workspaceTargetKey(target)
    && !!elementRect(chip));
  return chips.length === 1 ? elementRect(chips[0]) : null;
}
export function workspaceSurface(view: string, empty: boolean, target?: WorkspaceTarget): WorkspaceSurface {
  if (view === 'keep' || view === 'materials' || view === 'notes' || view === 'agenda' || view === 'memory' || view === 'settings') return view;
  if (view === 'companion') return 'characters';
  if (target?.kind === 'study' || target?.kind === 'interactive' || target?.kind === 'letter'
    || target?.kind === 'preparation' || target?.kind === 'rehearsal') return target.kind;
  if (target?.kind === 'map_route') return 'map';
  if (target?.kind === 'scene' && target.reference.kind === 'record') return 'campus';
  return empty ? 'home' : 'conversation';
}
/** Capture at send time. UI focus changes and drafts never become a stream. */
export function workspaceSendContext(surface: WorkspaceSurface, current?: WorkspaceTarget, comparison?: WorkspaceTarget,
  messageId?: string): WorkspaceContext {
  const two = comparison && current && !sameWorkspaceTarget(comparison, current);
  const first = comparison || current;
  return { surface, objects: two ? [{ slot: 'A', target: comparison }, { slot: 'B', target: current }]
    : first ? [{ slot: 'A', target: first }] : [],
  ...(two ? { relation: { kind: 'compare', from: 'A', to: 'B' } as const } : {}),
  ...(first ? { returnTo: { surface, ...(messageId ? { messageId } : {}), target: first } } : {}) };
}
