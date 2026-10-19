import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, LoaderCircle } from 'lucide-react';
import type { CampusAcademicReference } from '../../shared/campus-academic';
import type { CampusGpaScale, CampusRecord, CampusScene, SemanticSelection } from '../../shared/scenes';
import { uiError } from '../ui';
import './campus-academic.css';

const labels: Record<CampusGpaScale, string> = { fivePoint: '五分制', fourPoint: '4.3 制换算', fourPointLegacy: '传统 4 制换算', hundredPoint: '百分等值' };
const maxima: Record<CampusGpaScale, number> = { fivePoint: 5, fourPoint: 4.3, fourPointLegacy: 4, hundredPoint: 100 };
const policies: Record<string, string> = { all_attempts: '全部修读', first_attempt: '首次修读', highest_attempt: '最高成绩', repository_first_response: '来源首条记录' };
const format = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value) : '—';
const term = (value: string) => value.replace(/^(\d{4})-(\d{4})-([12])$/, (_all, first, last, half) => `${first}—${last} ${half === '1' ? '秋冬' : '春夏'}`);
const point = (row: CampusRecord, scale: CampusGpaScale) => row.gpa ? row.gpa.values[scale] : row.grade?.[scale];
const stamp = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}) : '来源未附采集时间';

export function CampusAcademicView({ scene, sessionId, boundaryKey = '', selection, onSelect }: {
  scene: CampusScene | CampusAcademicReference; sessionId: string; boundaryKey?: string;
  selection?: SemanticSelection | null; onSelect: (value: SemanticSelection) => void;
}) {
  const key = `${sessionId}:${scene.id}@${scene.revision}`, currentKey = useRef(key); currentKey.current = key;
  const request = useRef(0), boundary = useRef(boundaryKey), blocked = useRef<string | undefined>(undefined), liveVersion = useRef(scene.source.version);
  const [data, setData] = useState<CampusScene | undefined>(scene.kind === 'campus' ? scene : undefined);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState<string>();
  const [scale, setScale] = useState<CampusGpaScale>(scene.kind === 'campus' ? scene.academicDisplay?.scale || 'fivePoint' : scene.display.scale);
  const previousKey = useRef(key), sourceId = useId();
  useEffect(() => {
    if (previousKey.current !== key || liveVersion.current !== scene.source.version) {
      previousKey.current = key; liveVersion.current = scene.source.version; request.current++; setSelected(undefined); setError('');
      setPending(false); setData(scene.kind === 'campus' && blocked.current !== key ? scene : undefined);
      setScale(scene.kind === 'campus' ? scene.academicDisplay?.scale || 'fivePoint' : scene.display.scale);
    } else if (scene.kind === 'campus' && blocked.current !== key) setData(scene);
  }, [key, scene]);
  useEffect(() => {
    if (boundary.current === boundaryKey) return;
    boundary.current = boundaryKey; blocked.current = key; request.current++;
    setData(undefined); setSelected(undefined); setPending(false); setError('');
  }, [boundaryKey, key]);
  useEffect(() => () => { request.current++; }, []);
  async function open() {
    const generation = ++request.current, expected = key;
    setPending(true); setError('');
    try {
      const next = await window.zaichang.campusAcademicRead({ sessionId, sceneId: scene.id, sceneRevision: scene.revision });
      if (generation !== request.current || currentKey.current !== expected) return;
      blocked.current = undefined; setData(next); setSelected(undefined); setScale(next.academicDisplay?.scale || 'fivePoint');
    } catch (problem) { if (generation === request.current && currentKey.current === expected) setError(uiError(problem)); }
    finally { if (generation === request.current && currentKey.current === expected) setPending(false); }
  }
  const heading = scene.domain === 'grades' ? '成绩' : scene.domain === 'gpa_semesters' ? '学期绩点' : scene.domain === 'gpa_cumulative' ? '累计绩点' : 'GPA 口径';
  if (!data || boundary.current !== boundaryKey || previousKey.current !== key || liveVersion.current !== scene.source.version)
    return <section className="academic-reference" aria-label={`${heading}资料`}>
    <div><h3>{heading}资料</h3><p>按原来的范围，回校园资料里看看。</p></div>
    <button type="button" disabled={pending} onClick={() => void open()}>{pending ? <LoaderCircle size={16} className="academic-loading" aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}
      {pending ? '正在读原资料' : `打开${heading}资料`}</button>
    {error && <p role="alert" className="academic-error">{error}</p>}
  </section>;
  const grade = data.domain === 'grades', mode = data.academicDisplay?.mode || (data.records.length === 1 ? 'detail' : 'table');
  const selectedId = selection?.sceneId === data.id && selection.sceneRevision === data.revision && selection.kind === 'record' ? selection.recordId : selected;
  const row = data.records.find(row => row.id === selectedId) || (mode === 'detail' ? data.records[0] : undefined);
  const available = (Object.keys(labels) as CampusGpaScale[]).filter(scale => data.records.some(row => row.gpa
    ? Object.hasOwn(row.gpa.values, scale) : row.grade && Object.hasOwn(row.grade, scale)));
  const choose = (row: CampusRecord) => {
    setSelected(row.id); onSelect({ sceneId: data.id, sceneRevision: data.revision, kind: 'record', recordId: row.id, campusScale: scale });
  };
  return <section className="academic-view" aria-label={heading} data-scene-id={data.id}>
    <header className="academic-heading"><div><h3>{mode === 'detail' && grade && row ? row.title : heading}</h3>
      {data.term && <p>{term(data.term)}</p>}</div>
      {!grade && available.length > 1 && <div className="academic-scales" role="group" aria-label="绩点制式">
        {available.map(value => <button type="button" key={value} aria-pressed={scale === value} onClick={() => setScale(value)}>{labels[value]}</button>)}
      </div>}
    </header>
    {mode === 'detail' && row ? <div className="academic-single"><div className="academic-single-score">
      <strong title={grade ? row.grade?.original || undefined : String(point(row, scale) ?? '')}>{grade ? row.grade?.original || '未提供' : format(point(row, scale))}</strong>
      <span>{grade ? '原成绩' : labels[scale]}</span></div>
      <div className="academic-single-context">{grade ? <><p>{row.credit === undefined ? '学分未提供' : `${row.credit} 学分`}</p>
        <p>{labels[scale]} <b>{format(point(row, scale))}</b></p></> : <><h4>{term(row.title)}</h4><p>{row.gpa?.denominator == null ? '计入学分未提供' : `计入 ${format(row.gpa.denominator)} 学分`}</p></>}
      </div>
    </div> : mode === 'trend' ? <AcademicTrend rows={data.records} scale={scale} selectedId={selectedId} onSelect={choose} />
      : <div className="academic-table-scroll"><table className="academic-table"><thead><tr>
        <th scope="col">{grade ? '课程' : data.domain === 'gpa_overall' ? '修读口径' : '学期'}</th>
        <th scope="col">{grade ? '学分' : labels[scale]}</th><th scope="col">{grade ? '原成绩' : '计入学分'}</th>
        <th scope="col">{grade ? `绩点 · ${labels[scale]}` : '计入修读'}</th>
      </tr></thead><tbody>{data.records.map(item => <tr key={item.id} className={selectedId === item.id ? 'is-selected' : undefined} onClick={() => choose(item)}>
        <th scope="row"><button type="button" aria-pressed={selectedId === item.id}>{term(item.title)}</button>
          {grade && item.term && item.term !== data.term && <small>{term(item.term)}</small>}</th>
        <td title={grade ? undefined : String(point(item, scale) ?? '')}>{grade ? format(item.credit) : format(point(item, scale))}</td>
        <td>{grade ? item.grade?.original || '未提供' : format(item.gpa?.denominator)}</td>
        <td title={grade ? String(point(item, scale) ?? '') : undefined}>{grade ? format(point(item, scale)) : format(item.gpa?.countedAttempts)}</td>
      </tr>)}</tbody></table></div>}
    {row && <div className="academic-selected">
      {mode !== 'detail' && <h4>{term(row.title)}</h4>}
      {grade ? <p>{row.grade?.exclusionReason || (row.grade?.included === true ? '来源标记为 GPA 计入项。' : row.grade?.included === false ? '来源标记为不计入 GPA。' : '来源尚未说明是否计入 GPA。')}</p>
        : <p>{row.gpa?.policy ? policies[row.gpa.policy] || row.gpa.policy : '修读口径未提供'}
          {row.gpa?.complete === false || row.gpa?.sourceComplete === false ? ' · 资料尚不完整' : ''}
          {row.gpa?.incompleteAttempts ? ` · ${row.gpa.incompleteAttempts} 项缺少计算资料` : ''}</p>}
      <button type="button" className="academic-continue" onClick={() => choose(row)}>继续聊这{grade ? '门课' : '个口径'}<ArrowUpRight size={15} aria-hidden="true" /></button>
    </div>}
    <footer className="academic-footer"><details><summary aria-controls={sourceId}>口径与来源<ChevronDown size={13} aria-hidden="true" /></summary>
      <div id={sourceId}><p>{data.sourceLabel} · {stamp(data.source.fetchedAt)}{Number.isFinite(Date.parse(data.source.fetchedAt)) ? ' 采集' : ''}</p>
        <p>{labels[scale]}{!grade ? ' · 依原来源的学分加权结果，属于分析口径。' : ' · 保留每次修读，原成绩与绩点分开。'}</p>
        {!grade && <p>分母只用实际计入学分；不同修读政策与学期范围不混算，缺少值不按零计算。</p>}
        {row?.gpa?.formula && <p className="academic-formula">{row.gpa.formula}</p>}
        {data.resultStatus === 'stale' && <p>这是来源保留的较早结果，可以按当前需要重新读取。</p>}
      </div></details><span>{grade ? labels[scale] + ' · ' : ''}本次读到 {data.records.length} 项{data.total !== undefined && data.total > data.records.length ? ` / ${data.total} 项` : ''}{!data.complete ? ' · 部分资料' : ''}</span>
    </footer>
  </section>;
}

