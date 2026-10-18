import { z } from 'zod';
import { HarnessError } from '../../shared/harness';
import { addDate, dateInZone, dayBounds } from '../runtime/semantics';

const publicLocation = z.object({
  label: z.string().min(1).max(120), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  timeZone: z.string().min(1).max(100), basis: z.literal('explicit_public_reference'),
}).strict();
export const weatherInput = z.object({
  days: z.number().int().min(1).max(7).default(3),
  location: z.union([z.enum(['Hangzhou', 'Zijingang']), publicLocation]).default('Hangzhou'),
  date: z.iso.date().optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(),
}).strict();
const nullableNumbers = z.array(z.number().nullable());
export const weatherOutput = z.object({
  location: z.string(), timeZone: z.string(),
  reference: z.object({ latitude: z.number(), longitude: z.number(), basis: z.string(), userLocation: z.literal(false) }).strict(),
  forecast: z.object({ time: z.array(z.string()), weather_code: nullableNumbers, temperature_2m_max: nullableNumbers, temperature_2m_min: nullableNumbers, precipitation_probability_max: nullableNumbers }).strict(),
  hourly: z.object({ time: z.array(z.string()), precipitationIntervalStart: z.array(z.string()), temperature_2m: nullableNumbers, precipitation_probability: nullableNumbers, precipitation: nullableNumbers, weather_code: nullableNumbers }).strict().optional(),
  window: z.object({ from: z.string(), to: z.string(), granularity: z.enum(['daily', 'hourly']), complete: z.boolean() }).strict(),
  observedAt: z.string(), forecastIssuedAt: z.null(), modelVersion: z.literal('not_reported'), limitations: z.array(z.string()),
}).strict();

/** Only public references are accepted. This adapter never reads or forwards a device fix. */
export function weatherRequest(raw: unknown, now: string) {
  const input = weatherInput.parse(raw);
  const location = typeof input.location === 'object' ? input.location : input.location === 'Zijingang'
    ? { label: '紫金港校区参考坐标（非用户定位）', latitude: 30.308, longitude: 120.079, timeZone: 'Asia/Shanghai', basis: 'campus_reference' }
    : { label: '杭州城市参考坐标（非用户定位）', latitude: 30.2741, longitude: 120.1551, timeZone: 'Asia/Shanghai', basis: 'city_reference' };
  try { new Intl.DateTimeFormat('en', { timeZone: location.timeZone }); } catch { throw new HarnessError('time_zone', '天气地点的时区不合法。'); }
  if (!!input.from !== !!input.to || input.date && input.from) throw new HarnessError('weather_window', '按时间窗查询须同时给from/to，且不与date混用。');
  if (input.from && Date.parse(input.to!) <= Date.parse(input.from)) throw new HarnessError('weather_window', '天气查询结束须晚于开始。');
  const today = dateInZone(now, location.timeZone), first = input.from ? dateInZone(input.from, location.timeZone) : input.date || today;
  const last = input.to ? dateInZone(new Date(Date.parse(input.to) - 1).toISOString(), location.timeZone) : input.date || addDate(today, input.days - 1);
  if (first < today || last > addDate(today, 6)) throw new HarnessError('weather_window', '天气查询仅覆盖所选地点当地今天起七天内。');
  const from = input.from || dayBounds(first, location.timeZone).from, to = input.to || dayBounds(last, location.timeZone).to;
  // Preceding-hour precipitation ending at midnight is the next day's first
  // sample. Fetch that boundary day without widening the reported window.
  const requestLast = input.from ? addDate(last, 1) : last;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    ...(input.from ? { hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code' } : {}),
    // Epoch instants avoid ambiguity during repeated local hours.
    timezone: location.timeZone, timeformat: 'unixtime', start_date: first, end_date: requestLast }).toString();
  return { input, location, from, to, first, last, requestLast, url, hourly: !!input.from };
}

