import type { Store } from '../store';
import { HarnessError } from '../../shared/harness';
import { campusScheduleInput, type CampusScheduleResult } from '../../shared/campus-calendar';
import { campusConstraintSummary } from '../actions/planning-campus';

/** One private, bounded native read through the configured connector's normal
 * path. No model call or agenda writer; connector authentication is unchanged. */
export class NativeCampusCalendar {
  constructor(readonly store: Store) {}
  async read(raw: unknown): Promise<CampusScheduleResult> {
    const window = campusScheduleInput.parse(raw), runtime = this.store.runtime;
    const sourceBoundary = runtime.policy.sourceBoundary;
    if (runtime.presentation.public) throw new HarnessError('private_view_required', '先回到私人视图，再查看自己的校园安排。');
    const base = runtime.policy.validate(runtime.policy.hostScope());
    const handle = runtime.policy.hostScope({ sources: base.sources.filter(source => source === 'campus:zju-account'),
      grants: base.grants.filter(grant => ['campus:read', 'evidence:read'].includes(grant)), infer: false });
    runtime.policy.require(handle, 'campus:read');
    const scope = runtime.policy.validate(handle);
    if (!scope.sources.includes('campus:zju-account')) throw new HarnessError('source_forbidden', '当前没有允许读取这项校园来源。');
    const connector = runtime.connections.campus?.describe();
    const campus = connector?.configured && connector.available && connector.credentialsConfigured !== false
      ? await runtime.planning.readCampus(scope, window.from, window.to, new AbortController().signal) : null;
    runtime.policy.require(handle, 'campus:read');
    const current = runtime.policy.validate(handle);
    if (sourceBoundary !== runtime.policy.sourceBoundary)
      throw new HarnessError('campus_calendar_changed', '校园连接或资料范围在读取途中改变，请重新查看。');
    if (runtime.presentation.public) throw new HarnessError('private_view_required', '展示范围已经变化，校园资料没有交付。');
    if (!campus || campus.proofs.length === 0) return { readMode: 'existing_connector_default', status: 'not_read', window, sourceId: 'campus:zju-account', snapshotVersion: null, items: [], snapshots: [], scheduleQuality: campus?.scheduleQuality || [],
      issues: campus?.issues.length ? campus.issues : ['当前未读取到已连接的本人校园快照；这不表示没有课程或考试。'], cancelledCount: null, pendingCount: null,
      coverage: { completeForSavedSnapshot: false, live: false, attendanceEstablished: false, realAvailabilityEstablished: false },
      meaning: '沿已配置校园连接器的默认方式读取；是否需要认证或补齐快照由原连接器处理，没有创建本机安排。' };
    if (!runtime.planning.campusCurrent(current, campus))
      throw new HarnessError('campus_calendar_changed', '校园账号、快照或读取范围在途中改变，旧结果没有交付，请重新查看。');
    const summary = campusConstraintSummary(campus);
    return { readMode: 'existing_connector_default', status: campus.coverage.status === 'complete' ? 'ready' : 'partial', window, sourceId: campus.sourceId,
      snapshotVersion: campus.version, items: campus.items, snapshots: summary.snapshots, scheduleQuality: campus.scheduleQuality, issues: campus.issues,
      cancelledCount: campus.cancelledCount, pendingCount: campus.pendingCount,
      coverage: { completeForSavedSnapshot: campus.coverage.status === 'complete', live: false, attendanceEstablished: false, realAvailabilityEstablished: false },
      meaning: summary.meaning };
  }
}
