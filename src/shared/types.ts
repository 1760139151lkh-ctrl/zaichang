import type { CalendarFields } from './calendar';
import type { NotesBridge } from './notes';
import type { MaterialsBridge } from './materials';
import type { LocalSearchBridge } from './search';
import { DEFAULT_INTERACTION, type InteractionPreferences } from './interaction';
import { DEFAULT_PERSONA, type PersonaState, type PersonaUpdate } from './persona';

export type StepStatus = 'running' | 'done' | 'blocked' | 'cancelled';
export const DEEPSEEK_MODEL = 'deepseek-flash' as const;
export type ImageMimeType = 'image/jpeg';
export interface ImageAttachment {
  kind: 'image';
  name: string;
  mimeType: ImageMimeType;
  dataUrl: string;
  width: number;
  height: number;
}
export interface TextAttachment {
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
}
export interface Obligation {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'blocked';
}
export interface Action extends CalendarFields {
  planRef?: { planId: string; blockId: string };
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
export interface Message {
  helpRefs?: { id: string; revision: number; helpRecordId: string }[];
  cooperationId?: string;
  objectStates?: import('./presentation').ObjectPresentationState[];
  /** User-facing owner response before the host appends separately authored drafts. */
  responseText?: string;
  releaseArtifacts?: ReleaseArtifact[];
  requestControls?: TurnControls;
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
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
  image?: ImageAttachment;
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
}
export type SettingsUpdate = Partial<Omit<Settings, 'hasKey' | 'persona'>> & {
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
export interface Bridge extends NotesBridge, MaterialsBridge, LocalSearchBridge {
  editReleaseArtifact(input: { sessionId: string; messageId: string; id: string; expectedRevision: number; body: string }): Promise<Message>;
  recordResponseExposure(input: { sessionId: string; messageId: string; event: 'displayed' | 'opened' }): Promise<{ recorded: boolean }>;
  changeMatterSelection(input: import('./presentation').MatterSelectionInput): Promise<import('./presentation').MatterSelectionResult>;
  selectPublicMatter(input: { id: string; revision: number }): Promise<State>;
  setPresentationSurface(mode: 'private' | 'public'): Promise<State>;
  selectPublicArtifact(input: { sessionId: string; id: string; revision: number }): Promise<State>;
  clearPublicArtifact(): Promise<State>;
  helpAction(input: { id: string; expectedRevision: number; operation: 'displayed' | 'opened' | 'dismiss' | 'once' | 'stop_topic' }): Promise<State>;
  shareMapContext(input: { enabled: boolean; fromId?: string; includeDevice?: boolean }): Promise<{ enabled: boolean; expiresAt: string | null; coordinateEgress: boolean }>;
  mapContextStatus(): Promise<{ enabled: boolean; expiresAt: string | null }>;
  state(): Promise<State>;
  messages(id: string): Promise<Message[]>;
  draft(id: string): Promise<Draft>;
  saveDraft(input: { id: string; draft: Draft; retention?: 'session_only'; privacyEpoch?: number }): Promise<void>;
  draftInfo(id: string): Promise<{ digest: string; changed: boolean; empty: boolean; temporary: boolean; persisted: boolean }>;
  unsavedDrafts(): Promise<{ id: string; digest: string; changed: boolean; empty: boolean; temporary: boolean; persisted: boolean }[]>;
  persistDraft(input: { id: string; digest: string; confirmed: true }): Promise<void>;
  send(input: {
    sessionId?: string;
    content: string;
    image?: ImageAttachment;
    material?: import('./materials').MaterialReference;
    controls?: TurnControls;
    selection?: import('./scenes').SemanticSelection;
  }): Promise<{ sessionId: string }>;
  stop(): Promise<void>;
  saveSettings(input: SettingsUpdate): Promise<State>;
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
    localRecord?: Action | null;
    action: import('./harness').EffectAction | null;
    receipts: import('./harness').EffectReceipt[];
  }>;
  permission(input: {
    scope: 'campus:read' | 'map:read' | 'location:read';
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
  mapOverview(): Promise<import('./map-v2').MapOverview>;
  mapPlaces(): Promise<import('./map-v2').MapPoint[]>;
  mapData(): Promise<import('./map-v3').MapDataset>;
  mapDataJson?(): Promise<string>;
  mapSearch(input: { query: string; limit?: number }): Promise<import('./map-v2').MapPoint[]>;
  mapLocationStatus(): Promise<import('./map-v2').LocationStatusResult>;
  mapRoute(input: import('./map-v2').MapRouteQuery): Promise<import('./map-v2').MapRouteResult>;
  disconnectCampus(): Promise<State>;
  action(input: { action: 'save' | 'delete' | 'done'; item: Action }): Promise<State>;
  attachText(): Promise<TextAttachment | null>;
  attachImage(): Promise<ImageAttachment | null>;
  exportCalendar(input: import('./calendar-export').CalendarExportInput): Promise<import('./calendar-export').CalendarExportResult>;
  exportData(): Promise<boolean>;
  openLink(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  window(action: 'minimize' | 'maximize' | 'close' | 'close-confirmed'): void;
  onCloseRequest(callback: () => void): () => void;
  onEvent(callback: (event: RunEvent) => void): () => void;
}
export const DEFAULT_SETTINGS: Settings = {
  interaction: DEFAULT_INTERACTION,
  persona: DEFAULT_PERSONA,
  model: DEEPSEEK_MODEL,
  mode: 'demo',
  memoryEnabled: true,
  weatherEnabled: false,
  remindersEnabled: false,
  guidance: '',
  hasKey: false,
  timeZone: 'Asia/Shanghai',
};
