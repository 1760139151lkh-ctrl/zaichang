import type { CalendarFields } from './calendar';
import type { NotesBridge } from './notes';
import type { MaterialsBridge } from './materials';
import type { LocalSearchBridge } from './search';
import type { AgendaBridge } from './agenda';
import type { KeepBridge } from './keep';
import { DEFAULT_INTERACTION, type InteractionPreferences } from './interaction';
import { DEFAULT_PERSONA, type PersonaState, type PersonaUpdate } from './persona';

export type StepStatus = 'running' | 'done' | 'blocked' | 'cancelled';
export interface NavigationTarget {
  sessionId?: string;
  view?: 'agenda';
  preparationRef?: import('./presentation').PreparationReference;
}
export const DEEPSEEK_MODEL = 'deepseek-flash' as const;
export type ImageMimeType = 'image/jpeg';
export interface ImageAttachment {
  /** Stable native upload identity; display identity alone grants no access. */
  attachmentId?: string;
  kind: 'image';
  name: string;
  mimeType: ImageMimeType;
  dataUrl: string;
  width: number;
  height: number;
}
export interface TextAttachment {
  attachmentId?: string;
  kind: 'text';
  name: string;
  text: string;
  /** The text is a small host descriptor when a complete resource is attached. */
  resource?: import('./materials').MaterialReference;
}
export type DraftAttachment = TextAttachment | ImageAttachment;
export interface Step {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
  scope?: string;
  /** Host presentation of the operation, separate from model guidance and
   * source coverage. An older step without this field has no such projection. */
  userFacing?: { title: string; detail?: string; status: StepStatus; coverage?: 'partial' | 'complete' };
}
export interface ReplySourceRange {
  unit: 'unicode_code_point' | 'page_unicode_code_point' | 'page_image' | 'program_source' | 'program_outline' | 'program_states';
  page?: number;
  start?: number;
  end?: number;
  total?: number;
  crop?: { x: number; y: number; width: number; height: number };
  /** The original owner's coverage flag; the stated range is exact. A PDF
   * range never implies that the rest of the file was read. */
  complete: boolean;
}
export type ReplySourceAddress =
  | { kind: 'conversation'; sessionId: string; messageId: string; contentVersion: number }
  | { kind: 'material'; target: import('./materials').MaterialTarget; resourceId: string; sha256: string;
      page?: number; start?: number; end?: number }
  | { kind: 'image'; sessionId: string; messageId: string; sourceEventId: string; attachmentId?: string; sha256: string }
  | { kind: 'notebook'; noteId: string; revision: number; sha256: string; start: number; end: number }
  | ({ kind: 'interactive' } & import('./keep').KeepWorkLocator)
  | { kind: 'scene'; sessionId: string; messageId: string; sceneId: string; revision: number };
/** Native metadata only. A supplied source is not thereby an answer citation,
 * a body-read acknowledgement or a grant to a later model request. */
