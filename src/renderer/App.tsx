import { Portal, IconButton, Modal, WindowControls, uiError } from './ui';
import { SettingsPanel, type SettingsDraft } from './SettingsPanel';
import { NotesPanel } from './NotesPanel';
import type { KeepPage, KeepSnapshot, KeepSnapshotInput, KeepWorkLocator } from '../shared/keep';
import { KeepPanel, type KeepSectionKind } from './KeepPanel';
import { MaterialsPanel, type MaterialQuote } from './MaterialsPanel';
import { materialQuoteAddress, type MaterialQuoteReference, type MaterialItem } from '../shared/materials';
import { MATERIAL_DOCUMENT_MIME, readMaterialDocumentTransfer, type MaterialDocumentAddress } from './materials/material-document-transfer';
import { noteQuoteAddress, type NoteQuote, type NoteQuoteReference } from '../shared/notes';
import type { AgendaFocus, AgendaReference } from '../shared/agenda';
import type { SharedMapRoute } from '../shared/map-context';
import { LocalSearchPanel } from './LocalSearchPanel';
import { ComposerActions } from './ComposerActions';
import { FocusContextChip } from './FocusContextChip';
import { currentWorkspaceTarget, resolveWorkspaceTargetRect, sameWorkspaceTarget, workspaceSendContext, workspaceSurface, workspaceTargetAtSend, workspaceTargetKey } from './workspace-context';
import type { CompanionD01Target } from './companion-d01-motion';
import { assistantTextReferenceSchema, workspaceSettingsContextSchema, type AssistantTextReference, type WorkspaceSettingsContext, type WorkspaceTarget } from '../shared/workspace-context';
import { readAppearance } from './appearance';
import { environmentTimeLabels } from './presentation/environment-time';
import { LetterHistoryCard } from './LetterHistoryCard';
import { PlanningOfferCard } from './PlanningOfferCard';
import { ConversationComposerDockContext, useConversationComposerDock } from './ConversationComposerDock';
import { ReadingDivider } from './ReadingDivider';
import { ReadingDesk, type ReadingDeskItem, type OpeningRect } from './ReadingDesk';
import { AttachmentTray, type AttachmentTrayItem } from './AttachmentTray';
import { QuietNotice } from './QuietNotice';
import { SourceBookmarkProvider, type StudyBookmarkDestination } from './SourceBookmarkTray';
import type { SourceBookmarkReference, ConversationBookmarkReference } from '../shared/source-bookmark';
import { MessageBookmarkSource, authoredMessageContent } from './MessageBookmarkSource';
import { AssistantTextSource } from './AssistantTextSource';
import { SCENE_FRAME_MIME, readSceneFrameTransfer } from '../shared/scene-transfer';
import { discussionArtworkLabel } from '../shared/discussion-scene';
import './scene-transfer.css';
import { FocusLamp } from './FocusLamp';
import { EdgeCompanion, type EdgeCompanionPlacement } from './EdgeCompanion';
import { focusSession, type FocusSession } from './focus-session';
import { ReturnBookmark } from './ReturnBookmark';
import { useWorkspaceReturn, type WorkspaceReturnAddress, type WorkspaceReturnCheckpoint,
  type MaterialReturnAddress, type NoteReturnAddress, type AgendaReturnAddress } from './workspace-return';
import { companionSceneMoment } from './companion-variants';
import { currentCompanionActivity } from '../shared/companion-activity';
import { ConversationTextFocusContext } from './ConversationTextFocus';
import { createPortal, flushSync } from 'react-dom';
import type { LocalSearchLocator } from '../shared/search';
import type { StudyInteraction, StudyNativeInput } from '../shared/study-presentation';
import type { CompanionFollowupReference } from '../shared/companion-source';
import type { CuriosityFollowupReference } from '../shared/curiosity-source';
import type { ProgramFollowupReference, ProgramStateValues } from '../shared/interactive-program';
import type { LetterFocusContext, LetterReference } from '../shared/reflective-letter';
import type { NoteNativeInput, NoteReference } from '../shared/note-presentation';
import type { RehearsalInteraction, RehearsalRef } from '../shared/relationship-rehearsal';
import './workspace-continuation.css';
import './composer-continuation.css';
import './reading-desk-integration.css';
import { WorkspaceScenery, WorkspaceArtworkWarmup } from './WorkspaceScenery';
import { AgendaView, type AgendaViewPosition, type WorkspaceView } from './Workspace';
import { Navigation } from './Navigation';
import { CompanionAvatar, CompanionScene, RestSpace, companionAuthorArtwork, companionRoomFrame, prefersQuietMotion, useCompanion, type CompanionRoomLayout } from './companion';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDown,
  Plus,
  X,
  Minus,
  History,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Check,
  LoaderCircle,
  CircleAlert,
  Info,
  Copy,
  ArrowUpRight,
  FileText,
  Paperclip,
  Image as ImageIcon,
  Monitor,
  Quote,
  Pencil,
  LampDesk,
  BookOpen,
  Bookmark,
  Undo2,
  SlidersHorizontal,
  Columns2,
} from 'lucide-react';
import { RichText } from './RichText';
import { DEFAULT_TIME_ZONE, formatDateTime, fromTimeInput, timeZoneLabel, toTimeInput } from './time';
import {
  DisplayReview,
  MatterCard,
  PreparationShelf,
  PublicDisplay,
  type MatterInteraction,
  type MatterInteractionUpdate,
} from './LifePanels';
import type { PreparationFocusContext, PreparationFocusReference, SharedMatterView, SurfaceView } from '../shared/presentation';
import { getDraftAttachments, withDraftAttachments, type ReplySourceAddress, type DraftAttachment, type TextAttachment, type Action, type ActionEffectRef, type Draft, type Memory, type Message, type NavigationTarget, type ReleaseArtifact, type State } from '../shared/types';
import { LIMITS } from '../shared/limits';
import { emptyRoute, type MapRouteResult } from '../shared/map-v2';
import { MapRouteCard, type MapContextHandoff } from './map/CampusMap';
import { MapSheet } from './map/DesktopMapSheet';
import { ConversationMap, clearConversationMapViews } from './map/ConversationMap';
import { AssistantPresentation, PresentationActivity } from './presentation/AssistantPresentation';
import { flushProgramLocalStates } from './presentation/program-local-state';
import { campusExamTypeLabel, interleaveViews, type PresentationView, type ViewAnchor, type SemanticSelection } from '../shared/scenes';
import {
  ReplyEvidence,
  ChatProcess,
  ScopeSettings,
  FeedbackControl,
  needName,
  emptyMemoryWorkspace,
  type TurnControls,
} from './HarnessViews';

const api = window.zaichang;
type Panel = 'history' | null;
type ActionResult = { ok: boolean; error?: string };
type AssistantPassage = { reference: AssistantTextReference; preview: string; kind: 'text' | 'formula' };
async function replyTextSha(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}
/** Display qualification after the ordinary conversation owner was read.
 * The native compiler independently checks sources and scope at every send. */
async function assistantPassageFromMessages(reference: AssistantTextReference, messages: Message[], kind: AssistantPassage['kind'] = 'text'): Promise<AssistantPassage> {
  const address = assistantTextReferenceSchema.parse(reference);
  const message = messages.find(item => item.id === address.messageId && item.sessionId === address.sessionId);
  if (!message || message.role !== 'assistant' || message.status !== 'done' || message.demo || message.retention === 'session_only')
    throw new Error('这段解释现在不能从原回复接回，可以回原处重新选择。');
  const response = message.responseText ?? message.content, points = Array.from(response);
  if (!message.content.startsWith(response) || address.end > points.length || await replyTextSha(message.content) !== address.contentSha256)
    throw new Error('这段解释的文字或位置已经变化，请重新选一下。');
  return { reference: address, kind, preview: kind === 'formula' ? '这个公式'
    : points.slice(address.start, Math.min(address.end, address.start + 120)).join('') + (address.end - address.start > 120 ? '…' : '') };
}
interface RoomPaperPosition {
  sourceKey: string;
  mode: 'side' | 'stacked';
  paperSide: 'left' | 'right';
  left: number;
  width: number;
  stageLeft: number;
  stageTop: number;
  stageWidth: number;
  stageHeight: number;
  contentTop: number;
}
interface UnsentSubmission {
  kind?: 'draft';
  id: string;
  ownerKey: string;
  sequence: number;
  draftKey: string;
  boundary: string;
  draft: Draft;
  delivery: 'not-sent' | 'unconfirmed';
  processing?: boolean;
}
type PresentationFollowup = { text: string; studyInteraction?: StudyInteraction; companionReference?: CompanionFollowupReference;
  curiosityReference?: CuriosityFollowupReference; letterReference?: LetterReference; focusOnly?: boolean; focusLabel?: string;
  programReference?: ProgramFollowupReference; preparationReference?: PreparationFocusReference;
  readProgramInputs?: () => ProgramStateValues | undefined;
  rehearsalInteraction?: RehearsalInteraction; noteReference?: NoteReference };
type ComposerFollowup = PresentationFollowup & {
  token: number; sessionId?: string; messageId: string; boundary: string; insertedText?: string;
};
type WorkspaceComparisonReference = { target: WorkspaceTarget; label: string; readProgramInputs?: () => ProgramStateValues | undefined };
function automaticFollowupKey(request: PresentationFollowup, messageId: string) {
  return request.curiosityReference ? `${messageId}/${request.curiosityReference.id}/${request.curiosityReference.revision}`
    : request.rehearsalInteraction ? `${messageId}/rehearsal/${request.rehearsalInteraction.ref.id}/${request.rehearsalInteraction.ref.revision}` : '';
}
function helpBodyKey(message: Pick<Message, 'sessionId' | 'id'>, ref: NonNullable<Message['primaryHelpRef']>, boundary: string) {
  return `${message.sessionId}:${message.id}:${ref.id}@${ref.revision}:${ref.helpRecordId}:${boundary}`;
}
function isPrimaryHelp(ref: NonNullable<Message['helpRefs']>[number], primary: Message['primaryHelpRef']) {
  return !!primary && ref.id === primary.id && ref.revision === primary.revision && ref.helpRecordId === primary.helpRecordId;
}
const formatDate = formatDateTime;
function errorText(error: unknown) {
  return uiError(error);
}
function appendKeepPage<T>(first: KeepPage<T>, next: KeepPage<T>, identity: (value: T) => string): KeepPage<T> {
  return { ...next, offset: first.offset, items: [...new Map([...first.items, ...next.items].map(item => [identity(item), item])).values()] };
}

