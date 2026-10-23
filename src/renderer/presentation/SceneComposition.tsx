import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, CalendarDays, CloudSun, MapPin, MessageCircle, StickyNote } from 'lucide-react';
import type { SceneLayout, SceneSnapshot } from '../../shared/scenes';
import './scene-composition.css';

export interface SceneCompositionItem {
  id: string;
  scene?: SceneSnapshot;
  content: ReactNode;
}
function identity(scene?: SceneSnapshot) {
  switch (scene?.kind) {
    case 'map': return { label: '地图', Icon: MapPin };
    case 'weather': return { label: '按日天气', Icon: CloudSun };
    case 'environment': return { label: scene.domain === 'air_quality' ? '空气' : '小时天气', Icon: CloudSun };
    case 'planning': return { label: '安排', Icon: CalendarDays };
    case 'study': case 'study_reference': return { label: '这一题', Icon: BookOpen };
    case 'note': case 'note_reference': return { label: '笔记', Icon: StickyNote };
    case 'campus': case 'campus_reference': return { label: '校园资料', Icon: BookOpen };
    default: return { label: '一起看看', Icon: MessageCircle };
  }
}

/** Composition changes the place of a surface, never its identity or facts.
 * Every child keeps the same mounted wrapper when the main surface changes. */
export function SceneComposition({ items, layout }: { items: SceneCompositionItem[]; layout: SceneLayout }) {
  const [requested, setRequested] = useState<string>();
  const [width, setWidth] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const primary = items.find(item => item.id === requested)?.id || items[0]?.id;
  const focus = layout === 'focus' && items.length > 1;
  const minimumWidth = (item: SceneCompositionItem) =>
    ['study', 'study_reference', 'discussion', 'rehearsal'].includes(item.scene?.kind || '') ? 600
      : item.scene?.kind === 'map' ? 440 : 280;
  const primaryMinimum = minimumWidth(items.find(item => item.id === primary) || { id: '', content: null });
  const supportingMinimum = Math.max(260, ...items.filter(item => item.id !== primary).map(minimumWidth));
  const wide = width >= (focus ? primaryMinimum + supportingMinimum + 16 : 760);
  const signature = items.map(item => item.id).join('|');
  useEffect(() => {
    if (requested && !items.some(item => item.id === requested)) setRequested(undefined);
  }, [signature, requested]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  let supportingRow = 0;
  return <div ref={root} data-wide={wide} className={`scene-composition ${focus ? 'has-focus' : ''}`}
    style={focus ? { '--scene-main-width': `minmax(${primaryMinimum}px,${primaryMinimum >= 440 ? 1.8 : 1}fr)`,
      '--scene-support-width': `minmax(${supportingMinimum}px,${supportingMinimum >= 440 ? 1.8 : 1}fr)` } as CSSProperties : undefined}>
    {focus && <div className="scene-focus-switch" role="group" aria-label="主要查看" ref={tabs}>
      {items.map((item, index) => {
        const { label, Icon } = identity(item.scene);
        return <button key={item.id} type="button" aria-pressed={primary === item.id}
          aria-label={`主要查看${label}`} onClick={() => setRequested(item.id)}
          onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % items.length
              : event.key === 'ArrowLeft' ? (index - 1 + items.length) % items.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : undefined;
            if (next === undefined) return;
            event.preventDefault(); setRequested(items[next].id);
            tabs.current?.querySelectorAll('button')[next]?.focus({ preventScroll: true });
          }}><Icon size={15} /><span>{label}</span></button>;
      })}
    </div>}
    <div className={`presentation-scenes presentation-scenes-${layout === 'focus' && !focus ? 'stack' : layout}`}>
      {items.map(item => {
        const isPrimary = item.id === primary;
        const row = isPrimary ? 1 : ++supportingRow;
        return <div key={item.id} className="scene-composition-surface" data-primary={isPrimary}
          data-scene-kind={item.scene?.kind} style={focus ? {
            '--scene-row': row, '--scene-span': isPrimary ? Math.max(1, items.length - 1) : 1,
          } as CSSProperties : undefined}>{item.content}</div>;
      })}
    </div>
  </div>;
}
