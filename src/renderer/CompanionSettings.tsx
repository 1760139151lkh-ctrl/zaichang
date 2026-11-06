import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MutableRefObject } from 'react';
import { flushSync } from 'react-dom';
import { Check, ChevronRight, Ellipsis, Heart, ImagePlus, LoaderCircle, Sun, Trash2, X } from 'lucide-react';
import { companionPreset, isUntouchedPresetPersona, selectCompanionPersona, type PersonaState } from '../shared/persona';
import type { State } from '../shared/types';
import type { PersonaDraft } from './PersonaEditor';
import { COMPANIONS, CompanionScene, CompanionPreviewProvider, WINDOW_LIGHT, companionName, companionSceneChoiceKey, companionPresenceArtwork, prepareCompanionPortraits, useCompanion, type CompanionPreference, type CompanionPlacement, type CompanionMoment, type CompanionRoomLayout } from './companion';
import { APPEARANCE_PALETTES, previewAppearance, readEffectiveEnvironment, resolveAppearanceChoice, useAppearance, useEffectiveEnvironment, type AppearanceEnvironmentMode, type AppearancePalette } from './appearance';
import { companionPaletteLight, companionRegisteredSceneArtwork, type CompanionSceneArtwork, type SceneTransferChoice, type NeutralSceneTime } from './companion-scenes';
import { Switch, uiError } from './ui';
import { WorkspaceArtworkWarmup } from './WorkspaceScenery';
import { AppearanceIcon } from './AppearanceIcon';
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