export interface ReplySourceDisplay {
  /** Display identity only; notes and works are not fabricated Evidence events. */
  id: string;
  eventId?: string;
  kind: 'conversation' | 'document' | 'image' | 'notebook' | 'interactive' | 'scene' | 'other';
  title: string;
  availability: 'available' | 'unavailable';
  reading: { state: 'provided' | 'text_ranges' | 'page_images' | 'program_reads' | 'unknown'; ranges: ReplySourceRange[] };
  statusText: string;
  unavailableReason?: string;
  address?: ReplySourceAddress;
}
export interface ReplySourcePage {
  items: ReplySourceDisplay[];
  nextOffset: number | null;
  total: number;
  privacyEpoch: number;
  policyRevision: number;
  sourceBoundary: number;
  unavailableReason?: string;
}
export interface Obligation {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'blocked';
}
export interface Action extends CalendarFields {
  /** Host metadata; never supplied through the calendar tool or editor. */
  reminderSpeaker?: import('./harness').ReminderSpeaker;
  planRef?: { planId: string; blockId: string };
  planningOffer?: import('./planning-offer').PlanningOffer;
  effectActionId?: string;
  calendarChange?: { targetId: string; expectedRevision: number; operation: 'update' | 'delete' | 'change_occurrence'; occurrenceDate?: string; cancelled?: boolean };
  id: string;
  title: string;
  detail: string;
  startsAt?: string;
  durationMinutes?: number;
  saved?: boolean;
  done?: boolean;
  demo?: boolean;
  revision?: number;
  approvalDigest?: string;
  coverage?: 'verified' | 'conditional' | 'not_feasible';
  missingNeeds?: string[];
}
export type ActionEffectRef = Pick<import('./harness').EffectAction, 'id' | 'revision' | 'digest' | 'status'>;
export interface InterpretationSummary {
  posture: 'listen' | 'listen_and_local' | 'analyze' | 'act' | 'mixed';
  fragmentCount: number;
  explicitLocalWrite: boolean;
  unresolvedReferences: string[];
}
export interface ReleaseSummary {
  recipient: string;
  purpose: string;
  allowedFacts: string[];
  tone: string;
  mode: 'draft' | 'send';
  status: 'draft_only' | 'send_not_connected';
}
/** Host-created immutable local draft; this is not a remote mailbox receipt. */
export interface ReleaseArtifact {
  authoredBy?: 'model' | 'user';
  basedOnObjects?: { id: string; revision: number; kind: 'work' | 'agenda' | 'assertion' | 'evidence' }[];
  ownerId?: string;
  workspaceId?: string;
  sourceIds?: string[];
  sourceMessageIds?: string[];
  sourceMessageVersions?: { id: string; revision: number }[];
  sourceReceipts?: import('./harness').ContextReceipt[];
  basedOnReleases?: import('./harness').ReleaseSource[];
  id: string;
  revision: number;
  body: string;
  createdAt: string;
  sourceMessageId: string;
  privacyEpoch: number;
  audience: 'group' | 'public';
  brief: { recipient: string; purpose: string; allowedFacts: string[]; tone: string; useAvailability: boolean };
  delivery: 'not_sent';
  supersedes?: { id: string; revision: number };
}
/** Host-authored processing state, never dialogue or a business receipt. */
export interface MessageHostStatus {
  kind: 'error' | 'cancelled' | 'notice';
  code: 'interrupted' | 'cancelled' | 'source_changed' | 'scope_expired' | 'incomplete' | 'provider_error' | 'process_restarted' | 'control_unknown';
  text: string;
}
export interface Message {
  /** UI transport correlation, never source identity or permission. */
  submissionId?: string;
  submittedMaterialDocument?: Pick<import('./materials').MaterialItem, 'resourceId' | 'sha256'>;
  /** Host-checked projection of the retained authored event into this plain
   * message body. Attachment labels are outside this range. Address only. */
  authoredSource?: { eventId: string; contentVersion: number; sha256: string; displayStart: 0; displayEnd: number };
  /** Ephemeral transport/owner activity, never source content or a saved view. */
  presentationActivity?: { callId: string; kind: 'view'; phase: 'generating' | 'checking'; anchor: number };
  /** Foreground main-assistant room activity; never personality or user facts. */
  companionActivity?: import('./companion-activity').CompanionActivityHint;
  helpRefs?: { id: string; revision: number; helpRecordId: string; kind?: 'reflective_letter' }[];
  /** Host-signed identity when this message's whole body is the prepared artifact. */
  primaryHelpRef?: { id: string; revision: number; helpRecordId: string };
  /** She wrote this without a new message from the person: a check-in, or
   * the result of something they entrusted. */
  proactive?: 'check_in' | 'attention';
  /** Host-observed exposure of this optional message. A displayed/opened
   * message is not proof of reading, acceptance or a new invitation. */
  presenceExposure?: { displayedAt?: string; openedAt?: string };
  cooperationId?: string;
  objectStates?: import('./presentation').ObjectPresentationState[];
  /** User-facing owner response before the host appends separately authored drafts. */
  responseText?: string;
  hostStatus?: MessageHostStatus;
  releaseArtifacts?: ReleaseArtifact[];
  requestControls?: TurnControls;
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  authorName?: string;
  /** Artwork binding captured with this speaker; never a persona or read grant. */
  authorCompanionId?: string;
  content: string;
  createdAt: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  steps: Step[];
  obligations: Obligation[];
  actions: Action[];
  demo?: boolean;
  mapCards?: import('./map-v2').MapCard[];
  scenes?: import('./scenes').SceneSnapshot[];
  views?: import('./scenes').PresentationView[];
  retention?: import('./harness').ContextContract['retention'];
  scopeSummary?: {
    retentionScope?: 'conversation';
    clearConversationOnExit?: boolean;
    memoryMode: string;
    retention: string;
    audience: string;
    interactionMode: string;
    interpretation?: InterpretationSummary;
    release?: ReleaseSummary;
  };
  contextReceipt?: import('./harness').ContextReceipt;
  /** Host delivery stamp for rendering; not stored permission or provenance. */
  presentationBoundaryKey?: string;
  image?: ImageAttachment;
  /** Ordered originals owned by this message. Event addresses are host-only. */
  attachments?: (DraftAttachment & { sourceEventId?: string })[];
}
export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}
export interface TurnControls {
  transmission?: 'cloud_allowed' | 'local_only';
  memoryMode?: import('./harness').ContextContract['memoryMode'];
  retention?: import('./harness').ContextContract['retention'];
  audience?: 'self' | 'group' | 'public';
}
export interface Memory {
  id: string;
  text: string;
  quote: string;
  createdAt: string;
}
export interface Draft {
  text: string;
  attachment: DraftAttachment | null;
  /** When present, this is the complete ordered queue (including empty). */
  attachments?: DraftAttachment[];
  /** Original owner of a detached, not-yet-admitted editor snapshot. */
  submission?: { id: string; draftKey: string; controls?: TurnControls; materialDocument?: Pick<import('./materials').MaterialItem, 'resourceId' | 'sha256'> };
}
export function getDraftAttachments(draft: Pick<Draft, 'attachment' | 'attachments'>): DraftAttachment[] {
  return draft.attachments ?? (draft.attachment ? [draft.attachment] : []);
}
export function withDraftAttachments<T extends Draft>(draft: T, ordered: DraftAttachment[]): T {
  return { ...draft, attachment: null, attachments: ordered };
}
export interface Settings {
  interaction: InteractionPreferences;
  persona: PersonaState;
  model: typeof DEEPSEEK_MODEL;
  mode: 'demo' | 'deepseek';
  memoryEnabled: boolean;
  weatherEnabled: boolean;
  remindersEnabled: boolean;
  guidance: string;
  hasKey: boolean;
  timeZone?: string;
  /** Closing the window keeps her running in the tray (default) or quits. */
  backgroundPresence?: 'tray' | 'quit';
  /** Start quietly with the computer so promised reminders and watches keep going. */
  launchAtLogin?: boolean;
  /** What an OS notification may show: her actual words, or only that she has something. */
  notificationPreview?: 'words' | 'private';
  /** Whether she may sometimes come by just to say hello or share something, not only about tasks. */
  companionCheckIns?: 'off' | 'sometimes' | 'often';
  /** Migration marker for shipped defaults; never a user-facing setting. */
  defaultsVersion?: number;
}
export type SettingsUpdate = Partial<Omit<Settings, 'hasKey' | 'persona' | 'defaultsVersion'>> & {
  apiKey?: string;
  personaUpdate?: PersonaUpdate;
};
export interface CampusSnapshot {
  source: string;
  updatedAt: string;
  schedule: CampusEvent[];
  exams: CampusEvent[];
  sports?: { completed: number; required: number; deadline: string; ruleSource: string };
  places: { name: string; description: string; latitude?: number; longitude?: number }[];
  rules: { title: string; content: string; source: string }[];
}
export interface CampusEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: 'scheduled' | 'cancelled';
  source: string;
}
export interface State {
  environment?: import('./environment').CompanionEnvironment;
  /** Process-local signalBarrier generation, including account replacement. */
  sourceBoundary?: number;
  matters?: import('./presentation').SharedMatterView[];
  presentation?: import('./presentation').SurfaceView;
  preparations?: import('./presentation').PreparationView[];
  privacyEpoch?: number;
  policyRevision?: number;
  settings: Settings;
  modelRuntime?: {
    displayName: string;
    model: string;
    providerId: string;
    temporaryTestSubstitute: boolean;
    status: 'enabled' | 'connected' | 'not_connected';
    productionDefault: 'DeepSeek';
  };
  conversations: Conversation[];
  memories: Memory[];
  agenda: Action[];
  campus: { source: string; updatedAt: string; count: number } | null;
  campusConnector: {
    configured: boolean;
    available: boolean;
    label: string;
    sourceKind?: 'zju_account';
    authStatus?: 'needs_login' | 'credentials_saved' | 'verified' | 'failed';
    lastVerifiedAt?: string;
    catalogued?: number;
    verified?: number;
    blocked?: number;
    credentialsConfigured?: boolean;
    reason?: string;
  } | null;
}
export type RunEvent =
  | { type: 'message'; message: Message }
  | { type: 'note_changed'; note: { id: string; revision: number; sha256: string; state: 'active' | 'deleted' } }
  | { type: 'state'; state: State }
  | { type: 'conversations'; conversations: Conversation[] };
