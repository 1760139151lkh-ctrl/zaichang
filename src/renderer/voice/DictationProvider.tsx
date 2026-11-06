import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SPEECH_MESSAGES, type SpeechEndReceipt, type SpeechEvent, type SpeechStatus } from '../../shared/speech';
import { MicrophoneError, openMicrophone, type Microphone, type MicrophoneProblem } from './audio-capture';
import { FieldWriter, isDictationElement, usableElement, type DictationElement } from './dictation-field';
import { caretAfter, diffEdit, DictationTracker, type DictationPlan } from './dictation-text';
import { readVoicePrefs } from './voice-prefs';

/*
 * Voice input for text boxes. The person taps a microphone icon (or presses Ctrl+M), speaks,
 * and words appear AT THE CARET of the box they were writing in, first as a guess that keeps
 * improving, then as the finished sentence. If they click somewhere else in the box, the next
 * words go there; if they type, the dictation carries on after what they typed. Nothing is sent,
 * saved or remembered by dictation itself: it only types.
 *
 * MOBILE PORT NOTE: the phone app keeps this behaviour (caret-anchored guesses that become
 * finals, undo for the last dictation, clipboard kept without losing what was copied) but
 * replaces the browser parts: getUserMedia/AudioWorklet -> native capture, execCommand ->
 * the native text field's composing region, Ctrl+M -> the keyboard's microphone key, and the
 * hover/focus rules of the notice -> touch (see docs/evidence/2026-11-05-voice-input.md).
 */

export type DictationPhase = 'idle' | 'preparing' | 'listening' | 'finishing';
export interface DictationNotice {
  key: number;
  target: HTMLElement | null;
  tone: 'info' | 'problem';
  text: string;
  actions: { label: string; kind?: 'restore' | 'undo' | 'copy'; run: () => void }[];
}

export interface Dictation {
  phase: DictationPhase;
  captureStartedAt: number | null;
  /** The box being dictated into right now. */
  target: DictationElement | null;
  status: SpeechStatus | null;
  notice: DictationNotice | null;
  toggle(element: DictationElement | null): void;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  /** Resolves once a dictation into this box (if any) has delivered its last words: call before sending. */
  settle(element: HTMLElement | null): Promise<void>;
  /** Loudness 0..1 about ten times a second, for the icon; no React render per update. */
  onLevel(listener: (level: number) => void): () => void;
  /** The box Ctrl+M falls back to when no text box has focus (the chat composer). */
  registerDefaultTarget(getter: () => DictationElement | null): () => void;
}

interface Run {
  undoable: boolean;
  field: FieldWriter;
  tracker: DictationTracker;
  sessionId: string | null;
  sequence: number;
  pending: Float32Array[];
  mic: Microphone | null;
  held: Map<number, string>;
  finals: Set<number>;
  pendingEnd: SpeechEndReceipt | null;
  owner: string | null;
  composing: boolean;
  compositionVersion: number;
  inputPending: boolean;
  /** Where the caret was after our last edit; a different place later means the person moved it. */
  caret: number;
  starting: Promise<void>;
  stopping: Promise<void> | null;
  /** Stop was asked for before the microphone and recognizer finished coming up. */
  early: boolean;
  settled: boolean;
  problem: string;
  detach: () => void;
}
interface Last { run: Run; receipt: SpeechEndReceipt; timer: number }

const NOTICE_MS = 10 * 60_000;
const MAX_PENDING_CHUNKS = 200;
const Context = createContext<Dictation | null>(null);
export const useDictation = () => useContext(Context);

const microphoneText = (problem: MicrophoneProblem) => problem === 'denied' ? SPEECH_MESSAGES.microphone_denied
  : problem === 'missing' ? SPEECH_MESSAGES.microphone_missing : problem === 'busy' ? SPEECH_MESSAGES.microphone_busy : SPEECH_MESSAGES.invalid_audio;

