import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useSpringValue } from './motion/use-spring';
import './companion-d01-motion.css';

type Point = readonly [number, number];

/** A local projection of an already checked owner address. Neither the text
 * nor a new source/permission is carried by this visual channel. */
export interface CompanionD01Target {
  key: string;
  slot: 'A' | 'B';
  resolve: (signal: AbortSignal) => DOMRectReadOnly | null | Promise<DOMRectReadOnly | null>;
}

/** All paths and joints are in the approved mother's original pixel space.
 * The image registry owns the URLs and the exact compatible mother. */
export interface CompanionD01Rig {
  id: string;
  width: number;
  height: number;
  source: string;
  cleanPlate: string;
  arm: {
    erasePath: string;
    upperPath: string;
    forearmPath: string;
    shoulder: Point;
    elbow: Point;
    wrist: Point;
    sourcePose?: { image: string; shoulder: Point; elbow: Point; wrist: Point };
    foregroundPath?: string;
    foregroundSource?: string;
    foregroundRestorePath?: string;
  };
  eyes: {
    cleanPlate: string;
    apertures: readonly { path: string; irisPath: string; center: Point }[];
    travel: Point;
  };
  head?: {
    background: string;
    erasePath: string;
    path: string;
    pivot: Point;
    foregroundPath?: string;
    maxTilt?: number;
  };
}

export interface CompanionD01MotionProps {
  rig: CompanionD01Rig;
  targets?: readonly CompanionD01Target[];
  focusSlot?: 'A' | 'B' | 'relation';
  yieldToInput?: boolean;
  hidden?: boolean;
  reducedMotion?: boolean;
  canvasRef?: RefObject<HTMLElement | null>;
  geometryKey?: string | number;
  onReadyChange?: (ready: boolean) => void;
  onAssetError?: () => void;
}

const emptyTargets: readonly CompanionD01Target[] = [];
const degrees = (radians: number) => radians * 180 / Math.PI;
const angle = (a: Point, b: Point) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));
const nearestAngle = (value: number, reference: number) => value + Math.round((reference - value) / (2 * Math.PI)) * 2 * Math.PI;
const rotate = (point: Point, pivot: Point, radians: number): Point => [
  pivot[0] + Math.cos(radians) * (point[0] - pivot[0]) - Math.sin(radians) * (point[1] - pivot[1]),
  pivot[1] + Math.sin(radians) * (point[0] - pivot[0]) + Math.cos(radians) * (point[1] - pivot[1]),
];

/** Two connected source sections, with the original elbow bend retained.
 * Only the wrist's small gesture space changes; the shoulder never travels. */
function armAngles(rig: CompanionD01Rig, target: Point): Point {
  const { shoulder, elbow, wrist } = rig.arm;
  const upper = distance(shoulder, elbow), lower = distance(elbow, wrist);
  const dx = target[0] - wrist[0], dy = target[1] - wrist[1], direction = Math.max(1, Math.hypot(dx, dy));
  const reach = upper + lower;
  const next: Point = [wrist[0] + dx / direction * reach * .26,
    wrist[1] + dy / direction * reach * .12 - reach * .18];
  const length = clamp(distance(shoulder, next), Math.abs(upper - lower) + .5, reach - .5);
  const toward = angle(shoulder, next);
  const cross = (elbow[0] - shoulder[0]) * (wrist[1] - elbow[1])
    - (elbow[1] - shoulder[1]) * (wrist[0] - elbow[0]);
  const bend = cross <= 0 ? 1 : -1;
  const first = toward + bend * Math.acos(clamp((length * length + upper * upper - lower * lower) / (2 * length * upper), -1, 1));
  const joint: Point = [shoulder[0] + Math.cos(first) * upper, shoulder[1] + Math.sin(first) * upper];
  const end: Point = [shoulder[0] + Math.cos(toward) * length, shoulder[1] + Math.sin(toward) * length];
  return [nearestAngle(first, angle(shoulder, elbow)), nearestAngle(angle(joint, end), angle(elbow, wrist))];
}

/** The existing scene supplies the one body/root transform. This overlay only
 * owns the right-arm sections and eye contents, using approved source pixels. */
