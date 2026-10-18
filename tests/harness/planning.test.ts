import test from 'node:test';
import assert from 'node:assert/strict';
import type { Action } from '../../src/shared/types';
import { assertDraftCalendarCurrent, draftCalendarPlan, previewCalendarPlan } from '../../src/main/actions/planning';

const at = (clock: string, date = '2026-10-19') => `${date}T${clock}:00+08:00`;
const task = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({ id, title: id, durationMinutes: { min: amount, max: amount }, ...extra });
const input = (tasks: unknown[], extra: Record<string, unknown> = {}) => ({ from: at('09:00'), to: at('15:00'), tasks, sourceCoverage: [{ sourceId: 'user-declared', status: 'complete' }], reserveMinutes: 0, restMinutes: 0, ...extra });
const busy = (id: string, start: string, length: number, extra: Partial<Action> = {}): Action => ({ id, title: id, detail: '', startsAt: at(start), durationMinutes: length, kind: 'event', revision: 1, ...extra });
const ms = (value: string) => Date.parse(value);
const noOverlap = (a: { start: string; end: string }, b: { start: string; end: string }) => assert.ok(ms(a.end) <= ms(b.start) || ms(b.end) <= ms(a.start));

test('multi-task draft respects fixed and movable accepted commitments without mutations', () => {
  const calendar = [busy('course', '10:00', 60), busy('accepted', '12:00', 60, { planning: { state: 'accepted', flexibility: 'movable' } })];
  const before = structuredClone(calendar);
  const draft = draftCalendarPlan(calendar, input([task('a', 60), task('b', 60), task('c', 60)]));
  assert.equal(draft.blocks.length, 3);
  for (const block of draft.blocks) for (const fixed of draft.fixedCommitments) noOverlap(block, fixed);
  for (let i = 1; i < draft.blocks.length; i++) noOverlap(draft.blocks[i - 1], draft.blocks[i]);
  assert.deepEqual(calendar, before);
  assert.equal(draft.applied, false); assert.equal(draft.accepted, false);
  assert.ok(draft.acceptanceProposals.every(value => value.requiresAuthorization && value.requiresPlanRevalidation && !value.applied));
});

test('invitation does not occupy accepted time and a real all-day commitment does', () => {
  const invitation = busy('invited', '09:00', 360, { planning: { state: 'invitation', flexibility: 'fixed' } });
  assert.equal(draftCalendarPlan([invitation], input([task('a', 60)])).blocks.length, 1);
  const allDay: Action = { id: 'away', title: 'away', detail: '', kind: 'event', allDayDate: '2026-10-19', timeZone: 'Asia/Shanghai' };
  assert.equal(draftCalendarPlan([allDay], input([task('a', 60)])).blocks.length, 0);
});

test('preview available window and alternative use the same two-sided transition cost', () => {
  const result = previewCalendarPlan([], { from: at('09:00'), to: at('10:00'), transitionMinutes: { min: 10, max: 10 }, minimumBlockMinutes: 50 });
  assert.equal(result.windows[0].usableMinutes.min, 40);
  assert.equal(result.windows[0].fitsMinimum, 'no');
});

test('preview checks adjacent commitments beyond its visible window on either side', () => {
  const result = previewCalendarPlan([busy('left', '09:30', 30), busy('right', '11:00', 30)], {
    from: at('10:00'), to: at('11:00'), transitionMinutes: { min: 10, max: 10 }, sourceCoverage: [{ sourceId: 'user', status: 'complete' }],
    alternatives: [
      { label: 'left-edge', save: { title: 'new', detail: '', kind: 'time_block', startsAt: at('10:00'), durationMinutes: 30 } },
      { label: 'right-edge', save: { title: 'new', detail: '', kind: 'time_block', startsAt: at('10:30'), durationMinutes: 30 } },
    ],
  });
  assert.deepEqual(result.alternatives.map(value => value.feasibility), ['not_feasible', 'not_feasible']);
  assert.equal(result.alternatives[0].conflicts[0].objectId, 'left');
  assert.equal(result.alternatives[1].conflicts[0].objectId, 'right');
});

