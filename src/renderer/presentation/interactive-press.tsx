import { useContext, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { ComponentRenderProps } from '@openuidev/react-lang';
import { snapProgramNumber } from '../../shared/interactive-program';
import { InteractiveChildren, InteractiveGraphicSlot, InteractivePressAppearance, useInteractiveControls } from './interactive-context';

/** One held interaction, independent of what the surrounding mechanism means.
 * Capture owns release; no global key listener can type into the composer. */
export function InteractivePress({ props }: ComponentRenderProps<Record<string, any>>) {
  const controls = useInteractiveControls(), graphic = useContext(InteractiveGraphicSlot);
  const current = useRef({ controls, props }); current.current = { controls, props };
  const element = useRef<HTMLButtonElement | SVGGElement | null>(null);
  const held = useRef(new Set<string>()), tap = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const binding = useRef<{ field: string; id: string; scopeKey: string } | undefined>(undefined);
  const sourceTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest('.interactive-source-slot');
  const ownsGesture = (target: EventTarget | null) => {
    const root = element.current;
    if (!root || !(target instanceof Element) || sourceTarget(target)) return false;
    // Authored graphic labels share this SVG's unclipped overlay. Their
    // React parent still owns the press; source portals outside it do not.
    return root.contains(target) || !!graphic && !!target.closest('.interactive-graphic-controls')
      && target.closest('svg') === root.closest('svg');
  };
  const release = (source?: string) => {
    const before = held.current.size;
    if (source) held.current.delete(source); else held.current.clear();
    if (!before || held.current.size) return;
    const next = current.current.controls, active = binding.current; binding.current = undefined;
    if (active && active.scopeKey === next.scopeKey) next.releasePress(active.field, active.id);
  };
  const press = (source: string) => {
    const { controls: next, props: value } = current.current;
    if (next.disabled || value.disabled || held.current.has(source)) return;
    const already = held.current.size > 0;
    held.current.add(source);
    if (already) return;
    binding.current = { field: value.field, id: value.id, scopeKey: next.scopeKey };
    const first = next.acquirePress(value.field, value.id, value.pressureField);
    const values: Record<string, unknown> = { ...(first && value.values ? value.values : {}), [value.field]: true };
    if (first && value.pressureField) {
      const state = next.states[value.pressureField];
      if (state?.kind === 'number') values[value.pressureField] = snapProgramNumber(value.strength, state);
    }
    if (first && value.triggerField) {
      const state = next.states[value.triggerField], inputs = next.readInputs();
      if (state?.kind === 'number') values[value.triggerField] = Number(inputs[value.triggerField]) >= state.max
        ? state.min : Number(inputs[value.triggerField]) + 1;
    }
    if (!next.patch(values, 'control', value.id, value.label)) {
      held.current.delete(source); binding.current = undefined; next.releasePress(value.field, value.id);
    }
  };
  useEffect(() => {
    const root = element.current?.closest('.interactive-document');
    const blur = () => release();
    const visibility = () => { if (document.hidden) release(); };
    const keyDown = (raw: Event) => {
      const event = raw as globalThis.KeyboardEvent, hotkey = current.current.props.hotkey;
      if (!hotkey || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey
        || event.key.toLowerCase() !== hotkey.toLowerCase()
        || event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],.interactive-source-slot')) return;
      event.preventDefault(); press(`key:${event.key.toLowerCase()}`);
    };
    const keyUp = (raw: Event) => release(`key:${(raw as globalThis.KeyboardEvent).key.toLowerCase()}`);
    const leave = (raw: Event) => {
      const target = (raw as FocusEvent).relatedTarget;
      if (!(target instanceof Node) || !root?.contains(target) || sourceTarget(target)) release();
    };
    root?.addEventListener('keydown', keyDown); root?.addEventListener('keyup', keyUp);
    root?.addEventListener('focusout', leave);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => {
      root?.removeEventListener('keydown', keyDown); root?.removeEventListener('keyup', keyUp);
      root?.removeEventListener('focusout', leave);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      if (tap.current) clearTimeout(tap.current);
      release();
    };
  }, []);
  useEffect(() => { if (controls.disabled || props.disabled) release(); }, [controls.disabled, props.disabled]);
  useEffect(() => () => release(), [props.field, props.pressureField, controls.scopeKey]);
  useEffect(() => {
    if (controls.inputs[props.field] !== true && binding.current) {
      const active = binding.current; binding.current = undefined; held.current.clear();
      controls.releasePress(active.field, active.id);
    }
  }, [controls.inputs[props.field], props.field]);
  const pointerDown = (event: PointerEvent<HTMLElement | SVGElement>) => {
    if (event.button !== 0 || controls.disabled || props.disabled || !ownsGesture(event.target)) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId); press(`pointer:${event.pointerId}`);
  };
  const pointerUp = (event: PointerEvent<HTMLElement | SVGElement>) => {
    if (!ownsGesture(event.target)) return;
    release(`pointer:${event.pointerId}`);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyDown = (event: KeyboardEvent<HTMLElement | SVGElement>) => {
    if (![' ', 'Enter'].includes(event.key) || event.repeat || event.nativeEvent.isComposing || !ownsGesture(event.target)) return;
    event.preventDefault(); event.stopPropagation(); press(`key:${event.key.toLowerCase()}`);
  };
  const keyUp = (event: KeyboardEvent<HTMLElement | SVGElement>) => {
    if (![' ', 'Enter'].includes(event.key) || !ownsGesture(event.target)) return;
    event.preventDefault(); event.stopPropagation(); release(`key:${event.key.toLowerCase()}`);
  };
  const releaseKeys = () => {
    for (const source of [...held.current]) if (source.startsWith('key:') || source === 'activation') release(source);
  };
  const disabled = controls.disabled || props.disabled, active = controls.inputs[props.field] === true;
  const shared = {
    'data-program-node': props.id, 'aria-label': props.label, 'aria-pressed': active, 'aria-disabled': disabled,
    'aria-keyshortcuts': props.hotkey || undefined,
    onPointerDown: pointerDown, onPointerUp: pointerUp, onPointerCancel: pointerUp,
    onLostPointerCapture: (event: PointerEvent<HTMLElement | SVGElement>) => release(`pointer:${event.pointerId}`),
    onKeyDown: keyDown, onKeyUp: keyUp, onBlur: releaseKeys,
    onClick: (event: { detail: number; preventDefault: () => void; target: EventTarget | null }) => {
      if (!ownsGesture(event.target)) return;
      event.preventDefault();
      if (event.detail !== 0 || held.current.size || disabled) return;
      press('activation'); tap.current = setTimeout(() => release('activation'), 60);
    },
  };
  return graphic ? <g {...shared} ref={node => { element.current = node; }} role="button" tabIndex={disabled ? -1 : 0}
    className={`interactive-press-area is-${props.appearance}${active ? ' is-held' : ''}`}><title>{props.label}{props.hotkey ? ` · ${props.hotkey.toUpperCase()}` : ''}</title>
    <InteractivePressAppearance.Provider value={props.appearance}><InteractiveChildren value={props.children} /></InteractivePressAppearance.Provider></g>
    : <button {...shared} ref={node => { element.current = node; }} type="button" disabled={disabled}
      className={`interactive-press is-${props.appearance}${active ? ' is-held' : ''}`}>
      <InteractiveChildren value={props.children} />{props.hotkey && <kbd>{props.hotkey.toUpperCase()}</kbd>}
    </button>;
}
