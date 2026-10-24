import { z } from 'zod';
import type { Store } from '../store';
import type { CampusMapAdapter } from '../mapService';
import type { MapLocationProvider } from '../mapLocation';
import type { WorkoutDeviceChoice, WorkoutDeviceSelection } from '../../shared/types';
import type { WorkoutLocationStream, WorkoutState } from '../../shared/workout';
import { WorkoutSessionKernel } from './workout-session';
import { WorkoutDraftStore, type WorkoutDraftProtection } from './workout-storage';
import { projectWorkoutCurrent } from '../capabilities/workout';
import { workoutSourceObjectId } from '../../shared/workout-source';

const deviceInput = z.object({ source: z.enum(['windows', 'adb', 'hdc', 'ios-simulator']),
  deviceId: z.string().min(1).max(256).optional() }).strict();
const referenceInput = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict();

/** The private native controls of the sole workout owner. No model receives a raw track. */
export class NativeWorkoutService {
  private readonly owner: WorkoutSessionKernel;
  private stream?: WorkoutLocationStream;
  private selected?: WorkoutDeviceSelection;
  private selecting = false;
  private releaseBarrier: () => void;

  constructor(private store: Store, private map: CampusMapAdapter, private location: MapLocationProvider,
    protection: WorkoutDraftProtection, onChanged: (state: WorkoutState) => void) {
    this.owner = new WorkoutSessionKernel({ storage: new WorkoutDraftStore(store, protection),
      stream: {
        start: (onFix, onStatus, onCadence) => {
          const record = this.owner.getState().session;
          if (!record?.recordingSource) throw new Error('先选一下用于定位的设备。');
          this.stream = this.location.createWorkoutStream({ ...record.recordingSource, workoutId: record.id });
          return this.stream.start(onFix, onStatus, onCadence);
        },
        stop: async identity => {
          if (!this.stream && identity && !identity.stopped) {
            if (!identity.recordingSource) throw new Error('还不知道上次采样的设备，暂时不能确认它已经停止。');
            this.stream = this.location.createWorkoutStream({ ...identity.recordingSource, workoutId: identity.id });
          }
          const stream = this.stream;
          await stream?.stop();
          if (this.stream === stream) this.stream = undefined;
        },
      },
      assertAccess: () => this.assertAccess(), matchFix: fix => this.map.matchWorkoutFix(fix), onChanged,
      onCancel: id => {
        const objectId = workoutSourceObjectId(id);
        try {
          store.kernel.withdrawWorkoutSource(id);
          const fence = store.kernel.fences().find(value => value.kind === 'delete' && value.objectIds.includes(objectId))
            || store.kernel.establishFence({ kind: 'delete', objectIds: [objectId], sourceIds: [] });
          store.kernel.cleanupFence(fence);
        }
        finally { store.runtime.policy.signalBarrier(); }
      },
    });
    this.releaseBarrier = store.runtime.policy.onBarrier(() => {
      if (store.runtime.policy.revoked().includes('location:read')) void this.owner.invalidate().catch(() => undefined);
    });
  }

  private assertPrivate() {
    if (this.store.closed || this.store.runtime.presentation.public) throw new Error('先回到私人地图，再查看这次运动。');
  }
  private assertAccess() {
    this.assertPrivate();
    if (this.store.runtime.policy.revoked().includes('location:read'))
      throw new Error('你先前关闭了定位；重新允许后，才会继续采样。已经保存的运动记录仍保留。');
  }

  async devices(): Promise<WorkoutDeviceChoice[]> {
    this.assertPrivate();
    const result: WorkoutDeviceChoice[] = process.platform === 'win32' ? [{ source: 'windows', deviceId: 'windows-local',
      deviceLabel: '这台电脑', status: 'connected', provenance: 'unknown', reason: '实际位置与精度由 Windows 返回。' }] : [];
    for (const source of ['adb', 'hdc', 'ios-simulator'] as const) {
      try {
        const devices = await this.location.discoverDevices({ source });
        this.assertPrivate();
        result.push(...devices.map(device => ({ source, deviceId: device.deviceId, deviceLabel: device.deviceLabel,
          status: device.status, provenance: device.provenance })));
      } catch { /* An absent optional device does not hide the other connected sources. */ }
    }
    return result;
  }

