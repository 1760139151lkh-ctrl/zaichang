import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Check, ChevronDown, Heart, ImagePlus, LoaderCircle, Moon, Plus, SlidersHorizontal, Sun, Sunset, Trash2, Undo2 } from 'lucide-react';
import { companionPreset, selectCompanionPersona, type PersonaState, type PersonaUpdate } from '../shared/persona';
import { characterPortrayal } from '../shared/persona-portrayals';
import type { State } from '../shared/types';
import { samePersonaCore, type PersonaDraft } from './PersonaEditor';
import { COMPANIONS, CompanionScene, WINDOW_LIGHT, companionName, useCompanion, type CompanionPlacement, type CompanionMoment } from './companion';
import { APPEARANCE_PALETTES, useAppearance } from './appearance';
import { companionSceneArtwork, companionSceneLights, companionPaletteLight } from './companion-scenes';
import { Switch, uiError } from './ui';

const categories = ['全部', 'Ave Mujica', 'MyGO!!!!!', '我的收藏'] as const;
export function CompanionSettings({ persona, draft, onState, busy, saving, saveOperation, onEditPersona }: {
  persona: PersonaState;
  draft: MutableRefObject<{ persona?: PersonaDraft }>;
  onState: (state: State) => void;
  busy: boolean;
  saving: boolean;
  saveOperation: (operation: () => Promise<void>) => Promise<void>;
  onEditPersona: () => void;
}) {
  const { value, update, setPicture, removePicture, rename, toggleFavorite, setScenePosition } = useCompanion();
  const [appearance, setAppearance] = useAppearance();
  const file = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('全部');
  const [name, setName] = useState(() => companionName(value));
  const [placement, setPlacement] = useState<CompanionPlacement>({ scale: value.scale, position: value.position, verticalPosition: value.verticalPosition });
  const sliderOrigin = useRef<CompanionPlacement | undefined>(undefined);
  const [adjusting, setAdjusting] = useState(false);
  const [moment, setMoment] = useState<CompanionMoment>('chat');
  const [roleMode, setRoleMode] = useState<'use_character_preset' | 'preserve_role'>('preserve_role');
  const [rolePending, setRolePending] = useState(false);
  const [roleFeedback, setRoleFeedback] = useState<{ text: string; error?: boolean }>();
  const [roleUndo, setRoleUndo] = useState<{ previous: number; saved: number }>();
  const [roleSample, setRoleSample] = useState<'study' | 'chat' | 'play'>('chat');
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => setName(companionName(value)), [value.character, value.names, value.pictures]);
  useEffect(() => setPlacement({ scale: value.scale, position: value.position, verticalPosition: value.verticalPosition }), [value.scale, value.position, value.verticalPosition, value.character]);
  const custom = value.pictures.find(item => item.id === value.character);
  const availableLights = custom ? ['morning', 'dusk', 'night'] as const : companionSceneLights(value.character, moment, appearance.palette);
  const activeScene = companionSceneArtwork(value.character, moment, value.light, appearance.palette);
  const activeLight = custom ? value.light : activeScene?.light || value.light;
  const portrayal = characterPortrayal(value.character);
  const preset = companionPreset(value.character);
  const characterCore = preset?.core;
  const hasPersonaDraft = !!draft.current.persona;
  const roleLocked = rolePending || saving || busy;
  const alreadyLinked = persona.core.visualBinding?.companionId === value.character;
  const alreadyPreset = characterCore && samePersonaCore(persona.core, characterCore);
  const roleUnchanged = roleMode === 'preserve_role' ? alreadyLinked : alreadyPreset;
  const gallery = category === '我的收藏'
    ? [...COMPANIONS.filter(item => value.favorites.includes(item.id)), ...value.pictures]
    : category === '全部' ? [...COMPANIONS, ...value.pictures] : COMPANIONS.filter(item => item.category === category);
  function perform(action: () => void) {
    setError('');
    try { action(); } catch (problem) {
      setError(problem instanceof DOMException && problem.name === 'QuotaExceededError' ? '这台电脑暂时放不下新的选择，原来的图片还在。可以先移走一张不常用的图片。' : uiError(problem));
    }
  }
  function choose(character: typeof value.character) {
    request.current++; setOpening(false);
    perform(() => update({ character }));
    setRoleMode(companionPreset(character) ? 'use_character_preset' : 'preserve_role');
    setRoleFeedback(undefined);
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
  function savePlacement(next: CompanionPlacement = placement) {
    if (next.scale !== value.scale || next.position !== value.position || next.verticalPosition !== value.verticalPosition) {
      try { update(next); setError(''); } catch (problem) { setPlacement({ scale: value.scale, position: value.position, verticalPosition: value.verticalPosition }); setError(uiError(problem)); }
    }
  }
  function cancelSlider() {
    if (sliderOrigin.current) setPlacement(sliderOrigin.current);
    sliderOrigin.current = undefined;
  }
  async function saveRole(input: PersonaUpdate, undo = false) {
    if (roleLocked || draft.current.persona) return;
    const previousRevision = persona.revision;
    setRolePending(true); setRoleFeedback(undefined);
    try {
      await saveOperation(async () => {
        try {
          const next = await window.zaichang.saveSettings({ personaUpdate: input });
          onState(next);
          setRoleUndo(undo ? undefined : { previous: previousRevision, saved: next.settings.persona.revision });
          setRoleFeedback({ text: undo ? '已经回到这次选择前的相处方式。' : `已经留下了${next.settings.persona.core.name || '现在'}的相处方式。` });
        } catch (problem) {
          setRoleFeedback({ text: uiError(problem), error: true });
          try { onState(await window.zaichang.state()); } catch { /* Keep the failed choice reviewable. */ }
        }
      });
    } finally { setRolePending(false); }
  }

  return <section className="companion-settings" aria-label="陪伴的样子">
    <div className="companion-options">
      <div className="companion-categories" role="group" aria-label="形象风格">
        {categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="character-choices" role="group" aria-label="选择喜欢的形象">
        {gallery.map(character => <div className="character-card" key={character.id}>
          <button type="button" className="character-choice" aria-label={'fullName' in character ? character.fullName : character.name} aria-pressed={value.character === character.id} onClick={() => choose(character.id)}>
            <span className={`character-picture ${character.id.startsWith('custom:') ? 'is-custom' : ''}`} style={{ backgroundImage: `url(${WINDOW_LIGHT.morning})`, ...('frame' in character ? { '--portrait-width': character.frame.portrait, '--portrait-top': character.frame.portraitTop, '--art-anchor': character.frame.anchor } : {}) } as CSSProperties}><img src={character.image} alt="" />{value.character === character.id && <span className="character-chosen"><Check size={13} /></span>}</span>
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
    </div>
    <div className="companion-preview">
      <CompanionScene preview moment={moment} placement={placement} interaction={{ onChange: setPlacement, onCommit: savePlacement }} />
      <div className="companion-preview-controls">
        <div className="companion-moment-choices" role="group" aria-label="陪伴的时刻">
          {([['chat', '闲聊'], ['reading', '共读'], ['planning', '看安排'], ['rest', '坐一会儿'], ['play', '整活']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={moment === id} onClick={() => setMoment(id)}>{label}</button>)}
        </div>
        <div className="companion-theme-choices" role="group" aria-label="界面色彩">
          {APPEARANCE_PALETTES.map(palette => <button type="button" key={palette.id} data-palette={palette.id} aria-pressed={appearance.palette === palette.id} onClick={() => perform(() => { setAppearance({ palette: palette.id }); update({ light: companionPaletteLight(palette.id) }); })}><span aria-hidden="true" />{palette.name}</button>)}
        </div>
        <div className="soft-choices" role="group" aria-label="陪伴出现的方式">
          {([['window', '窗边陪着'], ['corner', '留在页角'], ['hidden', '暂时收起']] as const).map(([presence, label]) => <button key={presence} type="button" aria-pressed={value.presence === presence} onClick={() => perform(() => update({ presence }))}>{label}</button>)}
        </div>
        <button className="companion-adjust-toggle" type="button" aria-expanded={adjusting} onClick={() => setAdjusting(current => !current)}><SlidersHorizontal size={15} />光线与位置<ChevronDown size={15} /></button>
        {adjusting && <div className="companion-adjustments">
          <div className="light-choices" role="group" aria-label="窗边光线">
            {([['morning', '晨光', Sun], ['dusk', '暮色', Sunset], ['night', '夜灯', Moon]] as const).filter(([light]) => availableLights.includes(light)).map(([light, label, Icon]) => <button type="button" key={light} aria-pressed={activeLight === light} onClick={() => perform(() => update({ light }))}><img src={companionSceneArtwork(value.character, moment, light, appearance.palette)?.mother || WINDOW_LIGHT[light]} alt="" /><span><Icon size={14} />{label}</span></button>)}
          </div>
          {!custom && activeScene && <button type="button" className="text-button companion-seat-reset" onClick={() => perform(() => setScenePosition(activeScene.positionKey, 0))}>回到原处</button>}
          {custom && <div className="companion-placement">
            <label>远近<input type="range" aria-label="人物大小" min="0.75" max="1.3" step="0.01" value={placement.scale} onChange={event => setPlacement(current => ({ ...current, scale: Number(event.target.value) }))} onPointerDown={() => { sliderOrigin.current = placement; }} onPointerUp={() => { sliderOrigin.current = undefined; savePlacement(); }} onPointerCancel={cancelSlider} onKeyUp={() => savePlacement()} onBlur={() => savePlacement()} /></label>
            <label>左右<input type="range" aria-label="人物位置" min="0" max="100" step="1" value={placement.position} onChange={event => setPlacement(current => ({ ...current, position: Number(event.target.value) }))} onPointerDown={() => { sliderOrigin.current = placement; }} onPointerUp={() => { sliderOrigin.current = undefined; savePlacement(); }} onPointerCancel={cancelSlider} onKeyUp={() => savePlacement()} onBlur={() => savePlacement()} /></label>
            <label>高低<input type="range" aria-label="人物高低" min="0" max="100" step="1" value={placement.verticalPosition} onChange={event => setPlacement(current => ({ ...current, verticalPosition: Number(event.target.value) }))} onPointerDown={() => { sliderOrigin.current = placement; }} onPointerUp={() => { sliderOrigin.current = undefined; savePlacement(); }} onPointerCancel={cancelSlider} onKeyUp={() => savePlacement()} onBlur={() => savePlacement()} /></label>
            <button type="button" className="text-button" onClick={() => perform(() => update({ scale: 1, position: 50, verticalPosition: 100 }))}>回到原处</button>
          </div>}
        </div>}
      </div>
    </div>
    <div className="companion-details">
      <section className="companion-role" aria-label="形象与相处方式">
        <div className="companion-role-heading"><div><p>现在的相处方式 · {persona.core.name || '在场'}</p><h3>{portrayal ? '聊起来，也像她' : '留住熟悉的相处方式'}</h3></div></div>
        <div className="companion-role-choices" role="group" aria-label="选择相处方式">
          {portrayal && <button type="button" aria-pressed={roleMode === 'use_character_preset'} disabled={roleLocked} onClick={() => setRoleMode('use_character_preset')}><span className="companion-role-dot" /><strong>用{companionName(value)}的相处方式</strong><small>{portrayal.summary}</small></button>}
          <button type="button" aria-pressed={roleMode === 'preserve_role'} disabled={roleLocked} onClick={() => setRoleMode('preserve_role')}><span className="companion-role-dot" /><strong>保留我们现在的约定</strong><small>只关联形象，保留你写过的性格。</small></button>
        </div>
        {portrayal && roleMode === 'use_character_preset' && <div className="companion-role-samples" aria-label="相处方式示例">
          <div className="companion-sample-choices" role="group" aria-label="看看不同情境的表达">{portrayal.situatedExamples.map(example => <button key={example.kind} type="button" aria-pressed={roleSample === example.kind} onClick={() => setRoleSample(example.kind)}>{example.label}</button>)}</div>
          {portrayal.situatedExamples.filter(example => example.kind === roleSample).map(example => <div key={example.kind}><p className="companion-example-prompt">“{example.user}”</p><blockquote className="companion-role-example">{example.response}</blockquote></div>)}
        </div>}
        {hasPersonaDraft ? <div className="companion-role-draft" role="status"><p>你还有一份没保存的相处设置，先把它留好再换吧。</p><button type="button" className="text-button" onClick={onEditPersona}>继续编辑草稿</button></div> : <div className="companion-role-actions"><button type="button" className="primary-button" disabled={roleLocked || !!roleUnchanged} onClick={() => void saveRole({ expectedRevision: persona.revision, core: selectCompanionPersona(persona.core, value.character, roleMode) })}>{rolePending && <LoaderCircle size={14} className="spin" />}{roleUnchanged ? '正在这样相处' : roleMode === 'use_character_preset' ? '采用这个角色' : '保留并关联形象'}</button><button type="button" className="text-button" disabled={roleLocked} onClick={onEditPersona}>编辑相处方式</button></div>}
        {roleFeedback && <p className={`inline-status ${roleFeedback.error ? 'error' : ''}`} role={roleFeedback.error ? 'alert' : 'status'}>{roleFeedback.text}</p>}
        {roleUndo && persona.revision === roleUndo.saved && <button type="button" className="text-button companion-role-undo" disabled={roleLocked || hasPersonaDraft} onClick={() => void saveRole({ expectedRevision: persona.revision, undoRevision: roleUndo.previous }, true)}><Undo2 size={13} />撤回这次选择</button>}
      </section>
      <form className="companion-name" onSubmit={event => { event.preventDefault(); perform(() => rename(value.character, name)); }}>
        <label htmlFor="companion-display-name">怎么称呼这个形象</label>
        <div><input id="companion-display-name" value={name} maxLength={60} onChange={event => setName(event.target.value)} /><button type="submit" className="text-button" disabled={name.trim() === companionName(value)} aria-label="记住这个称呼"><Check size={17} /></button></div>
      </form>
      {custom && <button type="button" className="text-button companion-remove" disabled={opening} onClick={() => perform(() => removePicture(custom.id))}><Trash2 size={15} />移走这张图片</button>}
      {error && <p className="inline-problem companion-problem" role="alert">{error}</p>}
      <div className="companion-motion"><Switch label="少一点动态" checked={value.reducedMotion} onChange={reducedMotion => perform(() => update({ reducedMotion }))} /></div>
    </div>
  </section>;
}
