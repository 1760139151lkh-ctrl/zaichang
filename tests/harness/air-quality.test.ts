import test from 'node:test';
import assert from 'node:assert/strict';
import { airQualityRequest, airQualityResult } from '../../src/main/capabilities/air-quality';

const now = '2026-10-18T09:00:00Z';
function fixture() {
  const start = Date.parse(now) / 1000;
  return { hourly: { time: [start, start + 3600, start + 7200], pm2_5: [10, 20, 15], pm10: [20, 30, 25], us_aqi: [40, 60, 50], european_aqi: [30, 40, 35] },
    hourly_units: { pm2_5: 'μg/m³', pm10: 'μg/m³', us_aqi: 'USAQI', european_aqi: 'EAQI' } };
}
const query = () => airQualityRequest({ location: 'Zijingang', from: now, to: '2026-10-18T12:00:00Z' }, now);

test('public air forecast preserves reference, local time and both index systems', () => {
  const request = query(), result = airQualityResult(request, fixture(), now);
  assert.equal(request.url.hostname, 'air-quality-api.open-meteo.com');
  assert.equal(request.url.searchParams.get('timezone'), 'UTC');
  assert.equal(result.complete, true);
  assert.equal(result.data.reference.userLocation, false);
  assert.equal(result.data.samples[0].localTime, '2026-10-18 17:00');
  assert.equal(result.data.units.us_aqi, 'US AQI');
  assert.equal(result.data.units.european_aqi, 'European AQI');
  assert.equal(result.data.issuedAt, null);
});
test('air quality missing values and missing hours never become clean-air claims', () => {
  const raw = fixture(); raw.hourly.pm2_5[1] = null as any;
  const result = airQualityResult(query(), raw, now);
  assert.equal(result.complete, false); assert.equal(result.data.samples[1].pm2_5, null);
  const missing = fixture();
  for (const values of Object.values(missing.hourly)) values.splice(1, 1);
  assert.equal(airQualityResult(query(), missing, now).complete, false);
});
test('air quality rejects changed units, duplicate instants and device coordinates', () => {
  const raw = fixture(); raw.hourly_units.us_aqi = 'CN AQI';
  assert.throws(() => airQualityResult(query(), raw, now), /单位|AQI/);
  const duplicate = fixture(); duplicate.hourly.time[1] = duplicate.hourly.time[0];
  assert.throws(() => airQualityResult(query(), duplicate, now), /重复|倒序/);
  assert.throws(() => airQualityRequest({ location: { label: 'home', latitude: 30, longitude: 120, timeZone: 'Asia/Shanghai', basis: 'device_observation' } }, now));
  assert.throws(() => airQualityRequest({ location: 'Zijingang', deviceLatitude: 30 }, now));
});
test('forecast validates paired bounds, horizon and fractional hour interpretation', () => {
  assert.throws(() => airQualityRequest({ from: now }, now), /同时/);
  assert.throws(() => airQualityRequest({ from: now, to: now }, now), /有效时间窗/);
  assert.throws(() => airQualityRequest({ from: now, to: '2026-10-30T12:00:00Z' }, now), /五天/);
  const request = airQualityRequest({ from: '2026-10-18T09:30:00Z', to: '2026-10-18T11:30:00Z' }, now);
  const result = airQualityResult(request, fixture(), now);
  assert.equal(result.complete, true); assert.equal(Date.parse(result.data.samples[0].at), Date.parse(now));
  assert.ok(result.data.limitations.some(value => value.includes('起点之前')));
});
