import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useSpringValue } from './use-spring';

interface SplitBounds { min: number; max: number }
interface SplitOptions {
  bounds: SplitBounds;
  onValue: (value: number, moving: boolean) => void;
  onCommit: (value: number) => void;
}

/** A divider owns a preview until release/Enter. Cancel never writes a ratio. */
export function useSplitMotion(initial: number, options: SplitOptions) {
  const [bounds, setBounds] = useState(options.bounds), [moving, setMoving] = useState(false);
  const limits = useRef(bounds), callbacks = useRef(options), baseline = useRef(initial);
  callbacks.current = options;
  const spring = useSpringValue(initial, { stiffness: 340, damping: 36, precision: .015, bounds: [bounds.min, bounds.max] });
  const gesture = useRef<{ id: number; target: HTMLDivElement; origin: number; time: number; value: number; velocity: number } | undefined>(undefined);
  const keyboardOrigin = useRef<number | undefined>(undefined);
  const pending = useRef<{ origin: number; target: number } | undefined>(undefined);
  const legal = (value: number) => Math.max(limits.current.min, Math.min(limits.current.max, value));
  const persist = (value: number) => { baseline.current = value; callbacks.current.onCommit(value); };
  function flushAccepted() {
    const accepted = pending.current;
    if (!accepted) return;
    pending.current = undefined;
    persist(accepted.target);
  }
  function settle(value: number, accept: boolean, origin = baseline.current, velocity = spring.get().velocity) {
    const target = legal(value);
    const accepted = accept ? { origin, target } : undefined;
    pending.current = accepted;
    spring.animate(target, { velocity, ...(accepted ? { onRest: () => {
      if (pending.current !== accepted) return;
      pending.current = undefined; persist(target);
    } } : {}) });
  }
  function cancel() {
    const origin = gesture.current?.origin ?? keyboardOrigin.current ?? pending.current?.origin;
    if (origin === undefined) return false;
    keyboardOrigin.current = undefined;
    const active = gesture.current;
    gesture.current = undefined; setMoving(false);
    settle(origin, false);
    if (active?.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
    return true;
  }
  function end(cancelled = false, pointerId?: number) {
    const active = gesture.current;
    if (!active || pointerId !== undefined && active.id !== pointerId) return;
    if (cancelled) { cancel(); return; }
    gesture.current = undefined; setMoving(false);
    settle(spring.get().value, true, active.origin, performance.now() - active.time < 100 ? active.velocity : 0);
    if (active.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation();
    const origin = pending.current?.origin ?? keyboardOrigin.current ?? baseline.current;
    const take = spring.stop(); pending.current = undefined; keyboardOrigin.current = undefined;
    gesture.current = { id: event.pointerId, target: event.currentTarget, origin, time: performance.now(), value: take.value, velocity: take.velocity };
    event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true });
    setMoving(true);
  }
  function move(request: number, pointerId: number) {
    const active = gesture.current;
    if (!active || active.id !== pointerId) return;
    const value = legal(Math.round(legal(request) * 10) / 10), now = performance.now(), elapsed = (now - active.time) / 1000;
    const velocity = elapsed > 0 ? Math.max(-300, Math.min(300, (value - active.value) / elapsed)) : active.velocity;
    active.time = now; active.value = value; active.velocity = velocity;
    spring.set(value, velocity);
  }
  function acceptKeyboard() {
    if (keyboardOrigin.current === undefined) return;
    const origin = keyboardOrigin.current; keyboardOrigin.current = undefined;
    settle(spring.get().value, true, origin);
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      if (cancel()) { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); acceptKeyboard(); return; }
    const value = spring.get().value;
    const next = event.key === 'ArrowLeft' ? value - (event.shiftKey ? .5 : 2)
      : event.key === 'ArrowRight' ? value + (event.shiftKey ? .5 : 2)
        : event.key === 'Home' ? limits.current.min : event.key === 'End' ? limits.current.max : undefined;
    if (next === undefined) return;
    event.preventDefault(); event.stopPropagation();
    keyboardOrigin.current ??= pending.current?.origin ?? baseline.current;
    pending.current = undefined; spring.set(legal(next));
  }
  function constrain(next: SplitBounds) {
    limits.current = next; setBounds(next);
    if (gesture.current || keyboardOrigin.current !== undefined) { cancel(); return; }
    const accepted = pending.current;
    if (accepted) settle(accepted.target, true, accepted.origin);
    else spring.set(legal(spring.get().value));
  }
  useLayoutEffect(() => callbacks.current.onValue(spring.value, moving), [spring.value, moving]);
  useEffect(() => {
    const hidden = () => {
      if (!document.hidden) return;
      if (gesture.current || keyboardOrigin.current !== undefined) cancel();
      flushAccepted(); spring.stop();
    };
    const blur = () => { if (gesture.current) cancel(); else acceptKeyboard(); flushAccepted(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', blur);
    return () => {
      flushAccepted(); spring.stop();
      document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', blur);
    };
  }, []);
  return {
    value: spring.value, moving, bounds, move, constrain, cancel,
    reset: (value: number) => { keyboardOrigin.current = undefined; settle(value, true, pending.current?.origin ?? baseline.current); },
    bind: {
      onPointerDown: begin,
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => end(false, event.pointerId),
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => end(true, event.pointerId),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => end(true, event.pointerId),
      onKeyDown: keyDown,
      onBlur: () => { if (gesture.current) cancel(); else acceptKeyboard(); },
    },
  };
}
