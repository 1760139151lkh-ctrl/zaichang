import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { parseCurveExpression, sampleCurve } from '../../shared/curve-expression';
import type { ComponentRenderProps } from '@openuidev/react-lang';
import { snapProgramNumber } from '../../shared/interactive-program';
import { InteractiveChildren, InteractiveGraphicSlot, InteractivePressAppearance, useInteractiveControls } from './interactive-context';

type Props = ComponentRenderProps<Record<string, any>>;
type Point = { x: number; y: number };
type Matrix = [number, number, number, number, number, number];
interface GraphicSpace {
  matrix: Matrix;
  viewport: { width: number; height: number };
  domain: { xMin: number; xMax: number; yMin: number; yMax: number };
  down: boolean;
  point: (x: unknown, y: unknown, matrix?: Matrix) => Point | undefined;
  pointer: (event: PointerEvent<SVGGElement>, matrix?: Matrix) => Point | undefined;
  controlsLayer: SVGGElement | null;
}
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const GraphicSpaceContext = createContext<GraphicSpace | null>(null);
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function useSpace() { const value = useContext(GraphicSpaceContext); if (!value) throw new Error('图形需要位于当前坐标画布内。'); return value; }
function gap() { return <g data-program-gap="true"><title>这里的量尚未给出，保留空缺</title></g>; }
function ticks(min: number, max: number) {
  const span = max - min, raw = span / 5, power = 10 ** Math.floor(Math.log10(raw));
  if (!finite(power) || power === 0) return [min, max];
  const fraction = raw / power, step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const first = Math.ceil(min / step) * step;
  if (!finite(first) || !finite(step) || step <= 0) return [min, max];
  return Array.from({ length: Math.max(0, Math.min(12, Math.floor((max - first) / step + 1e-8) + 1)) }, (_, index) => first + index * step);
}
const display = (number: number) => String(Number(number.toPrecision(6)));
function containsGap(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsGap);
  if (!value || typeof value !== 'object') return false;
  const node = value as { typeName?: string; props?: Record<string, any> }, props = node.props;
  if (!props) return false;
  const keys = node.typeName === 'Line' ? ['x1', 'y1', 'x2', 'y2'] : ['Circle', 'Label', 'Group', 'Rect'].includes(node.typeName || '') ? ['x', 'y'] : [];
  if (keys.some(key => !finite(props[key])) || node.typeName === 'Label' && props.text == null) return true;
  if (['Polyline', 'Polygon'].includes(node.typeName || '') && (!Array.isArray(props.points)
    || props.points.some((point: any) => !point || !finite(point.x) || !finite(point.y)))) return true;
  return containsGap(props.children);
}

