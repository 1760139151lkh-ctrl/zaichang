import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ComponentRenderProps } from '@openuidev/react-lang';
import { Volume2, VolumeX } from 'lucide-react';
import type { ProgramStateValues } from '../../shared/interactive-program';

interface Settings { gain: number; velocity: number; harmonics: number[]; attackMs: number; decayMs: number; sustainLevel: number; releaseMs: number }
interface Voice { gate: boolean; sustain: boolean; trigger?: number | boolean; frequency: number | null; settings: Settings }
interface Sound { id: string; oscillator: OscillatorNode; gain: GainNode; released: boolean; held: boolean; born: number }
interface Scope {
  inputs: ProgramStateValues;
  sync: (id: string, voice: Voice) => void;
  remove: (id: string) => void;
  enabled: boolean; count: number; issue: string;
  playing: number;
  signal: () => Float32Array | undefined;
  toggle: (trusted: boolean) => void;
}
const AudioScope = createContext<Scope | null>(null);
const defaults: Settings = { gain: .25, velocity: 1, harmonics: [1], attackMs: 8, decayMs: 250, sustainLevel: .45, releaseMs: 180 };

/** A single local sound owner for one exact delivered work. It creates no
 * timer, network request or audio context until the person asks to listen. */
export function InteractiveAudioScope({ scopeKey, inputs, userAction, disabled, children }: {
  scopeKey: string; inputs: ProgramStateValues; userAction: { serial: number; origin: string }; disabled: boolean; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null), context = useRef<AudioContext | undefined>(undefined), master = useRef<GainNode | undefined>(undefined);
  const analyser = useRef<AnalyserNode | undefined>(undefined), samples = useRef(new Float32Array(1024));
  const voices = useRef(new Map<string, Voice>()), sounds = useRef(new Set<Sound>());
  const [enabled, setEnabled] = useState(false), [count, setCount] = useState(0), [issue, setIssue] = useState('');
  const [playing, setPlaying] = useState(0);
  const current = useRef({ enabled, disabled, userAction }); current.current = { enabled, disabled, userAction };
  const armed = useRef(false), visible = useRef(true);
  const mix = () => {
    if (context.current && master.current) master.current.gain.setTargetAtTime(.7 / Math.max(1, sounds.current.size), context.current.currentTime, .008);
    setPlaying(sounds.current.size);
  };
  const stopAll = () => {
    armed.current = false;
    for (const sound of sounds.current) { try { sound.oscillator.stop(); } catch { /* already ended */ } sound.oscillator.disconnect(); sound.gain.disconnect(); }
    sounds.current.clear(); mix();
  };
  const release = (sound: Sound, milliseconds: number) => {
    const clock = context.current;
    if (!clock || sound.released) return;
    sound.released = true;
    const now = clock.currentTime, parameter = sound.gain.gain;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else { const value = parameter.value; parameter.cancelScheduledValues(now); parameter.setValueAtTime(value, now); }
    parameter.linearRampToValueAtTime(0, now + milliseconds / 1000);
    sound.oscillator.stop(now + milliseconds / 1000 + .015);
  };
  const activate = async () => {
    if (current.current.disabled || !visible.current) return;
    try {
      if (!context.current || context.current.state === 'closed') {
        const clock = new AudioContext(), output = clock.createGain(), trace = clock.createAnalyser();
        trace.fftSize = samples.current.length;
        output.gain.value = .7; output.connect(trace); trace.connect(clock.destination);
        context.current = clock; master.current = output; analyser.current = trace;
      }
      // Scheduling during a trusted resume keeps the first press intact.
      // A later blur may disarm it; the resolved promise must not re-arm it.
      armed.current = true;
      await context.current.resume();
      if (current.current.disabled || !visible.current) { stopAll(); return; }
      setIssue('');
    } catch { armed.current = false; setIssue('这次没能放出声音，点一下再试。'); }
  };
  const play = (id: string, voice: Voice) => {
    const clock = context.current;
    if (!clock || clock.state === 'closed' || !armed.current || !current.current.enabled || current.current.disabled || voice.frequency === null) return;
    if (sounds.current.size >= 64) {
      const tail = [...sounds.current].filter(sound => sound.released || !sound.held).sort((a, b) => a.born - b.born)[0];
      if (!tail) { setIssue('先松开几个声音，再继续弹。'); return; }
      try { tail.oscillator.stop(); } catch { /* already ended */ } tail.oscillator.disconnect(); tail.gain.disconnect(); sounds.current.delete(tail);
    }
    const oscillator = clock.createOscillator(), gain = clock.createGain(), value = voice.settings;
    const real = new Float32Array(value.harmonics.length + 1), imaginary = new Float32Array(value.harmonics.length + 1);
    imaginary.set(value.harmonics, 1); oscillator.setPeriodicWave(clock.createPeriodicWave(real, imaginary));
    oscillator.frequency.value = voice.frequency;
    const now = clock.currentTime, peak = value.gain * value.velocity;
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(peak, now + value.attackMs / 1000);
    gain.gain.linearRampToValueAtTime(peak * value.sustainLevel, now + (value.attackMs + value.decayMs) / 1000);
    oscillator.connect(gain); gain.connect(master.current!);
    const sound: Sound = { id, oscillator, gain, released: false, held: voice.gate, born: now }; sounds.current.add(sound); mix();
    oscillator.onended = () => { sounds.current.delete(sound); oscillator.disconnect(); gain.disconnect(); mix(); };
    oscillator.start();
    if (!voice.gate && !voice.sustain) release(sound, Math.max(value.attackMs + 20, value.releaseMs));
    else if (value.sustainLevel === 0) oscillator.stop(now + (value.attackMs + value.decayMs) / 1000 + .02);
  };
  const api = useMemo(() => ({
    signal() {
      if (!analyser.current || !armed.current || !sounds.current.size || !current.current.enabled || current.current.disabled
        || context.current?.state !== 'running') return;
      analyser.current.getFloatTimeDomainData(samples.current); return samples.current;
    },
    sync(id: string, voice: Voice) {
      const before = voices.current.get(id); voices.current.set(id, voice);
      setCount([...voices.current.values()].filter(value => value.frequency !== null).length);
      if (!before) return;
      const newStrike = voice.trigger === undefined ? !before.gate && voice.gate : typeof voice.trigger === 'boolean'
        ? before.trigger === false && voice.trigger : before.trigger !== undefined && before.trigger !== voice.trigger;
      if (newStrike && current.current.userAction.origin !== 'reset' && current.current.userAction.serial > 0) {
        for (const sound of sounds.current) if (sound.id === id) {
          sound.held = false;
          if (!voice.sustain) release(sound, Math.min(80, voice.settings.releaseMs));
        }
        play(id, voice);
      }
      if (!voice.gate) for (const sound of sounds.current) if (sound.id === id) sound.held = false;
      if (!voice.gate && !voice.sustain || voice.frequency === null)
        for (const sound of sounds.current) if (sound.id === id) release(sound, voice.settings.releaseMs);
      if (voice.frequency !== null && context.current) for (const sound of sounds.current)
        if (sound.id === id && !sound.released) {
          sound.oscillator.frequency.setTargetAtTime(voice.frequency, context.current.currentTime, .01);
          if (JSON.stringify(before.settings.harmonics) !== JSON.stringify(voice.settings.harmonics)) {
            const real = new Float32Array(voice.settings.harmonics.length + 1), imaginary = new Float32Array(voice.settings.harmonics.length + 1);
            imaginary.set(voice.settings.harmonics, 1); sound.oscillator.setPeriodicWave(context.current.createPeriodicWave(real, imaginary));
          }
        }
    },
    remove(id: string) {
      voices.current.delete(id); setCount([...voices.current.values()].filter(value => value.frequency !== null).length);
      for (const sound of [...sounds.current]) if (sound.id === id) {
        try { sound.oscillator.stop(); } catch { /* already ended */ } sound.oscillator.disconnect(); sound.gain.disconnect(); sounds.current.delete(sound);
      }
      mix();
    },
  }), []);
  useEffect(() => {
    const disarm = () => { stopAll(); void context.current?.suspend(); };
    const hidden = () => { if (document.hidden) disarm(); };
    window.addEventListener('blur', disarm); document.addEventListener('visibilitychange', hidden);
    const observer = new IntersectionObserver(entries => { visible.current = entries.some(entry => entry.isIntersecting); if (!visible.current) disarm(); });
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect(); window.removeEventListener('blur', disarm); document.removeEventListener('visibilitychange', hidden);
      stopAll(); analyser.current?.disconnect(); void context.current?.close(); context.current = undefined; master.current = undefined; analyser.current = undefined;
    };
  }, [scopeKey]);
  useEffect(() => { if (disabled || !enabled) stopAll(); }, [disabled, enabled]);
  const gesture = (trusted: boolean) => { if (trusted && current.current.enabled && !current.current.disabled) void activate(); };
  // React portal events still cross this provider. A native source surface
  // owns its own focus/drag lifecycle, even when it is displayed by SourceSlot.
  const ownsGesture = (target: EventTarget | null) => target instanceof Element && !!root.current?.contains(target)
    && !target.closest('.interactive-source-slot');
  const value: Scope = { ...api, inputs, enabled, count, issue, playing,
    toggle: trusted => { if (!trusted) return; if (current.current.enabled) { stopAll(); setEnabled(false); } else { setEnabled(true); void activate(); } } };
  return <AudioScope.Provider value={value}><div ref={root} className="interactive-audio-scope"
    onPointerDownCapture={event => {
      if (!ownsGesture(event.target)) return;
      gesture(event.nativeEvent.isTrusted);
      if (event.target instanceof Element) {
        const article = root.current?.querySelector<HTMLElement>('.interactive-document');
        const control = event.target.closest('button,input,textarea,select,a,[tabindex]');
        if (!control || control === article) article?.focus({ preventScroll: true });
      }
    }}
    onBlurCapture={event => {
      if (event.relatedTarget instanceof Node && root.current?.contains(event.relatedTarget)) return;
      stopAll(); void context.current?.suspend();
    }}
    onKeyDownCapture={event => { if (ownsGesture(event.target)) gesture(event.nativeEvent.isTrusted); }}
    onClickCapture={event => { if (ownsGesture(event.target)) gesture(event.nativeEvent.isTrusted); }}>{children}</div></AudioScope.Provider>;
}

