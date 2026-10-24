import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { hostname, homedir } from 'node:os';
import { join } from 'node:path';
import type { WorkoutCadenceObservation, WorkoutInputFix, WorkoutLocationStream, WorkoutStopOwner, WorkoutStreamStatus } from '../shared/workout';

export interface WorkoutLocationOptions {
  source?: 'windows' | 'adb' | 'hdc';
  /** A transport returned by discoverLocationDevices, never an implicit first phone. */
  deviceId?: string;
  executablePath?: string;
  simulated?: boolean;
  pollIntervalMs?: number;
  /** The workout owner identity, persisted in its private draft for recovery stop. */
  workoutId?: string;
}
export interface LocationDevice {
  transport: 'adb' | 'hdc';
  deviceId: string;
  deviceLabel: string;
  aliases: string[];
  status: 'connected' | 'unauthorized' | 'offline';
  provenance: 'simulated' | 'unknown';
}

function executable(kind: 'adb' | 'hdc', explicit?: string) {
  if (explicit) return explicit;
  const configured = process.env[kind === 'adb' ? 'ZAICHANG_ADB_PATH' : 'ZAICHANG_HDC_PATH'];
  if (configured) return configured;
  if (kind === 'adb') {
    const candidates = [
      ...(process.env.ANDROID_HOME ? [join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe')] : []),
      join(homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
      join(process.env.ProgramFiles || 'C:\\Program Files', 'Netease', 'MuMu', 'nx_main', 'adb.exe'),
    ];
    const installed = candidates.find(candidate => existsSync(candidate));
    if (installed) return installed;
  }
  return kind === 'adb' ? 'adb.exe' : 'hdc.exe';
}

/** Bounded CLI calls; no shell, credentials, UI scraping, or raw coordinate logs. */
function command(path: string, args: string[], signal?: AbortSignal, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('cancelled')); return; }
    const child = spawn(path, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '', settled = false;
    const finish = (failure?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      failure ? reject(failure) : resolve(output);
    };
    const abort = () => { child.kill(); finish(new Error('cancelled')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('device command timed out')); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout?.on('data', buffer => {
      output += buffer.toString('utf8');
      if (output.length > 524288) { child.kill(); finish(new Error('device response too large')); }
    });
    child.stderr?.on('data', buffer => { if (error.length < 8192) error += buffer.toString('utf8'); });
    child.on('error', failure => finish(failure));
    child.on('close', code => finish(code === 0 ? undefined : new Error(/unauthorized/i.test(error + output) ? 'unauthorized' : /offline|not found|no devices/i.test(error + output) ? 'disconnected' : 'device command failed')));
  });
}

export async function discoverLocationDevices(options: Pick<WorkoutLocationOptions, 'source' | 'executablePath'> = {}, signal?: AbortSignal): Promise<LocationDevice[]> {
  const kind = options.source === 'hdc' ? 'hdc' : 'adb', path = executable(kind, options.executablePath);
  const output = await command(path, kind === 'adb' ? ['devices', '-l'] : ['list', 'targets'], signal);
  if (kind === 'hdc') return output.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('[')).map(deviceId => ({ transport: kind, deviceId, aliases: [deviceId], deviceLabel: '已连接的鸿蒙设备', status: 'connected', provenance: 'unknown' }));
  const devices: LocationDevice[] = [];
  const identities = new Map<string, LocationDevice>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(device|unauthorized|offline)(?:\s|$)/);
    if (!match) continue;
    const device: LocationDevice = { transport: 'adb', deviceId: match[1], aliases: [match[1]], deviceLabel: line.match(/model:(\S+)/)?.[1]?.replaceAll('_', ' ') || 'Android 设备', status: match[2] === 'device' ? 'connected' : match[2] as 'unauthorized' | 'offline', provenance: 'unknown' };
    if (device.status === 'connected') {
      try {
        // The boot identity deduplicates USB/TCP aliases without reading a personal Android ID.
        const boot = (await command(path, ['-s', device.deviceId, 'shell', 'cat', '/proc/sys/kernel/random/boot_id'], signal)).trim();
        if (/^[a-f\d-]{36}$/i.test(boot)) {
          const existing = identities.get(boot);
          if (existing) { existing.aliases.push(device.deviceId); continue; }
          identities.set(boot, device);
        }
      } catch { /* An unreadable boot identity must not invent equality. */ }
      // Match the native bridge's independent emulator checks before recording starts.
      // An ordinary-looking model name is never evidence that this is a real phone.
      const metadata = await Promise.allSettled([
        command(path, ['-s', device.deviceId, 'shell', 'getprop'], signal),
        command(path, ['-s', device.deviceId, 'shell', 'pm', 'path', 'com.nemu.nlp'], signal),
      ]);
      const build = metadata[0].status === 'fulfilled' ? metadata[0].value.split(/\r?\n/)
        .filter(row => /^\[(ro\.build\.fingerprint|ro\.hardware|ro\.product\.model)\]:/.test(row)).join(' ').toLowerCase() : '';
      if (/(generic|emulator|goldfish|ranchu|vbox|nemu|qemu)/.test(build)
        || metadata[1].status === 'fulfilled' && metadata[1].value.includes('package:')) device.provenance = 'simulated';
    }
    devices.push(device);
  }
  return devices;
}

