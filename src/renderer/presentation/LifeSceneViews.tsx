import { useMemo, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronDown, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, Wind } from 'lucide-react';
import type { EnvironmentSample, EnvironmentScene, PlanningBlock, PlanningScene, SemanticSelection } from '../../shared/scenes';
import './life-scenes.css';

interface SelectionProps { selection?: SemanticSelection | null; onSelect: (value: SemanticSelection) => void }
const number = (value: number | null | undefined, unit = '') => value == null ? '未知' : `${Number(value.toFixed(1))}${unit}`;
function stamp(value: string, zone: string, date = false) {
  return new Date(value).toLocaleString('zh-CN', { timeZone: zone, ...(date ? { month: 'numeric', day: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', hour12: false });
}
function dayKey(value: string, zone: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function dayName(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('zh-CN', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' });
}
function interval(block: PlanningBlock, zone: string) {
  if (!block.end) return `${stamp(block.start, zone)} 起`;
  return `${stamp(block.start, zone)} — ${stamp(block.end, zone, dayKey(block.start, zone) !== dayKey(block.end, zone))}`;
}
const sourceName = (id: string) => id === 'local-agenda' ? '本机日历' : ['user-declared', 'current'].includes(id) ? '这次告诉我的安排' : id.startsWith('campus:') ? '校园资料' : id.startsWith('map:') ? '校园路线' : id.startsWith('weather:') ? '环境预报' : '相关资料';
const blockNames: Record<PlanningBlock['kind'], string> = { busy: '已有安排', work: '待商量', setup: '准备', cleanup: '收尾', transition: '转场 / 休息', protected: '特意留白', free: '尚未安排' };

export function PlanningTime({ scene, selection, onSelect }: SelectionProps & { scene: PlanningScene }) {
  const zone = scene.window.timeZone;
  const groups = useMemo(() => {
    const map = new Map<string, PlanningBlock[]>();
    for (const block of scene.blocks) {
      const day = dayKey(new Date(Math.max(Date.parse(block.start), Date.parse(scene.window.from))).toISOString(), zone);
      map.set(day, [...(map.get(day) || []), block]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scene.blocks, scene.window.from, zone]);
  const [browsedDay, setBrowsedDay] = useState<string>();
  const activeDay = groups.some(([day]) => day === browsedDay) ? browsedDay! : groups[0]?.[0];
  const blocks = groups.find(([day]) => day === activeDay)?.[1] || [];
  const selectedId = selection?.kind === 'time_block' && selection.sceneId === scene.id && selection.sceneRevision === scene.revision ? selection.blockId : undefined;
  const unresolved = [...new Set([...scene.conditions, ...(scene.adoption?.blockers || [])])];
  return <section className="life-scene planning-scene" aria-label="一段属于自己的时间" data-scene-id={scene.id}>
    <header className="life-scene-heading">
      <div><h3>{scene.mode === 'draft' ? '一段属于自己的时间' : '看看时间的余地'}</h3><p>{scene.mode === 'draft' ? '把准备和休息也留进去，慢慢商量。' : '从已有安排之间，找一段可以商量的时间。'}</p></div>
      {groups.length > 1 ? <label className="life-scene-day"><span className="sr-only">查看哪一天</span><select aria-label="查看哪一天" value={activeDay} onChange={event => setBrowsedDay(event.target.value)}>{groups.map(([day]) => <option key={day} value={day}>{dayName(day)}</option>)}</select></label>
        : activeDay ? <span className="life-scene-date">{dayName(activeDay)}</span> : null}
    </header>
    <div className="planning-timeline" role="group" aria-label="选择一个时段，接着聊">
      {blocks.map(block => <button type="button" className={`planning-time-block planning-time-${block.kind}${selectedId === block.id ? ' is-selected' : ''}`} key={block.id}
        aria-pressed={selectedId === block.id} onClick={() => onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'time_block', blockId: block.id })}
        aria-label={`${interval(block, zone)}，${block.label}，${blockNames[block.kind]}${block.end ? '' : '，结束时间未知'}，选择后接着聊`}>
        <span className="planning-time-stamp">{interval(block, zone)}</span><span className="planning-time-dot" aria-hidden="true" />
        <span className="planning-time-content"><span className="planning-time-title"><strong>{block.label}</strong><span>{block.end ? `${number((Date.parse(block.end) - Date.parse(block.start)) / 60000)} 分钟` : '结束待定'}</span></span>
          <span className="planning-time-note">{block.usableMinutes ? `扣去两侧转换，可用 ${number(block.usableMinutes.min)}${block.usableMinutes.max !== block.usableMinutes.min ? `—${number(block.usableMinutes.max)}` : ''} 分钟`
            : block.reason || (block.kind === 'protected' ? '这一段，留给自己。' : block.kind === 'free' ? '不必填满，也可以什么都不安排。' : blockNames[block.kind])}</span>
        </span>
      </button>)}
      {!blocks.length && <p className="life-scene-empty">这次还没有可显示的时段，可以接着说说你想怎样安排。</p>}
    </div>
    {scene.unscheduled.length > 0 && <details className="life-scene-notes"><summary>还有 {scene.unscheduled.length} 件事没放进来<ChevronDown size={13} /></summary><ul>{scene.unscheduled.map((item, index) => <li key={index}><strong>{item.title}</strong> · {item.reason}</li>)}</ul></details>}
    {unresolved.length > 0 && <details className="life-scene-notes"><summary>有些条件还要核对<ChevronDown size={13} /></summary><ul>{unresolved.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    <footer className="life-scene-footer"><span><CalendarDays size={14} aria-hidden="true" />一起商量 · 尚未保存</span>
      <details><summary>安排与依据<ChevronDown size={13} /></summary><div className="life-scene-source">
        <p>{stamp(scene.window.from, zone, true)} 至 {stamp(scene.window.to, zone, true)} · {zone}</p>
        <p>{scene.source.fetchedAt ? `${stamp(scene.source.fetchedAt, zone, true)} 读取本机安排` : '这份安排没有附读取时间。'}</p>
        {scene.sourceCoverage.map((row, index) => <p key={index}>{sourceName(row.sourceId)}{row.status !== 'complete' ? ' · 范围还不完整' : ''}{row.reason ? `：${row.reason}` : ''}</p>)}
        <p>点选只是继续商量。真正采用时，会重新核对安排和完整占用。</p>
        {scene.expiresAt && <p>这次方案的核查截至 {stamp(scene.expiresAt, zone, true)}；超过后按当时的日程重新看看。</p>}
      </div></details>
    </footer>
  </section>;
}

function WeatherIcon({ sample, size = 25 }: { sample: EnvironmentSample; size?: number }) {
  const code = sample.weatherCode;
  const Icon = code === 0 ? Sun : code === 1 || code === 2 ? CloudSun : code === 45 || code === 48 ? CloudFog
    : code != null && [95, 96, 97, 99].includes(code) ? CloudLightning
      : code != null && [71, 73, 75, 77, 85, 86].includes(code) ? CloudSnow
        : code != null && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code) ? CloudRain : Cloud;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
function moveHour(event: KeyboardEvent<HTMLButtonElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const items = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')];
  const index = items.indexOf(event.currentTarget), target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
  event.preventDefault(); items[target]?.focus(); items[target]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function EnvironmentHours({ scene, selection, onSelect }: SelectionProps & { scene: EnvironmentScene }) {
  const air = scene.domain === 'air_quality';
  const selectedId = selection?.kind === 'environment_sample' && selection.sceneId === scene.id && selection.sceneRevision === scene.revision ? selection.sampleId : undefined;
  const sample = scene.samples.find(row => row.id === selectedId) || scene.samples.find(row => Date.parse(row.at) >= Date.parse(scene.window.from)) || scene.samples[0];
  if (!sample) return null;
  const select = (row: EnvironmentSample) => onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'environment_sample', sampleId: row.id });
  return <section className={`life-scene environment-scene${air ? ' environment-air' : ''}`} aria-label={air ? '小时空气预报' : '小时天气预报'} data-scene-id={scene.id}>
    <header className="life-scene-heading"><div className="environment-heading-label">{air ? <Wind size={27} strokeWidth={1.5} aria-hidden="true" /> : <WeatherIcon sample={sample} size={29} />}<div><h3>{air ? '空气，也看一眼' : '看看这段时间的天气'}</h3><p>{scene.location} · {scene.timeZone}</p></div></div></header>
    <div className="environment-hour-strip" role="group" aria-label="选择预报时刻，可用左右方向键浏览">
      {scene.samples.map(row => <button type="button" key={row.id} className={`environment-hour${sample.id === row.id ? ' is-active' : ''}${selectedId === row.id ? ' is-selected' : ''}`} aria-pressed={selectedId === row.id}
        onClick={() => select(row)} onKeyDown={moveHour}
        aria-label={`${stamp(row.at, scene.timeZone, true)}，${air ? `PM2.5 ${number(row.pm2_5, ' 微克每立方米')}` : `气温 ${number(row.temperatureC, ' 摄氏度')}`}，选择后接着聊`}>
        <span className="environment-hour-day">{dayName(dayKey(row.at, scene.timeZone)).split('日')[0]}日</span><time dateTime={row.at}>{stamp(row.at, scene.timeZone)}</time>
        {air ? <Wind size={23} strokeWidth={1.4} aria-hidden="true" /> : <WeatherIcon sample={row} />}
        <strong>{air ? number(row.pm2_5) : number(row.temperatureC, '°')}</strong><small>{air ? 'PM2.5 · μg/m³' : '时刻气温'}</small>
      </button>)}
    </div>
    <div className="environment-hour-detail" aria-live="polite">
      <div className="environment-detail-heading">{air ? <Wind size={24} strokeWidth={1.5} aria-hidden="true" /> : <WeatherIcon sample={sample} size={29} />}<strong>{stamp(sample.at, scene.timeZone, true)}{!air ? ` · ${number(sample.temperatureC, '°C')}` : ''}</strong></div>
      {air ? <dl className="environment-air-values"><div><dt>PM2.5</dt><dd>{number(sample.pm2_5)}<small> μg/m³</small></dd></div><div><dt>PM10</dt><dd>{number(sample.pm10)}<small> μg/m³</small></dd></div><div><dt>US AQI</dt><dd>{number(sample.usAqi)}</dd></div><div><dt>European AQI</dt><dd>{number(sample.europeanAqi)}</dd></div></dl>
        : <p>{sample.precipitationIntervalStart ? `${stamp(sample.precipitationIntervalStart, scene.timeZone, dayKey(sample.precipitationIntervalStart, scene.timeZone) !== dayKey(sample.at, scene.timeZone))} — ${stamp(sample.at, scene.timeZone)} ` : '前一小时 '}降水 {number(sample.precipitationMm, ' mm')} · 概率 {number(sample.precipitationProbability, '%')}</p>}
    </div>
    <footer className="life-scene-footer"><span>{scene.window.complete ? '公共参考点预报' : '预报有缺测或覆盖不足'}</span><details><summary>时间与来源<ChevronDown size={13} /></summary><div className="life-scene-source">
      <p>{air ? 'Open-Meteo / CAMS' : 'Open-Meteo'} · 公共参考地点</p>
      <p>{scene.source.fetchedAt ? `${stamp(scene.source.fetchedAt, scene.timeZone, true)} 获取` : '来源没有附获取时间。'}</p><p>预报发布时间未提供；获取时间不代表发布时间。</p>
      <p>查询窗口：{stamp(scene.window.from, scene.timeZone, true)} 至 {stamp(scene.window.to, scene.timeZone, true)}。</p>
      {scene.limitations.map((item, index) => <p key={index}>{item}</p>)}
    </div></details></footer>
  </section>;
}