export function DictationProvider({ children }: { children: ReactNode }) {
  const speech = typeof window !== 'undefined' ? window.zaichang : undefined;
  const [status, setStatus] = useState<SpeechStatus | null>(null);
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [captureStartedAt, setCaptureStartedAt] = useState<number | null>(null);
  const [target, setTarget] = useState<DictationElement | null>(null);
  const [notice, setNotice] = useState<DictationNotice | null>(null);
  const [prefs] = useState(readVoicePrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const statusRef = useRef<SpeechStatus | null>(null);
  statusRef.current = status;
  const run = useRef<Run | null>(null);
  const last = useRef<Last | null>(null);
  const noticeKeys = useRef(0);
  const level = useRef(0);
  const levelListeners = useRef(new Set<(level: number) => void>());
  const defaultTarget = useRef<() => DictationElement | null>(() => null);
  const controller = useRef<ReturnType<typeof createController> | null>(null);

  /* Everything below reads refs and stable setters, so one controller serves every render. */
  function createController() {
    const say = (element: HTMLElement | null, text: string, tone: 'info' | 'problem' = 'info', actions: DictationNotice['actions'] = []) => {
      setNotice({ key: ++noticeKeys.current, target: element, tone, text, actions });
    };
    const pushLevel = (value: number) => {
      level.current = value;
      for (const listener of levelListeners.current) listener(value);
    };
    const endLast = () => {
      const previous = last.current;
      if (!previous) return;
      clearTimeout(previous.timer);
      previous.run.detach();
      last.current = null;
    };

    /** Keep the model of the box in step with what is really in it (the person's typing, React, the IME). */
    const sync = (r: Run, fromInput = false) => {
      const element = r.field.element;
      if (element.getAttribute('data-dictation-owner') !== r.owner) { void stop(); return false; }
      if (element.value === r.tracker.value) return true;
      const cleared = element.value === '' && r.tracker.spans.length > 0;
      r.tracker.record(diffEdit(r.tracker.value, element.value), element.value);
      r.caret = element.selectionStart ?? r.caret;
      r.tracker.moveCursor(r.caret, element.selectionEnd ?? r.caret);
      // A host replaced the draft without an input event. Stop before writing into that new object.
      if (!fromInput && !r.inputPending) { void stop(); return false; }
      // The box was emptied from outside (the message was sent): nothing is left to dictate into.
      if (cleared && run.current === r) { void stop(); return false; }
      return true;
    };

    const write = (r: Run, id: number, text: string) => {
      if (r.composing) { r.held.set(id, text); return; }
      const element = r.field.element;
      if (!usableElement(element)) { r.problem = SPEECH_MESSAGES.field_locked; void stop(); return; }
      if (!sync(r)) return;
      const plan: DictationPlan | null = text ? r.tracker.plan(id, text) : r.tracker.removal(id);
      if (!plan) return;
      // New words end with the caret after them; an older stretch refined in place leaves the caret where the person has it.
      const caret = plan.create ? plan.edit.start + plan.edit.insert.length : caretAfter(element.selectionStart ?? r.caret, plan.edit);
      const selectionEnd = plan.create ? caret : caretAfter(element.selectionEnd ?? r.caret, plan.edit);
      const applied = r.field.apply(plan.edit, caret);
      if (!plan.create) element.setSelectionRange(Math.min(caret, applied.value.length), Math.min(selectionEnd, applied.value.length));
      r.tracker.record(applied.edit, applied.value, plan);
      r.caret = element.selectionStart ?? r.caret;
      if (applied.truncated) { r.problem = SPEECH_MESSAGES.field_full; void stop(); }
    };

    const flushHeld = (r: Run) => {
      for (const [id, text] of [...r.held]) { r.held.delete(id); write(r, id, text); }
    };

    const attach = (r: Run) => {
      const element = r.field.element;
      const retireUndo = () => {
        if (last.current?.run !== r || !r.undoable) return;
        if (!element.isConnected || element.getAttribute('data-dictation-owner') !== r.owner
          || element.value !== r.tracker.value || !r.tracker.intact().length) {
          r.undoable = false;
          r.detach();
          setNotice(current => current?.target === element
            ? { ...current, actions: current.actions.filter(action => action.kind !== 'undo') } : current);
        }
      };
      const onInput = () => {
        if (r.field.editing) return;
        r.inputPending = true;
        // Native target listeners run before React's delegated onChange. Let it keep the new value first.
        setTimeout(() => {
          if (run.current !== r && last.current?.run !== r) { r.inputPending = false; return; }
          sync(r, true);
          r.inputPending = false;
          retireUndo();
        }, 0);
      };
      const onCaret = () => {
        if (r.field.editing || r.composing) return;
        if (!sync(r)) return;
        const start = element.selectionStart ?? 0;
        if (start !== r.caret || element.selectionEnd !== start) { r.tracker.moveCursor(start, element.selectionEnd ?? start); r.caret = start; }
      };
      const onCompositionStart = () => { r.compositionVersion++; r.composing = true; };
      const onCompositionEnd = () => {
        const version = r.compositionVersion;
        setTimeout(() => {
          if (version !== r.compositionVersion || run.current !== r && last.current?.run !== r) return;
          r.composing = false;
          sync(r, true);
          if (r.pendingEnd?.reason !== 'cancelled' && r.pendingEnd?.reason !== 'private') flushHeld(r);
          if (r.pendingEnd) finishRun(r, r.pendingEnd);
        }, 0);
      };
      const onFocusOut = () => {
        setTimeout(() => {
          if (run.current !== r || r.stopping || !document.hasFocus() || document.activeElement === element) return;
          const active = document.activeElement;
          if (active instanceof Element && active.closest('[data-voice-control]')) return;
          void stop();
        }, 0);
      };
      element.addEventListener('input', onInput);
      element.addEventListener('pointerup', onCaret);
      element.addEventListener('keyup', onCaret);
      element.addEventListener('compositionstart', onCompositionStart);
      element.addEventListener('compositionend', onCompositionEnd);
      element.addEventListener('focusout', onFocusOut);
      const watch = window.setInterval(() => {
        if (run.current === r && !r.stopping && !usableElement(element)) { r.problem = SPEECH_MESSAGES.field_locked; void stop(); }
        else if (run.current === r && element.getAttribute('data-dictation-owner') !== r.owner) void stop();
        retireUndo();
      }, 100);
      return () => {
        element.removeEventListener('input', onInput);
        element.removeEventListener('pointerup', onCaret);
        element.removeEventListener('keyup', onCaret);
        element.removeEventListener('compositionstart', onCompositionStart);
        element.removeEventListener('compositionend', onCompositionEnd);
        element.removeEventListener('focusout', onFocusOut);
        clearInterval(watch);
      };
    };

    const send = (r: Run, samples: Float32Array) => {
      if (r.sessionId) speech?.speechAudio(r.sessionId, r.sequence++, samples);
      else if (r.pending.length < MAX_PENDING_CHUNKS) r.pending.push(samples);
    };

    const restoreClipboard = () => {
      void speech?.speechRestoreClipboard().then(result => {
        const previous = last.current?.run;
        const canUndo = previous?.undoable && usableElement(previous.field.element)
          && previous.field.element.getAttribute('data-dictation-owner') === previous.owner
          && previous.field.element.value === previous.tracker.value && previous.tracker.intact().length > 0;
        say(last.current?.run.field.element ?? null, result.restored ? '已还原原来复制的内容' : '这次没有还原剪贴板', result.restored ? 'info' : 'problem',
          canUndo ? [{ label: '撤销这段语音', kind: 'undo', run: undo }] : []);
      });
    };

    const retract = (r: Run, ids?: ReadonlySet<number>) => {
      const element = r.field.element;
      if (!usableElement(element) || element.getAttribute('data-dictation-owner') !== r.owner || !sync(r)) return false;
      const plan = r.tracker.undoEdits(ids);
      if (!plan) return false;
      for (const edit of plan.edits) {
        const applied = r.field.apply(edit, caretAfter(element.selectionStart ?? 0, edit));
        r.tracker.record(applied.edit, applied.value);
      }
      element.setSelectionRange(plan.caret, plan.caret);
      return true;
    };

    const undo = () => {
      const previous = last.current;
      if (!previous) return;
      const r = previous.run;
      const element = r.field.element;
      endLast();
      let changed = false;
      if (r.undoable && usableElement(element)) {
        element.focus({ preventScroll: true });
        changed = retract(r);
      }
      if (previous.receipt.clipboard.state === 'kept') void speech?.speechRestoreClipboard();
      say(element, changed ? '已撤回这段语音' : '已保留手动修改');
    };

    /** The run is over without a usable session (never came up, or was cancelled). */
    const abandon = (r: Run, text?: string) => {
      if (r.settled) return;
      r.settled = true;
      r.mic?.close();
      r.mic = null;
      r.detach();
      if (run.current === r) run.current = null;
      pushLevel(0);
      setCaptureStartedAt(null);
      setPhase('idle');
      setTarget(null);
      if (text) say(r.field.element, text, 'problem', [
        ...(!r.field.element.closest('.composer') ? [{ label: '再试一次', run: () => toggle(r.field.element) }] : []),
        ...(text === SPEECH_MESSAGES.microphone_denied ? [{ label: '查看麦克风设置', run: () => { void speech?.speechOpenMicrophoneSettings(); } }] : []),
      ]);
    };

    /** The recognizer has delivered everything: close out and tell the person what happened to the clipboard. */
    const finishRun = (r: Run, receipt: SpeechEndReceipt | null) => {
      if (r.settled) return;
      r.mic?.close();
      r.mic = null;
      if (r.composing && r.field.element.isConnected && receipt) { r.pendingEnd = receipt; setPhase('finishing'); return; }
      const cancelled = receipt?.reason === 'cancelled' || receipt?.reason === 'private';
      if (cancelled) retract(r);
      else if (!r.problem && receipt?.reason !== 'error') retract(r, new Set(r.tracker.spans.filter(span => !r.finals.has(span.id)).map(span => span.id)));
      r.settled = true;
      if (run.current === r) run.current = null;
      pushLevel(0);
      setCaptureStartedAt(null);
      setPhase('idle');
      setTarget(null);
      const element = r.field.element;
      const transcript = receipt?.transcript ?? '';
      const done = (text: string, tone: 'info' | 'problem', actions: DictationNotice['actions']) => say(element, text, tone, actions);
      if (!transcript && (!r.problem || !r.tracker.intact().length)) {
        r.detach();
        if (receipt?.reason === 'private') return;
        if (cancelled) done('已取消这段语音', 'info', []);
        else if (r.problem) done(r.problem, 'problem', [
          ...(!element.closest('.composer') ? [{ label: '再试一次', run: () => toggle(element) }] : []),
          ...(r.problem === SPEECH_MESSAGES.microphone_denied ? [{ label: '查看麦克风设置', run: () => { void speech?.speechOpenMicrophoneSettings(); } }] : []),
        ]);
        else if (receipt?.reason === 'silence') done(SPEECH_MESSAGES.nothing_heard, 'info', []);
        return;
      }
      const finished: SpeechEndReceipt = receipt ?? { sessionId: r.sessionId ?? '', reason: 'error', transcript: '', clipboard: { state: 'off' } };
      const clip = finished.clipboard;
      const actions: DictationNotice['actions'] = [];
      let text = '';
      if (clip.state === 'kept') {
        text = '已复制';
        if (clip.restorable) actions.push({ label: '还原之前的剪贴板', kind: 'restore', run: restoreClipboard });
      } else if (clip.state === 'left_alone') {
        text = clip.reason === 'other_content' ? '剪贴板里已有其他内容，保留了原样' : '剪贴板里的内容太大，没有换掉';
        actions.push({ label: '复制上一段听写', kind: 'copy', run: () => { void speech?.copyText(transcript).then(() => say(element, '已复制')).catch(() => say(element, '没有复制成功，可以再试一次', 'problem')); } });
      } else if (clip.state === 'failed') text = '这段话没能放进剪贴板';
      if (r.problem) text = r.problem;
      if (!text) text = '这段话写好了';
      endLast();
      if (r.undoable && r.tracker.intact().length) actions.push({ label: '撤销这段语音', kind: 'undo', run: undo });
      done(text, r.problem ? 'problem' : 'info', actions);
      const key = noticeKeys.current;
      const timer = window.setTimeout(() => { if (last.current?.run === r) { endLast(); setNotice(current => current?.key === key ? null : current); } }, NOTICE_MS);
      last.current = { run: r, receipt: finished, timer };
    };

    /** Stop listening, let the recognizer finish the last words, and close out. */
    function stop(): Promise<void> {
      const r = run.current;
      if (!r) return Promise.resolve();
      // A permission prompt may stay open for a while. Stop responds immediately;
      // the pending capture is closed as soon as the browser returns it.
      if (!r.mic && !r.sessionId) { r.early = true; abandon(r); return Promise.resolve(); }
      return r.stopping ??= (async () => {
        setPhase('finishing');
        r.early = true;
        await r.starting.catch(() => undefined);
        if (r.settled) return;
        if (!r.sessionId) { abandon(r, r.problem || undefined); return; }
        await r.mic?.flush();
        r.mic?.close();
        r.mic = null;
        let receipt: SpeechEndReceipt | null = null;
        try { receipt = await speech!.speechStop({ sessionId: r.sessionId }); }
        catch { r.problem = '语音刚才没有完整收好，已经写出的字还在，可以再试一次。'; }
        finishRun(r, receipt);
      })();
    }

    const cancel = async () => {
      const r = run.current;
      if (!r) return;
      const element = r.field.element;
      const returnFocus = () => {
        const active = document.activeElement;
        if (usableElement(element) && element.getAttribute('data-dictation-owner') === r.owner
          && (active === document.body || active === element || active instanceof Element && !!active.closest('[data-voice-control]')))
          element.focus({ preventScroll: true });
      };
      r.early = true;
      r.mic?.close();
      if (!r.sessionId) {
        retract(r);
        abandon(r);
        say(r.field.element, '已取消这段语音');
        returnFocus();
        return;
      }
      if (r.sessionId) await speech?.speechCancel({ sessionId: r.sessionId }).catch(() => undefined);
      finishRun(r, { sessionId: r.sessionId ?? '', reason: 'cancelled', transcript: '', clipboard: { state: 'off' } });
      returnFocus();
    };

    const begin = (element: DictationElement) => {
      endLast();
      element.focus({ preventScroll: true });
      const start = element.selectionStart ?? element.value.length;
      const r: Run = {
        undoable: true,
        field: new FieldWriter(element), tracker: new DictationTracker(element.value, start, element.selectionEnd ?? start),
        sessionId: null, sequence: 0, pending: [], mic: null, held: new Map(), finals: new Set(), pendingEnd: null,
        owner: element.getAttribute('data-dictation-owner'), composing: false, compositionVersion: 0, inputPending: false, caret: start,
        starting: Promise.resolve(), stopping: null, early: false, settled: false, problem: '', detach: () => undefined,
      };
      run.current = r;
      setTarget(element);
      setPhase('preparing');
      setNotice(null);
      r.detach = attach(r);
      r.starting = (async () => {
        let opened: Microphone;
        try {
          opened = await openMicrophone({
            deviceId: prefsRef.current.deviceId || undefined,
            onChunk: (samples, rms) => { pushLevel(Math.min(1, level.current * 0.55 + Math.min(1, rms * 9) * 0.45)); send(r, samples); },
            onLost: () => { r.problem = SPEECH_MESSAGES.microphone_missing; void stop(); },
          });
        } catch (error) {
          abandon(r, microphoneText(error instanceof MicrophoneError ? error.problem : 'failed'));
          return;
        }
        if (r.early || r.settled) { opened.close(); return; }
        r.mic = opened;
        setCaptureStartedAt(Date.now());
        // The host's silence clock starts only after microphone access is settled.
        // Audio captured while its model starts is queued in this same run.
        let started;
        try { started = await speech!.speechStart({ language: prefsRef.current.language, keepInClipboard: prefsRef.current.keepInClipboard }); }
        catch { opened.close(); abandon(r, SPEECH_MESSAGES.engine_failed); return; }
        if (r.settled) { opened.close(); if (started.ok) void speech?.speechCancel({ sessionId: started.sessionId }); return; }
        if (!started.ok) {
          opened.close();
          if (started.code === 'model_missing') { abandon(r, started.message); }
          else abandon(r, started.message);
          return;
        }
        r.sessionId = started.sessionId;
        for (const chunk of r.pending.splice(0)) send(r, chunk);
        if (!r.early && (started.engine === 'ready' || statusRef.current?.engine === 'ready')) setPhase('listening');
      })();
    };

    const fromMain = (event: SpeechEvent) => {
      if (event.type === 'status') { statusRef.current = event.status; setStatus(event.status); return; }
      if (event.type === 'reset') {
        const current = run.current;
        if (current) finishRun(current, { sessionId: current.sessionId ?? '', reason: 'private', transcript: '', clipboard: { state: 'off' } });
        endLast(); setNotice(null);
        return;
      }
      const r = run.current;
      if (!r) return;
      if (event.type === 'error') { if (!event.sessionId || event.sessionId === r.sessionId || !r.sessionId) r.problem = event.message; return; }
      if (!r.sessionId || !('sessionId' in event) || event.sessionId !== r.sessionId) return;
      switch (event.type) {
        case 'ready': if (!r.stopping) setPhase('listening'); break;
        case 'final': r.finals.add(event.segmentId); write(r, event.segmentId, event.text); break;
        case 'partial': write(r, event.segmentId, event.text); break;
        case 'discard': write(r, event.segmentId, ''); break;
        // Ended from the main side (quiet for too long, the window went away, a fault): close out the same way.
        case 'ended': finishRun(r, { sessionId: event.sessionId, reason: event.reason, transcript: event.transcript, clipboard: event.clipboard }); break;
        default: break;
      }
    };

    const toggle = (element: DictationElement | null) => {
      if (!speech || !element) return;
      const current = run.current;
      if (current) {
        const same = current.field.element === element;
        void stop().then(() => { if (!same) toggle(element); });
        return;
      }
      if (!usableElement(element) || !element.getClientRects().length) return;
      const known = statusRef.current;
      if (known && !known.supported) { say(element, SPEECH_MESSAGES.unsupported, 'problem'); return; }
      if (known && known.model.state !== 'ready') {
        if (known.model.state === 'verifying') return;
        say(element, SPEECH_MESSAGES.model_missing, 'problem');
        return;
      }
      begin(element);
    };

    return { endLast, fromMain, toggle, stop, cancel };
  }

  controller.current ??= createController();
  const ctl = controller.current;

  useEffect(() => {
    if (!speech?.speechStatus) return;
    let alive = true;
    void speech.speechStatus().then(next => { if (alive) setStatus(next); }).catch(() => undefined);
    const off = speech.onSpeech(event => ctl.fromMain(event));
    return () => { alive = false; off(); };
  }, [speech, ctl]);

  // Escape stops a dictation first; Ctrl+M starts or stops one in the focused text box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape' && run.current && !run.current.stopping) {
        event.preventDefault();
        event.stopPropagation();
        void ctl.stop();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'm') {
        const active = document.activeElement;
        if (document.querySelector('dialog[open]') && !isDictationElement(active)) return;
        const element = isDictationElement(active) ? active : run.current?.field.element ?? defaultTarget.current();
        if (!element) return;
        event.preventDefault();
        ctl.toggle(element);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ctl]);

  useEffect(() => {
    const hidden = () => { if (document.hidden) void ctl.stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [ctl]);

  // Leaving the screen ends the dictation and frees the microphone.
  useEffect(() => () => {
    const r = run.current;
    if (r) { r.early = true; r.settled = true; }
    if (r?.sessionId) void speech?.speechCancel({ sessionId: r.sessionId });
    r?.mic?.close();
    r?.detach();
    ctl.endLast();
  }, [speech, ctl]);

  const value = useMemo<Dictation>(() => ({
    phase, captureStartedAt, target, status, notice,
    toggle: element => ctl.toggle(element),
    stop: () => ctl.stop(),
    cancel: () => ctl.cancel(),
    settle: async element => { const r = run.current; if (r && element && r.field.element === element) await ctl.stop(); },
    onLevel: listener => { levelListeners.current.add(listener); return () => { levelListeners.current.delete(listener); }; },
    registerDefaultTarget: getter => { defaultTarget.current = getter; return () => { if (defaultTarget.current === getter) defaultTarget.current = () => null; }; },
  }), [phase, captureStartedAt, target, status, notice, ctl, speech]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