function AcademicTrend({ rows, scale, selectedId, onSelect }: { rows: CampusRecord[]; scale: CampusGpaScale; selectedId?: string; onSelect: (row: CampusRecord) => void }) {
  const items = rows.filter(row => /^\d{4}-\d{4}-[12]$/.test(row.term || row.gpa?.throughTerm || ''))
    .sort((a, b) => (a.term || a.gpa?.throughTerm || '').localeCompare(b.term || b.gpa?.throughTerm || ''));
  const max = maxima[scale], width = 700, height = 216;
  const points = items.map((row, index) => { const value = point(row, scale); return { row, value,
    x: 36 + index * ((width - 72) / Math.max(1, items.length - 1)),
    y: typeof value === 'number' && value >= 0 && value <= max ? 20 + (1 - value / max) * (height - 56) : null }; });
  return <div className="academic-trend"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${labels[scale]}逐学期走势`}>
    {[0, max / 2, max].map(value => { const y = 20 + (1 - value / max) * (height - 56); return <g key={value}><line x1="32" x2={width - 24} y1={y} y2={y} className="academic-chart-rule" /><text x="4" y={y + 4} className="academic-chart-axis">{format(value)}</text></g>; })}
    {points.map((current, index) => { const previous = points[index - 1]; return current.y !== null && previous?.y != null
      && current.row.gpa?.complete === true && previous.row.gpa?.complete === true
      ? <line key={`line:${current.row.id}`} x1={previous.x} y1={previous.y} x2={current.x} y2={current.y} className="academic-chart-line" /> : null; })}
    {points.map(value => value.y === null ? null : <g key={value.row.id} role="button" tabIndex={0} aria-label={`${term(value.row.title)}，${format(value.value)}，选中继续`}
      aria-pressed={selectedId === value.row.id} onClick={() => onSelect(value.row)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(value.row); } }}>
      <circle cx={value.x} cy={value.y} r="17" fill="transparent" />
      <circle cx={value.x} cy={value.y} r={selectedId === value.row.id ? 5.5 : 4} className={`academic-chart-dot${value.row.gpa?.complete !== true ? ' is-partial' : ''}`} />
      <text x={value.x} y={value.y - 15} textAnchor="middle" className="academic-chart-value">{format(value.value)}</text>
    </g>)}
  </svg><div className="academic-trend-labels">{items.map(row => <button type="button" key={row.id} onClick={() => onSelect(row)} aria-pressed={selectedId === row.id}>{term(row.term || row.gpa?.throughTerm || '')}</button>)}</div></div>;
}
