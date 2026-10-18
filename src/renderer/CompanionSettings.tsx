import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Moon, Sun, Sunset, X } from 'lucide-react';
import { COMPANIONS, CompanionScene, WINDOW_LIGHT, useCompanion } from './companion';
import { useAppearance } from './appearance';
import { Switch, uiError } from './ui';

export function CompanionSettings() {
  const { value, update, setPicture, removePicture } = useCompanion();
  const [appearance, setAppearance] = useAppearance();
  const file = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { request.current++; }, []);
  const isNight = appearance.theme === 'dark' || (appearance.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

  function choose(character: typeof value.character) {
    request.current++;
    setOpening(false);
    setError('');
    try { update({ character }); } catch { setError('这次没能留住选择，再试一次。'); }
  }
  async function importPicture(selected: File) {
    const id = ++request.current;
    setOpening(true);
    setError('');
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type))
        throw new Error('选一张 PNG、JPG 或 WebP 图片吧。');
      if (selected.size > 20_000_000) throw new Error('这张图片太大了，换一张 20 MB 以内的试试。');
      const bitmap = await createImageBitmap(selected, { imageOrientation: 'from-image' });
      try {
        const scale = Math.min(1, 1600 / bitmap.width, 1900 / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('这次没能打开图片，再选一次试试。');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', .9);
        if (id === request.current) setPicture(dataUrl, selected.name);
      } finally { bitmap.close(); }
    } catch (problem) {
      if (id === request.current) setError(problem instanceof DOMException && problem.name === 'QuotaExceededError' ? '这台电脑暂时放不下这张图，换一张小一点的试试。' : uiError(problem));
    } finally { if (id === request.current) setOpening(false); }
  }

  return <section className="companion-settings" aria-label="陪伴的样子">
    <div className="companion-options">
      <div className="character-choices" role="group" aria-label="选择喜欢的形象">
        {COMPANIONS.map(character => <button key={character.id} type="button" className="character-choice" aria-pressed={value.character === character.id} onClick={() => choose(character.id)}>
          <span className="character-picture" style={{ backgroundImage: `url(${WINDOW_LIGHT.morning})` }}><img src={character.image} alt="" />{value.character === character.id && <span className="character-chosen"><Check size={13} /></span>}</span>
          <span>{character.name}</span>
        </button>)}
        <button type="button" className="character-choice" aria-pressed={value.character === 'light'} onClick={() => choose('light')}>
          <span className="character-picture character-light" style={{ backgroundImage: `url(${WINDOW_LIGHT.morning})` }}>{value.character === 'light' && <span className="character-chosen"><Check size={13} /></span>}</span>
          <span>只留一束光</span>
        </button>
      </div>
      <div className="custom-character">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="选择人物图片" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) void importPicture(selected); }} />
        <button type="button" className="text-button" disabled={opening} onClick={() => file.current?.click()}><ImagePlus size={17} />{opening ? '正在打开图片…' : '使用喜欢的人物图片'}</button>
        {value.customImage && <div className="custom-character-choice">
          <button type="button" aria-pressed={value.character === 'custom'} onClick={() => choose('custom')}><img src={value.customImage} alt="" /><span>{value.customName || '我的形象'}</span>{value.character === 'custom' && <Check size={14} />}</button>
          <button type="button" className="icon-button" aria-label="移除自选图片" onClick={() => { request.current++; setOpening(false); removePicture(); }}><X size={14} /></button>
        </div>}
        {error && <p className="inline-problem" role="alert">{error}</p>}
      </div>
      <div className="companion-control-section">
        <h3>出现的方式</h3>
        <div className="soft-choices" role="group" aria-label="陪伴出现的方式">
          {([['window', '窗边陪着'], ['corner', '留在页角'], ['hidden', '暂时收起']] as const).map(([presence, label]) => <button key={presence} type="button" aria-pressed={value.presence === presence} onClick={() => update({ presence })}>{label}</button>)}
        </div>
      </div>
      <div className="companion-control-section">
        <h3>窗外的光</h3>
        <div className="light-choices" role="group" aria-label="窗边光线">
          <button type="button" aria-pressed={!isNight && value.light === 'morning'} onClick={() => { update({ light: 'morning' }); setAppearance({ theme: 'light' }); }}><img src={WINDOW_LIGHT.morning} alt="" /><span><Sun size={14} />晨光</span></button>
          <button type="button" aria-pressed={!isNight && value.light === 'dusk'} onClick={() => { update({ light: 'dusk' }); setAppearance({ theme: 'light' }); }}><img src={WINDOW_LIGHT.dusk} alt="" /><span><Sunset size={14} />暮色</span></button>
          <button type="button" aria-pressed={isNight} onClick={() => setAppearance({ theme: 'dark' })}><img src={WINDOW_LIGHT.night} alt="" /><span><Moon size={14} />夜灯</span></button>
        </div>
      </div>
      <Switch label="少一点动态" checked={value.reducedMotion} onChange={reducedMotion => update({ reducedMotion })} />
    </div>
    <div className="companion-preview">
      <CompanionScene preview />
      <div className="companion-placement">
        <label>远近<input type="range" aria-label="人物大小" min="0.75" max="1.3" step="0.01" value={value.scale} onChange={event => update({ scale: Number(event.target.value) })} /></label>
        <label>位置<input type="range" aria-label="人物位置" min="0" max="100" step="1" value={value.position} onChange={event => update({ position: Number(event.target.value) })} /></label>
        <button type="button" className="text-button" onClick={() => update({ scale: 1, position: 50 })}>回到原处</button>
      </div>
    </div>
  </section>;
}
