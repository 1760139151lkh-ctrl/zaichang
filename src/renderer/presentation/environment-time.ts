import type { EnvironmentScene } from '../../shared/scenes';

/** Include every displayed boundary: a preceding-hour start may fall in the
 * other occurrence of a clock hour even when it is not a forecast sample. */
export function environmentTimeLabels(scene: EnvironmentScene) {
  const timeOptions = { timeZone: scene.timeZone, hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const dateOptions = { month: 'numeric', day: 'numeric' } as const;
  const dateFormat = new Intl.DateTimeFormat('zh-CN', { ...timeOptions, ...dateOptions });
  const offsetFormat = new Intl.DateTimeFormat('en', { timeZone: scene.timeZone, timeZoneName: 'shortOffset' });
  const offset = (at: string) => offsetFormat.formatToParts(new Date(at)).find(part => part.type === 'timeZoneName')?.value;
  const hourKey = (at: string) => dateFormat.format(new Date(at)).slice(0, -3);
  const instants = [...new Set([scene.window.from, scene.window.to,
    ...scene.samples.flatMap(sample => [sample.at, ...(sample.precipitationIntervalStart ? [sample.precipitationIntervalStart] : [])])]
    .map(at => new Date(at).toISOString()))];
  const offsets = new Map<string, Set<string | undefined>>();
  for (const at of instants) {
    const key = hourKey(at), values = offsets.get(key) || new Set<string | undefined>();
    values.add(offset(at)); offsets.set(key, values);
  }
  const isRepeated = (at: string) => (offsets.get(hourKey(at))?.size || 0) > 1;
  const formats = [false, true].map(date => [false, true].map(withOffset => new Intl.DateTimeFormat('zh-CN', {
    ...timeOptions, ...(date ? dateOptions : {}), ...(withOffset ? { timeZoneName: 'shortOffset' } : {}) })));
  return {
    hasRepeatedTimes: [...offsets.values()].some(values => values.size > 1),
    stamp: (at: string, date = false) => formats[Number(date)][Number(isRepeated(at))].format(new Date(at)),
    offset: (at: string) => isRepeated(at) ? offset(at) : undefined,
  };
}
