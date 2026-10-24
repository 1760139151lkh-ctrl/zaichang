import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useSplitMotion } from './motion/use-split-motion';
import './reading-divider.css';

const storageKey = 'zaichang.reading-split.v1';
const initial = () => {
  try { const value = Number(localStorage.getItem(storageKey)); return value >= 35 && value <= 70 ? value : 56; }
  catch { return 56; }
};

/** One direct divider for the existing reader and composer. No content moves
 * between stores when space changes; both panes keep their DOM and selection. */
export function ReadingDivider() {
  const divider = useRef<HTMLDivElement>(null);
  const [initialValue] = useState(initial);
  const motion = useSplitMotion(initialValue, {
    bounds: { min: 35, max: 70 },
    onValue: value => divider.current?.parentElement?.style.setProperty('--reading-split', `${value}%`),
    onCommit: value => { try { localStorage.setItem(storageKey, String(value)); } catch { /* Layout still works without persistence. */ } },
  });
  useEffect(() => {
    const parent = divider.current?.parentElement;
    if (!parent) return;
    let measuredWidth=-1;
    const observer = new ResizeObserver(entries => {
      const width=entries[0].contentRect.width;
      if(Math.abs(width-measuredWidth)<.25)return;
      measuredWidth=width;
      if (width < 800 || matchMedia('(max-width: 900px)').matches) { motion.cancel(); return; }
      const min=Math.max(35,330/width*100), max=Math.min(70,100-300/width*100);
      motion.constrain({ min, max });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  function move(event:PointerEvent<HTMLDivElement>) {
    const rect=divider.current?.parentElement?.getBoundingClientRect();
    if (rect?.width) motion.move((event.clientX-rect.left)/rect.width*100, event.pointerId);
  }
  return <div ref={divider} className={`reading-divider${motion.moving?' is-moving':''}`} role="separator"
    tabIndex={0} aria-label="调整原文和对话的宽度" aria-orientation="vertical"
    aria-valuemin={Math.round(motion.bounds.min)} aria-valuemax={Math.round(motion.bounds.max)} aria-valuenow={Math.round(motion.value)}
    aria-valuetext={`原文占${Math.round(motion.value)}%`} title="拖动调整宽度；双击复原"
    {...motion.bind} onPointerMove={move} onDoubleClick={() => motion.reset(56)}><span aria-hidden="true"><i/><i/></span></div>;
}
