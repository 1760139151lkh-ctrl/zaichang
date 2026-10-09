export interface FitInsets { top: number; right: number; bottom: number; left: number }
export interface FitRect { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface FitObstructions { top: FitRect[]; right: FitRect[]; bottom: FitRect[]; card?: FitRect }
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

export function wrapCaption(text: string, font: string, size: number, maxWidthEm: number) {
  measurement ??= document.createElement('canvas').getContext('2d');
  if (measurement) measurement.font = font;
  return captionLines(text, size * maxWidthEm, value => measurement?.measureText(value).width ?? Array.from(value).length * size).join('\n');
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
