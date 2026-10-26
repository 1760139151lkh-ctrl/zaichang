import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { ComponentRenderProps } from '@openuidev/react-lang';
import { ArrowUpRight, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { snapProgramNumber } from '../../shared/interactive-program';
import { useInteractiveControls } from './interactive-context';
import { InteractiveAudioTrace, useInteractiveAudio, type InteractiveAudioVoice } from './interactive-audio';

const notes = Array.from({ length: 88 }, (_, index) => index + 21);
const black = (note: number) => [1, 3, 6, 8, 10].includes(note % 12);
const noteName = (note: number) => `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12]}${Math.floor(note / 12) - 1}`;
const keys: Record<string, number> = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };
const hotkeys = Object.fromEntries(Object.entries(keys).map(([key, note]) => [note, key])) as Record<number, string>;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const windowFor = (note: number) => { const start = clamp(note - 12, 21, 84); return black(start) ? start - 1 : start; };
const rotate = (x: number, y: number, angle: number, origin: [number, number]): [number, number] =>
  [origin[0] + x * Math.cos(angle) - y * Math.sin(angle), origin[1] + x * Math.sin(angle) + y * Math.cos(angle)];

/** A schematic with shared rigid joints. The two-link jack/wippen meets the
 * hammer knuckle until escapement; after that the hammer follows its own
 * finite flight. The schematic is deliberately not a measured piano model. */
