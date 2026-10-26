import { useEffect, useId, useRef, useState } from 'react';
import { Activity, Bike, Footprints, LocateFixed, Pause, Play, RefreshCw, Route, Square, X } from 'lucide-react';
import type { WorkoutDeviceChoice } from '../../shared/types';
import type { WorkoutPendingStop, WorkoutRetention, WorkoutSessionRecord, WorkoutSport, WorkoutState } from '../../shared/workout';
import type { CampusMapEngine } from './map-engine';
import { DesktopWorkoutLayer, workoutMapCurrent } from './desktop-workout-layer';
import { inBounds } from '../../shared/map-routing';
import { uiError } from '../ui';
import './workout.css';

const api = window.zaichang;
const sports = { walking: '步行', running: '跑步', cycling: '骑行' } as const;
const sportIcons = { walking: Footprints, running: Activity, cycling: Bike };
const deviceKey = (device: WorkoutDeviceChoice) => `${device.source}:${device.deviceId}`;
function duration(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function pace(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}′${String(rounded % 60).padStart(2, '0')}″`;
}
function statusLabel(session: WorkoutSessionRecord) {
  if (session.status !== 'recording' && session.stream.status !== 'stopped') return '停止尚未确认';
  if (session.status === 'paused') return '已暂停';
  if (session.status === 'finished') return '本次结束';
  return ({ searching: '正在取得位置', good: '正在记录', weak: '位置信号较弱', disconnected: '位置已断开', stopped: '定位已停止' })[session.signal];
}
function signalReason(session: WorkoutSessionRecord) {
  const point = session.points.at(-1);
  if (point?.quality === 'accuracy') return point.raw.accuracy === null ? '这次位置没有精度信息，尚未计入里程。'
    : `位置精度约 ${Math.round(point.raw.accuracy)} 米，这次位置未计入里程。`;
  if (point?.quality === 'outlier') return '这次位置跳动较大，未计入里程。';
  if (point?.quality === 'stale') return '这次位置的时间没对上，没有计入里程。';
  if (point?.quality === 'source-change') return '位置来源有变化，已从新一段重新记录。';
  if (point?.quality === 'invalid') return '这次位置无法用于计算里程。';
  if (point?.quality === 'timestamp' || point && session.signal === 'weak') return '正在等待新的位置，暂时无法计算当前配速。';
  return session.stream.reason;
}
function retentionLabel(session: WorkoutSessionRecord) {
  if (session.persistence.status === 'encrypted-local') return '已加密保存在本机';
  return session.persistence.reason || (session.persistence.status === 'error' ? '尚未安全保存，先不要关闭应用' : '仅在当前窗口保留');
}
function cadenceNote(session: WorkoutSessionRecord) {
  if (session.metrics.cadenceStepsPerMinute !== null) return undefined;
  const observation = session.latestCadenceObservation;
  if (observation?.status === 'unsupported') return '设备没有计步传感器';
  if (observation?.status === 'denied' || observation?.permission === 'denied') return '未允许身体活动';
  if (session.status !== 'recording') return undefined;
  if (observation?.status === 'unavailable') return '暂时读不到步数';
  if (observation?.status === 'stopped') return '计步已停止';
  if (observation?.status === 'listening') return '等待新的脚步';
  return undefined;
}
function pendingStopAction(pending: WorkoutPendingStop) {
  const stopped = pending.stream.status === 'stopped';
  if (pending.sourceRetraction === 'unconfirmed') return stopped ? '重试清理' : '重试清理与停止';
  if (pending.localRemoval === 'unconfirmed') return stopped ? '重试删除记录' : '重试完成清理';
  return stopped ? '完成收尾' : '重试停止定位';
}
function readableError(error: unknown) {
  return uiError(error, { fallback: '刚才的操作没有完成。查看当前记录后，可以再继续。' });
}

/** Private controls for the native owner. Timers and metrics are always read back from it. */
export function WorkoutControls({ engine, mapOnly = false }: { engine?: CampusMapEngine; mapOnly?: boolean }) {
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<WorkoutState>();
  const stateRef = useRef(state);
  stateRef.current = state;
  const mapLayer = useRef<DesktopWorkoutLayer | undefined>(undefined);
  const [devices, setDevices] = useState<WorkoutDeviceChoice[]>([]);
  const [device, setDevice] = useState('');
  const [cleanupDevice, setCleanupDevice] = useState('');
  const [sport, setSport] = useState<WorkoutSport>('running');
  const [retention, setRetention] = useState<WorkoutRetention>('session-only');
  const [busy, setBusy] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState<'session' | 'recovery'>();
  const [newDraft, setNewDraft] = useState(false);
  const mounted = useRef(true);
  const eventVersion = useRef(0);
  const operation = useRef(false);
  const focusAfterAction = useRef(false);
  const deviceRequest = useRef(0);
  const deviceDefault = useRef('');
  const session = state?.session;
  const pendingStop = state?.pendingStop;
  const selected = devices.find(candidate => deviceKey(candidate) === device);
  const cleanupDevices = devices.filter(candidate => candidate.source === 'adb' || candidate.source === 'ios-simulator');
  const selectedCleanupDevice = cleanupDevices.find(candidate => deviceKey(candidate) === cleanupDevice && candidate.status === 'connected');
  const needsCleanupDevice = !!pendingStop?.requiresDeviceSelection && pendingStop.stream.status !== 'stopped';
  const producer = session?.recordingSource && devices.find(candidate => candidate.source === session.recordingSource!.source
    && (session.recordingSource!.deviceId ? candidate.deviceId === session.recordingSource!.deviceId : candidate.source === 'windows'));
  const current = session?.points.at(-1)?.raw;
  const mapPoint = workoutMapCurrent(session);
  const pointOnMap = !!engine && !!mapPoint && inBounds(mapPoint.raw.coordinate, engine.data.manifest.bounds);
  const live = session?.status === 'recording' || session?.status === 'paused';
  const stopUnconfirmed = !!session && session.status !== 'recording' && session.stream.status !== 'stopped';
  const settlingStop = stopUnconfirmed && ['暂停中', '结束中', '停止中'].includes(busy);
  const form = state?.access !== 'suspended' && !pendingStop && (!session || newDraft);
  const locked = !!busy || reading;

  async function readState(restore = false) {
    const version = eventVersion.current;
    const next = await (restore ? api.workoutRestore() : api.workoutState());
    if (mounted.current && version === eventVersion.current) setState(next);
    return next;
  }
  async function loadDevices() {
    const request = ++deviceRequest.current;
    setLoadingDevices(true);
    try {
      const next = await api.workoutDevices();
      if (mounted.current && request === deviceRequest.current) setDevices(next);
    } catch (failure) { if (mounted.current && request === deviceRequest.current) setError(readableError(failure)); }
    finally { if (mounted.current && request === deviceRequest.current) setLoadingDevices(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = api.onWorkout(next => { eventVersion.current++; setState(next); });
    void readState().catch(failure => { if (mounted.current) setError(readableError(failure)); });
    return () => { mounted.current = false; deviceRequest.current++; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!engine) return;
    const layer = new DesktopWorkoutLayer(engine);
    mapLayer.current = layer;
    layer.update(stateRef.current);
    return () => { layer.dispose(); if (mapLayer.current === layer) mapLayer.current = undefined; };
  }, [engine]);
  useEffect(() => { mapLayer.current?.update(state); }, [state]);
  useEffect(() => {
    if (!open) return;
    setError('');
    setReading(true);
    void readState(true).catch(async failure => {
      if (mounted.current) setError(readableError(failure));
      await readState().catch(() => undefined);
    }).finally(() => { if (mounted.current) setReading(false); });
    void loadDevices();
    panel.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open || session?.status !== 'recording') return;
    const timer = window.setInterval(() => { void readState().catch(() => undefined); }, 1000);
    return () => window.clearInterval(timer);
  }, [open, session?.id, session?.status]);
  useEffect(() => {
    const source = session?.recordingSource;
    if (!source || !session) return;
    const identity = `${session.id}:${source.source}:${source.deviceId || ''}`;
    if (identity === deviceDefault.current) return;
    const match = devices.find(candidate => candidate.status === 'connected' && candidate.source === source.source
      && (source.deviceId ? candidate.deviceId === source.deviceId : candidate.source === 'windows'));
    if (match) { deviceDefault.current = identity; setDevice(deviceKey(match)); }
  }, [session?.id, session?.recordingSource?.source, session?.recordingSource?.deviceId, devices]);
  useEffect(() => { setConfirmDiscard(undefined); setNewDraft(false); }, [session?.id]);
  useEffect(() => { setCleanupDevice(''); }, [pendingStop?.id, pendingStop?.requiresDeviceSelection]);
  useEffect(() => {
    if (open && !busy && focusAfterAction.current) {
      focusAfterAction.current = false;
      (panel.current?.querySelector<HTMLButtonElement>('.workout-primary:not(:disabled)') || panel.current)?.focus({ preventScroll: true });
    }
  }, [open, busy, state]);

  function close() { setOpen(false); setConfirmDiscard(undefined); trigger.current?.focus({ preventScroll: true }); }
  async function act(label: string, action: () => Promise<WorkoutState>) {
    if (operation.current || reading) return;
    operation.current = true; setBusy(label); setError('');
    const version = eventVersion.current;
    try {
      const next = await action();
      if (mounted.current) {
        focusAfterAction.current = true;
        if (version === eventVersion.current) setState(next);
        setConfirmDiscard(undefined);
        setNewDraft(false);
      }
    } catch (failure) {
      if (mounted.current) setError(readableError(failure));
      await readState().catch(() => undefined);
    } finally { operation.current = false; if (mounted.current) setBusy(''); }
  }
  const reference = session ? { id: session.id, expectedRevision: session.revision }
    : pendingStop ? { id: pendingStop.id, expectedRevision: pendingStop.revision }
    : state?.suspendedSession ? { id: state.suspendedSession.id, expectedRevision: state.suspendedSession.revision } : undefined;
  const chosenDevice = selected && selected.status === 'connected' ? { source: selected.source, deviceId: selected.deviceId } : undefined;
  const Icon = sportIcons[session?.sport || sport];
  const source = session?.provenance === 'simulated' || current?.provenance === 'simulated' || !current && producer?.provenance === 'simulated'
    ? '模拟位置' : session?.provenance === 'device' ? '设备位置' : '位置来源尚未确认';

  if (mapOnly) return null;
  return <div className="workout-controls" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" className="workout-trigger" aria-expanded={open} aria-controls={panelId}
      onClick={() => open ? close() : setOpen(true)}><Activity size={15} /><span>{pendingStop ? pendingStop.stream.status === 'stopped' ? '完成清理' : '停止定位' : live ? session.status === 'paused' ? '运动已暂停' : '运动记录中' : '运动'}</span>{live && <output className="workout-trigger-distance">{(session.metrics.distanceMeters / 1000).toFixed(2)}<small>公里</small></output>}</button>
    {open && <section ref={panel} id={panelId} className="workout-panel campus-v2-obstruction" tabIndex={-1} aria-label="运动记录" aria-busy={locked}>
      <header className="workout-head"><div><Icon size={20} /><strong>{form ? '记录一次运动' : session ? sports[session.sport] : '运动记录'}</strong>
        {session && !form && <span>{settlingStop ? '正在停止定位' : statusLabel(session)}</span>}</div><button type="button" aria-label="收起运动记录" onClick={close}><X size={18} /></button></header>
      {error && !pendingStop && <p className="workout-notice" role="alert">{error}<button type="button" disabled={locked} onClick={() => void act('读取中', () => api.workoutState())}>查看当前记录</button></p>}
      {(!state || reading && !session) && !error && <p className="workout-note" role="status">正在读取这次运动…</p>}
      {pendingStop && <div className="workout-recovery"><p role="status">{pendingStop.localRemoval === 'complete' ? pendingStop.stream.status === 'stopped' ? '运动记录已删除，定位已停止。' : '运动记录已删除，定位停止仍不能确认。'
        : pendingStop.stream.status === 'stopped' ? '定位已停止，运动记录的本机删除仍不能确认。' : '运动记录的本机删除和定位停止仍不能确认。'}</p>
        {pendingStop.sourceRetraction === 'unconfirmed' && <p className="workout-note">旧引用还没有清理完，可以重试清理。</p>}
        {pendingStop.persistence.status !== 'encrypted-local' && <p className="workout-note">{pendingStop.persistence.reason || '这次清理还没有安全保存在本机，先不要关闭在场。'}</p>}
        {pendingStop.stream.status !== 'stopped' && <p className="workout-note">{pendingStop.stream.reason}</p>}
        {error && <p className="workout-note" role="alert">{error}</p>}
        {needsCleanupDevice && <div className="workout-cleanup-device">
          <label className="workout-field"><span>当时的定位设备</span><select aria-label="核对旧运动的定位设备" value={cleanupDevice} disabled={locked || loadingDevices} onChange={event => setCleanupDevice(event.target.value)}><option value="">选择当时的设备</option>{cleanupDevices.map(candidate => <option key={deviceKey(candidate)} value={deviceKey(candidate)} disabled={candidate.status !== 'connected'}>{candidate.deviceLabel}{candidate.provenance === 'simulated' ? '（模拟位置）' : ''}</option>)}</select></label>
          <p className="workout-note">选择当时的设备，核对并停止同一条运动记录。</p>
          {!loadingDevices && !cleanupDevices.some(candidate => candidate.status === 'connected') && <p className="workout-note">没有可核对的 Android 设备或 iOS 模拟器。连接当时的设备后，重新寻找。</p>}
          <button type="button" disabled={locked || loadingDevices} onClick={() => void loadDevices()}>{loadingDevices ? '正在寻找…' : '重新寻找设备'}</button>
        </div>}
        <button className="workout-primary" type="button" disabled={locked || needsCleanupDevice && !selectedCleanupDevice} onClick={() => void act('重试中', () => api.workoutCancel({ id: pendingStop.id, expectedRevision: pendingStop.revision,
          ...(needsCleanupDevice && selectedCleanupDevice ? { device: { source: selectedCleanupDevice.source, deviceId: selectedCleanupDevice.deviceId } } : {}) }))}>{busy || pendingStopAction(pendingStop)}</button></div>}
      {state?.access === 'suspended' && !pendingStop && <div className="workout-recovery"><p>运动记录先停在这里。回到私人地图并允许位置访问后，可以重新读取。</p><button className="workout-primary" type="button" disabled={locked} onClick={() => void act('读取中', () => api.workoutRestore())}>重新读取记录</button>
        {reference && state.suspendedSession?.status !== 'finished' && <button type="button" disabled={locked} onClick={() => void act('结束中', () => api.workoutFinish(reference))}>结束这次运动</button>}</div>}
      {state?.recoveryError && <div className="workout-notice"><p>{state.recoveryError}</p><div className="workout-inline-actions"><button type="button" disabled={locked} onClick={() => void act('读取中', () => api.workoutRestore())}>重新读取</button><button type="button" disabled={locked} onClick={() => setConfirmDiscard('recovery')}>丢弃旧草稿</button></div></div>}
      {form && state && !reading && <form onSubmit={event => { event.preventDefault(); if(chosenDevice) void act('开始中', () => api.workoutStart({ sport, retention, device: chosenDevice })); }}>
        <fieldset className="workout-sports" disabled={locked}><legend className="sr-only">运动类型</legend>{(Object.keys(sports) as WorkoutSport[]).map(choice => {
          const SportIcon = sportIcons[choice];
          return <label key={choice}><input type="radio" name={`${panelId}-sport`} value={choice} checked={sport === choice} onChange={() => setSport(choice)} /><span><SportIcon size={17} />{sports[choice]}</span></label>;
        })}</fieldset>
        <div className="workout-field"><label htmlFor={`${panelId}-device`}>定位设备</label><div><select id={`${panelId}-device`} value={device} disabled={locked || loadingDevices} onChange={event => setDevice(event.target.value)} required aria-label="定位设备"><option value="">{loadingDevices ? '正在寻找设备…' : '选择定位设备'}</option>{devices.map(choice => <option key={deviceKey(choice)} value={deviceKey(choice)} disabled={choice.status !== 'connected'}>{choice.deviceLabel}{choice.provenance === 'simulated' ? '（模拟位置）' : ''}{choice.status !== 'connected' ? ` · ${{ unavailable: '不可用', unauthorized: '尚未允许连接', offline: '已离线', connected: '' }[choice.status]}` : ''}</option>)}</select><button type="button" aria-label="重新寻找设备" disabled={locked || loadingDevices} onClick={() => void loadDevices()}><RefreshCw size={16} /></button></div></div>
        {selected?.provenance === 'simulated' && <p className="workout-note">这台模拟器提供模拟位置。</p>}
        {selected?.reason && <p className="workout-note">{selected.reason}</p>}
        <fieldset className="workout-retention" disabled={locked}><legend>记录保留</legend><label><input type="radio" name={`${panelId}-retention`} checked={retention === 'session-only'} onChange={() => setRetention('session-only')} /><span>当前窗口</span></label><label><input type="radio" name={`${panelId}-retention`} checked={retention === 'encrypted-local'} onChange={() => setRetention('encrypted-local')} /><span>加密保存在本机</span></label></fieldset>
        {newDraft && <p className="workout-note">开始后将替换这份记录。</p>}
        <button className="workout-primary" type="submit" disabled={locked || !chosenDevice}><Play size={16} />{busy || '开始记录'}</button>
        {newDraft && <button className="workout-text-action" type="button" onClick={() => setNewDraft(false)}>返回本次记录</button>}
        <details className="workout-connection-details"><summary>设备与保存</summary><p>关闭应用后，当前窗口的记录无法恢复；加密草稿重新打开时先暂停。</p>{!devices.some(choice => choice.source === 'hdc') && !loadingDevices && <p>没有可选的鸿蒙设备。</p>}{devices.filter(choice => choice.status !== 'connected').map(choice => <p key={deviceKey(choice)}>{choice.deviceLabel}：{choice.reason || '当前无法用于定位'}</p>)}</details>
      </form>}
      {session && !form && <>
        <p className="workout-source">{current?.deviceLabel || producer?.deviceLabel || '定位设备'} · {source}</p>
        {pointOnMap && <div className="workout-map-actions"><button type="button" onClick={() => { close(); mapLayer.current?.overview(); }}><Route size={15} />查看轨迹</button><button type="button" onClick={() => { close(); mapLayer.current?.locate(); }}><LocateFixed size={15} />回到位置</button></div>}
        {engine && mapPoint && !pointOnMap && <p className="workout-note">上次记录的位置在这张校园地图之外。</p>}
        <div className="workout-distance"><output aria-live="off">{(session.metrics.distanceMeters / 1000).toFixed(2)}</output><span>公里</span></div>
        <dl className="workout-metrics"><div><dt>记录用时</dt><dd>{duration(session.metrics.elapsedActiveMs)}</dd></div><div><dt>{session.status === 'finished' ? '平均配速' : '当前配速'}</dt><dd>{pace(session.status === 'finished' ? session.metrics.averagePaceSecondsPerKm : session.metrics.paceSecondsPerKm)}<small>{(session.status === 'finished' ? session.metrics.averagePaceSecondsPerKm : session.metrics.paceSecondsPerKm) !== null ? '/公里' : '未知'}</small></dd></div></dl>
        {session.pauseDetail && <p className="workout-note">{session.pauseDetail}</p>}
        {session.status === 'recording' && session.signal !== 'good' && <p className="workout-note">{signalReason(session)}</p>}
        {stopUnconfirmed && !settlingStop && <p className="workout-note" role="status">{session.stream.reason}</p>}
        {session.persistence.status !== 'encrypted-local' && <p className="workout-note">{retentionLabel(session)}</p>}
        <details className="workout-record-details"><summary>本次记录</summary><dl><div><dt>定位计入用时</dt><dd>{duration(session.metrics.trustedActiveMs)}</dd></div><div><dt>平均配速</dt><dd>{pace(session.metrics.averagePaceSecondsPerKm)}</dd></div><div><dt>步频</dt><dd>{session.metrics.cadenceStepsPerMinute === null ? '未知' : `${Math.round(session.metrics.cadenceStepsPerMinute)} 步/分钟`}{cadenceNote(session) && <small>{cadenceNote(session)}</small>}</dd></div><div><dt>记录保留</dt><dd>{retentionLabel(session)}</dd></div></dl>
          {session.splits.length > 0 && <ol className="workout-splits" aria-label="每公里记录">{session.splits.map(split => <li key={split.kilometer}><span>{split.kilometer} 公里</span><span>{pace(split.paceSecondsPerKm)}<small>/公里</small></span></li>)}</ol>}
          <p>本机运动记录，未提交学校。</p></details>
        <div className="workout-actions">{session.status === 'recording' && <button className="workout-primary" type="button" disabled={locked} onClick={() => reference && void act('暂停中', () => api.workoutPause(reference))}><Pause size={16} />{busy || '暂停'}</button>}
          {stopUnconfirmed && <button className="workout-primary" type="button" disabled={locked} onClick={() => reference && void act('停止中', () => session.status === 'finished' ? api.workoutFinish(reference) : api.workoutPause(reference))}>{busy || '重试停止定位'}</button>}
          {session.status === 'paused' && !stopUnconfirmed && <button className="workout-primary" type="button" disabled={locked || !chosenDevice} onClick={() => reference && chosenDevice && void act('继续中', () => api.workoutResume({ ...reference, device: chosenDevice }))}><Play size={16} />{busy || '继续记录'}</button>}
          {live && !stopUnconfirmed && <button type="button" disabled={locked} onClick={() => reference && void act('结束中', () => api.workoutFinish(reference))}><Square size={14} />结束</button>}
          {session.status === 'finished' && !stopUnconfirmed && <button className="workout-primary" type="button" disabled={locked} onClick={() => setNewDraft(true)}>再记一次</button>}</div>
        {session.status === 'paused' && <details className="workout-connection-details" open={!chosenDevice || undefined}><summary>{chosenDevice ? '更换定位设备' : '选择继续时的设备'}</summary><label className="workout-field"><span>继续时使用</span><select aria-label="继续时使用的定位设备" value={device} disabled={locked || loadingDevices} onChange={event => setDevice(event.target.value)}><option value="">选择继续时的设备</option>{devices.map(choice => <option key={deviceKey(choice)} value={deviceKey(choice)} disabled={choice.status !== 'connected'}>{choice.deviceLabel}{choice.provenance === 'simulated' ? '（模拟位置）' : ''}</option>)}</select></label><button type="button" disabled={locked || loadingDevices} onClick={() => void loadDevices()}>重新寻找设备</button></details>}
      </>}
      {reference && !pendingStop && !form && !confirmDiscard && <button type="button" className="workout-text-action" disabled={locked} onClick={() => setConfirmDiscard('session')}>取消并丢弃这次记录</button>}
      {confirmDiscard && <div className="workout-discard" role="group" aria-label="丢弃运动记录"><p>{confirmDiscard === 'recovery' ? '丢弃无法读取的旧草稿？' : '停止记录并丢弃这次运动？'}</p><div><button type="button" disabled={locked} onClick={() => setConfirmDiscard(undefined)}>保留记录</button><button type="button" disabled={locked} onClick={() => void act('丢弃中', () => confirmDiscard === 'recovery' ? api.workoutDiscardRecovery() : api.workoutCancel(reference!))}>确认丢弃</button></div></div>}
    </section>}
  </div>;
}
