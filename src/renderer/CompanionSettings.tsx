import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MutableRefObject } from 'react';
import { Check, ChevronRight, Heart, ImagePlus, LoaderCircle, Sun, Trash2 } from 'lucide-react';
import type { PersonaState } from '../shared/persona';
import type { State } from '../shared/types';
import type { PersonaDraft } from './PersonaEditor';
import { COMPANIONS, CompanionScene, CompanionPreviewProvider, WINDOW_LIGHT, companionName, companionSceneChoiceKey, companionPresenceArtwork, useCompanion, type CompanionPreference, type CompanionPlacement, type CompanionMoment } from './companion';
import { APPEARANCE_PALETTES, previewAppearance, readEffectiveEnvironment, useAppearance, useEffectiveEnvironment, type AppearanceEnvironmentMode, type AppearancePalette } from './appearance';
import { companionPaletteLight, companionRegisteredSceneArtwork, type SceneTransferChoice, type NeutralSceneTime } from './companion-scenes';
import { Switch, uiError } from './ui';
import { WorkspaceArtworkWarmup } from './WorkspaceScenery';
import './companion-settings.css';

export interface CompanionSettingsDraft {
  preference: CompanionPreference;
  palette: AppearancePalette;
  environmentMode?: AppearanceEnvironmentMode;
  environmentEdited?: boolean;
  positions: Record<string, number>;
  choices: Record<string, string>;
  baseline: string;
  positionEdits: string[];
  choiceEdits: string[];
  /** Older drafts can still be read; the current conversation owns the activity. */
  moment?: CompanionMoment;
}
interface RoomBaseline {
  preference: CompanionPreference;
  palette: AppearancePalette;
  environmentMode: AppearanceEnvironmentMode;
  positions: Record<string, number>;
  choices: Record<string, string>;
}
function roomPreference(value: CompanionPreference): CompanionPreference {
  const { character, presence, light, reducedMotion, scale, position, verticalPosition } = value;
  return { character, presence, light, reducedMotion, scale, position, verticalPosition };
}
function readBaseline(text: string | undefined, fallback: RoomBaseline): RoomBaseline {
  if (!text) return fallback;
  try {
    const value = JSON.parse(text) as RoomBaseline;
    return {
      preference: value.preference ?? fallback.preference,
      palette: value.palette ?? fallback.palette,
      environmentMode: value.environmentMode ?? fallback.environmentMode,
      positions: value.positions ?? fallback.positions,
      choices: value.choices ?? {},
    };
  } catch { return fallback; }
}