test('half-open boundaries allow adjacent work with zero buffer; both-side costs reject tight fit', () => {
  const calendar = [busy('left', '08:00', 60), busy('right', '10:00', 60)];
  assert.equal(draftCalendarPlan(calendar, input([task('a', 60)], { to: at('10:00') })).blocks.length, 1);
  const buffered = draftCalendarPlan(calendar, input([task('a', 50)], { to: at('10:00'), transitionMinutes: { min: 10, max: 10 } }));
  assert.equal(buffered.blocks.length, 0);
  assert.equal(buffered.unscheduled[0].code, 'no_placement_found');
});

test('one directed route cost per boundary and final free time do not double count shared travel', () => {
  const result = draftCalendarPlan([], input([
    task('a', 40, { placeId: 'A', allowedWindows: [{ start: at('09:00'), end: at('09:40') }] }),
    task('b', 40, { placeId: 'B', dependsOn: ['a'] }),
  ], { to: at('11:00'), startPlaceId: 'A', endPlaceId: 'B', travelTimes: [{ fromPlaceId: 'A', toPlaceId: 'B', minutes: { min: 10, max: 10 }, sourceId: 'route', sourceVersion: '2' }] }));
  assert.equal(result.blocks.length, 2);
  assert.equal(result.transitions.length, 1);
  assert.equal(result.transitions[0].travel.minutes, 10);
  assert.equal(result.freeWindows.reduce((sum, value) => sum + value.minutes, 0), 30);
  assert.equal(result.blocks[0].travelAfter.sources[0], 'route');
  assert.equal(result.blocks[1].travelBefore.sources[0], 'route');
});

test('dependency chain is ordered, cycles and unknown predecessors are explicit', () => {
  const result = draftCalendarPlan([], input([task('c', 30, { dependsOn: ['b'] }), task('b', 30, { dependsOn: ['a'] }), task('a', 30)]));
  assert.deepEqual(result.blocks.map(value => value.taskId), ['a', 'b', 'c']);
  const bad = draftCalendarPlan([], input([task('x', 30, { dependsOn: ['y'] }), task('y', 30, { dependsOn: ['x'] }), task('z', 30, { dependsOn: ['absent'] }), task('follows-cycle', 30, { dependsOn: ['x'] })]));
  assert.deepEqual(bad.unscheduled.filter(value => value.code === 'dependency_cycle').map(value => value.taskId).sort(), ['x', 'y']);
  assert.equal(bad.unscheduled.find(value => value.taskId === 'z')?.code, 'dependency_missing');
  assert.equal(bad.unscheduled.find(value => value.taskId === 'follows-cycle')?.code, 'dependency_unplaced');
  assert.equal(bad.feasibility, 'no_plan_constructed');
});

test('only explicitly splittable tasks cross gaps; each segment preserves minimum length', () => {
  const calendar = [busy('course', '10:00', 60)];
  const result = draftCalendarPlan(calendar, input([task('work', 100, { splittable: true, minimumChunkMinutes: 30 })], { to: at('12:00') }));
  assert.equal(result.blocks.length, 2); assert.equal(result.scheduledMinutes, 100);
  assert.ok(result.blocks.every(value => value.durationMinutes >= 30));
  assert.equal(draftCalendarPlan(calendar, input([task('work', 100)], { to: at('12:00') })).blocks.length, 0);
});

test('partial predecessor does not unlock dependent; small remainder is not dropped', () => {
  const result = draftCalendarPlan([], input([task('work', 100, { splittable: true, minimumChunkMinutes: 30 }), task('after', 30, { dependsOn: ['work'] })], { maxScheduledMinutes: 50 }));
  assert.equal(result.scheduledMinutes, 50);
  assert.equal(result.unscheduled.find(value => value.taskId === 'work')?.remainingMinutes, 50);
  assert.equal(result.unscheduled.find(value => value.taskId === 'after')?.code, 'dependency_unplaced');
  const remainder = draftCalendarPlan([busy('course', '10:20', 60)], input([task('work', 100, { splittable: true, minimumChunkMinutes: 30 })], { to: at('12:00') }));
  assert.deepEqual(remainder.blocks.map(value => value.durationMinutes), [70, 30]);
});

