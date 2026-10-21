import './openui-development';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Renderer, type ComponentRenderer, type OpenUIError } from '@openuidev/react-lang';
import { ArrowUpRight } from 'lucide-react';
import { createInteractiveLibrary } from '../../shared/interactive-library';
import { validateProgramState, type InteractiveProgramDocument, type ProgramFollowupReference, type ProgramStateValues } from '../../shared/interactive-program';
import type { PresentationView } from '../../shared/scenes';
import { InteractiveHostContext } from './interactive-context';
import { interactiveRenderers } from './interactive-primitives';
import './interactive-program.css';

export interface InteractiveProgramViewProps {
  view: PresentationView;
  messageId: string;
  boundaryKey?: string;
  /** Boundary of the actual host delivery, not a new label for cached data. */
  hostViewBoundaryKey?: string;
  disabled?: boolean;
  isStreaming?: boolean;
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
export function InteractiveProgramView({ view, messageId, boundaryKey = '', hostViewBoundaryKey, disabled = false, isStreaming = false,
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
  const liveKey = useRef<string | undefined>(undefined); liveKey.current = admitted ? stateKey : undefined;
  const latestState = useRef<{ key: string; inputs: ProgramStateValues } | undefined>(undefined);
  const initialState = useMemo(() => {
    if (!doc || !admitted) { latestState.current = undefined; return undefined; }
    try {
      const inputs = validateProgramState(doc.states, latestState.current?.key === stateKey ? latestState.current.inputs : doc.initialState);
      latestState.current = { key: stateKey, inputs }; return { $ui: inputs };
    } catch { return undefined; }
  }, [doc, stateKey, retry, admitted]);
  const library = useMemo(() => createInteractiveLibrary<ComponentRenderer<any>>({ data: admitted ? doc?.currentData : undefined,
    renderers: interactiveRenderers }), [doc, admitted]);
  const reportErrors = useCallback((next: OpenUIError[]) => {
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
    if (liveKey.current !== stateKey) return;
    onFollowup?.({ text: '',
    programReference: { messageId, programId: view.id, revision: view.revision, nodeId, inputs }, focusOnly: !focus,
    readProgramInputs: () => {
      if (liveKey.current !== stateKey || latestState.current?.key !== stateKey) return undefined;
      try { return validateProgramState(doc!.states, latestState.current.inputs); } catch { return undefined; }
    },
    ...(label ? { focusLabel: label } : {}) });
  };
  const missingData = !!doc?.bindingAliases.some(alias => !doc.currentData || !Object.hasOwn(doc.currentData, alias));
  if (doc && !admitted) return <section className="interactive-program interactive-boundary-pending" style={{ minHeight: shellHeight || undefined }} aria-busy="true">
    <p role="status">正在核对这份内容的当前来源…</p>
  </section>;
  if (!doc || !initialState || missingData) return <div className="interactive-program interactive-folded" role="status">
    <p>{error || (loading ? '把这一份内容接回来…' : view.programReference?.status === 'source_unavailable'
      ? '这份内容的原来源现在不能读取。' : '这份作品留在原回复里，接着聊时再核对当前资料。')}</p>
    {metadataAdmitted && view.programReference?.status === 'needs_refresh' && view.programReference.nodeId && onFollowup && <button type="button" disabled={loading || disabled}
      onClick={() => onFollowup({ text: '', programReference: { messageId: view.programReference!.messageId,
        programId: view.programReference!.programId, revision: view.programReference!.revision, nodeId: view.programReference!.nodeId! },
      focusOnly: false, focusLabel: '这份作品' })}>接着这份作品<ArrowUpRight size={14} aria-hidden="true" /></button>}
  </div>;
  return <section ref={surface} className="interactive-program" data-program-id={view.id} data-program-revision={view.revision}>
    <InteractiveHostContext.Provider value={{ document: doc, disabled: disabled || isStreaming,
      onContinue: continueFrom, renderSourceSlot }}>
      <Renderer key={`${messageId}:${view.id}:${view.revision}:${boundaryKey}:${retry}`} response={doc.dsl} library={library}
        initialState={initialState} isStreaming={isStreaming} toolProvider={null} onError={reportErrors} publishObservability={false}
        onStateUpdate={state => { if (liveKey.current !== stateKey) return;
          try { latestState.current = { key: stateKey, inputs: validateProgramState(doc.states, state.$ui) }; } catch { /* Retain the last complete valid inputs. */ } }} />
    </InteractiveHostContext.Provider>
    {errors.some(item => item.severity !== 'warning') && <div className="interactive-render-feedback" role="status">
      <span>有一处暂时没能展开，其他内容仍可继续。</span>
      <button type="button" onClick={() => { setErrors([]); setRetry(value => value + 1); }}>重新展开</button>
    </div>}
  </section>;
}
