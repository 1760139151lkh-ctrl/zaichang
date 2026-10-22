import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { ComponentRenderProps, ComponentRenderer } from '@openuidev/react-lang';
import { ArrowUpRight, Plus, RotateCcw, X } from 'lucide-react';
import { interactiveActions, validateInteractiveActionPlan, validateInteractivePrimitiveProperties, type InteractiveComponentName } from '../../shared/interactive-library';
import { checkedProgramPatch, snapProgramNumber, type InteractiveStateDeclaration } from '../../shared/interactive-program';
import { RichText } from '../RichText';
import { InteractiveChildren, InteractiveDocument, InteractiveHostContext, InteractiveGraphicSlot, useInteractiveControls } from './interactive-context';
import { InteractiveGraphic, InteractiveGroup, InteractiveLine, InteractivePolyline, InteractiveCurve, InteractiveCircle,
  InteractiveLabel, InteractiveDragHandle, InteractiveRect, InteractivePolygon } from './interactive-graphics';
import { InteractiveMotion } from './interactive-motion';
import { InteractivePress } from './interactive-press';
import { InteractiveVoice } from './interactive-audio';

type Props = ComponentRenderProps<Record<string, any>>;
type NumberState = Extract<InteractiveStateDeclaration, { kind: 'number' }>;
export const formatInteractiveNumber = (value: number) => String(Number(value.toPrecision(10)));

function InteractiveFlow({ props }: Props) {
  return <div className={`interactive-flow is-${props.direction}`} data-program-node={props.id}
    style={{ gap: props.gap, '--interactive-columns': props.columns, '--interactive-narrow-columns': Math.min(props.columns, 2), alignItems: props.align === 'start' ? 'flex-start' : props.align } as CSSProperties}>
    <InteractiveChildren value={props.children} />
  </div>;
}
function InteractivePaper({ props }: Props) {
  return <section className={`interactive-paper is-${props.tone}`} data-program-node={props.id} style={{ padding: props.padding }}>
    <InteractiveChildren value={props.children} />
  </section>;
}
function InteractiveText({ props }: Props) {
  const value = props.value;
  return <div className={`interactive-text is-${props.size} tone-${props.tone}${value == null ? ' is-unknown' : ''}`}
    data-program-node={props.id}>{value == null ? '尚未给出' : typeof value === 'boolean' ? String(value) : value}</div>;
}
function InteractiveFormula({ props }: Props) {
  return <div className={`interactive-formula${props.display ? ' is-display' : ''}`} data-program-node={props.id}>
    {props.tex == null ? <span className="interactive-unknown">这一关系尚未给出</span>
      : <RichText publicSurface text={props.display ? `\\[\n${props.tex}\n\\]` : `\\(${props.tex}\\)`} />}
  </div>;
}