export function InteractiveGraphic({ props }: Props) {
  const host = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), [width, setWidth] = useState(760);
  const [readingHeight, setReadingHeight] = useState(window.innerHeight);
  const [controlsLayer, setControlsLayer] = useState<SVGGElement | null>(null);
  const clip = `interactive-clip-${useId().replace(/:/g, '')}`, title = `${clip}-title`;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const reading = element.closest<HTMLElement>('.workspace');
    const update = () => {
      const value = element.getBoundingClientRect().width;
      if (value > 0) setWidth(Math.max(160, value));
      if (reading?.clientHeight) setReadingHeight(reading.clientHeight);
    };
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    if (reading) observer.observe(reading);
    return () => observer.disconnect();
  }, []);
  // Size against the outer work area: revealing a quote or growing the draft
  // must not rescale a plot under the pointer. Reserve room for its controls;
  // geometry and pointer conversion share this same height.
  const height = Math.min(props.height as number, Math.max(220, (readingHeight - 120) * .55)), domain = props.domain as GraphicSpace['domain'];
  const insetLeft = props.axes ? 43 : 14, insetRight = props.axes ? 28 : 14, insetTop = 18, insetBottom = props.axes ? 34 : 18;
  const availableWidth = Math.max(1, width - insetLeft - insetRight), availableHeight = Math.max(1, height - insetTop - insetBottom);
  const xSpan = domain.xMax - domain.xMin, ySpan = domain.yMax - domain.yMin;
  const unit = props.coordinateScale === 'equal' ? Math.min(availableWidth / xSpan, availableHeight / ySpan) : undefined;
  const plotWidth = unit === undefined ? availableWidth : unit * xSpan, plotHeight = unit === undefined ? availableHeight : unit * ySpan;
  const left = insetLeft + (availableWidth - plotWidth) / 2, top = insetTop + (availableHeight - plotHeight) / 2;
  const right = width - left - plotWidth, bottom = height - top - plotHeight, down = props.yDirection === 'down';
  const space: GraphicSpace = {
    domain, matrix: identity, down, controlsLayer, viewport: { width, height },
    point(x, y, matrix = identity) {
      if (!finite(x) || !finite(y)) return;
      const tx = matrix[0] * x + matrix[2] * y + matrix[4], ty = matrix[1] * x + matrix[3] * y + matrix[5];
      const px = left + (tx - domain.xMin) / (domain.xMax - domain.xMin) * plotWidth;
      const py = top + (down ? ty - domain.yMin : domain.yMax - ty) / (domain.yMax - domain.yMin) * plotHeight;
      return finite(px) && finite(py) ? { x: px, y: py } : undefined;
    },
    pointer(event, matrix = identity) {
      const screen = svg.current?.getScreenCTM(); if (!screen) return;
      let point: DOMPoint;
      try { point = new DOMPoint(event.clientX, event.clientY).matrixTransform(screen.inverse()); } catch { return; }
      const x = domain.xMin + (point.x - left) / plotWidth * (domain.xMax - domain.xMin);
      const y = down ? domain.yMin + (point.y - top) / plotHeight * (domain.yMax - domain.yMin)
        : domain.yMax - (point.y - top) / plotHeight * (domain.yMax - domain.yMin);
      const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
      if (!finite(determinant) || determinant === 0) return;
      const localX = (matrix[3] * (x - matrix[4]) - matrix[2] * (y - matrix[5])) / determinant;
      const localY = (-matrix[1] * (x - matrix[4]) + matrix[0] * (y - matrix[5])) / determinant;
      return finite(localX) && finite(localY) ? { x: localX, y: localY } : undefined;
    },
  };
  const zeroX = Math.max(domain.xMin, Math.min(domain.xMax, 0)), zeroY = Math.max(domain.yMin, Math.min(domain.yMax, 0));
  const axis = space.point(zeroX, zeroY)!;
  return <figure ref={host} className="interactive-graphic" data-program-node={props.id}>
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="group" aria-labelledby={title}>
      <title id={title}>{props.label}</title>
      <defs><clipPath id={clip}><rect x={left} y={top} width={plotWidth} height={plotHeight} /></clipPath></defs>
      {props.axes && <g className="interactive-axes" aria-hidden="true">
        <line x1={left} y1={axis.y} x2={width - right} y2={axis.y} />
        <line x1={axis.x} y1={top} x2={axis.x} y2={height - bottom} />
        {ticks(domain.xMin, domain.xMax).map(value => { const point = space.point(value, zeroY)!;
          return <g key={value}><line x1={point.x} y1={axis.y - 3} x2={point.x} y2={axis.y + 3} />
            <text x={point.x} y={Math.min(height - 5, axis.y + 21)} textAnchor="middle">{display(value)}</text></g>; })}
        {ticks(domain.yMin, domain.yMax).filter(value => value !== zeroY).map(value => { const point = space.point(zeroX, value)!;
          return <g key={value}><line x1={axis.x - 3} y1={point.y} x2={axis.x + 3} y2={point.y} />
            <text x={Math.max(4, axis.x - 9)} y={point.y + 5} textAnchor={axis.x > 40 ? 'end' : 'start'}>{display(value)}</text></g>; })}
        {props.xLabel && <text x={width - right} y={height - 5} textAnchor="end">{props.xLabel}</text>}
        {props.yLabel && <text x={Math.min(width - right, axis.x + 9)} y={top + 4}>{props.yLabel}</text>}
      </g>}
      <GraphicSpaceContext.Provider value={space}><InteractiveGraphicSlot.Provider value={true}>
        <g clipPath={`url(#${clip})`}><InteractiveChildren value={props.children} /></g>
        <g ref={setControlsLayer} className="interactive-graphic-controls" />
      </InteractiveGraphicSlot.Provider></GraphicSpaceContext.Provider>
    </svg>
    {containsGap(props.children) && <figcaption className="interactive-graphic-gap">尚未给出的量在图中留空。</figcaption>}
  </figure>;
}
export function InteractiveGroup({ props }: Props) {
  const space = useSpace(), radian = props.rotate * Math.PI / 180, cosine = Math.cos(radian) * props.scale, sine = Math.sin(radian) * props.scale;
  if (!finite(props.x) || !finite(props.y)) return gap();
  const [a, b, c, d, e, f] = space.matrix;
  const matrix: Matrix = [a * cosine + c * sine, b * cosine + d * sine, -a * sine + c * cosine,
    -b * sine + d * cosine, a * props.x + c * props.y + e, b * props.x + d * props.y + f];
  if (!matrix.every(finite)) return gap();
  return <GraphicSpaceContext.Provider value={{ ...space, matrix }}><g data-program-node={props.id}>
    <InteractiveChildren value={props.children} />
  </g></GraphicSpaceContext.Provider>;
}
export function InteractiveLine({ props }: Props) {
  const space = useSpace(), from = space.point(props.x1, props.y1, space.matrix), to = space.point(props.x2, props.y2, space.matrix);
  return from && to ? <line data-program-node={props.id} className={`interactive-stroke tone-${props.color}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
    strokeWidth={props.width} strokeDasharray={props.dashed ? '6 6' : undefined} /> : gap();
}
export function InteractivePolyline({ props }: Props) {
  const space = useSpace();
  if (!Array.isArray(props.points)) return gap();
  let drawing = false;
  const pieces: string[] = [];
  for (const point of props.points) {
    const screen = point ? space.point(point.x, point.y, space.matrix) : undefined;
    if (!screen) { drawing = false; continue; }
    pieces.push(`${drawing ? 'L' : 'M'}${screen.x},${screen.y}`); drawing = true;
  }
  return <path data-program-node={props.id} className={`interactive-stroke tone-${props.color}`} d={pieces.join(' ')} fill="none"
    strokeWidth={props.width} strokeDasharray={props.dashed ? '6 6' : undefined} />;
}
/** A function or parametric curve sampled natively from its checked expression. */
export function InteractiveCurve({ props }: Props) {
  const space = useSpace(), params = JSON.stringify(props.params || {});
  const points = useMemo(() => {
    try {
      return sampleCurve({ y: parseCurveExpression(props.expression), x: props.xExpression ? parseCurveExpression(props.xExpression) : undefined,
        variable: props.variable || 'x', from: props.from, to: props.to, samples: props.samples, params: JSON.parse(params) });
    } catch { return null; }
  }, [props.expression, props.xExpression, props.variable, props.from, props.to, props.samples, params]);
  if (!points) return gap();
  let drawing = false;
  const pieces: string[] = [];
  for (const point of points) {
    const screen = point ? space.point(point.x, point.y, space.matrix) : undefined;
    if (!screen) { drawing = false; continue; }
    pieces.push(`${drawing ? 'L' : 'M'}${screen.x},${screen.y}`); drawing = true;
  }
  return <path data-program-node={props.id} className={`interactive-stroke tone-${props.color}`} d={pieces.join(' ')} fill="none"
    strokeWidth={props.width} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={props.dashed ? '6 6' : undefined} />;
}
export function InteractiveCircle({ props }: Props) {
  const space = useSpace(), point = space.point(props.x, props.y, space.matrix);
  return point ? <circle data-program-node={props.id} className={`interactive-stroke tone-${props.color}`} cx={point.x} cy={point.y} r={props.radius}
    style={{ fill: props.filled ? 'currentColor' : 'none' }} strokeWidth={1.5} /> : gap();
}
export function InteractiveRect({ props }: Props) {
  const space = useSpace();
  const pressAppearance = useContext(InteractivePressAppearance);
  if (!finite(props.x) || !finite(props.y)) return gap();
  const points = [[props.x, props.y], [props.x + props.width, props.y], [props.x + props.width, props.y + props.height],
    [props.x, props.y + props.height]].map(([x, y]) => space.point(x, y, space.matrix));
  if (points.some(point => !point)) return gap();
  return <polygon data-program-node={props.id} className={`interactive-stroke tone-${props.color}${pressAppearance ? ` is-press-${pressAppearance}` : ''}`}
    points={points.map(point => `${point!.x},${point!.y}`).join(' ')}
    style={{ fill: props.filled ? 'currentColor' : 'none' }} strokeWidth={props.strokeWidth} />;
}
export function InteractivePolygon({ props }: Props) {
  const space = useSpace();
  const pressAppearance = useContext(InteractivePressAppearance);
  const points = (props.points as ({ x: number; y: number } | null)[]).map(point => point ? space.point(point.x, point.y, space.matrix) : undefined);
  if (points.some(point => !point)) return gap();
  return <polygon data-program-node={props.id} className={`interactive-stroke tone-${props.color}${pressAppearance ? ` is-press-${pressAppearance}` : ''}`}
    points={points.map(point => `${point!.x},${point!.y}`).join(' ')}
    style={{ fill: props.filled ? 'currentColor' : 'none' }} strokeWidth={props.strokeWidth} />;
}
export function InteractiveLabel({ props }: Props) {
  const space = useSpace(), point = space.point(props.x, props.y, space.matrix);
  const pressAppearance = useContext(InteractivePressAppearance);
  const origin = useRef<SVGGElement>(null), visual = useRef<SVGGElement>(null), label = useRef<SVGTextElement>(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  useGraphicOverlay(space, origin, visual, `${point?.x}:${point?.y}:${props.text}:${props.anchor}`);
  useLayoutEffect(() => {
    const element = label.current;
    if (!element || !point) return;
    const fit = () => {
      const box = element.getBBox();
      const x = box.x - (Number(element.getAttribute('x')) - point.x), y = box.y - (Number(element.getAttribute('y')) - point.y);
      const next = { x: Math.max(4 - x, Math.min(0, space.viewport.width - 4 - x - box.width)),
        y: Math.max(4 - y, Math.min(0, space.viewport.height - 4 - y - box.height)) };
      setShift(before => before.x === next.x && before.y === next.y ? before : next);
    };
    fit(); const observer = new ResizeObserver(fit); observer.observe(element);
    return () => observer.disconnect();
  }, [space.controlsLayer, point?.x, point?.y, props.text, props.anchor, space.viewport.width, space.viewport.height]);
  if (!point || props.text == null) return gap();
  return <><g ref={origin} aria-hidden="true" pointerEvents="none"><text className="interactive-graphic-label"
    x={point.x} y={point.y} textAnchor={props.anchor} opacity={0}>{props.text}</text></g>
    {space.controlsLayer ? createPortal(<g ref={visual}><text ref={label} data-program-node={props.id}
      className={`interactive-graphic-label tone-${props.color}${pressAppearance ? ` is-press-${pressAppearance}` : ''}`} x={point.x + shift.x} y={point.y + shift.y}
      textAnchor={props.anchor}>{props.text}</text></g>, space.controlsLayer) : null}</>;
}

/** Labels and controls stay readable at the data boundary. Their invisible
 * origin preserves a surrounding Motion's actual transform and footprint. */
function useGraphicOverlay(space: GraphicSpace, origin: RefObject<SVGGElement | null>, visual: RefObject<SVGGElement | null>, key: string) {
  const controls = useInteractiveControls();
  useLayoutEffect(() => {
    if (!space.controlsLayer || !origin.current || !visual.current) return;
    let frame: number | undefined;
    const update = (repeat: boolean) => {
      const source = origin.current, target = visual.current, layer = space.controlsLayer;
      if (!source || !target || !layer) return;
      const sourceMatrix = source.getScreenCTM(), layerMatrix = layer.getScreenCTM();
      if (sourceMatrix && layerMatrix) {
        try {
          const matrix = layerMatrix.inverse().multiply(sourceMatrix);
          if ([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(finite))
            target.setAttribute('transform', `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);
          else target.removeAttribute('transform');
        } catch { target.removeAttribute('transform'); }
      }
      let opacity = 1, moving = false;
      for (let parent: Element | null = source.parentElement; parent && parent !== source.ownerSVGElement; parent = parent.parentElement) {
        opacity *= Number(getComputedStyle(parent).opacity) || 0;
        moving ||= parent.getAnimations().some(animation => animation.playState === 'running' || animation.pending);
      }
      target.style.opacity = String(opacity);
      if (moving && repeat) frame = requestAnimationFrame(() => update(true));
    };
    update(false);
    // Motion starts in its ordinary effect, after this layout pass. One frame
    // observes that start; subsequent frames are needed only while it moves.
    frame = requestAnimationFrame(() => update(true));
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [space.controlsLayer, controls.scopeKey, controls.userAction.serial, key]);
}

