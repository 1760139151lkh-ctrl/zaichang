import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { WorkoutInputFix, WorkoutLocationStream, WorkoutStopOwner, WorkoutStreamStatus } from '../shared/workout';

const bundle = 'cn.zaichang.location';
const udidPattern = /^[A-F\d]{8}-[A-F\d]{4}-[A-F\d]{4}-[A-F\d]{4}-[A-F\d]{12}$/i;
const ownerPattern = /^[a-z\d_.:-]{1,128}$/i;
export interface IosLocationOptions { deviceId?: string; workoutId?: string; configurationPath?: string }
export interface IosLocationDevice {
  transport: 'ios-simulator'; deviceId: string; deviceLabel: string; aliases: string[];
  status: 'connected'; provenance: 'simulated';
}
interface Connection { host: '127.0.0.1'; port: number; username: string; identityFile: string; knownHostsFile: string; developerDirectory: string }
interface NativeState {
  version: number; workoutId: string; nonce: string; status: string; activeSubscriptions: number;
  commandId: string; processId: number; sequence: number; updatedAt: number; points: Record<string, unknown>[];
}

async function connection(path?: string): Promise<Connection> {
  const configured = path || process.env.ZAICHANG_IOS_SSH_CONFIG || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Zaichang', 'apple-location.json');
  const raw = JSON.parse((await readFile(configured, 'utf8')).replace(/^\uFEFF/, '')) as Record<string, unknown>;
  if (raw.host !== '127.0.0.1' || !Number.isInteger(raw.port) || Number(raw.port) < 1 || Number(raw.port) > 65535 ||
      typeof raw.username !== 'string' || !/^[a-z\d_.@-]{1,128}$/i.test(raw.username) ||
      typeof raw.identityFile !== 'string' || !isAbsolute(raw.identityFile) ||
      typeof raw.knownHostsFile !== 'string' || !isAbsolute(raw.knownHostsFile) ||
      typeof raw.developerDirectory !== 'string' || !/^\/Applications\/[a-z\d ._/-]+\/Contents\/Developer$/i.test(raw.developerDirectory))
    throw new Error('本机 Mac 的连接资料还不完整。');
  if (!(await stat(raw.identityFile)).isFile() || !(await stat(raw.knownHostsFile)).isFile()) throw new Error('本机 Mac 的密钥或主机记录没有找到。');
  return raw as unknown as Connection;
}
function quote(value: string) { return `'${value.replaceAll("'", "'\\''")}'`; }
async function remote(config: Connection, command: string): Promise<string> {
  const args = ['-F', 'none', '-T', '-p', String(config.port), '-i', config.identityFile,
    '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${config.knownHostsFile}`, '-o', 'ConnectTimeout=5',
    `${config.username}@${config.host}`, `export DEVELOPER_DIR=${quote(config.developerDirectory)}; ${command}`];
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', diagnostic = '', settled = false;
    const finish = (failure?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); failure ? reject(failure) : resolve(output);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('本机 Mac 暂时没有响应。')); }, 12000);
    child.stdout.on('data', chunk => {
      output += chunk.toString('utf8');
      if (output.length > 262144) { child.kill(); finish(new Error('模拟器的位置内容过大，已停止读取。')); }
    });
    // A short private cause helps diagnose a failed operation without exposing it in UI copy.
    child.stderr.on('data', chunk => { if (diagnostic.length < 2048) diagnostic += chunk.toString('utf8'); });
    child.on('error', () => finish(new Error('没有找到可用的本机 SSH 连接。')));
    child.on('close', code => {
      const detail = [config.username, config.identityFile, config.knownHostsFile].reduce((value, secret) => value.replaceAll(secret, '[本机连接资料]'), diagnostic).slice(0, 2048);
      finish(code === 0 ? undefined : new Error('本机 Mac 没有完成这次位置操作。', { cause: { exitCode: code, detail } }));
    });
  });
}
async function devices(config: Connection): Promise<IosLocationDevice[]> {
  const value = JSON.parse(await remote(config, '/usr/bin/xcrun simctl list devices --json')) as { devices?: Record<string, Array<{ udid?: string; name?: string; state?: string; isAvailable?: boolean }>> };
  return Object.entries(value.devices || {}).filter(([runtime]) => runtime.includes('.iOS-')).flatMap(([, rows]) => rows)
    .filter(row => row.state === 'Booted' && row.isAvailable && udidPattern.test(row.udid || ''))
    .map(row => ({ transport: 'ios-simulator', deviceId: row.udid!, aliases: [row.udid!], deviceLabel: String(row.name || 'iOS').slice(0, 100), status: 'connected', provenance: 'simulated' }));
}
/** Discovery never boots a device or chooses a first simulator on the user's behalf. */
export async function discoverIosLocationDevices(options: Pick<IosLocationOptions, 'configurationPath'> = {}): Promise<IosLocationDevice[]> {
  return devices(await connection(options.configurationPath));
}
async function readState(config: Connection, deviceId: string): Promise<NativeState> {
  const text = await remote(config, `container=$(/usr/bin/xcrun simctl get_app_container ${quote(deviceId)} ${bundle} data) && /bin/cat "$container/Documents/workout-location.json"`);
  const value = JSON.parse(text) as NativeState;
  if (value.version !== 1 || typeof value.workoutId !== 'string' || typeof value.nonce !== 'string' ||
      !['starting', 'listening', 'denied', 'unavailable', 'stopped', 'lease-expired'].includes(value.status) ||
      ![0, 1].includes(value.activeSubscriptions) || !Number.isSafeInteger(value.processId) || value.processId < 1 ||
      typeof value.commandId !== 'string' || !Number.isFinite(value.updatedAt) ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      !Array.isArray(value.points) || value.points.length > 16) throw new Error('位置随行的内容无法读取，先停在这里。');
  return value;
}
async function launch(config: Connection, deviceId: string) {
  const result = await remote(config, `/usr/bin/xcrun simctl launch ${quote(deviceId)} ${bundle}`);
  const pid = Number(result.match(/:\s*(\d+)\s*$/)?.[1]);
  if (!Number.isSafeInteger(pid)) throw new Error('iOS 位置随行没有正常打开。');
  for (let attempt = 0; attempt < 12; attempt++) {
    try { const state = await readState(config, deviceId); if (state.processId === pid) return state; } catch { /* The app may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('iOS 位置随行还没有准备好，请打开它再试一次。');
}
async function send(config: Connection, deviceId: string, action: string, workoutId: string, nonce: string) {
  const commandId = randomUUID();
  const value = JSON.stringify({ version: 1, action, workoutId, nonce, commandId, issuedAt: Date.now() });
  await remote(config, `container=$(/usr/bin/xcrun simctl get_app_container ${quote(deviceId)} ${bundle} data) && /usr/bin/printf %s ${quote(value)} > "$container/Documents/workout-control.tmp" && /bin/mv -f "$container/Documents/workout-control.tmp" "$container/Documents/workout-control.json"`);
  return commandId;
}
class IosSimulatorStream implements WorkoutLocationStream {
  private config?: Connection;
  private nonce?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private lastSequence = 0;
  private lastHeartbeat = 0;
  private active = false;
  constructor(private options: IosLocationOptions) {}
  async start(onFix: (fix: WorkoutInputFix) => void, onStatus: (status: WorkoutStreamStatus) => void) {
    const deviceId = this.options.deviceId, workoutId = this.options.workoutId;
    if (!udidPattern.test(deviceId || '') || !ownerPattern.test(workoutId || '')) throw new Error('先选择这次运动使用的 iOS 模拟器。');
    if (this.active) throw new Error('这次运动已经在记录位置。');
    const generation = ++this.generation;
    const config = this.config = await connection(this.options.configurationPath);
    if (!(await devices(config)).some(device => device.deviceId === deviceId)) throw new Error('所选 iOS 模拟器没有运行，先打开它再继续。');
    const previous = await launch(config, deviceId!);
    if (previous.activeSubscriptions !== 0) throw new Error('这个模拟器还在记录另一段位置，先结束原来的记录。');
    if (generation !== this.generation) return;
    const nonce = this.nonce = randomUUID();
    this.active = true; this.lastSequence = 0; this.lastHeartbeat = Date.now();
    onStatus({ status: 'starting', reason: '正在等 iOS 模拟器的位置。' });
    let commandId: string;
    try { commandId = await send(config, deviceId!, 'start', workoutId!, nonce); }
    catch (error) { this.active = false; throw error; }
    let startAccepted = false;
    const poll = async () => {
      if (!this.active || generation !== this.generation) return;
      try {
        const state = await readState(config, deviceId!);
        if (!this.active || generation !== this.generation) return;
        if (Math.abs(Date.now() - state.updatedAt) > 15000) throw new Error('模拟器的位置内容已经有一会儿没有更新，先停在这里。');
        if (!startAccepted) {
          if (state.commandId !== commandId) {
            if (Date.now() - this.lastHeartbeat >= 5000) throw new Error('模拟器还没有开始这次位置记录。');
            this.timer = setTimeout(poll, 250); return;
          }
          startAccepted = true;
        }
        if (state.workoutId !== workoutId || state.nonce !== nonce) throw new Error('模拟器里的位置记录已经换了，已停止读取。');
        if (state.status === 'denied') { this.active = false; onStatus({ status: 'denied', reason: 'iOS 没有允许位置，这次记录已暂停。' }); return; }
        if (state.activeSubscriptions !== 1 || state.status !== 'listening') {
          if (state.status === 'starting') { this.timer = setTimeout(poll, 1000); return; }
          this.active = false; onStatus({ status: 'unavailable', reason: 'iOS 位置已经停止，这次记录已暂停。' }); return;
        }
        onStatus({ status: 'listening', reason: '正在记录 iOS 模拟器中的位置。' });
        for (const point of state.points) {
          const sequence = Number(point.sequence);
          if (!Number.isSafeInteger(sequence) || sequence <= this.lastSequence) continue;
          this.lastSequence = sequence;
          const longitude = point.longitude, latitude = point.latitude, timestamp = point.timestamp, accuracy = point.accuracy;
          if (typeof longitude !== 'number' || typeof latitude !== 'number' || typeof timestamp !== 'number' || typeof accuracy !== 'number' ||
              ![longitude, latitude, timestamp, accuracy].every(Number.isFinite) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || accuracy < 0) continue;
          const optional = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
          onFix({ coordinate: [longitude, latitude], crs: 'EPSG:4326', timestamp, receivedAt: Date.now(), accuracy,
            accuracyConfidence: 'unknown', altitude: optional(point.altitude), altitudeAccuracy: optional(point.altitudeAccuracy), altitudeDatum: 'mean-sea-level',
            speed: optional(point.speed), heading: optional(point.heading), source: 'ios-core-location-simulator',
            deviceId: `ios-simulator:${deviceId}`, deviceLabel: 'iOS 模拟器', transportDeviceId: deviceId,
            provider: 'CoreLocation', transport: 'ios-simulator', provenance: 'simulated', mock: true });
        }
        if (Date.now() - this.lastHeartbeat >= 5000) {
          await send(config, deviceId!, 'heartbeat', workoutId!, nonce); this.lastHeartbeat = Date.now();
        }
        if (this.active && generation === this.generation) this.timer = setTimeout(poll, 1000);
      } catch {
        if (generation !== this.generation) return;
        this.active = false;
        onStatus({ status: 'disconnected', reason: '与本机 iOS 模拟器断开了，这次记录已暂停；模拟器会在短暂等待后停止位置。' });
      }
    };
    this.timer = setTimeout(poll, 250);
  }
  async stop(owner?: WorkoutStopOwner) {
    this.active = false; ++this.generation; clearTimeout(this.timer); this.timer = undefined;
    const workoutId = owner?.id || this.options.workoutId;
    const deviceId = owner?.recordingSource?.source === 'ios-simulator' ? owner.recordingSource.deviceId : this.options.deviceId;
    if (!workoutId || !ownerPattern.test(workoutId) || !deviceId || !udidPattern.test(deviceId)) throw new Error('这次位置的设备信息不完整，还不能确认它已停止。');
    const config = this.config || await connection(this.options.configurationPath);
    const state = await launch(config, deviceId);
    if (state.workoutId !== workoutId) {
      if (state.activeSubscriptions !== 0) throw new Error('模拟器正在记录别的运动，没有打断它；原记录的停止结果还不清楚。');
      throw new Error('模拟器的记录已经换了，原记录的停止结果还不能确认。');
    }
    if (this.nonce && state.nonce !== this.nonce && state.activeSubscriptions !== 0) throw new Error('模拟器的位置记录已更换，没有打断它。');
    if (state.status === 'stopped' && state.activeSubscriptions === 0 && state.points.length === 0) { this.nonce = undefined; return; }
    if (!ownerPattern.test(state.nonce)) throw new Error('这次位置的停止信息不完整。');
    await send(config, deviceId, 'stop', workoutId, state.nonce);
    // A control file write is not the app's completed removal of its listener.
    for (let attempt = 0; attempt < 5; attempt++) {
      const after = await readState(config, deviceId);
      if (after.workoutId !== workoutId || after.nonce !== state.nonce) break;
      if (after.status === 'stopped' && after.activeSubscriptions === 0 && after.points.length === 0) { this.nonce = undefined; return; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('还没有确认模拟器已停止位置，请再试一次结束。');
  }
}
export function createIosWorkoutLocationStream(options: IosLocationOptions): WorkoutLocationStream { return new IosSimulatorStream(options); }