function NumberEditor({ value, state, label, disabled, onCommit, onCancel, inline = false, onBeginEdit, onKeyboardDone }: { value: number; state: NumberState;
  label: string; disabled: boolean; onCommit: (value: number) => boolean; onCancel?: () => void; inline?: boolean; onBeginEdit?: () => void; onKeyboardDone?: () => void }) {
  const [draft, setDraft] = useState(String(value)), [invalid, setInvalid] = useState(false);
  const focused = useRef(false), dirty = useRef(false), input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!focused.current || !dirty.current) { setDraft(String(value)); setInvalid(false); } }, [value]);
  useEffect(() => { if (inline) input.current?.select(); }, [inline]);
  const commit = () => {
    const next = draft.trim() ? Number(draft) : NaN;
    const accepted = Number.isFinite(next) && onCommit(next);
    if (accepted) dirty.current = false;
    setInvalid(!accepted); return accepted;
  };
  return <input ref={input} autoFocus={inline} type="number" className="interactive-number-editor" inputMode="decimal"
    value={draft} min={state.min} max={state.max} step={state.step ?? 'any'} aria-label={label} aria-invalid={invalid || undefined}
    disabled={disabled} onFocus={() => { focused.current = true; onBeginEdit?.(); }}
    onChange={event => { dirty.current = true; onBeginEdit?.(); setDraft(event.currentTarget.value); setInvalid(false); }}
    onBlur={() => { focused.current = false; if (dirty.current) commit(); else { setDraft(String(value)); setInvalid(false); } }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); if (commit() && inline) { input.current?.blur(); onKeyboardDone?.(); } }
      if (event.key === 'Escape') { event.preventDefault(); dirty.current = false; setDraft(String(value)); setInvalid(false); onCancel?.(); onKeyboardDone?.(); }
    }} />;
}
function InteractiveNumber({ props }: Props) {
  const controls = useInteractiveControls(), state = controls.states[props.field];
  const [editing, setEditing] = useState(false), button = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; start: number; value: number; moved: boolean } | undefined>(undefined);
  if (state?.kind !== 'number') throw new Error('数值输入没有对应的声明。');
  const value = controls.inputs[props.field] as number, disabled = controls.disabled || props.disabled;
  const change = (next: number) => controls.patch({ [props.field]: next }, 'manual', props.id, props.label);
  const step = state.step ?? (state.max - state.min) / 100;
  const fromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      change(snapProgramNumber(event.key === 'Home' ? state.min : event.key === 'End' ? state.max
        : value + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) * step, state));
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); controls.stopMotions(); setEditing(true); }
  };
  return <div className={`interactive-field interactive-number is-${props.presentation}`} data-program-node={props.id}>
    <label>{props.label}</label>
    {props.presentation === 'inline' ? <span className="interactive-inline-value">
      {editing ? <NumberEditor value={value} state={state} label={props.label} disabled={disabled} inline
        onBeginEdit={controls.stopMotions}
        onCancel={() => setEditing(false)} onKeyboardDone={() => requestAnimationFrame(() => button.current?.focus({ preventScroll: true }))}
        onCommit={next => { const accepted = change(next); if (accepted) setEditing(false); return accepted; }} />
        : <button ref={button} type="button" role="spinbutton" className="interactive-adjustable" disabled={disabled}
          aria-label={props.label} aria-valuenow={value} aria-valuemin={state.min} aria-valuemax={state.max}
          title="轻拖、用方向键，或点一下输入" onKeyDown={fromKeyboard} onPointerDown={event => {
            if (event.button !== 0 || disabled) return;
            controls.stopMotions(); drag.current = { id: event.pointerId, start: event.clientX, value, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={event => {
            const current = drag.current;
            if (!current || event.pointerId !== current.id || disabled) return;
            current.moved ||= Math.abs(event.clientX - current.start) > 3;
            if (current.moved) { event.preventDefault(); change(snapProgramNumber(current.value + (event.clientX - current.start) / 5 * step, state)); }
          }} onPointerUp={event => {
            const current = drag.current; drag.current = undefined;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (current && !current.moved) setEditing(true);
          }} onPointerCancel={() => { drag.current = undefined; }}>{formatInteractiveNumber(value)}</button>}
    </span> : props.presentation === 'input' ? <NumberEditor value={value} state={state} label={props.label} disabled={disabled}
      onCommit={change} onBeginEdit={controls.stopMotions} /> : <div className="interactive-slider-line">
      <span className="interactive-range-limit">{formatInteractiveNumber(state.min)}</span>
      <input type="range" aria-label={props.label} value={value} min={state.min} max={state.max} step={state.step ?? 'any'}
        disabled={disabled} style={{ '--interactive-range-fill': `${(value - state.min) / (state.max - state.min) * 100}%` } as CSSProperties}
        onPointerDown={controls.stopMotions} onChange={event => change(snapProgramNumber(event.currentTarget.valueAsNumber, state))} />
      <span className="interactive-range-limit">{formatInteractiveNumber(state.max)}</span>
      <NumberEditor value={value} state={state} label={`${props.label}，直接输入`} disabled={disabled} onCommit={change} onBeginEdit={controls.stopMotions} />
    </div>}
  </div>;
}
function InteractiveTextInput({ props }: Props) {
  const controls = useInteractiveControls(), state = controls.states[props.field];
  if (state?.kind !== 'text') throw new Error('文字输入没有对应的声明。');
  const shared = { value: controls.inputs[props.field] as string, disabled: controls.disabled || props.disabled,
    maxLength: state.maxLength, placeholder: props.placeholder, 'aria-label': props.label,
    onFocus: controls.stopMotions, onCompositionStart: controls.stopMotions,
    onChange: (event: { currentTarget: { value: string } }) => controls.patch({ [props.field]: event.currentTarget.value }, 'manual', props.id, props.label) };
  return <label className="interactive-field interactive-text-input" data-program-node={props.id}>
    <span>{props.label}</span>{props.multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type="text" />}
  </label>;
}
function NumericSequenceInput({ props }: Pick<Props, 'props'>) {
  const controls = useInteractiveControls(), state = controls.states[props.field];
  if (state?.kind !== 'sequence' || state.element !== 'number') throw new Error('数列输入没有对应的声明。');
  const values = controls.inputs[props.field] as number[], valueKey = JSON.stringify(values), disabled = controls.disabled || props.disabled;
  const [draft, setDraft] = useState(() => values.join(', ')), [issue, setIssue] = useState('');
  const input = useRef<HTMLTextAreaElement>(null), composing = useRef(false), synchronized = useRef(valueKey);
  const submitted = useRef<string | undefined>(undefined), selection = useRef<{ start: number; end: number; direction: 'forward' | 'backward' | 'none' } | undefined>(undefined);
  const issueId = useId();
  useLayoutEffect(() => {
    if (synchronized.current === valueKey) return;
    synchronized.current = valueKey;
    if (submitted.current === valueKey) { submitted.current = undefined; return; }
    submitted.current = undefined;
    const element = input.current;
    if (element && document.activeElement === element) selection.current = {
      start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection,
    };
    setDraft(values.join(', ')); setIssue('');
  }, [valueKey]);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(132, Math.max(44, element.scrollHeight))}px`;
    if (selection.current) {
      const saved = selection.current; selection.current = undefined;
      element.setSelectionRange(Math.min(saved.start, draft.length), Math.min(saved.end, draft.length), saved.direction);
    }
  }, [draft]);
  const commit = (next: number[]) => {
    if (disabled) return false;
    try { checkedProgramPatch(controls.states, controls.inputs, { [props.field]: next }); }
    catch { setIssue('超出允许的范围或项数，仍用上一组有效数字。'); return false; }
    submitted.current = JSON.stringify(next);
    if (!controls.patch({ [props.field]: next }, 'manual', props.id, props.label)) {
      submitted.current = undefined; setIssue('这组数字还未应用，输入仍保留。'); return false;
    }
    setIssue(''); return true;
  };
  const edit = (text: string, isComposing = composing.current) => {
    controls.stopMotions(); setDraft(text);
    if (isComposing) return;
    const trimmed = text.trim();
    if (!trimmed || /^[,，]|[,，]$|[,，]\s*[,，]/u.test(trimmed)) {
      setIssue('数列还没写完，仍用上一组有效数字。'); return;
    }
    const parts = trimmed.split(/[,，\s]+/u);
    if (parts.some(part => !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(part))) {
      setIssue('请写完整数字，用逗号或空白分开；仍用上一组有效数字。'); return;
    }
    const next = parts.map(Number);
    if (next.some(value => !Number.isFinite(value))) {
      setIssue('这组数字超出可用范围，仍用上一组有效数字。'); return;
    }
    commit(next);
  };
  return <fieldset className="interactive-field interactive-sequence is-numeric" data-program-node={props.id} disabled={disabled}>
    <legend>{props.label}</legend><div className="interactive-numeric-sequence-editor">
      <textarea ref={input} rows={1} value={draft} aria-label={props.label} aria-invalid={!!issue || undefined}
        aria-describedby={issue ? issueId : undefined} placeholder={props.placeholder || '用逗号或空白分开数字'} spellCheck={false}
        onFocus={controls.stopMotions} onCompositionStart={() => { composing.current = true; controls.stopMotions(); }}
        onCompositionEnd={event => { composing.current = false; edit(event.currentTarget.value, false); }}
        onChange={event => edit(event.currentTarget.value, composing.current || (event.nativeEvent as InputEvent).isComposing)}
        onKeyDown={event => {
          event.stopPropagation();
          if (composing.current || event.nativeEvent.isComposing) return;
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); edit(event.currentTarget.value); }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(values.join(', ')); setIssue(''); }
        }} />
      <button type="button" className="interactive-numeric-sequence-clear" title="清空数列" aria-label={`清空${props.label}`}
        disabled={disabled || !values.length && !draft} onClick={() => { if (commit([])) setDraft(''); }}>
        <X size={14} aria-hidden="true" /></button>
    </div>{issue && <p id={issueId} className="interactive-sequence-issue" role="status">{issue}</p>}
  </fieldset>;
}
function InteractiveSequenceInput({ props }: Props) {
  const controls = useInteractiveControls(), state = controls.states[props.field];
  if (state?.kind !== 'sequence') throw new Error('序列输入没有对应的声明。');
  if (state.element === 'number') return <NumericSequenceInput props={props} />;
  const values = controls.inputs[props.field] as (number | string)[], disabled = controls.disabled || props.disabled;
  const change = (index: number, value: number | string) => controls.patch({ [props.field]: values.map((old, at) => at === index ? value : old) }, 'manual', props.id, props.label);
  return <fieldset className="interactive-field interactive-sequence" data-program-node={props.id} disabled={disabled}>
    <legend>{props.label}</legend><div className="interactive-sequence-items">
      {values.map((value, index) => <div className="interactive-sequence-item" key={index}>
        <span aria-hidden="true">{index + 1}</span>
        <textarea rows={1} value={value as string} maxLength={state.maxItemLength ?? 256}
            aria-label={`${props.label}，第${index + 1}项`} placeholder={props.placeholder} onCompositionStart={controls.stopMotions}
            onChange={event => change(index, event.currentTarget.value)} />
        <button type="button" aria-label={`移开第${index + 1}项`} onClick={() => controls.patch({ [props.field]: values.filter((_, at) => at !== index) }, 'manual', props.id, props.label)}>
          <X size={14} aria-hidden="true" /></button>
      </div>)}
    </div><button className="interactive-sequence-add" type="button" disabled={disabled || values.length >= state.maxItems}
      onClick={() => controls.patch({ [props.field]: [...values, ''] }, 'manual', props.id, props.label)}>
      <Plus size={14} aria-hidden="true" />再放一项</button>
  </fieldset>;
}
function InteractiveChoice({ props }: Props) {
  const controls = useInteractiveControls(), state = controls.states[props.field];
  if (state?.kind !== 'choice') throw new Error('选项没有对应的声明。');
  const value = controls.inputs[props.field] as string, disabled = controls.disabled || props.disabled;
  const change = (next: string) => controls.patch({ [props.field]: next }, 'choice', props.id, props.label);
  return <fieldset className={`interactive-field interactive-choice is-${props.presentation}`} data-program-node={props.id}>
    <legend>{props.label}</legend>{props.presentation === 'select' ? <select aria-label={props.label} value={value} disabled={disabled} onChange={event => change(event.currentTarget.value)}>
      {state.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
      : <span className="interactive-choice-options" role={props.presentation === 'tabs' ? 'tablist' : 'group'} aria-label={props.label}>
        {state.options.map((option, index) => <button key={option} type="button" disabled={disabled} data-selected={value === option}
          role={props.presentation === 'tabs' ? 'tab' : undefined} aria-selected={props.presentation === 'tabs' ? value === option : undefined}
          aria-pressed={props.presentation === 'buttons' ? value === option : undefined}
          tabIndex={props.presentation === 'tabs' && value !== option ? -1 : 0} onClick={() => change(option)}
          onKeyDown={event => {
            if (props.presentation !== 'tabs' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? state.options.length - 1
              : (index + (event.key === 'ArrowLeft' ? -1 : 1) + state.options.length) % state.options.length;
            change(state.options[next]);
            (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
          }}>{option}</button>)}
      </span>}
  </fieldset>;
}
function InteractiveToggle({ props }: Props) {
  const controls = useInteractiveControls();
  return <label className="interactive-field interactive-toggle" data-program-node={props.id}>
    <input type="checkbox" role="switch" aria-label={props.label} checked={controls.inputs[props.field] === true}
      disabled={controls.disabled || props.disabled} onChange={event => controls.patch({ [props.field]: event.currentTarget.checked }, 'control', props.id, props.label)} />
    <span className="interactive-toggle-track" aria-hidden="true" /><span>{props.label}</span>
  </label>;
}
function InteractiveButton({ props }: Props) {
  const controls = useInteractiveControls();
  const step = props.action?.steps?.[0], disabled = controls.disabled || props.disabled;
  return <button type="button" className={`interactive-button is-${props.emphasis}${step?.name === 'Continue' ? ' is-continue' : ''}`}
    data-program-node={props.id} disabled={disabled} onClick={() => {
      if (disabled || validateInteractiveActionPlan(props.action, controls.states)) return;
      const definition = interactiveActions.find(action => action.name === step.name);
      if (!definition) return;
      const parsed = definition.params.safeParse(step.params);
      if (!parsed.success) return;
      if (step.name === 'LocalChange') controls.patch((parsed.data as { values: Record<string, unknown> }).values, 'button', props.id, props.label);
      else if (step.name === 'LocalReset') controls.reset((parsed.data as { fields: string[] }).fields, props.id, props.label);
      else if (step.name === 'Continue') controls.continueFrom(props.id, props.label);
    }}>{step?.name === 'LocalReset' && <RotateCcw size={16} aria-hidden="true" />}<span>{props.label}</span>
    {step?.name === 'Continue' && <ArrowUpRight size={15} aria-hidden="true" />}</button>;
}
function InteractiveSourceSlot({ props }: Props) {
  const host = useContext(InteractiveHostContext);
  return <div className="interactive-source-slot" data-program-node={props.id}>
    {host?.renderSourceSlot ? host.renderSourceSlot(props.ref) : <p className="interactive-unknown">原内容现在还不能在这里展开。</p>}
  </div>;
}
const renderers: Record<InteractiveComponentName, ComponentRenderer<any>> = {
  Document: InteractiveDocument, Flow: InteractiveFlow, Paper: InteractivePaper, Text: InteractiveText, Formula: InteractiveFormula,
  Number: InteractiveNumber, TextInput: InteractiveTextInput, SequenceInput: InteractiveSequenceInput, Choice: InteractiveChoice,
  Toggle: InteractiveToggle, Press: InteractivePress, Voice: InteractiveVoice, Button: InteractiveButton, SourceSlot: InteractiveSourceSlot, Graphic: InteractiveGraphic,
  Group: InteractiveGroup, Line: InteractiveLine, Polyline: InteractivePolyline, Curve: InteractiveCurve, Circle: InteractiveCircle,
  Rect: InteractiveRect, Polygon: InteractivePolygon, Label: InteractiveLabel, DragHandle: InteractiveDragHandle, Motion: InteractiveMotion,
};
/** State-dependent derived props are checked again at their actual render,
 * so a later null cannot fall through a DOM default and masquerade as zero. */
export const interactiveRenderers = Object.fromEntries(Object.entries(renderers).map(([name, Renderer]) => [name,
  function CheckedPrimitive(input: Props) {
    const host = useContext(InteractiveHostContext), graphic = useContext(InteractiveGraphicSlot);
    const problem = host ? validateInteractivePrimitiveProperties(name, input.props, host.document.states) : '缺少原文档';
    if (problem) return graphic ? <g data-program-gap="true"><title>这一处暂时未给出完整的量</title></g>
      : <div className="interactive-part-error" role="status">这一处的量还没有完整给出，可以换一组局部条件再看。</div>;
    return <Renderer {...input} />;
  },
])) as Record<InteractiveComponentName, ComponentRenderer<any>>;