export function InteractiveSoundToggle() {
  const sound = useContext(AudioScope);
  return sound?.count ? <div className="interactive-sound-control">
    <button type="button" onClick={event => sound.toggle(event.nativeEvent.isTrusted)} aria-pressed={sound.enabled}>
      {sound.enabled ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
      {sound.enabled ? '静音' : '听听声音'}
    </button>{sound.issue && <span role="status">{sound.issue}</span>}
  </div> : null;
}

/** Headless sound follows the same checked local record as the drawing. */
export function InteractiveVoice({ props }: ComponentRenderProps<Record<string, any>>) {
  const scope = useContext(AudioScope);
  const voice: Voice = { gate: scope?.inputs[props.gateField] === true, sustain: !!props.sustainField && scope?.inputs[props.sustainField] === true,
    frequency: props.frequency, settings: { ...defaults, ...props.settings },
    ...(props.triggerField ? { trigger: Number(scope?.inputs[props.triggerField]) } : props.trigger === undefined ? {} : { trigger: props.trigger }) };
  const key = JSON.stringify(voice);
  useEffect(() => { scope?.sync(props.id, voice); }, [scope?.sync, props.id, key]);
  useEffect(() => () => { scope?.remove(props.id); }, [scope?.remove, props.id]);
  return null;
}

/** A view of the same synthesizer output, never a second oscillator or a
 * fictional signal inferred from model-authored geometry. */
export function InteractiveAudioTrace({ props }: ComponentRenderProps<Record<string, any>>) {
  const scope = useContext(AudioScope), root = useRef<SVGSVGElement>(null), path = useRef<SVGPathElement>(null);
  const height = Number(props.height), baseline = `M0,${height / 2}L760,${height / 2}`;
  useEffect(() => {
    let frame: number | undefined, visible = false;
    let sampledAt = 0;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const clear = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; path.current?.setAttribute('d', baseline); };
    const draw = (now = performance.now()) => {
      if (!visible || document.hidden || !scope?.enabled || !scope.playing) { clear(); return; }
      if ((document.documentElement.dataset.motion === 'reduced' || preference.matches) && now - sampledAt < 200) {
        frame = requestAnimationFrame(draw); return;
      }
      sampledAt = now;
      const values = scope.signal();
      if (values) {
        // A rising zero crossing steadies periodic sounds without changing
        // their amplitude, time scale or the audio sent to the device.
        let start = 0;
        for (let index = 1; index < values.length / 2; index++)
          if (values[index - 1] <= 0 && values[index] > 0) { start = index; break; }
        const count = Math.min(512, values.length - start), pieces: string[] = [];
        for (let index = 0; index < count; index += 4) {
          // Zoom may leave the view, but must not invent clipped signal peaks.
          const x = index / (count - 1) * 760, y = height / 2 - values[start + index] * props.magnification * (height / 2 - 5);
          pieces.push(`${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`);
        }
        path.current?.setAttribute('d', pieces.join(''));
      } else path.current?.setAttribute('d', baseline);
      frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); if (visible) { clear(); draw(); } else clear(); });
    if (root.current) observer.observe(root.current);
    const visibility = () => { clear(); if (!document.hidden) draw(); };
    document.addEventListener('visibilitychange', visibility); draw();
    return () => { clear(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [scope?.signal, scope?.enabled, scope?.playing, height, props.magnification]);
  return <figure className="interactive-audio-trace" data-program-node={props.id}>
    <svg ref={root} viewBox={`0 0 760 ${height}`} width="100%" height={height} overflow="hidden" role="img" aria-label={props.label}>
      <path className="interactive-stroke tone-muted" d={baseline} strokeWidth={.6} opacity={.35} />
      <path ref={path} className={`interactive-stroke tone-${props.color}`} d={baseline} strokeWidth={1.6} fill="none" />
    </svg>
  </figure>;
}