export function App() {
  const { value: companion } = useCompanion();
  const [state, setState] = useState<State | null>(null);
  const boundaryRevision = useRef('');
  const [turnControls, setTurnControls] = useState<TurnControls>({});
  const turnControlsRef = useRef<TurnControls>({});
  const [scopeOpen, setScopeOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visibleHelpBodies, setVisibleHelpBodies] = useState<Record<string, string>>({});
  function reportHelpBody(key: string, body: string | undefined) {
    setVisibleHelpBodies(current => {
      if (current[key] === body) return current;
      const next = { ...current };
      if (body === undefined) delete next[key];
      else next[key] = body;
      return next;
    });
  }
  const [sessionId, setSessionId] = useState<string>();
  const sessionRef = useRef<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [composerWriting, setComposerWriting] = useState(false);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const attachment = attachments[0] || null;
  const draftRef = useRef<Draft>({ text: '', attachment: null }),
    draftKey = useRef('new'),
    draftRevision = useRef(0),
    navigation = useRef(0);
  const settingsDraft = useRef<SettingsDraft>({});
  const [settingsContext, setSettingsContext] = useState<WorkspaceSettingsContext>();
  const settingsContextRef = useRef<WorkspaceSettingsContext | undefined>(undefined);
  function clearSettingsContext() { settingsContextRef.current = undefined; setSettingsContext(undefined); }
  function snapshotSettingsContext(returnView: 'settings' | 'companion' | 'memory') {
    if (!state) return;
    const navigation = settingsDraft.current.navigation, room = settingsDraft.current.companion;
    const tab = navigation?.tab || (returnView === 'companion' ? '陪伴' : returnView === 'memory' ? '记忆' : '偏好');
    const savedAppearance = readAppearance();
    const saved = { character: companion.character, palette: savedAppearance.palette, environmentMode: savedAppearance.environmentMode,
      presence: companion.presence, reducedMotion: companion.reducedMotion, readingScale: savedAppearance.readingScale, density: savedAppearance.density };
    const preview = room ? { ...saved, character: room.preference.character, palette: room.palette,
      environmentMode: room.environmentMode || saved.environmentMode, presence: room.preference.presence, reducedMotion: room.preference.reducedMotion } : undefined;
    const personaPreview = settingsDraft.current.personaPreview?.candidate.core || settingsDraft.current.persona?.core;
    const section = tab === '陪伴' ? 'companion' : tab === '交流' ? 'persona' : tab === '偏好' ? 'reading'
      : tab === '资料' ? 'campus_connection' : tab === '记忆' ? 'memory' : 'connection';
    const parsed = workspaceSettingsContextSchema.safeParse({ section,
      phase: tab === '陪伴' && room ? 'preview' : tab === '交流' && settingsDraft.current.personaPreview ? 'import_preview'
        : tab === '交流' && settingsDraft.current.persona ? 'editing' : 'saved',
      ...(navigation?.tiyiFocus ? { connectionFocus: navigation.tiyiFocus } : {}),
      appearance: { saved, ...(preview ? { preview } : {}) },
      persona: { revision: state.settings.persona.revision, selectedPreset: state.settings.persona.core.presetId,
        ...(personaPreview ? { previewPreset: personaPreview.presetId } : {}) }, returnTo: { view: returnView, tab } });
    if (!parsed.success) return;
    settingsContextRef.current = parsed.data; setSettingsContext(parsed.data);
  }
  const [memoryWorkspace, setMemoryWorkspace] = useState(emptyMemoryWorkspace);
  const [draftReady, setDraftReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0),
    [loadError, setLoadError] = useState('');
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const [attachmentMenuPosition, setAttachmentMenuPosition] = useState<CSSProperties>({});
  const attachmentControl = useRef<HTMLDivElement>(null),
    attachmentTrigger = useRef<HTMLButtonElement>(null);
  const knownMemories = useRef(new Set<string>()),
    activeRun = useRef(false);
  const [memoryNotice, setMemoryNotice] = useState<Memory | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [view, setWorkspaceView] = useState<WorkspaceView>('chat');
  const [homeVisible, setHomeVisible] = useState(true);
  const [homeComposerHome, setHomeComposerHome] = useState<HTMLDivElement | null>(null);
  const [homePreparationHome, setHomePreparationHome] = useState<HTMLDivElement | null>(null);
  const [preparationHome, setPreparationHome] = useState<HTMLDivElement | null>(null);
  const [preparationHost] = useState(() => document.createElement('div'));
  const homeReturnView = useRef<WorkspaceView>('chat');
  const personalReturn = useRef<{ home: boolean; view: WorkspaceView }>({ home: true, view: 'chat' });
  const [companionEntry, setCompanionEntry] = useState<'partner' | 'light'>('partner');
  const [companionEntryRevision, setCompanionEntryRevision] = useState(0);
  const setView = useCallback((next: WorkspaceView) => {
    setHomeVisible(false); setWorkspaceView(next);
  }, []);
  useLayoutEffect(() => {
    const parent = homeVisible ? homePreparationHome : preparationHome;
    if (!parent || preparationHost.parentElement === parent) return;
    const atomic = parent as HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };
    if (preparationHost.isConnected && atomic.moveBefore) atomic.moveBefore(preparationHost, null);
    else parent.appendChild(preparationHost);
  }, [homeVisible, homePreparationHome, preparationHome, preparationHost]);
  useLayoutEffect(() => () => preparationHost.remove(), [preparationHost]);
  const previousSettingsView = useRef(view);
  useEffect(() => {
    const previous = previousSettingsView.current;
    if (previous !== view && (previous === 'settings' || previous === 'companion' || previous === 'memory')) snapshotSettingsContext(previous);
    previousSettingsView.current = view;
  }, [view]);
  const [readingPane, setReadingPane] = useState<'reader' | 'chat'>('reader');
  const [edgeAnchor, setEdgeAnchor] = useState<HTMLFormElement | null>(null);
  const [edgePlacement, setEdgePlacement] = useState<EdgeCompanionPlacement>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('zaichang.edge-companion-placement.v1') || 'null');
      if (value && typeof value.edgeId === 'string' && value.edgeId.length <= 180
        && ['top', 'right', 'bottom', 'left'].includes(value.side) && Number.isFinite(value.ratio) && value.ratio >= 0 && value.ratio <= 1) return value;
      const saved = localStorage.getItem('zaichang.edge-companion-position.v1'), ratio = Number(saved);
      return { edgeId: 'composer', side: 'top', ratio: saved !== null && Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : .82 };
    } catch { return { edgeId: 'composer', side: 'top', ratio: .82 }; }
  });
  const edgeCall = useRef<{ sequence: number; navigation: number; boundary: string; sessionId?: string; messageIds: Set<string> } | undefined>(undefined);
  const [readingSide, setReadingSide] = useState<'start' | 'end'>(() => {
    try { return localStorage.getItem('zaichang.reading-side.v1') === 'end' ? 'end' : 'start'; } catch { return 'start'; }
  });
  const swapReadingSide = () => setReadingSide(previous => {
    const next = previous === 'start' ? 'end' : 'start';
    try { localStorage.setItem('zaichang.reading-side.v1', next); } catch { /* The same papers can still change sides. */ }
    return next;
  });
  const [resting, setResting] = useState(false);
  const [focusStatus, setFocusStatus] = useState<FocusSession['status']>(() => focusSession.get().status);
  const focusActive = focusStatus === 'running';
  const appMainRef = useRef<HTMLDivElement>(null);
  const [mapPresenceHost, setMapPresenceHost] = useState<HTMLElement | null>(null);
  const conversationSpaceRef = useRef<HTMLDivElement>(null);
  const [roomLayout, setRoomLayout] = useState<CompanionRoomLayout | null>(null);
  const [roomPaperPosition, setRoomPaperPosition] = useState<RoomPaperPosition | null>(null);
  const roomPaperPositionRef = useRef(roomPaperPosition);
  roomPaperPositionRef.current = roomPaperPosition;
  const startFocus = useCallback(() => {
    if (focusSession.get().status === 'paused') focusSession.resume();
    else focusSession.start();
  }, []);
  const openRest = useCallback(() => setResting(true), []);
  const [chatSpace, setChatSpace] = useState<'auto' | 'window' | 'reading'>('auto');
  const [compactConversation, setCompactConversation] = useState(() => matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const call = edgeCall.current;
    if (call && call.sequence === sendSequence.current && call.sessionId === sessionId
      && call.navigation === navigation.current && call.boundary === boundaryRevision.current) return;
    edgeCall.current = undefined;
    setChatSpace('auto');
  }, [sessionId]);
  useEffect(() => {
    const media = matchMedia('(max-width: 900px)');
    const resize = () => { rememberReadingPosition(); setCompactConversation(media.matches); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  const [notesOpened, setNotesOpened] = useState(false);
  const [keepOpened, setKeepOpened] = useState(false);
  const [materialsOpened, setMaterialsOpened] = useState(false);
  const [agendaOpened, setAgendaOpened] = useState(false);
  const [notesUnsaved, setNotesUnsaved] = useState(false);
  const [materialUnsaved, setMaterialUnsaved] = useState(false);
  const bookmarkUnsaved = useRef(false);
  const [bookmarkResetKey, setBookmarkResetKey] = useState(0);
  const [keepContentRevision, setKeepContentRevision] = useState(0);
  const [keepWriting, setKeepWriting] = useState(false);
  const keepSelection = useRef<{ boundary: string; key: string } | undefined>(undefined);
  const [keepSelectionRequest, setKeepSelectionRequest] = useState<{ key: string; requestId: number }>();
  const [keepResult, setKeepResult] = useState<{ boundary: string; snapshot: KeepSnapshot }>();
  const [keepLoading, setKeepLoading] = useState(false), [keepLoadingMore, setKeepLoadingMore] = useState<KeepSectionKind>();
  const [keepError, setKeepError] = useState('');
  const keepRequest = useRef(0);
  const actionEdits = useRef(new Map<string, { sessionId: string; messageId: string; dirty: boolean; pending: boolean }>());
  const reportActionEdit = useCallback((sessionId: string, messageId: string, id: string, dirty: boolean, pending: boolean) => {
    const key = `${sessionId}/${messageId}/${id}`;
    if (dirty || pending) actionEdits.current.set(key, { sessionId, messageId, dirty, pending });
    else actionEdits.current.delete(key);
  }, []);
  useEffect(() => { actionEdits.current.clear(); }, [state?.privacyEpoch, state?.policyRevision, state?.sourceBoundary]);
  const [agendaPosition, setAgendaPosition] = useState<AgendaViewPosition>();
  const [searchTarget, setSearchTarget] = useState<{ locator: LocalSearchLocator; requestId: number }>();
  const [preparationRequest, setPreparationRequest] = useState<PreparationFocusReference & { requestId: number }>();
  const preparationNavigation = useRef(0);
  const searchNavigation = useRef(0), locatedSearch = useRef(0);
  useEffect(() => { setSearchTarget(undefined); }, [state?.privacyEpoch, state?.policyRevision, state?.sourceBoundary]);
  useEffect(() => {
    if (searchTarget && !(view === 'keep' && searchTarget.locator.kind === 'material')
      && view !== ({ conversation: 'chat', note: 'notes', material: 'materials' } as const)[searchTarget.locator.kind]) setSearchTarget(undefined);
  }, [view]);
  useEffect(() => { if (view === 'notes') setNotesOpened(true); }, [view]);
  useEffect(() => { if (view === 'keep') setKeepOpened(true); }, [view]);
  useEffect(() => { if (view === 'materials') setMaterialsOpened(true); }, [view]);
  useEffect(() => { if (view === 'agenda') setAgendaOpened(true); }, [view]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const returnBoundary = state ? `${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}` : '';
  const workspaceReturn = useWorkspaceReturn({ boundaryKey: returnBoundary, enabled: !!state && state.presentation?.mode !== 'public' });
  const [startupReturn, setStartupReturn] = useState<WorkspaceReturnCheckpoint>();
  const startupReturnBoundary = useRef(''), returnInitialized = useRef(false), returnCaptureReady = useRef(false);
  const returnInteraction = useRef(false), returnDismissedGesture = useRef(-1), returnNavigation = useRef(0), returnRestoring = useRef(false);
  const returnOwners = useRef<{ material?: MaterialReturnAddress; note?: NoteReturnAddress; agenda?: AgendaReturnAddress }>({});
  const [materialResume, setMaterialResume] = useState<{ address: MaterialReturnAddress; requestId: number }>();
  const unsettledKeepMaterial = useRef<{ resourceId: string; sha256: string } | undefined>(undefined);
  const [keepReaderReadyRevision, setKeepReaderReadyRevision] = useState(0);
  const [noteResume, setNoteResume] = useState<{ address: NoteReturnAddress; requestId: number }>();
  const [agendaResume, setAgendaResume] = useState<{ address: AgendaReturnAddress; requestId: number }>();
  const pendingReturnPosition = useRef<{ checkpoint: WorkspaceReturnCheckpoint; ticket: number; boundary: string; gesture: number;
    navigation: number; search: number; ready: boolean; positioned?: boolean } | undefined>(undefined);
  const returnStudyToken = useRef<number | undefined>(undefined);
  const captureReturnRef = useRef<() => void>(() => {});
  const returnCaptureTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const returnTaskFocus = useRef<'composer' | 'surface'>('surface');
  useLayoutEffect(() => {
    if (!state || state.presentation?.mode === 'public' || returnInitialized.current) return;
    returnInitialized.current = true;
    startupReturnBoundary.current = boundaryRevision.current;
    setStartupReturn(workspaceReturn.read());
    returnCaptureReady.current = true;
  }, [state, workspaceReturn]);
  function cancelReturnResume() {
    if ((returnRestoring.current || pendingReturnPosition.current) && returnStudyToken.current !== undefined
      && composerFollowupRef.current?.token === returnStudyToken.current) {
      const study = composerFollowupRef.current.studyInteraction;
      if (study) composerDock.returnToChat(study.focus);
      clearFollowup();
    }
    returnStudyToken.current = undefined;
    returnNavigation.current++; returnRestoring.current = false; pendingReturnPosition.current = undefined;
    setMaterialResume(undefined); setNoteResume(undefined); setAgendaResume(undefined); setKeepSelectionRequest(undefined);
  }
  function clearReturnBoundary() {
    cancelReturnResume(); returnOwners.current = {}; returnInteraction.current = false; keepSelection.current = undefined;
    unsettledKeepMaterial.current = undefined;
    returnTaskFocus.current = 'surface';
    startupReturnBoundary.current = ''; setStartupReturn(undefined); workspaceReturn.forget();
    if (returnCaptureTimer.current) clearTimeout(returnCaptureTimer.current);
    returnCaptureTimer.current = undefined;
  }
  function queueReturnCapture() {
    if (returnCaptureTimer.current) clearTimeout(returnCaptureTimer.current);
    returnCaptureTimer.current = setTimeout(() => { returnCaptureTimer.current = undefined; captureReturnRef.current(); }, 0);
  }
  function rememberReturnTaskFocus(event: Event) {
    const target = event.target;
    if (target === inputRef.current) returnTaskFocus.current = 'composer';
    else if (target instanceof Element && target.closest('.message-scroll,.materials-scroll,.study-question,.study-manuscript,.notes-body,.notes-editor,.agenda-timeline,.agenda-editor,.campus-v2-stage'))
      returnTaskFocus.current = 'surface';
  }
  function returnGesture(event?: Event) {
    if (surfaceMode.current === 'public') return;
    if (event) rememberReturnTaskFocus(event);
    readingGesture.current++; returnInteraction.current = true;
    if (returnRestoring.current || pendingReturnPosition.current || materialResume || noteResume || agendaResume) cancelReturnResume();
    queueReturnCapture();
  }
  const returnGestureRef = useRef(returnGesture); returnGestureRef.current = returnGesture;
  useEffect(() => {
    const gesture = (event: Event) => { if (event.isTrusted) returnGestureRef.current(event); };
    const focus = (event: Event) => rememberReturnTaskFocus(event);
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
    events.forEach(name => document.addEventListener(name, gesture, { capture: true, passive: true }));
    document.addEventListener('focusin', focus, true);
    return () => {
      events.forEach(name => document.removeEventListener(name, gesture, true));
      document.removeEventListener('focusin', focus, true);
      if (returnCaptureTimer.current) clearTimeout(returnCaptureTimer.current);
    };
  }, []);
  const reportMaterialReturn = useCallback((address: MaterialReturnAddress | undefined) => {
    if (returnBoundary !== boundaryRevision.current || surfaceMode.current === 'public') return;
    returnOwners.current.material = address; queueReturnCapture();
    if (address && unsettledKeepMaterial.current?.resourceId === address.resourceId
      && unsettledKeepMaterial.current.sha256 === address.sha256) {
      unsettledKeepMaterial.current = undefined; setKeepReaderReadyRevision(value => value + 1);
    }
  }, [returnBoundary]);
  const reportNoteReturn = useCallback((address: NoteReturnAddress | undefined) => {
    if (returnBoundary !== boundaryRevision.current || surfaceMode.current === 'public') return;
    returnOwners.current.note = address; queueReturnCapture();
  }, [returnBoundary]);
  const reportAgendaReturn = useCallback((address: AgendaReturnAddress | undefined) => {
    if (returnBoundary !== boundaryRevision.current || surfaceMode.current === 'public') return;
    returnOwners.current.agenda = address; queueReturnCapture();
  }, [returnBoundary]);
  const [matterInteractions, setMatterInteractions] = useState<Record<string, MatterInteraction>>({});
  const interactionEpoch = state?.privacyEpoch;
  function updateMatterInteraction(id: string, value: MatterInteractionUpdate) {
    if (boundaryRevision.current.split(':')[0] !== String(interactionEpoch)) return;
    setMatterInteractions((current) => ({
      ...current,
      [id]: typeof value === 'function' ? value(current[id] || {}) : value,
    }));
  }
  const [draftSaved, setDraftSaved] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [closingDrafts, setClosingDrafts] =
    useState<
      (Awaited<ReturnType<typeof api.unsavedDrafts>>[number] & { text: string; attachmentName?: string })[]
    >();
  const [closeError, setCloseError] = useState('');
  const closePending = useRef(false);
  const requestCloseRef = useRef<() => Promise<void>>(async () => {});
  const [toast, setToast] = useState('');
  const [starting, setStarting] = useState(false);
  const sendPending = useRef(false), sendSequence = useRef(0);
  const queueHostAvailable = useRef<boolean | undefined>(undefined);
  const sendReceipts = useRef(new Map<string, { sequence: number; receive: (message: Message) => void }>());
  const [unsentSubmissions, setUnsentSubmissions] = useState<UnsentSubmission[]>([]);
  const composing = useRef(false);
  const [composerFollowup, setComposerFollowup] = useState<ComposerFollowup>();
  const composerFollowupRef = useRef<ComposerFollowup | undefined>(undefined);
  const followupSequence = useRef(0);
  const dismissedFollowup = useRef('');
  const readingStarts = useRef(new Set<string>()), readingGesture = useRef(0);
  const [navigating, setNavigating] = useState(false),
    navigationPending = useRef(false);
  const [away, setAway] = useState(false);
  const [mapSheet, setMapSheet] = useState<MapRouteResult | null>(null);
  const [mapSheetConditions, setMapSheetConditions] = useState<SharedMapRoute>();
  const [mapSheetMemory, setMapSheetMemory] = useState<MapContextHandoff['previewMemory']>();
  const [displayReview, setDisplayReview] = useState<SurfaceView>();
  const surfaceMode = useRef<'private' | 'public'>('private');
  const surfaceRevision = useRef(0);
  const [publicCloseNotice, setPublicCloseNotice] = useState('');
  const [sharedMapContext, setSharedMapContext] = useState<MapContextHandoff>();
  const sharedMapContextRef = useRef<MapContextHandoff | undefined>(undefined);
  const [sceneSelection,setSceneSelection]=useState<SemanticSelection>();
  const [sceneDropActive, setSceneDropActive] = useState(false), [sceneDropIssue, setSceneDropIssue] = useState('');
  const sceneSelectionRef = useRef<SemanticSelection | undefined>(undefined);
  const [sceneSelectionLabel,setSceneSelectionLabel]=useState('');
  const sceneSelectionRequest=useRef(0);
  const [materialQuote, setMaterialQuote] = useState<MaterialQuote>();
  const materialQuoteRef = useRef<MaterialQuote | undefined>(undefined);
  type DocumentReference = { reference: MaterialDocumentAddress; name: string; mediaType: string };
  const [materialDocument, setMaterialDocument] = useState<DocumentReference>();
  const materialDocumentRef = useRef<DocumentReference | undefined>(undefined);
  const [deskOpenRequest, setDeskOpenRequest] = useState<{ id: string; requestId: number }>();
  const [deskOpeningRect, setDeskOpeningRect] = useState<OpeningRect>();
  const readerReturnFocus = useRef<HTMLElement | null>(null);
  const deskOpenSequence = useRef(0);
  const [activeDeskId, setActiveDeskId] = useState<string>();
  const dirtyDeskIds = useRef(new Set<string>());
  const [deskExtras, setDeskExtras] = useState<{ boundary: string; items: ReadingDeskItem[] }>({ boundary: '', items: [] });
  const [materialLibrary, setMaterialLibrary] = useState<{ boundary: string; items: MaterialItem[] }>({ boundary: '', items: [] });
  const [documentPreview, setDocumentPreview] = useState<DocumentReference>(), [documentPreviewPending, setDocumentPreviewPending] = useState(false);
  const [documentDropActive, setDocumentDropActive] = useState(false), [documentReaderDropActive, setDocumentReaderDropActive] = useState(false), [documentPreviewIssue, setDocumentPreviewIssue] = useState('');
  const documentRequest = useRef(0), documentReturnFocus = useRef<HTMLElement | null>(null);
  function clearMaterialDocument(clearPreview = true) {
    materialDocumentRef.current = undefined; setMaterialDocument(undefined);
    if (clearPreview) {
      documentRequest.current++; setDocumentPreview(undefined); setDocumentPreviewPending(false); setDocumentPreviewIssue(''); setDocumentDropActive(false);
      documentReturnFocus.current = null;
    }
  }
  function cancelDocumentPreview(restoreFocus = false) {
    documentRequest.current++; setDocumentPreview(undefined); setDocumentPreviewPending(false); setDocumentPreviewIssue(''); setDocumentDropActive(false);
    const origin = documentReturnFocus.current; documentReturnFocus.current = null;
    if (restoreFocus && origin?.isConnected) origin.focus({ preventScroll: true });
  }
  const materialConversationTarget = useRef<HTMLElement>(null);
  function clearMaterialQuote() { materialQuoteRef.current = undefined; setMaterialQuote(undefined); }
  const [noteQuote, setNoteQuote] = useState<NoteQuote>();
  const noteQuoteRef = useRef<NoteQuote | undefined>(undefined);
  function clearNoteQuote() { noteQuoteRef.current = undefined; setNoteQuote(undefined); }
  const [conversationQuote, setConversationQuote] = useState<{ reference: ConversationBookmarkReference; title: string }>();
  const conversationQuoteRef = useRef<typeof conversationQuote>(undefined);
  function clearConversationQuote() { conversationQuoteRef.current = undefined; setConversationQuote(undefined); }
  const [assistantPassage, setAssistantPassage] = useState<AssistantPassage>();
  const assistantPassageRef = useRef<AssistantPassage | undefined>(undefined);
  function clearAssistantPassage() { assistantPassageRef.current = undefined; setAssistantPassage(undefined); }
  const [agendaContext, setAgendaContext] = useState<{ focus: AgendaFocus; label: string }>();
  const agendaContextRef = useRef<typeof agendaContext>(undefined);
  const [comparisonAnchor, setComparisonAnchor] = useState<WorkspaceComparisonReference>();
  const comparisonAnchorRef = useRef<typeof comparisonAnchor>(undefined);
  const [comparisonContinuation, setComparisonContinuation] = useState<WorkspaceComparisonReference>();
  const comparisonContinuationRef = useRef<typeof comparisonContinuation>(undefined);
  const noteAddressChanges = useRef(new Map<string, { revision: number; sha256: string; state: 'active' | 'deleted' }>());
  const [noteAddressRevision, setNoteAddressRevision] = useState(0);
  async function loadKeptContent(kind?: KeepSectionKind) {
    if (!state || isPublicSurface() || viewRef.current !== 'keep') return;
    const request = ++keepRequest.current, boundary = boundaryRevision.current;
    const previous = keepResult?.boundary === boundary ? keepResult.snapshot : undefined;
    const page = kind ? previous?.[kind] : undefined;
    if (kind && (!page?.hasMore || page.nextOffset === undefined)) return;
    const offsets = { notes: 'notesOffset', materials: 'materialsOffset', works: 'worksOffset', conversations: 'conversationsOffset' } as const;
    const input: KeepSnapshotInput = kind ? { [offsets[kind]]: page!.nextOffset } : {};
    if (kind) setKeepLoadingMore(kind); else setKeepLoading(true);
    setKeepError('');
    try {
      const next = await api.keepSnapshot(input);
      if (request !== keepRequest.current || boundary !== boundaryRevision.current || isPublicSurface()) return;
      const nextBoundary = `${next.boundary.privacyEpoch}:${next.boundary.policyRevision}:${next.boundary.sourceBoundary}`;
      if (nextBoundary !== boundary) return;
      setKeepResult(current => {
        if (!kind || !current || current.boundary !== boundary || current.snapshot !== previous) return { boundary, snapshot: next };
        const snapshot = { ...current.snapshot, boundary: next.boundary };
        if (kind === 'notes') snapshot.notes = appendKeepPage(snapshot.notes, next.notes, item => item.id);
        else if (kind === 'materials') snapshot.materials = appendKeepPage(snapshot.materials, next.materials, item => item.resourceId);
        else if (kind === 'conversations') snapshot.conversations = appendKeepPage(snapshot.conversations, next.conversations, item => item.id);
        else snapshot.works = appendKeepPage(snapshot.works, next.works, item => `${item.locator.sessionId}/${item.locator.messageId}/${item.locator.programId}/${item.locator.revision}`);
        return { boundary, snapshot };
      });
    } catch (error) {
      if (request === keepRequest.current && boundary === boundaryRevision.current && !isPublicSurface()) setKeepError(uiError(error, { operation: 'open' }));
    } finally {
      if (request === keepRequest.current) { setKeepLoading(false); setKeepLoadingMore(undefined); }
    }
  }
  useEffect(() => {
    if (view === 'keep' && draftReady && state?.presentation?.mode !== 'public') void loadKeptContent();
    return () => { keepRequest.current++; };
  }, [view, draftReady, state?.privacyEpoch, state?.policyRevision, state?.sourceBoundary, keepContentRevision, noteAddressRevision, state?.conversations]);
  const attachmentInventory = attachments.map(item => item.attachmentId || (item.kind === 'text' ? item.resource?.resourceId || item.name : item.name)).join('|');
  useEffect(() => {
    if (!draftReady || view !== 'materials' || surfaceMode.current === 'public') return;
    const boundary = boundaryRevision.current;
    let live = true;
    void api.materialsList({ sessionId }).then(items => {
      if (live && boundary === boundaryRevision.current && surfaceMode.current !== 'public') setMaterialLibrary({ boundary, items });
    }).catch(error => { if (live && boundary === boundaryRevision.current && surfaceMode.current !== 'public') notify(uiError(error, { operation: 'open' })); });
    return () => { live = false; };
  }, [draftReady, view, sessionId, state?.privacyEpoch, state?.policyRevision, state?.sourceBoundary, attachmentInventory, messages.length, messages.at(-1)?.status, noteAddressRevision]);
  function attachmentViewId(item: DraftAttachment) {
    return item.kind === 'text' && item.resource ? item.resource.resourceId : item.attachmentId || `${item.kind}:${item.name}`;
  }
  function attachmentDeskItem(item: DraftAttachment): ReadingDeskItem {
    if (item.kind === 'image') return { id: attachmentViewId(item), kind: 'image', name: item.name, image: item };
    return item.resource ? { id: item.resource.resourceId, kind: 'material', name: item.name, pending: item,
      address: { resourceId: item.resource.resourceId, sha256: item.resource.sha256,
        ...(item.resource.mediaType === 'application/pdf' ? { page: 1 } : {}), offset: 0 } }
      : { id: attachmentViewId(item), kind: 'text', name: item.name, text: item.text };
  }
  function attachmentTrayItem(item: DraftAttachment): AttachmentTrayItem {
    return { id: attachmentViewId(item), kind: item.kind === 'image' ? 'image' : item.resource ? 'document' : 'text',
      name: item.name, ...(item.kind === 'image' ? { image: item } : { mediaType: item.resource?.mediaType }) };
  }
  const readingDeskItems: ReadingDeskItem[] = [...new Map<string, ReadingDeskItem>([
    ...attachments.map(attachmentDeskItem),
    ...(materialLibrary.boundary === boundaryRevision.current ? materialLibrary.items.map((item): ReadingDeskItem => ({ id: item.resourceId,
      kind: 'material', name: item.name, address: { resourceId: item.resourceId, sha256: item.sha256,
        ...(item.mediaType === 'application/pdf' ? { page: 1 } : {}), offset: 0 } })) : []),
    ...(deskExtras.boundary === boundaryRevision.current ? deskExtras.items : []),
  ].reverse().map(item => [item.id, item] as const)).values()].reverse();
  function openDeskItem(item: ReadingDeskItem) {
    if (!draftReady || navigationPending.current || isPublicSurface()) return;
    const boundary = boundaryRevision.current;
    setDeskExtras(previous => ({ boundary, items: [...(previous.boundary === boundary ? previous.items.filter(value => value.id !== item.id) : []), item] }));
    const requestId = ++deskOpenSequence.current;
    if (viewRef.current === 'keep') {
      const main = appMainRef.current?.getBoundingClientRect(), object = appMainRef.current?.querySelector<HTMLElement>('.keep-object')?.getBoundingClientRect();
      const header = appMainRef.current?.querySelector<HTMLElement>('.titlebar')?.getBoundingClientRect();
      if (main && object && header) {
        const top = header.bottom + 12;
        const openFrames = appMainRef.current?.querySelectorAll('.reading-desk-frame:not([hidden])').length || 0;
        setDeskOpeningRect({ id: item.id, requestId, rect: { x: object.left + Math.min(2, openFrames) * 24, y: top, width: Math.min(540, object.width),
          height: 250 } });
      }
    } else { setDeskOpeningRect(undefined); setView('materials'); }
    setDeskOpenRequest({ id: item.id, requestId });
    setMaterialsOpened(true); setReadingPane('reader');
  }
  function openAttachment(item: DraftAttachment) { openDeskItem(attachmentDeskItem(item)); }
  function clearDeskReadings() {
    unsettledKeepMaterial.current = undefined;
    setDeskExtras({ boundary: '', items: [] }); setMaterialLibrary({ boundary: '', items: [] });
    setDeskOpenRequest(undefined); setActiveDeskId(undefined); dirtyDeskIds.current.clear();
    setDeskOpeningRect(undefined);
  }
  function openDocumentFrame(address: MaterialDocumentAddress) {
    const queued = getDraftAttachments(draftRef.current).find(item => item.kind === 'text' && item.resource?.resourceId === address.resourceId);
    const available = readingDeskItems.find(item => item.id === address.resourceId);
    if (queued) { openAttachment(queued); return; }
    const name = available?.name || materialDocumentRef.current?.name || '这一份资料';
    openDeskItem({ id: address.resourceId, kind: 'material', name, address });
  }
  function removeAttachment(id: string) {
    if (busy || !draftReady || navigationPending.current || isPublicSurface()) return;
    const original = getDraftAttachments(draftRef.current).find(item => attachmentViewId(item) === id);
    if (!original) return;
    const originalResource = original.kind === 'text' ? original.resource?.resourceId : undefined;
    if (dirtyDeskIds.current.has(originalResource || id)) {
      notify('页边还有没留好的字，先把它留好或清空。');
      return;
    }
    replaceDraft(withDraftAttachments(draftRef.current, getDraftAttachments(draftRef.current).filter(item => attachmentViewId(item) !== id)));
    setDeskExtras(previous => ({ ...previous, items: previous.items.filter(item => item.id !== (originalResource || id)) }));
    if (originalResource && materialDocumentRef.current?.reference.resourceId === originalResource) clearMaterialDocument();
    if (originalResource && materialQuoteRef.current?.resourceId === originalResource) clearMaterialQuote();
  }
  function clearComparisonContinuation() { comparisonContinuationRef.current = undefined; setComparisonContinuation(undefined); }
  function clearComparison() {
    comparisonAnchorRef.current = undefined; setComparisonAnchor(undefined);
    clearComparisonContinuation();
  }
  function currentWorkspaceReference(includePage = true): WorkspaceTarget | undefined {
    if (materialDocumentRef.current) return { kind: 'material', reference: materialDocumentRef.current.reference };
    const followup = composerFollowupRef.current;
    const selected = currentWorkspaceTarget({ selection: sceneSelectionRef.current,
      materialQuote: materialQuoteRef.current ? materialQuoteAddress(materialQuoteRef.current) : undefined,
      noteQuote: noteQuoteRef.current ? noteQuoteAddress(noteQuoteRef.current) : undefined,
      conversationQuote: conversationQuoteRef.current?.reference, assistantTextReference: assistantPassageRef.current?.reference,
      agendaFocus: agendaContextRef.current?.focus,
      mapRouteReference: sharedMapContextRef.current?.routeReference,
      study: followup?.studyInteraction?.focus || studyDockRef.current?.focus,
      programReference: followup?.programReference, companionReference: followup?.companionReference,
      curiosityReference: followup?.curiosityReference, preparationReference: followup?.preparationReference,
      letterReference: followup?.letterReference, noteReference: followup?.noteReference,
      rehearsal: followup?.rehearsalInteraction?.ref });
    if (selected) return selected;
    if (!includePage) return;
    const material = viewRef.current === 'materials' ? returnOwners.current.material : undefined;
    if (material) return { kind: 'material', reference: { resourceId: material.resourceId, sha256: material.sha256,
      page: material.page, offset: material.offset } };
    const note = viewRef.current === 'notes' ? returnOwners.current.note : undefined;
    if (note && note.id !== 'new' && note.revision && note.sha256)
      return { kind: 'notebook', reference: { id: note.id, revision: note.revision, sha256: note.sha256 } };
    const agenda = viewRef.current === 'agenda' ? returnOwners.current.agenda : undefined;
    if (agenda) return { kind: 'agenda', reference: { record: agenda.record, ...(agenda.trial ? { trial: agenda.trial } : {}) } };
  }
  function currentWorkspaceLabel() {
    const document = materialDocumentRef.current;
    if (document) return `${document.name}${document.reference.page ? ` · 第 ${document.reference.page} 页` : ''}`;
    const quote = materialQuoteRef.current || noteQuoteRef.current;
    if (quote) return `${'name' in quote ? quote.name : quote.title} · ${Array.from(quote.text).slice(0, 72).join('')}`;
    return conversationQuoteRef.current?.title || assistantPassageRef.current?.preview
      || agendaContextRef.current?.label || sharedMapContextRef.current?.label || composerFollowupRef.current?.focusLabel
      || sceneSelectionLabel || '刚才的这一处';
  }
  function compareCurrentReference() {
    const target = currentWorkspaceReference();
    if (!target) return;
    const selected = { target: structuredClone(target), label: currentWorkspaceLabel(),
      ...(target.kind === 'interactive' && composerFollowupRef.current?.readProgramInputs
        ? { readProgramInputs: composerFollowupRef.current.readProgramInputs } : {}) };
    comparisonAnchorRef.current = selected; setComparisonAnchor(selected);
    comparisonContinuationRef.current = undefined; setComparisonContinuation(undefined);
  }
  function clearAgendaContext() { agendaContextRef.current = undefined; setAgendaContext(undefined); }
  function clearMapContext(stop = true) {
    const previous = sharedMapContextRef.current;
    sharedMapContextRef.current = undefined; setSharedMapContext(undefined);
    if (stop && previous) void api.shareMapContext({ enabled: false,
      ...(previous.selectionId ? { expectedSelectionId: previous.selectionId } : {}) }).catch(() => {});
  }
  function clearNativeReferences() { clearMaterialDocument(); clearNoteQuote(); clearConversationQuote(); clearAssistantPassage(); clearAgendaContext(); clearMapContext(); }
  function clearFollowup(dismiss = false) {
    const previous = composerFollowupRef.current;
    if (dismiss && previous) dismissedFollowup.current = automaticFollowupKey(previous, previous.messageId);
    composerFollowupRef.current = undefined; setComposerFollowup(undefined);
  }
  function clearSceneSelection() {
    sceneSelectionRequest.current++; sceneSelectionRef.current = undefined;
    setSceneSelection(undefined); setSceneSelectionLabel('');
    setSceneDropActive(false); setSceneDropIssue('');
  }
  useEffect(() => {
    const finished = () => { setSceneDropActive(false); setDocumentDropActive(false); setDocumentReaderDropActive(false); };
    window.addEventListener('dragend', finished); window.addEventListener('drop', finished);
    return () => { window.removeEventListener('dragend', finished); window.removeEventListener('drop', finished); };
  }, []);
  useEffect(() => {
    if (!documentPreview && !documentPreviewPending && !documentPreviewIssue) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || composing.current || !(event.target instanceof Element)
        || event.target !== documentReturnFocus.current && !event.target.closest('.document-reference-preview')) return;
      event.preventDefault(); event.stopPropagation(); cancelDocumentPreview(true);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [documentPreview, documentPreviewPending, documentPreviewIssue]);
  useEffect(()=>{clearSceneSelection();clearFollowup();clearMaterialQuote();clearMaterialDocument();clearNoteQuote();clearAgendaContext();},[sessionId]);
  useEffect(()=>{clearSceneSelection();clearFollowup();clearMaterialQuote();clearNativeReferences();clearConversationMapViews();},[state?.privacyEpoch,state?.policyRevision,state?.sourceBoundary]);
  useEffect(() => { clearComparison(); clearSettingsContext(); noteAddressChanges.current.clear(); }, [state?.privacyEpoch, state?.policyRevision, state?.sourceBoundary]);
  useEffect(() => { cancelDocumentPreview(); }, [view]);
  useEffect(() => {
    const selected = agendaContextRef.current;
    if (selected && state && !state.agenda.some(item => item.id === selected.focus.record.id
      && (item.revision || 1) === selected.focus.record.revision)) clearAgendaContext();
  }, [state?.agenda]);
  async function selectScene(value:SemanticSelection){
    const request=++sceneSelectionRequest.current,selectedSession=sessionRef.current,boundary=boundaryRevision.current;
    const gesture = readingGesture.current;
    const scene=messages.flatMap(message=>message.scenes||[]).find(scene=>scene.id===value.sceneId&&scene.revision===value.sceneRevision);
    if (!scene) return;
    if (value.kind === 'discussion_artwork' && (scene.kind !== 'discussion' || !value.artwork
      || !scene.artwork.some(art => art.assetId === value.artwork!.assetId && art.optionId === value.artwork!.optionId))) return;
    setSceneDropIssue('');
    searchNavigation.current++;
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    clearFollowup(); clearMaterialQuote(); clearNativeReferences();
    sceneSelectionRef.current = value;
    setSceneSelection(value);
    setSceneSelectionLabel('接着这里聊');
    if(value.kind==='date')setSceneSelectionLabel(`${value.date} · 按这一天继续`);
    else if(value.kind==='leg'&&scene?.kind==='map'){
      const leg=scene.journey.legs.find(leg=>leg.id===value.legId);
      setSceneSelectionLabel(leg?`${leg.route.from?.displayName} → ${leg.route.to?.displayName}`:'刚选的路段');
    }else if(value.kind==='record' && scene?.kind==='campus'){
      const record = scene.records.find(record => record.id === value.recordId);
      setSceneSelectionLabel(record ? `接着聊「${record.title}」${scene.domain === 'exams' && record.examType ? ' · ' + campusExamTypeLabel(record.examType) : ''}` : '接着聊这条校园消息');
    }else if(value.kind==='time_block' && scene?.kind==='planning'){
      const block = scene.blocks.find(block => block.id === value.blockId);
      const time = block ? new Date(block.start).toLocaleString('zh-CN',{timeZone:scene.window.timeZone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) : '';
      const trialTime = value.planningTrial ? 'localTime' in value.planningTrial ? value.planningTrial.localTime
        : new Date(value.planningTrial.proposedStart).toLocaleTimeString('en-GB',{timeZone:scene.window.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}) : undefined;
      const range = block?.originalRange || block;
      const minutes = range?.end ? (Date.parse(range.end)-Date.parse(range.start))/60000 : undefined;
      setSceneSelectionLabel(block ? trialTime ? `${block.label} → ${trialTime}${minutes !== undefined ? `，仍${minutes}分钟` : ''}`
        : `${time} · ${block.label}，接着聊` : '接着聊这个时段');
      if (value.planningTrial && 'proposedStart' in value.planningTrial)
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }else if(value.kind==='environment_sample' && scene?.kind==='environment'){
      const sample = scene.samples.find(sample => sample.id === value.sampleId);
      const time = sample ? environmentTimeLabels(scene).stamp(sample.at, true) : '';
      setSceneSelectionLabel(`${time} · 按这个${scene.domain==='weather'?'天气':'空气'}预报继续`);
    }else if(value.kind==='discussion_point' && scene.kind==='discussion'){
      const point = scene.points.find(point => point.id === value.pointId);
      setSceneSelectionLabel(point ? `关于「${Array.from(point.text).slice(0,60).join('')}${Array.from(point.text).length>60?'…':''}」` : '接着这句话聊');
    }else if(value.kind==='discussion_option' && scene.kind==='discussion'){
      const branch = scene.branches.find(branch => branch.id === value.optionId);
      setSceneSelectionLabel(branch ? `关于「${branch.title}」` : '接着这个想法聊');
    }else if(value.kind === 'discussion_artwork' && value.artwork && scene.kind === 'discussion') {
      setSceneSelectionLabel(`作品里的「${discussionArtworkLabel(value.artwork.assetId)}」`);
      requestAnimationFrame(() => {
        if (request === sceneSelectionRequest.current && selectedSession === sessionRef.current && boundary === boundaryRevision.current
          && gesture === readingGesture.current && !navigationPending.current) inputRef.current?.focus({ preventScroll: true });
      });
    }else if(value.kind==='discussion_option' && scene.kind==='planning'){
      const branch = messages.flatMap(message => message.views || []).flatMap(view => view.comparison?.branches || [])
        .find(branch => branch.optionRef?.id === value.optionId && branch.sceneRef?.id === scene.id && branch.sceneRef.revision === scene.revision);
      setSceneSelectionLabel(branch ? `关于「${branch.title}」` : '接着这份安排聊');
    }else if(value.kind==='place'){
      setSceneSelectionLabel('刚选的地点');
      try{const places=await api.mapPlaces();
        if(request===sceneSelectionRequest.current&&selectedSession===sessionRef.current&&boundary===boundaryRevision.current)setSceneSelectionLabel(`关于「${places.find(place=>place.id===value.placeId)?.displayName||'这个地点'}」`);
      }catch{}
    }
  }
  const privateReturn = useRef<{ sessionId?: string; view: WorkspaceView; boundary?: string;
    checkpoint?: WorkspaceReturnCheckpoint }>({ view: 'chat' });
  const [previewImage, setPreviewImage] = useState<Message['image']>();
  const scrollRef = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLTextAreaElement>(null),
    followRef = useRef(true);
  const [composerHome, setComposerHome] = useState<HTMLDivElement | null>(null);
  const [keepComposerHome, setKeepComposerHome] = useState<HTMLDivElement | null>(null);
  const [conversationHome, setConversationHome] = useState<HTMLDivElement | null>(null);
  const [notesDiscussionHome, setNotesDiscussionHome] = useState<HTMLDivElement | null>(null);
  const [notesDiscussion, setNotesDiscussion] = useState(false);
  // Keep the actual conversation, its live programs and its single composer
  // mounted while a note is discussed beside its original text.
  const [conversationHost] = useState(() => {
    const element = document.createElement('div');
    element.className = 'conversation-workspace-host';
    return element;
  });
  useLayoutEffect(() => () => conversationHost.remove(), [conversationHost]);
  function placeConversation() {
    const parent = view === 'notes' && notesDiscussion && notesDiscussionHome ? notesDiscussionHome : conversationHome;
    if (!parent?.isConnected) return;
    // A DOM island owns live editors and programs. Retire only empty hosts
    // left by a former renderer; never let them divide the available width.
    for (const previous of [...parent.children]) {
      if (previous !== conversationHost && previous.classList.contains('conversation-workspace-host')
        && !previous.firstElementChild && !previous.textContent?.trim()) previous.remove();
    }
    if (conversationHost.parentElement === parent) return;
    const viewport = scrollRef.current, top = viewport?.scrollTop;
    const focused = conversationHost.contains(document.activeElement) && document.activeElement instanceof HTMLElement
      ? document.activeElement : undefined;
    const selection = focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement
      ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] as const : undefined;
    const atomicParent = parent as HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };
    if (conversationHost.isConnected && atomicParent.moveBefore) atomicParent.moveBefore(conversationHost, null);
    else {
      if (composing.current) return;
      parent.appendChild(conversationHost);
      if (focused) {
        focused.focus({ preventScroll: true });
        if (selection && selection[0] !== null && selection[1] !== null
          && (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement))
          focused.setSelectionRange(selection[0], selection[1], selection[2] || undefined);
      }
    }
    if (viewport && top !== undefined) viewport.scrollTop = top;
    if (parent === notesDiscussionHome && viewRef.current === 'notes') {
      const note = noteQuoteRef.current, material = materialQuoteRef.current, conversation = conversationQuoteRef.current;
      if (note || material || conversation) focusComposerAfterRead(() => viewRef.current === 'notes'
        && (note ? noteQuoteRef.current === note : material ? materialQuoteRef.current === material : conversationQuoteRef.current === conversation));
    }
  }
  useLayoutEffect(placeConversation, [conversationHome, notesDiscussionHome, notesDiscussion, view, conversationHost]);
  useEffect(() => { if (view !== 'notes') setNotesDiscussion(false); }, [view]);
  const pendingReadFocus = useRef<{ owns: () => boolean; gesture: number; navigation: number; search: number; boundary: string; sessionId?: string } | undefined>(undefined);
  const [composerHost] = useState(() => {
    const element = document.createElement('div');
    element.className = 'conversation-composer-host';
    return element;
  });
  useLayoutEffect(() => () => composerHost.remove(), [composerHost]);
  const composerMoveRequested = useRef(false), composerMoveAnimation = useRef<Animation | undefined>(undefined);
  const composerMoveOrigin = useRef<DOMRect | undefined>(undefined);
  function requestComposerMove(animate = true) {
    composerMoveRequested.current = animate;
    if (!animate) composerMoveAnimation.current?.cancel();
    composerMoveOrigin.current = !animate || composing.current || prefersQuietMotion() ? undefined : composerHost.getBoundingClientRect();
  }
  const currentComposerFollowup = composerFollowup?.sessionId === sessionId && composerFollowup?.boundary === boundaryRevision.current
    ? composerFollowup : undefined;
  const textFocus = useMemo(() => ({ curiosityReference: currentComposerFollowup?.curiosityReference,
    letterReference: currentComposerFollowup?.letterReference, noteReference: currentComposerFollowup?.noteReference }),
    [currentComposerFollowup?.curiosityReference, currentComposerFollowup?.letterReference, currentComposerFollowup?.noteReference]);
  const composerDock = useConversationComposerDock({
    sessionId, boundaryKey: boundaryRevision.current,
    enabled: view === 'chat' && draftReady && !navigating && surfaceMode.current !== 'public',
    referenceFocus: currentComposerFollowup?.studyInteraction?.kind === 'reference' ? currentComposerFollowup.studyInteraction.focus : undefined,
    latestAssistantMessageId: messages.filter(message => message.role === 'assistant').at(-1)?.id,
    onRelease: element => {
      if (composerHost.parentElement === element && composerHome?.isConnected) moveComposer(composerHome, true);
    },
    onActivate: requestComposerMove,
  });
  const studyDockRef = useRef(composerDock.target); studyDockRef.current = composerDock.target;
  function moveComposer(parent: HTMLElement, releasing = false) {
    if (!parent.isConnected) return;
    for (const previous of [...parent.children]) {
      if (previous !== composerHost && previous.classList.contains('conversation-composer-host')
        && !previous.firstElementChild && !previous.textContent?.trim()) previous.remove();
    }
    if (composerHost.parentElement === parent) return;
    if (composing.current && !releasing) return;
    const from = composerMoveRequested.current && !composing.current && !prefersQuietMotion()
      ? composerMoveOrigin.current || composerHost.getBoundingClientRect() : undefined;
    const editing = inputRef.current, focused = document.activeElement === editing;
    const selection = editing ? [editing.selectionStart, editing.selectionEnd, editing.selectionDirection] as const : undefined;
    const atomicParent = parent as HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };
    if (composerHost.isConnected && atomicParent.moveBefore) atomicParent.moveBefore(composerHost, null);
    else {
      if (composing.current) return;
      parent.appendChild(composerHost);
      if (focused && editing && selection) {
        editing.focus({ preventScroll: true });
        editing.setSelectionRange(...selection);
      }
    }
    composerMoveRequested.current = false;
    composerMoveOrigin.current = undefined;
    composerMoveAnimation.current?.cancel();
    const to = composerHost.getBoundingClientRect();
    if (from?.width && from.height && to.width && to.height && composerHost.animate) {
      const animation = composerHost.animate([
        { transformOrigin: 'top left', transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: .92 },
        { transformOrigin: 'top left', transform: 'none', opacity: 1 },
      ], { duration: 280, easing: 'cubic-bezier(.2,.7,.25,1)' });
      composerMoveAnimation.current = animation;
      animation.onfinish = () => { if (composerMoveAnimation.current === animation) {
        composerMoveAnimation.current = undefined; revealKeepComposer();
      } };
    }
  }
  function placeComposer() {
    const parent = homeVisible && homeComposerHome ? homeComposerHome
      : view === 'keep' && keepWriting && keepComposerHome ? keepComposerHome : composerDock.target?.element || composerHome;
    if (parent) moveComposer(parent);
    settleReadFocus();
  }
  function revealPaperComposer() {
    const viewport = scrollRef.current;
    if (!studyDockRef.current || !viewport?.contains(composerHost)) return;
    const writer = composerHost.getBoundingClientRect(), visible = viewport.getBoundingClientRect();
    const shift = writer.bottom > visible.bottom - 16 ? writer.bottom - visible.bottom + 16
      : writer.top < visible.top + 16 ? writer.top - visible.top - 16 : 0;
    if (shift) viewport.scrollTo({ top: viewport.scrollTop + shift, behavior: prefersQuietMotion() ? 'instant' : 'smooth' });
  }
  function revealKeepComposer() {
    if (viewRef.current !== 'keep' || composerMoveAnimation.current) return;
    const scroll = keepComposerHome?.closest<HTMLElement>('.keep-panel'), form = inputRef.current?.closest<HTMLElement>('.composer');
    if (!scroll || !form || !scroll.clientHeight) return;
    const visible = scroll.getBoundingClientRect(), writer = form.getBoundingClientRect();
    const shift = writer.bottom > visible.bottom - 16 ? writer.bottom - visible.bottom + 16
      : writer.top < visible.top + 16 ? writer.top - visible.top - 16 : 0;
    if (shift) scroll.scrollTo({ top: scroll.scrollTop + shift, behavior: prefersQuietMotion() ? 'instant' : 'smooth' });
  }
  useLayoutEffect(placeComposer, [homeVisible, homeComposerHome, composerHome, keepComposerHome, keepWriting, composerHost, composerDock.target, notesDiscussion, notesDiscussionHome, view, draftReady, navigating]);
  useEffect(() => { if (view !== 'keep') setKeepWriting(false); }, [view]);
  const readingAnchor = useRef<{ element: HTMLElement; offset: number } | undefined>(undefined);
  function rememberReadingPosition() {
    const viewport = scrollRef.current;
    if (!viewport || !viewport.clientHeight || followRef.current) return;
    const top = viewport.getBoundingClientRect().top;
    const element = [
      ...viewport.querySelectorAll<HTMLElement>(
        '.markdown > p, .markdown > h2, .markdown > h3, .markdown > blockquote',
      ),
    ].find((element) => element.getBoundingClientRect().bottom > top + 20);
    if (element) readingAnchor.current = { element, offset: element.getBoundingClientRect().top - top };
    queueReturnCapture();
  }
  function captureWorkspaceReturn() {
    if (homeVisible || !state || returnBoundary !== boundaryRevision.current || !draftReady || navigationPending.current || surfaceMode.current === 'public' || !returnCaptureReady.current
      || !returnInteraction.current || returnRestoring.current || pendingReturnPosition.current
      || readingGesture.current <= returnDismissedGesture.current
      || viewRef.current === 'keep' && !!unsettledKeepMaterial.current
      || !['chat', 'materials', 'notes', 'agenda', 'keep'].includes(viewRef.current)) return;
    const ephemeral = turnControlsRef.current.retention === 'session_only' || temporaryConversation;
    const currentSession = !ephemeral ? sessionRef.current : undefined;
    const material = viewRef.current === 'materials' || viewRef.current === 'keep' && !!activeDeskId || materialQuoteRef.current
      && materialQuoteRef.current.resourceId === returnOwners.current.material?.resourceId ? returnOwners.current.material : undefined;
    const note = viewRef.current === 'notes' || noteQuoteRef.current?.id === returnOwners.current.note?.id ? returnOwners.current.note : undefined;
    const agenda = viewRef.current === 'agenda' || agendaContextRef.current?.focus.record.id === returnOwners.current.agenda?.record.id
      ? returnOwners.current.agenda : undefined;
    if (viewRef.current === 'materials' && !material || viewRef.current === 'notes' && !note
      || viewRef.current === 'agenda' && !agenda) return;
    const address: WorkspaceReturnAddress = { view: viewRef.current as WorkspaceReturnAddress['view'],
      ...(currentSession ? { sessionId: currentSession } : {}), ...(material ? { material } : {}), ...(note ? { note } : {}), ...(agenda ? { agenda } : {}) };
    if (address.view === 'keep' && keepSelection.current?.boundary === returnBoundary)
      address.keep = { selectedKey: keepSelection.current.key, writing: keepWriting };
    if (viewRef.current === 'materials') address.readingPane = readingPane;
    if (ephemeral && address.view === 'chat') address.view = material ? 'materials' : note ? 'notes' : agenda ? 'agenda' : 'chat';
    const viewport = scrollRef.current;
    if (currentSession && viewport?.clientHeight) {
      const top = viewport.getBoundingClientRect().top;
      const articles = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')].filter(element =>
        messages.some(message => message.id === element.dataset.messageId && message.retention !== 'session_only'));
      const anchor = articles.find(element => element.getBoundingClientRect().bottom > top + 20) || articles.at(-1);
      if (anchor?.dataset.messageId) address.message = { id: anchor.dataset.messageId, offset: anchor.getBoundingClientRect().top - top };
    }
    const editor = inputRef.current;
    if (!ephemeral && editor) address.composer = { start: editor.selectionStart, end: editor.selectionEnd, direction: editor.selectionDirection,
      focused: returnTaskFocus.current === 'composer' };
    if (!ephemeral) {
      if (assistantPassageRef.current && assistantPassageRef.current.reference.sessionId === currentSession) {
        address.assistantText = assistantPassageRef.current.reference;
        address.assistantTextKind = assistantPassageRef.current.kind;
      }
      if (materialDocumentRef.current) address.materialDocument = materialDocumentRef.current.reference;
      address.quote = materialQuoteRef.current ? { kind: 'material', reference: materialQuoteAddress(materialQuoteRef.current) }
        : noteQuoteRef.current ? { kind: 'notebook', reference: noteQuoteAddress(noteQuoteRef.current) }
          : conversationQuoteRef.current ? { kind: 'conversation', reference: conversationQuoteRef.current.reference } : undefined;
      const paper = studyDockRef.current;
      if (currentSession && paper?.messageId && messages.some(message => message.id === paper.messageId && message.retention !== 'session_only'))
        address.study = { messageId: paper.messageId, focus: paper.focus };
    }
    if (!currentSession && !material && !note && !agenda && !address.keep && !address.materialDocument && (ephemeral || !draftRef.current.text.trim() && !getDraftAttachments(draftRef.current).length)) return;
    if (workspaceReturn.remember(address) && startupReturn) setStartupReturn(undefined);
  }
  function openHome() {
    if (navigationPending.current || isPublicSurface() || homeVisible) return;
    rememberReadingPosition(); captureWorkspaceReturn(); workspaceReturn.flush();
    homeReturnView.current = viewRef.current;
    requestComposerMove(false); setWorkspaceView('chat'); setHomeVisible(true); setPanel(null);
  }
  function closePersonal() {
    const back = personalReturn.current;
    if (back.home) { setWorkspaceView('chat'); setHomeVisible(true); }
    else setView(back.view === 'settings' || back.view === 'companion' ? 'chat' : back.view);
  }
  captureReturnRef.current = captureWorkspaceReturn;
  useEffect(() => {
    const close = () => { captureReturnRef.current(); workspaceReturn.flush(); };
    window.addEventListener('beforeunload', close); window.addEventListener('pagehide', close);
    return () => { window.removeEventListener('beforeunload', close); window.removeEventListener('pagehide', close); };
  }, [workspaceReturn]);
  const busy = starting || messages.some((m) => m.status === 'running') || unsentSubmissions.some(item => item.processing);
  const empty = messages.length === 0;
  const latestAssistant = messages.filter(message => message.role === 'assistant' && !message.proactive).at(-1);
  const edgeReply = edgeCall.current?.sequence === sendSequence.current
    && edgeCall.current.navigation === navigation.current && edgeCall.current.boundary === boundaryRevision.current
    && edgeCall.current.sessionId === sessionId && latestAssistant
    && !edgeCall.current.messageIds.has(latestAssistant.id) ? latestAssistant : undefined;
  const edgeReplyText = edgeReply ? (edgeReply.responseText ?? edgeReply.content).trim() : '';
  const edgeSpeech = edgeReply?.status === 'done' && Array.from(edgeReplyText).length <= 96 ? edgeReplyText : '';
  const hasScene = !!latestAssistant?.views?.length || !!latestAssistant?.scenes?.length;
  const needsReadingRoom = !!latestAssistant && (latestAssistant.content.length >= 560 || latestAssistant.content.split('\n').length >= 14);
  const readingSelectedWork = !!sceneSelection || !!composerDock.target || !!materialDocument
    || !!currentComposerFollowup && currentComposerFollowup.messageId !== latestAssistant?.id;
  const selectedCompanionScene = sceneSelection ? messages.flatMap(message => message.scenes || []).find(scene =>
    scene.id === sceneSelection.sceneId && scene.revision === sceneSelection.sceneRevision) : undefined;
  const focusedCompanionMessage = currentComposerFollowup
    ? messages.find(message => message.id === currentComposerFollowup.messageId) : latestAssistant;
  const latestCompanionView = focusedCompanionMessage?.views?.at(-1);
  const presentedCompanionScenes = latestCompanionView?.libraryVersion === 1
    ? latestCompanionView.sceneRefs.flatMap(ref => focusedCompanionMessage?.scenes?.filter(scene =>
      scene.id === ref.id && scene.revision === ref.revision) || []) : [];
  const presentedCompanionMoment = latestCompanionView?.comparison ? 'planning'
    : presentedCompanionScenes.map(companionSceneMoment).find(moment => moment !== undefined);
  const companionHint = currentCompanionActivity(messages);
  const d01CurrentTarget = currentWorkspaceReference(false) || comparisonContinuation?.target;
  const d01First = comparisonAnchor?.target || d01CurrentTarget;
  const d01Second = comparisonAnchor && d01CurrentTarget && workspaceTargetKey(comparisonAnchor.target) !== workspaceTargetKey(d01CurrentTarget)
    ? d01CurrentTarget : undefined;
  const d01FirstKey = d01First ? workspaceTargetKey(d01First) : '', d01SecondKey = d01Second ? workspaceTargetKey(d01Second) : '';
  const showCurrentWorkspaceReference = !comparisonAnchor || !!d01Second;
  const d01Keys = useRef(new Set<string>()); d01Keys.current = new Set([d01FirstKey, d01SecondKey].filter(Boolean));
  const d01Local = useRef({ view, notesUnsaved }); d01Local.current = { view, notesUnsaved };
  const d01Boundary = boundaryRevision.current;
  const d01Targets = useMemo<readonly CompanionD01Target[]>(() => {
    const entries = [...(d01First ? [{ slot: 'A' as const, target: d01First }] : []),
      ...(d01Second ? [{ slot: 'B' as const, target: d01Second }] : [])];
    return entries.map(({ slot, target }) => {
      const key = workspaceTargetKey(target);
      return { key: `${d01Boundary}:${key}`, slot, resolve: signal => resolveWorkspaceTargetRect(target, () => ({
        ...d01Local.current, note: returnOwners.current.note, material: returnOwners.current.material,
        noteChanges: noteAddressChanges.current,
        isCurrent: () => boundaryRevision.current === d01Boundary && d01Keys.current.has(key)
          && !navigationPending.current && surfaceMode.current !== 'public',
      }), signal) };
    });
  }, [d01FirstKey, d01SecondKey, d01Boundary, view, notesUnsaved, noteAddressRevision]);
  // Current direct references take precedence over the latest displayed paper.
  // This selects artwork only; no source is read, adopted or changed here.
  const companionActivity = focusActive || composerDock.target || currentComposerFollowup?.studyInteraction ? 'study'
    : currentComposerFollowup?.rehearsalInteraction ? 'listening'
    : view === 'materials' || materialQuote || materialDocument || noteQuote || conversationQuote || currentComposerFollowup?.noteReference ? 'reading'
      : agendaContext ? 'planning'
        : currentComposerFollowup?.curiosityReference ? 'play'
          : empty && startupReturn && startupReturnBoundary.current === boundaryRevision.current ? 'resume'
          : companionSceneMoment(selectedCompanionScene) || companionHint || presentedCompanionMoment
            || (chatSpace === 'reading' || needsReadingRoom || readingSelectedWork || hasScene ? 'reading' : 'chat');
  const canToggleRoom = view === 'chat' && companion.presence === 'window' && !compactConversation && !hasScene && !readingSelectedWork;
  const atWindow = homeVisible || view === 'chat' && companion.presence === 'window'
    && !focusActive && chatSpace !== 'reading' && !readingSelectedWork
    && (empty || (chatSpace === 'window' && !compactConversation && !hasScene));
  const workspaceScene = homeVisible ? undefined : view === 'materials' || view === 'chat' && !atWindow
    && (focusActive || !!composerDock.target || !!currentComposerFollowup?.studyInteraction
      || !!latestAssistant?.scenes?.some(scene => scene.kind === 'study' || scene.kind === 'study_reference')) ? 'study'
    : view === 'chat' && !atWindow ? latestAssistant?.views?.some(value => value.program || value.programReference) ? 'studio' : 'conversation'
    : view === 'keep' || view === 'notes' ? 'keep' : view === 'agenda' ? 'today'
    : view === 'memory' ? 'memory' : view === 'settings' || view === 'companion' ? 'settings' : undefined;
  const characterRoomWorkspace = !!workspaceScene && ['conversation', 'studio', 'study', 'today'].includes(workspaceScene)
    && companion.presence === 'window' && companion.character !== 'sakiko';
  useLayoutEffect(() => {
    const main = appMainRef.current, space = conversationSpaceRef.current, workspace = materialConversationTarget.current;
    if (workspaceScene || !roomLayout || !main || !space || !workspace || view !== 'chat' && view !== 'materials') {
      setRoomPaperPosition(null);
      return;
    }
    let frameRequest = 0;
    const measure = () => {
      const mainBox = main.getBoundingClientRect(), spaceBox = space.getBoundingClientRect(), workspaceBox = workspace.getBoundingClientRect();
      if (!mainBox.width || !mainBox.height || !spaceBox.width) return;
      const workspaceWidth = workspaceBox.width || spaceBox.width;
      const workspaceLeft = workspaceBox.width ? workspaceBox.left : spaceBox.left;
      const gutter = mainBox.width <= 600 ? 20 : 24;
      // Always project into the full, unstacked stage. The compact stage's
      // own resize report must not flip the decision back and forth.
      const fullFrame = companionRoomFrame(mainBox.width, mainBox.height, roomLayout.sourceCanvas.width, roomLayout.sourceCanvas.height, roomLayout.bodyBounds || undefined);
      const actor = roomLayout.actorVisible ? roomLayout.actorSourceRect : null;
      const readingTask = view === 'materials' || !atWindow || hasScene || readingSelectedWork;
      let spanLeft = gutter, spanRight = Math.max(gutter, workspaceWidth - gutter), paperSide: 'left' | 'right' = 'left';
      if (actor && !readingTask) {
        const actorLeft = mainBox.left + fullFrame.x + actor.left * fullFrame.scale - workspaceLeft;
        const actorRight = actorLeft + actor.width * fullFrame.scale;
        const leftEnd = Math.min(spanRight, actorLeft - 24), rightStart = Math.max(gutter, actorRight + 24);
        if (spanRight - rightStart > leftEnd - gutter) { spanLeft = rightStart; paperSide = 'right'; }
        else spanRight = leftEnd;
      }
      const held = !readingTask && roomLayout.interaction && roomLayout.interaction !== 'idle' ? roomPaperPositionRef.current : null;
      const stacked = !readingTask && (held ? held.mode === 'stacked' : mainBox.width <= 600 || spanRight - spanLeft < 320);
      if (stacked) { spanLeft = gutter; spanRight = Math.max(gutter, workspaceWidth - gutter); }
      const spanWidth = Math.max(0, spanRight - spanLeft), width = Math.min(readingTask ? hasScene ? 1160 : 800 : 720, spanWidth);
      const stageHeight = Math.min(280, spaceBox.width * 2 / 3, mainBox.height * .36);
      const stageWidth = stageHeight * 1.5;
      const next: RoomPaperPosition = {
        sourceKey: roomLayout.sourceKey, mode: stacked ? 'stacked' : 'side', paperSide,
        left: Math.round(spanLeft + (spanWidth - width) / 2), width: Math.floor(width),
        stageLeft: held?.stageLeft ?? (stacked ? Math.round(spaceBox.left - mainBox.left + (spaceBox.width - stageWidth) / 2) : 0),
        stageTop: held?.stageTop ?? (stacked ? Math.round(spaceBox.top - mainBox.top) : 0),
        stageWidth: held?.stageWidth ?? (stacked ? stageWidth : mainBox.width),
        stageHeight: held?.stageHeight ?? (stacked ? stageHeight : mainBox.height),
        contentTop: held?.contentTop ?? (stacked ? Math.ceil(stageHeight + 20) : 0),
      };
      setRoomPaperPosition(current => current && (Object.keys(next) as (keyof RoomPaperPosition)[]).every(key => current[key] === next[key]) ? current : next);
    };
    const schedule = () => { cancelAnimationFrame(frameRequest); frameRequest = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(main); observer.observe(space); observer.observe(workspace);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => { observer.disconnect(); cancelAnimationFrame(frameRequest); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); };
  }, [workspaceScene, roomLayout, view, readingPane, readingSide, empty, compactConversation, atWindow, hasScene, readingSelectedWork]);
  const roomPaperStyle = roomPaperPosition ? {
    '--room-paper-left': `${roomPaperPosition.left}px`, '--room-paper-width': `${roomPaperPosition.width}px`,
    '--room-stage-left': `${roomPaperPosition.stageLeft}px`, '--room-stage-top': `${roomPaperPosition.stageTop}px`,
    '--room-stage-width': `${roomPaperPosition.stageWidth}px`, '--room-stage-height': `${roomPaperPosition.stageHeight}px`,
    '--room-content-top': `${roomPaperPosition.contentTop}px`,
  } as CSSProperties : undefined;
  useLayoutEffect(() => {
    const viewport = scrollRef.current, anchor = readingAnchor.current;
    if (!viewport) return;
    if (followRef.current) viewport.scrollTop = viewport.scrollHeight;
    else if (anchor?.element.isConnected) viewport.scrollTop += anchor.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
  }, [atWindow]);
  const previousConversation = state?.conversations.find(conversation => conversation.id !== sessionId);
  function beginRehearsalCurrentRead(sourceSessionId: string | undefined, messageId: string, boundary: string, rehearsalId: string) {
    if (!draftReady || navigationPending.current || surfaceMode.current === 'public'
      || sourceSessionId !== sessionRef.current || boundary !== boundaryRevision.current
      || sceneSelectionRef.current || materialQuoteRef.current || materialDocumentRef.current || noteQuoteRef.current || assistantPassageRef.current
      || agendaContextRef.current || sharedMapContextRef.current || studyDockRef.current) return;
    const previous = composerFollowupRef.current;
    if (previous && !(previous.focusOnly && previous.messageId === messageId
      && previous.rehearsalInteraction?.kind === 'reference' && previous.rehearsalInteraction.ref.id === rehearsalId)) return;
    const selectedNavigation = navigation.current, searchRequest = ++searchNavigation.current,
      selectionRequest = sceneSelectionRequest.current,
      followupVersion = followupSequence.current, sendVersion = sendSequence.current;
    let accepted = false;
    return (ref: RehearsalRef) => {
      if (accepted || ref.id !== rehearsalId || navigationPending.current || surfaceMode.current === 'public'
        || sourceSessionId !== sessionRef.current || boundary !== boundaryRevision.current
        || selectedNavigation !== navigation.current || searchRequest !== searchNavigation.current
        || selectionRequest !== sceneSelectionRequest.current
        || followupVersion !== followupSequence.current || sendVersion !== sendSequence.current
        || composerFollowupRef.current !== previous || sceneSelectionRef.current || materialQuoteRef.current || materialDocumentRef.current
        || noteQuoteRef.current || conversationQuoteRef.current || assistantPassageRef.current || agendaContextRef.current || sharedMapContextRef.current || studyDockRef.current) return;
      accepted = true;
      // This is the result of the user's own open gesture, not an automatic
      // latest-message focus. Attach only its address; leave the writer alone.
      const next: ComposerFollowup = { text: '', focusOnly: false, focusLabel: '这段试说',
        rehearsalInteraction: { kind: 'reference', ref: { ...ref } }, token: ++followupSequence.current,
        sessionId: sourceSessionId, messageId, boundary };
      composerFollowupRef.current = next;
      setComposerFollowup(next);
    };
  }
  function usePresentationFollowup(request: PresentationFollowup, sourceSessionId: string | undefined, messageId: string, boundary: string, stillRequested?: () => boolean) {
    if (!draftReady || navigationPending.current || surfaceMode.current === 'public'
      || sourceSessionId !== sessionRef.current || boundary !== boundaryRevision.current || stillRequested && !stillRequested()) return;
    if (request.focusOnly && !request.programReference) {
      if (studyDockRef.current) return;
      const latestAssistant = messages.filter(message => message.role === 'assistant').at(-1);
      const key = automaticFollowupKey(request, messageId);
      if (messageId !== latestAssistant?.id || composerFollowupRef.current && !composerFollowupRef.current.focusOnly
        || sceneSelectionRef.current || materialQuoteRef.current || materialDocumentRef.current || noteQuoteRef.current || conversationQuoteRef.current || assistantPassageRef.current || agendaContextRef.current
        || sharedMapContextRef.current || key && key === dismissedFollowup.current) return;
      if (key && composerFollowupRef.current?.messageId === messageId
        && automaticFollowupKey(composerFollowupRef.current, messageId) === key) return;
    }
    let insertedText = request.text && draftRef.current.text.length === 0 && request.text.length <= LIMITS.draftText ? request.text : undefined;
    const explicitRehearsalRequest = request.rehearsalInteraction && !['utterance', 'reference'].includes(request.rehearsalInteraction.kind);
    const explicitNoteRequest = request.noteReference?.intent === 'continue_reading';
    if (request.text && (request.studyInteraction?.kind === 'request' || explicitRehearsalRequest || explicitNoteRequest) && draftRef.current.text.length > 0) {
      const original = draftRef.current.text;
      const combined = original.endsWith(request.text) ? original : original + '\n\n' + request.text;
      if (combined.length > LIMITS.draftText) {
        notify('原稿已保留，这次想怎么继续还没有添进输入。可以先删减一点，再选择。');
        return;
      }
      insertedText = combined;
    }
    const next: ComposerFollowup = { ...request, token: ++followupSequence.current,
      sessionId: sourceSessionId, messageId, boundary, ...(insertedText !== undefined ? { insertedText } : {}) };
    if (!request.focusOnly) searchNavigation.current++;
    clearMaterialQuote(); clearNativeReferences(); composerFollowupRef.current = next;
    setComposerFollowup(next);
    if (!request.studyInteraction && studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    if (request.studyInteraction || request.companionReference || request.curiosityReference || request.letterReference || request.rehearsalInteraction || request.noteReference || request.programReference || request.preparationReference) clearSceneSelection();
    if (request.focusOnly) {
      if (request.curiosityReference) {
        const key = `${sourceSessionId}/${messageId}/${request.curiosityReference.id}`;
        if (!readingStarts.current.has(key)) {
          readingStarts.current.add(key);
          if (followRef.current) {
            followRef.current = false;
            const gesture = readingGesture.current, selectedNavigation = navigation.current;
            const ownerId = request.curiosityReference.id;
            requestAnimationFrame(() => {
              const viewport = scrollRef.current;
              if (!viewport || gesture !== readingGesture.current || selectedNavigation !== navigation.current
                || sourceSessionId !== sessionRef.current || boundary !== boundaryRevision.current
                || composerFollowupRef.current?.token !== next.token) return;
              const message = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')].find(node => node.dataset.messageId === messageId);
              const paper = [...(message?.querySelectorAll<HTMLElement>('[data-curiosity-id]') || [])].find(node => node.dataset.curiosityId === ownerId);
              const start = paper?.querySelector<HTMLElement>('.curiosity-opening') || paper?.querySelector<HTMLElement>('.curiosity-heading') || paper;
              if (start) viewport.scrollTo({ top: viewport.scrollTop + start.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 14,
                behavior: prefersQuietMotion() ? 'instant' : 'smooth' });
            });
          }
        }
      }
      return;
    }
    if (insertedText !== undefined) replaceDraft({ ...draftRef.current, text: insertedText });
    if (viewRef.current !== 'notes' || !notesDiscussion) setView('chat');
    setReadingPane('chat');
    requestAnimationFrame(() => {
      if (stillRequested && !stillRequested()) return;
      inputRef.current?.focus({ preventScroll: true });
      if (request.studyInteraction) revealPaperComposer();
    });
  }
  async function stopReply() {
    // An explicit stop also withdraws a supplement still waiting for the old
    // response to finish stopping. The user's draft and focus stay in place.
    sendSequence.current++;
    await attempt(() => api.stop());
    await attempt(() => recoverSubmissions());
  }
  function useSuggestion(text: string, context?: LetterFocusContext | PreparationFocusContext) {
    searchNavigation.current++;
    if (context) {
      usePresentationFollowup({ text, ...context }, sessionRef.current,
        messages.filter(message => message.role === 'assistant').at(-1)?.id || ('preparationReference' in context
          ? `preparation:${context.preparationReference.id}` : `letter:${context.letterReference.opportunityId}`), boundaryRevision.current);
      return;
    }
    if (viewRef.current !== 'notes' || !notesDiscussion) setView('chat');
    if (draftRef.current.text.trim()) {
      notify('输入框里还有草稿，已为你保留。可以接着补充。');
      inputRef.current?.focus();
      return;
    }
    replaceDraft({ ...draftRef.current, text });
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function notify(message: string) {
    setToast(message);
  }
  function isPublicSurface() { return surfaceMode.current === 'public'; }
  async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      notify(errorText(e));
    }
  }
  function updateState(next: State) {
    if (next.presentation && next.presentation.revision < surfaceRevision.current) return;
    const incompleteReturn = returnRestoring.current || !!pendingReturnPosition.current;
    // A private IPC response may arrive after a newer privacy/permission event.
    // It must not roll the boundary back and make old UI work valid again.
    if (next.presentation?.mode !== 'public' && boundaryRevision.current) {
      const [epoch, policy, sourceBoundary = 0] = boundaryRevision.current.split(':').map(Number);
      if (
        typeof next.privacyEpoch === 'number' &&
        (next.privacyEpoch < epoch || (next.privacyEpoch === epoch && ((next.policyRevision ?? 0) < policy
          || (next.policyRevision ?? 0) === policy && (next.sourceBoundary ?? 0) < sourceBoundary)))
      )
        return;
    }
    const nextBoundary = `${next.privacyEpoch}:${next.policyRevision}:${next.sourceBoundary ?? 0}`;
    if (next.presentation?.mode !== 'public' && boundaryRevision.current && nextBoundary !== boundaryRevision.current) {
      clearReturnBoundary();
      clearDeskReadings();
      sendReceipts.current.clear();
      setUnsentSubmissions([]);
    }
    if (next.presentation?.mode === 'public') cancelReturnResume();
    if (next.presentation) surfaceRevision.current = next.presentation.revision;
    if (next.presentation?.mode === 'public') {
      if (surfaceMode.current !== 'public') {
        if (!incompleteReturn) { captureWorkspaceReturn(); workspaceReturn.flush(); }
        const checkpoint = workspaceReturn.read();
        privateReturn.current = { sessionId: sessionRef.current, view: viewRef.current, boundary: boundaryRevision.current,
          ...(checkpoint?.view === viewRef.current && checkpoint.sessionId === sessionRef.current ? { checkpoint } : {}) };
      }
      surfaceMode.current = 'public';
      clearDeskReadings();
      setMessages([]);
      setInput('');
      setAttachments([]);
      setMemoryNotice(null);
      setToast('');
      clearMapContext(); setAgendaPosition(undefined);
      clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
      setMapSheet(null);
      setPreviewImage(undefined);
      setPanel(null);
      setResting(false);
      setScopeOpen(false);
      setDisplayReview(undefined);
      setAttachmentMenu(false);
      sendReceipts.current.clear();
      setUnsentSubmissions([]);
      setState(next);
      return;
    }
    surfaceMode.current = 'private';
    const revision = `${next.privacyEpoch}:${next.policyRevision}:${next.sourceBoundary ?? 0}`;
    if (boundaryRevision.current && boundaryRevision.current.split(':')[0] !== String(next.privacyEpoch)) {
      const navigation = ['settings', 'memory', 'companion'].includes(viewRef.current) ? settingsDraft.current.navigation : undefined;
      settingsDraft.current = navigation ? { navigation: { entry: navigation.entry, tab: navigation.tab,
        tiyiFocus: navigation.tiyiFocus, resume: true } } : {};
      setMemoryWorkspace(emptyMemoryWorkspace());
      setMatterInteractions({});
    }
    if (boundaryRevision.current && revision !== boundaryRevision.current) {
      clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences(); clearComparison(); clearSettingsContext();
      noteAddressChanges.current.clear();
    }
    if (boundaryRevision.current && revision !== boundaryRevision.current && sessionRef.current) {
      const selected = sessionRef.current;
      void api
        .messages(selected)
        .then((saved) => {
          if (
            selected !== sessionRef.current ||
            boundaryRevision.current !== revision ||
            surfaceMode.current === 'public'
          )
            return;
          setMessages((current) => current.map((m) => saved.find((s) => s.id === m.id) || m));
        })
        .catch(() => {});
      setMemoryNotice(null);
    }
    boundaryRevision.current = revision;
    knownMemories.current = new Set(next.memories.map((m) => m.id));
    setState(next);
  }
  function draftPrivacyEpoch(boundary: string) {
    const epoch = Number(boundary.split(':')[0]);
    if (!Number.isSafeInteger(epoch) || epoch < 1)
      throw new Error('这次还没取得保存草稿所需的信息，原稿仍留在输入框里。');
    return epoch;
  }
  function hostDraft(value: Draft): Draft {
    if (queueHostAvailable.current !== false) return value;
    const items = getDraftAttachments(value);
    if (items.length > 1) throw new Error('这几份原稿仍在窗口里，请重启在场后再一起留好。');
    const first = items[0];
    if (!first) return { text: value.text, attachment: null };
    const { attachmentId: _attachmentId, ...legacy } = first;
    return { text: value.text, attachment: legacy };
  }
  function replaceDraft(next: Draft, persist = true) {
    const boundary = boundaryRevision.current;
    next = withDraftAttachments(next, getDraftAttachments(next).map(item => item.attachmentId ? item : { ...item, attachmentId: crypto.randomUUID() }));
    draftRevision.current++;
    draftRef.current = next;
    setInput(next.text);
    setAttachments(getDraftAttachments(next));
    setDraftSaved(false);
    if (persist)
      void attempt(() =>
        api.saveDraft({
          id: draftKey.current,
          draft: hostDraft(next),
          privacyEpoch: draftPrivacyEpoch(boundary),
          ...(turnControlsRef.current.retention === 'session_only'
            ? { retention: 'session_only' as const }
            : {}),
        }),
      );
  }
  async function saveCurrentDraft() {
    if (savingDraft || navigationPending.current) return;
    const revision = draftRevision.current,
      id = draftKey.current,
      boundary = boundaryRevision.current,
      draft = draftRef.current;
    setSavingDraft(true);
    await attempt(async () => {
      await api.saveDraft({ id, draft: hostDraft(draft), privacyEpoch: draftPrivacyEpoch(boundary) });
      const info = await api.draftInfo(id);
      if (revision !== draftRevision.current || id !== draftKey.current || boundary !== boundaryRevision.current)
        throw new Error('原稿或所在对话已经有了变化，这次没有继续保存。');
      await api.persistDraft({ id, digest: info.digest, confirmed: true });
      if (revision === draftRevision.current) setDraftSaved(true);
    });
    setSavingDraft(false);
  }
  async function requestClose() {
    captureWorkspaceReturn(); workspaceReturn.flush();
    if (surfaceMode.current === 'public') {
      setPublicCloseNotice('请先结束展示，再关闭在场。未保存的草稿仍为你保留。');
      return;
    }
    if (!keepUnsavedEdits('关闭')) return;
    if (closePending.current) return;
    closePending.current = true;
    const closeBoundary = boundaryRevision.current, closeNavigation = navigation.current;
    try {
      if (!await keepProgramAdjustments()) return;
      const pending = await api.unsavedDrafts();
      if (closeBoundary !== boundaryRevision.current || closeNavigation !== navigation.current || isPublicSurface()) return;
      if (!pending.length) {
        api.window('close-confirmed');
        return;
      }
      const previews = await Promise.all(
        pending.map(async (item) => {
          const draft = await api.draft(item.id);
          return { ...item, text: draft.text, attachmentName: getDraftAttachments(draft).map(item => item.name).join('、') || undefined };
        }),
      );
      if (closeBoundary !== boundaryRevision.current || closeNavigation !== navigation.current || isPublicSurface()) return;
      setCloseError('');
      setClosingDrafts(previews);
    } catch (error) {
      notify(errorText(error));
    } finally {
      closePending.current = false;
    }
  }
  requestCloseRef.current = requestClose;
  async function keepProgramAdjustments() {
    const result = await flushProgramLocalStates();
    if (result.ok) return true;
    const source = result.issues.find(issue => issue.sessionId === sessionRef.current);
    if (source) {
      setPanel(null); setView('chat');
      requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(source.messageId)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' }));
    }
    notify(result.issues.some(issue => issue.reason === 'conflict')
      ? '这页作品在另一处也改过。眼前的调整还在，先回到作品选择要保留的版本。'
      : '这页作品的调整还没留好。眼前的内容还在，可以回到作品再试一次。');
    return false;
  }
  function keepUnsavedEdits(action: string) {
    if (bookmarkUnsaved.current) {
      setPanel(null);
      notify(`这段想法还没留好，先保存或放下，再${action}。`);
      return false;
    }
    const edit = [...actionEdits.current.values()].find(item => item.dirty || item.pending);
    if (edit) {
      setPanel(null); setView('chat');
      requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(edit.messageId)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' }));
      notify(edit.pending ? `这项安排正在处理，等结果回来再${action}。`
        : `安排的修改还没采用，先留好或取消修改，再${action}。`);
      return false;
    }
    if (materialUnsaved) {
      setView('materials'); setReadingPane('reader');
      notify(`批注还有没保存的修改，先把它留好或放下，再${action}。`);
      return false;
    }
    if (notesUnsaved) {
      setView('notes');
      notify(`记事本还有没保存的修改，先把它留好或放下，再${action}。`);
      return false;
    }
    return true;
  }
  useEffect(() => api?.onCloseRequest(() => void requestCloseRef.current()), []);
  async function openPreparationReference(ref: PreparationFocusReference) {
    if (navigationPending.current || isPublicSurface()) return;
    const requestId = ++preparationNavigation.current, read = ++searchNavigation.current,
      boundary = boundaryRevision.current, selectedSession = sessionRef.current;
    const current = () => requestId === preparationNavigation.current && read === searchNavigation.current
      && boundary === boundaryRevision.current && selectedSession === sessionRef.current
      && !navigationPending.current && !isPublicSurface();
    try {
      const next = await api.openPreparation(ref);
      if (!current()) return;
      updateState(next);
      if (!next.preparations?.some(item => item.id === ref.id && item.revision === ref.revision && item.helpRecordId === ref.helpRecordId)) {
        notify('这份准备已经变化或收起来了。'); return;
      }
      setView('chat'); setPreparationRequest({ ...ref, requestId });
    } catch (error) { if (current()) throw error; }
  }
  // A notification she sent leads back to where she said it.
  const navigateRef = useRef<(target: NavigationTarget) => void>(() => {});
  navigateRef.current = target => {
    const requestId = ++preparationNavigation.current, read = ++searchNavigation.current;
    void (async () => {
      if (target.sessionId) {
        setView('chat');
        if (sessionRef.current !== target.sessionId) await openConversation(target.sessionId);
        if (sessionRef.current !== target.sessionId) return;
      } else if (target.view === 'agenda') setView('agenda');
      if (!target.preparationRef) return;
      const next = await api.state();
      if (requestId !== preparationNavigation.current || read !== searchNavigation.current
        || target.sessionId && (sessionRef.current !== target.sessionId || viewRef.current !== 'chat')) return;
      updateState(next);
      const ref = target.preparationRef;
      if (!next.preparations?.some(item => item.id === ref.id && item.revision === ref.revision && item.helpRecordId === ref.helpRecordId)) {
        notify('这份准备已经变化或收起来了。');
        return;
      }
      setPreparationRequest({ ...ref, requestId });
    })().catch(error => {
      if (requestId === preparationNavigation.current && read === searchNavigation.current) notify(errorText(error));
    });
  };
  useEffect(() => api?.onNavigate?.(target => navigateRef.current(target)), []);
  function updateDraft(part: Partial<Draft>) {
    if (navigationPending.current) return;
    if ('attachment' in part) {
      if (part.attachment) appendAttachment(part.attachment);
      else replaceDraft(withDraftAttachments(draftRef.current, getDraftAttachments(draftRef.current).slice(1)));
      return;
    }
    replaceDraft({ ...draftRef.current, ...part });
  }
  function appendAttachment(value: DraftAttachment) {
    if (!draftReady || navigationPending.current || isPublicSurface()) return false;
    const current = getDraftAttachments(draftRef.current);
    let issue = current.length >= LIMITS.attachments ? '一次最多一起看三份文件或图片。'
      : queueHostAvailable.current === false && current.length ? '这次先保留眼前这一份。重启在场后，可以一起放三份。' : '';
    if (value.kind === 'image' && current.reduce((n, item) => n + (item.kind === 'image' ? item.dataUrl.length : 0), value.dataUrl.length) > LIMITS.imageDataUrls)
      issue = '这些图片合起来较大，请先留两张再继续。';
    if (current.some(item => item.kind === value.kind && (item.kind === 'image' && value.kind === 'image' ? item.dataUrl === value.dataUrl
      : item.kind === 'text' && value.kind === 'text' ? item.resource && value.resource ? item.resource.sha256 === value.resource.sha256 && item.resource.mediaType === value.resource.mediaType
        : item.name === value.name && item.text === value.text : false))) issue = '这份已经放进来了。';
    if (issue) {
      notify(issue);
      if (value.kind === 'text' && value.resource && !current.some(item => item.kind === 'text' && item.resource?.resourceId === value.resource!.resourceId))
        void attempt(() => api.materialsDiscard({ reference: value.resource! }));
      return false;
    }
    replaceDraft(withDraftAttachments(draftRef.current, [...current, { ...value, attachmentId: value.attachmentId || crypto.randomUUID() }]));
    return true;
  }
  async function chooseAttachment(kind: 'image' | 'text') {
    const key = draftKey.current, boundary = boundaryRevision.current, selectedNavigation = navigation.current;
    const selected = kind === 'image' ? await api.attachImage() : await api.attachText();
    if (!selected) return;
    if (key !== draftKey.current || boundary !== boundaryRevision.current || selectedNavigation !== navigation.current || isPublicSurface()) {
      if (selected.kind === 'text' && selected.resource) await api.materialsDiscard({ reference: selected.resource });
      return;
    }
    appendAttachment(selected);
    inputRef.current?.focus({ preventScroll: true });
  }
  async function recoverSubmissions(boundary = boundaryRevision.current) {
    let pending: Awaited<ReturnType<typeof api.draftSubmissions>> = [];
    try {
      if (typeof api.draftSubmissions === 'function') { pending = await api.draftSubmissions(); queueHostAvailable.current = true; }
      else queueHostAvailable.current = false;
    }
    catch (error) {
      const raw = String(error instanceof Error ? error.message : error);
      if (/No handler registered for ['"]draft:submissions['"]/.test(raw)) queueHostAvailable.current = false;
      else throw error;
    }
    const [nativeDrafts, currentState] = await Promise.all([api.unsavedDrafts(), api.state()]);
    const knownSessions = new Set(currentState.conversations.map(item => item.id));
    const orphanDrafts = await Promise.all(nativeDrafts.filter(item => item.id !== 'new' && item.id !== draftKey.current
      && !item.id.startsWith('submission-') && !knownSessions.has(item.id)).slice(0, 16).map(async item => ({ id: item.id, draft: await api.draft(item.id) })));
    if (boundary !== boundaryRevision.current || isPublicSurface()) return;
    const recovered = pending.filter(item => !item.admitted).map((item, index): UnsentSubmission => ({
      id: item.draft.submission!.id, ownerKey: item.id, sequence: -(index + 1),
      draftKey: item.draft.submission!.draftKey === draftKey.current || knownSessions.has(item.draft.submission!.draftKey)
        ? item.draft.submission!.draftKey : 'new',
      boundary, draft: item.draft, delivery: 'unconfirmed', processing: item.processing,
    }));
    recovered.push(...orphanDrafts.map((item, index): UnsentSubmission => ({ kind: 'draft', id: 'draft:' + item.id, ownerKey: item.id,
      sequence: -17 - index, draftKey: 'new', boundary, draft: item.draft, delivery: 'not-sent', processing: false })));
    const ids = new Set(recovered.map(item => item.id));
    setUnsentSubmissions(current => [...current.filter(item => ids.has(item.id)).map(item => ({ ...item,
      processing: recovered.find(value => value.id === item.id)?.processing })),
      ...recovered.filter(item => !current.some(old => old.id === item.id))]);
  }
  async function restoreUnsentSubmission(submission: UnsentSubmission) {
    if (sendPending.current || navigationPending.current || !draftReady || isPublicSurface()
      || submission.boundary !== boundaryRevision.current || submission.draftKey !== draftKey.current
      || draftRef.current.text.length || getDraftAttachments(draftRef.current).length) return;
    const boundary = boundaryRevision.current, key = draftKey.current, revision = draftRevision.current;
    await attempt(async () => {
      const status = submission.kind === 'draft' ? { draft: await api.draft(submission.ownerKey), processing: false, admitted: undefined }
        : (await api.draftSubmissions()).find(item => item.id === submission.ownerKey);
      if (status?.processing) { notify('这条还在确认使用范围，先停下这次处理，再取回原稿。'); return; }
      if (!status || status.admitted) {
        setUnsentSubmissions(current => current.filter(item => item.id !== submission.id));
        sendReceipts.current.delete(submission.id);
        notify(status?.admitted ? '这条已经被收下了，原件留在那条消息里。' : '这份原稿已不在未发区，可以先回原对话核对。'); return;
      }
      const { submission: _submission, ...restored } = structuredClone(status.draft);
      let restoredDocument: DocumentReference | undefined;
      if (_submission?.materialDocument) {
        try { restoredDocument = await readMaterialDocument(_submission.materialDocument, getDraftAttachments(restored)); }
        catch (error) { notify(errorText(error)); }
      }
      await api.saveDraft({ id: key, draft: hostDraft(restored), privacyEpoch: draftPrivacyEpoch(boundary),
        ...(_submission?.controls?.retention === 'session_only' || _submission?.controls?.memoryMode === 'session_only' ? { retention: 'session_only' as const } : {}) });
      if (key !== draftKey.current || boundary !== boundaryRevision.current || revision !== draftRevision.current || isPublicSurface()) return;
      replaceDraft(restored, false);
      if (_submission?.controls) { turnControlsRef.current = structuredClone(_submission.controls); setTurnControls(turnControlsRef.current); }
      if (restoredDocument) { materialDocumentRef.current = restoredDocument; setMaterialDocument(restoredDocument); }
      await api.saveDraft({ id: submission.ownerKey, draft: hostDraft({ text: '', attachment: null, attachments: [] }), privacyEpoch: draftPrivacyEpoch(boundary) });
      sendReceipts.current.delete(submission.id);
      setUnsentSubmissions(current => current.filter(item => item.id !== submission.id));
      inputRef.current?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    if (!api) {
      notify('请从桌面程序打开在场。');
      return;
    }
    setLoadError('');
    void (async () => {
      try {
        const next = await api.state();
        updateState(next);
        if (next.presentation?.mode === 'public') return;
        const [saved, info] = await Promise.all([api.draft('new'), api.draftInfo('new')]);
        if (!draftRevision.current) {
          replaceDraft(saved, false);
          setDraftSaved(info.persisted && !info.empty);
        }
        await recoverSubmissions();
        setDraftReady(true);
      } catch (error) {
        setLoadError(uiError(error, { operation: 'open' }));
      }
    })();
    return api.onEvent((event) => {
      if (event.type === 'note_changed') {
        const previous = noteAddressChanges.current.get(event.note.id);
        if (!previous || event.note.revision > previous.revision
          || event.note.revision === previous.revision && (event.note.sha256 !== previous.sha256 || event.note.state !== previous.state)) {
          noteAddressChanges.current.set(event.note.id, event.note);
          setNoteAddressRevision(value => value + 1);
        }
        return;
      }
      if (event.type === 'conversations') {
        setState((current) => (current ? { ...current, conversations: event.conversations } : current));
        return;
      }
      if (event.type === 'state') {
        const added = event.state.memories.find((m) => !knownMemories.current.has(m.id));
        if (added && activeRun.current) setMemoryNotice(added);
        updateState(event.state);
        return;
      }
      if (event.message.submissionId) sendReceipts.current.get(event.message.submissionId)?.receive(event.message);
      if (event.message.role === 'user' && event.message.authoredSource && event.message.submissionId) {
        const admittedId = event.message.submissionId;
        setUnsentSubmissions(current => current.filter(item => item.id !== admittedId));
      } else if (event.message.role === 'assistant' && event.message.status !== 'running' && event.message.submissionId) {
        void attempt(() => recoverSubmissions());
      }
      if (!sessionRef.current) {
        sessionRef.current = event.message.sessionId;
        setSessionId(event.message.sessionId);
      }
      if (event.message.sessionId !== sessionRef.current) return;
      if (event.message.role === 'assistant') activeRun.current = event.message.status === 'running';
      setMessages((previous) => {
        const index = previous.findIndex((m) => m.id === event.message.id);
        return index < 0
          ? [...previous, event.message]
          : previous.map((m, i) => (i === index ? event.message : m));
      });
    });
  }, [loadAttempt]);
  useEffect(() => {
    if (view === 'chat') {
      const gesture = readingGesture.current, selectedNavigation = navigation.current, boundary = boundaryRevision.current;
      const frame = requestAnimationFrame(() => {
        if (gesture !== readingGesture.current || selectedNavigation !== navigation.current || boundary !== boundaryRevision.current
          || viewRef.current !== 'chat' || returnRestoring.current) return;
        inputRef.current?.focus({ preventScroll: true });
        const anchor = readingAnchor.current,
          viewport = scrollRef.current;
        if (!followRef.current && anchor?.element.isConnected && viewport)
          viewport.scrollTop +=
            anchor.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [view]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), Math.max(2800, Math.min(15000, Array.from(toast).length * 90)));
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (!sharedMapContext) return;
    const timeout = setTimeout(
      () => { if (sharedMapContextRef.current === sharedMapContext) clearMapContext(); },
      Math.max(0, Date.parse(sharedMapContext.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [sharedMapContext]);
  useEffect(() => {
    if (!attachmentMenu) return;
    const close = (e: PointerEvent) => {
      if (!attachmentControl.current?.contains(e.target as Node)) setAttachmentMenu(false);
    };
    document.addEventListener('pointerdown', close);
    attachmentControl.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', close);
  }, [attachmentMenu]);
  useLayoutEffect(() => {
    if (!attachmentMenu) return;
    const place = () => {
      const trigger = attachmentTrigger.current,
        menu = attachmentMenuRef.current;
      if (!trigger || !menu) return;
      const anchor = trigger.getBoundingClientRect(),
        parent = (menu.offsetParent || trigger.parentElement) as HTMLElement | null;
      if (!parent) return;
      const origin = parent.getBoundingClientRect();
      const margin = 12,
        width = Math.min(238, window.innerWidth - margin * 2);
      const height = Math.min(menu.scrollHeight + menu.offsetHeight - menu.clientHeight, window.innerHeight - margin * 2);
      const above = anchor.top - height - 8;
      setAttachmentMenuPosition({
        position: 'absolute',
        width,
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin)) - origin.left + parent.scrollLeft - parent.clientLeft,
        top: Math.max(
          margin,
          Math.min(above >= margin ? above : anchor.bottom + 8, window.innerHeight - height - margin),
        ) - origin.top + parent.scrollTop - parent.clientTop,
        bottom: 'auto',
        maxHeight: window.innerHeight - margin * 2,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [attachmentMenu]);
  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport?.clientHeight) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.anchorNode && viewport.contains(selection.anchorNode)) followRef.current = false;
    if (followRef.current) viewport.scrollTo({ top: viewport.scrollHeight });
    setAway(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 24);
  }, [messages]);
  useLayoutEffect(() => {
    const viewport = scrollRef.current, content = viewport?.querySelector('.messages');
    if (!viewport || !content) return;
    const observer = new ResizeObserver(() => {
      if (!viewport.clientHeight) return;
      if (followRef.current) viewport.scrollTop = viewport.scrollHeight;
      setAway(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 24);
    });
    observer.observe(viewport); observer.observe(content);
    return () => observer.disconnect();
  }, [empty]);
  useLayoutEffect(() => {
    const el = inputRef.current;
    const resize = () => {
      if (!el?.isConnected || !el.getClientRects().length) return;
      const scrollTop = el.scrollTop;
      const caretAtEnd = document.activeElement === el && el.selectionStart === el.value.length;
      el.style.height = 'auto';
      const available = Math.max(44, Math.min(180, window.innerHeight * 0.28));
      el.style.height = Math.min(el.scrollHeight, available) + 'px';
      el.scrollTop = caretAtEnd ? el.scrollHeight : scrollTop;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [input, attachment, view, readingPane, empty, notesDiscussion, notesDiscussionHome, composerDock.target?.key]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (surfaceMode.current === 'public') return;
      if (mapSheet) return;
      if (document.querySelector('dialog[open]')) return;
      if (composing.current || e.isComposing || e.keyCode === 229) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && (!panel || panel === 'history')) {
        e.preventDefault();
        setPanel((p) => (p === 'history' ? null : 'history'));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !panel) {
        e.preventDefault();
        if (!busy) void newChat();
      }
      if (e.key === 'Escape' && attachmentMenu) {
        setAttachmentMenu(false);
        attachmentTrigger.current?.focus();
        return;
      }
      if (e.key === 'Escape' && view !== 'chat') {
        if (view === 'companion' || view === 'settings') closePersonal();
        else setView('chat');
        return;
      }
      if (e.key === 'Escape' && busy && !panel) void stopReply();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, panel, attachmentMenu, mapSheet, view]);
  async function newChat() {
    if (busy || sendPending.current || navigationPending.current || closePending.current) return;
    if (!keepUnsavedEdits('开始新的对话')) return;
    captureWorkspaceReturn(); workspaceReturn.flush();
    navigationPending.current = true;
    setNavigating(true);
    const token = ++navigation.current;
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    try {
      if (!await keepProgramAdjustments() || token !== navigation.current) return;
      clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences(); clearComparison(); clearSettingsContext();
      await attempt(async () => {
        if (sharedMapContext) {
          await api.shareMapContext({ enabled: false });
          clearMapContext(false);
        }
        if (sessionRef.current) updateState(await api.endConversation(sessionRef.current));
        const saved = await api.draft('new');
        if (token !== navigation.current) return;
        draftKey.current = 'new';
        clearDeskReadings();
        replaceDraft(saved, false);
        sessionRef.current = undefined;
        setSessionId(undefined);
        setMessages([]);
        setPanel(null);
        requestComposerMove(false); homeReturnView.current = 'chat';
        setWorkspaceView('chat'); setHomeVisible(true);
        followRef.current = true;
        startupReturnBoundary.current = boundaryRevision.current;
        setStartupReturn(workspaceReturn.read());
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      });
    } finally {
      navigationPending.current = false;
      setNavigating(false);
    }
  }
  async function openConversation(id: string, destination?: Extract<LocalSearchLocator, { kind: 'conversation' }>, stillRequested?: () => boolean) {
    if (busy || sendPending.current) {
      notify('先停止当前回复，再打开另一段对话。');
      return;
    }
    if (navigationPending.current || closePending.current) return;
    if (id !== sessionRef.current && !keepUnsavedEdits('打开另一段对话')) return;
    if (!stillRequested) { captureWorkspaceReturn(); workspaceReturn.flush(); }
    navigationPending.current = true;
    setNavigating(true);
    const token = ++navigation.current;
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    let opened: Message[] | undefined;
    try {
      if (!await keepProgramAdjustments() || token !== navigation.current || stillRequested && !stillRequested()) return;
      if (id !== sessionRef.current) { clearComparison(); clearSettingsContext(); }
      clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
      const read = async () => {
        if (sharedMapContext) {
          await api.shareMapContext({ enabled: false });
          clearMapContext(false);
        }
        if (sessionRef.current && sessionRef.current !== id)
          updateState(await api.endConversation(sessionRef.current));
        const readBoundary = boundaryRevision.current;
        const [next, saved, info] = await Promise.all([api.messages(id), api.draft(id), api.draftInfo(id)]);
        if (token !== navigation.current || readBoundary !== boundaryRevision.current || stillRequested && !stillRequested()) return;
        if (stillRequested && !next.length && !saved.text.trim() && !getDraftAttachments(saved).length) {
          const owners = await api.state();
          if (token !== navigation.current || readBoundary !== boundaryRevision.current || !stillRequested()) return;
          if (owners.presentation?.mode === 'public' || `${owners.privacyEpoch}:${owners.policyRevision}:${owners.sourceBoundary ?? 0}` !== readBoundary
            || !owners.conversations.some(item => item.id === id)) throw new Error('那段对话已经不在这里了。');
        }
        if (destination && !next.some(message => message.id === destination.messageId)) {
          notify('这句话已经不在原来的位置了，请重新找找。');
          return;
        }
        setSearchTarget(destination ? { locator: destination, requestId: ++searchNavigation.current } : undefined);
        draftKey.current = id;
        if (id !== sessionRef.current) clearDeskReadings();
        replaceDraft(saved, false);
        setDraftSaved(info.persisted && !info.empty);
        sessionRef.current = id;
        setSessionId(id);
        setMessages(next);
        opened = next;
        setPanel(null);
        setView('chat');
        followRef.current = !destination && !stillRequested;
      };
      if (stillRequested) await read(); else await attempt(read);
    } finally {
      navigationPending.current = false;
      setNavigating(false);
    }
    return opened;
  }
  async function restoreWorkspace(checkpoint: WorkspaceReturnCheckpoint) {
    if (!draftReady || busy || navigationPending.current || isPublicSurface() || !keepUnsavedEdits('回到书签')) return;
    const ticket = ++returnNavigation.current, boundary = boundaryRevision.current, gesture = readingGesture.current;
    let expectedNavigation = navigation.current;
    const expectedSearch = searchNavigation.current;
    returnRestoring.current = true;
    const originalSession = sessionRef.current;
    const previousReferences = { material: materialQuoteRef.current, document: materialDocumentRef.current, note: noteQuoteRef.current, conversation: conversationQuoteRef.current, assistant: assistantPassageRef.current,
      agenda: agendaContextRef.current, followup: composerFollowupRef.current };
    const current = () => ticket === returnNavigation.current && boundary === boundaryRevision.current
      && gesture === readingGesture.current && expectedNavigation === navigation.current && expectedSearch === searchNavigation.current && !isPublicSurface();
    const restored = structuredClone(checkpoint);
    const restorationProblems: string[] = [];
    try {
      let opened = messages;
      if (checkpoint.sessionId) {
        const opening = openConversation(checkpoint.sessionId, undefined, current);
        expectedNavigation = navigation.current;
        const result = await opening;
        if (!current()) return;
        if (!result) throw new Error('这段对话这次没能打开，原来的书签仍留在这里。');
        opened = result;
        if (checkpoint.message && !opened.some(message => message.id === checkpoint.message!.id)) delete restored.message;
      } else {
        if (!await keepProgramAdjustments() || !current()) return;
        if (sessionRef.current) updateState(await api.endConversation(sessionRef.current));
        if (!current()) return;
        const [saved, info] = await Promise.all([api.draft('new'), api.draftInfo('new')]);
        if (!current()) return;
        draftKey.current = 'new'; replaceDraft(saved, false); setDraftSaved(info.persisted && !info.empty);
        if (sessionRef.current) clearDeskReadings();
        sessionRef.current = undefined; setSessionId(undefined); setMessages([]); opened = [];
      }
      if (!current()) return;
      clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
      setSearchTarget(undefined); setPanel(null);
      pendingReturnPosition.current = { checkpoint: restored, ticket, boundary, gesture, navigation: expectedNavigation, search: expectedSearch, ready: false };
      if (restored.quote || restored.materialDocument) { delete restored.assistantText; delete restored.assistantTextKind; }
      if (restored.assistantText) {
        try {
          const selection = await assistantPassageFromMessages(restored.assistantText, opened, restored.assistantTextKind);
          if (!current()) return;
          assistantPassageRef.current = selection; setAssistantPassage(selection);
        } catch (problem) {
          if (!current()) return;
          delete restored.assistantText; delete restored.assistantTextKind;
          restorationProblems.push(`${uiError(problem)}。自己的草稿还在`);
        }
      }
      if (restored.study && restored.sessionId && !restored.quote && !restored.materialDocument && !restored.assistantText) {
        try {
          const saved = restored.study;
          const original = opened.find(message => message.id === saved.messageId)?.scenes?.find(scene =>
            (scene.kind === 'study' || scene.kind === 'study_reference') && scene.owner.id === saved.focus.studyId);
          if (!original || original.kind !== 'study' && original.kind !== 'study_reference')
            throw new Error('这条消息里已经找不到原来的陪学纸，请从当前对话里的纸页打开。');
          const scene = await api.studyProject({ sessionId: restored.sessionId, messageId: saved.messageId,
            studyId: original.owner.id, studyRevision: original.owner.revision, focus: saved.focus.target });
          if (!current()) return;
          if (scene.status === 'closed') {
            delete restored.study;
            restorationProblems.push('那张陪学纸已经收好，这次没有重新打开。需要时可以从原对话再接着看');
          }
          else {
            const focus = { sceneId: scene.id, sceneRevision: scene.revision, studyId: scene.owner.id,
              studyRevision: scene.owner.revision, target: scene.focus };
            restored.study = { ...saved, focus };
            const followup: ComposerFollowup = { text: '', studyInteraction: { kind: 'reference', focus }, focusLabel: scene.heading,
              token: ++followupSequence.current, sessionId: restored.sessionId, messageId: saved.messageId, boundary };
            composerFollowupRef.current = followup; setComposerFollowup(followup);
            returnStudyToken.current = followup.token;
          }
        } catch (problem) {
          if (!current()) return;
          delete restored.study;
          restorationProblems.push(`陪学纸这次没接回：${uiError(problem)}。可以从原对话里的纸页重新打开`);
        }
      } else if (restored.quote || restored.materialDocument || restored.assistantText) delete restored.study;
      if (restored.quote) delete restored.materialDocument;
      if (restored.materialDocument) {
        try {
          const next = await readMaterialDocument(restored.materialDocument);
          if (!current()) return;
          materialDocumentRef.current = next; setMaterialDocument(next);
        } catch (problem) {
          if (!current()) return;
          delete restored.materialDocument;
          restorationProblems.push(`这份资料这次没接回：${uiError(problem)}。原草稿还在，可以重新打开文件`);
        }
      }
      if (restored.quote) {
        try {
          let address = restored.quote;
          const materialId = address.kind === 'material' ? address.reference.resourceId : undefined;
          const attached = getDraftAttachments(draftRef.current).find(item => item.kind === 'text' && item.resource?.resourceId === materialId);
          if (address.kind === 'material' && attached?.kind === 'text' && attached.resource?.resourceId === address.reference.resourceId)
            address = { ...address, target: { kind: 'pending', reference: attached.resource } };
          const preview = await api.sourceBookmarkPreview(address);
          if (!current()) return;
          if (preview.reference.kind === 'material') {
            const quote = await api.materialsQuote({ target: address.kind === 'material' && address.target
              || { kind: 'saved', resourceId: preview.reference.reference.resourceId }, quote: preview.reference.reference });
            if (!current()) return;
            materialQuoteRef.current = quote; setMaterialQuote(quote);
          } else if (preview.reference.kind === 'notebook') {
            const quote = await api.notesQuote(preview.reference.reference);
            if (!current()) return;
            noteQuoteRef.current = quote; setNoteQuote(quote);
          } else {
            const quote = { reference: preview.reference.reference, title: preview.title };
            conversationQuoteRef.current = quote; setConversationQuote(quote);
          }
        } catch (problem) {
          if (!current()) return;
          const source = restored.quote.kind;
          delete restored.quote;
          restorationProblems.push(`那段引用这次没接回：${uiError(problem)}。可以${source === 'material' ? '在原资料里重新选这一段' : source === 'notebook' ? '在记事本里重新选这一句' : '回到原对话重新选这一句'}`);
        }
      }
      if (!current()) return;
      // Native panels report their re-read addresses. Do not write the saved
      // pointer back as if opening it had already succeeded.
      returnOwners.current = {};
      if (restored.agenda && restored.view === 'chat') {
        try {
          const latest = await api.state();
          if (!current()) return;
          if (typeof latest.privacyEpoch !== 'number' || typeof latest.policyRevision !== 'number') throw new Error('安排资料还没读全。');
          const address = restored.agenda, owner = latest.agenda.find(item => item.id === address.record.id
            && (item.revision || 1) === address.record.revision);
          if (owner && (!address.trial || !owner.done && !owner.allDayDate) && address.timeZone === (owner.timeZone || latest.settings.timeZone || DEFAULT_TIME_ZONE)) {
            if (address.trial) await api.agendaPreviewChange({ record: address.record, changes: { startsAt: address.trial.proposedStart,
              ...(address.trial.durationMinutes !== undefined ? { durationMinutes: address.trial.durationMinutes } : {}) }, timeZone: address.timeZone,
              privacyEpoch: latest.privacyEpoch, policyRevision: latest.policyRevision, sourceBoundary: latest.sourceBoundary ?? 0 });
            if (!current()) return;
            const focus: AgendaFocus = { record: address.record, ...(address.trial ? { trial: { ...address.trial } } : {}) };
            const context = { focus, label: owner.title };
            agendaContextRef.current = context; setAgendaContext(context); returnOwners.current.agenda = address;
          } else {
            delete restored.agenda;
            restorationProblems.push('那项安排已经有了变化，试放没有接回；可以到今天重新查看');
          }
        } catch (problem) {
          if (!current()) return;
          delete restored.agenda;
          restorationProblems.push(`安排的试放这次没接回：${uiError(problem)}。可以到今天重新查看`);
        }
      }
      if (!current()) return;
      const requestId = ticket;
      if (restored.view === 'keep') {
        setKeepLoading(true); setKeepError('');
        try {
          const fresh = await api.keepSnapshot();
          if (!current()) return;
          if (`${fresh.boundary.privacyEpoch}:${fresh.boundary.policyRevision}:${fresh.boundary.sourceBoundary}` !== boundary)
            throw new Error('留下的内容刚有变化，请重新打开这一页。');
          setKeepResult({ boundary, snapshot: fresh });
        } finally { if (current()) setKeepLoading(false); }
        setKeepOpened(true);
        setKeepWriting(!!restored.keep?.writing);
        if (restored.keep) setKeepSelectionRequest({ key: restored.keep.selectedKey, requestId });
        if (restored.material) {
          try {
            const address = restored.material;
            const original = await readMaterialDocument({ resourceId: address.resourceId, sha256: address.sha256,
              page: address.page, offset: address.offset });
            if (!current()) return;
            const queued = getDraftAttachments(draftRef.current).find(item => item.kind === 'text'
              && item.resource?.resourceId === address.resourceId && item.resource.sha256 === address.sha256);
            const item: ReadingDeskItem = queued ? attachmentDeskItem(queued)
              : { id: address.resourceId, kind: 'material', name: original.name, address: original.reference };
            setDeskExtras(previous => ({ boundary, items: [...(previous.boundary === boundary
              ? previous.items.filter(value => value.id !== item.id) : []), item] }));
            unsettledKeepMaterial.current = { resourceId: address.resourceId, sha256: address.sha256 };
          } catch (problem) {
            if (!current()) return;
            delete restored.material;
            restorationProblems.push(`这份原文这次没接回：${uiError(problem)}。笔记和草稿仍留在这里`);
          }
        }
      }
      if (restored.material) { setMaterialsOpened(true); setMaterialResume({ address: restored.material, requestId }); }
      if (restored.note) { setNotesOpened(true); setNoteResume({ address: restored.note, requestId }); }
      setNotesDiscussion(restored.view === 'notes' && !!restored.note?.discussion && !!(restored.quote || restored.sessionId));
      if (restored.agenda) { setAgendaOpened(true); setAgendaResume({ address: restored.agenda, requestId }); }
      setView(restored.view); setReadingPane(restored.readingPane || 'reader');
      followRef.current = !restored.message;
      pendingReturnPosition.current = { checkpoint: restored, ticket, boundary, gesture, navigation: expectedNavigation, search: expectedSearch, ready: true,
        positioned: pendingReturnPosition.current?.positioned };
      setStartupReturn(undefined);
      if (restorationProblems.length) notify(restorationProblems.join('。\n'));
    } catch (error) {
      if (current()) {
        pendingReturnPosition.current = undefined;
        if (sessionRef.current === originalSession) {
          materialQuoteRef.current = previousReferences.material; setMaterialQuote(previousReferences.material);
          materialDocumentRef.current = previousReferences.document; setMaterialDocument(previousReferences.document);
          noteQuoteRef.current = previousReferences.note; setNoteQuote(previousReferences.note);
          conversationQuoteRef.current = previousReferences.conversation; setConversationQuote(previousReferences.conversation);
          assistantPassageRef.current = previousReferences.assistant; setAssistantPassage(previousReferences.assistant);
          agendaContextRef.current = previousReferences.agenda; setAgendaContext(previousReferences.agenda);
          composerFollowupRef.current = previousReferences.followup; setComposerFollowup(previousReferences.followup);
        }
        throw error;
      }
    } finally {
      if (ticket === returnNavigation.current && !pendingReturnPosition.current) returnRestoring.current = false;
    }
  }
  useLayoutEffect(() => {
    const pending = pendingReturnPosition.current;
    if (!pending) return;
    if (pending.ticket !== returnNavigation.current || pending.boundary !== boundaryRevision.current
      || pending.gesture !== readingGesture.current || pending.navigation !== navigation.current || pending.search !== searchNavigation.current
      || isPublicSurface()) { cancelReturnResume(); return; }
    const saved = pending.checkpoint;
    if (view !== saved.view || saved.sessionId && sessionId !== saved.sessionId) return;
    const viewport = scrollRef.current;
    if (saved.message && viewport && !pending.positioned) {
      const element = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')].find(node => node.dataset.messageId === saved.message!.id);
      if (element) {
        viewport.scrollTop += element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - saved.message.offset;
        followRef.current = false;
        pending.positioned = true;
      }
    }
    if (!pending.ready) return;
    if (saved.view === 'keep' && saved.material && unsettledKeepMaterial.current) return;
    if (saved.study && view === 'chat') {
      const focus = saved.study.focus;
      const target = composerDock.target;
      if (!target || target.focus.studyId !== focus.studyId || target.focus.studyRevision !== focus.studyRevision) {
        const paper = [...(viewport?.querySelectorAll<HTMLElement>('[data-study-id]') || [])].find(node => node.dataset.studyId === focus.studyId);
        if (paper && viewport) {
          const bounds = paper.getBoundingClientRect(), frame = viewport.getBoundingClientRect();
          if (bounds.bottom <= frame.top || bounds.top >= frame.bottom) paper.scrollIntoView({ block: 'start' });
        }
        return;
      }
    }
    const editor = inputRef.current;
    if (saved.view === 'keep' && saved.keep?.writing && (!keepComposerHome || !keepComposerHome.contains(composerHost))) return;
    if (editor && saved.composer?.focused && (view === 'chat' || view === 'materials' || view === 'keep' && keepWriting)) {
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(Math.min(editor.value.length, saved.composer.start), Math.min(editor.value.length, saved.composer.end), saved.composer.direction);
      if (view === 'keep') revealKeepComposer();
    } else if (view === 'chat' && saved.message && viewport) {
      [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')].find(node => node.dataset.messageId === saved.message!.id)?.focus({ preventScroll: true });
    }
    pendingReturnPosition.current = undefined; returnRestoring.current = false;
    queueReturnCapture();
  }, [messages, view, sessionId, composerDock.target?.key, startupReturn, currentComposerFollowup?.token, keepWriting, keepComposerHome, keepReaderReadyRevision]);
  async function openSearchResult(locator: LocalSearchLocator) {
    if (surfaceMode.current === 'public' || navigationPending.current) return;
    if (locator.kind === 'conversation') { await openConversation(locator.sessionId, locator); return; }
    setSearchTarget({ locator, requestId: ++searchNavigation.current });
    if (locator.kind === 'note') { setNotesOpened(true); setView('notes'); }
    else { setView('materials'); setReadingPane('reader'); }
    setPanel(null);
  }
  useEffect(() => {
    if (!searchTarget || searchTarget.locator.kind !== 'conversation' || view !== 'chat'
      || sessionId !== searchTarget.locator.sessionId || locatedSearch.current === searchTarget.requestId) return;
    const targetId = searchTarget.locator.messageId;
    const frame = requestAnimationFrame(() => {
      const element = [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') || [])].find(element => element.dataset.messageId === targetId);
      if (!element) return;
      locatedSearch.current = searchTarget.requestId;
      followRef.current = false;
      element.classList.add('search-returned');
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: 'center', behavior: prefersQuietMotion() ? 'instant' : 'smooth' });
    });
    return () => {
      cancelAnimationFrame(frame);
      scrollRef.current?.querySelectorAll('.search-returned').forEach(element => element.classList.remove('search-returned'));
    };
  }, [searchTarget, sessionId, view]);
  async function send(
    value = draftRef.current.text,
    consumeDraft = true,
    retryImage?: Message['image'],
    retryControls?: TurnControls,
    summonEdge = false,
  ) {
    const text = value, comparisonText = text.trim();
    if (!comparisonText || composing.current || sendPending.current || (!consumeDraft && busy) || navigationPending.current || !draftReady
      || surfaceMode.current === 'public' || closePending.current) return;
    if (queueHostAvailable.current === false) { notify('这条还没有发出，原稿留在这里。重启在场后再继续就好。'); return; }
    if (homeVisible && consumeDraft) { requestComposerMove(false); setChatSpace('reading'); setHomeVisible(false); }
    sendPending.current = true;
    const sequence = ++sendSequence.current;
    const revision = draftRevision.current,
      previousKey = draftKey.current,
      selectedSessionId = sessionRef.current,
      selectedBoundary = boundaryRevision.current,
      selectedNavigation = navigation.current;
    if (summonEdge) edgeCall.current = { sequence, navigation: selectedNavigation, boundary: selectedBoundary,
      sessionId: selectedSessionId, messageIds: new Set(messages.map(message => message.id)) };
    const selectedControls = consumeDraft || summonEdge ? turnControlsRef.current : retryControls;
    const controls = selectedControls ? structuredClone(selectedControls) : undefined;
    const selectedAttachments = consumeDraft ? getDraftAttachments(draftRef.current) : [];
    const files = structuredClone(selectedAttachments), image = consumeDraft ? undefined : retryImage;
    const submissionId = crypto.randomUUID(), ownerKey = 'submission-' + submissionId;
    const selectedScene = consumeDraft ? sceneSelectionRef.current : undefined;
    const selectedMaterialQuote = consumeDraft || summonEdge ? materialQuoteRef.current : undefined;
    const edgeOriginal = !consumeDraft && summonEdge && selectedMaterialQuote ? getDraftAttachments(draftRef.current)
      .find(item => item.kind === 'text' && item.resource?.resourceId === selectedMaterialQuote.resourceId
        && item.resource.sha256 === selectedMaterialQuote.sha256) : undefined;
    // An explicit quotation may refer to an original still owned by this
    // draft. Admit that exact file through the existing native ingress; no
    // other queued attachment or unfinished words join the cat's request.
    const selectedMaterialDocument = consumeDraft ? materialDocumentRef.current
      : edgeOriginal?.kind === 'text' && edgeOriginal.resource ? { reference: { resourceId: edgeOriginal.resource.resourceId,
        sha256: edgeOriginal.resource.sha256 }, name: edgeOriginal.name, mediaType: edgeOriginal.resource.mediaType } : undefined;
    const selectedNoteQuote = consumeDraft || summonEdge ? noteQuoteRef.current : undefined;
    const selectedConversationQuote = consumeDraft || summonEdge ? conversationQuoteRef.current : undefined;
    const selectedAssistantPassage = consumeDraft || summonEdge ? assistantPassageRef.current : undefined;
    const selectedAgendaContext = consumeDraft ? agendaContextRef.current : undefined;
    const selectedMapContext = consumeDraft ? sharedMapContextRef.current : undefined;
    const selectedFollowup = consumeDraft ? composerFollowupRef.current : undefined;
    const selectedComparison = consumeDraft ? comparisonAnchorRef.current : undefined;
    const selectedComparisonContinuation = consumeDraft ? comparisonContinuationRef.current : undefined;
    const currentSelectedWorkspaceTarget = consumeDraft ? currentWorkspaceReference(false) : undefined;
    const selectedWorkspaceInputReader = currentSelectedWorkspaceTarget?.kind === 'interactive' ? selectedFollowup?.readProgramInputs
      : selectedComparisonContinuation?.readProgramInputs;
    const selectedWorkspaceAddress = consumeDraft ? currentSelectedWorkspaceTarget
      || (selectedComparison ? selectedComparisonContinuation?.target : undefined) || currentWorkspaceReference()
      : summonEdge ? currentWorkspaceTarget({ materialQuote: selectedMaterialQuote ? materialQuoteAddress(selectedMaterialQuote) : undefined,
        noteQuote: selectedNoteQuote ? noteQuoteAddress(selectedNoteQuote) : undefined,
        conversationQuote: selectedConversationQuote?.reference, assistantTextReference: selectedAssistantPassage?.reference }) : undefined;
    const selectedWorkspaceTarget = workspaceTargetAtSend(selectedWorkspaceAddress, selectedWorkspaceInputReader);
    const selectedComparisonTarget = workspaceTargetAtSend(selectedComparison?.target, selectedComparison?.readProgramInputs);
    if (selectedWorkspaceAddress?.kind === 'interactive' && selectedWorkspaceInputReader && !selectedWorkspaceTarget
      || selectedComparison?.target.kind === 'interactive' && selectedComparison.readProgramInputs && !selectedComparisonTarget) {
      sendPending.current = false;
      notify('这页刚有变化，请重新点选想聊的部分，草稿还在。');
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const selectedWorkspaceLabel = currentWorkspaceLabel();
    const selectedSettingsContext = consumeDraft ? settingsContextRef.current : undefined;
    const focusedSettingsContext = !selectedWorkspaceTarget && !selectedComparison ? selectedSettingsContext : undefined;
    const workspaceContext = workspaceSendContext(focusedSettingsContext ? focusedSettingsContext.section === 'companion' ? 'characters'
      : focusedSettingsContext.section === 'reading' ? 'appearance' : focusedSettingsContext.section === 'memory' ? 'memory' : 'settings'
      : homeVisible ? 'home' : workspaceSurface(viewRef.current, messages.length === 0, selectedWorkspaceTarget),
      selectedWorkspaceTarget, selectedComparisonTarget, selectedFollowup?.messageId);
    if (focusedSettingsContext) workspaceContext.settingsContext = structuredClone(focusedSettingsContext);
    const validFollowup = selectedFollowup && selectedFollowup.sessionId === selectedSessionId && selectedFollowup.boundary === selectedBoundary
      ? selectedFollowup : undefined;
    const selectedStudyDock = consumeDraft && !validFollowup && !selectedScene && !selectedMaterialQuote && !selectedMaterialDocument
      && !selectedNoteQuote && !selectedConversationQuote && !selectedAssistantPassage && !selectedAgendaContext && !selectedMapContext ? studyDockRef.current : undefined;
    const studyInteraction: StudyInteraction | undefined = validFollowup?.studyInteraction
      ? validFollowup.studyInteraction.kind !== 'request' && validFollowup.studyInteraction.kind !== 'attempt'
        || validFollowup.insertedText?.trim() === comparisonText
        ? validFollowup.studyInteraction
        : validFollowup.insertedText !== undefined && validFollowup.studyInteraction.kind === 'attempt'
          ? { ...validFollowup.studyInteraction, text }
          : { kind: 'reference', focus: validFollowup.studyInteraction.focus }
      : selectedStudyDock ? { kind: 'reference', focus: selectedStudyDock.focus } : undefined;
    const rehearsalInteraction: RehearsalInteraction | undefined = validFollowup?.rehearsalInteraction
      ? ['utterance', 'reference'].includes(validFollowup.rehearsalInteraction.kind) || validFollowup.insertedText?.trim() === comparisonText
        ? validFollowup.rehearsalInteraction : { kind: 'reference', ref: validFollowup.rehearsalInteraction.ref }
      : undefined;
    const noteReference = validFollowup?.noteReference && (validFollowup.noteReference.intent !== 'continue_reading'
      || validFollowup.insertedText?.trim() === comparisonText) ? validFollowup.noteReference : undefined;
    let programReference = validFollowup?.programReference;
    if (programReference && validFollowup?.readProgramInputs) {
      const inputs = validFollowup.readProgramInputs();
      programReference = { messageId: programReference.messageId, programId: programReference.programId,
        revision: programReference.revision, nodeId: programReference.nodeId,
        ...(inputs !== undefined ? { inputs } : {}) };
    }
    const documentQueued = selectedMaterialDocument && files.some(item => item.kind === 'text' && item.resource?.resourceId === selectedMaterialDocument.reference.resourceId && item.resource.sha256 === selectedMaterialDocument.reference.sha256);
    if (files.length + (selectedMaterialDocument && !documentQueued ? 1 : 0) > LIMITS.attachments || sendReceipts.current.size >= 16
      || text.length + files.reduce((n, item) => n + item.name.length + (item.kind === 'text' && !item.resource ? item.text.length : 0), 0) > LIMITS.message
      || files.reduce((n, item) => n + (item.kind === 'image' ? item.dataUrl.length : 0), 0) > LIMITS.imageDataUrls) {
      sendPending.current = false; notify(sendReceipts.current.size >= 16 ? '还有未确认的原稿，先取回处理好再继续。' : '一次最多三份，文字和图片也要留在可一起读取的大小内。原稿还在。'); return;
    }
    let studyAddressUnavailable = false;
    const stillCurrent = () => sequence === sendSequence.current && selectedNavigation === navigation.current
      && selectedSessionId === sessionRef.current && selectedBoundary === boundaryRevision.current && !isPublicSurface()
      && (!summonEdge || selectedControls === turnControlsRef.current && selectedMaterialQuote === materialQuoteRef.current
        && selectedNoteQuote === noteQuoteRef.current && selectedConversationQuote === conversationQuoteRef.current && selectedAssistantPassage === assistantPassageRef.current)
      && (!consumeDraft || selectedControls === turnControlsRef.current && selectedScene === sceneSelectionRef.current
        && selectedMaterialQuote === materialQuoteRef.current
        && selectedMaterialDocument === materialDocumentRef.current
        && selectedNoteQuote === noteQuoteRef.current && selectedConversationQuote === conversationQuoteRef.current && selectedAssistantPassage === assistantPassageRef.current
        && selectedAgendaContext === agendaContextRef.current
        && selectedMapContext === sharedMapContextRef.current
        && selectedComparison === comparisonAnchorRef.current
        && selectedComparisonContinuation === comparisonContinuationRef.current
        && selectedSettingsContext === settingsContextRef.current
        && selectedFollowup?.token === composerFollowupRef.current?.token
        && (!selectedStudyDock || studyAddressUnavailable || selectedStudyDock.key === studyDockRef.current?.key));
    const submittedDraft: Draft = withDraftAttachments({ text, attachment: null, submission: { id: submissionId, draftKey: previousKey, ...(controls ? { controls } : {}),
      ...(selectedMaterialDocument ? { materialDocument: { resourceId: selectedMaterialDocument.reference.resourceId, sha256: selectedMaterialDocument.reference.sha256 } } : {}) } }, files);
    let detachedRevision = revision, accepted = false, ipcStarted = false, ownerClaimed = false;
    setStarting(true);
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    if (summonEdge) {
      followRef.current = false;
      rememberReadingPosition();
    } else {
      followRef.current = true;
      setAway(false);
      const viewport = scrollRef.current;
      if (viewport?.clientHeight) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'instant' });
    }
    try {
      if (consumeDraft) {
        // Claim every immutable original before detaching this editor. Its
        // next draft may release those files independently during admission.
        await api.saveDraft({ id: ownerKey, draft: submittedDraft, privacyEpoch: draftPrivacyEpoch(selectedBoundary),
          ...(controls?.retention === 'session_only' || temporaryConversation ? { retention: 'session_only' as const } : {}) });
        ownerClaimed = true;
        if (!stillCurrent()) return;
        const current = draftRef.current, sentIds = new Set(files.map(item => item.attachmentId));
        const remaining = getDraftAttachments(current).filter(item => !sentIds.has(item.attachmentId));
        const nextText = current.text === text ? '' : current.text.startsWith(text) ? current.text.slice(text.length) : current.text;
        flushSync(() => replaceDraft(withDraftAttachments({ ...current, text: nextText }, remaining)));
        detachedRevision = draftRevision.current;
      }
      if (consumeDraft && (busy || activeRun.current)) await api.stop();
      if (!stillCurrent()) return;
      if (studyInteraction && selectedSessionId) {
        try {
          const messageId = selectedFollowup?.messageId || selectedStudyDock?.messageId;
          const originalStudy = messageId ? messages.find(message => message.id === messageId)?.scenes?.find(scene =>
            (scene.kind === 'study' || scene.kind === 'study_reference') && scene.owner.id === studyInteraction.focus.studyId) : undefined;
          const sourceRevision = originalStudy && (originalStudy.kind === 'study' || originalStudy.kind === 'study_reference')
            ? originalStudy.owner.revision : studyInteraction.focus.studyRevision;
          const current = await api.studyProject({ sessionId: selectedSessionId,
            ...(messageId ? { messageId } : {}),
            studyId: studyInteraction.focus.studyId, studyRevision: sourceRevision,
            focus: studyInteraction.focus.target, historyLimit: 8 });
          if (current.owner.revision !== studyInteraction.focus.studyRevision) {
            if (!stillCurrent()) return;
            await composerDock.refreshStudy(studyInteraction.focus.studyId);
            if (selectedFollowup && selectedFollowup.token === composerFollowupRef.current?.token
              && selectedNavigation === navigation.current && selectedBoundary === boundaryRevision.current) {
              usePresentationFollowup({ text: '', focusLabel: '更新后的这一页', studyInteraction: { kind: 'reference', focus: {
                sceneId: current.id, sceneRevision: current.revision, studyId: current.owner.id,
                studyRevision: current.owner.revision, target: current.focus,
              } } }, selectedSessionId, selectedFollowup.messageId, selectedBoundary);
            }
            notify('这一页已经有了新进展，草稿还在。先看看更新后的纸，再决定怎么继续。');
            return;
          }
        } catch (error) {
          if (!stillCurrent()) return;
          studyAddressUnavailable = true;
          await composerDock.refreshStudy(studyInteraction.focus.studyId);
          notify(errorText(error));
          // The formal compiler can mark the old address unavailable while
          // still hearing this new user message. No cached paper body enters it.
        }
      }
      if (!stillCurrent()) return;
      if (selectedMaterialDocument && !documentQueued) {
        try { await readMaterialDocument(selectedMaterialDocument.reference); }
        catch (error) { if (stillCurrent()) { clearMaterialDocument(); notify(errorText(error)); } return; }
      }
      if (!stillCurrent()) return;
      if (selectedMapContext && Date.parse(selectedMapContext.expiresAt) <= Date.now()) {
        clearMapContext(); notify('这次地图参考已经收起，草稿还在。可以重新选这条路。'); return;
      }
      if (selectedNoteQuote) {
        try { await api.notesQuote(noteQuoteAddress(selectedNoteQuote)); }
        catch (error) {
          if (stillCurrent()) { clearNoteQuote(); notify(errorText(error)); }
          return;
        }
      }
      if (!stillCurrent()) return;
      if (selectedConversationQuote) {
        try { await api.sourceBookmarkPreview({ kind: 'conversation', reference: selectedConversationQuote.reference }); }
        catch (error) { if (stillCurrent()) { clearConversationQuote(); notify(errorText(error)); } return; }
      }
      if (!stillCurrent()) return;
      let progressSessionId: string | undefined;
      const adoptProgress = (nextSessionId: string) => {
        progressSessionId = nextSessionId;
        if (sequence !== sendSequence.current || selectedNavigation !== navigation.current
          || selectedBoundary !== boundaryRevision.current || isPublicSurface()
          || draftKey.current !== previousKey && draftKey.current !== nextSessionId
          || sessionRef.current !== selectedSessionId && sessionRef.current !== nextSessionId) return;
        sessionRef.current = nextSessionId;
        if (edgeCall.current?.sequence === sequence && edgeCall.current.navigation === selectedNavigation
          && edgeCall.current.boundary === selectedBoundary) edgeCall.current.sessionId = nextSessionId;
        setSessionId(nextSessionId);
        const previousDraftKey = draftKey.current;
        draftKey.current = nextSessionId;
        // Only the independently edited next draft changes its owner key.
        // The immutable submission keeps its own native owner until admission.
        if (previousDraftKey !== nextSessionId && (consumeDraft || summonEdge)) {
          replaceDraft({ ...draftRef.current });
          if (previousDraftKey === 'new') void attempt(() => api.saveDraft({ id: 'new',
            draft: { text: '', attachment: null, attachments: [] }, privacyEpoch: draftPrivacyEpoch(selectedBoundary) }));
        }
        setUnsentSubmissions(current => current.map(item => item.draftKey === previousKey && item.boundary === selectedBoundary
          ? { ...item, draftKey: nextSessionId } : item));
      };
      const acknowledgeSubmission = (acceptedSessionId: string) => {
        if (accepted) return;
        accepted = true;
        sendReceipts.current.delete(submissionId);
        setUnsentSubmissions(current => current.filter(item => item.id !== submissionId));
        adoptProgress(acceptedSessionId);
        if (sequence !== sendSequence.current || selectedNavigation !== navigation.current
          || selectedBoundary !== boundaryRevision.current || isPublicSurface()
          || sessionRef.current !== acceptedSessionId) return;
        if (consumeDraft && selectedControls === turnControlsRef.current) { turnControlsRef.current = {}; setTurnControls({}); }
        if (consumeDraft && composerFollowupRef.current?.token === selectedFollowup?.token) clearFollowup();
        if (consumeDraft && sceneSelectionRef.current === selectedScene) clearSceneSelection();
        if (consumeDraft && materialQuoteRef.current === selectedMaterialQuote) clearMaterialQuote();
        if (consumeDraft && materialDocumentRef.current === selectedMaterialDocument) clearMaterialDocument(false);
        if (consumeDraft && noteQuoteRef.current === selectedNoteQuote) clearNoteQuote();
        if (consumeDraft && conversationQuoteRef.current === selectedConversationQuote) clearConversationQuote();
        if (consumeDraft && assistantPassageRef.current === selectedAssistantPassage) clearAssistantPassage();
        if (consumeDraft && agendaContextRef.current === selectedAgendaContext) clearAgendaContext();
        if (consumeDraft && selectedSettingsContext === settingsContextRef.current) clearSettingsContext();
        if (selectedComparison && selectedWorkspaceTarget && !sameWorkspaceTarget(selectedComparison.target, selectedWorkspaceTarget)) {
          const continued = { target: structuredClone(selectedWorkspaceTarget), label: selectedWorkspaceLabel,
            ...(selectedWorkspaceInputReader ? { readProgramInputs: selectedWorkspaceInputReader } : {}) };
          comparisonContinuationRef.current = continued; setComparisonContinuation(continued);
        }
      };
      const previousMessageIds = new Set(messages.map(message => message.id));
      sendReceipts.current.set(submissionId, { sequence, receive: message => {
        if (message.submissionId !== submissionId || previousMessageIds.has(message.id)
          || selectedSessionId !== undefined && message.sessionId !== selectedSessionId
          || message.presentationBoundaryKey !== selectedBoundary) return;
        if (message.role === 'assistant') {
          if (message.status !== 'running' && !accepted) {
            sendReceipts.current.delete(submissionId);
            setUnsentSubmissions(current => current.map(item => item.id === submissionId ? { ...item, delivery: 'not-sent', processing: false } : item));
          }
          return;
        }
        if (message.role !== 'user' || message.status !== 'done') return;
        adoptProgress(message.sessionId);
        // A preliminary echo has no authoredSource. The host stamps this only
        // after the real authored/file/image events and each material binding.
        if (!message.authoredSource || message.authoredSource.eventId !== message.id
          || Array.from(message.content).slice(0, message.authoredSource.displayEnd).join('') !== text) return;
        const actual = message.attachments || [];
        const matching = actual.filter(item => files.some(file => file.attachmentId === item.attachmentId));
        if (consumeDraft && (matching.length !== files.length || files.some((file, index) => {
          const item = matching[index];
          if (!item || item.attachmentId !== file.attachmentId || item.kind !== file.kind) return true;
          return file.kind === 'image' ? item.kind !== 'image' || item.dataUrl !== file.dataUrl
            : item.kind !== 'text' || item.resource?.resourceId !== file.resource?.resourceId || item.resource?.sha256 !== file.resource?.sha256;
        }))) return;
        if (!consumeDraft && message.image?.dataUrl !== image?.dataUrl) return;
        acknowledgeSubmission(message.sessionId);
      } });
      ipcStarted = true;
      const result = await api.send({ sessionId: selectedSessionId, submissionId, content: text, controls, workspaceContext,
        ...(consumeDraft ? { attachments: files } : {}),
        ...(selectedScene ? { selection: selectedScene } : {}), ...(studyInteraction ? { studyInteraction } : {}),
        ...(validFollowup?.companionReference ? { companionReference: validFollowup.companionReference } : {}),
        ...(validFollowup?.curiosityReference ? { curiosityReference: validFollowup.curiosityReference } : {}),
        ...(programReference ? { programReference } : {}),
        ...(validFollowup?.preparationReference ? { preparationReference: validFollowup.preparationReference } : {}),
        ...(validFollowup?.letterReference ? { letterReference: validFollowup.letterReference } : {}),
        ...(noteReference ? { noteReference } : {}),
        ...(selectedMaterialQuote ? { materialQuote: materialQuoteAddress(selectedMaterialQuote) } : {}),
        ...(selectedNoteQuote ? { noteQuote: noteQuoteAddress(selectedNoteQuote) } : {}),
        ...(selectedConversationQuote ? { conversationQuote: selectedConversationQuote.reference } : {}),
        ...(selectedMaterialDocument ? { materialDocument: { resourceId: selectedMaterialDocument.reference.resourceId,
          sha256: selectedMaterialDocument.reference.sha256 } } : {}),
        ...(selectedAgendaContext ? { agendaFocus: selectedAgendaContext.focus } : {}),
        ...(selectedMapContext?.routeReference ? { mapRouteReference: selectedMapContext.routeReference } : {}),
        ...(rehearsalInteraction ? { rehearsalInteraction } : {}),
        ...(image ? { image } : {}) });
      adoptProgress(result.sessionId);
      if (isPublicSurface() || selectedNavigation !== navigation.current || selectedBoundary !== boundaryRevision.current) return;
    } catch (e) {
      if (selectedNavigation === navigation.current && selectedBoundary === boundaryRevision.current && !isPublicSurface()) notify(errorText(e));
    } finally {
      if (consumeDraft && ownerClaimed && !accepted && selectedBoundary === boundaryRevision.current && !isPublicSurface()) {
        let status: Awaited<ReturnType<typeof api.draftSubmissions>>[number] | undefined;
        let statusKnown = false, restored = false;
        try { status = (await api.draftSubmissions()).find(item => item.id === ownerKey); statusKnown = true; }
        catch (error) { notify(errorText(error)); }
        // This exact native owner is removed only by a matching real admission
        // (or this editor's explicit restore). IPC return alone never removes it.
        if (!accepted && statusKnown && !status && ipcStarted) {
          accepted = true; sendReceipts.current.delete(submissionId);
          setUnsentSubmissions(current => current.filter(item => item.id !== submissionId));
        }
        const sameOwner = selectedNavigation === navigation.current && previousKey === draftKey.current && selectedSessionId === sessionRef.current;
        if (!accepted && !ipcStarted && sameOwner && detachedRevision === draftRevision.current) {
          try {
            const { submission: _submission, ...original } = submittedDraft;
            await api.saveDraft({ id: previousKey, draft: original, privacyEpoch: draftPrivacyEpoch(selectedBoundary) });
            if (sameOwner && detachedRevision === draftRevision.current && selectedBoundary === boundaryRevision.current) {
              replaceDraft(original, false);
              await api.saveDraft({ id: ownerKey, draft: { text: '', attachment: null, attachments: [] }, privacyEpoch: draftPrivacyEpoch(selectedBoundary) });
              restored = true;
            }
          } catch (error) { notify(errorText(error)); }
        }
        if (!accepted && !restored) setUnsentSubmissions(current => current.some(item => item.id === submissionId) ? current : [...current, {
          id: submissionId, ownerKey, sequence, draftKey: selectedNavigation === navigation.current ? draftKey.current : previousKey,
          boundary: selectedBoundary, draft: submittedDraft,
          delivery: ipcStarted && (!statusKnown || status?.processing) ? 'unconfirmed' : 'not-sent', processing: status?.processing,
        }]);
        if (!ipcStarted || statusKnown && !status?.processing) sendReceipts.current.delete(submissionId);
      } else if (accepted || !ipcStarted || !ownerClaimed) sendReceipts.current.delete(submissionId);
      sendPending.current = false;
      setStarting(false);
      if (!summonEdge && selectedNavigation === navigation.current && selectedBoundary === boundaryRevision.current && !isPublicSurface()) inputRef.current?.focus({ preventScroll: true });
    }
  }
  async function saveAction(
    item: Action,
    action: 'save' | 'delete' | 'done' = 'save',
  ): Promise<ActionResult> {
    try {
      updateState(await api.action({ item, action }));
      if (action === 'done') notify('这件事，完成了。');
      return { ok: true };
    } catch (error) {
      const text = errorText(error);
      notify(text);
      return { ok: false, error: text };
    }
  }
  async function undoAction(effect: ActionEffectRef): Promise<ActionResult> {
    try {
      updateState(await api.action({ action: 'undo', effect }));
      return { ok: true };
    } catch (error) {
      const text = errorText(error);
      notify(text);
      return { ok: false, error: text };
    }
  }
  async function prepareDisplay(
    input: { sessionId: string; id: string; revision: number } | { matter: SharedMatterView },
  ) {
    const boundary = boundaryRevision.current;
    if (!keepUnsavedEdits('开始展示')) return;
    await attempt(async () => {
      await api.saveDraft({
        id: draftKey.current,
        draft: hostDraft(draftRef.current),
        privacyEpoch: draftPrivacyEpoch(boundary),
        ...(turnControlsRef.current.retention === 'session_only'
          ? { retention: 'session_only' as const }
          : {}),
      });
      const next =
        'matter' in input
          ? await api.selectPublicMatter({ id: input.matter.id, revision: input.matter.revision })
          : await api.selectPublicArtifact(input);
      updateState(next);
      setDisplayReview(next.presentation);
    });
  }
  async function endDisplay() {
    const next = await api.setPresentationSurface('private');
    updateState(next);
    const previous = privateReturn.current;
    if (previous.checkpoint && previous.boundary === boundaryRevision.current) {
      await restoreWorkspace(previous.checkpoint);
      await recoverSubmissions(); setDraftReady(true);
      return;
    }
    if (previous.sessionId) await openConversation(previous.sessionId);
    else {
      const saved = await api.draft('new');
      draftKey.current = 'new';
      replaceDraft(saved, false);
      setMessages([]);
      setSessionId(undefined);
      sessionRef.current = undefined;
    }
    setView(previous.view);
    await recoverSubmissions();
    setDraftReady(true);
  }
  function quotePassage(text: string) {
    const quote =
      '关于你刚才这段：\n' +
      text
        .split('\n')
        .map((line) => '> ' + line)
        .join('\n') +
      '\n\n我想继续问：';
    const next = draftRef.current.text ? draftRef.current.text + '\n\n' + quote : quote;
    if (next.length > LIMITS.draftText) { notify('这段有些长，可以少选一点，再接着聊。'); return; }
    searchNavigation.current++;
    replaceDraft({ ...draftRef.current, text: next });
    setReadingPane('chat');
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }
  function focusComposerAfterRead(owns: () => boolean) {
    pendingReadFocus.current = { owns, gesture: readingGesture.current, navigation: navigation.current,
      search: searchNavigation.current, boundary: boundaryRevision.current, sessionId: sessionRef.current };
    requestAnimationFrame(settleReadFocus);
  }
  function settleReadFocus() {
    const request = pendingReadFocus.current;
    if (!request) return;
    if (request.gesture !== readingGesture.current || request.navigation !== navigation.current || request.search !== searchNavigation.current
      || request.boundary !== boundaryRevision.current || request.sessionId !== sessionRef.current || isPublicSurface()
      || !['chat', 'materials', 'keep', 'notes'].includes(viewRef.current) || !request.owns()) { pendingReadFocus.current = undefined; return; }
    const input = inputRef.current;
    if (!input?.isConnected || !input.getClientRects().length || input.disabled) return;
    input.focus({ preventScroll: true }); pendingReadFocus.current = undefined; revealKeepComposer();
    if (viewRef.current === 'notes') (input.closest<HTMLElement>('.composer-area') || input)
      .scrollIntoView({ block: 'nearest', behavior: prefersQuietMotion() ? 'instant' : 'smooth' });
  }
  function quoteMaterial(quote: MaterialQuote, stayHere = false) {
    if (!draftReady || navigating || navigationPending.current || isPublicSurface()) return false;
    searchNavigation.current++;
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    clearSceneSelection(); clearFollowup(); clearNativeReferences();
    materialQuoteRef.current = quote; setMaterialQuote(quote);
    if (stayHere && viewRef.current === 'keep') setKeepWriting(true);
    else if (stayHere && viewRef.current === 'notes') setNotesDiscussion(true);
    setReadingPane('chat');
    queueReturnCapture();
    focusComposerAfterRead(() => materialQuoteRef.current === quote);
    return true;
  }
  async function readMaterialDocument(reference: MaterialDocumentAddress, originals = getDraftAttachments(draftRef.current)): Promise<DocumentReference> {
    const attached = originals.find(item => item.kind === 'text' && item.resource?.resourceId === reference.resourceId);
    const pending = attached?.kind === 'text' ? attached.resource : undefined;
    if (pending && pending.sha256 !== reference.sha256) throw new Error('这份资料已经换过，回原文件重新拿起就好。');
    const page = await api.materialsRead({ target: pending ? { kind: 'pending', reference: pending }
      : { kind: 'saved', resourceId: reference.resourceId }, page: reference.page || 1, offset: reference.offset || 0, view: 'text' });
    if (page.item.sha256 !== reference.sha256) throw new Error('这份资料已经换过，回原文件重新拿起就好。');
    // Only owner metadata and an address survive this local read. Neither a
    // synthetic excerpt nor the returned body is added to the authored draft.
    return { reference: { resourceId: page.item.resourceId, sha256: page.item.sha256,
      ...(page.page ? { page: page.page } : {}), offset: page.start }, name: page.item.name, mediaType: page.item.mediaType };
  }
  async function pickMaterialDocument(reference: MaterialDocumentAddress) {
    if (!draftReady || navigating || navigationPending.current || isPublicSurface()) return;
    const request = ++documentRequest.current, boundary = boundaryRevision.current, selectedSession = sessionRef.current,
      selectedNavigation = navigation.current, gesture = readingGesture.current;
    const owns = () => request === documentRequest.current && boundary === boundaryRevision.current && selectedSession === sessionRef.current;
    const current = () => owns() && selectedNavigation === navigation.current && gesture === readingGesture.current
      && !navigationPending.current && !isPublicSurface();
    documentReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDocumentPreview(undefined); setDocumentPreviewPending(true); setDocumentPreviewIssue('');
    try { const next = await readMaterialDocument(reference); if (current()) setDocumentPreview(next); }
    catch (error) { if (current()) setDocumentPreviewIssue(errorText(error)); }
    finally { if (owns()) setDocumentPreviewPending(false); }
  }
  async function acceptMaterialDocument() {
    if (!documentPreview || documentPreviewPending || !draftReady || navigating || navigationPending.current || isPublicSurface()) return;
    const selected = documentPreview, request = ++documentRequest.current, boundary = boundaryRevision.current,
      selectedSession = sessionRef.current, selectedNavigation = navigation.current, gesture = readingGesture.current;
    const owns = () => request === documentRequest.current && boundary === boundaryRevision.current && selectedSession === sessionRef.current;
    const current = () => owns() && selectedNavigation === navigation.current && gesture === readingGesture.current
      && !navigationPending.current && !isPublicSurface();
    setDocumentPreviewPending(true); setDocumentPreviewIssue('');
    try {
      const next = await readMaterialDocument(selected.reference);
      if (!current()) return;
      searchNavigation.current++;
      if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
      clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences(); clearSettingsContext();
      materialDocumentRef.current = next; setMaterialDocument(next); documentReturnFocus.current = null;
      setReadingPane('chat'); queueReturnCapture();
      focusComposerAfterRead(() => materialDocumentRef.current === next);
    } catch (error) { if (current()) setDocumentPreviewIssue(errorText(error)); }
    finally { if (owns()) setDocumentPreviewPending(false); }
  }
  async function openMaterialDocumentSource(reference: MaterialDocumentAddress) {
    if (navigationPending.current || isPublicSurface()) return;
    if (viewRef.current === 'keep') readerReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const request = ++searchNavigation.current, boundary = boundaryRevision.current, selectedSession = sessionRef.current,
      selectedNavigation = navigation.current, gesture = readingGesture.current;
    const current = () => request === searchNavigation.current && boundary === boundaryRevision.current && selectedSession === sessionRef.current
      && selectedNavigation === navigation.current && gesture === readingGesture.current && !navigationPending.current && !isPublicSurface();
    try {
      const next = await readMaterialDocument(reference);
      if (!current()) return;
      const offset = next.reference.offset || 0;
      openDeskItem({ id: next.reference.resourceId, kind: 'material', name: next.name, address: next.reference });
      setSearchTarget({ locator: { kind: 'material', resourceId: next.reference.resourceId, sha256: next.reference.sha256,
        ...(next.reference.page ? { page: next.reference.page } : {}), field: 'body', offset, end: offset }, requestId: request });
      setReadingPane('reader');
    } catch (error) { if (current()) throw error; }
  }
  function focusAssistantPassage(reference: AssistantTextReference, preview: string, kind: AssistantPassage['kind'], boundary: string) {
    if (!draftReady || navigationPending.current || isPublicSurface() || boundary !== boundaryRevision.current
      || reference.sessionId !== sessionRef.current || !assistantTextReferenceSchema.safeParse(reference).success) return;
    searchNavigation.current++;
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences(); clearSettingsContext();
    const selection = { reference, preview, kind };
    assistantPassageRef.current = selection; setAssistantPassage(selection);
    requestComposerMove(); composerDock.returnToChat();
    if (viewRef.current !== 'notes' || !notesDiscussion) setView('chat');
    setReadingPane('chat'); queueReturnCapture();
    window.getSelection()?.removeAllRanges();
    focusComposerAfterRead(() => assistantPassageRef.current === selection);
  }
  async function openAssistantPassage(selection: AssistantPassage) {
    if (navigationPending.current || isPublicSurface() || selection.reference.sessionId !== sessionRef.current) return;
    const boundary = boundaryRevision.current, request = ++searchNavigation.current, selectedSession = sessionRef.current;
    const current = () => request === searchNavigation.current && boundary === boundaryRevision.current
      && selectedSession === sessionRef.current && assistantPassageRef.current === selection && !isPublicSurface();
    try {
      const originals = await api.messages(selectedSession!);
      if (!current()) return;
      await assistantPassageFromMessages(selection.reference, originals, selection.kind);
      if (!current()) return;
      setMessages(originals);
      if (viewRef.current !== 'notes' || !notesDiscussion) setView('chat');
      requestAnimationFrame(() => {
        if (!current()) return;
        const message = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(selection.reference.messageId)}"]`);
        const address = selection.reference;
        const fragment = [...message?.querySelectorAll<HTMLElement>('[data-assistant-text-start][data-assistant-text-end]') || []]
          .find(node => Number(node.dataset.assistantTextStart) <= address.start && Number(node.dataset.assistantTextEnd) >= address.end);
        const offset = Number(fragment?.dataset.assistantTextStart);
        const formula = fragment && [...fragment.querySelectorAll<HTMLElement>('[data-focus-math-start][data-focus-math-end]')]
          .find(node => Number(node.dataset.focusMathStart) === address.start - offset && Number(node.dataset.focusMathEnd) === address.end - offset);
        const passage = fragment && [...fragment.querySelectorAll<HTMLElement>('[data-focus-start][data-focus-end]')]
          .find(node => Number(node.dataset.focusStart) <= address.start - offset && Number(node.dataset.focusEnd) > address.start - offset);
        (formula || passage || message)?.scrollIntoView({ block: 'center', behavior: prefersQuietMotion() ? 'instant' : 'smooth' });
        message?.focus({ preventScroll: true }); followRef.current = false;
      });
    } catch (problem) {
      if (current()) { clearAssistantPassage(); notify(`${uiError(problem)}。原稿还在。`); }
    }
  }
  function quoteNote(quote: NoteQuote, stayHere = false) {
    if (!draftReady || navigating || navigationPending.current || isPublicSurface()) return false;
    searchNavigation.current++;
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
    noteQuoteRef.current = quote; setNoteQuote(quote);
    if (stayHere && viewRef.current === 'keep') setKeepWriting(true);
    else if (stayHere && viewRef.current === 'notes') setNotesDiscussion(true);
    else setView('chat');
    setReadingPane('chat');
    queueReturnCapture();
    focusComposerAfterRead(() => noteQuoteRef.current === quote);
    return true;
  }
  async function discussBookmark(reference: SourceBookmarkReference) {
    const stayHere = viewRef.current === 'keep' || viewRef.current === 'notes';
    const boundary = boundaryRevision.current, selectedSession = sessionRef.current, gesture = readingGesture.current,
      selectedNavigation = navigation.current, selectedRead = ++searchNavigation.current;
    const current = () => boundary === boundaryRevision.current && selectedSession === sessionRef.current
      && gesture === readingGesture.current && selectedNavigation === navigation.current && selectedRead === searchNavigation.current
      && !navigationPending.current && !isPublicSurface();
    if (!current()) return false;
    if (reference.kind === 'material') {
      const quote = await api.materialsQuote({ target: reference.target || { kind: 'saved', resourceId: reference.reference.resourceId },
        quote: materialQuoteAddress(reference.reference) });
      return current() && quoteMaterial(quote, stayHere);
    }
    if (reference.kind === 'notebook') {
      const quote = await api.notesQuote(noteQuoteAddress(reference.reference));
      return current() && quoteNote(quote, stayHere);
    }
    const preview = await api.sourceBookmarkPreview(reference);
    if (!current() || preview.reference.kind !== 'conversation') return false;
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    searchNavigation.current++;
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
    const selected = { reference: preview.reference.reference, title: preview.title };
    conversationQuoteRef.current = selected; setConversationQuote(selected);
    if (stayHere && viewRef.current === 'keep') setKeepWriting(true);
    else if (stayHere && viewRef.current === 'notes') setNotesDiscussion(true);
    else setView('chat');
    setReadingPane('chat');
    queueReturnCapture();
    focusComposerAfterRead(() => conversationQuoteRef.current === selected);
    return true;
  }
  async function openBookmarkedStudy(location: StudyBookmarkDestination) {
    if (!draftReady || navigationPending.current || isPublicSurface() || !location.messageId || location.sessionId !== sessionRef.current) return;
    const message = messages.find(value => value.id === location.messageId && value.sessionId === location.sessionId && value.role === 'assistant');
    const original = message?.scenes?.find(value => (value.kind === 'study' || value.kind === 'study_reference') && value.owner.id === location.studyId);
    if (!message || !original || original.kind !== 'study' && original.kind !== 'study_reference')
      throw new Error('这张推导纸的位置刚有变化，请从原消息重新打开。');
    const ticket = ++returnNavigation.current, boundary = boundaryRevision.current, gesture = readingGesture.current, selectedNavigation = navigation.current;
    let selectedRead = ++searchNavigation.current;
    const current = () => ticket === returnNavigation.current && boundary === boundaryRevision.current && gesture === readingGesture.current
      && selectedNavigation === navigation.current && selectedRead === searchNavigation.current && sessionRef.current === location.sessionId
      && !navigationPending.current && !isPublicSurface();
    returnRestoring.current = true;
    try {
      const scene = await api.studyProject({ sessionId: location.sessionId, messageId: message.id,
        studyId: location.studyId, studyRevision: original.owner.revision });
      if (!current()) return;
      if (scene.status === 'closed') throw new Error('这张推导纸已经结束了，可以从原消息查看。');
      const focus = { sceneId: scene.id, sceneRevision: scene.revision, studyId: scene.owner.id,
        studyRevision: scene.owner.revision, target: scene.focus };
      usePresentationFollowup({ text: '', studyInteraction: { kind: 'reference', focus }, focusLabel: scene.heading }, location.sessionId, message.id, boundary, current);
      selectedRead = searchNavigation.current;
      if (!current() || composerFollowupRef.current?.studyInteraction?.focus.studyId !== location.studyId) return;
      returnStudyToken.current = composerFollowupRef.current.token;
      const editor = inputRef.current;
      const checkpoint: WorkspaceReturnCheckpoint = { sessionId: location.sessionId, view: 'chat', savedAt: Date.now(),
        message: { id: message.id, offset: 14 }, study: { messageId: message.id, focus },
        ...(editor ? { composer: { start: editor.selectionStart, end: editor.selectionEnd, direction: editor.selectionDirection, focused: true } } : {}) };
      pendingReturnPosition.current = { checkpoint, ticket, boundary, gesture, navigation: selectedNavigation, search: selectedRead, ready: true };
      setStartupReturn(undefined);
    } finally {
      if (ticket === returnNavigation.current && !pendingReturnPosition.current) returnRestoring.current = false;
    }
  }
  async function openConversationSource(reference: ConversationBookmarkReference) {
    if (navigationPending.current || isPublicSurface()) return;
    const boundary = boundaryRevision.current, selectedSession = sessionRef.current, gesture = readingGesture.current,
      selectedNavigation = navigation.current, selectedRead = ++searchNavigation.current;
    const preview = await api.sourceBookmarkPreview({ kind: 'conversation', reference });
    if (boundary !== boundaryRevision.current || selectedSession !== sessionRef.current || gesture !== readingGesture.current
      || selectedNavigation !== navigation.current || selectedRead !== searchNavigation.current
      || navigationPending.current || isPublicSurface()) return;
    if (preview.locator) await openSearchResult(preview.locator);
  }
  async function openBookmarkSource(source: SourceBookmarkReference) {
    if (viewRef.current === 'keep') readerReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (source.kind === 'material') await openMaterialSource(source.reference);
    else if (source.kind === 'notebook') await openNoteSource(source.reference);
    else await openConversationSource(source.reference);
  }
  async function openKeptWork(source: KeepWorkLocator) {
    const boundary = boundaryRevision.current;
    const opened = await openConversation(source.sessionId);
    if (!opened || boundary !== boundaryRevision.current || source.sessionId !== sessionRef.current || isPublicSurface()) return;
    const message = opened.find(item => item.id === source.messageId);
    const view = message?.views?.find(item => item.id === source.programId && item.revision === source.revision);
    if (!view || view.program && view.program.hash !== source.programHash) throw new Error('这份作品后来有了变化，可以从原对话看看现在这一版。');
    setView('chat'); setReadingPane('chat'); followRef.current = false;
    requestAnimationFrame(() => {
      const article = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(source.messageId)}"]`);
      const program = article?.querySelector<HTMLElement>(`[data-program-id="${CSS.escape(source.programId)}"]`) || article;
      program?.scrollIntoView({ block: 'start', behavior: 'auto' });
      program?.querySelector<HTMLElement>('.interactive-document')?.focus({ preventScroll: true });
    });
  }
  async function openReplySource(source: ReplySourceAddress) {
    if (navigationPending.current || isPublicSurface()) return;
    const boundary = boundaryRevision.current, selectedSession = sessionRef.current, gesture = readingGesture.current;
    const current = () => boundary === boundaryRevision.current && selectedSession === sessionRef.current
      && gesture === readingGesture.current && !navigationPending.current && !isPublicSurface();
    if (source.kind === 'notebook') {
      if (source.end > source.start) await openNoteSource({ id: source.noteId, revision: source.revision, sha256: source.sha256, start: source.start, end: source.end });
      else openMaterialNote(source.noteId, source.revision);
      return;
    }
    if (source.kind === 'interactive') { await openKeptWork(source); return; }
    if (source.kind === 'scene') {
      const opened = await openConversation(source.sessionId);
      if (!opened || boundary !== boundaryRevision.current || source.sessionId !== sessionRef.current || isPublicSurface()) return;
      const message = opened.find(item => item.id === source.messageId);
      if (!message?.scenes?.some(scene => scene.id === source.sceneId && scene.revision === source.revision))
        throw new Error('这一页原来的内容这会儿读不到，可以回原对话看看现在的进展。');
      followRef.current = false;
      requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(source.messageId)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' }));
      return;
    }
    if (source.kind === 'material') {
      const read = await api.materialsRead({ target: source.target, page: source.page || 1, offset: source.start || 0, view: 'text' });
      if (!current()) return;
      if (read.item.resourceId !== source.resourceId || read.item.sha256 !== source.sha256) throw new Error('原文件后来有了变化，请重新打开这份资料。');
      openDeskItem({ id: source.resourceId, kind: 'material', name: read.item.name,
        ...(source.target.kind === 'pending' ? { pending: { kind: 'text', name: read.item.name, text: '', resource: source.target.reference } } : {}),
        address: { resourceId: source.resourceId, sha256: source.sha256, page: source.page || 1, offset: source.start || 0 } });
      const start = source.start || 0, end = source.end !== undefined && source.end - start <= 4000 ? source.end : start;
      setSearchTarget({ locator: { kind: 'material', resourceId: source.resourceId, sha256: source.sha256,
        ...(read.item.mediaType === 'application/pdf' ? { page: source.page || 1 } : {}), field: 'body', offset: start, end }, requestId: ++searchNavigation.current });
      return;
    }
    const originals = await api.messages(source.sessionId);
    if (!current()) return;
    const message = originals.find(item => item.id === source.messageId);
    if (!message) throw new Error('这处原文现在读不到了，可以回原来的位置重新选择。');
    if (source.kind === 'conversation') {
      if (message.authoredSource && message.authoredSource.contentVersion !== source.contentVersion) throw new Error('这句原话后来有了变化，请重新选择现在这一版。');
      const text = authoredMessageContent(message), end = Math.min(Array.from(text).length, 4000);
      if (!end) throw new Error('这句原话现在没有可打开的内容。');
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (!current()) return;
      await openConversationSource({ sessionId: source.sessionId, messageId: source.messageId, contentVersion: source.contentVersion,
        sha256, start: 0, end });
    } else {
      const image = (message.attachments || (message.image ? [message.image] : [])).find(item => item.kind === 'image'
        && ('sourceEventId' in item && item.sourceEventId === source.sourceEventId
          || source.attachmentId && item.attachmentId === source.attachmentId || !message.attachments?.length && item === message.image));
      if (!image || image.kind !== 'image') throw new Error('原图片现在读不到了，可以从原消息重新添加。');
      const bytes = Uint8Array.from(atob(image.dataUrl.split(',')[1] || ''), value => value.charCodeAt(0));
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (!current()) return;
      if (sha256 !== source.sha256) throw new Error('原图片后来有了变化，请重新选择要看的那张。');
      openAttachment(image);
    }
  }
  async function openWorkspaceReference(target: WorkspaceTarget) {
    if (target.kind === 'material_quote') return openMaterialSource(target.reference);
    if (target.kind === 'note_quote') return openNoteSource(target.reference);
    if (target.kind === 'conversation_quote') return openConversationSource(target.reference);
    if (target.kind === 'preparation') return openPreparationReference(target.reference);
    if (target.kind === 'agenda') { setView('agenda'); return; }
    if (target.kind === 'notebook') { setView('notes'); return; }
    if (target.kind === 'material') return openMaterialDocumentSource(target.reference);
    if (target.kind === 'map_route') {
      const map = sharedMapContextRef.current;
      if (map?.routeReference?.selectionId === target.reference.selectionId && map.previewRoute)
        openMap(map.previewRoute, map.routeConditions, map.previewMemory);
      else notify('这条路线已经收起，可以从原来的地图重新选。');
      return;
    }
    const referenceMessageId = 'messageId' in target.reference ? target.reference.messageId : undefined;
    const message = target.kind === 'scene' ? messages.find(message => message.scenes?.some(scene => scene.id === target.reference.sceneId))
      : target.kind === 'study' ? messages.find(message => message.scenes?.some(scene => (scene.kind === 'study' || scene.kind === 'study_reference')
        && scene.owner.id === target.reference.studyId))
        : referenceMessageId ? messages.find(message => message.id === referenceMessageId) : undefined;
    if (!message) { notify('原来的那一处已经不在当前页，可以从原消息重新打开。'); return; }
    if (target.kind === 'study') return openBookmarkedStudy({ sessionId: message.sessionId, messageId: message.id, studyId: target.reference.studyId });
    setView('chat'); setReadingPane('chat');
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(message.id)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'auto' }));
  }
  function discussAgenda(focus: AgendaFocus, label: string) {
    if (!draftReady || navigationPending.current || isPublicSurface() || !state?.agenda.some(item =>
      item.id === focus.record.id && (item.revision || 1) === focus.record.revision)) return;
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
    const context = { focus, label };
    agendaContextRef.current = context; setAgendaContext(context);
    const owner = state.agenda.find(item => item.id === focus.record.id)!;
    const previous = returnOwners.current.agenda;
    returnOwners.current.agenda = { record: focus.record, timeZone: owner.timeZone || state.settings.timeZone || DEFAULT_TIME_ZONE,
      ...(focus.trial ? { trial: { ...focus.trial,
        ...(focus.trial.durationMinutes === undefined && previous?.record.id === focus.record.id && previous.record.revision === focus.record.revision
          && previous.trial?.proposedStart === focus.trial.proposedStart && previous.trial.durationMinutes !== undefined
          ? { durationMinutes: previous.trial.durationMinutes } : {}) } } : {}) };
    setView('chat'); setReadingPane('chat');
    queueReturnCapture();
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }
  function openMap(route: MapRouteResult, conditions?: SharedMapRoute, memory?: MapContextHandoff['previewMemory']) {
    setMapSheetConditions(conditions); setMapSheetMemory(memory); setMapSheet(route);
  }
  function useMapContext(value: MapContextHandoff) {
    if (!draftReady || navigationPending.current || isPublicSurface() || !Number.isFinite(Date.parse(value.expiresAt))
      || Date.parse(value.expiresAt) <= Date.now()) return false;
    const text = value.text.trim();
    const next = text ? draftRef.current.text ? draftRef.current.text + '\n' + text : text : draftRef.current.text;
    if (next.length > LIMITS.draftText) { notify('原稿还在，先删减一点再带回地点。'); return false; }
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearMaterialDocument(); clearNoteQuote(); clearConversationQuote(); clearAgendaContext();
    sharedMapContextRef.current = value; setSharedMapContext(value);
    if (text) replaceDraft({ ...draftRef.current, text: next });
    setView('chat'); setReadingPane('chat');
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return true;
  }
  async function openNoteSource(source: NoteQuoteReference) {
    if (navigationPending.current || isPublicSurface()) return;
    const boundary = boundaryRevision.current, selectedSession = sessionRef.current, request = ++searchNavigation.current;
    const current = () => request === searchNavigation.current && boundary === boundaryRevision.current
      && selectedSession === sessionRef.current && !navigationPending.current && !isPublicSurface();
    try {
      const quote = await api.notesQuote(noteQuoteAddress(source));
      if (!current()) return;
      setSearchTarget({ locator: { kind: 'note', noteId: quote.id, revision: quote.revision,
        field: 'body', offset: quote.start, end: quote.end }, requestId: request });
      setView('notes');
    } catch (error) { if (current()) throw error; }
  }
  async function openMaterialSource(source: MaterialQuoteReference, discuss = false) {
    if (navigationPending.current || isPublicSurface()) return;
    const boundary = boundaryRevision.current, selectedSession = sessionRef.current, request = ++searchNavigation.current;
    const current = () => request === searchNavigation.current && boundary === boundaryRevision.current
      && selectedSession === sessionRef.current && !navigationPending.current && !isPublicSurface();
    const attached = getDraftAttachments(draftRef.current).find(item => item.kind === 'text' && item.resource?.resourceId === source.resourceId);
    const target = attached?.kind === 'text' && attached.resource?.resourceId === source.resourceId
      ? { kind: 'pending' as const, reference: attached.resource } : { kind: 'saved' as const, resourceId: source.resourceId };
    try {
      const quote = await api.materialsQuote({ target, quote: materialQuoteAddress(source) });
      if (!current()) return;
      if (discuss && viewRef.current === 'notes') { quoteMaterial(quote, true); return; }
      openDeskItem({ id: quote.resourceId, kind: 'material', name: quote.name,
        ...(attached?.kind === 'text' ? { pending: attached } : {}),
        address: { resourceId: quote.resourceId, sha256: quote.sha256, ...(quote.page ? { page: quote.page } : {}), offset: quote.start } });
      setSearchTarget({ locator: { kind: 'material', resourceId: quote.resourceId, sha256: quote.sha256,
        ...(quote.page ? { page: quote.page } : {}), field: 'body', offset: quote.start, end: quote.end }, requestId: request });
      setReadingPane(discuss ? 'chat' : 'reader');
      if (discuss) quoteMaterial(quote, viewRef.current === 'keep');
    } catch (error) { if (current()) throw error; }
  }
  function openMaterialNote(id: string, revision: number) {
    setSearchTarget({ locator: { kind: 'note', noteId: id, revision, field: 'body', offset: 0, end: 0 }, requestId: ++searchNavigation.current });
    setView('notes');
  }
  function openAgendaItem(item?: Action, occurrenceDate?: string) {
    const owner = item && state?.agenda.find(current => current.id === item.id);
    if (owner) setAgendaResume({ address: { record: { id: owner.id, revision: owner.revision || 1,
      ...(owner.recurrence && occurrenceDate ? { occurrenceDate } : {}) },
      timeZone: owner.timeZone || state?.settings.timeZone || DEFAULT_TIME_ZONE }, requestId: ++returnNavigation.current });
    setAgendaOpened(true); setView('agenda');
  }
  async function openAgendaOrigin(record: AgendaReference) {
    if (!state || navigationPending.current || isPublicSurface() || !keepUnsavedEdits('回到原交流')) return;
    const boundary = boundaryRevision.current, gesture = readingGesture.current, selectedNavigation = navigation.current;
    const privacyEpoch = state.privacyEpoch, policyRevision = state.policyRevision;
    if (privacyEpoch === undefined || policyRevision === undefined) throw new Error('这一天的资料范围还没接上，请重新打开后再试。');
    const current = () => boundary === boundaryRevision.current && gesture === readingGesture.current && selectedNavigation === navigation.current
      && !navigationPending.current && !isPublicSurface() && !!state.agenda.find(item => item.id === record.id && (item.revision || 1) === record.revision);
    const source = await api.agendaOrigin({ record, privacyEpoch, policyRevision, sourceBoundary: state.sourceBoundary ?? 0 });
    if (!current()) return;
    if (!source) { notify('这项安排暂没有可返回的原交流，可以就这件事接着聊。'); return; }
    await openSearchResult(source.locator);
  }
  async function showPlace(placeId: string) {
    await attempt(async () => {
      const route = await api.mapRoute({ to: { kind: 'place', id: placeId } });
      openMap(route);
    });
  }
  const conversationRetention = [...messages]
    .reverse()
    .find((message) => message.scopeSummary?.retentionScope === 'conversation')?.scopeSummary;
  const temporaryConversation = conversationRetention?.retention === 'session_only';
  const hasMessageScope = temporaryConversation || Object.values(turnControls).some(value => value !== undefined);
  const messageScopeLabel = turnControls.transmission === 'local_only' ? '先留在这里'
    : temporaryConversation ? '这次不留下'
      : turnControls.retention === 'session_only' ? '这条不留下'
        : turnControls.memoryMode === 'current_sources_only' ? '只看这条'
          : turnControls.memoryMode === 'none' ? '不参考记忆与历史'
            : turnControls.retention === 'history_no_inference' ? '不记成长期偏好'
              : turnControls.audience === 'public' ? '准备公开的草稿'
                : turnControls.audience === 'group' ? '准备给群里的草稿' : '这条消息的使用范围';
  const memoryHint = memoryNotice && (
    <div className="memory-notice" role="status">
      <span>
        {(memoryNotice as Memory & { status?: string }).status === 'candidate' ? '你愿意让我记住吗：' : '记住了：'}
        {memoryNotice.text}
      </span>
      <button
        onClick={() =>
          void attempt(async () => {
            updateState(await api.memory({ action: 'delete', id: memoryNotice.id }));
            setMemoryNotice(null);
          })
        }
      >
        撤销
      </button>
      <IconButton label="收起记忆提示" onClick={() => setMemoryNotice(null)}>
        <X size={13} />
      </IconButton>
    </div>
  );
  const planningTrial = (() => {
    if (sceneSelection?.kind !== 'time_block' || !sceneSelection.planningTrial) return undefined;
    const selection = sceneSelection;
    const scene = messages.flatMap(message => message.scenes || []).find(scene =>
      scene.id === selection.sceneId && scene.revision === selection.sceneRevision);
    if (scene?.kind !== 'planning') return undefined;
    const block = scene.blocks.find(block => block.id === selection.blockId);
    const range = block?.originalRange || block;
    if (!block || !range?.end) return undefined;
    const condition = selection.planningTrial!;
    const value = 'localTime' in condition ? condition.localTime : new Date(condition.proposedStart).toLocaleTimeString('en-GB',
      { timeZone: scene.window.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const minutes = (Date.parse(range.end) - Date.parse(range.start)) / 60000;
    return { label: block.label, value, detail: `仍${minutes}分钟`,
      onChange: (localTime: string) => { void selectScene({ ...selection, planningTrial: { localTime } }); },
      onCancelTrial: () => { const original = { ...selection }; delete original.planningTrial; void selectScene(original); } };
  })();
  const composer = (
    <div className={`composer-area${composerDock.target ? ' is-study-writing' : ''}${sceneDropActive ? ' is-scene-drop' : ''}${documentDropActive ? ' is-document-drop' : ''}`}
      onDragOver={event => {
        if (event.dataTransfer.types.includes(MATERIAL_DOCUMENT_MIME)) {
          if (!draftReady || navigating || surfaceMode.current === 'public') return;
          event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setDocumentDropActive(true); return;
        }
        if (!event.dataTransfer.types.includes(SCENE_FRAME_MIME) || !draftReady || navigating || surfaceMode.current === 'public') return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setSceneDropActive(true);
      }}
      onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) { setSceneDropActive(false); setDocumentDropActive(false); } }}
      onDrop={event => {
        if (event.dataTransfer.types.includes(MATERIAL_DOCUMENT_MIME)) {
          event.preventDefault(); event.stopPropagation(); setDocumentDropActive(false);
          const carried = readMaterialDocumentTransfer(event.dataTransfer);
          if (carried) void pickMaterialDocument(carried); return;
        }
        if (!event.dataTransfer.types.includes(SCENE_FRAME_MIME)) return;
        event.preventDefault(); event.stopPropagation(); setSceneDropActive(false);
        const carried = readSceneFrameTransfer(event.dataTransfer);
        if (!draftReady || navigating || surfaceMode.current === 'public' || !carried || carried.sessionId !== sessionRef.current
          || !messages.some(message => message.scenes?.some(scene => scene.id === carried.selection.sceneId && scene.revision === carried.selection.sceneRevision
            && scene.kind === 'discussion' && scene.artwork.some(art => art.assetId === carried.selection.artwork?.assetId && art.optionId === carried.selection.artwork.optionId)))) {
          setSceneDropIssue('这张场景没能拿过来，可以回到原作品再试一次。'); return;
        }
        void selectScene(carried.selection);
      }}
      onKeyDownCapture={event => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing && !composing.current && !attachmentMenu) {
          if (documentPreview || documentPreviewPending || documentPreviewIssue) {
            event.preventDefault(); event.stopPropagation(); cancelDocumentPreview(true); return;
          }
          if (materialDocumentRef.current) {
            event.preventDefault(); event.stopPropagation(); clearMaterialDocument(); clearComparisonContinuation(); inputRef.current?.focus({ preventScroll: true }); return;
          }
        }
        if (event.key === 'Escape' && !event.nativeEvent.isComposing && !composing.current && !attachmentMenu
          && sceneSelectionRef.current?.kind === 'discussion_artwork') {
          event.preventDefault(); event.stopPropagation(); clearSceneSelection(); inputRef.current?.focus({ preventScroll: true });
        }
      }}>
      {composerDock.target && memoryHint}
      {composerDock.target && <div className="study-composer-heading">
        <button type="button" className="text-button" onClick={() => {
          requestComposerMove();
          composerDock.returnToChat(); requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
        }}>回到聊天</button></div>}
      {comparisonAnchor && <FocusContextChip label={`对照 · ${comparisonAnchor.label}`} onClear={clearComparison}
        targetKey={workspaceTargetKey(comparisonAnchor.target)}
        onOpen={() => void attempt(() => openWorkspaceReference(comparisonAnchor.target))} />}
      {comparisonAnchor && comparisonContinuation && !currentWorkspaceReference(false) && <FocusContextChip
        targetKey={workspaceTargetKey(comparisonContinuation.target)}
        label={`另一处 · ${comparisonContinuation.label}`} onOpen={() => void attempt(() => openWorkspaceReference(comparisonContinuation.target))} onClear={() => {
          clearComparisonContinuation();
        }} />}
      {sceneSelection && showCurrentWorkspaceReference && <FocusContextChip label={sceneSelectionLabel} trial={planningTrial} onClear={() => { clearSceneSelection(); clearComparisonContinuation(); }}
        targetKey={workspaceTargetKey({ kind: 'scene', reference: sceneSelection })}
        onCompare={!comparisonAnchor ? compareCurrentReference : undefined} />}
      {sceneDropIssue && <p className="scene-drop-message" role="status">{sceneDropIssue}</p>}
      {(documentPreview || documentPreviewPending || documentPreviewIssue) && <section className="document-preview-mark" aria-label="资料试放" aria-busy={documentPreviewPending}>
        {documentPreview && <AttachmentTray items={[{ id: documentPreview.reference.resourceId, kind: 'document', name: documentPreview.name, mediaType: documentPreview.mediaType }]}
          disabled={documentPreviewPending} onOpen={() => openDocumentFrame(documentPreview.reference)} />}
        {documentPreviewPending && <span role="status"><LoaderCircle size={14} className="spin" aria-label="正在打开这份资料" /></span>}
        {documentPreview && <IconButton label="用这份资料接着聊" disabled={documentPreviewPending} onClick={() => void acceptMaterialDocument()}><Check size={15} /></IconButton>}
        <IconButton label="放回这份资料" onClick={() => cancelDocumentPreview(true)}><X size={14} /></IconButton>
        {documentPreviewIssue && <QuietNotice message={documentPreviewIssue} />}
      </section>}
      {materialDocument && showCurrentWorkspaceReference && !attachments.some(item => item.kind === 'text' && item.resource?.resourceId === materialDocument.reference.resourceId) && <div className="document-focus-tray"
        data-workspace-target={workspaceTargetKey({ kind: 'material', reference: materialDocument.reference })}>
        <AttachmentTray items={[{ id: materialDocument.reference.resourceId, kind: 'document', name: materialDocument.name, mediaType: materialDocument.mediaType }]}
          activeId={materialDocument.reference.resourceId} disabled={!draftReady || navigating} busy={busy}
          onOpen={() => openDocumentFrame(materialDocument.reference)} onRemove={() => { clearMaterialDocument(); clearComparisonContinuation(); }} />
        {!comparisonAnchor && <button type="button" className="icon-button" aria-label="留作对照，再选另一处" title="留作对照，再选另一处" onClick={compareCurrentReference}><Columns2 size={14} /></button>}
      </div>}
      {materialQuote && showCurrentWorkspaceReference && <div className="material-composer-quote" data-workspace-target={workspaceTargetKey({ kind: 'material_quote', reference: materialQuoteAddress(materialQuote) })}>
        <button type="button" className="material-quote-source" title={materialQuote.text} aria-label={`${materialQuote.name}${materialQuote.page ? ` · 第 ${materialQuote.page} 页` : ''}`} onClick={() => void attempt(() => openMaterialSource(materialQuote))}>
          <FileText size={16} /><span>{comparisonAnchor ? `另一处 · ${Array.from(materialQuote.text).slice(0, 100).join('')}` : materialQuote.name}</span>
          {!comparisonAnchor && materialQuote.page && <span className="material-quote-page">第 {materialQuote.page} 页</span>}
        </button>
        {!comparisonAnchor && <button type="button" className="icon-button" aria-label="留作对照，再选另一处" title="留作对照，再选另一处"
          onPointerDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={compareCurrentReference}><Columns2 size={14} /></button>}
        <button type="button" className="icon-button" aria-label="取消资料引用" onClick={() => { searchNavigation.current++; clearMaterialQuote(); clearComparisonContinuation(); inputRef.current?.focus({ preventScroll: true }); }}><X size={14} /></button>
      </div>}
      {noteQuote && showCurrentWorkspaceReference && <FocusContextChip label={comparisonAnchor ? `另一处 · ${Array.from(noteQuote.text).slice(0, 100).join('')}` : noteQuote.title || '这页笔记'}
        targetKey={workspaceTargetKey({ kind: 'note_quote', reference: noteQuoteAddress(noteQuote) })}
        onCompare={!comparisonAnchor ? compareCurrentReference : undefined}
        onOpen={() => void attempt(() => openNoteSource(noteQuote))}
        onClear={() => { searchNavigation.current++; clearNoteQuote(); clearComparisonContinuation(); inputRef.current?.focus({ preventScroll: true }); }} />}
      {conversationQuote && showCurrentWorkspaceReference && <FocusContextChip label={conversationQuote.title}
        targetKey={workspaceTargetKey({ kind: 'conversation_quote', reference: conversationQuote.reference })}
        onCompare={!comparisonAnchor ? compareCurrentReference : undefined}
        onOpen={() => void attempt(() => openConversationSource(conversationQuote.reference))}
        onClear={() => { searchNavigation.current++; clearConversationQuote(); clearComparisonContinuation(); inputRef.current?.focus({ preventScroll: true }); }} />}
      {assistantPassage && showCurrentWorkspaceReference && <FocusContextChip label={assistantPassage.preview}
        targetKey={workspaceTargetKey({ kind: 'assistant_text', reference: assistantPassage.reference })}
        onCompare={!comparisonAnchor ? compareCurrentReference : undefined}
        onOpen={() => void openAssistantPassage(assistantPassage)}
        onClear={() => { searchNavigation.current++; clearAssistantPassage(); clearComparisonContinuation(); inputRef.current?.focus({ preventScroll: true }); }} />}
      {agendaContext && showCurrentWorkspaceReference && <div className="material-composer-quote" data-workspace-target={workspaceTargetKey({ kind: 'agenda', reference: agendaContext.focus })}>
        <button type="button" className="material-quote-source" onClick={() => setView('agenda')}>
          <CalendarDays size={16} /><span>{agendaContext.label}</span>
        </button>
        {!comparisonAnchor && <button type="button" className="icon-button" aria-label="留作对照，再选另一处" title="留作对照，再选另一处"
          onPointerDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={compareCurrentReference}><Columns2 size={14} /></button>}
        <button type="button" className="icon-button" aria-label="取消安排引用" onClick={() => { clearAgendaContext(); clearComparisonContinuation(); inputRef.current?.focus({ preventScroll: true }); }}><X size={14} /></button>
      </div>}
      {composerFollowup && showCurrentWorkspaceReference && <FocusContextChip label={composerFollowup.focusLabel || (composerFollowup.studyInteraction ? '接着这一页聊'
        : composerFollowup.companionReference ? '从刚才停下的地方接着聊'
          : composerFollowup.curiosityReference?.focus ? '就刚才指的这一句聊聊'
            : composerFollowup.curiosityReference ? '接着这个小发现'
              : composerFollowup.rehearsalInteraction ? '接着刚才这一段试说'
                : composerFollowup.noteReference ? '接着这页笔记聊'
                  : composerFollowup.programReference ? '接着这份小作品聊' : '接着刚才这段聊')}
        targetKey={currentWorkspaceReference(false) ? workspaceTargetKey(currentWorkspaceReference(false)!) : undefined}
        onCompare={!comparisonAnchor ? compareCurrentReference : undefined}
        onOpen={composerFollowup.preparationReference ? () => void attempt(() => openPreparationReference(composerFollowup.preparationReference!)) : undefined}
        onClear={() => { clearFollowup(true); clearComparisonContinuation(); }} />}
      {sharedMapContext && showCurrentWorkspaceReference && (
        <div className="shared-map-context" role="status" data-workspace-target={sharedMapContext.routeReference
          ? workspaceTargetKey({ kind: 'map_route', reference: sharedMapContext.routeReference }) : undefined}>
          {sharedMapContext.routeReference && sharedMapContext.previewRoute
            ? <button type="button" className="material-quote-source" aria-label={`回到这条路线：${sharedMapContext.label}`}
                onClick={() => openMap(sharedMapContext.previewRoute!, sharedMapContext.routeConditions, sharedMapContext.previewMemory)}>{sharedMapContext.label}</button>
            : <span>本次起点：{sharedMapContext.label}</span>}
          {!comparisonAnchor && sharedMapContext.routeReference && <button type="button" aria-label="留作对照，再选另一处" title="留作对照，再选另一处"
            onPointerDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={compareCurrentReference}><Columns2 size={13} /></button>}
          <button
            type="button"
            aria-label="停止这次地点参考"
            onClick={() =>
              void attempt(async () => {
                const selected = sharedMapContextRef.current;
                await api.shareMapContext({ enabled: false, ...(selected?.selectionId ? { expectedSelectionId: selected.selectionId } : {}) });
                if (selected === sharedMapContextRef.current) clearMapContext(false);
              })
            }
          >
            <X size={13} />
          </button>
        </div>
      )}
      {attachments.length > 0 && <div className="attachment-shelf" data-workspace-target={materialDocument && attachments.some(item => item.kind === 'text' && item.resource?.resourceId === materialDocument.reference.resourceId)
        ? workspaceTargetKey({ kind: 'material', reference: materialDocument.reference }) : undefined}><AttachmentTray items={attachments.map(attachmentTrayItem)} busy={busy}
        disabled={!draftReady || navigating} activeId={activeDeskId}
        onOpen={id => { const item = getDraftAttachments(draftRef.current).find(item => attachmentViewId(item) === id); if (item) openAttachment(item); }}
        onRemove={removeAttachment} onReorder={ids => {
          if (busy || !draftReady || navigationPending.current || isPublicSurface()) return;
          const current = getDraftAttachments(draftRef.current), byId = new Map(current.map(item => [attachmentViewId(item), item]));
          if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id))) return;
          replaceDraft(withDraftAttachments(draftRef.current, ids.map(id => byId.get(id)!)));
        }} /></div>}
      <form
        ref={setEdgeAnchor}
        data-presence-edge="composer" data-presence-edge-sides="top right bottom left" data-presence-edge-label="输入边缘"
        className={`composer edge-companion-anchor ${busy ? 'is-busy' : ''} ${!empty ? 'is-conversation' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          void send(undefined, true, undefined, undefined, viewRef.current === 'keep');
        }}
      >
        <textarea
          ref={inputRef}
          aria-label="和在场说说"
          placeholder={busy ? '想到了什么，也可以先写下来…' : composerDock.target ? '我接下来想到的是…' : empty ? '随便说一句，也可以。' : '接着说…'}
          value={input}
          rows={1}
          maxLength={LIMITS.draftText}
          disabled={!draftReady || navigating}
          onCompositionStart={() => { composing.current = true; setComposerWriting(true); }}
          onCompositionEnd={() => { composing.current = false; requestAnimationFrame(() => { placeConversation(); placeComposer(); }); }}
          onFocus={() => { setComposerFocused(true); setComposerWriting(false); }}
          onBlur={() => { setComposerFocused(false); setComposerWriting(false); }}
          onChange={(e) => { setComposerWriting(true); updateDraft({ text: e.target.value }); queueReturnCapture(); }}
          onSelect={queueReturnCapture}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !composing.current && !e.nativeEvent.isComposing &&
              e.nativeEvent.keyCode !== 229
            ) {
              e.preventDefault();
              void send(undefined, true, undefined, undefined, viewRef.current === 'keep');
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="composer-left">
            {settingsContext && !comparisonAnchor && !currentWorkspaceReference(false) && <button type="button"
              className="icon-button composer-settings-cue" title="带着刚才的设置，点此移除" aria-label="不带上刚才的设置"
              onPointerDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={clearSettingsContext}>
              <SlidersHorizontal size={18} /><X size={12} />
            </button>}
            <div className="attachment-control" ref={attachmentControl}>
              <button
                ref={attachmentTrigger}
                className="icon-button"
                type="button"
                aria-label="添加与更多操作"
                title="添加与更多操作"
                aria-haspopup="menu"
                aria-expanded={attachmentMenu}
                onClick={() => setAttachmentMenu(!attachmentMenu)}
                disabled={!draftReady || navigating}
              >
                <Plus size={21} />
              </button>
              {attachmentMenu && (
                <div
                  className="attachment-menu"
                  ref={attachmentMenuRef}
                  style={attachmentMenuPosition}
                  role="menu"
                  aria-label="添加与更多操作"
                  onKeyDown={(e) => {
                    const items = [
                      ...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                    ].filter(item => !item.disabled);
                    const i = items.indexOf(document.activeElement as HTMLButtonElement);
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const candidates = [
                        ...document.querySelectorAll<HTMLElement>(
                          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
                        ),
                      ].filter((el) => el.getClientRects().length > 0 && !e.currentTarget.contains(el));
                      const index = candidates.indexOf(attachmentTrigger.current!);
                      const target = candidates[index + (e.shiftKey ? -1 : 1)];
                      setAttachmentMenu(false);
                      (target || attachmentTrigger.current)?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setAttachmentMenu(false);
                      void attempt(() => chooseAttachment('image'));
                    }}
                  >
                    <ImageIcon size={18} />
                    <span>
                      添加图片
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setAttachmentMenu(false);
                      void attempt(() => chooseAttachment('text'));
                    }}
                  >
                    <Paperclip size={18} />
                    <span>
                      添加文件
                    </span>
                  </button>
                  <div className="composer-menu-divider" role="separator" />
                  <button role="menuitem" type="button" onClick={() => { setAttachmentMenu(false); setView('materials'); }}><BookOpen size={18} /><span>打开共读桌</span></button>
                  <button role="menuitem" type="button" disabled={navigating} onClick={() => {
                    setAttachmentMenu(false); setScopeOpen(true);
                  }}>
                    <SlidersHorizontal size={18} /><span>这条消息的使用范围</span>
                  </button>
                  {canToggleRoom && <button role="menuitem" type="button" onClick={() => {
                    setAttachmentMenu(false); rememberReadingPosition(); setChatSpace(atWindow ? 'reading' : 'window');
                    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
                  }}>
                    <BookOpen size={18} /><span>{atWindow ? '安静阅读' : '回到窗边'}</span>
                  </button>}
                  {(focusStatus === 'idle' || focusStatus === 'ended') && <button role="menuitem" type="button" disabled={!draftReady || navigating} onClick={() => {
                    setAttachmentMenu(false); startFocus(); inputRef.current?.focus({ preventScroll: true });
                  }}>
                    <LampDesk size={18} /><span>开始专注</span>
                  </button>}
                </div>
              )}
            </div>
            {hasMessageScope && <button
              type="button"
              className={`composer-context-button ${Object.keys(turnControls).length ? 'selected' : ''}`}
              onClick={() => setScopeOpen(true)}
              aria-label={`这条消息的使用范围：${messageScopeLabel}`}
              disabled={navigating}
            >
              <SlidersHorizontal size={14} />
              <span>
                {messageScopeLabel}
              </span>
              <ChevronDown size={12} />
            </button>}
          </div>
          <div className="composer-right">
            <ComposerActions busy={busy} submitting={starting || !draftReady || navigating}
              hasDraft={!!input.trim()} onStop={() => void stopReply()} />
          </div>
        </div>
      </form>
      <EdgeCompanion host={mapSheet ? mapPresenceHost : appMainRef.current} anchor={mapSheet ? null : edgeAnchor} character={companion.character} placement={edgePlacement} text={edgeSpeech} busy={busy}
        replyAvailable={!!edgeReplyText && edgeReply?.status !== 'running'} onOpenReply={() => {
          if (!edgeReply) return;
          setMapSheet(null); setView('chat'); setReadingPane('chat');
          requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(edgeReply.id)}"]`)
            ?.scrollIntoView({ block: 'center', behavior: 'auto' }));
        }}
        name={state?.settings.persona.core.name || '祥子'}
        active={!resting && (homeVisible || !!mapSheet || view !== 'chat' || !atWindow)}
        hidden={companion.presence === 'hidden' || surfaceMode.current === 'public'}
        onPlacementChange={placement => {
          setEdgePlacement(placement);
          try { localStorage.setItem('zaichang.edge-companion-placement.v1', JSON.stringify(placement)); } catch { /* The placement still works in this window. */ }
        }}
        onCall={() => {
          if (busy || !draftReady || navigating || surfaceMode.current === 'public') return;
          if (view === 'chat' && !homeVisible) setChatSpace('reading');
          const quoted = materialQuoteRef.current || noteQuoteRef.current || conversationQuoteRef.current || assistantPassageRef.current;
          void send(quoted ? '就我引用的这一段，和我说一两句吧。'
            : `${state?.settings.persona.core.name?.trim() || '祥子'}，想听你说句话，一两句就好。`, false, undefined, undefined, true);
        }} />
      {unsentSubmissions.filter(item => item.draftKey === draftKey.current && item.boundary === boundaryRevision.current).map(item => (
        <details className="composer-unsent" key={item.id}>
          <summary>{item.kind === 'draft' ? '还有一份没发的草稿' : item.delivery === 'unconfirmed' ? '这条还没确认发出' : '这条没有发出'}</summary>
          <p>{item.draft.text}</p>
          {getDraftAttachments(item.draft).map(file => <span className="composer-unsent-attachment" key={file.attachmentId || file.name}>{file.name}</span>)}
          <button type="button" className="text-button"
            disabled={starting || !draftReady || navigating || input.length > 0 || !!attachment}
            title={input.length || attachment ? '输入框里还有新草稿' : undefined}
            onClick={() => void restoreUnsentSubmission(item)}>取回输入框</button>
        </details>
      ))}
      <div className="composer-presence-tools">
        <FocusLamp disabled={!draftReady || navigating} onStatusChange={setFocusStatus} />
      </div>
      <div className="composer-foot">
        {temporaryConversation && (
          <span role="status" className="draft-saved-mark" title={conversationRetention?.clearConversationOnExit
              ? '离开时不留下这段聊天，记下的安排会保留。'
              : '这段聊天不留下。'} aria-label="这段聊天不保存">
            <Info size={17} aria-hidden="true" />
          </span>
        )}
        {(input || attachment) && (
          <div className="draft-status">
            {draftSaved ? (
              <span role="status" className="draft-saved-mark" title="草稿已保存" aria-label="草稿已保存"><Check size={17} aria-hidden="true" /></span>
            ) : turnControls.retention === 'session_only' || temporaryConversation ? (
              <span className="draft-saved-mark" title="离开时不留下这段话" aria-label="离开时不留下这段话"><Info size={17} aria-hidden="true" /></span>
            ) : (
              <button
                type="button"
                disabled={savingDraft || navigating}
                className="icon-button"
                aria-label={savingDraft ? '正在保存草稿' : '留作草稿'}
                title={savingDraft ? '正在保存草稿' : '留作草稿'}
                onClick={() => void saveCurrentDraft()}
              >
                {savingDraft ? <LoaderCircle size={17} className="spin" /> : <Bookmark size={17} />}
              </button>
            )}
          </div>
        )}
        {away && !empty && !homeVisible ? (
          <button
            className="scroll-bottom"
            aria-label="回到最新消息"
            title="回到最新消息"
            onClick={() => {
              followRef.current = true;
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: prefersQuietMotion()
                  ? 'instant'
                  : 'smooth',
              });
            }}
          >
            <ArrowDown size={20} />
          </button>
        ) : null}
      </div>
    </div>
  );

  const latestRehearsalRevisions = useMemo(() => {
    const latest = new Map<string, number>();
    for (const message of messages) for (const scene of message.scenes || []) {
      if (scene.kind === 'rehearsal' || scene.kind === 'rehearsal_reference')
        latest.set(scene.id, Math.max(latest.get(scene.id) || 0, scene.revision));
    }
    return latest;
  }, [messages]);
  const latestStudyRevisions = useMemo(() => {
    const revisions = new Map<string, number>();
    for (const message of messages) for (const scene of message.scenes || []) {
      if (scene.kind === 'study' || scene.kind === 'study_reference')
        revisions.set(scene.owner.id, Math.max(revisions.get(scene.owner.id) || 0, scene.owner.revision));
    }
    return revisions;
  }, [messages]);
  const renderedMessages = useMemo(
    () =>
      messages.map(m => (
        <Fragment key={m.id}>
        <MessageView
          key={m.id}
          message={m}
          primaryBodyPresented={!!m.primaryHelpRef && !!m.helpRefs?.some(ref => isPrimaryHelp(ref, m.primaryHelpRef))
            && (m.responseText ?? m.content) === m.content
            && visibleHelpBodies[helpBodyKey(m, m.primaryHelpRef,
              `${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`)] === m.content}
          companionName={state?.settings.persona?.core.name}
          privacyEpoch={state?.privacyEpoch}
          policyRevision={state?.policyRevision}
          programStateEphemeral={turnControls.retention === 'session_only' || m.retention === 'session_only'}
          timeZone={state?.settings.timeZone}
          agenda={state?.agenda || []}
          matters={state?.matters || []}
          onSave={saveAction}
          onRevoke={undoAction}
          onViewAgenda={openAgendaItem}
          onActionEditChange={reportActionEdit}
          onOpenSource={openReplySource}
          onCorrect={() => useSuggestion('刚才有一点需要改正：')}
          onReviseDraft={(recipient) => useSuggestion(`刚才给${recipient}的草稿，请这样修改：`)}
          onPresent={(artifact) =>
            void prepareDisplay({ sessionId: m.sessionId, id: artifact.id, revision: artifact.revision })
          }
          onMessageChanged={(changed) => {
            setToast('');
            setMessages((current) =>
              current.map((message) => (message.id === changed.id ? changed : message)),
            );
          }}
          onQuote={quotePassage}
          assistantPassage={assistantPassage?.reference}
          onAssistantPassage={(reference, preview, kind) => focusAssistantPassage(reference, preview, kind,
            `${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`)}
          onOpenMap={(route) => { searchNavigation.current++; openMap(route); }}
          onUseMapContext={useMapContext}
          sceneSelection={sceneSelection}
          programFocus={currentComposerFollowup?.programReference}
          onSceneSelect={value=>void selectScene(value)}
          onFollowup={request => {
            const gesture = readingGesture.current, selectedReturn = returnNavigation.current,
              selectedNavigation = navigation.current, boundary = boundaryRevision.current;
            usePresentationFollowup(request, m.sessionId, m.id,
              `${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`,
              () => gesture === readingGesture.current && selectedReturn === returnNavigation.current
                && selectedNavigation === navigation.current && boundary === boundaryRevision.current);
          }}
          onRehearsalCurrentReadStart={rehearsalId => beginRehearsalCurrentRead(m.sessionId, m.id,
            `${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`, rehearsalId)}
          onReaderNavigation={() => { searchNavigation.current++; }}
          onOpenDocument={locator => void attempt(async () => {
            const boundary = boundaryRevision.current, selectedSession = sessionRef.current, read = ++searchNavigation.current;
            const resolved = await api.searchResolve(locator);
            if (read !== searchNavigation.current || boundary !== boundaryRevision.current || selectedSession !== sessionRef.current || resolved.kind !== 'material') return;
            await openSearchResult(resolved);
          })}
          onOpenNote={input => void attempt(async () => {
            const boundary = boundaryRevision.current, selectedSession = sessionRef.current;
            if (input.sessionId !== selectedSession || input.messageId !== m.id) return;
            const read = ++searchNavigation.current;
            const page = await api.noteProject(input);
            if (read !== searchNavigation.current || boundary !== boundaryRevision.current || selectedSession !== sessionRef.current) return;
            await openSearchResult({ kind: 'note', noteId: page.proof.id, revision: page.proof.revision,
              field: 'body', offset: page.proof.start, end: page.proof.end });
          })}
          onOpenStudySource={input => void attempt(async () => {
            const boundary = boundaryRevision.current, selectedSession = sessionRef.current,
              gesture = readingGesture.current, selectedNavigation = navigation.current;
            if (input.sessionId !== selectedSession || input.messageId !== m.id || navigationPending.current || isPublicSurface()) return;
            const read = ++searchNavigation.current;
            const current = () => read === searchNavigation.current && boundary === boundaryRevision.current
              && selectedSession === sessionRef.current && gesture === readingGesture.current && selectedNavigation === navigation.current
              && !navigationPending.current && !isPublicSurface();
            try {
              const paper = await api.studyProject(input);
              if (!current()) return;
              const bookmark = paper.bookmark?.reference;
              if (bookmark?.kind === 'conversation') { await openConversationSource(bookmark.reference); return; }
              if (bookmark?.kind === 'material') { await openMaterialSource(bookmark.reference); return; }
              const note = bookmark?.kind === 'notebook' ? bookmark.reference : paper.problem.origin.note;
              if (!note) return;
              await openSearchResult({ kind: 'note', noteId: note.id, revision: note.revision,
                field: 'body', offset: note.start, end: note.end });
            } catch (error) { if (current()) throw error; }
          })}
          currentSceneMessages={new Map(messages.flatMap(message=>(message.scenes||[]).map(scene=>[scene.id,message.id] as const)))}
          latestRehearsalRevisions={latestRehearsalRevisions}
          latestStudyRevisions={latestStudyRevisions}
          sceneInterruptionKey={messages.filter(message=>message.role==='user').at(-1)?.id}
          onContinueScene={()=>{if (viewRef.current !== 'notes' || !notesDiscussion) setView('chat');requestAnimationFrame(()=>inputRef.current?.focus());}}
          onPreviewImage={setPreviewImage}
          onOpenAttachment={openAttachment}
          onCopyText={(text, label = '回复') =>
            void attempt(async () => {
              await api.copyText(text);
              notify(`已复制${label}。`);
            })
          }
          busy={busy}
          boundary={`${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`}
        >
        {(m.helpRefs || []).map(ref => {
          const material = state?.preparations?.find(item => item.id === ref.id && item.revision === ref.revision && item.helpRecordId === ref.helpRecordId);
          const boundary = `${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`;
          const key = helpBodyKey(m, ref, boundary);
          const onBodyVisibility = isPrimaryHelp(ref, m.primaryHelpRef) ? (body: string | undefined) => reportHelpBody(key, body) : undefined;
          const onContinue = (text: string, context?: LetterFocusContext | PreparationFocusContext) => context ? usePresentationFollowup({ text, ...context }, m.sessionId, m.id,
            `${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`) : useSuggestion(text);
          return material ? <PreparationShelf key={key} inline items={[material]} openRequest={preparationRequest} timeZone={state?.settings.timeZone} onState={updateState}
            onContinue={onContinue} onBodyVisibility={onBodyVisibility}
            quoteAsMessageBody={isPrimaryHelp(ref, m.primaryHelpRef) && material.body === m.content
              && (m.responseText ?? m.content) === m.content} /> : ref.kind === 'reflective_letter' ? <LetterHistoryCard key={key}
              reference={ref} sessionId={m.sessionId} messageId={m.id}
              boundaryKey={`${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`}
              onReadStart={() => { searchNavigation.current++; }}
              onContinue={onContinue} onBodyVisibility={onBodyVisibility} /> : null;
        })}
        </MessageView>
        </Fragment>
      )),
    [messages, assistantPassage, visibleHelpBodies, state?.agenda, state?.matters, state?.preparations, state?.settings.timeZone, state?.privacyEpoch, state?.policyRevision, state?.sourceBoundary, turnControls.retention, notesUnsaved, materialUnsaved, notesDiscussion, draftReady, busy,sceneSelection,latestRehearsalRevisions,latestStudyRevisions,preparationRequest,
      // Highlight the current address without rebuilding history for each local value.
      currentComposerFollowup?.programReference?.messageId, currentComposerFollowup?.programReference?.programId,
      currentComposerFollowup?.programReference?.revision, currentComposerFollowup?.programReference?.nodeId],
  );

  const activeMatter = state?.matters?.find((matter) => matter.sessionId === sessionId);
  const materials = (
    <PreparationShelf
      items={(state?.preparations || []).filter(item => !messages.some(message => message.helpRefs?.some(ref => ref.id === item.id && ref.revision === item.revision && ref.helpRecordId === item.helpRecordId)))}
      openRequest={preparationRequest}
      timeZone={state?.settings.timeZone}
      onState={updateState}
      onContinue={useSuggestion}
    />
  );
  return (
    <SourceBookmarkProvider boundaryKey={`${sessionId}:${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`}
      onDiscuss={discussBookmark} onOpenNote={openMaterialNote} getInteractionVersion={() => readingGesture.current}
      active={!isPublicSurface()} resetKey={bookmarkResetKey}
      onUnsavedChange={value => { bookmarkUnsaved.current = value; }} onOpenSource={openBookmarkSource}
      onNoteSaved={() => setKeepContentRevision(value => value + 1)}
      onOpenStudy={location => { void attempt(() => openBookmarkedStudy(location)); }}>
    {state?.presentation?.mode === 'public' ? <PublicDisplay surface={state.presentation} onEnd={endDisplay} notice={publicCloseNotice} /> : <ConversationTextFocusContext.Provider value={textFocus}>
    <ConversationComposerDockContext.Provider value={composerDock.value}>
    <div className={`app-shell ${atWindow ? 'has-window' : ''}${focusActive ? ' is-focusing' : ''}`}>
      <WorkspaceArtworkWarmup character={companion.character} sceneChoices={companion.sceneChoices} />
      {createPortal(materials, preparationHost)}
      <div className="app-main" ref={appMainRef} style={workspaceScene || homeVisible ? undefined : roomPaperStyle} data-workspace-view={homeVisible ? 'home' : view} data-workspace-scene={workspaceScene}
        data-character-room={characterRoomWorkspace ? 'true' : undefined}
        data-character-paper-side={characterRoomWorkspace ? roomLayout?.bodyBounds && (roomLayout.bodyBounds[0] + roomLayout.bodyBounds[2]) / 2 < .5 ? 'right' : 'left' : undefined}
        data-cover-side={homeVisible && roomLayout?.bodyBounds && (roomLayout.bodyBounds[0] + roomLayout.bodyBounds[2]) / 2 < .5 ? 'right' : undefined}
        data-settings-side={view === 'settings' && roomLayout?.bodyBounds && (roomLayout.bodyBounds[0] + roomLayout.bodyBounds[2]) / 2 < .5 ? 'right' : undefined}
        data-room-layout={workspaceScene || homeVisible ? undefined : roomPaperPosition?.mode} data-room-paper-side={workspaceScene || homeVisible ? undefined : roomPaperPosition?.paperSide} data-room-source={workspaceScene || homeVisible ? undefined : roomPaperPosition?.sourceKey}>
        {workspaceScene && workspaceScene !== 'settings' && workspaceScene !== 'keep' && workspaceScene !== 'memory' && !characterRoomWorkspace && <WorkspaceScenery key={`${companion.character}:${companion.presence}`} scene={workspaceScene}
          character={companion.character} showCharacter={companion.presence === 'window'} motionTargets={d01Targets}
          yieldToInput={composerFocused && composerWriting} reducedMotion={companion.reducedMotion} />}
        {characterRoomWorkspace && <CompanionScene quiet representation="scene" ambientFit="room" onRoomLayout={setRoomLayout}
          moment={workspaceScene === 'today' ? 'planning' : companionActivity} />}
        {(workspaceScene === 'keep' || workspaceScene === 'memory') && <CompanionScene quiet moment="reading"
          representation={view === 'notes' && notesDiscussion ? 'portrait' : 'scene'} ambientFit="room" />}
        {view === 'settings' && <CompanionScene quiet representation="scene" moment="chat" onRoomLayout={setRoomLayout} />}
        {view === 'companion' && <CompanionScene quiet representation="portrait" ambientFit="room" />}
        {!workspaceScene && (view === 'chat' || view === 'agenda' || view === 'materials' || view === 'keep' || view === 'notes') && <CompanionScene quiet={view !== 'chat' || !atWindow}
          representation={homeVisible ? 'scene' : view === 'keep' ? compactConversation ? 'portrait' : 'scene' : view === 'agenda' || view === 'materials' || view === 'notes' || hasScene || readingSelectedWork ? 'portrait' : 'auto'}
          ambientFit={view === 'agenda' || view === 'materials' || view === 'notes' || view === 'keep' && compactConversation ? 'cover' : 'room'}
          yieldToInput={composerFocused && composerWriting && !navigating && view !== 'keep'} moment={homeVisible ? empty && startupReturn ? 'resume' : 'chat' : view === 'agenda' ? 'planning' : view === 'keep' || view === 'notes' ? 'reading' : companionActivity}
          onRoomLayout={setRoomLayout} onStartFocus={draftReady && !navigating ? homeVisible ? () => setView('materials') : startFocus : undefined}
          deskActionLabel={homeVisible ? '一起读，打开共读桌' : undefined} onRest={openRest} focusActive={homeVisible ? false : focusActive} />}
        <header className="titlebar">
          <button className="brand" onClick={openHome} aria-label="在场，回到封面" aria-current={homeVisible ? 'page' : undefined}>
            <Portal size={25} />
            <span>在场</span>
          </button>
          <div className="drag-space" />
          <Navigation
            view={homeVisible ? 'home' : view}
            busy={busy || navigating}
            onView={next => { if (next !== view) searchNavigation.current++;
              if (next === 'chat' && empty) { openHome(); return; }
              if (next === 'settings' && view !== 'settings' && view !== 'companion') personalReturn.current = { home: homeVisible, view };
              setView(next); }}
            onNew={() => void newChat()}
            onHistory={() => { searchNavigation.current++; setPanel('history'); }}
            onCompanion={entry => { if (view !== 'companion') personalReturn.current = { home: homeVisible, view };
              setCompanionEntry(entry); setCompanionEntryRevision(value => value + 1); setView('companion'); }}
          />
          <WindowControls onClose={() => void requestClose()} />
        </header>
        {homeVisible && <section className="cover-home" aria-label="窗边">
          <h1>{state?.settings.persona.core.address.trim() ? `${state.settings.persona.core.address.trim()}，回来啦。` : '回来啦。'}</h1>
          {loadError && <QuietNotice message={loadError} action={{ label: '重新打开', onClick: () => setLoadAttempt(n => n + 1) }} />}
          <div className="cover-composer-home" ref={setHomeComposerHome} />
          <div className="cover-continuations">
            {startupReturn && startupReturnBoundary.current === boundaryRevision.current ? <button type="button" disabled={!draftReady || busy || navigating}
              onClick={() => void restoreWorkspace(startupReturn)}><History size={18} /><span>接着上次</span><ArrowUpRight size={17} /></button>
              : sessionId || homeReturnView.current !== 'chat' ? <button type="button" disabled={navigating}
                title={homeReturnView.current === 'chat' ? state?.conversations.find(item => item.id === sessionId)?.title : undefined} onClick={() => setView(homeReturnView.current)}>
                <History size={18} /><span>{homeReturnView.current === 'chat' ? '接着刚才'
                  : ({ agenda: '刚才的安排', keep: '留下的那一页', notes: '刚才的笔记', materials: '刚才读的材料', memory: '关于你的记录', settings: '刚才的设置', companion: '继续挑选伙伴' } as const)[homeReturnView.current]}</span><ArrowUpRight size={17} /></button>
              : previousConversation && <button type="button" disabled={busy || navigating} onClick={() => void openConversation(previousConversation.id)}><History size={18} /><span>{previousConversation.title}</span><ArrowUpRight size={17} /></button>}
            <button type="button" onClick={() => setView('materials')}><BookOpen size={18} />一起读</button>
            <button type="button" onClick={openRest}>先坐一会儿</button>
          </div>
          <div className="home-preparations" ref={setHomePreparationHome} />
        </section>}
        {view === 'materials' && compactConversation && <div className="retained-heading reading-workspace-heading">
          <div className="reading-pane-switch" aria-label="阅读与对话">
            <button type="button" aria-pressed={readingPane === 'reader'} onClick={() => setReadingPane('reader')}>原文</button>
            <button type="button" aria-pressed={readingPane === 'chat'} onClick={() => setReadingPane('chat')}>一起聊</button>
          </div>
        </div>}
        {(keepOpened || view === 'keep') && state && <KeepPanel active={view === 'keep'} snapshot={keepResult?.boundary === returnBoundary ? keepResult.snapshot : undefined}
          selectionRequest={keepSelectionRequest} onSelectionChange={key => {
            if (viewRef.current !== 'keep' || returnBoundary !== boundaryRevision.current || isPublicSurface()) return;
            keepSelection.current = key ? { boundary: returnBoundary, key } : undefined; queueReturnCapture();
          }}
          onSelectionResolved={result => {
            if (viewRef.current !== 'keep' || returnBoundary !== boundaryRevision.current || isPublicSurface()
              || result.requestId !== keepSelectionRequest?.requestId) return;
            if (result.status === 'pending') {
              const kind: KeepSectionKind | undefined = result.key.startsWith('note:') ? 'notes'
                : result.key.startsWith('material:') ? 'materials' : result.key.startsWith('work:') ? 'works'
                  : result.key.startsWith('conversation:') ? 'conversations' : undefined;
              if (kind && !keepLoading && !keepLoadingMore) void loadKeptContent(kind);
              return;
            }
            setKeepSelectionRequest(undefined);
            if (result.status === 'unavailable') notify('上次留在这里的内容，这次还没找到。草稿还在，可以重新选一页。');
          }}
          loading={keepLoading} loadingMore={keepLoadingMore} error={keepError} disabled={!draftReady || navigating}
          timeZone={state.settings.timeZone} onRetry={() => loadKeptContent()} onLoadMore={loadKeptContent}
          onOpenNote={openMaterialNote} onOpenMaterial={openMaterialDocumentSource} onOpenWork={openKeptWork}
          onOpenSource={openBookmarkSource} onDiscussSource={discussBookmark}
          onOpenConversation={async (id, messageId) => {
            const opened = await openConversation(id);
            if (opened && messageId && opened.some(message => message.id === messageId)) requestAnimationFrame(() =>
              scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'auto' }));
          }}
          onBrowseNotes={() => setView('notes')} onBrowseMaterials={() => { setView('materials'); setReadingPane('reader'); }}
          onHistory={() => setPanel('history')} onNewNote={() => {
            setNoteResume({ address: { id: 'new' }, requestId: ++returnNavigation.current }); setNotesOpened(true); setView('notes');
          }} composer={keepWriting ? <div className="keep-writing">
            <button type="button" className="text-button keep-writing-close" onClick={() => { setKeepWriting(false); }} aria-label="收起写作，保留草稿"><X size={14} /></button>
            <div className="composer-home" ref={setKeepComposerHome} />
          </div> : undefined} />}
        <div ref={conversationSpaceRef} className={`conversation-space ${view === 'materials' ? 'with-materials has-reading-desk' : ''}${activeDeskId ? ' has-open-reading-window' : ''}${documentReaderDropActive ? ' is-document-reader-drop' : ''}`} data-reading-pane={readingPane}
          data-reading-side={readingSide} hidden={homeVisible || view !== 'chat' && view !== 'materials'}
          onDragOverCapture={event => {
            if (!event.dataTransfer.types.includes(MATERIAL_DOCUMENT_MIME) || !(event.target instanceof Element)
              || !event.target.closest('.materials-panel') || navigationPending.current || isPublicSurface()) return;
            event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setDocumentReaderDropActive(true);
          }}
          onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDocumentReaderDropActive(false); }}
          onDropCapture={event => {
            if (!event.dataTransfer.types.includes(MATERIAL_DOCUMENT_MIME) || !(event.target instanceof Element) || !event.target.closest('.materials-panel')) return;
            event.preventDefault(); event.stopPropagation(); setDocumentReaderDropActive(false);
            const carried = readMaterialDocumentTransfer(event.dataTransfer);
            if (carried) openDocumentFrame(carried);
          }}>
        {(materialsOpened || view === 'materials') && state && <MaterialsPanel
          active={view === 'materials' && !activeDeskId} refreshKey={`${messages.length}:${messages.at(-1)?.status || ''}`} compact pending={attachments.find(item => item.kind === 'text') as TextAttachment | undefined || null} sessionId={sessionId} draftEnabled={draftReady && !navigating}
          boundary={`${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`}
          onOpenDocument={openDocumentFrame}
          presentationSide={readingSide} onSwapReadingSide={swapReadingSide} onPickDocument={pickMaterialDocument}
          conversationTarget={materialConversationTarget}
          focus={searchTarget?.locator.kind === 'material' ? { locator: searchTarget.locator, requestId: searchTarget.requestId } : undefined}
          onAttach={value => appendAttachment(value)} onQuote={quoteMaterial} onOpenNote={openMaterialNote} onClose={() => setView('chat')}
        />}
        {view === 'materials' && !activeDeskId && <ReadingDivider presentationSide={readingSide} />}
        <div className="conversation-workspace-home" ref={setConversationHome} />
        </div>
        {state && materialsOpened && <ReadingDesk items={readingDeskItems} requestOpen={deskOpenRequest} openingRect={deskOpeningRect}
          companionAtStart={companion.presence === 'window' && (workspaceScene === 'study' && companion.character === 'sakiko'
            || characterRoomWorkspace && !!roomLayout?.bodyBounds && (roomLayout.bodyBounds[0] + roomLayout.bodyBounds[2]) / 2 < .5)}
          active={view === 'keep' || view === 'materials' && (!compactConversation || readingPane === 'reader')}
          boundary={`${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`} sessionId={sessionId}
          draftEnabled={draftReady && !navigating} refreshKey={`${messages.length}:${messages.at(-1)?.status || ''}`}
          conversationTarget={materialConversationTarget} reference={materialQuote ? materialQuoteAddress(materialQuote) : undefined}
          focus={searchTarget?.locator.kind === 'material' ? { locator: searchTarget.locator, requestId: searchTarget.requestId } : undefined}
          resume={materialResume} onActiveChange={setActiveDeskId} onReturnAddressChange={reportMaterialReturn}
          onUnsavedChange={setMaterialUnsaved} onDraftStateChange={(id, dirty) => {
            if (dirty) dirtyDeskIds.current.add(id); else dirtyDeskIds.current.delete(id);
          }} onAttach={appendAttachment} onQuote={quote => quoteMaterial(quote, viewRef.current === 'keep')}
          onCloseFrame={id => { if (unsettledKeepMaterial.current?.resourceId === id) {
            unsettledKeepMaterial.current = undefined; queueReturnCapture();
          } if (viewRef.current === 'keep') requestAnimationFrame(() => {
            if (!document.hasFocus() || appMainRef.current?.querySelector('.reading-desk-frame:not([hidden])')) return;
            const current = document.activeElement;
            if (current !== document.body && current instanceof HTMLElement && current.getClientRects().length) return;
            const target = readerReturnFocus.current;
            if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
          }); }} onPickDocument={pickMaterialDocument} onOpenNote={openMaterialNote} />}
        {(agendaOpened || view === 'agenda') && state && (
          <AgendaView
            key={`${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`}
            active={view === 'agenda'}
            state={state}
            matterInteractions={matterInteractions}
            onMatterInteraction={updateMatterInteraction}
            onAction={(a, operation) => void saveAction(a, operation)}
            onResume={openConversation}
            onChanged={() => void attempt(async () => updateState(await api.state()))}
            onClose={() => setView('chat')}
            onCompose={() => useSuggestion('帮我记一件事：')}
            onContinue={useSuggestion}
            onState={updateState}
            onPresentMatter={(matter) => void prepareDisplay({ matter })}
            onMap={(id) => void showPlace(id)}
            onOpenMap={() => { searchNavigation.current++; openMap(emptyRoute()); }}
            onDiscuss={discussAgenda} focus={agendaContext?.focus} position={agendaPosition} onPositionChange={setAgendaPosition}
            onOpenOrigin={record => void attempt(() => openAgendaOrigin(record))}
            onReturnAddressChange={reportAgendaReturn} resume={agendaResume}
          />
        )}
        {notesOpened && state && <NotesPanel embedded key={state.privacyEpoch} active={view === 'notes'} refreshKey={`${keepContentRevision}:${noteAddressRevision}`} onReturnAddressChange={reportNoteReturn} resume={noteResume} focus={searchTarget?.locator.kind === 'note' ? { locator: searchTarget.locator, requestId: searchTarget.requestId } : undefined} onUnsavedChange={setNotesUnsaved} onOpenMaterialSource={openMaterialSource} onOpenConversationSource={openConversationSource} onOpenMaterials={() => setView('materials')} onQuote={quoteNote} quoteEnabled={draftReady && !navigating} quoteContext={`${sessionId || 'new'}:${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`} quoteBoundary={`${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`} discussion={notesDiscussion ? <div className="notes-discussion-home" ref={setNotesDiscussionHome} /> : undefined} onCloseDiscussion={() => setNotesDiscussion(false)} onClose={() => { setNotesDiscussion(false); setView('keep'); }} timeZone={state.settings.timeZone} />}
        {(view === 'settings' || view === 'memory' || view === 'companion') && state && (
          <SettingsPanel
            key={`${view}:${state.privacyEpoch}`}
            embedded
            initialTab={view === 'memory' ? '记忆' : view === 'companion' ? '陪伴' : '偏好'}
            companionMoment={companionActivity}
            companionEntry={companionEntry}
            companionEntryRevision={companionEntryRevision}
            state={state}
            busy={busy}
            onClose={closePersonal}
            onState={updateState}
            draft={settingsDraft}
            memoryWorkspace={memoryWorkspace}
            onMemoryWorkspace={(change) => {
              if (boundaryRevision.current.split(':')[0] === String(state.privacyEpoch))
                setMemoryWorkspace(change);
            }}
            notify={notify}
            onClear={() => { bookmarkUnsaved.current = false; setBookmarkResetKey(value => value + 1); clearReturnBoundary(); focusSession.clear(); void newChat(); }}
            onBeforeForget={() => keepUnsavedEdits('清空资料')}
          />
        )}
      </div>
      {resting && <RestSpace onClose={() => {
        setResting(false);
        requestAnimationFrame(() => {
          const editor = inputRef.current;
          if ((viewRef.current === 'chat' || viewRef.current === 'materials') && editor?.getClientRects().length) editor.focus({ preventScroll: true });
          else appMainRef.current?.querySelector<HTMLButtonElement>('.companion-menu-trigger')?.focus({ preventScroll: true });
        });
      }} />}
      {toast && <div className="toast"><QuietNotice message={toast} tone="status" onDismiss={() => setToast('')} /></div>}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {busy ? '让我想一想。' : messages.at(-1)?.status === 'done' ? '可以接着聊了。' : ''}
      </div>
      {displayReview && (
        <DisplayReview
          surface={displayReview}
          onStart={async () => {
            updateState(await api.setPresentationSurface('public'));
          }}
          onClose={() => {
            setDisplayReview(undefined);
            void api.clearPublicArtifact().catch(() => {});
          }}
        />
      )}
      {panel === 'history' && state && (
        <LocalSearchPanel
          state={state}
          conversations={state.conversations}
          busy={busy || navigating}
          onClose={() => setPanel(null)}
          onRestoreFocus={() => inputRef.current?.focus({ preventScroll: true })}
          onOpen={async (id) => { await openConversation(id); }}
          onSelect={openSearchResult}
          onDelete={async (id) => {
            if (!keepUnsavedEdits('忘记对话')) { setPanel(null); return; }
            await attempt(async () => {
              updateState(await api.deleteConversation(id));
              if (id === sessionId) newChat();
            });
          }}
        />
      )}
      {previewImage && (
        <Modal title="图片预览" className="image-preview-panel" onClose={() => setPreviewImage(undefined)}>
          <div className="image-preview-body">
            <img
              className="image-preview-content"
              src={previewImage.dataUrl}
              alt={`图片预览：${previewImage.name}`}
            />
          </div>
        </Modal>
      )}
      {closingDrafts && (
        <Modal
          title="还有没说完的话。"
          onClose={() => setClosingDrafts(undefined)}
          className="draft-exit-panel"
        >
          <div className="panel-body">
            <p className="panel-intro">这些草稿还只在当前窗口中。保存到本机后，下次可以接着写。</p>
            <div className="draft-exit-list">
              {closingDrafts.map((d) => (
                <article key={d.id}>
                  <strong>{state?.conversations.find((c) => c.id === d.id)?.title || '新的一页'}</strong>
                  <p>{d.text || '只有附件'}</p>
                  {d.attachmentName && <small>附件：{d.attachmentName}</small>}
                  {d.temporary && <small className="draft-temporary">这条选择了不保存，退出后会丢弃。</small>}
                </article>
              ))}
            </div>
            {closeError && <QuietNotice message={closeError} />}
            <div className="field-buttons">
              {closingDrafts.some((d) => !d.temporary) && (
                <button
                  className="primary-button"
                  disabled={savingDraft}
                  onClick={() =>
                    void (async () => {
                      setSavingDraft(true);
                      setCloseError('');
                      try {
                        for (const draft of closingDrafts.filter((d) => !d.temporary)) {
                          const info = await api.draftInfo(draft.id);
                          if (info.digest !== draft.digest)
                            throw new Error('草稿内容已变化，请返回查看后再保存。');
                          if (!info.persisted)
                            await api.persistDraft({ id: draft.id, digest: draft.digest, confirmed: true });
                        }
                        api.window('close-confirmed');
                      } catch (error) {
                        setCloseError(errorText(error));
                      } finally {
                        setSavingDraft(false);
                      }
                    })()
                  }
                >
                  {savingDraft
                    ? '正在保存…'
                    : closingDrafts.some((d) => d.temporary)
                      ? '保存非临时草稿并退出'
                      : '保存并退出'}
                </button>
              )}
              <button
                className="subtle-button"
                disabled={savingDraft}
                onClick={() => setClosingDrafts(undefined)}
              >
                继续编辑
              </button>
              <button
                className="text-button"
                disabled={savingDraft}
                onClick={() => api.window('close-confirmed')}
              >
                放弃未保存草稿并退出
              </button>
            </div>
          </div>
        </Modal>
      )}
      {mapSheet && (
        <MapSheet
          key={`${sessionId || 'new'}:${state?.privacyEpoch}:${state?.policyRevision}:${state?.sourceBoundary ?? 0}`}
          initialRoute={mapSheet}
          initialConditions={mapSheetConditions} memory={mapSheetMemory}
          onWindowClose={() => void requestClose()}
          onPresenceHost={setMapPresenceHost}
          returnLabel={
            view === 'chat'
              ? '返回对话'
              : view === 'agenda'
                ? '返回安排'
                : view === 'memory'
                  ? '返回关于你'
                  : view === 'notes'
                    ? '返回笔记'
                    : view === 'keep'
                      ? '返回留下'
                    : view === 'materials'
                      ? '返回资料'
                      : view === 'companion'
                        ? '返回陪伴'
                  : '返回连接与偏好'
          }
          onClose={() => setMapSheet(null)}
          onUseContext={useMapContext}
        />
      )}
      {scopeOpen && (
        <ScopeSettings
          value={turnControls}
          onClose={() => { setScopeOpen(false); requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true })); }}
          onChange={(value) => {
            const boundary = boundaryRevision.current;
            clearFollowup(); clearSceneSelection(); clearMaterialQuote(); clearNativeReferences();
            turnControlsRef.current = value;
            setTurnControls(value);
            if (value.retention === 'session_only')
              void attempt(() =>
                api.saveDraft({
                  id: draftKey.current,
                  draft: hostDraft(draftRef.current),
                  retention: 'session_only',
                  privacyEpoch: draftPrivacyEpoch(boundary),
                }),
              );
            else void attempt(() => api.saveDraft({ id: draftKey.current, draft: hostDraft(draftRef.current), privacyEpoch: draftPrivacyEpoch(boundary) }));
          }}
        />
      )}
      {createPortal(
        <main ref={materialConversationTarget} className={`workspace ${empty && view !== 'materials' && view !== 'notes' ? 'welcome' : 'conversation'}`}
          aria-label={state?.conversations.find(conversation => conversation.id === sessionId)?.title || '对话'}
          data-presence-edge="conversation-paper" data-presence-edge-sides="top right bottom left" data-presence-edge-label="对话纸边"
          data-presence-edge-disabled={view === 'materials' || atWindow ? 'true' : undefined}>
          {empty && view !== 'materials' && view !== 'notes' ? (
            <div className="welcome-inner">
              <div className="welcome-greeting">
                <p className="welcome-date">{new Date().toLocaleDateString('zh-CN', { timeZone: state?.settings.timeZone || DEFAULT_TIME_ZONE, weekday: 'long' })}</p>
                <h1>{state?.settings.persona.core.address.trim() ? `${state.settings.persona.core.address.trim()}，回来啦。` : '回来啦。'}</h1>
              </div>
              {loadError && <QuietNotice message={loadError} action={{ label: '重新打开', onClick: () => setLoadAttempt(n => n + 1) }} />}
              {!draftReady && !loadError && (
                <p className="startup-status" role="status">
                  正在回到这里…
                </p>
              )}
              <div className="composer-home" ref={setComposerHome} />
              {!(startupReturn && startupReturnBoundary.current === boundaryRevision.current) && previousConversation && <div className="welcome-next" aria-label="从这里继续">
                <button type="button" title={`接着上次：${previousConversation.title}`} aria-label={`接着上次：${previousConversation.title}`} onClick={() => void openConversation(previousConversation.id)} disabled={busy || navigating}><History size={18} /><span>{previousConversation.title}</span><ArrowUpRight size={17} /></button>
              </div>}
              {startupReturn && startupReturnBoundary.current === boundaryRevision.current && <ReturnBookmark disabled={!draftReady || busy || navigating}
                point={{ id: String(startupReturn.savedAt),
                  title: startupReturn.view === 'keep' || startupReturn.view === 'notes' && startupReturn.note ? '留下的那一页'
                    : startupReturn.view === 'materials' && startupReturn.material ? '上次读到的那一页'
                    : startupReturn.view === 'agenda' && startupReturn.agenda ? state?.agenda.find(item => item.id === startupReturn.agenda?.record.id)?.title || '上次看到的安排'
                    : startupReturn.sessionId ? state?.conversations.find(item => item.id === startupReturn.sessionId)?.title || '桌边留着的那段话'
                      : '还没写完的这句话',
                  ...(startupReturn.view === 'materials' && startupReturn.material ? { detail: `第 ${startupReturn.material.page} 页` } : {}),
                  ...(!startupReturn.sessionId && startupReturn.view === 'chat' && input ? { excerpt: Array.from(input).slice(0, 100).join('') } : {}),
                  onResume: () => restoreWorkspace(startupReturn) }}
                onDismiss={() => { cancelReturnResume(); returnDismissedGesture.current = readingGesture.current;
                  setStartupReturn(undefined); workspaceReturn.forget(); }} />}
              <div ref={setPreparationHome} />
            </div>
          ) : (
            <>
              <div
                className="message-scroll"
                ref={scrollRef}
                onWheelCapture={() => { followRef.current = false; rememberReadingPosition(); }}
                onPointerDownCapture={() => { followRef.current = false; rememberReadingPosition(); }}
                onKeyDownCapture={() => { followRef.current = false; rememberReadingPosition(); }}
                onScroll={() => {
                  const el = scrollRef.current!;
                  const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                  // Layout, unfolding a hint or a composer resize may also
                  // scroll here. Only send / return-to-latest resumes following
                  // after an intentional reading gesture.
                  setAway(!atEnd);
                  rememberReadingPosition();
                }}
              >
                <div className="messages">
                  {empty && view === 'materials' && !input.trim() && <div className="reading-conversation-welcome"><BookOpen size={24} strokeWidth={1.2} /><h2>这一页，我们一起读。</h2><p>不明白的地方，可以选一段带过来。<br />想到哪里，就从哪里聊起。</p></div>}
                  {renderedMessages}
                  {activeMatter && (
                    <details className="current-matter">
                      <summary>
                        接着说「{activeMatter.title}」<ChevronRight size={14} />
                      </summary>
                      <MatterCard
                        matter={activeMatter}
                        interaction={matterInteractions[activeMatter.id]}
                        onInteraction={(value) => updateMatterInteraction(activeMatter.id, value)}
                        onState={updateState}
                        onPresent={() => void prepareDisplay({ matter: activeMatter })}
                        onMap={(id) => void showPlace(id)}
                      />
                    </details>
                  )}
                  <div ref={setPreparationHome} />
                </div>
              </div>
              <div className="bottom-composer">
                {!composerDock.target && memoryHint}
                <div className="composer-home" ref={setComposerHome} />
              </div>
            </>
          )}
        </main>
      , conversationHost)}
      {createPortal(composer, composerHost)}
    </div>
    </ConversationComposerDockContext.Provider>
    </ConversationTextFocusContext.Provider>}
    </SourceBookmarkProvider>
  );
}

