import { useCallback, useEffect, useRef, useState } from 'react';

export interface SpringSnapshot { value: number; velocity: number }
export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  precision?: number;
  reducedMotion?: boolean;
  bounds?: readonly [number, number];
}
interface SpringTargetOptions { velocity?: number; onRest?: () => void }

function quietMotion() {
  return document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A visual value only. Owners decide when a preview or a resting value is saved. */
export function useSpringValue(initial: number, options: SpringOptions = {}) {
  const [value, render] = useState(initial);
  const state = useRef({ value: initial, velocity: 0, target: initial, frame: 0, time: 0, onRest: undefined as (() => void) | undefined });
  const settings = useRef(options);
  settings.current = options;

  const stop = useCallback((): SpringSnapshot => {
    const current = state.current;
    if (current.frame) cancelAnimationFrame(current.frame);
    current.frame = 0; current.time = 0; current.onRest = undefined;
    return { value: current.value, velocity: current.velocity };
  }, []);
  const bounded = useCallback((next: number) => {
    const limits = settings.current.bounds;
    return limits ? Math.max(limits[0], Math.min(limits[1], next)) : next;
  }, []);
  const set = useCallback((next: number, velocity = 0) => {
    stop();
    const current = state.current;
    current.value = current.target = bounded(next);
    current.velocity = Number.isFinite(velocity) ? velocity : 0;
    render(current.value);
  }, [bounded, stop]);
  const get = useCallback((): SpringSnapshot => ({ value: state.current.value, velocity: state.current.velocity }), []);

  const animate = useCallback((target: number, targetOptions: SpringTargetOptions = {}) => {
    const current = state.current;
    stop();
    current.target = bounded(target);
    if (targetOptions.velocity !== undefined) current.velocity = targetOptions.velocity;
    current.onRest = targetOptions.onRest;
    const rest = () => {
      current.value = current.target; current.velocity = 0; current.frame = 0; current.time = 0;
      const completed = current.onRest; current.onRest = undefined;
      render(current.value); completed?.();
    };
    if (settings.current.reducedMotion || quietMotion() || document.hidden) { rest(); return; }
    const frame = (time: number) => {
      if (settings.current.reducedMotion || quietMotion()) { rest(); return; }
      const { stiffness = 280, damping = 30, mass = 1, precision = .001 } = settings.current;
      // Small integration steps keep retargeting stable after a slow frame.
      let remaining = Math.min(current.time ? (time - current.time) / 1000 : 1 / 60, 1 / 30);
      current.time = time;
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120);
        current.velocity += ((current.target - current.value) * stiffness - current.velocity * damping) / mass * dt;
        const next = current.value + current.velocity * dt;
        current.value = bounded(next);
        if (next !== current.value) current.velocity = 0;
        remaining -= dt;
      }
      if (Math.abs(current.target - current.value) < precision && Math.abs(current.velocity) < precision * 10) { rest(); return; }
      render(current.value);
      current.frame = requestAnimationFrame(frame);
    };
    current.frame = requestAnimationFrame(frame);
  }, [bounded, stop]);

  useEffect(() => {
    const settle = (complete: boolean) => {
      if (!state.current.frame) return;
      const { target, onRest } = state.current;
      stop(); set(target);
      if (complete) onRest?.();
    };
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { if (settings.current.reducedMotion || quietMotion()) settle(true); };
    const visibility = () => { if (document.hidden) settle(false); };
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    preference.addEventListener('change', changed); document.addEventListener('visibilitychange', visibility);
    return () => { stop(); observer.disconnect(); preference.removeEventListener('change', changed); document.removeEventListener('visibilitychange', visibility); };
  }, [set, stop]);
  useEffect(() => {
    if (options.reducedMotion && state.current.frame) {
      const { target, onRest } = state.current;
      set(target); onRest?.();
    }
  }, [options.reducedMotion, set]);
  return { value, get, set, animate, stop };
}