test('rest, protected time, setup and cleanup have real reserved intervals', () => {
  const result = draftCalendarPlan([], input([task('a', 30, { setupMinutes: 5, cleanupMinutes: 5 }), task('b', 30, { dependsOn: ['a'] })], {
    to: at('11:30'), restMinutes: 10, reserveMinutes: 30,
    protectedWindows: [{ start: at('10:00'), end: at('10:30'), reason: '留空' }],
  }));
  assert.equal(result.blocks.length, 2);
  assert.ok(result.freeWindows.reduce((sum, value) => sum + value.minutes, 0) >= 30);
  assert.equal(result.transitions.reduce((sum, value) => sum + value.restMinutes, 0), 10);
  for (const block of result.blocks) noOverlap({ start: block.reservedStart, end: block.reservedEnd }, { start: at('10:00'), end: at('10:30') });
  for (const transfer of result.transitions) noOverlap(transfer, { start: at('10:00'), end: at('10:30') });
});

test('declared task availability includes setup and cleanup, not only core work', () => {
  const result = draftCalendarPlan([], input([task('lab', 30, { setupMinutes: 10, cleanupMinutes: 10,
    allowedWindows: [{ start: at('10:00'), end: at('11:00') }] })]));
  assert.equal(result.blocks[0].reservedStart, new Date(at('10:00')).toISOString());
  assert.equal(result.blocks[0].start, new Date(at('10:10')).toISOString());
  assert.ok(ms(result.blocks[0].reservedEnd) <= ms(at('11:00')));
  const tight = draftCalendarPlan([], input([task('lab', 50, { setupMinutes: 10, cleanupMinutes: 10,
    allowedWindows: [{ start: at('10:00'), end: at('11:00') }] })]));
  assert.equal(tight.blocks.length, 0);
});

test('duration upper bound and finite work budget avoid invented capacity', () => {
  const result = draftCalendarPlan([], input([task('uncertain', 30, { durationMinutes: { min: 30, max: 90 }, priority: 1 }), task('later', 60)], { maxScheduledMinutes: 100 }));
  assert.equal(result.blocks[0].durationMinutes, 90);
  assert.equal(result.unscheduled[0].code, 'budget_or_reserve');
  const defaultBudget = draftCalendarPlan([], { from: at('09:00'), to: at('20:00'), tasks: [task('long', 300)] });
  assert.equal(defaultBudget.blocks.length, 0);
  assert.equal(defaultBudget.effectivePreferences.maxScheduledMinutes, 240);
});

test('splittable work can shrink to preserve a real reserve instead of rejecting all progress', () => {
  const result = draftCalendarPlan([], input([task('work', 150, { splittable: true, minimumChunkMinutes: 30 })], { to: at('11:00'), reserveMinutes: 30 }));
  assert.equal(result.scheduledMinutes, 90);
  assert.equal(result.unscheduled[0].remainingMinutes, 60);
  assert.equal(result.freeWindows.reduce((sum, value) => sum + value.minutes, 0), 30);
});

test('resource windows and known low energy exclude high effort; unknown energy is conditional', () => {
  const result = draftCalendarPlan([], input([task('hard', 60, { effort: 'high', allowedWindows: [{ start: at('09:00'), end: at('12:00') }] })], {
    energyWindows: [{ start: at('09:00'), end: at('10:00'), capacity: 'low', sourceId: 'current-self-report', sourceVersion: '1' }],
  }));
  assert.ok(ms(result.blocks[0].start) >= ms(at('10:00')));
  assert.equal(result.feasibility, 'conditional');
  assert.ok(result.conditions.some(value => value.includes('精力')));
  const impossible = draftCalendarPlan([], input([task('lab', 60, { conditions: [{ condition: '设备关闭', status: 'unavailable' }] })]));
  assert.equal(impossible.blocks.length, 0); assert.equal(impossible.unscheduled[0].code, 'condition_unavailable');
});

