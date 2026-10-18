import { calendarDate } from '../../shared/calendar';
import { addDate, resolveLocalTime } from '../runtime/semantics';

/** Boundaries of a named local date, which may begin after 00:00 at a clock
 * change. This is accounting, not permission to guess an ambiguous event time.
 * A skipped date has an empty interval and cannot carry a planning budget. */
export function planningDayBounds(date: string, timeZone: string): { from: string; to: string } {
  calendarDate.parse(date);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const boundary = (target: string) => {
    const midnight = resolveLocalTime(`${target}T00:00:00`, timeZone);
    if (midnight.instants.length) return midnight.instants[0];
    // No midnight exists. Locate the first instant whose local date reaches
    // the target instead of inventing 00:00 or assuming a 24-hour day.
    const anchor = Date.parse(`${target}T12:00:00Z`);
    let low = anchor - 48 * 3600000, high = anchor + 48 * 3600000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (formatter.format(new Date(middle)) < target) low = middle + 1;
      else high = middle;
    }
    return new Date(low).toISOString();
  };
  return { from: boundary(date), to: boundary(addDate(date, 1)) };
}
