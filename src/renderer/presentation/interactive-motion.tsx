import { useContext, useEffect, useRef, type CSSProperties, type Ref } from 'react';
import type { ComponentRenderProps } from '@openuidev/react-lang';
import { snapProgramNumber } from '../../shared/interactive-program';
import { InteractiveChildren, InteractiveGraphicSlot, useInteractiveControls } from './interactive-context';

type Frame = { opacity?: number; x?: number; y?: number; rotate?: number; scale?: number; values?: Record<string, number> };
function reducedMotion() { return document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches; }
function visualFrame(frame: Frame): Keyframe {
  return { ...(frame.opacity === undefined ? {} : { opacity: frame.opacity }),
    transform: `translate(${frame.x ?? 0}px,${frame.y ?? 0}px) rotate(${frame.rotate ?? 0}deg) scale(${frame.scale ?? 1})` };
}

/** One finite, user-started sequence. It schedules checked writes to the
 * existing native record; it does not evaluate expressions or run actions. */
export function InteractiveMotion({ props }: ComponentRenderProps<Record<string, any>>) {
  const controls = useInteractiveControls(), graphic = useContext(InteractiveGraphicSlot);
  const current = useRef(controls); current.current = controls;
  const element = useRef<HTMLDivElement | SVGGElement>(null);
  const tracks = useRef<readonly string[]>([]);
  const run = useRef<{ generation: number; raf?: number; animation?: Animation }>({ generation: 0 });
  const previous = useRef({ when: props.when as unknown, action: controls.userAction.serial });
  const startedAction = useRef(0);
  const cancel = () => {
    run.current.generation += 1;
    if (run.current.raf !== undefined) cancelAnimationFrame(run.current.raf);
    run.current.animation?.cancel(); run.current.raf = undefined; run.current.animation = undefined;
  };
  useEffect(() => {
    cancel(); startedAction.current = 0;
    previous.current = { when: props.when, action: 0 };
    const unregister = current.current.registerMotion(cancel, () => tracks.current);
    return () => { cancel(); unregister(); };
  }, [controls.scopeKey]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    const observer = new IntersectionObserver(entries => { if (!entries.some(entry => entry.isIntersecting)) cancel(); });
    const work = element.current?.closest('.interactive-document') || element.current;
    if (work) observer.observe(work);
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden);
    return () => { observer.disconnect(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { if (reducedMotion()) run.current.animation?.finish(); };
    preference.addEventListener('change', changed);
    const observer = new MutationObserver(changed); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => { preference.removeEventListener('change', changed); observer.disconnect(); };
  }, []);
  useEffect(() => { if (controls.disabled) cancel(); }, [controls.disabled]);
  useEffect(() => {
    const action = current.current.userAction, old = previous.current;
    previous.current = { when: props.when, action: action.serial };
    const userStarted = action.origin === 'button' || action.origin === 'control' || action.origin === 'choice';
    if (!action.serial || !userStarted || Object.is(old.when, props.when)) return;
    if (props.when === false && props.releaseBehavior === 'finish') return;
    if (current.current.disabled || props.when === undefined || props.when === null || props.when === false) { cancel(); return; }
    // A user-started finite stage can trigger another stage. Each node has
    // one start per real action, so its own writes cannot make an auto-loop.
    if (startedAction.current === action.serial) return;
    cancel(); startedAction.current = action.serial;
    const frames = structuredClone(props.frames) as Frame[], duration = props.durationMs as number, iterations = props.iterations as number;
    const fields = [...new Set(frames.flatMap(frame => Object.keys(frame.values || {})))];
    tracks.current = fields;
    const last: Record<string, number> = Object.fromEntries(fields.map(key => [key, current.current.inputs[key] as number]));
    // Carry only explicitly animated tracks, never a snapshot of the record.
    const keyframes = frames.map(frame => {
      Object.assign(last, frame.values || {}); return { ...last };
    });
    const write = (progress: number) => {
      const at = Math.min(frames.length - 1, Math.max(0, progress * (frames.length - 1)));
      const index = Math.min(frames.length - 2, Math.floor(at)), fraction = at - index;
      const patch: Record<string, number> = {};
      for (const key of fields) {
        const state = current.current.states[key];
        if (state?.kind !== 'number') return false;
        patch[key] = snapProgramNumber(keyframes[index][key] + (keyframes[index + 1][key] - keyframes[index][key]) * fraction, state);
      }
      return !fields.length || current.current.patch(patch, 'motion');
    };
    if (reducedMotion()) { write(1); return; }
    const hasVisual = frames.some(frame => frame.opacity !== undefined || frame.x !== undefined || frame.y !== undefined
      || frame.rotate !== undefined || frame.scale !== undefined);
    if (!element.current?.animate) { write(1); return; }
    // Numeric and visual tracks read one browser timing function. Empty
    // property frames still provide the same native clock for numeric-only work.
    const animation = element.current.animate(hasVisual ? frames.map(visualFrame)
      : frames.map((_, index) => ({ offset: index / (frames.length - 1) })), {
      duration, iterations, easing: props.easing, fill: 'none',
    });
    run.current.animation = animation;
    const generation = run.current.generation;
    if (!write(0)) { cancel(); return; }
    const tick = () => {
      if (run.current.generation !== generation || current.current.disabled) return;
      if (!animation.effect || animation.playState === 'idle') { cancel(); return; }
      const finished = animation.playState === 'finished';
      const progress = finished ? 1 : animation.effect.getComputedTiming().progress;
      if (typeof progress === 'number' && !write(progress)) { cancel(); return; }
      if (finished) { run.current.raf = undefined; return; }
      run.current.raf = requestAnimationFrame(tick);
    };
    if (fields.length) run.current.raf = requestAnimationFrame(tick);
    return undefined;
  }, [controls.userAction.serial, props.when]);
  const style = { transformBox: 'fill-box', transformOrigin: 'center' } as CSSProperties;
  return graphic ? <g ref={element as Ref<SVGGElement>} data-program-node={props.id} style={style}><InteractiveChildren value={props.children} /></g>
    : <div ref={element as Ref<HTMLDivElement>} className="interactive-motion" data-program-node={props.id} style={style}><InteractiveChildren value={props.children} /></div>;
}
