import { useEffect } from 'react';
import { LampDesk, Pause, Play, Square, X } from 'lucide-react';
import { focusSession, useFocusSession, type FocusSession } from './focus-session';
import './life-continuity.css';

export function focusTime(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000), hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function FocusLamp({ onActiveChange, onFinish, disabled = false }: {
  onActiveChange?: (active: boolean) => void;
  onFinish?: (session: FocusSession) => void;
  disabled?: boolean;
}) {
  const session = useFocusSession(), running = session.status === 'running';
  useEffect(() => { onActiveChange?.(running); }, [running, onActiveChange]);
  return <div className="focus-lamp" data-state={session.status} aria-label="一盏灯的专注">
    <span className="focus-lamp-light" aria-hidden="true"><LampDesk size={20} /></span>
    {session.status === 'idle' ? <button type="button" disabled={disabled} onClick={() => focusSession.start()}>点亮这盏灯</button> : <>
      <time className="focus-lamp-time" aria-label={`这一段专注 ${focusTime(session.elapsedMs)}`}>{focusTime(session.elapsedMs)}</time>
      {session.status === 'ended' ? <>
        <button type="button" disabled={disabled} onClick={() => focusSession.start()}>再点亮</button>
        <button className="focus-lamp-icon" type="button" aria-label="收起这段计时" onClick={() => focusSession.clear()}><X size={14} /></button>
      </> : <>
        <button type="button" disabled={disabled} onClick={() => running ? focusSession.pause() : focusSession.resume()}>
          {running ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}{running ? '暂停' : '接着专注'}
        </button>
        <button type="button" disabled={disabled} onClick={() => { const ended = focusSession.end(); if (ended) onFinish?.(ended); }}><Square size={11} aria-hidden="true" />结束</button>
      </>}
    </>}
    {session.storageUnavailable && <span className="focus-lamp-issue" role="status">这段计时暂时没能留在本机</span>}
  </div>;
}
