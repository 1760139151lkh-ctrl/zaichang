import { useEffect, useRef, useState, type PointerEvent } from 'react';
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
  const [value, setValue] = useState(initial);
  const [limits, setLimits] = useState({ min:35, max:70 });
  const current = useRef(value);
  const gesture = useRef<{ id:number; start:number } | undefined>(undefined);
  const keyboardStart = useRef<number | undefined>(undefined);
  const [moving, setMoving] = useState(false);
  function apply(next:number) {
    const clamped = Math.round(Math.max(limits.min, Math.min(limits.max, next)) * 10) / 10;
    current.current = clamped; setValue(clamped);
    divider.current?.parentElement?.style.setProperty('--reading-split', `${clamped}%`);
  }
  function save() {
    try { localStorage.setItem(storageKey, String(current.current)); } catch { /* Layout still works without persistence. */ }
  }
  useEffect(() => {
    const parent = divider.current?.parentElement;
    if (!parent) return;
    parent.style.setProperty('--reading-split', `${current.current}%`);
    const observer = new ResizeObserver(entries => {
      const width=entries[0].contentRect.width;
      if (width < 800) return;
      const min=Math.max(35,330/width*100), max=Math.min(70,100-300/width*100);
      setLimits({ min,max });
      const next=Math.max(min,Math.min(max,current.current));
      current.current=next; setValue(next); parent.style.setProperty('--reading-split',`${next}%`);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  function end(cancel=false) {
    const active=gesture.current;
    if (!active) return;
    gesture.current=undefined; setMoving(false);
    if (cancel) apply(active.start); else save();
    if (divider.current?.hasPointerCapture(active.id)) divider.current.releasePointerCapture(active.id);
  }
  function move(event:PointerEvent<HTMLDivElement>) {
    if (gesture.current?.id!==event.pointerId) return;
    const rect=divider.current?.parentElement?.getBoundingClientRect();
    if (rect?.width) apply((event.clientX-rect.left)/rect.width*100);
  }
  return <div ref={divider} className={`reading-divider${moving?' is-moving':''}`} role="separator"
    tabIndex={0} aria-label="调整原文和对话的宽度" aria-orientation="vertical"
    aria-valuemin={Math.round(limits.min)} aria-valuemax={Math.round(limits.max)} aria-valuenow={Math.round(value)}
    aria-valuetext={`原文占${Math.round(value)}%`} title="拖动调整宽度；双击复原"
    onPointerDown={event=>{
      if(event.button!==0)return;
      event.preventDefault(); keyboardStart.current=undefined;
      gesture.current={id:event.pointerId,start:current.current}; setMoving(true);
      event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({preventScroll:true});
    }} onPointerMove={move} onPointerUp={()=>end()} onPointerCancel={()=>end(true)} onLostPointerCapture={()=>end(true)}
    onDoubleClick={()=>{apply(56);save();}}
    onKeyDown={event=>{
      if(event.key==='Escape'){
        if(gesture.current){event.preventDefault();end(true);}
        else if(keyboardStart.current!==undefined){event.preventDefault();apply(keyboardStart.current);save();keyboardStart.current=undefined;}
        return;
      }
      const next=event.key==='ArrowLeft'?current.current-(event.shiftKey ? 0.5 : 2)
        :event.key==='ArrowRight'?current.current+(event.shiftKey ? 0.5 : 2)
          :event.key==='Home'?limits.min:event.key==='End'?limits.max:undefined;
      if(next===undefined)return;
      event.preventDefault();keyboardStart.current??=current.current;apply(next);save();
    }} onBlur={()=>{keyboardStart.current=undefined;end(true);}}><span aria-hidden="true"><i/><i/></span></div>;
}
