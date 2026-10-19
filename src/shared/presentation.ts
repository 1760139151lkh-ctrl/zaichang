export interface PreparationView {
  id: string;
  revision: number;
  matterId: string;
  title: string;
  body: string;
  expiresAt: string;
  kind: 'material' | 'question';
  helpRecordId?: string;
  sources?: { label: string; at?: string }[];
  scenes?: import('./scenes').SceneSnapshot[];
  reflectiveLetter?: import('./reflective-letter').ReflectiveLetterView;
}
export interface SurfaceView {
  mode: 'private' | 'public';
  revision: number;
  artifacts: { id: string; revision: number; title: string; body: string }[];
  notice?: string;
}
export interface SharedMatterView {
  sessionId?: string;
  id: string;
  revision: number;
  title: string;
  needsReview?: boolean;
  selectedOptionId: string | null;
  options: { id: string; revision: number; title: string; placeId?: string; placeLabel?: string }[];
  publicBody: string;
}
export interface MatterSelectionInput { id: string; expectedRevision: number; optionId: string | null }
export interface MatterSelectionResult { state: import('./types').State; undo: MatterSelectionInput }
export interface ObjectPresentationState {
  id: string;
  kind: 'agenda' | 'work';
  historicalRevision: number;
  currentRevision: number | null;
  relation: 'current' | 'changed' | 'removed';
  operationAvailable: boolean;
}
