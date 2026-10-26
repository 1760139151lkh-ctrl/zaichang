/** Public-reference weather projected by the host for the companion room. */
export type EnvironmentCondition = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm' | 'unknown';

export interface CompanionEnvironment {
  weatherEnabled: boolean;
  status: 'fresh' | 'disabled' | 'unavailable' | 'expired';
  condition: EnvironmentCondition;
  weatherCode: number | null;
  isDay: boolean | null;
  /** The weather reference's declared zone, never the browser's device zone. */
  timeZone: 'Asia/Shanghai';
  /** The person's separately declared clock zone, used for time-only fallback. */
  clockTimeZone: string;
  now: string;
  location: { id: 'Hangzhou'; label: string; userLocation: false };
  observedAt: string | null;
  currentAt: string | null;
  expiresAt: string | null;
  sunriseAt: string | null;
  sunsetAt: string | null;
  intervalSeconds: number | null;
  temperatureC: number | null;
  precipitationMm: number | null;
  source: { sourceId: 'weather:open-meteo'; basis: 'public_reference_model_current'; userLocation: false };
}