export function CompanionD01Motion({ rig, targets = emptyTargets, focusSlot, yieldToInput = false,
  hidden = false, reducedMotion = false, canvasRef, geometryKey, onReadyChange, onAssetError }: CompanionD01MotionProps) {
  const svg = useRef<SVGSVGElement>(null), id = useId().replace(/:/g, '');
  const assetKey = [rig.id, rig.source, rig.cleanPlate, rig.eyes.cleanPlate, rig.head?.background,
    rig.arm.sourcePose?.image, rig.arm.foregroundSource, rig.width, rig.height].join('|');
  const [loadedAsset, setLoadedAsset] = useState<string>(), [pageHidden, setPageHidden] = useState(document.hidden);
  const ready = loadedAsset === assetKey;
  const [resolved, setResolved] = useState<{ key: string; slot: 'A' | 'B'; point: Point }[]>([]);
  const [rects, setRects] = useState<{ key: string; slot: 'A' | 'B'; rect: DOMRectReadOnly }[]>([]);
  const [backgroundTransform, setBackgroundTransform] = useState<string>();
  const assetError = useRef(onAssetError);
  assetError.current = onAssetError;
  const request = useRef(0);
  const restUpper = angle(rig.arm.shoulder, rig.arm.elbow), restLower = angle(rig.arm.elbow, rig.arm.wrist);
  const upper = useSpringValue(restUpper, { stiffness: 420, damping: 40, precision: .0002 });
  const lower = useSpringValue(restLower, { stiffness: 420, damping: 40, precision: .0002 });
  const eyeX = useSpringValue(0, { stiffness: 560, damping: 45, precision: .005 });
  const eyeY = useSpringValue(0, { stiffness: 560, damping: 45, precision: .005 });
  const head = useSpringValue(0, { stiffness: 180, damping: 28, precision: .0002 });

  useEffect(() => {
    let cancelled = false;
    setLoadedAsset(undefined);
    const urls = [...new Set([rig.source, rig.cleanPlate, rig.eyes.cleanPlate, rig.head?.background, rig.arm.sourcePose?.image, rig.arm.foregroundSource]
      .filter((url): url is string => !!url))];
    void Promise.all(urls.map(async url => {
      const image = new Image(); image.src = url;
      await image.decode();
      if (image.naturalWidth !== rig.width || image.naturalHeight !== rig.height)
        throw new Error('incompatible_mother_canvas');
    })).then(() => { if (!cancelled) setLoadedAsset(assetKey); }, () => {
      if (!cancelled) { setLoadedAsset(undefined); assetError.current?.(); }
    });
    return () => { cancelled = true; };
  }, [assetKey, rig.source, rig.cleanPlate, rig.eyes.cleanPlate, rig.head?.background, rig.arm.sourcePose?.image, rig.arm.foregroundSource, rig.width, rig.height]);
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);

  useLayoutEffect(() => {
    let controller: AbortController | undefined, frame = 0;
    const measure = () => {
      controller?.abort();
      const current = ++request.current;
      setRects([]); setResolved([]);
      if (!ready || hidden || document.hidden || yieldToInput || !svg.current || !targets.length) return;
      controller = new AbortController();
      const signal = controller.signal;
      void Promise.all(targets.slice(0, 2).map(async target => {
        let rect: DOMRectReadOnly | null;
        try { rect = await target.resolve(signal); }
        catch { return; }
        if (signal.aborted || !rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
          || rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.right < 0
          || rect.top > window.innerHeight || rect.left > window.innerWidth) return;
        return { key: target.key, slot: target.slot, rect };
      })).then(values => {
        if (!signal.aborted && request.current === current)
          setRects(values.filter((value): value is NonNullable<typeof value> => !!value));
      }).catch(() => { if (!signal.aborted && request.current === current) { setRects([]); setResolved([]); } });
    };
    const schedule = () => {
      controller?.abort(); ++request.current; setRects([]); setResolved([]);
      cancelAnimationFrame(frame); frame = requestAnimationFrame(measure);
    };
    const visibility = () => { setPageHidden(document.hidden); measure(); };
    const observer = new ResizeObserver(schedule);
    if (svg.current?.parentElement) observer.observe(svg.current.parentElement);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule); document.addEventListener('visibilitychange', visibility);
    measure();
    return () => {
      controller?.abort(); ++request.current; cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [rig.id, rig.width, rig.height, ready, targets, hidden, yieldToInput, canvasRef]);

  useLayoutEffect(() => {
    const local = svg.current?.getScreenCTM(), canvas = canvasRef?.current?.getBoundingClientRect();
    if (!local) { setResolved([]); setBackgroundTransform(undefined); return; }
    // Chromium can expose the legacy SVGMatrix here. Its multiply() only
    // accepts another SVGMatrix, so normalize before using DOMMatrix values.
    let inverse: DOMMatrix;
    try {
      const matrix = new DOMMatrix([local.a, local.b, local.c, local.d, local.e, local.f]);
      inverse = matrix.inverse();
      if (![inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f].every(Number.isFinite)) {
        setResolved([]); setBackgroundTransform(undefined); return;
      }
    } catch {
      setResolved([]); setBackgroundTransform(undefined); return;
    }
    if (canvas?.width && canvas.height) {
      // Only reproject already-qualified rectangles during room/actor motion.
      // No source body, hash or model request is read for an animation frame.
      const room = new DOMMatrix([canvas.width / rig.width, 0, 0, canvas.height / rig.height, canvas.x, canvas.y]);
      const matrix = inverse.multiply(room);
      setBackgroundTransform([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)
        ? `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})` : undefined);
    } else setBackgroundTransform(undefined);
    if (!ready || hidden || pageHidden || yieldToInput) { setResolved([]); return; }
    setResolved(rects.flatMap(({ key, slot, rect }) => {
      if (!targets.some(target => target.key === key)) return [];
      const point = new DOMPoint(clamp(rect.x + rect.width / 2, 0, window.innerWidth),
        clamp(rect.y + rect.height / 2, 0, window.innerHeight)).matrixTransform(inverse);
      return [point.x, point.y].every(Number.isFinite) ? [{ key, slot, point: [point.x, point.y] as Point }] : [];
    }));
  }, [rects, geometryKey, rig.width, rig.height, canvasRef, targets, ready, hidden, pageHidden, yieldToInput]);

  const current = resolved.filter(point => targets.some(target => target.key === point.key));
  const selected = focusSlot === 'relation'
    ? current.length === 2 ? [(current[0].point[0] + current[1].point[0]) / 2,
      (current[0].point[1] + current[1].point[1]) / 2] as Point : undefined
    : (current.find(point => point.slot === (focusSlot || 'B')) || (!focusSlot ? current[0] : undefined))?.point;
  const attending = ready && !hidden && !pageHidden && !yieldToInput && !!selected;
  const [wantedUpper, wantedLower] = attending ? armAngles(rig, selected!) : [restUpper, restLower];
  const eyeCenter: Point = rig.eyes.apertures.length ? [
    rig.eyes.apertures.reduce((sum, eye) => sum + eye.center[0], 0) / rig.eyes.apertures.length,
    rig.eyes.apertures.reduce((sum, eye) => sum + eye.center[1], 0) / rig.eyes.apertures.length,
  ] : rig.arm.shoulder;
  const wantedEyeX = attending ? clamp((selected![0] - eyeCenter[0]) / 280, -1, 1) * rig.eyes.travel[0] : 0;
  // Use the direction to the page rather than saturating on a distant page's
  // vertical offset; neighbouring lines must still have distinct gaze targets.
  const pitch = attending ? clamp(Math.atan2(selected![1] - eyeCenter[1],
    Math.max(120, Math.abs(selected![0] - eyeCenter[0]))) / .4, -1, 1) : 0;
  const wantedEyeY = pitch * rig.eyes.travel[1];
  const wantedHead = rig.head && attending ? pitch * Math.sign(selected![0] - eyeCenter[0])
    * (rig.head.maxTilt ?? 1.2) * Math.PI / 180 : 0;
  useLayoutEffect(() => {
    const immediate = hidden || pageHidden || reducedMotion;
    if (immediate) {
      upper.set(wantedUpper); lower.set(wantedLower); eyeX.set(wantedEyeX); eyeY.set(wantedEyeY); head.set(wantedHead);
    } else {
      upper.animate(wantedUpper); lower.animate(wantedLower); eyeX.animate(wantedEyeX); eyeY.animate(wantedEyeY); head.animate(wantedHead);
    }
  }, [wantedUpper, wantedLower, wantedEyeX, wantedEyeY, wantedHead, hidden, pageHidden, reducedMotion,
    upper.set, upper.animate, lower.set, lower.animate, eyeX.set, eyeX.animate, eyeY.set, eyeY.animate, head.set, head.animate]);

  const elbow = rotate(rig.arm.elbow, rig.arm.shoulder, upper.value - restUpper);
  const sourceArm = rig.arm.sourcePose || { image: rig.source, shoulder: rig.arm.shoulder, elbow: rig.arm.elbow, wrist: rig.arm.wrist };
  const upperScale = distance(rig.arm.shoulder, rig.arm.elbow) / Math.max(1, distance(sourceArm.shoulder, sourceArm.elbow));
  const lowerScale = distance(rig.arm.elbow, rig.arm.wrist) / Math.max(1, distance(sourceArm.elbow, sourceArm.wrist));
  const upperTransform = `translate(${rig.arm.shoulder.join(' ')}) rotate(${degrees(upper.value - angle(sourceArm.shoulder, sourceArm.elbow))}) scale(${upperScale}) translate(${-sourceArm.shoulder[0]} ${-sourceArm.shoulder[1]})`;
  const lowerTransform = `translate(${elbow[0]} ${elbow[1]}) rotate(${degrees(lower.value - angle(sourceArm.elbow, sourceArm.wrist))}) scale(${lowerScale}) translate(${-sourceArm.elbow[0]} ${-sourceArm.elbow[1]})`;
  // Keep the SVG mounted while images decode so its screen transform is ready.
  // Failed assets expose the original static actor underneath, without a
  // replacement character or a made-up gesture.
  return <svg ref={svg} className="companion-d01-motion" width={rig.width} height={rig.height}
    viewBox={`0 0 ${rig.width} ${rig.height}`} aria-hidden="true" focusable="false"
    data-d01-rig={rig.id} data-d01-ready={ready} data-d01-state={hidden || pageHidden ? 'hidden' : yieldToInput ? 'yield' : attending ? 'attend' : 'neutral'}>
    <defs>
      <clipPath id={`${id}-erase`}><path d={rig.arm.erasePath} /></clipPath>
      <clipPath id={`${id}-upper`}><path d={rig.arm.upperPath} /></clipPath>
      <clipPath id={`${id}-forearm`}><path d={rig.arm.forearmPath} /></clipPath>
      {rig.arm.foregroundPath && <clipPath id={`${id}-foreground`}><path d={rig.arm.foregroundPath} /></clipPath>}
      {rig.arm.foregroundRestorePath && <clipPath id={`${id}-foreground-restore`}><path d={rig.arm.foregroundRestorePath} /></clipPath>}
      {rig.head && <>
        <clipPath id={`${id}-head-erase`}><path d={rig.head.erasePath} /></clipPath>
        <clipPath id={`${id}-head`}><path d={rig.head.path} /></clipPath>
        {rig.head.foregroundPath && <clipPath id={`${id}-collar`}><path d={rig.head.foregroundPath} /></clipPath>}
      </>}
      {rig.eyes.apertures.map((eye, index) => <g key={index}>
        <clipPath id={`${id}-eye-${index}`}><path d={eye.path} /></clipPath>
        <clipPath id={`${id}-iris-${index}`}><path d={eye.irisPath} /></clipPath>
      </g>)}
    </defs>
    {ready && <g>
      <image href={rig.cleanPlate} width={rig.width} height={rig.height} clipPath={`url(#${id}-erase)`} />
      {rig.head && <g clipPath={`url(#${id}-head-erase)`}>
        <image href={rig.head.background} width={rig.width} height={rig.height} transform={backgroundTransform} />
      </g>}
      <g transform={upperTransform}><image href={sourceArm.image} width={rig.width} height={rig.height} clipPath={`url(#${id}-upper)`} /></g>
      <g transform={lowerTransform}><image href={sourceArm.image} width={rig.width} height={rig.height} clipPath={`url(#${id}-forearm)`} /></g>
      {rig.arm.foregroundPath && <image href={rig.arm.foregroundSource || rig.source} width={rig.width} height={rig.height} clipPath={`url(#${id}-foreground)`} />}
      {rig.arm.foregroundRestorePath && <image href={rig.source} width={rig.width} height={rig.height} clipPath={`url(#${id}-foreground-restore)`} />}
      <g transform={rig.head ? `rotate(${degrees(head.value)} ${rig.head.pivot.join(' ')})` : undefined}>
        {rig.head && <image href={rig.source} width={rig.width} height={rig.height} clipPath={`url(#${id}-head)`} />}
        {rig.eyes.apertures.map((eye, index) => <g key={index} clipPath={`url(#${id}-eye-${index})`}>
          <image href={rig.eyes.cleanPlate} width={rig.width} height={rig.height} />
          <g transform={`translate(${eyeX.value} ${eyeY.value})`}>
            <image href={rig.source} width={rig.width} height={rig.height} clipPath={`url(#${id}-iris-${index})`} />
          </g>
        </g>)}
      </g>
      {rig.head?.foregroundPath && <image href={rig.source} width={rig.width} height={rig.height} clipPath={`url(#${id}-collar)`} />}
    </g>}
  </svg>;
}
