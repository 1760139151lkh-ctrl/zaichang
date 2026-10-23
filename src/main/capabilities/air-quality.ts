import { z } from 'zod';
import { HarnessError } from '../../shared/harness';
import { weatherInput, weatherRequest } from './weather';
import { addDate, dateInZone, dayBounds } from '../runtime/semantics';

export const airQualityInput = z.object({
  location: weatherInput.shape.location,
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict();
const columns = ['pm2_5', 'pm10', 'us_aqi', 'european_aqi'] as const;
export const airQualityOutput = z.object({
  location: z.string(), timeZone: z.string(),
  reference: z.object({ latitude: z.number(), longitude: z.number(), basis: z.string(), userLocation: z.literal(false) }).strict(),
  window: z.object({ from: z.string(), to: z.string(), complete: z.boolean() }).strict(),
  samples: z.array(z.object({ at: z.string(), localTime: z.string(), pm2_5: z.number().nullable(), pm10: z.number().nullable(), us_aqi: z.number().nullable(), european_aqi: z.number().nullable() }).strict()),
  units: z.object({ pm2_5: z.literal('μg/m³'), pm10: z.literal('μg/m³'), us_aqi: z.literal('US AQI'), european_aqi: z.literal('European AQI') }).strict(),
  kind: z.literal('model_forecast'), retrievedAt: z.string(), issuedAt: z.null(),
  source: z.literal('Open-Meteo / CAMS'), sourceUrl: z.string(), limitations: z.array(z.string()),
}).strict();

/** Public references only; the accepted shape cannot contain a device fix. */
export function airQualityRequest(raw: unknown, now: string) {
  const input = airQualityInput.parse(raw);
  const location = weatherRequest({ location: input.location }, now).location;
  if (!!input.from !== !!input.to) throw new HarnessError('air_quality_window', '空气质量查询须同时提供起止时间，或都省略。');
  const from = input.from || new Date(Math.floor(Date.parse(now) / 3600000) * 3600000).toISOString();
  const to = input.to || new Date(Date.parse(from) + 24 * 3600000).toISOString();
  const first = Math.floor(Date.parse(from) / 3600000) * 3600000, end = Date.parse(to);
  const today = dateInZone(now, location.timeZone), earliest = Date.parse(dayBounds(today, location.timeZone).from),
    latest = Date.parse(dayBounds(addDate(today, 4), location.timeZone).to);
  if (end <= Date.parse(from) || Date.parse(from) < earliest || end > latest)
    throw new HarnessError('air_quality_window', '空气质量预报仅查询所选地点当地今天起五天内的有效时间窗，按当地自然日边界计算；更远时段保留未知。');
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude),
    hourly: columns.join(','), timezone: 'UTC', timeformat: 'unixtime',
    start_date: new Date(first).toISOString().slice(0, 10), end_date: new Date(end - 1).toISOString().slice(0, 10) }).toString();
  return { location, from, to, first, end, url };
}

export function airQualityResult(query: ReturnType<typeof airQualityRequest>, raw: any, retrievedAt: string) {
  const times = raw?.hourly?.time;
  if (!Array.isArray(times) || times.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value))
    || columns.some(column => !Array.isArray(raw.hourly[column]) || raw.hourly[column].length !== times.length))
    throw new HarnessError('air_quality_incomplete', '空气质量来源未返回完整、对齐的小时列。');
  const units = raw.hourly_units || {};
  if (!['μg/m³', 'µg/m³'].includes(units.pm2_5) || !['μg/m³', 'µg/m³'].includes(units.pm10)
    || units.us_aqi !== 'USAQI' || units.european_aqi !== 'EAQI')
    throw new HarnessError('air_quality_units', '来源单位或AQI制式不匹配，未将数值当作可用结果。');
  if (times.some((value: number, index: number) => index > 0 && value <= times[index - 1]))
    throw new HarnessError('air_quality_time', '空气质量时间列重复或倒序。');
  const indices = times.flatMap((value: number, index: number) => value * 1000 >= query.first && value * 1000 < query.end ? [index] : []);
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const local = new Intl.DateTimeFormat('sv-SE', { timeZone: query.location.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const samples = indices.map(index => ({ at: new Date(times[index] * 1000).toISOString(),
    localTime: local.format(new Date(times[index] * 1000)),
    pm2_5: finite(raw.hourly.pm2_5[index]), pm10: finite(raw.hourly.pm10[index]),
    us_aqi: finite(raw.hourly.us_aqi[index]), european_aqi: finite(raw.hourly.european_aqi[index]),
  }));
  const expected = Math.ceil((query.end - query.first) / 3600000);
  const complete = samples.length === expected && samples.every((sample, index) =>
    Date.parse(sample.at) === query.first + index * 3600000 && columns.every(column => sample[column] !== null));
  return { complete, data: airQualityOutput.parse({ location: query.location.label, timeZone: query.location.timeZone,
    reference: { latitude: query.location.latitude, longitude: query.location.longitude, basis: query.location.basis, userLocation: false },
    window: { from: query.from, to: query.to, complete }, samples,
    units: { pm2_5: 'μg/m³', pm10: 'μg/m³', us_aqi: 'US AQI', european_aqi: 'European AQI' },
    kind: 'model_forecast', retrievedAt, issuedAt: null, source: 'Open-Meteo / CAMS', sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
    limitations: ['这是公共参考点的模型网格预报，不是设备位置或校园现场传感器读数。',
      'US AQI与European AQI制式不同，均不能直接称为中国官方AQI或互相混用。',
      '小时样本是对应时刻的预报；非整点窗口包含起点之前最近的整点样本，不证明整个时段始终如此。',
       '缺测是未知；查到的时间不是预报发布的时间。单凭这些数值，不能判断某人是否适宜运动或场地是否开放。'] }) };
}
