import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, ClipboardPaste, Copy, LoaderCircle, Mic, RotateCcw, Settings2, Square, Undo2, X } from 'lucide-react';
import { useDictation } from './DictationProvider';

type TargetRef = RefObject<HTMLTextAreaElement | null>;

/** One recording control in the original action slot. Models ship with the app. */
export function VoiceButton({ targetRef, disabled }: { targetRef: TargetRef; disabled: boolean }) {
  const voice = useDictation();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => voice?.registerDefaultTarget(() => targetRef.current), [voice?.registerDefaultTarget, targetRef]);
  const active = !!voice && voice.phase !== 'idle' && voice.target === targetRef.current;
  useEffect(() => {
    if (!active) { button.current?.style.setProperty('--voice-level', '0'); return; }
    return voice?.onLevel(value => button.current?.style.setProperty('--voice-level', String(value)));
  }, [active, voice?.onLevel]);
  if (!voice) return null;
  const finishing = active && voice.phase === 'finishing';
  const verifying = !active && voice.status?.model.state === 'verifying';
  const problem = !active && voice.notice?.target === targetRef.current && voice.notice.tone === 'problem'
    && !voice.notice.actions.length ? voice.notice.text : '';
  const label = verifying ? '正在读取语音文件' : finishing ? '正在收好最后一句' : active ? '结束语音输入' : '语音输入';
  return <button ref={button} type="button" className={'icon-button voice-button' + (active ? ' is-listening' : '')}
    data-voice-control aria-label={label} aria-pressed={active} title={problem || label + ' · Ctrl+M'}
    disabled={disabled || finishing || verifying}
    onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
    onClick={() => voice.toggle(targetRef.current)}>
    {finishing || verifying ? <LoaderCircle size={20} className="voice-spinner" />
      : active ? <Square size={15} fill="currentColor" /> : problem ? <CircleAlert size={20} /> : <Mic size={21} />}
    <span className="sr-only" role="status">{problem}</span>
  </button>;
}

/** A six-second history of captured microphone levels; every column is real audio. */
function VoiceLevel() {
  const voice = useDictation();
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const history = Array<number>(64).fill(0);
    return voice?.onLevel(value => {
      history.shift(); history.push(value);
      Array.from(element.current?.children ?? []).forEach((bar, i) =>
        (bar as HTMLElement).style.setProperty('--level', String(history[i])));
    });
  }, [voice?.onLevel]);
  return <span ref={element} className="voice-level" aria-hidden="true">{Array.from({ length: 64 }, (_, i) => <i key={i} />)}</span>;
}

function VoiceClock() {
  const startedAt = useDictation()?.captureStartedAt;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  return <span className="voice-clock" aria-hidden="true">{Math.floor(seconds / 60).toString().padStart(2, '0')}:{(seconds % 60).toString().padStart(2, '0')}</span>;
}

function Feedback({ element, floating = false }: { element: HTMLElement | null; floating?: boolean }) {
  const voice = useDictation();
  if (!voice) return null;
  const active = voice.phase !== 'idle' && voice.target === element;
  const notice = voice.notice?.target === element ? voice.notice : null;
  if (!active && !notice) return null;
  if (!active && !notice?.actions.length) return <span className="sr-only" role="status">{notice?.text}</span>;
  return <div className={'voice-feedback' + (notice?.tone === 'problem' ? ' voice-problem' : '')}
    data-voice-control data-phase={active ? voice.phase : 'done'}>
    <span className="sr-only" role="status" aria-live="polite">{active
      ? voice.phase === 'preparing' ? '准备语音输入' : voice.phase === 'finishing' ? '收好最后一句' : '正在听，文字写在当前光标处'
      : notice?.text}</span>
    {active ? <><VoiceClock /><VoiceLevel /></> : <span className="voice-result" title={notice?.text}>
      {notice?.tone === 'problem' ? <CircleAlert size={17} /> : <Check size={17} />}</span>}
    <div className="voice-feedback-actions">
      {active ? <>
        {floating && <button type="button" className="icon-button" title="结束语音输入" aria-label="结束语音输入"
          disabled={voice.phase === 'finishing'} onClick={() => void voice.stop()}><Square size={13} fill="currentColor" /></button>}
        <button type="button" className="icon-button" title="取消这段语音" aria-label="取消这段语音" onClick={() => void voice.cancel()}><X size={17} /></button>
      </> : notice?.actions.map(action => <button key={action.label} type="button" className="icon-button" title={action.label} aria-label={action.label} onClick={action.run}>
        {action.kind === 'restore' ? <ClipboardPaste size={17} /> : action.kind === 'undo' ? <Undo2 size={18} />
          : action.kind === 'copy' ? <Copy size={17} /> : action.label.includes('设置') ? <Settings2 size={17} /> : <RotateCcw size={17} />}
      </button>)}
    </div>
  </div>;
}

export function VoiceFeedback({ targetRef }: { targetRef: TargetRef }) {
  return <Feedback element={targetRef.current} />;
}

/** Keyboard dictation in other fields unfolds in their own layout, without a popup. */
export function DictationFieldFeedback() {
  const voice = useDictation();
  const element = voice?.target ?? voice?.notice?.target;
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const visible = !!element && !element.closest('.composer') && element.isConnected
    && (voice?.target === element && voice?.phase !== 'idle' || voice?.notice?.target === element && !!voice?.notice?.actions.length);
  useLayoutEffect(() => {
    if (!visible || !element) { setHost(null); return; }
    const slot = document.createElement('div');
    slot.className = 'voice-inline-field';
    slot.setAttribute('data-voice-control', '');
    const anchor = element.closest('.local-search-input, label') ?? element;
    anchor.after(slot);
    setHost(slot);
    return () => { slot.remove(); setHost(null); };
  }, [element, visible]);
  if (!voice || !element) return null;
  if (!host) return element && !element.closest('.composer') && voice.notice?.target === element
    ? createPortal(<span className="sr-only" role="status">{voice.notice.text}</span>, element.closest('dialog') ?? document.body) : null;
  return createPortal(<Feedback element={element} floating />, host);
}
