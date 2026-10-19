import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { explorableQuadraticTex, formatExplorableNumber, initialExplorableValues, projectExplorableStudy,
  sameExplorableValue, snapExplorableValue, type ExplorableStudySpec, type ExplorableStudyValues } from '../../shared/explorable-study';
import { RichText } from '../RichText';
import './explorable-study.css';

interface Props {
  spec: ExplorableStudySpec;
  disabled?: boolean;
  onContinue: (values: ExplorableStudyValues) => void | Promise<void>;
}
type Range = { min: number; max: number; step: number };

/** Drag a number in the sentence, or open its small native numeric editor.
 * This is a temporary condition, never another chat editor or save action. */
function AdjustableNumber({ value, range, label, onChange, disabled }: { value: number; range: Range; label: string;
  onChange: (value: number) => void; disabled?: boolean }) {
  const button = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: number; x: number; value: number; moved: boolean } | undefined>(undefined);
  const closing = useRef(false);
  const [editing, edit] = useState(false), [text, setText] = useState(String(value));
  useEffect(() => { if (editing) { setText(String(value)); input.current?.select(); } }, [editing]);
  const change = (next: number) => onChange(snapExplorableValue(next, range));
  const commit = () => {
    if (closing.current) return;
    closing.current = true;
    if (text.trim() && Number.isFinite(Number(text))) change(Number(text));
    edit(false);
  };
  const openEditor = () => { closing.current = false; edit(true); };
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      change(event.key === 'Home' ? range.min : event.key === 'End' ? range.max
        : value + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) * range.step);
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); openEditor(); }
  };
  return <span className="explorable-number-wrap">
    <button ref={button} type="button" className="explorable-number" role="spinbutton" aria-label={label} disabled={disabled}
      aria-valuemin={range.min} aria-valuemax={range.max} aria-valuenow={value}
      title="左右轻拖、用方向键，或点一下输入数值" onKeyDown={key}
      onPointerDown={event => {
        if (event.button !== 0 || editing || disabled) return;
        drag.current = { id: event.pointerId, x: event.clientX, value, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId || disabled) return;
        if (Math.abs(event.clientX - current.x) > 3) current.moved = true;
        if (current.moved) { event.preventDefault(); change(current.value + (event.clientX - current.x) / 5 * range.step); }
      }} onPointerUp={event => {
        const current = drag.current; drag.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (current && !current.moved) openEditor();
      }} onPointerCancel={() => { drag.current = undefined; }}>{formatExplorableNumber(value)}</button>
    {editing && <input ref={input} autoFocus className="explorable-number-input" type="number" min={range.min} max={range.max} disabled={disabled}
      step={range.step} value={text} aria-label={label} onChange={event => setText(event.currentTarget.value)} onBlur={commit}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Enter') { event.preventDefault(); commit(); button.current?.focus({ preventScroll: true }); }
        if (event.key === 'Escape') { event.preventDefault(); closing.current = true; edit(false); button.current?.focus({ preventScroll: true }); }
      }} />}
  </span>;
}

function ticks(min: number, max: number) {
  const raw = (max - min) / 5, power = 10 ** Math.floor(Math.log10(raw)), size = raw / power;
  const step = (size <= 1 ? 1 : size <= 2 ? 2 : size <= 5 ? 5 : 10) * power;
  const first = Math.ceil(min / step) * step;
  return Array.from({ length: Math.min(12, Math.floor((max - first) / step + 1e-8) + 1) }, (_, index) => Number((first + index * step).toPrecision(10)));
}

/** One authored relation in the current Study step. No code, model call,
 * persistent learner state or authority is created by manipulating this view. */