export function CompanionSettings({ draft, moment = 'chat', roomMode = false, initialEntry, entryRevision = 0, onEditPersona }: {
  persona: PersonaState;
  draft: MutableRefObject<{ persona?: PersonaDraft; companion?: CompanionSettingsDraft }>;
  onState: (state: State) => void;
  busy: boolean;
  saving: boolean;
  saveOperation: (operation: () => Promise<void>) => Promise<void>;
  onEditPersona: () => void;
  moment?: CompanionMoment;
  roomMode?: boolean;
  initialEntry?: 'partner' | 'light';
  entryRevision?: number;
}) {
  const { value: savedValue, update, setPicture, removePicture, toggleFavorite } = useCompanion();
  const [appearance, setAppearance] = useAppearance();
  const environment = useEffectiveEnvironment();
  const retained = useRef(draft.current.companion);
  const [preview, setPreview] = useState(() => retained.current?.preference ?? roomPreference(savedValue));
  const [palette, setPalette] = useState(() => retained.current?.palette ?? readEffectiveEnvironment().palette);
  const [environmentMode, setEnvironmentMode] = useState<AppearanceEnvironmentMode>(() =>
    retained.current?.environmentMode ?? (retained.current && retained.current.palette !== appearance.palette ? 'manual' : appearance.environmentMode));
  const [environmentEdited, setEnvironmentEdited] = useState(() =>
    retained.current?.environmentEdited ?? (!!retained.current && retained.current.palette !== appearance.palette));
  const [positions, setPositions] = useState(() => ({ ...(retained.current?.positions ?? savedValue.scenePositions) }));
  const [choices, setChoices] = useState(() => ({ ...(retained.current?.choices ?? savedValue.sceneChoices) }));
  const positionEdits = useRef(new Set(retained.current?.positionEdits));
  const choiceEdits = useRef(new Set(retained.current?.choiceEdits));
  const currentBaseline: RoomBaseline = {
    preference: roomPreference(savedValue), palette: appearance.palette, environmentMode: appearance.environmentMode,
    positions: savedValue.scenePositions, choices: savedValue.sceneChoices,
  };
  const savedStamp = JSON.stringify(currentBaseline);
  const [baseline, setBaseline] = useState(() => JSON.stringify(readBaseline(retained.current?.baseline, currentBaseline)));
  const origin = readBaseline(baseline, currentBaseline);
  const previewStamp = JSON.stringify({
    preference: preview,
    palette: environmentEdited && environmentMode === 'manual' ? palette : origin.palette,
    environmentMode: environmentEdited ? environmentMode : origin.environmentMode,
    positions, choices,
  });
  const roomDirty = previewStamp !== savedStamp;
  const roomStale = savedStamp !== baseline && previewStamp !== baseline && previewStamp !== savedStamp;
  const [adopting, setAdopting] = useState(false);
  const endEnvironmentPreview = useRef<(() => void) | undefined>(undefined);
  const renderedPalette = environmentEdited && environmentMode === 'manual' ? palette : environment.palette;
  const renderedPreference = { ...preview, light: companionPaletteLight(renderedPalette) };
  const value = { ...savedValue, ...renderedPreference, scenePositions: positions, sceneChoices: choices };
  const placement = { scale: preview.scale, position: preview.position, verticalPosition: preview.verticalPosition };
  const file = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [opening, setOpening] = useState(false);
  const [preparingCharacter, setPreparingCharacter] = useState<string>();
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<'partner' | 'light' | undefined>(roomMode ? initialEntry : undefined);
  useEffect(() => { if (roomMode) setExpanded(initialEntry); }, [roomMode, initialEntry, entryRevision]);
  const partnerButton = useRef<HTMLButtonElement>(null);
  const lightButton = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const lightChoices = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const sliderOrigin = useRef<CompanionPlacement | undefined>(undefined);
  const custom = value.pictures.find(item => item.id === value.character);
  const roomOnly = value.character === 'light';
  const mode = environmentEdited ? environmentMode : appearance.environmentMode;
  const variant = mode === 'auto' ? environment.requestedVariant : undefined;
  const neutralTime = variant === 'unknown' ? environment.isDay ? 'day' : 'night' : undefined;
  const sceneScope = companionSceneChoiceKey(value.character, moment, renderedPalette);
  const selectedScene = choices[sceneScope];
  const activeScene = (selectedScene ? companionRegisteredSceneArtwork(selectedScene, value.character, value.light, renderedPalette, variant, neutralTime) : undefined)
    ?? companionPresenceArtwork(value.character, moment, value.light, renderedPalette, variant, neutralTime);
  const identityPortrait = COMPANIONS.find(item => item.id === value.character);
  const portrait = custom?.image ?? identityPortrait?.image;
  // An avatar alone must not be presented as a complete room preview.
  const roomCanAdopt = roomOnly || value.presence === 'hidden' || !!custom
    || value.presence === 'corner' && !!portrait || value.presence === 'window' && !!activeScene;
  const gallery = [...COMPANIONS, ...value.pictures].sort((a, b) =>
    Number(value.favorites.includes(b.id)) - Number(value.favorites.includes(a.id)));
  const lightName = mode === 'auto' ? '随窗外' : APPEARANCE_PALETTES.find(item => item.id === renderedPalette)?.name;

  useEffect(() => () => { request.current++; }, []);
  useLayoutEffect(() => {
    if (!environmentEdited) return;
    const end = previewAppearance(environmentMode === 'auto' ? { environmentMode: 'auto' } : { palette, environmentMode: 'manual' });
    endEnvironmentPreview.current = end;
    return () => { end(); if (endEnvironmentPreview.current === end) endEnvironmentPreview.current = undefined; };
  }, [environmentEdited, environmentMode, palette]);
  useEffect(() => {
    if (roomDirty) draft.current.companion = {
      preference: preview, palette, environmentMode, environmentEdited, positions, choices, baseline,
      positionEdits: [...positionEdits.current], choiceEdits: [...choiceEdits.current],
    };
    else delete draft.current.companion;
  }, [draft, roomDirty, preview, palette, environmentMode, environmentEdited, positions, choices, baseline]);
  useLayoutEffect(() => {
    if (!adopting && (savedStamp === baseline || (previewStamp !== baseline && previewStamp !== savedStamp))) return;
    positionEdits.current.clear();
    choiceEdits.current.clear();
    setPreview(roomPreference(savedValue));
    setPalette(readEffectiveEnvironment().palette);
    setEnvironmentMode(appearance.environmentMode);
    setEnvironmentEdited(false);
    setPositions({ ...savedValue.scenePositions });
    setChoices({ ...savedValue.sceneChoices });
    setBaseline(savedStamp);
    setAdopting(false);
  }, [savedStamp, baseline, previewStamp, adopting]);

  function perform(action: () => void) {
    setError('');
    try { action(); } catch (problem) {
      setError(problem instanceof DOMException && problem.name === 'QuotaExceededError'
        ? '这台电脑暂时放不下新的选择，原来的图片还在。可以先移走一张不常用的图片。' : uiError(problem));
    }
  }
  function togglePanel(panel: 'partner' | 'light') {
    const next = expanded === panel ? undefined : panel;
    setExpanded(next);
    if (next) requestAnimationFrame(() => {
      const container = next === 'partner' ? picker.current : lightChoices.current;
      container?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    });
  }
  function choose(character: typeof value.character) {
    const id = ++request.current; setOpening(false); setPreparingCharacter(undefined); setError('');
    let nextPalette = renderedPalette, nextVariant = variant;
    let nextNeutral: NeutralSceneTime | undefined = neutralTime;
    let useManualPalette = false;
    if (roomMode && preview.presence === 'window' && character !== 'light' && !character.startsWith('custom:')
      && !companionPresenceArtwork(character, moment, companionPaletteLight(renderedPalette), renderedPalette, variant, neutralTime)) {
      const available = APPEARANCE_PALETTES.find(option => companionPresenceArtwork(character, moment, companionPaletteLight(option.id), option.id));
      if (available) {
        nextPalette = available.id; nextVariant = undefined; nextNeutral = undefined; useManualPalette = true;
      }
    }
    const apply = () => {
      if (id !== request.current) return;
      setPreview(current => ({ ...current, character }));
      if (useManualPalette) {
        setEnvironmentMode('manual'); setPalette(nextPalette);
        setEnvironmentEdited(origin.environmentMode !== 'manual' || nextPalette !== origin.palette);
      }
      if (!roomMode) { setExpanded(undefined); requestAnimationFrame(() => partnerButton.current?.focus()); }
    };
    const chosenId = choices[companionSceneChoiceKey(character, moment, nextPalette)];
    const scene = (chosenId ? companionRegisteredSceneArtwork(chosenId, character, companionPaletteLight(nextPalette), nextPalette, nextVariant, nextNeutral) : undefined)
      ?? companionPresenceArtwork(character, moment, companionPaletteLight(nextPalette), nextPalette, nextVariant, nextNeutral);
    if (!roomMode || preview.presence !== 'window' || !scene) { apply(); return; }
    setPreparingCharacter(character);
    // Keep the visible person until this exact next pose can paint together;
    // another choice or Cancel retires a late load.
    const urls = [...new Set([scene.mother, scene.background, scene.figure, scene.mask, scene.contactMask, scene.shadow].filter((url): url is string => !!url))];
    void Promise.all(urls.map(async url => { const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth !== scene.width || image.naturalHeight !== scene.height) throw new Error('incompatible_scene_canvas');
    })).then(apply).catch(() => { if (id === request.current) setError('这个样子暂时没能打开，原来的选择还在。可以再选一次。'); })
      .finally(() => { if (id === request.current) setPreparingCharacter(undefined); });
  }
  function chooseEnvironment(nextMode: AppearanceEnvironmentMode, nextPalette = palette) {
    request.current++; setOpening(false); setPreparingCharacter(undefined);
    setEnvironmentMode(nextMode);
    setPalette(nextPalette);
    setEnvironmentEdited(nextMode !== origin.environmentMode || nextMode === 'manual' && nextPalette !== origin.palette);
    if (!roomMode) { setExpanded(undefined); requestAnimationFrame(() => lightButton.current?.focus()); }
  }
  function setPlacement(next: CompanionPlacement | ((current: CompanionPlacement) => CompanionPlacement)) {
    setPreview(current => ({ ...current, ...(typeof next === 'function' ? next(current) : next) }));
  }
  function cancelPreview() {
    request.current++; setOpening(false); setPreparingCharacter(undefined);
    endEnvironmentPreview.current?.();
    endEnvironmentPreview.current = undefined;
    delete draft.current.companion;
    positionEdits.current.clear(); choiceEdits.current.clear();
    setPreview(roomPreference(savedValue));
    setPalette(readEffectiveEnvironment().palette);
    setEnvironmentMode(appearance.environmentMode);
    setEnvironmentEdited(false);
    setPositions({ ...savedValue.scenePositions }); setChoices({ ...savedValue.sceneChoices });
    setBaseline(savedStamp); setError(''); setExpanded(undefined);
  }
  function previewPosition(key: string, position: number) {
    const changed = position !== (origin.positions[key] ?? 0);
    if (changed) positionEdits.current.add(key); else positionEdits.current.delete(key);
    setPositions(current => {
      const next = { ...current };
      if (!changed && origin.positions[key] === undefined) delete next[key]; else next[key] = position;
      return next;
    });
  }
  function keepPreviewAfterConflict() {
    const edited = Object.fromEntries([...positionEdits.current].map(key => [key, positions[key]]));
    const editedChoices = Object.fromEntries([...choiceEdits.current].map(key => [key, choices[key]]));
    setPositions({ ...savedValue.scenePositions, ...edited }); setChoices({ ...savedValue.sceneChoices, ...editedChoices });
    if (!environmentEdited) { setEnvironmentMode(appearance.environmentMode); setPalette(environment.palette); }
    setBaseline(savedStamp);
  }
  function previewSceneChoice(scope: string, choice: SceneTransferChoice) {
    if (choice.sceneId !== origin.choices[scope]) choiceEdits.current.add(scope); else choiceEdits.current.delete(scope);
    setChoices(current => ({ ...current, [scope]: choice.sceneId }));
    previewPosition(choice.positionKey, choice.position);
  }
  function adoptPreview() {
    if (opening || roomStale || !roomCanAdopt || adopting) return;
    perform(() => {
      const expectedEnvironment = { palette: origin.palette, environmentMode: origin.environmentMode };
      const nextEnvironment = { palette: environmentMode === 'manual' ? palette : origin.palette, environmentMode };
      if (environmentEdited) setAppearance(environmentMode === 'auto' ? { environmentMode: 'auto' } : nextEnvironment, expectedEnvironment);
      const edited = Object.fromEntries([...positionEdits.current].map(key => [key, positions[key]]));
      const editedChoices = Object.fromEntries([...choiceEdits.current].map(key => [key, choices[key]]));
      try { update(preview, edited, origin, editedChoices); setAdopting(true); setExpanded(undefined); }
      catch (problem) {
        if (environmentEdited) {
          try { setAppearance(expectedEnvironment, nextEnvironment); }
          catch { throw new Error('这次没能完整留下选择。你试看的样子还在，先看看当前的选择吧。'); }
        }
        throw problem;
      }
    });
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
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('这次没能打开图片，再选一次试试。');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', .86);
        if (id === request.current) choose(setPicture(dataUrl, selected.name.replace(/\.[^.]+$/, ''), false));
      } finally { bitmap.close(); }
    } catch (problem) {
      if (id === request.current) setError(problem instanceof DOMException && problem.name === 'QuotaExceededError'
        ? '这台电脑暂时放不下这张图，原来的图片还在。换一张小些的试试。' : uiError(problem));
    } finally { if (id === request.current) setOpening(false); }
  }
  function cancelSlider() {
    if (sliderOrigin.current) setPlacement(sliderOrigin.current);
    sliderOrigin.current = undefined;
  }
  function adjustPlacementKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && sliderOrigin.current) {
      event.preventDefault(); event.stopPropagation(); cancelSlider();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) sliderOrigin.current ??= placement;
  }
  function closePanel(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented || !expanded) return;
    event.preventDefault(); event.stopPropagation();
    const button = expanded === 'partner' ? partnerButton : lightButton;
    setExpanded(undefined); button.current?.focus();
  }

  return <section className={`companion-settings${roomMode ? ' companion-settings-room' : ''}`} aria-label="陪伴的样子" onKeyDown={closePanel}>
    <WorkspaceArtworkWarmup character={value.character} sceneChoices={value.sceneChoices} />
    <div className="companion-settings-rows">
      <div className="companion-setting-row">
        <button ref={partnerButton} type="button" className="companion-setting-trigger" aria-label={'伙伴，' + companionName(value)} aria-expanded={expanded === 'partner'} aria-controls={panelId + '-partner'} onClick={() => togglePanel('partner')}>
          <span className="companion-setting-label">伙伴</span>
          <span className="companion-current-partner">{portrait ? <span className="companion-current-face"><img src={portrait} alt="" style={custom ? undefined : identityPortrait?.avatar} /></span> : <Sun size={25} />}<span>{companionName(value)}</span></span>
          <ChevronRight size={17} className={expanded === 'partner' ? 'is-open' : ''} />
        </button>
        {expanded === 'partner' && <div ref={picker} id={panelId + '-partner'} className="companion-partner-picker">
          <div className="character-choices" role="group" aria-label="选择伙伴">
            {gallery.map(character => <button type="button" key={character.id} className="character-choice" aria-label={'fullName' in character ? value.names[character.id] ? companionName(value, character.id) + '，' + character.fullName : character.fullName : companionName(value, character.id)} aria-pressed={value.character === character.id} aria-busy={preparingCharacter === character.id || undefined} onClick={() => choose(character.id)}>
              <span className={'character-picture ' + (character.id.startsWith('custom:') ? 'is-custom' : '')} style={{ backgroundImage: 'url(' + WINDOW_LIGHT[environment.light] + ')', ...('frame' in character ? { '--portrait-width': character.frame.portrait, '--portrait-top': character.frame.portraitTop, '--art-anchor': character.frame.anchor } : {}) } as CSSProperties}><img src={character.image} alt="" />{value.character === character.id && <span className="character-chosen"><Check size={12} /></span>}{value.favorites.includes(character.id) && <Heart size={12} className="companion-kept-mark" fill="currentColor" />}</span>
              <span>{companionName(value, character.id)}{preparingCharacter === character.id && <LoaderCircle size={16} className="spin" />}</span>
            </button>)}
          </div>
          <div className="companion-picker-actions">
            <button type="button" className="text-button" disabled={opening} onClick={() => file.current?.click()}><ImagePlus size={15} />{opening ? '正在打开…' : '用自己的图片'}</button>
            <button type="button" className="text-button" aria-pressed={roomOnly} onClick={() => choose('light')}><Sun size={15} />只留一束光</button>
          </div>
          <details className="companion-picker-more">
            <summary>其他选择</summary>
            <div className="companion-picker-more-content">
              {!custom && !roomOnly && <button type="button" className="text-button" aria-pressed={value.favorites.includes(value.character)} onClick={() => perform(() => toggleFavorite(value.character))}><Heart size={14} fill={value.favorites.includes(value.character) ? 'currentColor' : 'none'} />{value.favorites.includes(value.character) ? '不再收藏' : '收藏这个形象'}</button>}
              <label className="companion-presence-choice">出现的方式<select aria-label="伙伴出现的方式" value={value.presence} onChange={event => setPreview(current => ({ ...current, presence: event.target.value as CompanionPreference['presence'] }))}><option value="window">窗边陪着</option><option value="corner">留在页角</option><option value="hidden">暂时收起</option></select></label>
              <Switch label="少一点动态" checked={preview.reducedMotion} onChange={reducedMotion => setPreview(current => ({ ...current, reducedMotion }))} />
              {custom && <details className="companion-custom-adjust"><summary>调整图片</summary><div className="companion-placement">
                {([['scale', '远近', .75, 1.3, .01], ['position', '左右', 0, 100, 1], ['verticalPosition', '高低', 0, 100, 1]] as const).map(([key, label, min, max, step]) => <label key={key}>{label}<input type="range" aria-label={'图片' + label} min={min} max={max} step={step} value={placement[key]} onChange={event => setPlacement(current => ({ ...current, [key]: Number(event.target.value) }))} onPointerDown={() => { sliderOrigin.current = placement; }} onPointerUp={() => { sliderOrigin.current = undefined; }} onPointerCancel={cancelSlider} onKeyDown={adjustPlacementKey} onKeyUp={event => { if (event.key !== 'Escape') sliderOrigin.current = undefined; }} onBlur={() => { sliderOrigin.current = undefined; }} /></label>)}
                <button type="button" className="text-button" onClick={() => setPlacement({ scale: 1, position: 50, verticalPosition: 100 })}>回到原处</button>
              </div></details>}
              {custom && <button type="button" className="text-button companion-remove" disabled={opening} onClick={() => perform(() => { removePicture(custom.id); setPreview(current => ({ ...current, character: 'light' })); })}><Trash2 size={14} />移走这张图片</button>}
            </div>
          </details>
        </div>}
      </div>
      <div className="companion-setting-row">
        <button ref={lightButton} type="button" className="companion-setting-trigger" aria-label={'光线，' + lightName} aria-expanded={expanded === 'light'} aria-controls={panelId + '-light'} onClick={() => togglePanel('light')}>
          <span className="companion-setting-label">光线</span><span className="companion-setting-value">{lightName}</span><ChevronRight size={17} className={expanded === 'light' ? 'is-open' : ''} />
        </button>
        {expanded === 'light' && <div ref={lightChoices} id={panelId + '-light'} className="companion-environment-picker" role="group" aria-label="选择窗边光线">
          <button type="button" className="companion-environment-option is-auto" aria-pressed={mode === 'auto'} onClick={() => chooseEnvironment('auto')}><span>随窗外</span>{mode === 'auto' && <Check size={15} />}</button>
          {APPEARANCE_PALETTES.map(choice => <button type="button" key={choice.id} className="companion-environment-option" data-palette={choice.id} aria-pressed={mode === 'manual' && renderedPalette === choice.id} onClick={() => chooseEnvironment('manual', choice.id)}><span className="companion-environment-swatch" aria-hidden="true" /><span>{choice.name}</span>{mode === 'manual' && renderedPalette === choice.id && <Check size={15} />}</button>)}
        </div>}
      </div>
      {roomStale && <div className="companion-preview-conflict" role="alert"><p>这里的选择刚在另一处改过。你试看的样子还留着。</p><button type="button" className="text-button" onClick={cancelPreview}>看看新选择</button><button type="button" className="text-button" onClick={keepPreviewAfterConflict}>保留这份试看</button></div>}
      {error && <p className="inline-problem companion-problem" role="alert">{error}</p>}
      {roomDirty && !roomCanAdopt && <p className="companion-scene-unavailable" role="status">这处窗边暂时没有合适的画面。<button type="button" className="text-button" onClick={() => setPreview(current => ({ ...current, presence: 'corner' }))}>留在页角</button></p>}
      {(roomDirty || opening || preparingCharacter) && <div className="companion-preview-actions"><button type="button" className="text-button" onClick={cancelPreview}>取消</button><button type="button" className="primary-button" disabled={opening || !!preparingCharacter || roomStale || !roomCanAdopt || adopting} onClick={adoptPreview}>采用</button></div>}
      {roomMode && <button type="button" className="text-button companion-edit-persona" onClick={onEditPersona}>相处方式<ChevronRight size={17} /></button>}
    </div>
    <div className="companion-preview">
      <CompanionPreviewProvider preference={renderedPreference} positions={positions} choices={choices} onPositionChange={previewPosition} onSceneChoiceChange={previewSceneChoice}>
        <CompanionScene preview moment={moment} placement={placement} interaction={{ onChange: setPlacement, onCommit: setPlacement }} />
      </CompanionPreviewProvider>
    </div>
    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="选择人物图片" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) void importPicture(selected); }} />
  </section>;
}
