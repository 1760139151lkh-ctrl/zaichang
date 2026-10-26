import './openui-development';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Renderer, type ComponentRenderer, type OpenUIError } from '@openuidev/react-lang';
import { ArrowUpRight } from 'lucide-react';
import { createInteractiveLibrary } from '../../shared/interactive-library';
import { validateProgramState, type InteractiveProgramDocument, type ProgramFollowupReference, type ProgramStateValues } from '../../shared/interactive-program';
import type { PresentationView } from '../../shared/scenes';
import { InteractiveHostContext, type ChangeOrigin } from './interactive-context';
import { interactiveRenderers } from './interactive-primitives';
import { useProgramLocalState } from './program-local-state';
import './interactive-program.css';

export interface InteractiveProgramViewProps {
  view: PresentationView;
  messageId: string;
  sessionId?: string;
  privacyEpoch?: number;
  policyRevision?: number;
  programStateEphemeral?: boolean;
  boundaryKey?: string;
  /** Boundary of the actual host delivery, not a new label for cached data. */
  hostViewBoundaryKey?: string;
  disabled?: boolean;
  isStreaming?: boolean;
  livePublication?: boolean;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  renderSourceSlot?: (ref: string) => ReactNode;
  activeReference?: ProgramFollowupReference;
  onFollowup?: (input: { text: string; programReference: ProgramFollowupReference; focusOnly: boolean; focusLabel?: string;
    readProgramInputs?: () => ProgramStateValues | undefined }) => void;
}

/** Rendering receives a currently source-qualified live view from its host.
 * No tool provider, file reader or business action is exposed to OpenUI. */
