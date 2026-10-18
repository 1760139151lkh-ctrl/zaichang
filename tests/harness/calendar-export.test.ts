import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCalendarSnapshot } from '../../src/main/actions/calendar-export';
import type { Action } from '../../src/shared/types';

const now = '2026-10-18T08:00:00Z';
const window = { from: '2026-10-18T00:00:00Z', to: '2026-10-22T00:00:00Z', timeZone: 'Asia/Shanghai' };
const event = (patch: Partial<Action> = {}): Action => ({ id: 'read', title: '一起读书', detail: '私人的原因', kind: 'event', startsAt: '2026-10-18T10:00:00Z', durationMinutes: 90, ...patch });

test('calendar export keeps real accepted occurrences and excludes private detail by default', () => {
  const result = exportCalendarSnapshot([event(), event({ id: 'wish', planning: { state: 'wish', flexibility: 'movable' } }), event({ id: 'done', done: true }), event({ id: 'demo', demo: true })], window, now);
  assert.equal(result.count, 1);
  assert.ok(result.content.includes('DTSTART:20261018T100000Z\r\nDTEND:20261018T113000Z'));
  assert.ok(!result.content.includes('私人的原因'));
  assert.ok(!result.content.includes('VALARM'));
});
test('calendar export unfolds weekly exceptions and preserves stable occurrence identity', () => {
  const series = event({ recurrence: { frequency: 'daily', interval: 1, count: 3 }, exceptions: [{ onDate: '2026-10-19', cancelled: true }, { onDate: '2026-10-20', startsAt: '2026-10-20T12:00:00Z' }] });
  const a = exportCalendarSnapshot([series], window, now);
  const b = exportCalendarSnapshot([{ ...series, revision: 2, title: '换一本书' }], window, now);
  assert.equal(a.count, 2);
  assert.ok(a.content.includes('DTSTART:20261020T120000Z'));
  assert.deepEqual(a.content.match(/UID:[^\r]+/g), b.content.match(/UID:[^\r]+/g));
});
test('calendar export uses exclusive all-day end and does not invent unknown durations', () => {
  const result = exportCalendarSnapshot([event({ id: 'all', startsAt: undefined, durationMinutes: undefined, allDayDate: '2026-10-19' }), event({ id: 'unknown', durationMinutes: undefined })], window, now);
  assert.equal(result.count, 1); assert.equal(result.omitted, 1);
  assert.ok(result.content.includes('DTSTART;VALUE=DATE:20261019\r\nDTEND;VALUE=DATE:20261020'));
});
test('calendar text cannot inject components and folding never splits UTF-8 characters', () => {
  const result = exportCalendarSnapshot([event({ title: '读书🦉'.repeat(20) + '\r\nBEGIN:VEVENT', detail: 'A;B,C\\D\n第二行' })], { ...window, includeDetails: true }, now);
  for (const line of result.content.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(result.content.match(/^BEGIN:VEVENT$/gm)?.length || result.content.split('BEGIN:VEVENT\r\n').length - 1, 1);
  const unfolded = result.content.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('\\nBEGIN:VEVENT'));
  assert.ok(unfolded.includes('DESCRIPTION:A\\;B\\,C\\\\D\\n第二行'));
  assert.ok(!result.content.includes('\uFFFD'));
});
test('calendar export rejects invalid ranges and handles a DST ambiguous recurrence without guessing', () => {
  assert.throws(() => exportCalendarSnapshot([], { ...window, to: window.from }, now));
  assert.throws(() => exportCalendarSnapshot([], { ...window, timeZone: 'not/a-zone' }, now));
  const recurring = event({ startsAt: '2026-10-31T08:30:00Z', timeZone: 'America/Los_Angeles', recurrence: { frequency: 'daily', interval: 1, count: 3 } });
  const result = exportCalendarSnapshot([recurring], { from: '2026-10-31T00:00:00Z', to: '2026-11-03T00:00:00Z', timeZone: 'America/Los_Angeles' }, now);
  assert.ok(result.omitted > 0); assert.ok(!result.content.includes('DTSTART:20261101T'));
});

test('calendar handoff preserves nonblocking all-day reminders, deadlines, and tasks', () => {
  const result = exportCalendarSnapshot(['deadline', 'reminder', 'todo'].map((kind, i) => event({ id: `point-${i}`, kind: kind as Action['kind'], startsAt: undefined, durationMinutes: undefined, allDayDate: '2026-10-19' })), window, now);
  assert.equal(result.count, 3);
  assert.equal(result.content.split('TRANSP:TRANSPARENT').length - 1, 3);
  assert.ok(!exportCalendarSnapshot([event({ allDayDate: '2026-10-19', startsAt: undefined })], window, now).content.includes('TRANSP:TRANSPARENT'));
});
