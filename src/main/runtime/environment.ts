import type { CompanionEnvironment } from '../../shared/environment';
import type { CapabilityResult } from '../capabilities/broker';
import { weatherCondition, weatherOutput } from '../capabilities/weather';
import { dateInZone } from './semantics';

interface EnvironmentAccess {
  weatherEnabled: boolean;
  allowed: boolean;
  clockTimeZone: string;
}
interface EnvironmentPort {
  now(): string;
  access(): EnvironmentAccess;
  readWeather(signal: AbortSignal, refresh: boolean): Promise<CapabilityResult>;
}

/** A view of the existing weather owner's result, never a second weather store. */
export function projectCompanionEnvironment(result: CapabilityResult | undefined, access: EnvironmentAccess, now: string): CompanionEnvironment {
  const empty: CompanionEnvironment = {
    weatherEnabled: access.weatherEnabled, status: !access.weatherEnabled || !access.allowed ? 'disabled' : 'unavailable',
    condition: 'unknown', weatherCode: null, isDay: null, timeZone: 'Asia/Shanghai', clockTimeZone: access.clockTimeZone,
    now, location: { id: 'Hangzhou', label: '杭州市区参考点', userLocation: false },
    observedAt: null, currentAt: null, expiresAt: null, sunriseAt: null, sunsetAt: null,
    intervalSeconds: null, temperatureC: null, precipitationMm: null,
    source: { sourceId: 'weather:open-meteo', basis: 'public_reference_model_current', userLocation: false },
  };
  if (empty.status === 'disabled' || !result || result.simulated || result.sourceId !== 'weather:open-meteo') return empty;
  const parsed = weatherOutput.safeParse(result.data);
  if (!parsed.success) return empty;
  const data = parsed.data;
  if (data.timeZone !== empty.timeZone || data.reference.basis !== 'city_reference' || data.reference.userLocation !== false
    || data.reference.latitude !== 30.2741 || data.reference.longitude !== 120.1551) return empty;
  const current = data.currentCondition, nowMs = Date.parse(now), observedMs = Date.parse(data.observedAt);
  const currentMs = current ? Date.parse(current.at) : NaN, sourceExpiry = Date.parse(result.expiresAt || '');
  const dayIndex = data.solar?.time.indexOf(dateInZone(now, empty.timeZone)) ?? -1;
  const sunriseAt = dayIndex >= 0 ? data.solar?.sunriseAt[dayIndex] ?? null : null;
  const sunsetAt = dayIndex >= 0 ? data.solar?.sunsetAt[dayIndex] ?? null : null;
  // A cached pre-dawn sample cannot keep the room at night after sunrise (or
  // vice versa). Refresh through the broker when this projection expires.
  const transition = [sunriseAt, sunsetAt].map(at => Date.parse(at || '')).filter(at => Number.isFinite(at) && at > currentMs);
  const expiresMs = Math.min(sourceExpiry, currentMs + 60 * 60000, ...transition);
  const metadata = { ...empty, observedAt: Number.isFinite(observedMs) ? data.observedAt : null,
    currentAt: current?.at ?? null, expiresAt: Number.isFinite(expiresMs) ? new Date(expiresMs).toISOString() : null,
    sunriseAt, sunsetAt };
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedMs) || observedMs > nowMs + 60000
    || !Number.isFinite(currentMs) || currentMs > nowMs + 60000 || !Number.isFinite(expiresMs)) return metadata;
  if (expiresMs <= nowMs || result.status === 'stale') return { ...metadata, status: 'expired' };
  const condition = weatherCondition(current!.weatherCode);
  if (result.status !== 'fresh' || condition === 'unknown' || current!.isDay === null) return metadata;
  return { ...metadata, status: 'fresh', condition, weatherCode: current!.weatherCode, isDay: current!.isDay,
    intervalSeconds: current!.intervalSeconds, temperatureC: current!.temperatureC, precipitationMm: current!.precipitationMm };
}