test('preferred window ranks feasible choices but never overrides a fixed commitment', () => {
  const choice = task('work', 60, { preferredWindows: [{ start: at('11:00'), end: at('12:00') }] });
  const preferred = draftCalendarPlan([], input([choice]));
  assert.equal(ms(preferred.blocks[0].start), ms(at('11:00')));
  const blocked = draftCalendarPlan([busy('class', '11:00', 60)], input([choice]));
  assert.equal(blocked.blocks[0].preferred, false);
  assert.equal(ms(blocked.blocks[0].start), ms(at('09:00')));
});

test('empty external calendar and incomplete source coverage do not assert real availability', () => {
  const result = draftCalendarPlan([], input([task('work', 30)], { sourceCoverage: [{ sourceId: 'school', status: 'partial', reason: '只同步了半天' }] }));
  assert.equal(result.feasibility, 'conditional'); assert.ok(result.conditions.includes('只同步了半天'));
  const unknownEnd = draftCalendarPlan([], input([task('work', 30)], { busy: [{ start: at('08:00'), end: null, sourceId: 'lab', sourceVersion: '3' }] }));
  assert.equal(unknownEnd.blocks.length, 0); assert.equal(unknownEnd.feasibility, 'no_plan_constructed');
});

test('recurring instance cancellation preserves other dates and original source revision', () => {
  const course = busy('weekly', '10:00', 60, { recurrence: { frequency: 'daily', interval: 1, count: 3 }, exceptions: [{ onDate: '2026-10-20', cancelled: true }], revision: 4 });
  const result = draftCalendarPlan([course], input([task('work', 60)], { from: at('10:00', '2026-10-20'), to: at('11:00', '2026-10-20') }));
  assert.equal(result.blocks.length, 1);
  assert.ok(result.sourceRevisions.some(value => value.sourceId === 'weekly' && value.sourceVersion === '4'));
  const next = draftCalendarPlan([course], input([task('work', 60)], { from: at('10:00', '2026-10-21'), to: at('11:00', '2026-10-21') }));
  assert.equal(next.blocks.length, 0);
});

test('DST and cross-midnight windows use elapsed instants without fixed wall-clock assumptions', () => {
  const result = draftCalendarPlan([], input([task('work', 120)], { from: '2026-11-01T00:30:00-07:00', to: '2026-11-01T02:30:00-08:00', timeZone: 'America/Los_Angeles' }));
  assert.equal(result.initialFreeMinutes, 180);
  assert.equal(result.scheduledMinutes, 120);
  const night = draftCalendarPlan([], input([task('work', 60)], { from: at('23:30'), to: at('01:00', '2026-10-20') }));
  assert.equal(night.scheduledMinutes, 60);
});

test('draft snapshots detect target edit and a different newly inserted commitment', () => {
  const calendar = [busy('course', '10:00', 60)];
  const request = input([task('work', 60)]);
  const result = draftCalendarPlan(calendar, request);
  assert.equal(result.planFingerprint, draftCalendarPlan(calendar, request).planFingerprint);
  assert.doesNotThrow(() => assertDraftCalendarCurrent(calendar, result.calendarFingerprint));
  assert.throws(() => assertDraftCalendarCurrent([...calendar, busy('new', '09:00', 60)], result.calendarFingerprint), /日历/);
  assert.throws(() => assertDraftCalendarCurrent([{ ...calendar[0], revision: 2 }], result.calendarFingerprint), /日历/);
});

test('invalid IDs, time windows, bounds and duplicate directed routes fail rather than normalize silently', () => {
  assert.throws(() => draftCalendarPlan([], input([task('same', 30), task('same', 60)])), /ID/);
  assert.throws(() => draftCalendarPlan([], input([task('a', 30, { durationMinutes: { min: 60, max: 30 } })])), /上界/);
  assert.throws(() => draftCalendarPlan([], input([task('a', 30, { allowedWindows: [{ start: at('12:00'), end: at('11:00') }] })])), /起止/);
  assert.throws(() => draftCalendarPlan([], input([task('a', 30)], { completedTaskIds: ['a'] })), /同时/);
});