export interface RuntimeOverview {
  worlds: {
    worldId: string;
    baseRevision: number;
    status: string;
    items: {
      id: string;
      key: string;
      proposed: unknown;
      operation: string;
      effect: string;
      requiresApproval: boolean;
    }[];
  }[];
  memories: import('./harness').MemoryView[];
  work: import('./harness').WorkRecord[];
  actions: { action: import('./harness').EffectAction; receipts: import('./harness').EffectReceipt[] }[];
  processing: {
    eventId: string;
    receivedAt: string;
    fileName?: string;
    pending: number;
    failed: number;
    total: number;
  }[];
  watermarks: import('./harness').Watermarks;
  privacyEpoch: number;
  policyRevision: number;
  revoked: string[];
  notifications: {
    submitted: boolean;
    delivered: boolean;
    seen: boolean;
    stableId: boolean;
    closedApp: boolean;
  };
  storage: { atRestEncrypted: boolean; keyProtection: string };
}
export interface WorkoutDeviceSelection {
  source: 'windows' | 'adb' | 'hdc' | 'ios-simulator';
  deviceId?: string;
}
export interface WorkoutDeviceChoice {
  source: WorkoutDeviceSelection['source'];
  deviceId: string;
  deviceLabel: string;
  status: 'connected' | 'unavailable' | 'unauthorized' | 'offline';
  provenance: 'device' | 'simulated' | 'unknown';
  reason?: string;
}
export interface Bridge extends NotesBridge, MaterialsBridge, LocalSearchBridge, AgendaBridge, KeepBridge {
  environment(): Promise<import('./environment').CompanionEnvironment>;
  tiyiStatus(input?: { refreshGateway?: boolean }): Promise<import('./tiyi').TiyiConnectorState>;
  tiyiConnect(input?: { via?: 'direct' | 'webvpn'; accountLogin?: boolean }): Promise<import('./tiyi').TiyiConnectorState & { check: {
    status: import('./tiyi').TiyiObservation['status']; observedAt: string; reason?: string } }>;
  tiyiDisconnect(): Promise<import('./tiyi').TiyiConnectorState>;
  workoutDevices(): Promise<WorkoutDeviceChoice[]>;
  workoutState(): Promise<import('./workout').WorkoutState>;
  workoutStart(input: import('./workout').WorkoutStartRequest & { device: WorkoutDeviceSelection }): Promise<import('./workout').WorkoutState>;
  workoutPause(input: import('./workout').WorkoutSessionReference): Promise<import('./workout').WorkoutState>;
  workoutResume(input: import('./workout').WorkoutSessionReference & { device?: WorkoutDeviceSelection }): Promise<import('./workout').WorkoutState>;
  workoutFinish(input: import('./workout').WorkoutSessionReference): Promise<import('./workout').WorkoutState>;
  workoutCancel(input: import('./workout').WorkoutSessionReference & { device?: WorkoutDeviceSelection }): Promise<import('./workout').WorkoutState>;
  workoutRestore(): Promise<import('./workout').WorkoutState>;
  workoutDiscardRecovery(): Promise<import('./workout').WorkoutState>;
  onWorkout(callback: (state: import('./workout').WorkoutState) => void): () => void;
  readProgramLocalState(input: import('./interactive-program').ProgramLocalStateAddress): Promise<import('./interactive-program').ProgramLocalStateReceipt>;
  saveProgramLocalState(input: import('./interactive-program').ProgramLocalStateSave): Promise<import('./interactive-program').ProgramLocalStateReceipt>;
  rehearsalProject(input: import('./relationship-rehearsal').RehearsalNativeInput): Promise<import('./relationship-rehearsal').RehearsalScene>;
  studyProject(input: import('./study-presentation').StudyNativeInput): Promise<import('./study-presentation').StudyScene>;
  studyRead(input: import('./study-presentation').StudyNativeInput): Promise<import('./study-presentation').StudyScene>;
  studyBookmarkPreview(input: import('./study-presentation').StudyBookmarkInput): Promise<import('./study-presentation').StudyBookmarkPreview>;
  studyBookmarkAccept(input: import('./study-presentation').StudyBookmarkInput): Promise<import('./study-presentation').StudyScene>;
  sourceBookmarkPreview(input: import('./source-bookmark').SourceBookmarkReference): Promise<import('./source-bookmark').SourceBookmarkPreview>;
  sourceBookmarkKeep(input: import('./source-bookmark').SourceBookmarkKeepInput): Promise<import('./notes').NoteMutation>;
  letterSource(input: import('./reflective-letter').ReflectiveLetterSourceInput): Promise<import('./reflective-letter').ReflectiveLetterSourceView>;
  letterProject(input: import('./reflective-letter').ReflectiveLetterProjectInput): Promise<import('./presentation').PreparationView>;
  noteProject(input: import('./note-presentation').NoteNativeInput): Promise<import('./note-presentation').NoteScene>;
  companionSessionSource(input: import('./companion-source').CompanionSourceInput): Promise<import('./companion-source').CompanionSourceView>;
  /** Explicit private campus view; uses the configured connector's default read semantics. */
  campusSchedule(input: import('./campus-calendar').CampusScheduleInput): Promise<import('./campus-calendar').CampusScheduleResult>;
  campusAcademicRead(input: import('./campus-academic').CampusAcademicReadInput): Promise<import('./scenes').CampusScene>;
  editReleaseArtifact(input: { sessionId: string; messageId: string; id: string; expectedRevision: number; body: string }): Promise<Message>;
  recordResponseExposure(input: { sessionId: string; messageId: string; event: 'displayed' | 'opened' }): Promise<{ recorded: boolean }>;
  changeMatterSelection(input: import('./presentation').MatterSelectionInput): Promise<import('./presentation').MatterSelectionResult>;
  selectPublicMatter(input: { id: string; revision: number }): Promise<State>;
  setPresentationSurface(mode: 'private' | 'public'): Promise<State>;
  selectPublicArtifact(input: { sessionId: string; id: string; revision: number }): Promise<State>;
  clearPublicArtifact(): Promise<State>;
  openPreparation(input: import('./presentation').PreparationFocusReference): Promise<State>;
  helpAction(input: { id: string; expectedRevision: number; operation: 'displayed' | 'opened' | 'dismiss' | 'once' | 'stop_topic' }): Promise<State>;
  shareMapContext(input: { enabled: boolean; fromId?: string; includeDevice?: boolean; route?: import('./map-context').SharedMapRoute; expectedSelectionId?: string }): Promise<{
    enabled: boolean; expiresAt: string | null; coordinateEgress: boolean; selectionId?: string; routeReference?: import('./map-context').MapRouteReference }>;
  mapContextStatus(): Promise<{ enabled: boolean; expiresAt: string | null }>;
  state(): Promise<State>;
  messages(id: string): Promise<Message[]>;
  draft(id: string): Promise<Draft>;
  saveDraft(input: { id: string; draft: Draft; retention?: 'session_only'; privacyEpoch?: number }): Promise<void>;
  draftInfo(id: string): Promise<{ digest: string; changed: boolean; empty: boolean; temporary: boolean; persisted: boolean }>;
  unsavedDrafts(): Promise<{ id: string; digest: string; changed: boolean; empty: boolean; temporary: boolean; persisted: boolean }[]>;
  draftSubmissions(): Promise<{ id: string; draft: Draft; processing: boolean; admitted?: { sessionId: string; userMessageId: string } }[]>;
  persistDraft(input: { id: string; digest: string; confirmed: true }): Promise<void>;
  send(input: {
    sessionId?: string;
    submissionId?: string;
    content: string;
    workspaceContext?: import('./workspace-context').WorkspaceContext;
    attachment?: { name: string; text: string };
    image?: ImageAttachment;
    material?: import('./materials').MaterialReference;
    /** Ordered native uploads, at most three; legacy singular fields remain readable. */
    attachments?: DraftAttachment[];
    /** An explicitly accepted whole-document chip, submitted with this turn.
     * The host qualifies its original owner; previews never send this field. */
    materialDocument?: Pick<import('./materials').MaterialItem, 'resourceId' | 'sha256'>;
    materialQuote?: import('./materials').MaterialQuoteReference;
    conversationQuote?: import('./source-bookmark').ConversationBookmarkReference;
    noteQuote?: import('./notes').NoteQuoteReference;
    notebookQuote?: import('./notes').NotebookQuoteReference;
    mapRouteReference?: import('./map-context').MapRouteReference;
    agendaFocus?: import('./agenda').AgendaFocus;
    controls?: TurnControls;
    selection?: import('./scenes').SemanticSelection;
    studyInteraction?: import('./study-presentation').StudyInteraction;
    companionReference?: import('./companion-source').CompanionFollowupReference;
    curiosityReference?: import('./curiosity-source').CuriosityFollowupReference;
    programReference?: import('./interactive-program').ProgramFollowupReference;
    preparationReference?: import('./presentation').PreparationFocusReference;
    letterReference?: import('./reflective-letter').LetterReference;
    noteReference?: import('./note-presentation').NoteReference;
    rehearsalInteraction?: import('./relationship-rehearsal').RehearsalInteraction;
  }): Promise<{ sessionId: string; userMessageId?: string }>;
  stop(): Promise<void>;
  saveSettings(input: SettingsUpdate): Promise<State>;
  /** Only a never-saved default role follows the chosen artwork. */
  followDefaultCompanion(companionId: string): Promise<State>;
  testConnection(input: { apiKey?: string }): Promise<string>;
  cancelConnection(): Promise<void>;
  deleteKey(): Promise<State>;
  memory(input: {
    action: 'save' | 'delete' | 'deactivate';
    id?: string;
    text?: string;
    expectedRevision?: number;
    operation?: 'CORRECT' | 'SUPERSEDE' | 'ADD_EXCEPTION' | 'REFINE';
    validFrom?: string;
    validTo?: string;
    conditions?: import('./harness').Condition;
  }): Promise<State>;
  runtimeOverview(): Promise<RuntimeOverview>;
  attentionList(input?: import('./attention-control').AttentionListInput): Promise<import('./attention-control').AttentionControlPage>;
  attentionChange(input: import('./attention-control').AttentionChangeInput): Promise<import('./attention-control').AttentionControlItem>;
  adoptWorld(input: {
    id: string;
    itemIds: string[];
    expectedBaseRevision: number;
    expectedPrivacyEpoch: number;
  }): Promise<RuntimeOverview>;
  evidence(id: string): Promise<import('./harness').EvidenceEvent | null>;
  replySources(input: { sessionId: string; messageId: string; offset?: number; limit?: number }): Promise<ReplySourcePage>;
  goal(input: {
    id: string;
    expectedRevision: number;
    status: 'active' | 'paused' | 'cancelled';
  }): Promise<RuntimeOverview>;
  feedback(input: {
    recommendationId: string;
    response: 'accepted' | 'declined' | 'not_observed';
    reason?: string;
  }): Promise<{ saved: boolean; causalSuccess: 'not_established' }>;
  retryProcessing(eventId: string): Promise<RuntimeOverview>;
  reconcileAction(id: string): Promise<RuntimeOverview>;
  actionState(id: string): Promise<{
    planningOffer?: import('./planning-offer').PlanningOfferProgress;
    localRecord?: Action | null;
    action: import('./harness').EffectAction | null;
    receipts: import('./harness').EffectReceipt[];
  }>;
  permission(input: {
    scope: 'campus:read' | 'campus:tiyi:read' | 'map:read' | 'location:read';
    enabled: boolean;
  }): Promise<RuntimeOverview>;
  deleteConversation(id: string): Promise<State>;
  endConversation(id: string): Promise<State>;
  clearData(): Promise<State>;
  importCampus(): Promise<State | null>;
  campusTemplate(): Promise<boolean>;
  connectCampusAccount(): Promise<State>;
  configureCampusConnector(): Promise<State>;
  disconnectCampusConnector(): Promise<State>;
  configureCampusCredentials(): Promise<State>;
  forgetCampusCredentials(): Promise<State>;
  mapLocate(): Promise<import('./map-v2').LocationStatusResult>;
  mapStopLocation(input?: { keepSharedContext?: boolean }): Promise<void>;
  mapOverview(input?: { publicOnly?: boolean }): Promise<import('./map-v2').MapOverview>;
  mapPlaces(input?: { publicOnly?: boolean }): Promise<import('./map-v2').MapPoint[]>;
  mapData(input?: { publicOnly?: boolean }): Promise<import('./map-v3').MapDataset>;
  mapDataJson?(input?: { publicOnly?: boolean }): Promise<string>;
  mapSearch(input: { query: string; limit?: number }): Promise<import('./map-v2').MapPoint[]>;
  mapLocationStatus(): Promise<import('./map-v2').LocationStatusResult>;
  mapRoute(input: import('./map-v2').MapRouteQuery & { publicOnly?: boolean }): Promise<import('./map-v2').MapRouteResult>;
  disconnectCampus(): Promise<State>;
  action(input: { action: 'save' | 'delete' | 'done'; item: Action } | { action: 'undo'; effect: ActionEffectRef }): Promise<State>;
  attachText(): Promise<TextAttachment | null>;
  attachImage(): Promise<ImageAttachment | null>;
  exportCalendar(input: import('./calendar-export').CalendarExportInput): Promise<import('./calendar-export').CalendarExportResult>;
  exportData(): Promise<boolean>;
  openLink(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  window(action: 'minimize' | 'maximize' | 'close' | 'close-confirmed'): void;
  onCloseRequest(callback: () => void): () => void;
  /** A notification click asks the window to open what it was about. */
  onNavigate(callback: (target: NavigationTarget) => void): () => void;
  onEvent(callback: (event: RunEvent) => void): () => void;
}
export const DEFAULT_SETTINGS: Settings = {
  interaction: DEFAULT_INTERACTION,
  persona: DEFAULT_PERSONA,
  model: DEEPSEEK_MODEL,
  mode: 'demo',
  memoryEnabled: true,
  // A public reference-point forecast: no location or personal data leaves.
  weatherEnabled: true,
  remindersEnabled: true,
  guidance: '',
  hasKey: false,
  timeZone: 'Asia/Shanghai',
  backgroundPresence: 'tray',
  launchAtLogin: false,
  notificationPreview: 'words',
  companionCheckIns: 'sometimes',
  defaultsVersion: 2,
};