function MessageView({
  message: m,
  primaryBodyPresented = false,
  timeZone = DEFAULT_TIME_ZONE,
  agenda,
  matters,
  onSave,
  onRevoke,
  onCopyText,
  onCorrect,
  onReviseDraft,
  onPresent,
  onMessageChanged,
  onQuote,
  assistantPassage,
  onAssistantPassage,
  onViewAgenda,
  onActionEditChange,
  onOpenSource,
  onOpenMap,
  onUseMapContext,
  onPreviewImage,
  onOpenAttachment,
  sceneSelection,
  programFocus,
  onSceneSelect,
  onFollowup,
  onRehearsalCurrentReadStart,
  onReaderNavigation,
  onOpenDocument,
  onOpenNote,
  onOpenStudySource,
  currentSceneMessages,
  latestRehearsalRevisions,
  latestStudyRevisions,
  sceneInterruptionKey,
  onContinueScene,
  busy,
  boundary,
  companionName,
  privacyEpoch,
  policyRevision,
  programStateEphemeral,
  children,
}: {
  message: Message;
  primaryBodyPresented?: boolean;
  children?: import('react').ReactNode;
  companionName?: string;
  privacyEpoch?: number;
  policyRevision?: number;
  programStateEphemeral?: boolean;
  timeZone?: string;
  agenda: Action[];
  matters: SharedMatterView[];
  onSave: (item: Action) => Promise<ActionResult>;
  onRevoke: (effect: ActionEffectRef) => Promise<ActionResult>;
  onCopyText: (text: string, label?: string) => void;
  onCorrect: () => void;
  onReviseDraft: (recipient: string) => void;
  onPresent: (artifact: ReleaseArtifact) => void;
  onMessageChanged: (message: Message) => void;
  onQuote: (text: string) => void;
  assistantPassage?: AssistantTextReference;
  onAssistantPassage: (reference: AssistantTextReference, preview: string, kind: AssistantPassage['kind']) => void;
  onViewAgenda: (item?: Action, occurrenceDate?: string) => void;
  onActionEditChange: (sessionId: string, messageId: string, id: string, dirty: boolean, pending: boolean) => void;
  onOpenSource: (source: ReplySourceAddress) => void | Promise<void>;
  onOpenMap: (route: MapRouteResult) => void;
  onUseMapContext: (value: MapContextHandoff) => boolean;
  onPreviewImage: (image: NonNullable<Message['image']>) => void;
  onOpenAttachment: (attachment: DraftAttachment) => void;
  sceneSelection?:SemanticSelection;
  programFocus?:ProgramFollowupReference;
  onSceneSelect:(selection:SemanticSelection)=>void;
  onFollowup: (request: PresentationFollowup) => void;
  onRehearsalCurrentReadStart: (rehearsalId: string) => ((ref: RehearsalRef) => void) | undefined;
  onReaderNavigation: () => void;
  onOpenDocument: (locator: Extract<LocalSearchLocator, { kind: 'material' }>) => void;
  onOpenNote: (input: NoteNativeInput) => void;
  onOpenStudySource: (input: StudyNativeInput) => void;
  currentSceneMessages:Map<string,string>;
  latestRehearsalRevisions: ReadonlyMap<string, number>;
  latestStudyRevisions: ReadonlyMap<string, number>;
  sceneInterruptionKey?:string;
  onContinueScene:()=>void;
  busy: boolean;
  boundary: string;
}) {
  const [selectedPassage, setSelectedPassage] = useState('');
  const canReferenceAssistant = m.role === 'assistant' && m.status === 'done' && !m.demo && m.retention !== 'session_only'
    && !programStateEphemeral && !primaryBodyPresented;
  const [assistantHash, setAssistantHash] = useState<{ content: string; value: string }>();
  useEffect(() => {
    let current = true;
    if (!canReferenceAssistant) { setAssistantHash(undefined); return; }
    void replyTextSha(m.content).then(value => { if (current) setAssistantHash({ content: m.content, value }); })
      .catch(() => { if (current) setAssistantHash(undefined); });
    return () => { current = false; };
  }, [canReferenceAssistant, m.content]);
  const livePresentation=useRef(m.status==='running');
  const article = useRef<HTMLElement>(null),
    prose = useRef<HTMLDivElement>(null),
    exposed = useRef(false);
  useEffect(() => {
    if (
      m.role !== 'assistant' ||
      m.status !== 'done' ||
      !(m.cooperationId || m.proactive === 'check_in') ||
      primaryBodyPresented ||
      !article.current ||
      exposed.current
    )
      return;
    let visible = false;
    const expose = () => {
        if (!visible || document.hidden || !document.hasFocus() || exposed.current) return;
        exposed.current = true;
        void api
          .recordResponseExposure({ sessionId: m.sessionId, messageId: m.id, event: 'displayed' })
          .then(result => { if (!result.recorded) exposed.current = false; })
          .catch(() => { exposed.current = false; });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some(entry => entry.isIntersecting && entry.intersectionRect.height >= Math.min(60, entry.boundingClientRect.height));
        expose();
      },
      { threshold: 0 },
    );
    observer.observe(article.current);
    window.addEventListener('focus', expose); document.addEventListener('visibilitychange', expose);
    return () => { observer.disconnect(); window.removeEventListener('focus', expose); document.removeEventListener('visibilitychange', expose); };
  }, [m.id, m.status, m.cooperationId, m.proactive, primaryBodyPresented, boundary]);
  useEffect(() => { setSelectedPassage(''); }, [m.id, boundary, primaryBodyPresented]);
  function selectionChanged() {
    const selection = window.getSelection();
    const selectionRoot = primaryBodyPresented
      ? article.current?.querySelector<HTMLElement>('[data-primary-help-prose]') : prose.current;
    if (!selection?.rangeCount || !selectionRoot?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      setSelectedPassage('');
      return;
    }
    const range = selection.getRangeAt(0);
    if ([...selectionRoot.querySelectorAll('.local-text-focus, .readable-focus')].some(node => range.intersectsNode(node))) {
      setSelectedPassage('');
      return;
    }
    const fragment = range.cloneContents();
    const formulas = fragment.querySelectorAll('.katex');
    let text = selection.toString().trim();
    if (formulas.length) {
      for (const formula of formulas) {
        const tex = formula.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
        if (tex) formula.replaceWith(document.createTextNode('$' + tex + '$'));
      }
      text = fragment.textContent?.trim() || text;
    }
    setSelectedPassage(text.length <= 6000 ? text : '');
  }
  if (m.role === 'user')
    return (
      <article className="user-message" aria-label="你的消息" data-message-id={m.id} tabIndex={-1}>
        <div className="message-byline">
          你
          <span>
            {new Date(m.createdAt).toLocaleTimeString('zh-CN', {
              timeZone,
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </span>
        </div>
        <div className="user-message-stack">
          {!!(m.attachments?.length || m.image) && <AttachmentTray
            items={(m.attachments || (m.image ? [m.image] : [])).map((item, index) => ({
              id: item.kind === 'text' && item.resource ? item.resource.resourceId : item.attachmentId || `${m.id}:${index}`,
              name: item.name, kind: item.kind === 'image' ? 'image' : item.resource ? 'document' : 'text',
              ...(item.kind === 'image' ? { image: item } : { mediaType: item.resource?.mediaType }),
            }))}
            onOpen={id => {
              const item = (m.attachments || (m.image ? [m.image] : [])).find((value, index) =>
                (value.kind === 'text' && value.resource ? value.resource.resourceId : value.attachmentId || `${m.id}:${index}`) === id);
              if (item) onOpenAttachment(item);
            }} />}
          <MessageBookmarkSource message={m} />
        </div>
      </article>
    );
  const processBlock = <ChatProcess message={m} />;
  const response=m.responseText??m.content;
  const renderedResponse = primaryBodyPresented ? '' : response;
  const paragraphBreak=m.views?.length?renderedResponse.search(/\n\s*\n/):-1;
  const lead=paragraphBreak>=0?renderedResponse.slice(0,paragraphBreak):renderedResponse;
  const followup=paragraphBreak>=0?renderedResponse.slice(paragraphBreak).trim():'';
  const manuscriptView = m.views?.length === 1 && !m.views[0].anchor
    ? m.views.find(view => view.sceneRefs.some(ref => m.scenes?.some(scene =>
      scene.kind === 'discussion' && scene.id === ref.id && scene.revision === ref.revision))) : undefined;
  const manuscriptSceneId = manuscriptView?.sceneRefs.find(ref => m.scenes?.some(scene =>
    scene.kind === 'discussion' && scene.id === ref.id && scene.revision === ref.revision))?.id;
  const renderView=(view:NonNullable<Message['views']>[number])=>(
    <AssistantPresentation
      key={view.id}
      view={view}
      scenes={m.scenes||[]}
      sessionId={m.sessionId}
      messageId={m.id}
      boundaryKey={boundary}
      privacyEpoch={privacyEpoch}
      policyRevision={policyRevision}
      programStateEphemeral={programStateEphemeral}
      hostViewBoundaryKey={m.presentationBoundaryKey}
      timeZone={timeZone}
      onFollowup={onFollowup}
      onRehearsalCurrentReadStart={onRehearsalCurrentReadStart}
      onReaderNavigation={onReaderNavigation}
      onOpenDocument={onOpenDocument}
      onOpenNote={onOpenNote}
      onOpenStudySource={onOpenStudySource}
      latestRehearsalRevisions={latestRehearsalRevisions}
      latestStudyRevisions={latestStudyRevisions}
      manuscriptText={view.id === manuscriptView?.id ? followup : undefined}
      manuscriptSceneId={view.id === manuscriptView?.id ? manuscriptSceneId : undefined}
      selection={sceneSelection}
      programFocus={programFocus}
      onSelect={onSceneSelect}
      isStreaming={m.status==='running'}
      renderMap={(scene,active)=>{
        const current=currentSceneMessages.get(scene.id)===m.id;
        const memoryKey=current?`${m.sessionId}/${scene.id}`:`${m.id}/${scene.id}`;
        return <ConversationMap key={memoryKey} scene={scene} memoryKey={memoryKey} continuationKey={`${m.sessionId}/${scene.id}`} historical={!current} cancelled={m.status==='cancelled'||m.status==='error'} interruptionKey={sceneInterruptionKey} active={active} allowCameraRequests={(m.status==='running'||livePresentation.current)&&m.status!=='cancelled'&&m.status!=='error'} onSelect={onSceneSelect} onContinue={onContinueScene} onUseMapContext={onUseMapContext}/>;
      }}
    />
  );
  // Older single papers retain their manuscript. Anchored replies keep each
  // passage beside the view published there, including mixed discussions.
  const activity = m.status === 'running' ? m.presentationActivity : undefined;
  const presentationItems: { id: string; anchor?: ViewAnchor; view?: PresentationView; activity?: NonNullable<Message['presentationActivity']> }[] =
    (m.views || []).map(view => ({ id: view.id, anchor: view.anchor, view }));
  if (activity) presentationItems.push({ id: `activity:${activity.callId}`, anchor: { offset: activity.anchor, before: '' }, activity });
  const renderActivity = () => activity && <PresentationActivity key={`activity:${activity.callId}`} phase={activity.phase} />;
  const body=manuscriptView
    ?<>{!!lead&&<div className="markdown">{canReferenceAssistant ? <AssistantTextSource text={lead}
      sourceStart={0} sourceEnd={Array.from(lead).length}
      referenceBase={assistantHash?.content === m.content ? { sessionId: m.sessionId, messageId: m.id, contentSha256: assistantHash.value } : undefined}
      activeReference={assistantPassage} onFocus={onAssistantPassage} /> : <RichText text={lead}/>}</div>}{m.views?.map(renderView)}{renderActivity()}</>
    :interleaveViews(renderedResponse,presentationItems).map((part,index)=>part.kind==='text'
      ?<div className="markdown" key={`text-${index}`}>{canReferenceAssistant ? <AssistantTextSource text={part.text}
        sourceStart={part.sourceStart} sourceEnd={part.sourceEnd}
        referenceBase={assistantHash?.content === m.content ? { sessionId: m.sessionId, messageId: m.id, contentSha256: assistantHash.value } : undefined}
        activeReference={assistantPassage} onFocus={onAssistantPassage} /> : <RichText text={part.text}/>}</div>
      :part.view.view ? renderView(part.view.view) : renderActivity());
  // An unstamped legacy author must not borrow whichever picture is current.
  const authorArtwork = m.authorCompanionId || companionAuthorArtwork(m.authorName);
  return (
    <article className="assistant-message" ref={article} data-message-id={m.id} data-session-id={m.sessionId}
      data-assistant-content-sha256={assistantHash?.content === m.content ? assistantHash.value : undefined} tabIndex={-1}
      onMouseUp={selectionChanged} onKeyUp={selectionChanged}>
      <div className="assistant-name">
        {authorArtwork && <CompanionAvatar size={31} characterId={authorArtwork} />}
        <span>{m.authorName || '在场'}</span>
        {m.demo && <small>示例</small>}
        {m.proactive && <small className="assistant-proactive" title={new Date(m.createdAt).toLocaleString()}>{m.proactive === 'check_in' ? '来找你' : '替你留意到'}</small>}
      </div>
      <div ref={prose}>
        {body}
      </div>
      {children}
      {!!selectedPassage && (
        <button
          className="quote-selection subtle-button"
          onMouseUp={event => event.stopPropagation()}
          onKeyUp={event => event.stopPropagation()}
          onClick={() => {
            onQuote(selectedPassage);
            setSelectedPassage('');
          }}
        >
          <Quote size={14} />
          引用所选内容继续
        </button>
      )}
      {m.actions.some((action) => {
        const current = agenda.find((item) => item.id === action.id);
        return current && (current.revision || 1) !== (action.revision || 1);
      }) && <p className="historical-change">安排后来有过修改，下面是当前内容。</p>}
      {m.actions.map((a) => (
        <ActionCard
          key={a.id}
          action={a.planningOffer ? a : agenda.find((v) => v.id === a.id) || a}
          timeZone={timeZone}
          saved={agenda.some((v) => v.id === a.id)}
          onSave={onSave}
          onRevoke={onRevoke}
          onView={onViewAgenda}
          onEditStateChange={(id, dirty, pending) => onActionEditChange(m.sessionId, m.id, id, dirty, pending)}
          disabled={busy}
          boundary={boundary}
        />
      ))}
      {[
        ...new Map(
          (m.releaseArtifacts || [])
            .slice()
            .sort((a, b) => a.revision - b.revision)
            .map((artifact) => [artifact.id, artifact]),
        ).values(),
      ].map((artifact) => (
        <ReleaseCard
          key={artifact.id}
          artifact={artifact}
          versions={(m.releaseArtifacts || []).filter(
            (value) => value.id === artifact.id && value.revision < artifact.revision,
          )}
          persisted={m.retention !== 'session_only'}
          onCopy={onCopyText}
          onRevise={() => onReviseDraft(artifact.brief.recipient)}
          onPresent={() => onPresent(artifact)}
          onSave={async (body, expectedRevision) =>
            onMessageChanged(
              await api.editReleaseArtifact({
                sessionId: m.sessionId,
                messageId: m.id,
                id: artifact.id,
                expectedRevision,
                body,
              }),
            )
          }
          onRefresh={async () => {
            const current = (await api.messages(m.sessionId)).find((message) => message.id === m.id);
            if (current) onMessageChanged(current);
          }}
          disabled={busy}
        />
      ))}
      {(m.objectStates || []).flatMap((item) => {
        const current =
          item.kind === 'work' &&
          matters.find((matter) => matter.id === item.id && matter.revision !== item.historicalRevision);
        return current
          ? [
              <p key={item.id} className="historical-change">
                「{current.title}」后来有过调整；这里保留当时的回复。
              </p>,
            ]
          : [];
      })}
      {!m.scenes?.some(scene=>scene.kind==='map')&&m.mapCards?.map((card, cardIndex) => (
        <MapRouteCard key={cardIndex} card={card} onOpen={() => onOpenMap(card.route)} />
      ))}
      {(m.hostStatus || m.status === 'error' || m.status === 'cancelled') && (
        <div className={`message-host-status ${m.hostStatus?.kind || m.status}`} role="status" aria-label="处理状态">
          {m.hostStatus?.kind === 'notice' ? <Info size={14} aria-hidden="true" />
            : m.status === 'cancelled' ? <Minus size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
          <p>{m.hostStatus?.text || (m.status === 'cancelled' ? '好，先停在这里。' : '这件事没做完，你写的话都还在。')}</p>
        </div>
      )}
        <div className="message-actions">
          <ReplyEvidence key={boundary} message={m} onOpenSource={onOpenSource} />
          {processBlock}
          {m.status !== 'running' && !!response.trim() && <IconButton label="复制回复" onClick={() => onCopyText(response)}>
            <Copy size={14} />
          </IconButton>}
          {m.status === 'done' && (
            <IconButton label="说说哪里不对" onClick={onCorrect} disabled={busy}><Pencil size={17} /></IconButton>
          )}
          {m.status === 'done' && !m.demo && m.retention !== 'session_only' && (
            <FeedbackControl messageId={m.id} />
          )}
          {(m.status === 'error' || m.status === 'cancelled') && (
            <div className="message-recovery">
              <button className="text-button" onClick={onContinueScene} disabled={busy}>
                <ArrowUpRight size={13} />
                接着说
              </button>
            </div>
          )}
        </div>
    </article>
  );
}

function ReleaseCard({
  artifact,
  versions,
  persisted,
  onCopy,
  onRevise,
  onPresent,
  onSave,
  onRefresh,
  disabled,
}: {
  artifact: ReleaseArtifact;
  versions: ReleaseArtifact[];
  persisted: boolean;
  onCopy: (text: string, label?: string) => void;
  onRevise: () => void;
  onPresent: () => void;
  onSave: (body: string, expectedRevision: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(artifact.body),
    [temporary, setTemporary] = useState<string>(),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const editRevision = useRef(artifact.revision);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = bodyInput.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    el.style.height = 'auto';
    el.style.height = Math.max(86, Math.min(el.scrollHeight, 320, window.innerHeight * 0.38)) + 'px';
    el.scrollTop =
      document.activeElement === el && el.selectionEnd === el.value.length ? el.scrollHeight : scrollTop;
  }, [body, editing]);
  const visibleBody = temporary ?? artifact.body;
  async function save(current = false) {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      if (persisted) await onSave(body, current ? artifact.revision : editRevision.current);
      else setTemporary(body);
      setEditing(false);
    } catch (error) {
      setError(errorText(error));
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="release-card" aria-label={`给${artifact.brief.recipient}的草稿，未发送`}>
      <div className="release-card-heading">
        <div>
          <span>给{artifact.brief.recipient}</span>
          <strong>
            {temporary ? '本轮修改的草稿' : artifact.authoredBy === 'user' ? '你修改过的草稿' : '草稿已准备'}
          </strong>
        </div>
        <span className="release-state">未发送</span>
      </div>
      {editing ? (
        <form
          className="release-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="field-label">
            修改草稿
            <textarea
              aria-label="修改草稿正文"
              ref={bodyInput}
              autoFocus
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              maxLength={16000}
            />
          </label>
          {error && (
            <div className="inline-problem" role="alert">
              <p>{error} 你的文字仍保留。</p>
              <details>
                <summary>查看当前保存的稿件</summary>
                <div className="markdown">
                  <RichText text={artifact.body} />
                </div>
              </details>
            </div>
          )}
          <div className="field-buttons">
            {error ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => void save(true)}
                disabled={saving || !body.trim()}
              >
                {saving ? '正在保存…' : '保留我的文字，按当前版本保存'}
              </button>
            ) : (
              <button className="primary-button" disabled={saving || !body.trim()}>
                {saving ? '正在保存…' : persisted ? '保存稿件修改' : '用于本轮'}
              </button>
            )}
            <button type="button" className="text-button" onClick={() => setEditing(false)} disabled={saving}>
              取消编辑
            </button>
          </div>
        </form>
      ) : (
        <div className="release-body markdown">
          <RichText text={visibleBody} />
        </div>
      )}
      {!editing && (
        <div className="release-card-actions">
          <button className="primary-button" onClick={() => onCopy(visibleBody, '草稿')}>
            <Copy size={14} />
            复制草稿
          </button>
          {!editing && (
            <button
              className="text-button"
              onClick={() => {
                setBody(visibleBody);
                editRevision.current = artifact.revision;
                setError('');
                setEditing(true);
              }}
              disabled={disabled}
            >
              <Pencil size={13} />
              直接编辑
            </button>
          )}
          <details className="quiet-menu">
            <summary>更多</summary>
            <button onClick={onRevise} disabled={disabled}>
              继续请在场修改
            </button>
            <button onClick={onPresent} disabled={disabled || !persisted}>
              展示这份稿件
            </button>
          </details>
          <small>{persisted ? '复制后可到原服务发送' : '临时稿件 · 退出后不保留'}</small>
        </div>
      )}
      {!!versions.length && (
        <details className="release-versions">
          <summary>查看之前的版本</summary>
          {versions
            .slice()
            .reverse()
            .map((version) => (
              <article key={version.revision}>
                <small>版本 {version.revision}</small>
                <div className="markdown">
                  <RichText text={version.body} />
                </div>
              </article>
            ))}
        </details>
      )}
    </section>
  );
}

function ActionCard({
  action,
  timeZone,
  saved,
  onSave,
  onRevoke,
  onView,
  disabled,
  boundary,
  onEditStateChange,
}: {
  action: Action;
  timeZone: string;
  saved: boolean;
  onSave: (item: Action) => Promise<ActionResult>;
  onRevoke: (effect: ActionEffectRef) => Promise<ActionResult>;
  onView: (item?: Action, occurrenceDate?: string) => void;
  disabled: boolean;
  boundary: string;
  onEditStateChange: (id: string, dirty: boolean, pending: boolean) => void;
}) {
  const zone = action.timeZone || timeZone;
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(action.title),
    [detail, setDetail] = useState(action.detail),
    [time, setTime] = useState(toTimeInput(action.startsAt, zone));
  const [effect, setEffect] = useState<Awaited<ReturnType<typeof api.actionState>>>(),
    [revoking, setRevoking] = useState(false);
  const [saving, setSaving] = useState(false),
    [actionError, setActionError] = useState('');
  const editBase = useRef(action);
  const reportEdit = useRef(onEditStateChange); reportEdit.current = onEditStateChange;
  const edited = editing && (title !== editBase.current.title || detail !== editBase.current.detail
    || time !== toTimeInput(editBase.current.startsAt, editBase.current.timeZone || timeZone));
  useLayoutEffect(() => { reportEdit.current(action.id, edited, saving || revoking); }, [action.id, boundary, edited, saving, revoking]);
  useLayoutEffect(() => () => reportEdit.current(action.id, false, false), [action.id, boundary]);
  useEffect(() => {
    if (!editing) {
      setTitle(action.title);
      setDetail(action.detail);
      setTime(toTimeInput(action.startsAt, zone));
      editBase.current = action;
    }
  }, [action.revision, action.title, action.detail, action.startsAt, editing, zone]);
  useEffect(() => {
    let live = true;
    api
      .actionState(action.effectActionId || action.id)
      .then((v) => {
        if (live) setEffect(v);
      })
      .catch(() => setEffect({ action: null, receipts: [] }));
    return () => {
      live = false;
    };
  }, [action.id, action.effectActionId, action.revision, boundary, saved, disabled]);
  async function revoke() {
    if (revoking) return;
    setRevoking(true);
    try {
      const current = effect?.action;
      if (!current) {
        setActionError('这次操作的记录暂时没有读到，尚未撤销。');
        return;
      }
      const result = await onRevoke({ id: current.id, revision: current.revision, digest: current.digest, status: current.status });
      if (!result.ok) {
        setActionError(result.error || '撤销没有完成，请再看看。');
        return;
      }
      setEffect(await api.actionState(action.effectActionId || action.id));
    } finally {
      setRevoking(false);
    }
  }
  const latestReceipt = effect?.receipts.at(-1);
  const localRemoved =
    effect?.localRecord === null &&
    effect?.action?.status === 'succeeded' &&
    latestReceipt?.status === 'confirmed_success';
  const localSaved =
    effect?.action?.status === 'succeeded' &&
    latestReceipt?.status === 'confirmed_success' &&
    effect.localRecord !== null &&
    (latestReceipt.localStatus === 'local_saved' || !!effect.localRecord);
  const failure = effect?.action?.status === 'failed_confirmed';
  const unresolved =
    !!effect?.action &&
    ['outcome_unknown', 'unresolved', 'reconciling', 'cancel_requested', 'cancellation_unknown'].includes(
      effect.action.status,
    );
  const cancelled =
    !!effect?.action &&
    ['cancelled', 'cancellation_confirmed', 'cannot_cancel'].includes(effect.action.status);
  const nonDispatch = effect?.action?.nonDispatchProof;
  const cancelledBeforeDispatch = effect?.action?.status === 'cancelled' && !!nonDispatch
    && nonDispatch.actionId === effect.action.id && nonDispatch.actionRevision === effect.action.revision
    && nonDispatch.actionDigest === effect.action.digest && Number.isFinite(Date.parse(nonDispatch.observedAt));
  const cancellationConfirmed = effect?.action?.status === 'cancellation_confirmed';
  const isCalendarChange = !!action.calendarChange || effect?.action?.capability === 'local.agenda.change';
  const changeOperation = action.calendarChange?.operation || effect?.action?.arguments.operation;
  const occurrenceDate = action.calendarChange?.occurrenceDate || (typeof effect?.action?.arguments.occurrenceDate === 'string' ? effect.action.arguments.occurrenceDate : undefined);
  const occurrenceCancellation = action.calendarChange?.cancelled ?? (typeof effect?.action?.arguments.cancelled === 'boolean' ? effect.action.arguments.cancelled : undefined);
  const changingOccurrence = changeOperation === 'change_occurrence';
  const cancellingOccurrence = changingOccurrence && occurrenceCancellation === true;
  const restoringOccurrence = changingOccurrence && occurrenceCancellation === false;
  const viewArrangement = () => onView(effect?.localRecord || action, changingOccurrence ? occurrenceDate : undefined);
  if (action.planningOffer) return <PlanningOfferCard action={action} effect={effect} disabled={disabled} onSave={onSave} onView={viewArrangement}
    onRefresh={async () => { setEffect(await api.actionState(action.effectActionId || action.id)); }} />;
  const deletingCalendarItem = changeOperation === 'delete';
  const planStateLabel = (state: NonNullable<Action['planning']>['state']) => ({ invitation: '尚未答应的邀请', wish: '愿望', proposed: '待选择的方案', accepted: '已接受的安排' })[state];
  let savedItem = effect?.localRecord || action;
  if (changingOccurrence && occurrenceDate && effect?.localRecord) {
    const exception = savedItem.exceptions?.find(item => item.onDate === occurrenceDate);
    let startsAt = exception?.startsAt;
    if (!startsAt && savedItem.startsAt) {
      try { startsAt = fromTimeInput(`${occurrenceDate}T${toTimeInput(savedItem.startsAt, savedItem.timeZone || zone).slice(11)}`, savedItem.timeZone || zone); } catch {}
    }
    savedItem = { ...savedItem, startsAt, detail: exception?.detail ?? savedItem.detail,
      durationMinutes: exception?.durationMinutes === null ? undefined : exception?.durationMinutes ?? savedItem.durationMinutes };
  }
  if (localRemoved)
    return (
      <div className="saved-action removed-action">
        <Check size={18} />
        <div>
          <strong>{action.title}</strong>
          <small>这项安排已移除。</small>
        </div>
        <button className="text-button" onClick={() => void revoke()} disabled={disabled || revoking}>
          {revoking ? '正在撤销…' : '撤销'}
        </button>
        <button className="text-button" onClick={viewArrangement}>
          查看安排
          <ChevronRight size={14} />
        </button>
      </div>
    );
  if (saved && effect === undefined)
    return (
      <div className="saved-action saved-action-pending" aria-live="polite">
        <LoaderCircle size={18} className="spin" />
        <div>
          <strong>{action.title}</strong>
          <small>看看这项安排有没有留住…</small>
        </div>
      </div>
    );
  if (localSaved)
    return (
      <div className="saved-action saved-action-receipt">
        <Check size={19} aria-hidden="true" />
        <div>
          <strong>{savedItem.title}</strong>
          <span className="saved-action-info">
            {savedItem.startsAt && <time dateTime={savedItem.startsAt} title={timeZoneLabel(savedItem.timeZone || zone)}>{formatDate(savedItem.startsAt, savedItem.timeZone || zone)}</time>}
            {(savedItem.done || cancellingOccurrence || restoringOccurrence || savedItem.planning?.state === 'invitation' || savedItem.planning?.state === 'wish' || savedItem.planning?.state === 'proposed') && <span>
              {savedItem.done ? '已完成' : cancellingOccurrence ? '已取消这一次' : restoringOccurrence ? '已恢复这一次' : savedItem.planning?.state === 'invitation' ? '邀请' : savedItem.planning?.state === 'wish' ? '愿望' : '方案'}
            </span>}
            {action.coverage === 'conditional' && !!action.missingNeeds?.length && <span>还有条件未确定</span>}
          </span>
          {actionError && (
            <p className="inline-problem" role="alert">
              {actionError}
            </p>
          )}
        </div>
        <IconButton label={`撤回这项安排：${action.title}`} onClick={() => void revoke()} disabled={disabled || revoking}>
          {revoking ? <LoaderCircle size={18} className="spin" /> : <Undo2 size={18} />}
        </IconButton>
        <IconButton label={`查看安排：${savedItem.title}`} onClick={viewArrangement}><ArrowUpRight size={19} /></IconButton>
      </div>
    );
  if (saved && (failure || unresolved || !effect?.action))
    return (
      <div className="stale-action action-receipt-warning">
        <CircleAlert size={17} aria-hidden="true" />
        <div>
          <strong>{action.title}</strong>
          <p>
            {failure
              ? '这项安排尚未保存。'
              : unresolved
                ? '结果还不能确认，请先核对再继续。'
                : '这项安排的保存结果暂时无法核对。'}
          </p>
          <button className="text-button" onClick={viewArrangement} disabled={disabled}>
            看看结果
          </button>
        </div>
      </div>
    );
  if (cancelled)
    return (
      <div className={cancellationConfirmed || cancelledBeforeDispatch ? 'saved-action saved-action-receipt' : 'stale-action action-receipt-warning'}>
        {cancellationConfirmed || cancelledBeforeDispatch ? <Check size={19} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}
        <div>
          <strong>{action.title}</strong>
          {cancellationConfirmed || cancelledBeforeDispatch
            ? <small>{cancellationConfirmed ? isCalendarChange ? '这次修改已撤销。' : '这项安排已撤销。' : '这项提议已收起。'}</small>
            : <p>这项操作已停止，结果需要核对。</p>}
          <button className="text-button" onClick={viewArrangement} disabled={disabled}>
            查看安排
          </button>
        </div>
      </div>
    );
  if (
    effect?.action &&
    [
      'cancelled',
      'cancel_requested',
      'outcome_unknown',
      'unresolved',
      'cannot_cancel',
      'cancellation_unknown',
      'cancellation_confirmed',
    ].includes(effect.action.status)
  )
    return (
      <div className="stale-action">
        <CircleAlert size={17} />
        <div>
          <strong>{action.title}</strong>
          <p>
            {[
              'outcome_unknown',
              'unresolved',
              'cancel_requested',
              'cannot_cancel',
              'cancellation_unknown',
            ].includes(effect.action.status)
              ? '还不确定这次有没有完成，先去安排里看看。'
              : '情况有了变化，我们再看看这个安排。'}
          </p>
          <button
            className="text-button"
            onClick={viewArrangement}
            disabled={disabled}
          >
            {[
              'outcome_unknown',
              'unresolved',
              'cancel_requested',
              'cannot_cancel',
              'cancellation_unknown',
            ].includes(effect.action.status)
              ? '看看结果'
              : '再看看'}
          </button>
        </div>
      </div>
    );
  return (
    <div className="action-card">
      <div className="action-eyebrow">
        <span className="status-dot suggestion" aria-hidden="true" />
        {action.demo ? '建议 · 示例' : cancellingOccurrence ? '取消这一次' : restoringOccurrence ? '恢复这一次' : isCalendarChange ? deletingCalendarItem ? '移除安排' : '修改安排' : '接下来可以'}
      </div>
      {editing ? (
        <div className="action-edit">
          <label>
            想做的事
            <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            补充
            <textarea value={detail} maxLength={1500} onChange={(e) => setDetail(e.target.value)} />
          </label>
          <label>
            留个时间（{timeZoneLabel(zone)}） <small>可选</small>
            <input type="datetime-local" step="1" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
      ) : (
        <>
          <h3>{title}</h3>
          <p>{detail}</p>
          {changingOccurrence && occurrenceDate && <div className="action-time">仅这一次 · {occurrenceDate}</div>}
          {action.startsAt && (
            <div className="action-time">
              <CalendarDays size={13} />
              {formatDate(action.startsAt, zone)} · {timeZoneLabel(zone)}
            </div>
          )}
          {action.allDayDate && <div className="action-time">{action.allDayDate} · 全天</div>}
          {action.durationMinutes && <div className="action-time">{action.durationMinutes} 分钟</div>}
          {!changingOccurrence && action.recurrence && <div className="action-time">每 {action.recurrence.interval || 1} {({ daily: '天', weekly: '周', monthly: '个月', yearly: '年' } as const)[action.recurrence.frequency]}重复</div>}
          {effect?.action?.arguments.changes && typeof effect.action.arguments.changes === 'object' && !Array.isArray(effect.action.arguments.changes) && effect.action.arguments.changes.recurrence === null && <div className="action-time">不再重复</div>}
          {!changingOccurrence && action.remindAt && <div className="action-time">提醒 · {formatDate(action.remindAt, zone)}</div>}
          {action.planning && <div className="action-time">{isCalendarChange ? '采用后 · ' : ''}{planStateLabel(action.planning.state)}{action.planning.flexibility === 'movable' ? ' · 可调整' : ''}</div>}
        </>
      )}
      <div className="action-buttons">
        <button
          className={`primary-button ${saved ? 'saved' : ''}`}
          disabled={disabled || saved || saving || !title.trim()}
          onClick={() => {
            let startsAt: string | undefined;
            try {
              startsAt = fromTimeInput(time, zone, editBase.current.startsAt);
            } catch (error) {
              setActionError(errorText(error));
              return;
            }
            setSaving(true);
            setActionError('');
            void onSave({
              ...editBase.current,
              title,
              detail,
              startsAt,
              timeZone: zone,
            })
              .then(async (result) => {
                if (result.ok) {
                  setEditing(false);
                  setEffect(await api.actionState(action.effectActionId || action.id));
                }
                else setActionError(result.error || '修改还未保存。');
              })
              .catch(error => setActionError(errorText(error)))
              .finally(() => setSaving(false));
          }}
        >
          {saved ? (
            <>
              <Check size={15} />
              已加入安排
            </>
          ) : (
            <>
              {saving ? '正在保存…' : cancellingOccurrence ? '取消这次安排' : restoringOccurrence ? '恢复这次安排' : isCalendarChange ? deletingCalendarItem ? '移除这项安排' : '应用这次修改' : action.planning?.state === 'proposed' ? '保留这份方案' : action.planning?.state === 'invitation' ? '记下这份邀请' : action.planning?.state === 'wish' ? '留下这个想法' : '加入我的安排'}
              <ArrowUpRight size={15} />
            </>
          )}
        </button>
        {!saved && !deletingCalendarItem && !cancellingOccurrence && !restoringOccurrence && (
          <button className="text-button" disabled={disabled} onClick={() => setEditing(!editing)}>
            {editing ? '取消修改' : '调整一下'}
          </button>
        )}
      </div>
      {actionError && (
        <p className="inline-problem" role="alert">
          {actionError} 你填写的内容仍保留。
        </p>
      )}
      {action.coverage === 'conditional' && !!action.missingNeeds?.length && (
        <p className="action-conditions">
          还想弄清楚：{[...new Set((action.missingNeeds || []).map(needName))].join('、')}
          。可以先把这个想法留在这台电脑上。
        </p>
      )}
    </div>
  );
}
