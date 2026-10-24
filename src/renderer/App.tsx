import { Portal, IconButton, Modal, WindowControls, uiError } from './ui';
import { SettingsPanel, type SettingsDraft } from './SettingsPanel';
import { NotesPanel } from './NotesPanel';
import { MaterialsPanel, type MaterialQuote } from './MaterialsPanel';
import { materialQuoteAddress, type MaterialQuoteReference } from '../shared/materials';
import { noteQuoteAddress, type NoteQuote, type NoteQuoteReference } from '../shared/notes';
import type { AgendaFocus } from '../shared/agenda';
import type { SharedMapRoute } from '../shared/map-context';
import { LocalSearchPanel } from './LocalSearchPanel';
import { ComposerActions } from './ComposerActions';
import { FocusContextChip } from './FocusContextChip';
import { environmentTimeLabels } from './presentation/environment-time';
import { LetterHistoryCard } from './LetterHistoryCard';
import { PlanningOfferCard } from './PlanningOfferCard';
import { ConversationComposerDockContext, useConversationComposerDock } from './ConversationComposerDock';
import { ReadingDivider } from './ReadingDivider';
import { SourceBookmarkProvider, type StudyBookmarkDestination } from './SourceBookmarkTray';
import type { SourceBookmarkReference, ConversationBookmarkReference } from '../shared/source-bookmark';
import { MessageBookmarkSource } from './MessageBookmarkSource';
import { SCENE_FRAME_MIME, readSceneFrameTransfer } from '../shared/scene-transfer';
import { discussionArtworkLabel } from '../shared/discussion-scene';
import './scene-transfer.css';
import { FocusLamp } from './FocusLamp';
import { focusSession } from './focus-session';
import { ReturnBookmark } from './ReturnBookmark';
import { useWorkspaceReturn, type WorkspaceReturnAddress, type WorkspaceReturnCheckpoint,
  type MaterialReturnAddress, type NoteReturnAddress, type AgendaReturnAddress } from './workspace-return';
import { companionSceneMoment } from './companion-variants';
import { currentCompanionActivity } from '../shared/companion-activity';
import { ConversationTextFocusContext } from './ConversationTextFocus';
import { createPortal } from 'react-dom';
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
import { AgendaView, type AgendaViewPosition, type WorkspaceView } from './Workspace';
import { Navigation } from './Navigation';
import { CompanionAvatar, CompanionScene, RestSpace, prefersQuietMotion, useCompanion } from './companion';
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
  Coffee,
  BookOpen,
  SlidersHorizontal,
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
import type { Action, ActionEffectRef, Draft, Memory, Message, NavigationTarget, ReleaseArtifact, State } from '../shared/types';
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
  ScopeSettings,
  FeedbackControl,
  needName,
  emptyMemoryWorkspace,
  type TurnControls,
} from './HarnessViews';

const api = window.zaichang;
type Panel = 'history' | null;
type ActionResult = { ok: boolean; error?: string };
type PresentationFollowup = { text: string; studyInteraction?: StudyInteraction; companionReference?: CompanionFollowupReference;
  curiosityReference?: CuriosityFollowupReference; letterReference?: LetterReference; focusOnly?: boolean; focusLabel?: string;
  programReference?: ProgramFollowupReference; preparationReference?: PreparationFocusReference;
  readProgramInputs?: () => ProgramStateValues | undefined;
  rehearsalInteraction?: RehearsalInteraction; noteReference?: NoteReference };
