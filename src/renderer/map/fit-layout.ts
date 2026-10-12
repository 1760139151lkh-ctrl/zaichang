export interface FitInsets { top: number; right: number; bottom: number; left: number }
export interface FitRect { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface FitObstructions { top: FitRect[]; right: FitRect[]; bottom: FitRect[]; card?: FitRect }
export interface LabelObstruction extends FitRect { id: string }
export const fitControlGap = 10;
export const endpointCaptionGap = 23.5; // 12px marker + 1.5px border + 10px text gap.
const zeroInsets = (): FitInsets => ({ top: 0, right: 0, bottom: 0, left: 0 });

/** CSS screen space only. A source distance or physical feature is never moved. */
export function fitInsets(rect: FitRect, blockers: FitObstructions, caption = zeroInsets()) {
  const base: FitInsets = { top: 24, right: 24, bottom: 24, left: 24 };
  for (const r of blockers.top) base.top = Math.max(base.top, r.bottom - rect.top + fitControlGap);
  for (const r of blockers.right) base.right = Math.max(base.right, rect.right - r.left + fitControlGap);
  for (const r of blockers.bottom) base.bottom = Math.max(base.bottom, rect.bottom - r.top + fitControlGap);
  const card = blockers.card;
  if (card) {
    if (card.width < rect.width * 0.52 && card.left < rect.left + rect.width / 2)
      base.left = Math.max(base.left, card.right - rect.left + fitControlGap);
    else base.bottom = Math.max(base.bottom, rect.bottom - card.top + fitControlGap);
  }
  const desired = Object.fromEntries(Object.keys(base).map(k => [k, base[k as keyof FitInsets] + caption[k as keyof FitInsets]])) as unknown as FitInsets;
  const labelSpace = desired.left + desired.right < rect.width - 1 && desired.top + desired.bottom < rect.height - 1;
  const padding = labelSpace ? desired : { ...base };
  // A hidden or extremely small panel must not give either engine invalid fit
  // padding. This fallback does not claim that every caption can fit there.
  for (const [a,b,size] of [['left','right',rect.width],['top','bottom',rect.height]] as const) {
    const sum = padding[a] + padding[b], limit = Math.max(0, size - 1);
    if (sum > limit) { const ratio = limit / sum; padding[a] *= ratio; padding[b] *= ratio; }
  }
  return { padding, labelSpace };
}

export interface CaptionLayout { font: string; size: number; offsetY: number; padding: number; marker: number; maxWidthEm?: number; scale?: number; anchor?: 'center' | 'bottom'; lineHeightPx?: number; horizontalPadding?: number }
export function captionLines(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = []; let line = '';
  for (const token of text.match(/[A-Za-z0-9_]+|[^A-Za-z0-9_]/gu) || []) {
    if (token === '\n') { lines.push(line); line = ''; continue; }
    if (line && measure(line + token) > maxWidth) { lines.push(line); line = token; } else line += token;
  }
  lines.push(line); return lines;
}
export function captionInsets(texts: string[], layout: CaptionLayout, measure: (text: string) => number): FitInsets {
  const result = zeroInsets(), scale = layout.scale ?? 1;
  for (const text of texts) {
    const lines = captionLines(text, layout.maxWidthEm ? layout.maxWidthEm * layout.size : Infinity, measure);
    const width = Math.max(0, ...lines.map(measure)), height = (layout.lineHeightPx ?? layout.size * 1.2) * lines.length;
    const halfWidth = width / 2 + (layout.horizontalPadding ?? layout.padding);
    result.left = Math.max(result.left, halfWidth * scale, layout.marker);
    result.right = Math.max(result.right, halfWidth * scale, layout.marker);
    result.top = Math.max(result.top, ((layout.anchor === 'bottom' ? height : height / 2) + layout.padding - layout.offsetY) * scale, layout.marker);
    result.bottom = Math.max(result.bottom, ((layout.anchor === 'bottom' ? 0 : height / 2) + layout.padding + layout.offsetY) * scale, layout.marker);
  }
  return result;
}

let measurement: CanvasRenderingContext2D | null | undefined;
export function measureCaptions(texts: string[], layout: CaptionLayout): FitInsets {
  measurement ??= document.createElement('canvas').getContext('2d');
  if (measurement) measurement.font = layout.font;
  return captionInsets(texts, layout, text => measurement?.measureText(text).width ?? Array.from(text).length * layout.size);
}

/** Keep both endpoint names clear of the other name and marker. Retain the
 * current side while it is clear so rotating a route does not flip its text.
 */
export function pairedCaptionSides(points:{pixel:number[];name:string}[],layout:CaptionLayout,current=[false,false]):boolean[] {
  if(points.length!==2)return [false,false];
  const sizes=points.map(p=>measureCaptions([p.name],{...layout,offsetY:0,marker:0,anchor:'bottom'}));
  const boxes=(sides:boolean[])=>points.map(({pixel:[x,y]},i)=>{
    const s=sizes[i],gap=endpointCaptionGap,pad=layout.padding;
    return [x-s.left,sides[i]?y+gap-pad:y-gap-s.top,x+s.right,sides[i]?y+gap+s.top:y-gap+pad];
  });
  const intersects=(a:number[],b:number[])=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
  const markers=points.map(({pixel:[x,y]})=>[x-layout.marker,y-layout.marker,x+layout.marker,y+layout.marker]);
  const clear=(sides:boolean[])=>{const b=boxes(sides);return !intersects(b[0],b[1])&&!intersects(b[0],markers[1])&&!intersects(b[1],markers[0]);};
  return [current,[false,false],[false,true],[true,false],[true,true]].find(clear)||current;
}

export function wrapCaption(text: string, font: string, size: number, maxWidthEm: number) {
  measurement ??= document.createElement('canvas').getContext('2d');
  if (measurement) measurement.font = font;
  return captionLines(text, size * maxWidthEm, value => measurement?.measureText(value).width ?? Array.from(value).length * size).join('\n');
}

export function captionWidth(text:string,font:string):number {
  measurement ??= document.createElement('canvas').getContext('2d');
  if(measurement)measurement.font=font;
  return Math.max(...text.split('\n').map(line=>measurement?.measureText(line).width??Array.from(line).length*12));
}

export function mapFitInsets(target: HTMLElement, caption?: FitInsets) {
  const root = target.parentElement, rect = target.getBoundingClientRect();
  const visible = (selector: string) => Array.from(root?.querySelectorAll<HTMLElement>(selector) || [])
    .filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
    .map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
  const result = fitInsets(rect, {
    top: visible('.campus-v2-top, .campus-v3-pitch'),
    right: visible('.campus-v2-controls'),
    bottom: visible('.campus-v2-footer'),
    card: visible('.campus-v2-route')[0],
  }, caption);
  if (caption) target.dataset.fitLabelSpace = String(result.labelSpace);
  return result.padding;
}

/** Display-only occupancy, in CSS pixels relative to the map stage. */
export function mapLabelObstructions(target: HTMLElement): LabelObstruction[] {
  const bounds=target.getBoundingClientRect(),root=target.parentElement;
  const seen=new Set<HTMLElement>();
  const selectors=['.campus-v2-search','.campus-v2-results','.campus-v2-floating','.campus-v2-mode button','.campus-v2-mode span','.campus-v2-controls button','.campus-v2-route','.campus-v3-pitch','.campus-v2-attribution','.campus-v2-help','.campus-v2-scale'];
  return selectors.flatMap((selector,s)=>Array.from(root?.querySelectorAll<HTMLElement>(selector)||[]).flatMap((element,i)=>{
    if(seen.has(element))return [];seen.add(element);
    const style=getComputedStyle(element),r=element.getBoundingClientRect();
    if(style.display==='none'||style.visibility==='hidden'||!r.width||!r.height)return [];
    const left=Math.max(0,r.left-bounds.left),top=Math.max(0,r.top-bounds.top),right=Math.min(bounds.width,r.right-bounds.left),bottom=Math.min(bounds.height,r.bottom-bounds.top);
    return right>left&&bottom>top?[{id:`${s}-${i}`,left,top,right,bottom,width:right-left,height:bottom-top}]:[];
  }));
}

export function observeLabelObstructions(target: HTMLElement,changed:()=>void):()=>void {
  const root=target.parentElement;let frame=0,last='',disposed=false;
  const refresh=()=>{frame=0;if(disposed)return;const next=JSON.stringify(mapLabelObstructions(target));if(next!==last){last=next;changed();}};
  const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(refresh);};
  const resize=new ResizeObserver(schedule);resize.observe(target);if(root)resize.observe(root);
  const mutation=new MutationObserver(schedule);if(root)mutation.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});
  schedule();return ()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();};
}

/** Try the nearest clear text position before ordinary decluttering. */
export function captionControlOffset(pixel:number[],width:number,height:number,blockers:LabelObstruction[]):[number,number]|undefined {
  const clear=(x:number,y:number)=>blockers.every(r=>pixel[0]+x+width/2<=r.left||pixel[0]+x-width/2>=r.right||pixel[1]+y+height/2<=r.top||pixel[1]+y-height/2>=r.bottom);
  if(clear(0,0))return [0,0];
  const candidates=blockers.flatMap(r=>[[r.left-pixel[0]-width/2-2,0],[r.right-pixel[0]+width/2+2,0],[0,r.top-pixel[1]-height/2-2],[0,r.bottom-pixel[1]+height/2+2]] as [number,number][]);
  return candidates.filter(([x,y])=>Math.hypot(x,y)<=Math.max(60,width)&&clear(x,y)).sort((a,b)=>Math.hypot(...a)-Math.hypot(...b))[0];
}
