import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Heart, ImagePlus, Moon, Plus, SlidersHorizontal, Sun, Sunset, Trash2 } from 'lucide-react';
import { COMPANIONS, CompanionScene, WINDOW_LIGHT, companionName, useCompanion } from './companion';
import { useAppearance } from './appearance';
import { Switch, uiError } from './ui';

const categories = ['全部', '二次元', '插画', '写实', '我的收藏'] as const;
export function CompanionSettings() {
  const { value, update, setPicture, removePicture, rename, toggleFavorite } = useCompanion();
  const [appearance, setAppearance] = useAppearance();
  const file = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('全部');
  const [name, setName] = useState(() => companionName(value));
  const [placement, setPlacement] = useState({ scale: value.scale, position: value.position });
  const [adjusting, setAdjusting] = useState(false);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => setName(companionName(value)), [value.character, value.names, value.pictures]);
  useEffect(() => setPlacement({ scale: value.scale, position: value.position }), [value.scale, value.position, value.character]);
  const isNight = appearance.theme === 'dark' || (appearance.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const custom = value.pictures.find(item => item.id === value.character);
  const gallery = category === '我的收藏'
    ? [...COMPANIONS.filter(item => value.favorites.includes(item.id)), ...value.pictures]
    : COMPANIONS.filter(item => category === '全部' || item.category === category);
  function perform(action: () => void) {
    setError('');
    try { action(); } catch (problem) {
      setError(problem instanceof DOMException && problem.name === 'QuotaExceededError' ? '这台电脑暂时放不下新的选择，原来的图片还在。可以先移走一张不常用的图片。' : uiError(problem));
    }
  }
  function choose(character: typeof value.character) {
    request.current++; setOpening(false);
    perform(() => update({ character }));
  }
  async function importPicture(selected: File) {
    const id = ++request.current;
    setOpening(true); setError('');
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type)) throw new Error('选一张 PNG、JPG 或 WebP 图片吧。');
      if (selected.size > 20_000_000) throw new Error('这张图片太大了，换一张 20 MB 以内的试试。');
      const bitmap = await createImageBitmap(selected, { imageOrientation: 'from-image' });
      try {
        const scale = Math.min(1, 1400 / bitmap.width, 1700 / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('这次没能打开图片，再选一次试试。');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', .86);
        if (id === request.current) { setPicture(dataUrl, selected.name.replace(/\.[^.]+$/, '')); setCategory('我的收藏'); }
      } finally { bitmap.close(); }
    } catch (problem) {
      if (id === request.current) setError(problem instanceof DOMException && problem.name === 'QuotaExceededError' ? '这台电脑暂时放不下这张图，原来的图片还在。换一张小些的试试。' : uiError(problem));
    } finally { if (id === request.current) setOpening(false); }
  }
  function savePlacement() {
    if (placement.scale !== value.scale || placement.position !== value.position) {
      try { update(placement); setError(''); } catch (problem) { setPlacement({ scale: value.scale, position: value.position }); setError(uiError(problem)); }
    }
  }

  return <section className="companion-settings" aria-label="陪伴的样子">
    <div className="companion-options">
      <p className="companion-intro">不同的样子，同样的陪伴。找到让你感到安心的那一个。</p>
      <div className="companion-categories" role="group" aria-label="形象风格">
        {categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="character-choices" role="group" aria-label="选择喜欢的形象">
        {gallery.map(character => <div className="character-card" key={character.id}>
          <button type="button" className="character-choice" aria-pressed={value.character === character.id} onClick={() => choose(character.id)}>
            <span className={`character-picture ${character.id.startsWith('custom:') ? 'is-custom' : ''}`} style={{ backgroundImage: `url(${WINDOW_LIGHT.morning})` }}><img src={character.image} alt="" />{value.character === character.id && <span className="character-chosen"><Check size={13} /></span>}</span>
            <span>{companionName(value, character.id)}</span>
          </button>
          {!character.id.startsWith('custom:') && <button type="button" className="character-favorite" aria-label={`${value.favorites.includes(character.id) ? '不再收藏' : '收藏'}${companionName(value, character.id)}`} aria-pressed={value.favorites.includes(character.id)} onClick={() => perform(() => toggleFavorite(character.id))}><Heart size={14} fill={value.favorites.includes(character.id) ? 'currentColor' : 'none'} /></button>}
        </div>)}
        {category === '全部' && <button type="button" className="character-choice" aria-pressed={value.character === 'light'} onClick={() => choose('light')}>
          <span className="character-picture character-light" style={{ backgroundImage: `url(${WINDOW_LIGHT.morning})` }}>{value.character === 'light' && <span className="character-chosen"><Check size={13} /></span>}</span><span>{companionName(value, 'light')}</span>
        </button>}
        {category === '我的收藏' && <button type="button" className="character-choice character-add" disabled={opening} onClick={() => file.current?.click()}><span className="character-picture"><Plus size={25} /><span>带一张喜欢的图</span></span></button>}
      </div>
      {category === '我的收藏' && !gallery.length && <p className="companion-empty">喜欢的形象，留在这里。也可以带来自己的图片。</p>}
      <div className="custom-character">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="选择人物图片" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) void importPicture(selected); }} />
        <button type="button" className="text-button" disabled={opening} onClick={() => file.current?.click()}><ImagePlus size={17} />{opening ? '正在打开图片…' : '用自己的图片'}</button>
        {category !== '我的收藏' && value.pictures.length > 0 && <button type="button" className="text-button" onClick={() => setCategory('我的收藏')}>看看我的收藏</button>}
      </div>
      <form className="companion-name" onSubmit={event => { event.preventDefault(); perform(() => rename(value.character, name)); }}>
        <label htmlFor="companion-display-name">怎么称呼这个形象</label>
        <div><input id="companion-display-name" value={name} maxLength={60} onChange={event => setName(event.target.value)} /><button type="submit" className="text-button" disabled={name.trim() === companionName(value)} aria-label="记住这个称呼"><Check size={17} /></button></div>
      </form>
      {custom && <button type="button" className="text-button companion-remove" disabled={opening} onClick={() => perform(() => removePicture(custom.id))}><Trash2 size={15} />移走这张图片</button>}
      {error && <p className="inline-problem companion-problem" role="alert">{error}</p>}
      <div className="companion-motion"><Switch label="少一点动态" checked={value.reducedMotion} onChange={reducedMotion => perform(() => update({ reducedMotion }))} /></div>
    </div>
    <div className="companion-preview">
      <CompanionScene preview placement={placement} />
      <div className="companion-preview-controls">
        <div className="soft-choices" role="group" aria-label="陪伴出现的方式">
          {([['window', '窗边陪着'], ['corner', '留在页角'], ['hidden', '暂时收起']] as const).map(([presence, label]) => <button key={presence} type="button" aria-pressed={value.presence === presence} onClick={() => perform(() => update({ presence }))}>{label}</button>)}
        </div>
        <button className="companion-adjust-toggle" type="button" aria-expanded={adjusting} onClick={() => setAdjusting(current => !current)}><SlidersHorizontal size={15} />光线与位置<ChevronDown size={15} /></button>
        {adjusting && <div className="companion-adjustments">
          <div className="light-choices" role="group" aria-label="窗边光线">
            <button type="button" aria-pressed={!isNight && value.light === 'morning'} onClick={() => perform(() => { update({ light: 'morning' }); setAppearance({ theme: 'light' }); })}><img src={WINDOW_LIGHT.morning} alt="" /><span><Sun size={14} />晨光</span></button>
            <button type="button" aria-pressed={!isNight && value.light === 'dusk'} onClick={() => perform(() => { update({ light: 'dusk' }); setAppearance({ theme: 'light' }); })}><img src={WINDOW_LIGHT.dusk} alt="" /><span><Sunset size={14} />暮色</span></button>
            <button type="button" aria-pressed={isNight} onClick={() => perform(() => setAppearance({ theme: 'dark' }))}><img src={WINDOW_LIGHT.night} alt="" /><span><Moon size={14} />夜灯</span></button>
          </div>
          <div className="companion-placement">
            <label>远近<input type="range" aria-label="人物大小" min="0.75" max="1.3" step="0.01" value={placement.scale} onChange={event => setPlacement(current => ({ ...current, scale: Number(event.target.value) }))} onPointerUp={savePlacement} onPointerCancel={savePlacement} onKeyUp={savePlacement} onBlur={savePlacement} /></label>
            <label>位置<input type="range" aria-label="人物位置" min="0" max="100" step="1" value={placement.position} onChange={event => setPlacement(current => ({ ...current, position: Number(event.target.value) }))} onPointerUp={savePlacement} onPointerCancel={savePlacement} onKeyUp={savePlacement} onBlur={savePlacement} /></label>
            <button type="button" className="text-button" onClick={() => perform(() => update({ scale: 1, position: 50 }))}>回到原处</button>
          </div>
        </div>}
      </div>
    </div>
  </section>;
}