export function weatherResult(query: ReturnType<typeof weatherRequest>, raw: any, observedAt: string) {
  const columns = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'] as const;
  const times = raw?.daily?.time;
  const expectedDates: string[] = [];
  for (let date = query.first; date <= query.last; date = addDate(date, 1)) expectedDates.push(date);
  const expectedReturnedDates = query.hourly ? [...expectedDates, query.requestLast] : expectedDates;
  if (!Array.isArray(times) || times.length !== expectedReturnedDates.length || times.some((at: unknown) => typeof at !== 'number' || !Number.isFinite(at)) || columns.some(column => !Array.isArray(raw.daily[column]) || raw.daily[column].length !== times.length)) throw new HarnessError('weather_incomplete', '天气来源没有完整返回所选日期，不能当作已查到。');
  // Open-Meteo daily unix timestamps need the response utc_offset_seconds to recover the date.
  if (typeof raw.utc_offset_seconds !== 'number' || times.some((at: number, index: number) => new Date((at + raw.utc_offset_seconds) * 1000).toISOString().slice(0, 10) !== expectedReturnedDates[index])) throw new HarnessError('weather_incomplete', '天气来源返回的日期与请求不一致。');
  const values = (array: unknown[]) => array.map(value => typeof value === 'number' && Number.isFinite(value) ? value : null);
  const forecast = { time: expectedDates, ...Object.fromEntries(columns.map(column => [column, values(raw.daily[column]).slice(0, expectedDates.length)])) } as z.infer<typeof weatherOutput>['forecast'];
  let complete = columns.every(column => forecast[column].every(value => value !== null));
  let hourly: z.infer<typeof weatherOutput>['hourly'];
  if (query.hourly) {
    const hourlyColumns = ['temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code'] as const;
    const hours = raw.hourly?.time;
    if (!Array.isArray(hours) || hours.some(at => typeof at !== 'number' || !Number.isFinite(at)) || hourlyColumns.some(column => !Array.isArray(raw.hourly?.[column]) || raw.hourly[column].length !== hours.length)) throw new HarnessError('weather_incomplete', '天气来源未返回有效的小时预报。');
    const from = Date.parse(query.from), to = Date.parse(query.to);
    const indices = hours.flatMap((at: number, index: number) => (at * 1000 < to && at * 1000 + 3600000 > from || at * 1000 > from && at * 1000 - 3600000 < to) ? [index] : []);
    hourly = { time: indices.map(index => new Date(hours[index] * 1000).toISOString()), precipitationIntervalStart: indices.map(index => new Date((hours[index] - 3600) * 1000).toISOString()), ...Object.fromEntries(hourlyColumns.map(column => [column, values(indices.map(index => raw.hourly[column][index]))])) } as z.infer<typeof weatherOutput>['hourly'];
    const coverage = indices.length > 0 && hours[indices[0]] * 1000 <= from && hours[indices.at(-1)!] * 1000 >= to && indices.every((index, i) => i === 0 || hours[index] - hours[indices[i - 1]] === 3600);
    complete = complete && coverage && hourlyColumns.every(column => hourly![column].every(value => value !== null));
  }
  return { complete, data: weatherOutput.parse({ location: query.location.label, timeZone: query.location.timeZone,
    reference: { latitude: query.location.latitude, longitude: query.location.longitude, basis: query.location.basis, userLocation: false }, forecast, ...(hourly ? { hourly } : {}),
    window: { from: query.from, to: query.to, granularity: query.hourly ? 'hourly' : 'daily', complete }, observedAt, forecastIssuedAt: null, modelVersion: 'not_reported',
    limitations: ['预报网格代表参考地点，不能保证校园某一处的分钟级天气。', '小时温度与天气代码对应time时刻；降水量和降水概率对应precipitationIntervalStart到time的前一小时。', '获取时间不等于模型发布时间；来源未提供模型版本或发布时间。', '缺测保留为null，不代表零降水；预报不核实场地开放或身体条件。'] }) };
}