export function InteractiveProgramView({ view, messageId, sessionId, privacyEpoch, policyRevision, programStateEphemeral, boundaryKey = '', hostViewBoundaryKey, disabled = false, isStreaming = false, livePublication = false,
  loading, error, renderSourceSlot, onFollowup, activeReference }: InteractiveProgramViewProps) {
  const doc = view.program;
  const [errors, setErrors] = useState<OpenUIError[]>([]), [retry, setRetry] = useState(0);
  const surface = useRef<HTMLElement>(null);
  const [shellHeight, setShellHeight] = useState(0);
  const admission = useRef<{ boundary: string; view?: PresentationView; doc?: InteractiveProgramDocument; ready: boolean;
    changed: boolean; retired: WeakSet<object> }>({ boundary: boundaryKey, view, doc, ready: true, changed: false,
    retired: new WeakSet<object>() });
  const gate = admission.current;
  if (gate.boundary !== boundaryKey) {
    if (gate.view) gate.retired.add(gate.view); if (gate.doc) gate.retired.add(gate.doc);
    gate.view = undefined; gate.doc = undefined;
    gate.boundary = boundaryKey; gate.ready = false; gate.changed = true;
  }
  const deliveredHere = hostViewBoundaryKey === boundaryKey || !gate.changed && hostViewBoundaryKey === undefined;
  if (deliveredHere && doc && !gate.retired.has(view) && !gate.retired.has(doc)) {
    gate.view = view; gate.doc = doc; gate.ready = true;
  }
  const admitted = gate.ready && deliveredHere && gate.view === view && gate.doc === doc;
  const metadataAdmitted = deliveredHere && !gate.retired.has(view);
  const stateKey = `${messageId}:${view.id}:${view.revision}:${boundaryKey}`;
  const latestState = useRef<{ key: string; generation: number; inputs: ProgramStateValues; manualFields: string[] } | undefined>(undefined);
  const previousDocument = useRef<{ key: string; messageId: string; id: string; revision: number; boundary: string; privacyEpoch?: number; policyRevision?: number; doc: InteractiveProgramDocument } | undefined>(undefined);
  const continuation = useRef<{ key: string; inputs?: ProgramStateValues; manualFields: string[] } | undefined>(undefined);
  if (continuation.current?.key !== stateKey) {
    const previous = previousDocument.current, priorInputs = latestState.current;
    let inputs: ProgramStateValues | undefined;
    const manualFields: string[] = [];
    if (livePublication && admitted && doc?.initialStateMode === 'admitted_seed' && !view.localState && previous && priorInputs?.key === previous.key
      && previous.messageId === messageId && previous.id === view.id && previous.boundary === boundaryKey
      && previous.privacyEpoch === privacyEpoch && previous.policyRevision === policyRevision && previous.revision < view.revision) {
      const retained = { ...doc.initialState };
      for (const [key, declaration] of Object.entries(doc.states)) {
        const manual = priorInputs.manualFields.includes(key);
        if ((!declaration.transient || manual) && !doc.initialInputFields?.includes(key)
          && JSON.stringify(declaration) === JSON.stringify(previous.doc.states[key])
          && JSON.stringify(doc.initialState[key]) === JSON.stringify(previous.doc.initialState[key])) {
          retained[key] = priorInputs.inputs[key];
          if (manual) manualFields.push(key);
        }
      }
      try { inputs = validateProgramState(doc.states, retained); } catch { /* Changed declarations keep their new defaults. */ }
    }
    continuation.current = { key: stateKey, inputs, manualFields };
  }
  previousDocument.current = admitted && doc ? { key: stateKey, messageId, id: view.id, revision: view.revision, boundary: boundaryKey, privacyEpoch, policyRevision, doc } : undefined;
  const local = useProgramLocalState(stateKey, doc, view.localState,
    doc && sessionId && privacyEpoch !== undefined && policyRevision !== undefined ? { sessionId, messageId, programId: view.id,
      revision: view.revision, programHash: doc.hash, privacyEpoch, policyRevision, ...(programStateEphemeral ? { ephemeral: true } : {}) } : undefined, admitted, continuation.current.inputs);
  const liveKey = useRef<string | undefined>(undefined); liveKey.current = admitted ? stateKey : undefined;
  const liveGeneration = useRef(local.generation); liveGeneration.current = local.generation;
  const initialState = useMemo(() => {
    if (!doc || !admitted) { latestState.current = undefined; return undefined; }
    try {
      const inputs = validateProgramState(doc.states, latestState.current?.key === stateKey && latestState.current.generation === local.generation
        ? latestState.current.inputs : local.inputs || doc.initialState);
      const manualFields = latestState.current?.key === stateKey && latestState.current.generation === local.generation
        ? latestState.current.manualFields : local.generation === 0 ? continuation.current?.manualFields || [] : [];
      latestState.current = { key: stateKey, generation: local.generation, inputs, manualFields }; return { $ui: inputs };
    } catch { return undefined; }
  }, [doc?.hash, stateKey, retry, admitted, local.generation]);
  const dataSignature = useMemo(() => JSON.stringify(admitted ? doc?.currentData : undefined), [admitted, doc?.currentData]);
  const library = useMemo(() => createInteractiveLibrary<ComponentRenderer<any>>({ data: admitted ? doc?.currentData : undefined,
    renderers: interactiveRenderers }), [doc?.hash, dataSignature, admitted]);
  const lastErrorReport = useRef('');
  const reportErrors = useCallback((next: OpenUIError[]) => {
    const signature = JSON.stringify(next);
    if (next.length && signature !== lastErrorReport.current) console.error('OpenUI document rendering failed', next);
    lastErrorReport.current = signature;
    setErrors(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);
  useLayoutEffect(() => () => {
    if (liveKey.current === stateKey) { liveKey.current = undefined; latestState.current = undefined; }
  }, [stateKey]);
  useLayoutEffect(() => {
    const root = surface.current;
    if (!root || !admitted || !doc) return;
    const measure = () => { const height = root.getBoundingClientRect().height; if (height > 0) setShellHeight(height); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(root); return () => observer.disconnect();
  }, [admitted, doc, stateKey]);
  useLayoutEffect(() => {
    const root = surface.current;
    if (!root) return;
    const apply = () => {
      const active = activeReference?.messageId === messageId && activeReference.programId === view.id
        && activeReference.revision === view.revision ? activeReference.nodeId : undefined;
      root.querySelectorAll<HTMLElement | SVGElement>('[data-program-node]').forEach(element =>
        element.classList.toggle('is-program-focused', !!active && element.dataset.programNode === active));
    };
    apply(); const observer = new MutationObserver(apply); observer.observe(root, { subtree: true, childList: true });
    return () => { observer.disconnect(); root.querySelectorAll('.is-program-focused').forEach(element => element.classList.remove('is-program-focused')); };
  }, [activeReference, messageId, view.id, view.revision, doc, retry, boundaryKey]);
  const continueFrom = (nodeId: string, inputs: ProgramStateValues, label?: string, focus = true) => {
    if (liveKey.current !== stateKey || liveGeneration.current !== local.generation) return;
    onFollowup?.({ text: '',
    programReference: { messageId, programId: view.id, revision: view.revision, nodeId, inputs }, focusOnly: !focus,
    readProgramInputs: () => {
      if (liveKey.current !== stateKey || liveGeneration.current !== local.generation || latestState.current?.key !== stateKey) return undefined;
      try { return validateProgramState(doc!.states, latestState.current.inputs); } catch { return undefined; }
    },
    ...(label ? { focusLabel: label } : {}) });
  };
  const localChange = (inputs: ProgramStateValues, change: { origin: ChangeOrigin; fields: string[] }) => {
    if (liveKey.current !== stateKey || liveGeneration.current !== local.generation || !doc) return;
    const manual = new Set(latestState.current?.key === stateKey ? latestState.current.manualFields : []);
    for (const key of change.fields) {
      if (['manual', 'choice', 'button'].includes(change.origin) && doc.states[key]?.kind !== 'boolean') manual.add(key);
      else manual.delete(key);
    }
    latestState.current = { key: stateKey, generation: local.generation, inputs, manualFields: [...manual] };
    if (change.origin === 'motion') local.stage(inputs);
    else local.changed(inputs, change.origin === 'settled');
  };
  const missingData = !!doc?.bindingAliases.some(alias => !doc.currentData || !Object.hasOwn(doc.currentData, alias));
  if (doc && !admitted) return <section className="interactive-program interactive-boundary-pending" style={{ minHeight: shellHeight || undefined }} aria-busy="true">
    <p role="status">把这页接回来…</p>
  </section>;
  if (!doc || !initialState || missingData) return <div className="interactive-program interactive-folded" role="status">
    <p>{error || (loading ? '把这一份内容接回来…' : view.programReference?.status === 'source_unavailable'
      ? '这页原来的材料这会儿读不到。' : '这页还在这里，可以接着聊。')}</p>
    {metadataAdmitted && view.programReference?.status === 'needs_refresh' && view.programReference.nodeId && onFollowup && <button type="button" disabled={loading || disabled}
      onClick={() => onFollowup({ text: '', programReference: { messageId: view.programReference!.messageId,
        programId: view.programReference!.programId, revision: view.programReference!.revision, nodeId: view.programReference!.nodeId! },
      focusOnly: false, focusLabel: '这份作品' })}>接着这份作品<ArrowUpRight size={14} aria-hidden="true" /></button>}
  </div>;
  return <section ref={surface} className="interactive-program" data-program-id={view.id} data-program-revision={view.revision}>
    <InteractiveHostContext.Provider value={{ document: doc, disabled: disabled || isStreaming, scopeKey: stateKey, initialInputs: initialState.$ui,
      onContinue: continueFrom, onLocalChange: localChange, renderSourceSlot }}>
      <Renderer key={`${messageId}:${view.id}:${boundaryKey}:${retry}:${local.generation}`} response={doc.dsl} library={library}
        initialState={initialState} isStreaming={isStreaming} toolProvider={null} onError={reportErrors} publishObservability={false}
        onStateUpdate={state => { if (liveKey.current !== stateKey || liveGeneration.current !== local.generation) return;
          try { latestState.current = { key: stateKey, generation: local.generation, inputs: validateProgramState(doc.states, state.$ui),
            manualFields: latestState.current?.key === stateKey ? latestState.current.manualFields : [] }; } catch { /* Retain the last complete valid inputs. */ } }} />
    </InteractiveHostContext.Provider>
    {local.issue && <p className="interactive-input-error" role="status">{local.issue}
      {local.retryRead && <button type="button" onClick={local.retryRead}>再接一次</button>}
      {local.resolveConflict && <><button type="button" onClick={() => local.resolveConflict?.('saved')}>接回另一份</button>
        <button type="button" onClick={() => local.resolveConflict?.('local')}>留下眼前这份</button></>}
    </p>}
    {errors.some(item => item.severity !== 'warning') && <div className="interactive-render-feedback" role="status">
      <span>有一处暂时没能展开，其他内容仍可继续。</span>
      <button type="button" onClick={() => { setErrors([]); setRetry(value => value + 1); }}>重新展开</button>
    </div>}
  </section>;
}