/** Only the live desktop window owns refresh timing. All I/O still goes through
 * CapabilityBroker, whose scope cache, single flight and cancellation remain authoritative. */
export class CompanionEnvironmentOwner {
  private result?: CapabilityResult;
  private active = false;
  private disposed = false;
  private disposedView?: CompanionEnvironment;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: { controller: AbortController; promise: Promise<CompanionEnvironment> };
  private listeners = new Set<() => void>();
  constructor(private readonly port: EnvironmentPort) {}
  snapshot() { return this.disposedView ? structuredClone(this.disposedView) : projectCompanionEnvironment(this.result, this.port.access(), this.port.now()); }
  onChanged(callback: () => void) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
  private emit() { for (const callback of this.listeners) { try { callback(); } catch { /* Observation cannot undo source state. */ } } }
  private clearTimer() { clearTimeout(this.timer); this.timer = undefined; }
  private schedule() {
    this.clearTimer();
    const view = this.snapshot();
    if (!this.active || this.disposed) return;
    const now = Date.parse(this.port.now());
    let next = view.status === 'fresh' && view.expiresAt ? Date.parse(view.expiresAt) : NaN;
    if (view.status === 'expired' && this.result?.status === 'fresh') {
      const parsed = weatherOutput.safeParse(this.result.data), current = parsed.success ? parsed.data.currentCondition : null;
      // Sunrise can fall between the source's model samples. In that case try
      // once at its next declared interval; never loop on an old/missing sample.
      if (current?.intervalSeconds) {
        const sample = Date.parse(current.at) + current.intervalSeconds * 1000;
        if (sample > now && sample <= now + 30 * 60000) next = sample;
      }
    }
    if (!Number.isFinite(next)) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.read(); }, Math.max(50, next - now + 50));
    this.timer.unref?.();
  }
  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) void this.read();
    else {
      this.clearTimer(); this.generation++;
      this.flight?.controller.abort(); this.flight = undefined;
    }
  }
  invalidate() {
    if (this.disposed) return;
    this.generation++; this.clearTimer(); this.result = undefined;
    this.flight?.controller.abort(); this.flight = undefined;
    this.emit();
  }
  settingsChanged() { this.invalidate(); if (this.active) void this.read(); }
  async read(): Promise<CompanionEnvironment> {
    const view = this.snapshot();
    if (this.disposed || !this.active) return view;
    if (view.status === 'disabled') {
      this.clearTimer();
      if (this.result || this.flight) this.invalidate();
      return this.snapshot();
    }
    if (this.flight) return this.flight.promise;
    const controller = new AbortController(), generation = this.generation;
    // The room can expire at a solar transition before a daily forecast's TTL.
    const refresh = view.status === 'expired' && !!this.result?.expiresAt
      && Date.parse(this.result.expiresAt) > Date.parse(this.port.now());
    if (view.status === 'expired') this.emit();
    const flight = { controller, promise: undefined! as Promise<CompanionEnvironment> };
    flight.promise = (async () => {
      try {
        const result = await this.port.readWeather(controller.signal, refresh);
        if (!this.disposed && !controller.signal.aborted && generation === this.generation) this.result = result;
      } catch { /* No guessed condition or automatic retry loop after a failed read. */ }
      finally {
        if (this.flight === flight) this.flight = undefined;
        if (!this.disposed && generation === this.generation) { this.emit(); this.schedule(); }
      }
      return this.snapshot();
    })();
    this.flight = flight;
    return flight.promise;
  }
  dispose() {
    if (this.disposed) return;
    this.disposedView = projectCompanionEnvironment(undefined, { ...this.port.access(), allowed: false }, this.port.now());
    this.disposed = true; this.active = false; this.generation++; this.clearTimer();
    this.flight?.controller.abort(); this.flight = undefined; this.result = undefined; this.listeners.clear();
  }
}