  private async select(raw?: WorkoutDeviceSelection, collection = true) {
    if (!raw && this.selected) return;
    if (!raw) throw new Error('先选一下用于定位的设备，再继续这次运动。');
    const choice = deviceInput.parse(raw);
    if (choice.source === 'windows') {
      if (process.platform !== 'win32') throw new Error('当前设备没有 Windows 定位。');
      this.selected = { source: 'windows' }; return;
    }
    if (!choice.deviceId) throw new Error('请选择已经连接的手机或模拟器。');
    const devices = await this.location.discoverDevices({ source: choice.source });
    if (collection) this.assertAccess(); else this.assertPrivate();
    const device = devices.find(device => device.deviceId === choice.deviceId || device.aliases.includes(choice.deviceId!));
    if (!device || device.status !== 'connected') throw new Error('刚才选的设备现在没有连接，可以重新选择后继续。');
    this.selected = { source: choice.source, deviceId: device.deviceId };
  }

  state() { this.assertPrivate(); return this.owner.getState(); }
  summary() { this.assertAccess(); return projectWorkoutCurrent(this.owner.getState(), Date.now()); }
  restore() { this.assertPrivate(); return this.owner.restore(); }
  async start(raw: unknown) {
    this.assertAccess();
    const input = z.object({ sport: z.enum(['walking', 'running', 'cycling']),
      retention: z.enum(['encrypted-local', 'session-only']), device: deviceInput }).strict().parse(raw);
    if (this.selecting) throw new Error('这次开始还在继续，等当前记录出现后再操作。');
    const previous = this.selected;
    this.selecting = true;
    try {
      await this.select(input.device); this.assertAccess();
      return await this.owner.start({ sport: input.sport, retention: input.retention, recordingSource: this.selected });
    } catch (error) { this.selected = previous; throw error; }
    finally { this.selecting = false; }
  }
  pause(raw: unknown) { this.assertPrivate(); return this.owner.pause(referenceInput.parse(raw)); }
  async resume(raw: unknown) {
    this.assertAccess();
    const input = referenceInput.extend({ device: deviceInput.optional() }).parse(raw);
    if (this.selecting) throw new Error('这次继续还在进行，等当前记录出现后再操作。');
    const previous = this.selected;
    this.selecting = true;
    try {
      await this.select(input.device); this.assertAccess();
      return await this.owner.resume({ id: input.id, expectedRevision: input.expectedRevision, recordingSource: this.selected });
    } catch (error) { this.selected = previous; throw error; }
    finally { this.selecting = false; }
  }
  finish(raw: unknown) { this.assertPrivate(); return this.owner.finish(referenceInput.parse(raw)); }
  async cancel(raw: unknown) {
    this.assertPrivate();
    const input = referenceInput.extend({ device: deviceInput.optional() }).parse(raw);
    if (input.device && !['adb', 'ios-simulator'].includes(input.device.source))
      throw new Error('这份旧记录需要能核对原运动身份的 Android 或 iOS 设备回执，不能仅凭新选的设备确认停止。');
    if (this.selecting) throw new Error('设备选择还在进行，先看一下当前记录再继续。');
    const previous = this.selected;
    this.selecting = true;
    try {
      if (input.device) {
        const state = this.owner.getState(), pending = state.pendingStop;
        if (state.session || !pending || pending.id !== input.id || pending.revision !== input.expectedRevision)
          throw new Error('这份清理刚刚有了变化，先看当前记录再继续。');
        if (!pending.requiresDeviceSelection) throw new Error('这份清理已有原设备，不需要重新选择。');
        await this.select(input.device, false); this.assertPrivate();
        // The candidate becomes the original producer only after this exact
        // workout is matched and STOP is acknowledged. A wrong choice stays retryable.
        const candidate = this.location.createWorkoutStream({ ...this.selected, workoutId: pending.id });
        await candidate.stop({ id: pending.id, recordingSource: this.selected, stopped: false });
        this.stream = candidate;
      }
      this.assertPrivate();
      return await this.owner.cancel({ id: input.id, expectedRevision: input.expectedRevision,
        ...(input.device ? { recordingSource: this.selected } : {}) });
    } finally { this.selected = previous; this.selecting = false; }
  }
  discardRecovery() { this.assertPrivate(); return this.owner.discardRecovery(); }
  suspend() { return this.owner.invalidate(); }
  async dispose() { this.releaseBarrier(); await this.owner.dispose(); }
}