export function CompanionSettings({ persona, draft, onState, busy, saving, saveOperation, moment = 'chat', roomMode = false, initialEntry, entryRevision = 0, onEditPersona }: {
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
  const [syncPersonaVoice, setSyncPersonaVoice] = useState(false);
  const targetPartnerPreset = companionPreset(preview.character);
  const canSyncPersonaVoice = roomDirty && !isUntouchedPresetPersona(persona) && !!targetPartnerPreset && persona.core.presetId !== preview.character;
  const endEnvironmentPreview = useRef<(() => void) | undefined>(undefined);
  const renderedPalette = environmentEdited && environmentMode === 'manual' ? palette : environment.palette;
  const renderedPreference = { ...preview, light: companionPaletteLight(renderedPalette) };
  const value = { ...savedValue, ...renderedPreference, scenePositions: positions, sceneChoices: choices };
  const placement = { scale: preview.scale, position: preview.position, verticalPosition: preview.verticalPosition };
  const file = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [opening, setOpening] = useState(false);
  const [preparingCharacter, setPreparingCharacter] = useState<string>();
  const [preparingPalette, setPreparingPalette] = useState<'auto' | AppearancePalette>();
  const roomPreview = useRef<HTMLDivElement>(null);
  const [roomLayout, setRoomLayout] = useState<CompanionRoomLayout | null>(null);
  const paintTransition = useRef<ReturnType<Document['startViewTransition']> | undefined>(undefined);
  const [error, setError] = useState('');
  const [portraitsReady, setPortraitsReady] = useState(false);
  useEffect(() => {
    let live = true;
    void prepareCompanionPortraits().then(() => { if (live) setPortraitsReady(true); })
      .catch(() => { if (live) { setError('头像没能打开。关上后再试一次。'); setPortraitsReady(true); } });
    return () => { live = false; };
  }, []);
  const [expanded, setExpanded] = useState<'partner' | 'light' | undefined>(roomMode ? initialEntry : undefined);
  const lastSelection = useRef<'partner' | 'light'>(initialEntry ?? 'partner');
  useEffect(() => {
    if (!roomMode || !portraitsReady) return;
    setExpanded(initialEntry); lastSelection.current = initialEntry ?? 'partner'; focusSelection(true);
  }, [roomMode, initialEntry, entryRevision, portraitsReady]);
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
  const controlsSide = activeScene && (activeScene.bodyBounds[0] + activeScene.bodyBounds[2]) / 2 < .55 ? 'right' : 'left';
  const actor = roomLayout?.actorClientRect;
  const roomWidth = roomLayout?.viewportClientRect.width ?? 0;
  const pickerSpace = actor && roomLayout ? controlsSide === 'right'
    ? roomWidth * .96 - (actor.left + actor.width - roomLayout.viewportClientRect.left) - 24
    : actor.left - roomLayout.viewportClientRect.left - roomWidth * .04 - 24 : undefined;
  const identityPortrait = COMPANIONS.find(item => item.id === value.character);
  const portrait = custom?.image ?? identityPortrait?.image;
  // An avatar alone must not be presented as a complete room preview.
  const roomCanAdopt = roomOnly || value.presence === 'hidden' || !!custom
    || value.presence === 'corner' && !!portrait || value.presence === 'window' && !!activeScene;
  const gallery = [...COMPANIONS, ...value.pictures].sort((a, b) =>
    Number(value.favorites.includes(b.id)) - Number(value.favorites.includes(a.id)));
  const lightName = mode === 'auto' ? '随窗外' : APPEARANCE_PALETTES.find(item => item.id === renderedPalette)?.name;

  useEffect(() => () => { request.current++; paintTransition.current?.skipTransition(); }, []);
  useEffect(() => { if (preview.reducedMotion) paintTransition.current?.skipTransition(); }, [preview.reducedMotion]);
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
  function focusSelection(force = false) {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!force && active !== document.body && active?.isConnected && !active.closest('.companion-preview-actions')) return;
      const group = lastSelection.current === 'light' ? lightChoices.current : picker.current;
      group?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
    });
  }
  async function prepareScene(scene: CompanionSceneArtwork) {
    const urls = [...new Set([scene.mother, scene.background, scene.figure, scene.mask, scene.contactMask, scene.shadow].filter((url): url is string => !!url))];
    await Promise.all(urls.map(async url => {
      const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth !== scene.width || image.naturalHeight !== scene.height) throw new Error('incompatible_scene_canvas');
    }));
  }
  function presentRoom(action: () => void, id: number): Promise<void> {
    if (id !== request.current) return Promise.resolve();
    const scope = roomPreview.current as (HTMLDivElement & { startViewTransition?: Document['startViewTransition'] }) | null;
    if (!roomMode || !scope?.startViewTransition || preview.reducedMotion || document.hidden
      || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paintTransition.current?.skipTransition();
      if (id === request.current) action();
      return Promise.resolve();
    }
    const painted = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    // The incoming view is live. Retarget it during a rapid selection instead of
    // snapping the previous dissolve to its end before the next choice can paint.
    if (paintTransition.current) { flushSync(action); return painted(); }
    // Scope the dissolve to the painting: controls and the current draft stay interactive.
    const transition = scope.startViewTransition(async () => {
      if (id !== request.current || !scope.isConnected) return;
      flushSync(action);
      await painted();
    });
    paintTransition.current = transition;
    void transition.ready.catch(() => {});
    void transition.finished.catch(() => {}).finally(() => {
      if (paintTransition.current === transition) paintTransition.current = undefined;
    });
    return transition.updateCallbackDone.catch(() => {});
  }
  function choose(character: typeof value.character) {
    lastSelection.current = 'partner';
    const id = ++request.current; setOpening(false); setPreparingCharacter(undefined); setPreparingPalette(undefined); setError('');
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
      setSyncPersonaVoice(false);
      if (useManualPalette) {
        setEnvironmentMode('manual'); setPalette(nextPalette);
        setEnvironmentEdited(origin.environmentMode !== 'manual' || nextPalette !== origin.palette);
      }
      if (!roomMode) { setExpanded(undefined); requestAnimationFrame(() => partnerButton.current?.focus()); }
    };
    const chosenId = choices[companionSceneChoiceKey(character, moment, nextPalette)];
    const scene = (chosenId ? companionRegisteredSceneArtwork(chosenId, character, companionPaletteLight(nextPalette), nextPalette, nextVariant, nextNeutral) : undefined)
      ?? companionPresenceArtwork(character, moment, companionPaletteLight(nextPalette), nextPalette, nextVariant, nextNeutral);
    if (!roomMode || preview.presence !== 'window' || !scene) { void presentRoom(apply, id); return; }
    setPreparingCharacter(character);
    // Keep the visible person until this exact next pose can paint together;
    // another choice or Cancel retires a late load.
    void prepareScene(scene).then(() => presentRoom(apply, id)).catch(() => { if (id === request.current) setError('这个样子暂时没能打开，原来的选择还在。可以再选一次。'); })
      .finally(() => { if (id === request.current) setPreparingCharacter(undefined); });
  }
  function chooseEnvironment(nextMode: AppearanceEnvironmentMode, nextPalette = palette) {
    lastSelection.current = 'light';
    const id = ++request.current;
    setOpening(false); setPreparingCharacter(undefined); setPreparingPalette(undefined); setError('');
    const apply = () => {
      setEnvironmentMode(nextMode);
      setPalette(nextPalette);
      setEnvironmentEdited(nextMode !== origin.environmentMode || nextMode === 'manual' && nextPalette !== origin.palette);
      if (!roomMode) { setExpanded(undefined); requestAnimationFrame(() => lightButton.current?.focus()); }
    };
    const next = resolveAppearanceChoice(nextMode === 'auto' ? { environmentMode: 'auto' } : { environmentMode: 'manual', palette: nextPalette });
    const nextVariant = nextMode === 'auto' ? next.requestedVariant : undefined;
    const nextNeutral = nextVariant === 'unknown' ? next.isDay ? 'day' : 'night' : undefined;
    const choice = choices[companionSceneChoiceKey(preview.character, moment, next.palette)];
    const scene = (choice ? companionRegisteredSceneArtwork(choice, preview.character, next.light, next.palette, nextVariant, nextNeutral) : undefined)
      ?? companionPresenceArtwork(preview.character, moment, next.light, next.palette, nextVariant, nextNeutral);
    if (!roomMode || preview.presence !== 'window' || !scene) { void presentRoom(apply, id); return; }
    setPreparingPalette(nextMode === 'auto' ? 'auto' : nextPalette);
    void prepareScene(scene).then(() => presentRoom(apply, id)).catch(() => {
      if (id === request.current) setError('这个样子暂时没能打开，原来的选择还在。可以再选一次。');
    }).finally(() => { if (id === request.current) setPreparingPalette(undefined); });
  }
  function setPlacement(next: CompanionPlacement | ((current: CompanionPlacement) => CompanionPlacement)) {
    setPreview(current => ({ ...current, ...(typeof next === 'function' ? next(current) : next) }));
  }
  function cancelPreview() {
    const id = ++request.current;
    setOpening(false); setPreparingCharacter(undefined); setPreparingPalette(undefined);
    void presentRoom(() => {
    endEnvironmentPreview.current?.();
    endEnvironmentPreview.current = undefined;
    delete draft.current.companion;
    positionEdits.current.clear(); choiceEdits.current.clear();
    setPreview(roomPreference(savedValue));
    setPalette(readEffectiveEnvironment().palette);
    setEnvironmentMode(appearance.environmentMode);
    setEnvironmentEdited(false);
    setPositions({ ...savedValue.scenePositions }); setChoices({ ...savedValue.sceneChoices });
    setBaseline(savedStamp); setError(''); setExpanded(undefined); setSyncPersonaVoice(false);
    focusSelection();
    }, id);
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
    if (opening || preparingCharacter || preparingPalette || roomStale || !roomCanAdopt || adopting) return;
    const shouldSyncVoice = canSyncPersonaVoice && syncPersonaVoice && !busy && !saving;
    const targetCharacter = preview.character;
    perform(() => {
      const expectedEnvironment = { palette: origin.palette, environmentMode: origin.environmentMode };
      const nextEnvironment = { palette: environmentMode === 'manual' ? palette : origin.palette, environmentMode };
      if (environmentEdited) setAppearance(environmentMode === 'auto' ? { environmentMode: 'auto' } : nextEnvironment, expectedEnvironment);
      const edited = Object.fromEntries([...positionEdits.current].map(key => [key, positions[key]]));
      const editedChoices = Object.fromEntries([...choiceEdits.current].map(key => [key, choices[key]]));
      try { update(preview, edited, origin, editedChoices); setAdopting(true); setExpanded(undefined); setSyncPersonaVoice(false); focusSelection(); }
      catch (problem) {
        if (environmentEdited) {
          try { setAppearance(expectedEnvironment, nextEnvironment); }
          catch { throw new Error('这次没能完整留下选择。你试看的样子还在，先看看当前的选择吧。'); }
        }
        throw problem;
      }
      if (shouldSyncVoice) {
        void saveOperation(async () => {
          const next = await window.zaichang.saveSettings({
            personaUpdate: {
              expectedRevision: persona.revision,
              core: selectCompanionPersona(persona.core, targetCharacter, 'use_character_preset'),
            },
          });
          onState(next);
        }).catch(problem => setError(uiError(problem)));
      }
    });
  }
  async function importPicture(selected: File) {
    const id = ++request.current;
    setOpening(true); setPreparingPalette(undefined); setError('');
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
    if (roomMode || event.key !== 'Escape' || event.defaultPrevented || !expanded) return;
    event.preventDefault(); event.stopPropagation();
    const button = expanded === 'partner' ? partnerButton : lightButton;
    setExpanded(undefined); button.current?.focus();
  }

  const environmentPicker = <div ref={lightChoices} id={panelId + '-light'} className="companion-environment-picker" role="group" aria-label="选择窗边光线">
    <button type="button" className="companion-environment-option is-auto" title="随窗外" aria-pressed={mode === 'auto'} aria-busy={preparingPalette === 'auto' || undefined} onClick={() => chooseEnvironment('auto')}>{roomMode && (preparingPalette === 'auto' ? <LoaderCircle size={24} className="spin" /> : <AppearanceIcon palette={renderedPalette} automatic size={27} />)}<span className={roomMode ? 'sr-only' : undefined}>随窗外</span>{!roomMode && mode === 'auto' && <Check size={15} />}</button>
    {APPEARANCE_PALETTES.map(choice => <button type="button" key={choice.id} className="companion-environment-option" title={choice.name} data-palette={choice.id} aria-pressed={mode === 'manual' && renderedPalette === choice.id} aria-busy={preparingPalette === choice.id || undefined} onClick={() => chooseEnvironment('manual', choice.id)}>{roomMode ? preparingPalette === choice.id ? <LoaderCircle size={24} className="spin" /> : <AppearanceIcon palette={choice.id} size={27} /> : <span className="companion-environment-swatch" aria-hidden="true" />}<span className={roomMode ? 'sr-only' : undefined}>{choice.name}</span>{!roomMode && mode === 'manual' && renderedPalette === choice.id && <Check size={15} />}</button>)}
  </div>;

  return <section className={`companion-settings${roomMode ? ' companion-settings-room' : ''}`} data-controls-side={roomMode ? controlsSide : undefined} data-portraits-ready={!roomMode || portraitsReady} aria-busy={roomMode && !portraitsReady || undefined} style={roomMode && pickerSpace !== undefined ? { '--picker-space': `${Math.max(280, pickerSpace)}px` } as CSSProperties : undefined} aria-label="陪伴的样子" onKeyDown={closePanel}>
    <WorkspaceArtworkWarmup character={value.character} sceneChoices={value.sceneChoices} />
    <div className="companion-settings-rows" inert={roomMode && !portraitsReady}>
      <div className="companion-setting-row">
        {!roomMode && <button ref={partnerButton} type="button" className="companion-setting-trigger" aria-label={'伙伴，' + companionName(value)} aria-expanded={expanded === 'partner'} aria-controls={panelId + '-partner'} onClick={() => togglePanel('partner')}>
          <span className="companion-setting-label">伙伴</span>
          <span className="companion-current-partner">{portrait ? <span className="companion-current-face"><img src={portrait} alt="" style={custom ? undefined : identityPortrait?.avatar} /></span> : <Sun size={25} />}<span>{companionName(value)}</span></span>
          <ChevronRight size={17} className={expanded === 'partner' ? 'is-open' : ''} />
        </button>}
        {(roomMode || expanded === 'partner') && <div ref={picker} id={panelId + '-partner'} className="companion-partner-picker">
          <div className="character-choices" role="group" aria-label="选择伙伴">
            {gallery.map(character => <button type="button" key={character.id} className="character-choice" aria-label={'fullName' in character ? value.names[character.id] ? companionName(value, character.id) + '，' + character.fullName : character.fullName : companionName(value, character.id)} aria-pressed={value.character === character.id} aria-busy={preparingCharacter === character.id || undefined} onClick={() => choose(character.id)}>
              <span className={'character-picture ' + (character.id.startsWith('custom:') ? 'is-custom' : '')} style={{ backgroundImage: 'url(' + WINDOW_LIGHT[environment.light] + ')', ...('frame' in character ? { '--portrait-width': character.frame.portrait, '--portrait-top': character.frame.portraitTop, '--art-anchor': character.frame.anchor } : {}) } as CSSProperties}><img src={character.image} alt="" />{value.character === character.id && <span className="character-chosen"><Check size={12} /></span>}{!roomMode && value.favorites.includes(character.id) && <Heart size={12} className="companion-kept-mark" fill="currentColor" />}{preparingCharacter === character.id && <LoaderCircle size={20} className="spin character-loading" />}</span>
              <span className={roomMode ? 'sr-only' : undefined}>{companionName(value, character.id)}</span>
            </button>)}
          </div>
          {roomMode && environmentPicker}
          <div className="companion-picker-actions">
            <button type="button" className="text-button" title="用自己的图片" disabled={opening} onClick={() => file.current?.click()}>{opening ? <LoaderCircle size={21} className="spin" /> : <ImagePlus size={roomMode ? 22 : 15} />}<span className={roomMode ? 'sr-only' : undefined}>{opening ? '正在打开…' : '用自己的图片'}</span></button>
            {!roomMode && <button type="button" className="text-button" aria-pressed={roomOnly} onClick={() => choose('light')}><Sun size={15} />只留一束光</button>}
          </div>
          <details className="companion-picker-more">
            <summary title="其他选择">{roomMode ? <><Ellipsis size={24} /><span className="sr-only">其他选择</span></> : '其他选择'}</summary>
            <div className="companion-picker-more-content">
              {!custom && !roomOnly && <button type="button" className="text-button" aria-pressed={value.favorites.includes(value.character)} onClick={() => perform(() => toggleFavorite(value.character))}><Heart size={14} fill={value.favorites.includes(value.character) ? 'currentColor' : 'none'} />{value.favorites.includes(value.character) ? '不再收藏' : '收藏这个形象'}</button>}
              {roomMode && <button type="button" className="text-button" aria-pressed={roomOnly} onClick={() => choose('light')}><Sun size={18} />只留一束光</button>}
              <label className="companion-presence-choice">出现的方式<select aria-label="伙伴出现的方式" value={value.presence} onChange={event => setPreview(current => ({ ...current, presence: event.target.value as CompanionPreference['presence'] }))}><option value="window">窗边陪着</option><option value="corner">留在页角</option><option value="hidden">暂时收起</option></select></label>
              <Switch label="少一点动态" checked={preview.reducedMotion} onChange={reducedMotion => setPreview(current => ({ ...current, reducedMotion }))} />
              {custom && <details className="companion-custom-adjust"><summary>调整图片</summary><div className="companion-placement">
                {([['scale', '远近', .75, 1.3, .01], ['position', '左右', 0, 100, 1], ['verticalPosition', '高低', 0, 100, 1]] as const).map(([key, label, min, max, step]) => <label key={key}>{label}<input type="range" aria-label={'图片' + label} min={min} max={max} step={step} value={placement[key]} onChange={event => setPlacement(current => ({ ...current, [key]: Number(event.target.value) }))} onPointerDown={() => { sliderOrigin.current = placement; }} onPointerUp={() => { sliderOrigin.current = undefined; }} onPointerCancel={cancelSlider} onKeyDown={adjustPlacementKey} onKeyUp={event => { if (event.key !== 'Escape') sliderOrigin.current = undefined; }} onBlur={() => { sliderOrigin.current = undefined; }} /></label>)}
                <button type="button" className="text-button" onClick={() => setPlacement({ scale: 1, position: 50, verticalPosition: 100 })}>回到原处</button>
              </div></details>}
              {custom && <button type="button" className="text-button companion-remove" disabled={opening} onClick={() => perform(() => { removePicture(custom.id); setPreview(current => ({ ...current, character: 'light' })); })}><Trash2 size={14} />移走这张图片</button>}
              {roomMode && <button type="button" className="text-button companion-edit-persona" onClick={onEditPersona}>相处方式<ChevronRight size={17} /></button>}
            </div>
          </details>
        </div>}
      </div>
      <div className="companion-setting-row">
        {!roomMode && <button ref={lightButton} type="button" className="companion-setting-trigger" aria-label={'光线，' + lightName} aria-expanded={expanded === 'light'} aria-controls={panelId + '-light'} onClick={() => togglePanel('light')}>
          <span className="companion-setting-label">光线</span><span className="companion-setting-value">{lightName}</span><ChevronRight size={17} className={expanded === 'light' ? 'is-open' : ''} />
        </button>}
        {!roomMode && expanded === 'light' && environmentPicker}
      </div>
      {roomStale && <div className="companion-preview-conflict" role="alert"><p>这里的选择刚在另一处改过。你试看的样子还留着。</p><button type="button" className="text-button" onClick={cancelPreview}>看看新选择</button><button type="button" className="text-button" onClick={keepPreviewAfterConflict}>保留这份试看</button></div>}
      {error && <p className="inline-problem companion-problem" role="alert">{error}</p>}
      {roomDirty && !roomCanAdopt && <p className="companion-scene-unavailable" role="status">这处窗边暂时没有合适的画面。<button type="button" className="text-button" onClick={() => setPreview(current => ({ ...current, presence: 'corner' }))}>留在页角</button></p>}
      {canSyncPersonaVoice && <Switch label={`连说话方式也换成${targetPartnerPreset.label}${persona.core.address ? `（保留称呼「${persona.core.address}」）` : ''}`} checked={syncPersonaVoice} onChange={next => { if (!busy && !saving) setSyncPersonaVoice(next); }} />}
      {(roomDirty || opening || preparingCharacter || preparingPalette) && <div className="companion-preview-actions"><button type="button" className="text-button" title="取消" onClick={cancelPreview}>{roomMode && <X size={23} />}<span className={roomMode ? 'sr-only' : undefined}>取消</span></button><button type="button" className="primary-button" title="采用" disabled={opening || !!preparingCharacter || !!preparingPalette || roomStale || !roomCanAdopt || adopting} onClick={adoptPreview}>{roomMode && <Check size={25} />}<span className={roomMode ? 'sr-only' : undefined}>采用</span></button></div>}
    </div>
    <div className="companion-preview" ref={roomPreview} onPointerDownCapture={() => paintTransition.current?.skipTransition()} onKeyDownCapture={() => paintTransition.current?.skipTransition()}>
      <CompanionPreviewProvider preference={renderedPreference} positions={positions} choices={choices} onPositionChange={previewPosition} onSceneChoiceChange={previewSceneChoice}>
        <CompanionScene preview moment={moment} placement={placement} onRoomLayout={setRoomLayout} interaction={{ onChange: setPlacement, onCommit: setPlacement }} />
      </CompanionPreviewProvider>
    </div>
    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="选择人物图片" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) void importPicture(selected); }} />
  </section>;
}
