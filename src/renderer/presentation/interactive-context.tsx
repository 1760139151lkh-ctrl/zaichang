import { Component, Fragment, createContext, useContext, useEffect, useMemo, useRef, useState,
  type ErrorInfo, type ReactNode } from 'react';
import { useRenderNode, useStateField, type ComponentRenderProps } from '@openuidev/react-lang';
import { checkedProgramPatch, resetProgramState, validateProgramState, programNodeIdSchema,
  type InteractiveProgramDocument, type InteractiveStateDeclarations, type ProgramStateValues } from '../../shared/interactive-program';

export interface InteractiveHost {
  document: InteractiveProgramDocument;
  disabled: boolean;
  onContinue: (nodeId: string, inputs: ProgramStateValues, label?: string, focus?: boolean) => void;
  renderSourceSlot?: (ref: string) => ReactNode;
}
export const InteractiveHostContext = createContext<InteractiveHost | null>(null);
export type ChangeOrigin = 'manual' | 'button' | 'reset' | 'motion';
interface InteractiveControls {
  states: InteractiveStateDeclarations;
  inputs: ProgramStateValues;
  disabled: boolean;
  renderKey: string;
  userAction: { serial: number; origin: Exclude<ChangeOrigin, 'motion'> };
  patch: (patch: Record<string, unknown>, origin?: ChangeOrigin, nodeId?: string, label?: string) => boolean;
  reset: (keys?: string[], nodeId?: string, label?: string) => void;
  continueFrom: (nodeId: string, label?: string) => void;
  registerMotion: (cancel: () => void) => () => void;
  stopMotions: () => void;
}
const InteractiveControlsContext = createContext<InteractiveControls | null>(null);
export function useInteractiveControls() {
  const value = useContext(InteractiveControlsContext);
  if (!value) throw new Error('局部输入需要位于当前交互文档中。');
  return value;
}
export const InteractiveGraphicSlot = createContext(false);

class InteractivePartBoundary extends Component<{ children: ReactNode; resetKey: string; graphic: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* The native renderer also reports structured errors. */ }
  componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.graphic ? <g role="img" aria-label="这一处图形暂时未展开"><title>这一处图形暂时未展开</title></g>
      : <div className="interactive-part-error" role="status">这一处暂时没展开。
        <button type="button" onClick={() => this.setState({ failed: false })}>再展开一次</button></div>;
  }
}

/** Native renderDeep keys arrays by index. Give actual materialized leaves
 * their own host-checked node identity, including leaves inside nested Each. */
export function InteractiveChildren({ value }: { value: unknown }) {
  const render = useRenderNode(), controls = useContext(InteractiveControlsContext), graphic = useContext(InteractiveGraphicSlot);
  const leaves: unknown[] = [];
  const flatten = (child: unknown): void => { if (Array.isArray(child)) child.forEach(flatten); else if (child != null) leaves.push(child); };
  flatten(value);
  return <>{leaves.map((child, index) => {
    const id = child && typeof child === 'object' ? (child as { props?: { id?: unknown } }).props?.id : undefined;
    return <Fragment key={typeof id === 'string' ? id : `unresolved:${index}`}>
      <InteractivePartBoundary resetKey={controls?.renderKey || ''} graphic={graphic}>{render(child)}</InteractivePartBoundary>
    </Fragment>;
  })}</>;
}

/** The only writable native binding. Children receive this checked adapter,
 * never native setters or a triggerAction capable of executing built-ins. */
export function InteractiveDocument({ props }: ComponentRenderProps<Record<string, any>>) {
  const host = useContext(InteractiveHostContext);
  const field = useStateField<ProgramStateValues>('ui', props.ui);
  const [error, setError] = useState('');
  const [userAction, setUserAction] = useState<{ serial: number; origin: 'manual' | 'button' | 'reset' }>({ serial: 0, origin: 'manual' });
  const motions = useRef(new Set<() => void>()), latest = useRef(field.value), setter = useRef(field.setValue);
  setter.current = field.setValue;
  const current = useMemo(() => {
    if (!host || !field.isReactive) return undefined;
    try { return validateProgramState(host.document.states, field.value); } catch { return undefined; }
  }, [host?.document.states, field.value, field.isReactive]);
  if (current) latest.current = current;
  const stopMotions = () => { for (const cancel of [...motions.current]) cancel(); };
  useEffect(() => () => { for (const cancel of [...motions.current]) cancel(); motions.current.clear(); }, []);
  if (!host || !current) return <div className="interactive-part-error" role="status">这份内容的局部输入暂时无法接回，请沿原回复重新打开。</div>;
  const patch = (values: Record<string, unknown>, origin: ChangeOrigin = 'manual', nodeId?: string, label?: string) => {
    if (host.disabled) return false;
    if (origin !== 'motion') stopMotions();
    try {
      const next = checkedProgramPatch(host.document.states, latest.current, values);
      latest.current = next;
      if (origin !== 'motion') setUserAction(action => ({ serial: action.serial + 1, origin }));
      setter.current(next);
      if (origin !== 'motion' && nodeId) {
        try { host.onContinue(programNodeIdSchema.parse(nodeId), next, label, false); }
        catch { setError('局部输入已改变，这一处暂时没有接到原输入框。'); return true; }
      }
      setError(''); return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '这组局部输入超出当前范围。'); return false;
    }
  };
  const controls: InteractiveControls = {
    states: host.document.states, inputs: current, disabled: host.disabled,
    renderKey: `${host.document.hash}:${JSON.stringify(current)}`, userAction, patch, stopMotions,
    registerMotion(cancel) { motions.current.add(cancel); return () => { motions.current.delete(cancel); }; },
    reset(keys, nodeId, label) {
      stopMotions();
      try { patch(resetProgramState(host.document.states, latest.current, keys), 'reset', nodeId, label); }
      catch { setError('这次没有恢复局部输入，请保留当前内容重试。'); }
    },
    continueFrom(nodeId, label) {
      if (host.disabled) return;
      stopMotions();
      try { host.onContinue(programNodeIdSchema.parse(nodeId), validateProgramState(host.document.states, latest.current), label, true); }
      catch { setError('这一处暂时不能接到输入框，原稿仍然保留。'); }
    },
  };
  return <InteractiveControlsContext.Provider value={controls}>
    <article className="interactive-document" data-program-node={props.id} aria-label={typeof props.title === 'string' ? props.title : '一起看、一起改的内容'}>
      {props.title && <h3 className="interactive-document-title">{props.title}</h3>}
      <InteractiveChildren value={props.children} />
      {error && <p className="interactive-input-error" role="status">{error}</p>}
    </article>
  </InteractiveControlsContext.Provider>;
}