function PianoAction({ phase, held, pedal, note }: { phase: number; held: boolean; pedal: boolean; note: string }) {
  const drive = held ? clamp(phase / .32, 0, 1) : 0;
  const hammerLift = phase < .32 ? held ? phase / .32 * .78 : 0 : phase < .5 ? .78 + (phase - .32) / .18 * .22
    : phase < .78 ? 1 - (phase - .5) / .28 * .75 : held ? .25 : .25 * (1 - phase) / .22;
  const hammerPivot: [number, number] = [435, 152], hammerAngle = -.1 - .46 * hammerLift;
  const hammerHead = rotate(140, 0, hammerAngle, hammerPivot), knuckle = rotate(32, 7, hammerAngle, hammerPivot);
  const hammerTail = rotate(30, 33, hammerAngle, hammerPivot);
  const driveKnuckle = rotate(32, 7, -.1 - .46 * .78 * drive, hammerPivot);
  const jackTop: [number, number] = [driveKnuckle[0], driveKnuckle[1] + 5];
  const wippenPivot: [number, number] = [352, 190], dx = jackTop[0] - wippenPivot[0], dy = jackTop[1] - wippenPivot[1], distance = Math.hypot(dx, dy);
  const along = (70 ** 2 - 54 ** 2 + distance ** 2) / (2 * distance), normal = Math.sqrt(Math.max(0, 70 ** 2 - along ** 2));
  const elbow: [number, number] = [352 + along * dx / distance - normal * dy / distance,
    190 + along * dy / distance + normal * dx / distance];
  const wippenAngle = Math.atan2(elbow[1] - 190, elbow[0] - 352);
  const capstanTop = rotate(35, 0, wippenAngle, wippenPivot), capstanBottom: [number, number] = [capstanTop[0], capstanTop[1] + 29];
  const keyPivot: [number, number] = [190, 218], keyAngle = Math.atan2(capstanBottom[1] - 218, capstanBottom[0] - 190);
  const detached = phase >= .32 && (held || phase < 1);
  const jackTip: [number, number] = detached ? rotate(jackTop[0] - elbow[0], jackTop[1] - elbow[1],
    .18 * clamp((phase - .32) / .06, 0, 1), elbow) : jackTop;
  const keyFront = rotate(-138, 0, keyAngle, keyPivot), keyBack = rotate(212, 0, keyAngle, keyPivot);
  const backcheck = rotate(282, -33, keyAngle, keyPivot);
  const damperLift = held || pedal ? 15 : 0;
  const stage = phase === 0 ? '' : phase < .32 ? '顶杆推动琴槌' : phase < .5 ? '顶杆让开，琴槌继续前行'
    : phase < .78 ? '琴槌击弦后回弹' : held ? '接木接住回落的琴槌' : pedal ? '琴槌回位，琴弦仍可振动' : '制音器落回琴弦';
  return <figure className="interactive-piano-action">
    <svg viewBox="0 0 760 270" role="img" aria-label={`${note}三角钢琴机构：${stage || '等待按键'}`}>
      <line x1="40" y1="244" x2="724" y2="244" className="piano-floor" />
      <path d="M176 244 L183 219 L197 219 L204 244 M342 244 L345 192 L359 192 L366 244 M424 244 L428 153 L442 153 L449 244"
        className="piano-fixed" />
      <line x1={keyFront[0]} y1={keyFront[1]} x2={keyBack[0]} y2={keyBack[1]} className="piano-key-lever" />
      <line x1={keyFront[0]} y1={keyFront[1] - 4} x2={keyFront[0] + 109} y2={keyFront[1] - 4} className="piano-ivory" />
      <circle cx="190" cy="218" r="4" className="piano-joint" />
      <line x1={capstanBottom[0]} y1={capstanBottom[1]} x2={capstanTop[0]} y2={capstanTop[1]} className="piano-capstan" />
      <line x1="352" y1="190" x2={elbow[0]} y2={elbow[1]} className="piano-wippen" />
      <circle cx="352" cy="190" r="5" className="piano-joint" />
      <line x1={elbow[0]} y1={elbow[1]} x2={jackTip[0]} y2={jackTip[1]} className={`piano-jack${detached ? ' is-detached' : ''}`} />
      <circle cx={elbow[0]} cy={elbow[1]} r="4" className="piano-joint" />
      <line x1="435" y1="152" x2={hammerHead[0]} y2={hammerHead[1]} className="piano-hammer-shank" />
      <circle cx="435" cy="152" r="5" className="piano-joint" />
      <circle cx={knuckle[0]} cy={knuckle[1]} r="5" className="piano-knuckle" />
      <line x1={knuckle[0]} y1={knuckle[1]} x2={hammerTail[0]} y2={hammerTail[1]} className="piano-hammer-tail" />
      <ellipse cx={hammerHead[0]} cy={hammerHead[1]} rx="12" ry="14" className="piano-hammer-head" />
      <line x1={keyBack[0] - 8} y1={keyBack[1]} x2={backcheck[0]} y2={backcheck[1]} className="piano-backcheck" />
      <ellipse cx={backcheck[0]} cy={backcheck[1] + 2} rx="8" ry="3" className="piano-backcheck-felt" />
      <line x1="470" y1="64" x2="718" y2="64" className={`piano-string${phase >= .5 && (held || pedal || phase < .78) ? ' is-ringing' : ''}`} />
      <path d="M687 244 L687 64 L708 64 L718 244" className="piano-bridge" />
      <g transform={`translate(0,${-damperLift})`} className="piano-damper">
        <path d="M636 61 L636 26 L664 26 L664 61 Z" /><path d="M633 61 L667 61" className="piano-damper-felt" />
      </g>
      <line x1="650" y1={26 - damperLift} x2="650" y2="14" className="piano-damper-rod" />
      <g className="piano-part-labels">
        <text x="74" y="193">琴键</text><text x="316" y="170">联动器</text><text x="393" y="138">顶杆</text>
        <text x="544" y="101">琴槌</text><text x="575" y="48">琴弦</text><text x="673" y="27">制音器</text>
        <text x="455" y="209">接木</text>
      </g>
    </svg>
    <figcaption>{stage || '轻轻按下，再松开。'}</figcaption>
  </figure>;
}

interface Strike { began: number; duration: number; velocity: number; hit: boolean }

/** One finite native primitive within the original checked program. It owns
 * only held pointers and a short mechanical flight; all meaningful values
 * are the same $ui record used by persistence and Continue. */