const nativeWatch = String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$watcher=$null
$parent=$null
function Emit($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function NumberOrNull($value) { if([double]::IsNaN($value) -or [double]::IsInfinity($value)) { return $null }; return $value }
try {
  $parent=[System.Diagnostics.Process]::GetProcessById(__PARENT_PID__)
  $null=$parent.Handle
  Add-Type -AssemblyName System.Device
  $watcher=New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High)
  $watcher.MovementThreshold=0
  $watcher.Start($false)
  if($watcher.Permission -eq 'Denied') { Emit @{status='denied';reason='Windows 没有允许本次读取位置。'}; exit }
  Emit @{status='listening';reason='正在等待 Windows 提供位置。'}
  $last=0
  while(-not $parent.HasExited) {
    if($watcher.Permission -eq 'Denied') { Emit @{status='denied';reason='Windows 位置权限已关闭。'}; exit }
    $p=$watcher.Position
    if(-not $p.Location.IsUnknown) {
      $at=$p.Timestamp.ToUnixTimeMilliseconds()
      if($at -ne $last) {
        $last=$at
        Emit @{status='fix';longitude=$p.Location.Longitude;latitude=$p.Location.Latitude;accuracy=(NumberOrNull $p.Location.HorizontalAccuracy);timestamp=$at;altitude=(NumberOrNull $p.Location.Altitude);altitudeAccuracy=(NumberOrNull $p.Location.VerticalAccuracy);speed=(NumberOrNull $p.Location.Speed);heading=(NumberOrNull $p.Location.Course)}
      }
    }
    Start-Sleep -Milliseconds 250
  }
} catch { Emit @{status='unavailable';reason='Windows 暂时无法提供位置，请检查系统位置服务。'} }
finally { if($watcher){$watcher.Stop();$watcher.Dispose()}; if($parent){$parent.Dispose()} }
`;

class WindowsWorkoutStream implements WorkoutLocationStream {
  private child?: ChildProcess;
  private closed?: Promise<void>;
  private status?: (status: WorkoutStreamStatus) => void;
  private generation = 0;
  private closing?: Promise<void>;
  async start(onFix: (fix: WorkoutInputFix) => void, onStatus: (status: WorkoutStreamStatus) => void) {
    const generation = ++this.generation;
    await this.closeChild();
    if (generation !== this.generation) return;
    this.status = onStatus;
    if (process.platform !== 'win32' || process.env.ZAICHANG_TEST_NO_NATIVE_LOCATION === '1') { onStatus({ status: 'unavailable', reason: '当前宿主没有启用本机定位。' }); return; }
    onStatus({ status: 'starting', reason: '正在向 Windows 请求本次运动的位置。' });
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', nativeWatch.replace('__PARENT_PID__', String(process.pid))], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    this.child = child;
    let output = '';
    const deviceId = `windows:${createHash('sha256').update(hostname()).digest('hex').slice(0, 24)}`;
    child.stdout?.on('data', buffer => {
      if (generation !== this.generation) return;
      output += buffer.toString('utf8');
      if (output.length > 16384) { child.kill(); onStatus({ status: 'unavailable', reason: 'Windows 返回的位置无法读取。' }); return; }
      let end: number;
      while ((end = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, end); output = output.slice(end + 1);
        try {
          const value = JSON.parse(line);
          if (value.status !== 'fix') { if (['denied', 'unavailable', 'listening'].includes(value.status)) onStatus({ status: value.status, reason: value.reason }); continue; }
          if (![value.longitude, value.latitude, value.timestamp].every(Number.isFinite) || value.timestamp <= 0) continue;
          onFix({ coordinate: [value.longitude, value.latitude], crs: 'EPSG:4326', timestamp: value.timestamp, receivedAt: Date.now(),
            accuracy: finiteOrNull(value.accuracy), accuracyConfidence: 'unknown', altitude: finiteOrNull(value.altitude), altitudeAccuracy: finiteOrNull(value.altitudeAccuracy), altitudeDatum: 'unknown', speed: finiteOrNull(value.speed), heading: finiteOrNull(value.heading),
            deviceId, deviceLabel: '这台 Windows 电脑', source: 'windows-native', transport: 'windows', provenance: 'device', mock: null });
        } catch { /* An incomplete JSON line never becomes a fix. */ }
      }
    });
    this.closed = new Promise(resolve => {
      child.on('error', () => { if (generation === this.generation) onStatus({ status: 'unavailable', reason: '无法启动 Windows 位置服务。' }); resolve(); });
      child.on('close', () => { if (generation === this.generation) onStatus({ status: 'unavailable', reason: 'Windows 的位置读取已结束。' }); resolve(); });
    });
  }
  async stop() {
    this.generation++;
    await this.closeChild();
  }
  private async closeChild() {
    if (this.closing) return this.closing;
    const child = this.child; this.child = undefined;
    if (!child) return;
    const pending = (async () => {
      child.kill(); await this.closed;
      this.status?.({ status: 'stopped', reason: '本机位置读取已停止。' });
    })();
    this.closing = pending;
    try { await pending; }
    finally { if (this.closing === pending) this.closing = undefined; }
  }
}

const packageName = 'cn.zaichang.location';
function finiteOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }

class AdbWorkoutStream implements WorkoutLocationStream {
  private controller?: AbortController;
  private session = '';
  private serial = '';
  private running = false;
  private launching?: Promise<string>;
  private pumping?: Promise<void>;
  private wake?: () => void;
  private onStatus?: (status: WorkoutStreamStatus) => void;
  private lastStatus = '';
  private lastSequence = 0;
  private lastCadenceSequence = 0;
  private simulated = false;
  private readonly path: string;
  private readonly workoutId: string;
  private startAttempted = false;
  private launchAttempted = false;
  constructor(private options: WorkoutLocationOptions) {
    this.path = executable('adb', options.executablePath);
    this.workoutId = options.workoutId || randomUUID();
    if (!/^[a-f\d-]{36}$/i.test(this.workoutId)) throw new Error('这次运动的身份无法核对。');
  }
  private status(value: WorkoutStreamStatus) { const key = JSON.stringify(value); if (key !== this.lastStatus) { this.lastStatus = key; this.onStatus?.(value); } }
  async start(onFix: (fix: WorkoutInputFix) => void, onStatus: (status: WorkoutStreamStatus) => void, onCadence?: (observation: WorkoutCadenceObservation) => void) {
    if (this.startAttempted || this.launchAttempted) await this.stop();
    this.startAttempted = true; this.onStatus = onStatus; this.lastStatus = ''; this.lastSequence = 0; this.lastCadenceSequence = 0;
    this.session = randomUUID(); const session = this.session;
    this.controller = new AbortController(); const signal = this.controller.signal;
    this.running = true; this.status({ status: 'starting', reason: '正在连接本次运动使用的 Android 设备。' });
    try {
      const devices = await discoverLocationDevices({ source: 'adb', executablePath: this.path }, signal);
      if (signal.aborted || session !== this.session) return;
      const device = this.options.deviceId ? devices.find(value => value.aliases.includes(this.options.deviceId!)) : devices.length === 1 ? devices[0] : undefined;
      if (!device) { this.status({ status: 'disconnected', reason: devices.length ? '检测到多台设备，请先选择本次运动使用的设备。' : '没有检测到已授权的 Android 设备。' }); this.running = false; return; }
      if (device.status !== 'connected') { this.status({ status: device.status === 'unauthorized' ? 'denied' : 'disconnected', reason: device.status === 'unauthorized' ? '请在这台设备上允许本机调试连接。' : '所选设备当前已离线。' }); this.running = false; return; }
      this.simulated = this.options.simulated === true || device.provenance === 'simulated';
      this.serial = this.options.deviceId || device.deviceId;
      if (!/^[\w.:[\]-]+$/.test(this.serial)) throw new Error('invalid device identity');
      const installed = await command(this.path, ['-s', this.serial, 'shell', 'pm', 'path', packageName], signal);
      if (!this.running || signal.aborted || session !== this.session) return;
      if (!installed.includes('package:')) { this.status({ status: 'unavailable', reason: '这台 Android 设备还没有安装在场位置桥，请先安装后再开始。' }); this.running = false; return; }
      this.launchAttempted = true;
      this.launching = command(this.path, ['-s', this.serial, 'shell', 'am', 'start', '-W', '-n', `${packageName}/.BridgeActivity`, '--es', 'session', session, '--es', 'workoutId', this.workoutId, '--ez', 'simulated', String(this.simulated)], signal, 15000);
      await this.launching;
      if (!this.running || signal.aborted || session !== this.session) return;
      this.pumping = this.pump(session, signal, onFix, onCadence);
    } catch (error) {
      if (!signal.aborted && session === this.session) { this.status({ status: 'disconnected', reason: '无法连接所选 Android 设备，请检查设备与调试连接。' }); this.running = false; }
    } finally { this.launching = undefined; }
  }
  private async pump(session: string, signal: AbortSignal, onFix: (fix: WorkoutInputFix) => void, onCadence?: (observation: WorkoutCadenceObservation) => void) {
    let keepaliveAt = 0;
    while (this.running && session === this.session && !signal.aborted) {
      try {
        if (!keepaliveAt || performance.now() - keepaliveAt >= 5000) { await command(this.path, ['-s', this.serial, 'shell', 'am', 'broadcast', '-a', 'cn.zaichang.location.KEEPALIVE', '-n', `${packageName}/.StopReceiver`, '--es', 'session', session, '--es', 'workoutId', this.workoutId], signal); keepaliveAt = performance.now(); }
        const text = await command(this.path, ['-s', this.serial, 'shell', 'run-as', packageName, 'cat', 'files/location-state.json'], signal);
        if (!this.running || signal.aborted || session !== this.session) break;
        const state = JSON.parse(text);
        if (state.schemaVersion !== 1 || state.session !== session || state.workoutId !== this.workoutId) { this.status({ status: 'unavailable', reason: '设备上的定位会话已改变，请先核对原来的运动；没有接管其它位置读取。' }); break; }
        if (!Number.isFinite(state.updatedAt) || Date.now() - state.updatedAt > 15000 || state.updatedAt - Date.now() > 30000) { this.status({ status: 'unavailable', reason: '设备位置服务暂时没有更新，请回到设备查看。' }); }
        else {
          if (['starting', 'listening', 'unavailable', 'denied', 'stopped'].includes(state.status)) this.status({ status: state.status, reason: typeof state.reason === 'string' ? state.reason.slice(0, 240) : '正在等待设备位置。' });
          if (onCadence && Array.isArray(state.cadence)) for (const value of state.cadence.slice(-64)) {
            if (!Number.isSafeInteger(value.sequence) || value.sequence <= this.lastCadenceSequence
              || !['listening', 'unsupported', 'denied', 'unavailable', 'stopped'].includes(value.status)
              || ![null, 'android-step-detector', 'android-step-counter'].includes(value.source)
              || !['granted', 'denied', 'not-required', 'unknown'].includes(value.permission)
              || value.subscriptionId !== session || value.deviceId !== state.deviceId
              || typeof value.clockId !== 'string' || value.clockId.length > 256
              || ![value.timestamp, value.elapsedRealtimeMs].every(Number.isFinite)
              || value.cumulativeSteps !== null && (!Number.isSafeInteger(value.cumulativeSteps) || value.cumulativeSteps < 0)) continue;
            this.lastCadenceSequence = value.sequence;
            onCadence({ status: value.status, source: value.source, permission: value.permission, deviceId: value.deviceId,
              clockId: value.clockId, subscriptionId: session, sequence: value.sequence, timestamp: value.timestamp, receivedAt: Date.now(),
              elapsedRealtimeMs: value.elapsedRealtimeMs, cumulativeSteps: value.cumulativeSteps,
              provenance: this.simulated || value.provenance === 'simulated' ? 'simulated' : value.provenance === 'device' ? 'device' : 'unknown',
              ...(value.sensor && typeof value.sensor.name === 'string' && typeof value.sensor.vendor === 'string' && Number.isSafeInteger(value.sensor.version) && value.sensor.version >= 0
                ? { sensor: { name: value.sensor.name.slice(0, 160), vendor: value.sensor.vendor.slice(0, 160), version: value.sensor.version } } : {}) });
          }
          if (state.status === 'listening' && Array.isArray(state.fixes)) for (const value of state.fixes) {
            if (!Number.isSafeInteger(value.sequence) || value.sequence <= this.lastSequence || !Array.isArray(value.coordinate) || value.coordinate.length !== 2 || !value.coordinate.every(Number.isFinite) || value.crs !== 'EPSG:4326' || !Number.isFinite(value.timestamp) || value.timestamp <= 0 || typeof value.deviceId !== 'string') continue;
            this.lastSequence = value.sequence;
            const simulated = this.simulated || value.mock === true || value.provenance === 'simulated';
            // Some emulator providers report epoch time in Android's boot-clock field.
            // Keep that original report, but never subtract it from a different clock.
            const reportedElapsed = finiteOrNull(value.elapsedRealtimeMs);
            const bootRangeKnown = Number.isFinite(state.deviceElapsedRealtimeMs) && state.deviceElapsedRealtimeMs >= 0;
            const usableElapsed = reportedElapsed !== null && reportedElapsed >= 0 && bootRangeKnown
              && reportedElapsed <= state.deviceElapsedRealtimeMs;
            onFix({ coordinate: [value.coordinate[0], value.coordinate[1]], crs: 'EPSG:4326', timestamp: value.timestamp, receivedAt: Date.now(), accuracy: finiteOrNull(value.accuracy), accuracyConfidence: '68-percent',
              altitude: finiteOrNull(value.altitude), altitudeAccuracy: finiteOrNull(value.altitudeAccuracy), altitudeDatum: 'wgs84-ellipsoid', speed: finiteOrNull(value.speed), heading: finiteOrNull(value.heading),
              deviceId: value.deviceId, transportDeviceId: this.serial, deviceLabel: String(value.deviceLabel || 'Android 设备').slice(0, 100), source: 'android-location-manager', provider: String(value.provider || 'unknown').slice(0, 80), transport: 'adb',
              provenance: simulated ? 'simulated' : value.provenance === 'device' ? 'device' : 'unknown', mock: typeof value.mock === 'boolean' ? value.mock : null,
              ...(reportedElapsed !== null ? { reportedElapsedRealtimeMs: reportedElapsed } : {}),
              ...(usableElapsed ? { elapsedRealtimeMs: reportedElapsed! } : {}),
              clockQuality: !bootRangeKnown || reportedElapsed === null ? 'unverified' : usableElapsed ? 'boot-range-checked' : 'outside-boot-range',
              ...(typeof value.clockId === 'string' ? { clockId: value.clockId } : {}) });
          }
          if (state.status === 'stopped' || state.status === 'denied') break;
        }
      } catch {
        if (signal.aborted) break;
        this.status({ status: 'disconnected', reason: '设备连接已中断，等待同一台设备重新连接；没有补写丢失的位置。' });
      }
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, Math.max(500, Math.min(5000, this.options.pollIntervalMs || 1000))); this.wake = () => { clearTimeout(timer); resolve(); }; });
      this.wake = undefined;
    }
  }
  private async readState(serial: string) {
    const state = JSON.parse(await command(this.path, ['-s', serial, 'shell', 'run-as', packageName, 'cat', 'files/location-state.json'], undefined, 5000));
    if (state.schemaVersion !== 1 || typeof state.session !== 'string' || !/^[a-f\d-]{36}$/i.test(state.session) || typeof state.workoutId !== 'string') throw new Error('设备上的运动身份无法核对；没有停止其它位置读取。');
    return state as { session: string; workoutId: string; status: string; activeSubscriptions?: number; activeSensorSubscriptions?: number; fixes?: unknown[]; cadence?: unknown[] };
  }
  private async verifyNoSubscriptions(serial: string) {
    const text = await command(this.path, ['-s', serial, 'shell', 'dumpsys', 'location'], undefined, 5000);
    const start = text.indexOf('Location Providers:');
    const boundaries = ['Historical Aggregate', 'GNSS Manager:', 'Geofence Manager:', 'Event Log:'].map(value => text.indexOf(value, start + 1)).filter(value => value > start);
    if (start < 0 || !boundaries.length) throw new Error('设备没有提供可核对的定位订阅状态。');
    const providers = text.slice(start, Math.min(...boundaries));
    if (providers.includes(packageName)) throw new Error('设备仍保留在场的位置订阅，停止尚未完成。');
  }
  private async verifyNoSensorSubscriptions(serial: string) {
    const text = await command(this.path, ['-s', serial, 'shell', 'dumpsys', 'sensorservice'], undefined, 5000);
    const start = text.search(/(?:^\s*\d+ active connections\s*$|Sensor Event Connections:)/m);
    const end = text.indexOf('Previous Registrations:', start + 1);
    if (start < 0) throw new Error('设备没有提供可核对的传感器订阅状态。');
    if (text.slice(start, end >= 0 ? end : undefined).includes(packageName)) throw new Error('设备仍保留在场的传感器订阅，停止尚未完成。');
  }
  private async sendStop(serial: string, session: string) {
    await command(this.path, ['-s', serial, 'shell', 'am', 'broadcast', '-a', 'cn.zaichang.location.STOP', '-n', `${packageName}/.StopReceiver`, '--es', 'session', session, '--es', 'workoutId', this.workoutId], undefined, 5000);
  }
  async stop(owner?: WorkoutStopOwner) {
    if (owner && (owner.id !== this.workoutId || owner.recordingSource && owner.recordingSource.source !== 'adb'))
      throw new Error('这份停止请求属于另一段运动，没有打断当前记录。');
    const hadStream = this.running || !!this.launching || this.launchAttempted;
    this.running = false; this.controller?.abort(); this.wake?.();
    await this.launching?.catch(() => undefined); await this.pumping;
    this.launching = undefined; this.pumping = undefined; this.controller = undefined;
    if (this.startAttempted && !this.launchAttempted || !this.startAttempted && !this.options.workoutId) {
      this.session = ''; this.serial = ''; this.startAttempted = false;
      if (hadStream) this.status({ status: 'stopped', reason: '本次没有启动设备定位，桌面读取已停止。' });
      return;
    }
    const serial = this.serial || this.options.deviceId;
    if (!serial || !/^[\w.:[\]-]+$/.test(serial)) throw new Error('尚不知道原来采样的设备，不能确认它已经停止。请重新连接同一设备后重试。');
    this.serial = serial;
    try {
      // Cancel a possibly late Activity first, retaining this token if acknowledgement fails.
      if (this.session && this.launchAttempted) await this.sendStop(serial, this.session);
      let state = await this.readState(serial);
      if (state.workoutId !== this.workoutId) {
        throw new Error(state.status === 'stopped' ? '设备上的运动身份与这次不同，尚不能确认原来那次已停止；没有接管其它运动。' : '设备正在为另一段运动读取位置；没有停止或接管它。');
      } else {
        this.session = state.session;
        if (state.status !== 'stopped' || state.activeSubscriptions !== 0 || !Array.isArray(state.fixes) || state.fixes.length
          || state.activeSensorSubscriptions !== undefined && (state.activeSensorSubscriptions !== 0 || !Array.isArray(state.cadence) || state.cadence.length)
          || Array.isArray(state.cadence) && state.cadence.length) {
          await this.sendStop(serial, state.session);
          state = await this.readState(serial);
        }
        if (state.workoutId !== this.workoutId || state.session !== this.session || state.status !== 'stopped' || state.activeSubscriptions !== 0 || !Array.isArray(state.fixes) || state.fixes.length
          || state.activeSensorSubscriptions !== undefined && (state.activeSensorSubscriptions !== 0 || !Array.isArray(state.cadence) || state.cadence.length)
          || Array.isArray(state.cadence) && state.cadence.length) throw new Error('设备还没有确认这次位置读取已停止。');
      }
      await this.verifyNoSubscriptions(serial);
      if (state.activeSensorSubscriptions !== undefined) await this.verifyNoSensorSubscriptions(serial);
    } catch (error) {
      const reason = error instanceof Error && /另一段运动|身份|仍保留|订阅状态|还没有确认/.test(error.message) ? error.message : '桌面已停止收样，但设备尚未确认定位已关闭。请重新连接同一设备后重试停止。';
      this.status({ status: 'unavailable', reason });
      throw new Error(reason);
    }
    this.session = ''; this.serial = ''; this.startAttempted = false; this.launchAttempted = false;
    this.status({ status: 'stopped', reason: '已核对设备：本次位置读取已停止。' });
  }
}

class HdcWorkoutStream implements WorkoutLocationStream {
  private controller?: AbortController;
  constructor(private options: WorkoutLocationOptions) {}
  async start(_onFix: (fix: WorkoutInputFix) => void, onStatus: (status: WorkoutStreamStatus) => void) {
    this.controller?.abort(); const controller = new AbortController(); this.controller = controller;
    try {
      const output = await command(executable('hdc', this.options.executablePath), ['list', 'targets'], controller.signal);
      if (!controller.signal.aborted) onStatus({ status: /\[Empty\]/i.test(output) || !output.trim() ? 'disconnected' : 'unavailable', reason: /\[Empty\]/i.test(output) || !output.trim() ? '没有检测到已授权的鸿蒙设备。' : '已检测到鸿蒙设备；当前设备尚未提供在场可读取的位置流，打开官方运动页不能替代定位采样。' });
    } catch { if (!controller.signal.aborted) onStatus({ status: 'disconnected', reason: '无法连接鸿蒙设备，请检查 HDC 与设备授权。' }); }
  }
  stop() { this.controller?.abort(); this.controller = undefined; }
}

export function createWorkoutLocationStream(options: WorkoutLocationOptions = {}): WorkoutLocationStream {
  return options.source === 'adb' ? new AdbWorkoutStream(options) : options.source === 'hdc' ? new HdcWorkoutStream(options) : new WindowsWorkoutStream();
}