type ComposerFollowup = PresentationFollowup & {
  token: number; sessionId?: string; messageId: string; boundary: string; insertedText?: string;
};
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
  const [attachment, setAttachment] = useState<Draft['attachment']>(null);
  const draftRef = useRef<Draft>({ text: '', attachment: null }),
    draftKey = useRef('new'),
    draftRevision = useRef(0),
    navigation = useRef(0);
  const settingsDraft = useRef<SettingsDraft>({});
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
  const [view, setView] = useState<WorkspaceView>('chat');
  const [readingPane, setReadingPane] = useState<'reader' | 'chat'>('reader');
  const [resting, setResting] = useState(false);
  const [focusActive, setFocusActive] = useState(false);
  const [chatSpace, setChatSpace] = useState<'auto' | 'window' | 'reading'>('auto');
  const [compactConversation, setCompactConversation] = useState(() => matchMedia('(max-width: 900px)').matches);
  useEffect(() => { setChatSpace('auto'); }, [sessionId]);
  useEffect(() => {
    const media = matchMedia('(max-width: 900px)');
    const resize = () => { rememberReadingPosition(); setCompactConversation(media.matches); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  const [notesOpened, setNotesOpened] = useState(false);
  const [materialsOpened, setMaterialsOpened] = useState(false);
  const [agendaOpened, setAgendaOpened] = useState(false);
  const [notesUnsaved, setNotesUnsaved] = useState(false);
  const [materialUnsaved, setMaterialUnsaved] = useState(false);
  const [agendaPosition, setAgendaPosition] = useState<AgendaViewPosition>();
  const [searchTarget, setSearchTarget] = useState<{ locator: LocalSearchLocator; requestId: number }>();
  const [preparationRequest, setPreparationRequest] = useState<PreparationFocusReference & { requestId: number }>();
  const preparationNavigation = useRef(0);
  const searchNavigation = useRef(0), locatedSearch = useRef(0);
  useEffect(() => { setSearchTarget(undefined); }, [state?.privacyEpoch, state?.policyRevision, state?.sourceBoundary]);
  useEffect(() => {
    if (searchTarget && view !== ({ conversation: 'chat', note: 'notes', material: 'materials' } as const)[searchTarget.locator.kind]) setSearchTarget(undefined);
  }, [view]);
  useEffect(() => { if (view === 'notes') setNotesOpened(true); }, [view]);
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
    setMaterialResume(undefined); setNoteResume(undefined); setAgendaResume(undefined);
  }
  function clearReturnBoundary() {
    cancelReturnResume(); returnOwners.current = {}; returnInteraction.current = false;
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
  const materialConversationTarget = useRef<HTMLElement>(null);
  function clearMaterialQuote() { materialQuoteRef.current = undefined; setMaterialQuote(undefined); }
  const [noteQuote, setNoteQuote] = useState<NoteQuote>();
  const noteQuoteRef = useRef<NoteQuote | undefined>(undefined);
  function clearNoteQuote() { noteQuoteRef.current = undefined; setNoteQuote(undefined); }
  const [conversationQuote, setConversationQuote] = useState<{ reference: ConversationBookmarkReference; title: string }>();
  const conversationQuoteRef = useRef<typeof conversationQuote>(undefined);
  function clearConversationQuote() { conversationQuoteRef.current = undefined; setConversationQuote(undefined); }
  const [agendaContext, setAgendaContext] = useState<{ focus: AgendaFocus; label: string }>();
  const agendaContextRef = useRef<typeof agendaContext>(undefined);
  function clearAgendaContext() { agendaContextRef.current = undefined; setAgendaContext(undefined); }
  function clearMapContext(stop = true) {
    const previous = sharedMapContextRef.current;
    sharedMapContextRef.current = undefined; setSharedMapContext(undefined);
    if (stop && previous) void api.shareMapContext({ enabled: false,
      ...(previous.selectionId ? { expectedSelectionId: previous.selectionId } : {}) }).catch(() => {});
  }
  function clearNativeReferences() { clearNoteQuote(); clearConversationQuote(); clearAgendaContext(); clearMapContext(); }
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
    const finished = () => setSceneDropActive(false);
    window.addEventListener('dragend', finished); window.addEventListener('drop', finished);
    return () => { window.removeEventListener('dragend', finished); window.removeEventListener('drop', finished); };
  }, []);
  useEffect(()=>{clearSceneSelection();clearFollowup();clearMaterialQuote();clearNoteQuote();clearAgendaContext();},[sessionId]);
  useEffect(()=>{clearSceneSelection();clearFollowup();clearMaterialQuote();clearNativeReferences();clearConversationMapViews();},[state?.privacyEpoch,state?.policyRevision,state?.sourceBoundary]);
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
  const privateReturn = useRef<{ sessionId?: string; view: WorkspaceView }>({ view: 'chat' });
  const [previewImage, setPreviewImage] = useState<Message['image']>();
  const scrollRef = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLTextAreaElement>(null),
    followRef = useRef(true);
  const [composerHome, setComposerHome] = useState<HTMLDivElement | null>(null);
  const composerHost = useMemo(() => {
    const element = document.createElement('div');
    element.className = 'conversation-composer-host';
    return element;
  }, []);
  const composerMoveRequested = useRef(false), composerMoveAnimation = useRef<Animation | undefined>(undefined);
  const composerMoveOrigin = useRef<DOMRect | undefined>(undefined);
  function requestComposerMove() {
    composerMoveRequested.current = true;
    composerMoveOrigin.current = composing.current || prefersQuietMotion() ? undefined : composerHost.getBoundingClientRect();
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
    if (composerHost.parentElement === parent || !parent.isConnected) return;
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
      animation.onfinish = () => { if (composerMoveAnimation.current === animation) composerMoveAnimation.current = undefined; };
    }
  }
  function placeComposer() {
    const parent = composerDock.target?.element || composerHome;
    if (parent) moveComposer(parent);
  }
  function revealPaperComposer() {
    const viewport = scrollRef.current;
    if (!studyDockRef.current || !viewport?.contains(composerHost)) return;
    const writer = composerHost.getBoundingClientRect(), visible = viewport.getBoundingClientRect();
    const shift = writer.bottom > visible.bottom - 16 ? writer.bottom - visible.bottom + 16
      : writer.top < visible.top + 16 ? writer.top - visible.top - 16 : 0;
    if (shift) viewport.scrollTo({ top: viewport.scrollTop + shift, behavior: prefersQuietMotion() ? 'instant' : 'smooth' });
  }
  useLayoutEffect(placeComposer, [composerHome, composerHost, composerDock.target, view, draftReady, navigating]);
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
    if (!state || returnBoundary !== boundaryRevision.current || !draftReady || navigationPending.current || surfaceMode.current === 'public' || !returnCaptureReady.current
      || !returnInteraction.current || returnRestoring.current || pendingReturnPosition.current
      || readingGesture.current <= returnDismissedGesture.current
      || !['chat', 'materials', 'notes', 'agenda'].includes(viewRef.current)) return;
    const ephemeral = turnControlsRef.current.retention === 'session_only' || temporaryConversation;
    const currentSession = !ephemeral ? sessionRef.current : undefined;
    const material = viewRef.current === 'materials' || materialQuoteRef.current
      && materialQuoteRef.current.resourceId === returnOwners.current.material?.resourceId ? returnOwners.current.material : undefined;
    const note = viewRef.current === 'notes' || noteQuoteRef.current?.id === returnOwners.current.note?.id ? returnOwners.current.note : undefined;
    const agenda = viewRef.current === 'agenda' || agendaContextRef.current?.focus.record.id === returnOwners.current.agenda?.record.id
      ? returnOwners.current.agenda : undefined;
    if (viewRef.current === 'materials' && !material || viewRef.current === 'notes' && !note
      || viewRef.current === 'agenda' && !agenda) return;
    const address: WorkspaceReturnAddress = { view: viewRef.current as WorkspaceReturnAddress['view'],
      ...(currentSession ? { sessionId: currentSession } : {}), ...(material ? { material } : {}), ...(note ? { note } : {}), ...(agenda ? { agenda } : {}) };
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
      address.quote = materialQuoteRef.current ? { kind: 'material', reference: materialQuoteAddress(materialQuoteRef.current) }
        : noteQuoteRef.current ? { kind: 'notebook', reference: noteQuoteAddress(noteQuoteRef.current) }
          : conversationQuoteRef.current ? { kind: 'conversation', reference: conversationQuoteRef.current.reference } : undefined;
      const paper = studyDockRef.current;
      if (currentSession && paper?.messageId && messages.some(message => message.id === paper.messageId && message.retention !== 'session_only'))
        address.study = { messageId: paper.messageId, focus: paper.focus };
    }
    if (!currentSession && !material && !note && !agenda && (ephemeral || !draftRef.current.text.trim() && !draftRef.current.attachment)) return;
    if (workspaceReturn.remember(address) && startupReturn) setStartupReturn(undefined);
  }
  captureReturnRef.current = captureWorkspaceReturn;
  useEffect(() => {
    const close = () => { captureReturnRef.current(); workspaceReturn.flush(); };
    window.addEventListener('beforeunload', close); window.addEventListener('pagehide', close);
    return () => { window.removeEventListener('beforeunload', close); window.removeEventListener('pagehide', close); };
  }, [workspaceReturn]);
  const busy = starting || messages.some((m) => m.status === 'running');
  const empty = messages.length === 0;
  const latestAssistant = messages.filter(message => message.role === 'assistant' && !message.proactive).at(-1);
  const hasScene = !!latestAssistant?.views?.length || !!latestAssistant?.scenes?.length;
  const needsReadingRoom = !!latestAssistant && (latestAssistant.content.length >= 560 || latestAssistant.content.split('\n').length >= 14);
  const readingSelectedWork = !!sceneSelection || !!composerDock.target
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
  const hintNeedsPaper = companionHint !== undefined && ['study', 'reading', 'planning', 'attention'].includes(companionHint);
  // Current direct references take precedence over the latest displayed paper.
  // This selects artwork only; no source is read, adopted or changed here.
  const companionActivity = focusActive || composerDock.target || currentComposerFollowup?.studyInteraction ? 'study'
    : currentComposerFollowup?.rehearsalInteraction ? 'listening'
    : view === 'materials' || materialQuote || noteQuote || conversationQuote || currentComposerFollowup?.noteReference ? 'reading'
      : agendaContext ? 'planning'
        : currentComposerFollowup?.curiosityReference ? 'play'
          : companionSceneMoment(selectedCompanionScene) || companionHint || presentedCompanionMoment
            || (chatSpace === 'reading' || needsReadingRoom || readingSelectedWork || hasScene ? 'reading' : 'chat');
  const canToggleRoom = view === 'chat' && companion.presence === 'window' && !compactConversation && !hasScene && !readingSelectedWork;
  const atWindow = view === 'chat' && companion.presence === 'window'
    && !focusActive && chatSpace !== 'reading' && !readingSelectedWork
    && (chatSpace === 'window' || !hintNeedsPaper)
    && (empty || (!compactConversation && !hasScene && (chatSpace === 'window' || !needsReadingRoom)));
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
      || sceneSelectionRef.current || materialQuoteRef.current || noteQuoteRef.current
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
        || composerFollowupRef.current !== previous || sceneSelectionRef.current || materialQuoteRef.current
        || noteQuoteRef.current || conversationQuoteRef.current || agendaContextRef.current || sharedMapContextRef.current || studyDockRef.current) return;
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
        || sceneSelectionRef.current || materialQuoteRef.current || noteQuoteRef.current || conversationQuoteRef.current || agendaContextRef.current
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
    setView('chat');
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
  }
  function useSuggestion(text: string, context?: LetterFocusContext | PreparationFocusContext) {
    searchNavigation.current++;
    if (context) {
      usePresentationFollowup({ text, ...context }, sessionRef.current,
        messages.filter(message => message.role === 'assistant').at(-1)?.id || ('preparationReference' in context
          ? `preparation:${context.preparationReference.id}` : `letter:${context.letterReference.opportunityId}`), boundaryRevision.current);
      return;
    }
    setView('chat');
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
    if (boundaryRevision.current && nextBoundary !== boundaryRevision.current) clearReturnBoundary();
    if (next.presentation?.mode === 'public') cancelReturnResume();
    if (next.presentation) surfaceRevision.current = next.presentation.revision;
    if (next.presentation?.mode === 'public') {
      if (surfaceMode.current !== 'public')
        privateReturn.current = { sessionId: sessionRef.current, view: viewRef.current };
      surfaceMode.current = 'public';
      setMessages([]);
      setInput('');
      setAttachment(null);
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
    if (boundaryRevision.current && revision !== boundaryRevision.current && sessionRef.current) {
      clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
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
  function replaceDraft(next: Draft, persist = true) {
    const boundary = boundaryRevision.current;
    draftRevision.current++;
    draftRef.current = next;
    setInput(next.text);
    setAttachment(next.attachment);
    setDraftSaved(false);
    if (persist)
      void attempt(() =>
        api.saveDraft({
          id: draftKey.current,
          draft: next,
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
      await api.saveDraft({ id, draft, privacyEpoch: draftPrivacyEpoch(boundary) });
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
    try {
      await flushProgramLocalStates();
      const pending = await api.unsavedDrafts();
      if (!pending.length) {
        api.window('close-confirmed');
        return;
      }
      const previews = await Promise.all(
        pending.map(async (item) => {
          const draft = await api.draft(item.id);
          return { ...item, text: draft.text, attachmentName: draft.attachment?.name };
        }),
      );
      setCloseError('');
      setClosingDrafts(previews);
    } catch (error) {
      notify(errorText(error));
    } finally {
      closePending.current = false;
    }
  }
  requestCloseRef.current = requestClose;
  function keepUnsavedEdits(action: string) {
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
    replaceDraft({ ...draftRef.current, ...part });
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
        setDraftReady(true);
      } catch (error) {
        setLoadError(errorText(error));
      }
    })();
    return api.onEvent((event) => {
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
        bounds = menu.getBoundingClientRect();
      const margin = 12,
        width = Math.min(238, window.innerWidth - margin * 2);
      const height = Math.min(bounds.height, window.innerHeight - margin * 2);
      const above = anchor.top - height - 8;
      setAttachmentMenuPosition({
        position: 'fixed',
        width,
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin)),
        top: Math.max(
          margin,
          Math.min(above >= margin ? above : anchor.bottom + 8, window.innerHeight - height - margin),
        ),
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
  useEffect(() => {
    if (followRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);
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
  }, [input, attachment, view, readingPane, empty, composerDock.target?.key]);
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
        setView('chat');
        return;
      }
      if (e.key === 'Escape' && busy && !panel) void stopReply();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, panel, attachmentMenu, mapSheet, view]);
  async function newChat() {
    if (busy || sendPending.current || navigationPending.current) return;
    captureWorkspaceReturn(); workspaceReturn.flush();
    navigationPending.current = true;
    setNavigating(true);
    const token = ++navigation.current;
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
    try {
      await attempt(async () => {
        if (sharedMapContext) {
          await api.shareMapContext({ enabled: false });
          clearMapContext(false);
        }
        if (sessionRef.current) updateState(await api.endConversation(sessionRef.current));
        const saved = await api.draft('new');
        if (token !== navigation.current) return;
        draftKey.current = 'new';
        replaceDraft(saved, false);
        sessionRef.current = undefined;
        setSessionId(undefined);
        setMessages([]);
        setPanel(null);
        setView('chat');
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
    if (navigationPending.current) return;
    if (!stillRequested) { captureWorkspaceReturn(); workspaceReturn.flush(); }
    navigationPending.current = true;
    setNavigating(true);
    const token = ++navigation.current;
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
    let opened: Message[] | undefined;
    try {
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
        if (stillRequested && !next.length && !saved.text.trim() && !saved.attachment && !state?.conversations.some(item => item.id === id))
          throw new Error('那段对话已经不在这里了。');
        if (destination && !next.some(message => message.id === destination.messageId)) {
          notify('这句话已经不在原来的位置了，请重新找找。');
          return;
        }
        setSearchTarget(destination ? { locator: destination, requestId: ++searchNavigation.current } : undefined);
        draftKey.current = id;
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
    const previousReferences = { material: materialQuoteRef.current, note: noteQuoteRef.current, conversation: conversationQuoteRef.current,
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
      }
      if (!current()) return;
      setSearchTarget(undefined); setPanel(null);
      pendingReturnPosition.current = { checkpoint: restored, ticket, boundary, gesture, navigation: expectedNavigation, search: expectedSearch, ready: false };
      if (restored.study && restored.sessionId && !restored.quote) {
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
      } else if (restored.quote) delete restored.study;
      if (restored.quote) {
        try {
          let address = restored.quote;
          const attached = draftRef.current.attachment;
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
      if (restored.material) { setMaterialsOpened(true); setMaterialResume({ address: restored.material, requestId }); }
      if (restored.note) { setNotesOpened(true); setNoteResume({ address: restored.note, requestId }); }
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
          noteQuoteRef.current = previousReferences.note; setNoteQuote(previousReferences.note);
          conversationQuoteRef.current = previousReferences.conversation; setConversationQuote(previousReferences.conversation);
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
    if (editor && saved.composer?.focused && (view === 'chat' || view === 'materials')) {
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(Math.min(editor.value.length, saved.composer.start), Math.min(editor.value.length, saved.composer.end), saved.composer.direction);
    } else if (view === 'chat' && saved.message && viewport) {
      [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')].find(node => node.dataset.messageId === saved.message!.id)?.focus({ preventScroll: true });
    }
    pendingReturnPosition.current = undefined; returnRestoring.current = false;
    queueReturnCapture();
  }, [messages, view, sessionId, composerDock.target?.key, startupReturn, currentComposerFollowup?.token]);
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
  ) {
    const text = value, comparisonText = text.trim();
    if (!comparisonText || composing.current || sendPending.current || (!consumeDraft && busy) || navigationPending.current || !draftReady
      || surfaceMode.current === 'public') return;
    sendPending.current = true;
    const sequence = ++sendSequence.current;
    const revision = draftRevision.current,
      previousKey = draftKey.current,
      selectedSessionId = sessionRef.current,
      selectedBoundary = boundaryRevision.current,
      selectedNavigation = navigation.current;
    const selectedControls = consumeDraft ? turnControlsRef.current : retryControls;
    const controls = selectedControls ? structuredClone(selectedControls) : undefined;
    const selectedAttachment = consumeDraft ? draftRef.current.attachment : null;
    const file = selectedAttachment ? structuredClone(selectedAttachment) : null,
      image = file?.kind === 'image' ? file : retryImage;
    const selectedScene = consumeDraft ? sceneSelectionRef.current : undefined;
    const selectedMaterialQuote = consumeDraft ? materialQuoteRef.current : undefined;
    const selectedNoteQuote = consumeDraft ? noteQuoteRef.current : undefined;
    const selectedConversationQuote = consumeDraft ? conversationQuoteRef.current : undefined;
    const selectedAgendaContext = consumeDraft ? agendaContextRef.current : undefined;
    const selectedMapContext = consumeDraft ? sharedMapContextRef.current : undefined;
    const selectedFollowup = consumeDraft ? composerFollowupRef.current : undefined;
    const validFollowup = selectedFollowup && selectedFollowup.sessionId === selectedSessionId && selectedFollowup.boundary === selectedBoundary
      ? selectedFollowup : undefined;
    const selectedStudyDock = consumeDraft && !validFollowup && !selectedScene && !selectedMaterialQuote
      && !selectedNoteQuote && !selectedConversationQuote && !selectedAgendaContext && !selectedMapContext ? studyDockRef.current : undefined;
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
    const attachment = file?.kind === 'text' && !file.resource ? { name: file.name, text: file.text } : undefined;
    let studyAddressUnavailable = false;
    const stillCurrent = () => sequence === sendSequence.current && selectedNavigation === navigation.current
      && selectedSessionId === sessionRef.current && selectedBoundary === boundaryRevision.current && !isPublicSurface()
      && (!consumeDraft || selectedControls === turnControlsRef.current && selectedScene === sceneSelectionRef.current
        && selectedMaterialQuote === materialQuoteRef.current
        && selectedNoteQuote === noteQuoteRef.current && selectedConversationQuote === conversationQuoteRef.current
        && selectedAgendaContext === agendaContextRef.current
        && selectedMapContext === sharedMapContextRef.current
        && selectedFollowup?.token === composerFollowupRef.current?.token
        && (!selectedStudyDock || studyAddressUnavailable || selectedStudyDock.key === studyDockRef.current?.key));
    setStarting(true);
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    followRef.current = true;
    try {
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
      const result = await api.send({ sessionId: selectedSessionId, content: text, controls,
        ...(attachment ? { attachment } : {}),
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
        ...(selectedAgendaContext ? { agendaFocus: selectedAgendaContext.focus } : {}),
        ...(selectedMapContext?.routeReference ? { mapRouteReference: selectedMapContext.routeReference } : {}),
        ...(rehearsalInteraction ? { rehearsalInteraction } : {}),
        ...(file?.kind === 'text' && file.resource ? { material: file.resource } : {}), ...(image ? { image } : {}) });
      if (isPublicSurface() || selectedNavigation !== navigation.current || selectedBoundary !== boundaryRevision.current) return;
      sessionRef.current = result.sessionId;
      setSessionId(result.sessionId);
      draftKey.current = result.sessionId;
      if (consumeDraft && revision === draftRevision.current) replaceDraft({ text: '', attachment: null });
      else if (consumeDraft) replaceDraft({ ...draftRef.current,
        attachment: draftRef.current.attachment === selectedAttachment ? null : draftRef.current.attachment });
      if (previousKey === 'new')
        void attempt(() => api.saveDraft({ id: 'new', draft: { text: '', attachment: null }, privacyEpoch: draftPrivacyEpoch(selectedBoundary) }));
      if (consumeDraft && selectedControls === turnControlsRef.current) {
        turnControlsRef.current = {};
        setTurnControls({});
      }
      if (consumeDraft && composerFollowupRef.current?.token === selectedFollowup?.token) clearFollowup();
      if (consumeDraft && sceneSelectionRef.current === selectedScene) clearSceneSelection();
      if (consumeDraft && materialQuoteRef.current === selectedMaterialQuote) clearMaterialQuote();
      if (consumeDraft && noteQuoteRef.current === selectedNoteQuote) clearNoteQuote();
      if (consumeDraft && conversationQuoteRef.current === selectedConversationQuote) clearConversationQuote();
      if (consumeDraft && agendaContextRef.current === selectedAgendaContext) clearAgendaContext();
    } catch (e) {
      notify(errorText(e));
    } finally {
      sendPending.current = false;
      setStarting(false);
      inputRef.current?.focus();
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
        draft: draftRef.current,
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
    const gesture = readingGesture.current, selectedNavigation = navigation.current, selectedRead = searchNavigation.current,
      boundary = boundaryRevision.current, selectedSession = sessionRef.current;
    requestAnimationFrame(() => {
      if (gesture !== readingGesture.current || selectedNavigation !== navigation.current || selectedRead !== searchNavigation.current
        || boundary !== boundaryRevision.current || selectedSession !== sessionRef.current || isPublicSurface()
        || !['chat', 'materials'].includes(viewRef.current) || !owns()) return;
      inputRef.current?.focus({ preventScroll: true });
    });
  }
  function quoteMaterial(quote: MaterialQuote) {
    if (!draftReady || navigating || navigationPending.current || isPublicSurface()) return false;
    searchNavigation.current++;
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    clearSceneSelection(); clearFollowup(); clearNativeReferences();
    materialQuoteRef.current = quote; setMaterialQuote(quote);
    setReadingPane('chat');
    queueReturnCapture();
    focusComposerAfterRead(() => materialQuoteRef.current === quote);
    return true;
  }
  function quoteNote(quote: NoteQuote) {
    if (!draftReady || navigating || navigationPending.current || isPublicSurface()) return false;
    searchNavigation.current++;
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
    noteQuoteRef.current = quote; setNoteQuote(quote);
    setView('chat'); setReadingPane('chat');
    queueReturnCapture();
    focusComposerAfterRead(() => noteQuoteRef.current === quote);
    return true;
  }
  async function discussBookmark(reference: SourceBookmarkReference) {
    const boundary = boundaryRevision.current, selectedSession = sessionRef.current, gesture = readingGesture.current,
      selectedNavigation = navigation.current, selectedRead = ++searchNavigation.current;
    const current = () => boundary === boundaryRevision.current && selectedSession === sessionRef.current
      && gesture === readingGesture.current && selectedNavigation === navigation.current && selectedRead === searchNavigation.current
      && !navigationPending.current && !isPublicSurface();
    if (!current()) return false;
    if (reference.kind === 'material') {
      const quote = await api.materialsQuote({ target: reference.target || { kind: 'saved', resourceId: reference.reference.resourceId },
        quote: materialQuoteAddress(reference.reference) });
      return current() && quoteMaterial(quote);
    }
    if (reference.kind === 'notebook') {
      const quote = await api.notesQuote(noteQuoteAddress(reference.reference));
      return current() && quoteNote(quote);
    }
    const preview = await api.sourceBookmarkPreview(reference);
    if (!current() || preview.reference.kind !== 'conversation') return false;
    if (studyDockRef.current) { requestComposerMove(); composerDock.returnToChat(); }
    searchNavigation.current++;
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNativeReferences();
    const selected = { reference: preview.reference.reference, title: preview.title };
    conversationQuoteRef.current = selected; setConversationQuote(selected);
    setView('chat'); setReadingPane('chat');
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
    clearSceneSelection(); clearFollowup(); clearMaterialQuote(); clearNoteQuote(); clearConversationQuote(); clearAgendaContext();
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
    const attached = draftRef.current.attachment;
    const target = attached?.kind === 'text' && attached.resource?.resourceId === source.resourceId
      ? { kind: 'pending' as const, reference: attached.resource } : { kind: 'saved' as const, resourceId: source.resourceId };
    try {
      const quote = await api.materialsQuote({ target, quote: materialQuoteAddress(source) });
      if (!current()) return;
      setSearchTarget({ locator: { kind: 'material', resourceId: quote.resourceId, sha256: quote.sha256,
        ...(quote.page ? { page: quote.page } : {}), field: 'body', offset: quote.start, end: quote.end }, requestId: request });
      setView('materials'); setReadingPane(discuss ? 'chat' : 'reader');
      if (discuss) quoteMaterial(quote);
    } catch (error) { if (current()) throw error; }
  }
  function openMaterialNote(id: string, revision: number) {
    setSearchTarget({ locator: { kind: 'note', noteId: id, revision, field: 'body', offset: 0, end: 0 }, requestId: ++searchNavigation.current });
    setView('notes');
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
    <div className={`composer-area${composerDock.target ? ' is-study-writing' : ''}${sceneDropActive ? ' is-scene-drop' : ''}`}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes(SCENE_FRAME_MIME) || !draftReady || navigating || surfaceMode.current === 'public') return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setSceneDropActive(true);
      }}
      onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setSceneDropActive(false); }}
      onDrop={event => {
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
      {sceneSelection && <FocusContextChip label={sceneSelectionLabel} trial={planningTrial} onClear={clearSceneSelection} />}
      {sceneDropIssue && <p className="scene-drop-message" role="status">{sceneDropIssue}</p>}
      {materialQuote && <div className="material-composer-quote">
        <button type="button" className="material-quote-source" title={materialQuote.text} onClick={() => void attempt(() => openMaterialSource(materialQuote))}>
          <FileText size={16} /><span>{materialQuote.name}{materialQuote.page ? ` · 第 ${materialQuote.page} 页` : ''}</span>
        </button>
        <button type="button" className="icon-button" aria-label="取消资料引用" onClick={() => { searchNavigation.current++; clearMaterialQuote(); inputRef.current?.focus({ preventScroll: true }); }}><X size={14} /></button>
      </div>}
      {noteQuote && <FocusContextChip label={noteQuote.title || '这页笔记'}
        onOpen={() => void attempt(() => openNoteSource(noteQuote))}
        onClear={() => { searchNavigation.current++; clearNoteQuote(); inputRef.current?.focus({ preventScroll: true }); }} />}
      {conversationQuote && <FocusContextChip label={conversationQuote.title}
        onOpen={() => void attempt(() => openConversationSource(conversationQuote.reference))}
        onClear={() => { searchNavigation.current++; clearConversationQuote(); inputRef.current?.focus({ preventScroll: true }); }} />}
      {agendaContext && <div className="material-composer-quote">
        <button type="button" className="material-quote-source" onClick={() => setView('agenda')}>
          <CalendarDays size={16} /><span>{agendaContext.label}</span>
        </button>
        <button type="button" className="icon-button" aria-label="取消安排引用" onClick={() => { clearAgendaContext(); inputRef.current?.focus({ preventScroll: true }); }}><X size={14} /></button>
      </div>}
      {composerFollowup && <FocusContextChip label={composerFollowup.focusLabel || (composerFollowup.studyInteraction ? '接着这一页聊'
        : composerFollowup.companionReference ? '从刚才停下的地方接着聊'
          : composerFollowup.curiosityReference?.focus ? '就刚才指的这一句聊聊'
            : composerFollowup.curiosityReference ? '接着这个小发现'
              : composerFollowup.rehearsalInteraction ? '接着刚才这一段试说'
                : composerFollowup.noteReference ? '接着这页笔记聊'
                  : composerFollowup.programReference ? '接着这份小作品聊' : '接着刚才这段聊')}
        onOpen={composerFollowup.preparationReference ? () => void attempt(() => openPreparationReference(composerFollowup.preparationReference!)) : undefined}
        onClear={() => clearFollowup(true)} />}
      {sharedMapContext && (
        <div className="shared-map-context" role="status">
          {sharedMapContext.routeReference && sharedMapContext.previewRoute
            ? <button type="button" className="material-quote-source" aria-label={`回到这条路线：${sharedMapContext.label}`}
                onClick={() => openMap(sharedMapContext.previewRoute!, sharedMapContext.routeConditions, sharedMapContext.previewMemory)}>{sharedMapContext.label}</button>
            : <span>本次起点：{sharedMapContext.label}</span>}
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
      <form
        className={`composer ${busy ? 'is-busy' : ''} ${!empty ? 'is-conversation' : ''} ${attachment ? 'has-attachment' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {attachment && (
          <div className="attachment">
            {attachment.kind === 'image' ? (
              <img className="attachment-preview" src={attachment.dataUrl} alt="" />
            ) : (
              <FileText size={15} />
            )}
            <span>{attachment.name}</span>
            <small>{attachment.kind === 'image' ? '图片 · 随本条发送' : '随本条发送'}</small>
            {attachment.kind === 'text' && attachment.resource && <button type="button" className="text-button" onClick={() => { setReadingPane('reader'); setView('materials'); }}>打开原文</button>}
            <IconButton label="移除附件" onClick={() => updateDraft({ attachment: null })}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        <textarea
          ref={inputRef}
          aria-label="和在场说说"
          placeholder={busy ? '想到了什么，也可以先写下来…' : composerDock.target ? '我接下来想到的是…' : empty ? '随便说一句，也可以。' : '接着说…'}
          value={input}
          rows={1}
          maxLength={LIMITS.draftText}
          disabled={!draftReady || navigating}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; requestAnimationFrame(placeComposer); }}
          onChange={(e) => { updateDraft({ text: e.target.value }); queueReturnCapture(); }}
          onSelect={queueReturnCapture}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !composing.current && !e.nativeEvent.isComposing &&
              e.nativeEvent.keyCode !== 229
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="composer-left">
            <div className="attachment-control" ref={attachmentControl}>
              <button
                ref={attachmentTrigger}
                className="icon-button"
                type="button"
                aria-label="添加资料"
                title="添加资料"
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
                  aria-label="添加资料"
                  onKeyDown={(e) => {
                    const items = [
                      ...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                    ];
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
                      void attempt(async () => {
                        const image = await api.attachImage();
                        if (image) updateDraft({ attachment: image });
                        inputRef.current?.focus();
                      });
                    }}
                  >
                    <ImageIcon size={18} />
                    <span>
                      添加图片<small>JPG、PNG 或 WebP</small>
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setAttachmentMenu(false);
                      void attempt(async () => {
                        const file = await api.attachText();
                        if (file) updateDraft({ attachment: file });
                        inputRef.current?.focus();
                      });
                    }}
                  >
                    <Paperclip size={18} />
                    <span>
                      添加文件<small>文本、Markdown 与 PDF</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className={`composer-context-button ${Object.keys(turnControls).length ? 'selected' : ''}`}
              onClick={() => setScopeOpen(true)}
              aria-label="这次怎么聊"
              disabled={navigating}
            >
              <SlidersHorizontal size={14} />
              <span>
                {turnControls.transmission === 'local_only'
                  ? '先留在这里'
                  : temporaryConversation
                    ? '这次不留下'
                    : turnControls.retention === 'session_only'
                      ? '这条不留下'
                      : turnControls.memoryMode === 'current_sources_only'
                        ? '只看这条'
                        : turnControls.audience && turnControls.audience !== 'self'
                          ? '写给别人'
                          : '这次怎么聊'}
              </span>
              <ChevronDown size={12} />
            </button>
          </div>
          <div className="composer-right">
            <ComposerActions busy={busy} submitting={starting || !draftReady || navigating}
              hasDraft={!!input.trim()} onStop={() => void stopReply()} />
          </div>
        </div>
      </form>
      <div className="composer-presence-tools">
        <FocusLamp disabled={!draftReady || navigating} onActiveChange={setFocusActive} />
        {canToggleRoom && <button type="button" className="text-button" onClick={() => {
          rememberReadingPosition(); setChatSpace(atWindow ? 'reading' : 'window');
        }}>{atWindow ? '安静阅读' : '回到窗边'}</button>}
      </div>
      <div className="composer-foot">
        {temporaryConversation && (
          <span role="status">
            {conversationRetention?.clearConversationOnExit
              ? '离开时不留下这段聊天，记下的安排会保留。'
              : '这段聊天不留下。'}
          </span>
        )}
        {(input || attachment) && (
          <div className="draft-status">
            {draftSaved ? (
              <span role="status">这段话已留好</span>
            ) : turnControls.retention === 'session_only' || temporaryConversation ? (
              <span>离开时不留下这段话</span>
            ) : (
              <button
                type="button"
                disabled={savingDraft || navigating}
                onClick={() => void saveCurrentDraft()}
              >
                {savingDraft ? '正在留好…' : '留作草稿'}
              </button>
            )}
          </div>
        )}
        {away && !empty ? (
          <button
            className="scroll-bottom"
            aria-label="回到最新消息"
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
            <ArrowDown size={15} />
            回到最新
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
          onViewAgenda={() => setView('agenda')}
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
          onContinueScene={()=>{setView('chat');requestAnimationFrame(()=>inputRef.current?.focus());}}
          onPreviewImage={setPreviewImage}
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
    [messages, visibleHelpBodies, state?.agenda, state?.matters, state?.preparations, state?.settings.timeZone, state?.privacyEpoch, state?.policyRevision, state?.sourceBoundary, turnControls.retention, notesUnsaved, materialUnsaved, draftReady, busy,sceneSelection,latestRehearsalRevisions,latestStudyRevisions,preparationRequest,
      // Highlight the current address without rebuilding history for each local value.
      currentComposerFollowup?.programReference?.messageId, currentComposerFollowup?.programReference?.programId,
      currentComposerFollowup?.programReference?.revision, currentComposerFollowup?.programReference?.nodeId],
  );

  if (state?.presentation?.mode === 'public')
    return <PublicDisplay surface={state.presentation} onEnd={endDisplay} notice={publicCloseNotice} />;
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
      onOpenStudy={location => { void attempt(() => openBookmarkedStudy(location)); }}>
    <ConversationTextFocusContext.Provider value={textFocus}>
    <ConversationComposerDockContext.Provider value={composerDock.value}>
    <div className={`app-shell ${atWindow ? 'has-window' : ''}${focusActive ? ' is-focusing' : ''}`}>
      <div className="app-main">
        {(view === 'chat' || view === 'materials') && <CompanionScene quiet={view !== 'chat' || !atWindow} moment={companionActivity} />}
        <header className="titlebar">
          <button className="brand" onClick={() => setView('chat')} aria-label="在场，回到对话">
            <Portal size={25} />
            <span>在场</span>
          </button>
          <div className="drag-space" />
          <Navigation
            view={view}
            busy={busy || navigating}
            onView={next => { if (next !== view) searchNavigation.current++; setView(next); }}
            onNew={() => void newChat()}
            onHistory={() => { searchNavigation.current++; setPanel('history'); }}
            onMap={() => { searchNavigation.current++; openMap(emptyRoute()); }}
          />
          <WindowControls onClose={() => void requestClose()} />
        </header>
        {(view === 'notes' || view === 'materials') && <div className="retained-heading">
          <div><h1>留下</h1></div>
          <nav aria-label="留下的内容">
            <button type="button" aria-current={view === 'notes' ? 'page' : undefined} onClick={() => setView('notes')}>笔记</button>
            <button type="button" aria-current={view === 'materials' ? 'page' : undefined} onClick={() => { setView('materials'); setReadingPane('reader'); }}>资料</button>
            <button type="button" onClick={() => setPanel('history')}>对话</button>
          </nav>
          {view === 'materials' && <div className="reading-pane-switch" aria-label="阅读与对话">
            <button type="button" aria-pressed={readingPane === 'reader'} onClick={() => setReadingPane('reader')}>原文</button>
            <button type="button" aria-pressed={readingPane === 'chat'} onClick={() => setReadingPane('chat')}>一起聊</button>
          </div>}
        </div>}
        <div className={`conversation-space ${view === 'materials' ? 'with-materials' : ''}`} data-reading-pane={readingPane} hidden={view !== 'chat' && view !== 'materials'}>
        {(materialsOpened || view === 'materials') && state && <MaterialsPanel
          active={view === 'materials'} refreshKey={`${messages.length}:${messages.at(-1)?.status || ''}`} compact pending={attachment?.kind === 'text' ? attachment : null} sessionId={sessionId} draftEnabled={draftReady && !navigating}
          onReturnAddressChange={reportMaterialReturn} resume={materialResume}
          boundary={`${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`}
          reference={materialQuote} onUnsavedChange={setMaterialUnsaved}
          conversationTarget={materialConversationTarget}
          focus={searchTarget?.locator.kind === 'material' ? { locator: searchTarget.locator, requestId: searchTarget.requestId } : undefined}
          onAttach={value => { if (!draftReady || navigating || navigationPending.current) return false; updateDraft({ attachment: value }); return true; }} onQuote={quoteMaterial} onOpenNote={openMaterialNote} onClose={() => setView('chat')}
        />}
        {view === 'materials' && <ReadingDivider />}
        <main ref={materialConversationTarget} className={`workspace ${empty && view !== 'materials' ? 'welcome' : 'conversation'}`}>
          {empty && view !== 'materials' ? (
            <div className="welcome-inner">
              <p className="welcome-date">{new Date().toLocaleDateString('zh-CN', { timeZone: state?.settings.timeZone || DEFAULT_TIME_ZONE, weekday: 'long' })}</p>
              <h1>{state?.settings.persona.core.address.trim() ? `${state.settings.persona.core.address.trim()}，回来啦。` : '回来啦。'}</h1>
              {loadError && (
                <div className="harness-inline-error" role="alert">
                  <p>这次没能打开。{loadError}</p>
                  <button className="text-button" onClick={() => setLoadAttempt((n) => n + 1)}>
                    重新打开
                  </button>
                </div>
              )}
              {!draftReady && !loadError && (
                <p className="startup-status" role="status">
                  正在回到这里…
                </p>
              )}
              <div className="composer-home" ref={setComposerHome} />
              <div className="welcome-next" aria-label="从这里继续">
                {startupReturn && startupReturnBoundary.current === boundaryRevision.current ? null : previousConversation ? <button type="button" onClick={() => void openConversation(previousConversation.id)} disabled={busy || navigating}><History size={18} /><span>接着上次<small>{previousConversation.title}</small></span><ArrowUpRight size={14} /></button> : <button type="button" onClick={() => setView('agenda')}><CalendarDays size={18} /><span>看看今天</span><ArrowUpRight size={14} /></button>}
                <button type="button" onClick={() => setResting(true)}><Coffee size={18} /><span>先坐一会儿</span></button>
              </div>
              {startupReturn && startupReturnBoundary.current === boundaryRevision.current && <ReturnBookmark disabled={!draftReady || busy || navigating}
                point={{ id: String(startupReturn.savedAt),
                  title: startupReturn.sessionId ? state?.conversations.find(item => item.id === startupReturn.sessionId)?.title || '桌边留着的那段话'
                    : startupReturn.note ? '留下的那一页' : startupReturn.agenda ? state?.agenda.find(item => item.id === startupReturn.agenda?.record.id)?.title || '那次试放的安排'
                      : startupReturn.material ? '上次读到的那一页' : '还没写完的这句话',
                  ...(startupReturn.material ? { detail: `第 ${startupReturn.material.page} 页` } : {}),
                  ...(!startupReturn.sessionId && startupReturn.view === 'chat' && input ? { excerpt: Array.from(input).slice(0, 100).join('') } : {}),
                  onResume: () => restoreWorkspace(startupReturn) }}
                onDismiss={() => { cancelReturnResume(); returnDismissedGesture.current = readingGesture.current;
                  setStartupReturn(undefined); workspaceReturn.forget(); }} />}
              {materials}
            </div>
          ) : (
            <>
              <div className="conversation-heading">
                <span>{state?.conversations.find(conversation => conversation.id === sessionId)?.title || '我们慢慢说'}</span>
              </div>
              <div
                className="message-scroll"
                ref={scrollRef}
                onScroll={() => {
                  const el = scrollRef.current!;
                  followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                  setAway(!followRef.current);
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
                  {materials}
                </div>
              </div>
              <div className="bottom-composer">
                {!composerDock.target && memoryHint}
                <div className="composer-home" ref={setComposerHome} />
              </div>
            </>
          )}
        </main>
        </div>
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
            onDiscuss={discussAgenda} focus={agendaContext?.focus} position={agendaPosition} onPositionChange={setAgendaPosition}
            onReturnAddressChange={reportAgendaReturn} resume={agendaResume}
          />
        )}
        {notesOpened && state && <NotesPanel embedded key={state.privacyEpoch} active={view === 'notes'} onReturnAddressChange={reportNoteReturn} resume={noteResume} focus={searchTarget?.locator.kind === 'note' ? { locator: searchTarget.locator, requestId: searchTarget.requestId } : undefined} onUnsavedChange={setNotesUnsaved} onOpenMaterialSource={openMaterialSource} onOpenConversationSource={openConversationSource} onOpenMaterials={() => setView('materials')} onQuote={quoteNote} quoteEnabled={draftReady && !navigating} quoteContext={`${sessionId || 'new'}:${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`} quoteBoundary={`${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`} onClose={() => setView('chat')} timeZone={state.settings.timeZone} />}
        {(view === 'settings' || view === 'memory' || view === 'companion') && state && (
          <SettingsPanel
            key={`${view}:${state.privacyEpoch}`}
            embedded
            initialTab={view === 'memory' ? '记忆' : view === 'companion' ? '陪伴' : '偏好'}
            state={state}
            busy={busy}
            onClose={() => setView('chat')}
            onState={updateState}
            draft={settingsDraft}
            memoryWorkspace={memoryWorkspace}
            onMemoryWorkspace={(change) => {
              if (boundaryRevision.current.split(':')[0] === String(state.privacyEpoch))
                setMemoryWorkspace(change);
            }}
            notify={notify}
            onClear={() => { clearReturnBoundary(); focusSession.clear(); void newChat(); }}
            onBeforeForget={() => keepUnsavedEdits('清空资料')}
          />
        )}
      </div>
      {resting && <RestSpace onClose={() => setResting(false)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
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
            {closeError && (
              <p className="harness-inline-error" role="alert">
                {closeError}
              </p>
            )}
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
          returnLabel={
            view === 'chat'
              ? '返回对话'
              : view === 'agenda'
                ? '返回安排'
                : view === 'memory'
                  ? '返回关于你'
                  : view === 'notes'
                    ? '返回笔记'
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
          onClose={() => setScopeOpen(false)}
          onChange={(value) => {
            const boundary = boundaryRevision.current;
            clearFollowup(); clearSceneSelection(); clearMaterialQuote(); clearNativeReferences();
            turnControlsRef.current = value;
            setTurnControls(value);
            if (value.retention === 'session_only')
              void attempt(() =>
                api.saveDraft({
                  id: draftKey.current,
                  draft: draftRef.current,
                  retention: 'session_only',
                  privacyEpoch: draftPrivacyEpoch(boundary),
                }),
              );
            else void attempt(() => api.saveDraft({ id: draftKey.current, draft: draftRef.current, privacyEpoch: draftPrivacyEpoch(boundary) }));
          }}
        />
      )}
      {createPortal(composer, composerHost)}
    </div>
    </ConversationComposerDockContext.Provider>
    </ConversationTextFocusContext.Provider>
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
  onViewAgenda,
  onOpenMap,
  onUseMapContext,
  onPreviewImage,
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
  onViewAgenda: () => void;
  onOpenMap: (route: MapRouteResult) => void;
  onUseMapContext: (value: MapContextHandoff) => boolean;
  onPreviewImage: (image: NonNullable<Message['image']>) => void;
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
  const [expanded, setExpanded] = useState(false);
  const [selectedPassage, setSelectedPassage] = useState('');
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
          {m.image && (
            <button
              type="button"
              className="sent-image-preview"
              aria-label={`预览图片：${m.image.name}`}
              onClick={() => onPreviewImage(m.image!)}
            >
              <img src={m.image.dataUrl} alt={`已上传的图片：${m.image.name}`} />
            </button>
          )}
          <MessageBookmarkSource message={m} />
        </div>
      </article>
    );
  const running = m.steps.filter((s) => s.status === 'running'),
    current = running.at(-1);
  const hasUnfinishedItems = m.obligations.some(item => item.status === 'blocked');
  const processBlock = m.steps.length || m.obligations.length ? (
    <div className={`process ${m.status === 'running' ? 'live' : ''}`}>
      <button
        className="process-summary"
        aria-expanded={expanded}
        aria-controls={`process-${m.id}`}
        onClick={() => setExpanded(!expanded)}
      >
        {m.status === 'running' ? (
          <LoaderCircle size={14} className="spin" />
        ) : m.status === 'error' || hasUnfinishedItems ? (
          <CircleAlert size={14} />
        ) : m.status === 'cancelled' ? (
          <Minus size={14} />
        ) : (
          <Check size={14} />
        )}
        <span>
          {(m.status === 'running' ? current?.title : undefined) ||
            (m.status === 'cancelled'
              ? '停下前做了什么'
              : m.status === 'error'
                ? '刚才做到了哪一步'
                : hasUnfinishedItems
                  ? '还有没办完的'
                  : '刚才做了什么')}
        </span>
        <ChevronRight size={13} className={expanded ? 'rotated' : ''} />
      </button>
      <div
        id={`process-${m.id}`}
        className={`process-reveal ${expanded ? 'open' : ''}`}
        aria-hidden={!expanded}
      >
        <div className="process-clip">
          <div className="process-detail">
            {m.obligations.length > 0 && (
              <div className="obligations">
                <span className="minor-label">本次包含</span>
                {m.obligations.map((o) => (
                  <div key={o.id} className={o.status}>
                    <span aria-hidden="true">
                      {o.status === 'done' ? '✓' : o.status === 'blocked' ? '–' : '·'}
                    </span>
                    <span className="sr-only">
                      {o.status === 'done' ? '已完成：' : o.status === 'blocked' ? '未完成：' : '还在继续：'}
                    </span>
                    {o.title}
                  </div>
                ))}
              </div>
            )}
            {m.steps
              .filter((s) => !m.obligations.some((o) => o.title === s.title))
              .filter((s) => !(m.hostStatus?.code === 'scope_expired' && s.id.startsWith('host-failure:')))
              .map((s) => (
                <div className={`step ${s.status}`} key={s.id}>
                  {s.status === 'running' ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : s.status === 'done' ? (
                    <Check size={13} />
                  ) : (
                    <CircleAlert size={13} />
                  )}
                  <div>
                    <span>
                      {s.scope && <em>{s.scope} / </em>}
                      {s.title}
                    </span>
                    {s.detail && <p>{s.detail}</p>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  ) : null;
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
    ?<>{!!lead&&<div className="markdown"><RichText text={lead}/></div>}{m.views?.map(renderView)}{renderActivity()}</>
    :interleaveViews(renderedResponse,presentationItems).map((part,index)=>part.kind==='text'
      ?<div className="markdown" key={`text-${index}`}><RichText text={part.text}/></div>
      :part.view.view ? renderView(part.view.view) : renderActivity());
  return (
    <article className="assistant-message" ref={article} data-message-id={m.id} tabIndex={-1}
      onMouseUp={selectionChanged} onKeyUp={selectionChanged}>
      <div className="assistant-name">
        <CompanionAvatar size={31} />
        <span>{m.authorName || companionName || '在场'}</span>
        {m.demo && <small>示例</small>}
        {m.proactive && <small className="assistant-proactive" title={new Date(m.createdAt).toLocaleString()}>{m.proactive === 'check_in' ? '来找你' : '替你留意到'}</small>}
      </div>
      {m.status === 'running' && processBlock}
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
      <ReplyEvidence key={boundary} message={m} />
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
      {m.status !== 'running' && processBlock}
      {m.status !== 'running' && (
        <div className="message-actions">
          {!!response.trim() && <IconButton label="复制回复" onClick={() => onCopyText(response)}>
            <Copy size={14} />
          </IconButton>}
          {m.status === 'done' && (
            <button className="text-button" onClick={onCorrect} disabled={busy}>
              说说哪里不对
            </button>
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
              <small>在当前输入继续，草稿会保留。</small>
            </div>
          )}
        </div>
      )}
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
}: {
  action: Action;
  timeZone: string;
  saved: boolean;
  onSave: (item: Action) => Promise<ActionResult>;
  onRevoke: (effect: ActionEffectRef) => Promise<ActionResult>;
  onView: () => void;
  disabled: boolean;
  boundary: string;
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
  if (action.planningOffer) return <PlanningOfferCard action={action} effect={effect} disabled={disabled} onSave={onSave} onView={onView}
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
        <button className="text-button" onClick={onView}>
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
          <small>
            {savedItem.done ? '已完成' : cancellingOccurrence ? '已取消这一次' : restoringOccurrence ? '已恢复这一次' : savedItem.planning?.state === 'invitation' ? '已记录邀请' : savedItem.planning?.state === 'wish' ? '已保留愿望' : savedItem.planning?.state === 'proposed' ? '已保留方案' : isCalendarChange ? '已更新安排' : '已加入安排'}
            {savedItem.startsAt ? ` · ${formatDate(savedItem.startsAt, savedItem.timeZone || zone)} · ${timeZoneLabel(savedItem.timeZone || zone)}` : ''}
            {action.coverage === 'conditional' && !!action.missingNeeds?.length ? ' · 还有条件未确定' : ''}
          </small>
          {actionError && (
            <p className="inline-problem" role="alert">
              {actionError}
            </p>
          )}
        </div>
        <button
          className="text-button"
          onClick={() => void revoke()}
          disabled={disabled || revoking}
          aria-label={`撤回这项安排：${action.title}`}
        >
          {revoking ? '正在撤销…' : '撤销'}
        </button>
        <button className="text-button" onClick={onView}>
          查看安排
          <ChevronRight size={14} />
        </button>
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
          <button className="text-button" onClick={onView} disabled={disabled}>
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
          <button className="text-button" onClick={onView} disabled={disabled}>
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
            onClick={onView}
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