export function InteractivePiano({ props, renderNode }: ComponentRenderProps<Record<string, any>>) {
  const controls = useInteractiveControls(), audio = useInteractiveAudio();
  const current = useRef({ controls, props, audio }); current.current = { controls, props, audio };
  const root = useRef<HTMLDivElement>(null), keyboard = useRef<HTMLDivElement>(null);
  const owners = useRef(new Map<string, number>()), strikes = useRef(new Map<number, Strike>()), triggers = useRef(new Map<number, number>());
  const activations = useRef(new Set<ReturnType<typeof setTimeout>>());
  const frame = useRef<number | undefined>(undefined), visible = useRef(true), pendingRelease = useRef(false);
  const selected = Number(controls.inputs[props.selectedField]), phase = Number(controls.inputs[props.phaseField]);
  const [voiceRevision, setVoiceRevision] = useState(0), [windowStart, setWindowStart] = useState(() => windowFor(selected));
  const held = controls.inputs[props.heldField] as number[], pedal = controls.inputs[props.pedalField] === true;
  const disabled = controls.disabled || props.disabled;
  const frequency = (note: number) => props.tuningHz * 2 ** ((note - 69) / 12) * Math.sqrt(props.tensionRatio / props.densityRatio) / props.lengthRatio;
  const silence = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined; strikes.current.clear();
    for (const note of notes) current.current.audio?.remove(`${current.current.props.id}:note:${note}`);
  };
  const releaseAll = (resetPhase = false) => {
    owners.current.clear(); silence();
    const { controls: next, props: value } = current.current;
    pendingRelease.current = !next.patch({ [value.heldField]: [], [value.pedalField]: false,
      ...(resetPhase ? { [value.phaseField]: 0 } : {}) }, 'control');
    setVoiceRevision(value => value + 1);
  };
  const release = (source: string) => {
    const note = owners.current.get(source);
    if (note === undefined || !owners.current.delete(source)) return;
    const { controls: next, props: value } = current.current;
    next.patch({ [value.heldField]: [...new Set(owners.current.values())].sort((a, b) => a - b) }, 'control');
    const strike = strikes.current.get(note);
    if (strike && !strike.hit && ![...owners.current.values()].includes(note)
      && (performance.now() - strike.began) / strike.duration < .32) {
      strikes.current.delete(note);
      if (Number(next.readInputs()[value.selectedField]) === note) next.patch({ [value.phaseField]: 0 }, 'motion');
    }
  };
  const animate = () => {
    if (frame.current !== undefined) return;
    const tick = (now: number) => {
      frame.current = undefined;
      const { controls: next, props: value } = current.current;
      if (next.disabled || value.disabled || !visible.current || document.hidden) return;
      const preference = document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      const inputs = next.readInputs(), sounding = new Set(inputs[value.heldField] as number[]);
      let changed = false;
      for (const [note, strike] of strikes.current) {
        const progress = preference ? 1 : clamp((now - strike.began) / strike.duration, 0, 1);
        if (!sounding.has(note) && progress < .32) {
          strikes.current.delete(note);
          if (Number(inputs[value.selectedField]) === note) next.patch({ [value.phaseField]: 0 }, 'motion');
          continue;
        }
        if (!strike.hit && progress >= .5) {
          strike.hit = true; triggers.current.set(note, (triggers.current.get(note) || 0) + 1); changed = true;
        }
        if (Number(inputs[value.selectedField]) === note) {
          const state = next.states[value.phaseField];
          if (state?.kind === 'number') next.patch({ [value.phaseField]: snapProgramNumber(progress, state) }, 'motion');
        }
        if (progress === 1) strikes.current.delete(note);
      }
      if (changed) setVoiceRevision(value => value + 1);
      if (strikes.current.size) frame.current = requestAnimationFrame(tick);
      else next.settleMotion([value.phaseField]);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const press = (note: number, source: string) => {
    const { controls: next, props: value } = current.current;
    if (next.disabled || value.disabled || !visible.current) return;
    if (owners.current.get(source) === note) return;
    if (owners.current.has(source)) release(source);
    const first = ![...owners.current.values()].includes(note);
    owners.current.set(source, note);
    const accepted = next.patch({ [value.heldField]: [...new Set(owners.current.values())].sort((a, b) => a - b),
      [value.selectedField]: note }, 'control', value.id, `${noteName(note)}的琴键与声音`);
    if (!accepted) { owners.current.delete(source); return; }
    if (first) {
      strikes.current.set(note, { began: performance.now(), duration: 52 * value.slowMotion, velocity: value.velocity, hit: false });
      next.patch({ [value.phaseField]: 0 }, 'motion');
      animate();
    }
  };
  useEffect(() => {
    const values = new Set(held), voice = (note: number): InteractiveAudioVoice => ({
      gate: values.has(note), sustain: pedal, trigger: triggers.current.get(note) || 0, frequency: frequency(note),
      settings: { gain: .42, velocity: strikes.current.get(note)?.velocity ?? props.velocity,
        harmonics: [1], attackMs: 3, decayMs: 1000, sustainLevel: 0, releaseMs: 90 }, piano: { brightness: props.brightness },
    });
    notes.forEach(note => audio?.sync(`${props.id}:note:${note}`, voice(note)));
  }, [audio?.sync, props.id, held.join(','), pedal, voiceRevision, props.velocity, props.brightness,
    props.tuningHz, props.lengthRatio, props.tensionRatio, props.densityRatio]);
  useLayoutEffect(() => {
    const previousAudio = audio, previousId = props.id;
    owners.current.clear(); strikes.current.clear(); triggers.current.clear();
    const unregister = controls.registerMotion(() => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined; strikes.current.clear();
    }, () => [props.phaseField]);
    return () => {
      unregister(); owners.current.clear(); strikes.current.clear();
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
      activations.current.forEach(timer => clearTimeout(timer)); activations.current.clear();
      notes.forEach(note => previousAudio?.remove(`${previousId}:note:${note}`));
    };
  }, [controls.scopeKey, props.id, props.phaseField]);
  useEffect(() => {
    const blur = () => releaseAll(), hidden = () => { if (document.hidden) releaseAll(); };
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden);
    const observer = new IntersectionObserver(entries => {
      visible.current = entries.some(entry => entry.isIntersecting);
      if (!visible.current && owners.current.size) releaseAll();
    });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    if (disabled) releaseAll();
    else if (pendingRelease.current) releaseAll();
  }, [disabled]);
  useEffect(() => {
    if (!held.length && owners.current.size) { owners.current.clear(); silence(); setVoiceRevision(value => value + 1); }
  }, [held.length]);
  useEffect(() => {
    setWindowStart(previous => selected < previous || selected > previous + 24 ? windowFor(selected) : previous);
  }, [selected]);
  useEffect(() => {
    for (const [source, note] of [...owners.current])
      if (source.startsWith('pointer:') && (note < windowStart || note > windowStart + 24)) release(source);
  }, [windowStart]);
  const select = (note: number) => controls.patch({ [props.selectedField]: note }, 'control', props.id, `${noteName(note)}的琴键与声音`);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.target instanceof Element
      && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const mapped = keys[event.key.toLowerCase()];
    if (mapped !== undefined && !event.repeat) { event.preventDefault(); event.stopPropagation(); press(mapped, `key:${event.key.toLowerCase()}`); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); releaseAll(true); }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const note = event.key === 'Home' ? 21 : event.key === 'End' ? 108 : clamp(selected + (event.key === 'ArrowLeft' ? -1 : 1), 21, 108);
      select(note); setWindowStart(windowFor(note));
      requestAnimationFrame(() => keyboard.current?.querySelector<HTMLButtonElement>(`[data-piano-note="${note}"]`)?.focus({ preventScroll: true }));
    }
  };
  const pointerDown = (event: PointerEvent<HTMLButtonElement>, note: number) => {
    if (event.button !== 0 || disabled) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId); press(note, `pointer:${event.pointerId}`);
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    release(`pointer:${event.pointerId}`);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const shown = notes.filter(note => note >= windowStart && note <= windowStart + 24), whites = shown.filter(note => !black(note));
  const position = (note: number) => shown.filter(value => value < note && !black(value)).length;
  const center = (note: number) => (position(note) + (black(note) ? 0 : .5)) / whites.length * 100;
  return <div ref={root} className="interactive-piano" data-program-node={props.id} tabIndex={disabled ? -1 : 0} role="group" aria-label="88键钢琴" aria-disabled={disabled}
    onPointerDown={event => {
      if (!disabled && event.target instanceof Element && !event.target.closest('button,input,textarea,select,a')) event.currentTarget.focus({ preventScroll: true });
    }}
    onKeyDown={keyDown} onKeyUp={event => release(`key:${event.key.toLowerCase()}`)}
    onBlur={event => { if (!(event.relatedTarget instanceof Node) || !root.current?.contains(event.relatedTarget)) releaseAll(); }}>
    {props.showMechanism && <><PianoAction phase={phase} held={held.includes(selected)} pedal={pedal} note={noteName(selected)} />
      <div className="interactive-piano-process"><span>按下</span><input type="range" aria-label="击弦过程" min="0" max="1" step=".001" value={phase} disabled={disabled}
        onPointerDown={controls.stopMotions} onChange={event => {
          const state = controls.states[props.phaseField];
          if (state.kind === 'number') controls.patch({ [props.phaseField]: snapProgramNumber(event.currentTarget.valueAsNumber, state) }, 'manual', props.id, '击弦过程');
        }} /><span>回落</span></div></>}
    <div className="interactive-piano-register"><button type="button" disabled={disabled || windowStart === 21} aria-label="看更低的琴键"
      onClick={() => setWindowStart(value => Math.max(21, value - 12))}><ChevronLeft size={15} /></button>
      <span>{noteName(shown[0])} — {noteName(shown[shown.length - 1])}</span>
      <button type="button" disabled={disabled || windowStart === 84} aria-label="看更高的琴键"
        onClick={() => setWindowStart(value => Math.min(84, value + 12))}><ChevronRight size={15} /></button></div>
    <div ref={keyboard} className="interactive-piano-keys" style={{ '--piano-whites': whites.length } as CSSProperties}>
      {shown.map(note => <button key={note} type="button" data-piano-note={note} disabled={disabled}
        tabIndex={selected === note ? 0 : -1} aria-label={noteName(note)} aria-pressed={held.includes(note)}
        title={`${noteName(note)}${hotkeys[note] ? ` · ${hotkeys[note].toUpperCase()}` : ''}`} aria-keyshortcuts={hotkeys[note]}
        className={`interactive-piano-key is-${black(note) ? 'black' : 'white'}${held.includes(note) ? ' is-held' : ''}${selected === note ? ' is-selected' : ''}`}
        style={{ left: `${center(note)}%`, width: `${(black(note) ? .61 : .98) / whites.length * 100}%` }}
        onPointerDown={event => pointerDown(event, note)} onPointerUp={pointerUp} onPointerCancel={pointerUp}
        onLostPointerCapture={event => release(`pointer:${event.pointerId}`)}
        onPointerMove={event => {
          if (!owners.current.has(`pointer:${event.pointerId}`)) return;
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-piano-note]');
          if (target && keyboard.current?.contains(target)) press(Number(target.dataset.pianoNote), `pointer:${event.pointerId}`);
        }} onKeyDown={event => { if ([' ', 'Enter'].includes(event.key) && !event.repeat) { event.preventDefault(); event.stopPropagation(); press(note, `key:${event.key}`); } }}
        onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); release(`key:${event.key}`); } }}
        onClick={event => { if (event.detail === 0 && !owners.current.size) {
          press(note, 'activation');
          const timer = setTimeout(() => { activations.current.delete(timer); release('activation'); }, 90); activations.current.add(timer);
        } }}>
        {!black(note) && (note % 12 === 0 || note === 21 || selected === note) && <span>{noteName(note)}</span>}
      </button>)}
    </div>
    <div className="interactive-piano-overview" role="group" aria-label="全部88键，选择音区">
      {notes.map(note => <button key={note} type="button" className={`${black(note) ? 'is-black' : 'is-white'}${note >= windowStart && note <= windowStart + 24 ? ' is-visible' : ''}${selected === note ? ' is-selected' : ''}`}
        disabled={disabled} tabIndex={-1} aria-label={`查看${noteName(note)}`} onClick={() => { select(note); setWindowStart(windowFor(note)); }} />)}
    </div>
    <div className="interactive-piano-listen"><div className="interactive-piano-note"><strong>{noteName(selected)}</strong><span>{frequency(selected).toFixed(1)} Hz</span></div>
      <button type="button" className={`interactive-piano-pedal${pedal ? ' is-held' : ''}`} disabled={disabled} aria-pressed={pedal}
        onClick={() => controls.patch({ [props.pedalField]: !pedal }, 'control', props.id, '延音踏板')}><span aria-hidden="true" />延音</button>
      <button type="button" className="interactive-piano-reset" disabled={disabled} onClick={() => releaseAll(true)}><RotateCcw size={14} />松开</button>
      <button type="button" className="interactive-piano-continue" disabled={disabled} onClick={() => controls.continueFrom(props.id, `${noteName(selected)}的琴键与声音`)}>接着这个变化聊<ArrowUpRight size={14} /></button>
    </div>
    <InteractiveAudioTrace props={{ id: `${props.id}:output`, label: '这一件作品的实际声音波形', height: 80, magnification: 4, color: 'accent' }} renderNode={renderNode} />
  </div>;
}
