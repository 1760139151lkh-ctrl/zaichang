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
const interval = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).strict();
export const weatherOutput = z.object({
  location: z.string(), timeZone: z.string(),
  reference: z.object({ latitude: z.number(), longitude: z.number(), basis: z.string(), userLocation: z.literal(false) }).strict(),
  forecast: z.object({ time: z.array(z.string()), weather_code: nullableNumbers, temperature_2m_max: nullableNumbers, temperature_2m_min: nullableNumbers, precipitation_probability_max: nullableNumbers }).strict(),
  // Optional only for old saved results; newly fetched results always carry the source intervals.
  dailyAggregation: z.object({ basis: z.literal('source_fixed_offset_24h'), utcOffsetSeconds: z.number().int(), complete: z.boolean(),
    periods: z.array(z.object({ date: z.iso.date(), sourceWindow: interval, localDay: interval, matchesLocalDay: z.boolean(), valuesComplete: z.boolean() }).strict()),
  }).strict().optional(),
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
  if (!Number.isInteger(raw.utc_offset_seconds) || times.some((at: number, index: number) =>
    new Date((at + raw.utc_offset_seconds) * 1000).toISOString() !== `${expectedReturnedDates[index]}T00:00:00.000Z`
    || index > 0 && at - times[index - 1] !== 86400)) throw new HarnessError('weather_incomplete', '天气来源返回的日期与请求不一致。');
  const values = (array: unknown[]) => array.map(value => typeof value === 'number' && Number.isFinite(value) ? value : null);
  const forecast = { time: expectedDates, ...Object.fromEntries(columns.map(column => [column, values(raw.daily[column]).slice(0, expectedDates.length)])) } as z.infer<typeof weatherOutput>['forecast'];
  const periods = expectedDates.map((date, index) => {
    const sourceWindow = { from: new Date(times[index] * 1000).toISOString(), to: new Date((times[index] + 86400) * 1000).toISOString() };
    const localDay = dayBounds(date, query.location.timeZone);
    return { date, sourceWindow, localDay, matchesLocalDay: sourceWindow.from === localDay.from && sourceWindow.to === localDay.to,
      valuesComplete: columns.every(column => forecast[column][index] !== null) };
  });
  const dailyAggregation = { basis: 'source_fixed_offset_24h' as const, utcOffsetSeconds: raw.utc_offset_seconds,
    complete: periods.every(period => period.matchesLocalDay && period.valuesComplete), periods };
  let complete = dailyAggregation.complete;
  let hourly: z.infer<typeof weatherOutput>['hourly'];
  if (query.hourly) {
    const hourlyColumns = ['temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code'] as const;
    const hours = raw.hourly?.time;
    if (!Array.isArray(hours) || hours.some(at => typeof at !== 'number' || !Number.isFinite(at)) || hourlyColumns.some(column => !Array.isArray(raw.hourly?.[column]) || raw.hourly[column].length !== hours.length)) throw new HarnessError('weather_incomplete', '天气来源未返回有效的小时预报。');
    const from = Date.parse(query.from), to = Date.parse(query.to);
    const indices = hours.flatMap((at: number, index: number) => (at * 1000 < to && at * 1000 + 3600000 > from || at * 1000 > from && at * 1000 - 3600000 < to) ? [index] : []);
    hourly = { time: indices.map(index => new Date(hours[index] * 1000).toISOString()), precipitationIntervalStart: indices.map(index => new Date((hours[index] - 3600) * 1000).toISOString()), ...Object.fromEntries(hourlyColumns.map(column => [column, values(indices.map(index => raw.hourly[column][index]))])) } as z.infer<typeof weatherOutput>['hourly'];
    const coverage = indices.length > 0 && hours[indices[0]] * 1000 <= from && hours[indices.at(-1)!] * 1000 >= to && indices.every((index, i) => i === 0 || hours[index] - hours[indices[i - 1]] === 3600);
    complete = coverage && hourlyColumns.every(column => hourly![column].every(value => value !== null));
  }
  return { complete, data: weatherOutput.parse({ location: query.location.label, timeZone: query.location.timeZone,
    reference: { latitude: query.location.latitude, longitude: query.location.longitude, basis: query.location.basis, userLocation: false }, forecast, dailyAggregation, ...(hourly ? { hourly } : {}),
    window: { from: query.from, to: query.to, granularity: query.hourly ? 'hourly' : 'daily', complete }, observedAt, forecastIssuedAt: null, modelVersion: 'not_reported',
    limitations: ['这是公开参考地点的预报，校园某一处的天气可能有差别，不能精确到几分钟。',
      '按日预报保留来源用固定时差计算的24小时统计。夏令时变化时，它可能不等于当地完整的一天，也不等于这次选的几小时；小时样本的最高或最低值也不能代替它。',
      ...(!periods.every(period => period.matchesLocalDay) ? ['这次部分日统计与当地完整的一天错开了，只说明标出的那段时间；小时预报是否覆盖完整时段，需要另看。'] : []),
      '小时气温和天气图标表示标出的时刻；降水量和降水概率说的是此前一小时。',
      '查到的时间不是预报发布的时间；来源没有提供预报的发布时间或所用模型版本。',
      '缺测是未知，不是没有雨。这份预报不含场地开放信息，也不能判断某个人的身体状况。'] }) };
}