export function ExplorableStudyView({ spec, disabled, onContinue }: Props) {
  const [values, setValues] = useState<ExplorableStudyValues>(() => initialExplorableValues(spec));
  const drag = useRef<number | undefined>(undefined);
  const id = useId().replace(/:/g, ''), titleId = `${id}-title`, clipId = `${id}-clip`;
  const projection = useMemo(() => {
    try { return projectExplorableStudy(spec, values); } catch { return undefined; }
  }, [spec, values]);
  const width = 520, height = 250, left = 40, right = 18, top = 16, bottom = 29;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const px = (x: number) => left + (x - spec.x.min) / (spec.x.max - spec.x.min) * plotWidth;
  const py = (y: number) => top + (spec.y.max - y) / (spec.y.max - spec.y.min) * plotHeight;
  // Plot clipping hides off-screen geometry without changing its slope.
  const path = (points: { x: number; y: number }[]) => points.map((point, index) =>
    `${index ? 'L' : 'M'}${px(point.x).toFixed(2)},${py(point.y).toFixed(2)}`).join(' ');
  const axisY = py(Math.max(spec.y.min, Math.min(spec.y.max, 0))), axisX = px(Math.max(spec.x.min, Math.min(spec.x.max, 0)));
  const setX = (x: number) => setValues(current => ({ ...current, x: snapExplorableValue(x, spec.x) }));
  const pointerX = (event: PointerEvent<SVGSVGElement>) => {
    const rectangle = event.currentTarget.getBoundingClientRect();
    return spec.x.min + ((event.clientX - rectangle.left) / rectangle.width * width - left) / plotWidth * (spec.x.max - spec.x.min);
  };
  const pointKey = (event: KeyboardEvent<SVGGElement>) => {
    if (disabled) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    setX(event.key === 'Home' ? spec.x.min : event.key === 'End' ? spec.x.max : values.x + (event.key === 'ArrowLeft' ? -1 : 1) * spec.x.step);
  };
  const reading = projection?.observation.current;
  const changed = !sameExplorableValue(values.x, spec.x.initial, spec.x)
    || spec.parameters.some(parameter => !sameExplorableValue(values.parameters[parameter.id], parameter.initial, parameter));
  const slopeText = reading?.slope === undefined ? '' : reading.slope === 0 ? '切线在这里水平。'
    : Math.abs(reading.slope) < .001 ? '切线在这里几乎水平。' : reading.slope > 0 ? '切线向右上倾。' : '切线向右下倾。';
  return <div className="explorable-study">
    {spec.relationship === 'illustrative_example' && <p className="explorable-example-note">先用这一小段关系看，原题仍留在左页。</p>}
    <div className="explorable-formula"><RichText text={`\\(${explorableQuadraticTex(spec)}\\)`} /></div>
    <p className="explorable-condition">{spec.parameters.length > 0 && <>试着让 {spec.parameters.map((parameter, index) => <span key={parameter.id}>
      {index > 0 ? '，' : ''}<i title={parameter.label}>{parameter.id}</i> = <AdjustableNumber value={values.parameters[parameter.id]} disabled={disabled}
        range={parameter} label={`${parameter.label} ${parameter.id}`} onChange={value => setValues(current => ({ ...current,
          parameters: { ...current.parameters, [parameter.id]: value } }))} />
    </span>)}，</>}在 <i>x</i> = <AdjustableNumber value={values.x} range={spec.x} label="观察点的横坐标 x" onChange={setX} disabled={disabled} /> 这一点看。</p>
    {projection && reading ? <>
      <svg className="explorable-graph" viewBox={`0 0 ${width} ${height}`} role="group" aria-labelledby={titleId}
        onPointerDown={event => {
          if (disabled || event.button !== 0 || !(event.target as Element).closest('[data-exploration-probe]')) return;
          event.preventDefault(); drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); setX(pointerX(event));
        }} onPointerMove={event => { if (!disabled && drag.current === event.pointerId) { event.preventDefault(); setX(pointerX(event)); } }}
        onPointerUp={event => { if (drag.current === event.pointerId) { drag.current = undefined; event.currentTarget.releasePointerCapture(event.pointerId); } }}
        onPointerCancel={() => { drag.current = undefined; }}>
        <title id={titleId}>同一个点的纵坐标{spec.showSlope ? '与切线斜率' : ''}；可左右拖动观察点。</title>
        <defs><clipPath id={clipId}><rect x={left} y={top} width={plotWidth} height={plotHeight} /></clipPath></defs>
        <g className="explorable-grid">{ticks(spec.y.min, spec.y.max).map(value => <line key={value} x1={left} x2={width - right} y1={py(value)} y2={py(value)} />)}</g>
        <g className="explorable-axes"><line x1={left} x2={width - right + 4} y1={axisY} y2={axisY} />
          <line x1={axisX} x2={axisX} y1={height - bottom + 4} y2={top - 4} />
          {ticks(spec.x.min, spec.x.max).map(value => <g key={value}><line x1={px(value)} x2={px(value)} y1={axisY - 3} y2={axisY + 3} />
            <text x={px(value)} y={axisY + 17} textAnchor="middle">{formatExplorableNumber(value)}</text></g>)}
          {ticks(spec.y.min, spec.y.max).filter(value => value !== 0).map(value => <g key={value}><line x1={axisX - 3} x2={axisX + 3} y1={py(value)} y2={py(value)} />
            <text x={axisX - 7} y={py(value) + 3.5} textAnchor="end">{formatExplorableNumber(value)}</text></g>)}
          <text x={width - right + 8} y={axisY + 4} className="explorable-axis-name">x</text>
          <text x={axisX + 8} y={top + 2} className="explorable-axis-name">f(x)</text>
        </g>
        <g clipPath={`url(#${clipId})`}>
          {projection.originalCurve && <path className="explorable-original-curve" d={path(projection.originalCurve)} />}
          <path className="explorable-curve" d={path(projection.curve)} />
          {projection.pointVisible && <>
            <line className="explorable-height" x1={px(values.x)} x2={px(values.x)} y1={axisY} y2={py(reading.value)} />
            {projection.tangent && <path className="explorable-tangent" d={path(projection.tangent)} />}
          </>}
        </g>
        <g className="explorable-probe" data-exploration-probe="true" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label="图上的观察点 x"
          aria-valuemin={spec.x.min} aria-valuemax={spec.x.max} aria-valuenow={values.x} onKeyDown={pointKey}>
          <circle className="explorable-probe-hit" cx={px(values.x)} cy={axisY} r={14} />
          <circle className="explorable-axis-probe" cx={px(values.x)} cy={axisY} r={2.4} />
          {projection.pointVisible && <><circle className="explorable-probe-hit" cx={px(values.x)} cy={py(reading.value)} r={15} />
            <circle className="explorable-point" cx={px(values.x)} cy={py(reading.value)} r={5} />
            <text className="explorable-point-label" x={px(values.x) + (px(values.x) > width - right - 78 ? -9 : 9)}
              y={py(reading.value) < top + 18 ? py(reading.value) + 19 : py(reading.value) - 10}
              textAnchor={px(values.x) > width - right - 78 ? 'end' : 'start'}>({formatExplorableNumber(values.x)}, {formatExplorableNumber(reading.value)})</text></>}
        </g>
      </svg>
      {projection.originalCurve && <p className="explorable-original-note">浅虚线是原来的条件。</p>}
      {!projection.pointVisible && <p className="explorable-outside">这一点在当前画面之外，下面仍按这个关系计算。</p>}
      <div className="explorable-reading"><p>这一点的高度是 <strong>{formatExplorableNumber(reading.value)}</strong>
        {reading.slope !== undefined && <>，切线斜率是 <strong>{formatExplorableNumber(reading.slope)}</strong></>}。
        {projection.observation.changeExplanation || slopeText}</p>
        <button type="button" className="explorable-continue" disabled={disabled} onClick={() => void onContinue(values)}>接着这个变化问<ArrowUpRight size={13} aria-hidden="true" /></button>
      </div>
    </> : <p className="explorable-outside">这组条件暂时不能画出来；仍可以从当前解释接着问。</p>}
    <div className="explorable-footnote">{changed && <button type="button" disabled={disabled} onClick={() => setValues(initialExplorableValues(spec))}><RotateCcw size={12} aria-hidden="true" />回到原条件</button>}
      <details><summary>用的是什么关系</summary><p>这里只按当前二次关系计算，图上的改动先作为临时条件。
        曲线用有限样本画出，观察点{spec.showSlope ? '与斜率' : ''}直接按这个关系计算；其他关系仍可接着讲解或调查。</p></details></div>
  </div>;
}
