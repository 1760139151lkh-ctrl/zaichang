import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { useSpringValue } from './use-spring';

/** Only visual positions. Object identity, trial time and saving stay with callers. */
export function SpringLayoutButton({ style, direct = false, layoutKey, active = true, verticalBounds, onPointerDown, onPointerUp, onPointerCancel, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { style: CSSProperties; direct?: boolean; layoutKey: string | number; active?: boolean;
    verticalBounds?: readonly [number, number] }) {
  const top = Number(style.top), left = Number.parseFloat(String(style.left)), width = Number.parseFloat(String(style.width));
  const y = useSpringValue(top, { stiffness: 340, damping: 34, precision: .05, bounds: verticalBounds });
  const x = useSpringValue(left, { stiffness: 340, damping: 34, precision: .01 });
  const size = useSpringValue(width, { stiffness: 340, damping: 34, precision: .01 });
  const previousLayout = useRef(layoutKey), previousSample = useRef({ top, time: performance.now() });
  useLayoutEffect(() => {
    const reset = previousLayout.current !== layoutKey || !active;
    previousLayout.current = layoutKey;
    const now = performance.now(), elapsed = (now - previousSample.current.time) / 1000;
    if (direct || reset) {
      y.set(top, direct && !reset && elapsed > 0 ? (top - previousSample.current.top) / elapsed : 0);
      x.set(left); size.set(width);
    } else { y.animate(top); x.animate(left); size.animate(width); }
    previousSample.current = { top, time: now };
  }, [top, left, width, direct, layoutKey, active]);
  return <button {...props} style={{ ...style, top: y.value, left: `${x.value}%`, width: `${size.value}%` }}
    onPointerDown={event => { y.stop(); x.stop(); size.stop(); onPointerDown?.(event); }}
    onPointerCancel={event => { onPointerCancel?.(event); y.animate(top); x.animate(left); size.animate(width); }}
    onPointerUp={event => { onPointerUp?.(event); if (!direct) { y.animate(top); x.animate(left); size.animate(width); } }} />;
}