export function InteractiveDragHandle({ props }: Props) {
  const space = useSpace(), controls = useInteractiveControls();
  const dragging = useRef<{ pointerId: number; scopeKey: string; start: Point; matrix: Matrix;
    inputs: Record<string, number>; element: SVGGElement } | undefined>(undefined);
  const origin = useRef<SVGGElement>(null), visual = useRef<SVGGElement>(null);
  const latest = useRef({ controls, props }); latest.current = { controls, props };
  const xState = props.xField ? controls.states[props.xField] : undefined, yState = props.yField ? controls.states[props.yField] : undefined;
  const x = xState?.kind === 'number' ? controls.inputs[props.xField] as number : Math.max(space.domain.xMin, Math.min(space.domain.xMax, 0));
  const y = yState?.kind === 'number' ? controls.inputs[props.yField] as number : Math.max(space.domain.yMin, Math.min(space.domain.yMax, 0));
  const point = space.point(x, y, space.matrix), disabled = controls.disabled || props.disabled;
  const single = xState?.kind === 'number' && yState?.kind !== 'number' ? { field: props.xField, state: xState, value: x, x: x + 1, y }
    : yState?.kind === 'number' && xState?.kind !== 'number' ? { field: props.yField, state: yState, value: y, x, y: y + 1 } : undefined;
  const axisPoint = single ? space.point(single.x, single.y, space.matrix) : undefined;
  const vertical = !!(point && axisPoint && Math.abs(axisPoint.y - point.y) > Math.abs(axisPoint.x - point.x));
  const increaseKey = point && axisPoint ? vertical ? axisPoint.y < point.y ? 'ArrowUp' : 'ArrowDown'
    : axisPoint.x < point.x ? 'ArrowLeft' : 'ArrowRight' : undefined;
  const decreaseKey = increaseKey === 'ArrowUp' ? 'ArrowDown' : increaseKey === 'ArrowDown' ? 'ArrowUp'
    : increaseKey === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
  useGraphicOverlay(space, origin, visual, `${point?.x}:${point?.y}`);
  const finish = (restore: boolean) => {
    const active = dragging.current;
    if (!active) return;
    dragging.current = undefined;
    if (active.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
    const current = latest.current;
    if (restore && active.scopeKey === current.controls.scopeKey && !current.controls.disabled)
      current.controls.patch(active.inputs, 'manual', current.props.id, current.props.label);
  };
  useEffect(() => {
    const blur = () => finish(true), hidden = () => { if (document.hidden) finish(true); };
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden);
    return () => { finish(false); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); };
  }, [controls.scopeKey, props.xField, props.yField]);
  useEffect(() => { if (disabled) finish(false); }, [disabled]);
  if (!point) return gap();
  const change = (event: PointerEvent<SVGGElement>) => {
    const active = dragging.current;
    if (!active) return;
    // A group may itself read the field being dragged. Keep the grab's
    // coordinate frame so its new transform cannot subtract the last move.
    const at = space.pointer(event, active.matrix); if (!at) return;
    const patch: Record<string, number> = {};
    if (xState?.kind === 'number') patch[props.xField] = snapProgramNumber(active.inputs[props.xField] + at.x - active.start.x, xState);
    if (yState?.kind === 'number') patch[props.yField] = snapProgramNumber(active.inputs[props.yField] + at.y - active.start.y, yState);
    controls.patch(patch, 'manual', props.id, props.label);
  };
  const key = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Escape' && dragging.current) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
    if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    finish(false);
    const patch: Record<string, number> = {}, multiplier = event.shiftKey ? 10 : 1;
    if (single && increaseKey) {
      if (!['Home', 'End', increaseKey, decreaseKey].includes(event.key)) return;
      patch[single.field] = snapProgramNumber(event.key === 'Home' ? single.state.min : event.key === 'End' ? single.state.max
        : single.value + (event.key === increaseKey ? 1 : -1) * (single.state.step ?? (single.state.max - single.state.min) / 100) * multiplier, single.state);
      controls.patch(patch, 'manual', props.id, props.label); return;
    }
    if (xState?.kind === 'number' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      patch[props.xField] = snapProgramNumber(event.key === 'Home' ? xState.min : event.key === 'End' ? xState.max
        : x + (event.key === 'ArrowLeft' ? -1 : 1) * (xState.step ?? (xState.max - xState.min) / 100) * multiplier, xState);
    if (yState?.kind === 'number' && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
      patch[props.yField] = snapProgramNumber(event.key === 'Home' ? yState.min : event.key === 'End' ? yState.max
        : y + (event.key === 'ArrowUp' !== space.down ? 1 : -1) * (yState.step ?? (yState.max - yState.min) / 100) * multiplier, yState);
    controls.patch(patch, 'manual', props.id, props.label);
  };
  const handle = <g data-program-node={props.id} className={`interactive-drag-handle tone-${props.color}`} role="slider" tabIndex={disabled ? -1 : 0}
    aria-label={props.label} aria-disabled={disabled} aria-valuenow={xState?.kind === 'number' ? x : y}
    aria-orientation={single ? vertical ? 'vertical' : 'horizontal' : undefined}
    aria-valuemin={xState?.kind === 'number' ? xState.min : yState?.kind === 'number' ? yState.min : undefined}
    aria-valuemax={xState?.kind === 'number' ? xState.max : yState?.kind === 'number' ? yState.max : undefined}
    aria-valuetext={[xState ? `x ${display(x)}` : '', yState ? `y ${display(y)}` : ''].filter(Boolean).join('，')}
    onKeyDown={key} onPointerDown={event => {
      if (disabled || event.button !== 0 || dragging.current) return;
      event.preventDefault(); event.stopPropagation(); controls.stopMotions();
      const at = space.pointer(event, space.matrix); if (!at) return;
      const inputs: Record<string, number> = {};
      if (xState?.kind === 'number') inputs[props.xField] = x;
      if (yState?.kind === 'number') inputs[props.yField] = y;
      dragging.current = { pointerId: event.pointerId, scopeKey: controls.scopeKey, start: at,
        matrix: [...space.matrix], inputs, element: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true });
    }} onPointerMove={event => { if (dragging.current?.pointerId === event.pointerId && !disabled) { event.preventDefault(); change(event); } }}
    onPointerUp={event => { if (dragging.current?.pointerId === event.pointerId) finish(false); }}
    onPointerCancel={event => { if (dragging.current?.pointerId === event.pointerId) finish(true); }}
    onLostPointerCapture={event => { if (dragging.current?.pointerId === event.pointerId) finish(true); }} onBlur={() => finish(true)}>
    <title>{props.label}；拖动或用方向键移动，Shift加快</title>
    <circle className="interactive-handle-target" cx={point.x} cy={point.y} r={Math.max(15, props.radius + 8)} />
    <circle className="interactive-handle-point" cx={point.x} cy={point.y} r={props.radius} />
  </g>;
  // Keep the original footprint so a Motion using transform-box:fill-box has
  // the same centre even when this is its only visible control.
  return <><g ref={origin} aria-hidden="true" pointerEvents="none">
    <circle cx={point.x} cy={point.y} r={Math.max(15, props.radius + 8)} opacity={0} />
  </g>{space.controlsLayer
    ? createPortal(<g ref={visual}>{handle}</g>, space.controlsLayer) : null}</>;
}
