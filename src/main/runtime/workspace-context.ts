import type { WorkspaceContext, WorkspaceSettingsContext, WorkspaceSurface, WorkspaceTarget } from '../../shared/workspace-context';
import type { RunSession } from './coordinator';
import type { DeferredFamily } from './tool-surface';
import type { InputControls } from './policy';

const focusedKeys = ['rehearsalInteraction', 'rehearsalAdmission', 'letterReference', 'noteReference', 'notebookQuote',
  'mapRouteReference', 'agendaFocus', 'materialQuote', 'conversationQuote', 'noteQuote', 'curiosityReference',
  'programReference', 'preparationReference', 'companionReference', 'studyInteraction', 'studySelection',
  'selection', 'campusSelection'] as const;

export function workspaceInputControls(controls: InputControls, target: WorkspaceTarget): InputControls {
  const focused = { ...controls, workspaceContext: undefined };
  for (const key of focusedKeys) if (key in focused) delete (focused as Record<string, unknown>)[key];
  switch (target.kind) {
    case 'material_quote': focused.materialQuote = target.reference; break;
    case 'note_quote': focused.noteQuote = target.reference; break;
    case 'notebook_quote': focused.notebookQuote = target.reference; break;
    case 'conversation_quote': focused.conversationQuote = target.reference; break;
    case 'agenda': focused.agendaFocus = target.reference; break;
    case 'map_route': focused.mapRouteReference = target.reference; break;
    case 'study': focused.studyInteraction = { kind: 'reference', focus: target.reference }; break;
    case 'interactive': focused.programReference = target.reference; break;
    case 'companion': focused.companionReference = target.reference; break;
    case 'curiosity': focused.curiosityReference = target.reference; break;
    case 'preparation': focused.preparationReference = target.reference; break;
    case 'letter': focused.letterReference = target.reference; break;
    case 'note': focused.noteReference = target.reference; break;
    case 'rehearsal': focused.rehearsalInteraction = { kind: 'reference', ref: target.reference }; break;
    case 'scene': focused.selection = target.reference; break;
    // A whole document is an address, not an invented one-character excerpt.
    // The body-free control context resolves its document identity directly.
    case 'material': break;
    case 'notebook': focused.noteQuote = { ...target.reference, start: 0, end: 1 }; break;
  }
  return focused;
}

export function workspaceAppearance(value: WorkspaceSettingsContext['appearance']['saved']) {
  const characters: Record<string, string> = { sakiko: '丰川祥子', mutsumi: '若叶睦', uika: '三角初华', umiri: '八幡海铃',
    nyamu: '祐天寺若麦', tomori: '高松灯', anon: '千早爱音', rana: '要乐奈', soyo: '长崎爽世', taki: '椎名立希', light: '一束光' };
  return { ...value, characterName: characters[value.character] || '自选人物',
    paletteName: { apricot: '暖杏', mist: '晨雾蓝', violet: '暮色紫', rain: '夜雨暖金' }[value.palette],
    presenceName: { window: '窗边陪着', corner: '留在页角', hidden: '暂时收起' }[value.presence],
    environmentModeName: value.environmentMode === 'auto' ? '随窗外' : '手动选择',
    readingScaleName: value.readingScale === 1 ? '标准' : value.readingScale === 1.15 ? '大一点' : '再大一点',
    densityName: value.density === 'comfortable' ? '舒展' : '紧凑' };
}

/** A short-lived view of the same run. Every read still goes through the
 * coordinator's original owner resolver and the original context receipt. */
export function workspaceFocusedRun(session: RunSession, target: WorkspaceTarget): RunSession {
  const focused = { ...session };
  for (const key of focusedKeys) delete focused[key];
  switch (target.kind) {
    case 'material_quote': focused.materialQuote = target.reference; break;
    case 'note_quote': focused.noteQuote = target.reference; break;
    case 'notebook_quote': focused.notebookQuote = target.reference; break;
    case 'conversation_quote': focused.conversationQuote = target.reference; break;
    case 'agenda': focused.agendaFocus = target.reference; break;
    case 'map_route': focused.mapRouteReference = target.reference; break;
    case 'study': focused.studyInteraction = { kind: 'reference', focus: target.reference }; break;
    case 'interactive': focused.programReference = target.reference; break;
    case 'companion': focused.companionReference = target.reference; break;
    case 'curiosity': focused.curiosityReference = target.reference; break;
    case 'preparation': focused.preparationReference = target.reference; break;
    case 'letter': focused.letterReference = target.reference; break;
    case 'note': focused.noteReference = target.reference; break;
    case 'rehearsal': focused.rehearsalInteraction = { kind: 'reference', ref: target.reference }; break;
  }
  return focused;
}

export function workspaceProjectionKey(target: WorkspaceTarget) {
  switch (target.kind) {
    case 'material_quote': return 'currentMaterial';
    case 'note_quote': case 'notebook_quote': case 'note': case 'notebook': return 'currentNote';
    case 'conversation_quote': return 'currentConversationQuote';
    case 'agenda': return 'currentAgenda';
    case 'map_route': return 'currentMapRoute';
    case 'study': return 'currentStudy';
    case 'interactive': return 'currentInteractive';
    case 'companion': return 'currentCompanion';
    case 'curiosity': return 'currentCuriosity';
    case 'preparation': return 'currentPreparation';
    case 'letter': return 'currentLetter';
    case 'rehearsal': return 'currentRehearsal';
    case 'scene': return 'currentSelection';
    case 'material': return 'currentMaterialReference';
  }
}

const surfaces: Record<WorkspaceSurface, { meaning: string; tools: string[]; capabilities?: string[] }> = {
  home: { meaning: '当前对话和手里带着的事情；从原输入继续，也可以只聊一句。', tools: ['restore_collaboration', 'read_assistant_history', 'present_view'] },
  conversation: { meaning: '同一段对话里的原话、回复与共同对象，未发草稿仍留在输入处。', tools: ['read_evidence', 'read_assistant_history', 'restore_collaboration'] },
  keep: { meaning: '本人留下的笔记、合法原件、原作品和对话入口；只打开或选中不表示已读、引用或允许长期了解。沿这次明确指向的原地址继续，保存仍由原owner核验。', tools: ['manage_note', 'read_interactive_program', 'read_assistant_history', 'restore_collaboration', 'present_view'] },
  materials: { meaning: '文件原版、当前页和选段；需要解释时可继续看邻文、图表和下一页。', tools: ['look_up', 'present_view'], capabilities: ['materials.describe', 'materials.read', 'materials.find', 'materials.observe', 'materials.table', 'research.read'] },
  notes: { meaning: '本人保存的笔记和原文地址，沿同一页读、改、撤回并核对结果。', tools: ['manage_note', 'present_view'] },
  study: { meaning: '同一道原题、本人尝试和当前帮助，可以比较、改条件或接着推。', tools: ['read_study_companion', 'study_companion', 'read_learning', 'manage_learning', 'present_view'] },
  agenda: { meaning: '已保存安排与仍在试放的版本，能比较取舍、修改并回看原结果。', tools: ['look_up', 'prepare_action', 'inspect_action', 'change_local_action', 'cancel_action', 'offer_planning_alternatives', 'continue_planning'], capabilities: ['local.agenda.read', 'planning.preview'] },
  campus: { meaning: '学校原来源中的课程、时间和记录，按当前问题继续查相应范围。', tools: ['look_up', 'read_current_campus_selection', 'present_view'], capabilities: ['campus.query', 'campus.lookup', 'campus.overview'] },
  map: { meaning: '当前地点、路线与旅程，能比较路段、查新路线并回到同一张地图。', tools: ['map_overview', 'map_search', 'map_route', 'manage_space', 'present_view'], capabilities: ['map.journey.read'] },
  interactive: { meaning: '同一作品的原稿、文字位置与发送时的真实局部状态，能继续探索和修订。', tools: ['read_interactive_program', 'present_view', 'read_skill'] },
  letter: { meaning: '原来信中的句子、来由和当前停点，沿原信接着读或回应。', tools: ['read_reflective_letter', 'write_reflective_letter', 'present_view'] },
  characters: { meaning: '当前保存的人物与相处约定；外观预览和已保存人格分别看。', tools: ['read_skill'] },
  appearance: { meaning: '当前打开的外观设置，主题和分屏按本机选择呈现。', tools: [] },
  memory: { meaning: '原话、当时的理解与后来更正，能沿原出处寻回并核对。', tools: ['recall_experience', 'read_understanding', 'read_evidence', 'propose_memory_change'] },
  settings: { meaning: '当前保存的使用偏好与连接入口，具体开关仍可在原设置处调整。', tools: [] },
  preparation: { meaning: '已经备好的材料、原来由和可取用位置，能打开并回到需要它的事情。', tools: ['inspect_help', 'decide_help', 'restore_collaboration'] },
  rehearsal: { meaning: '本人试说的原句和一种可能回应，能接着试、改意思或停在这里。', tools: ['read_relationship_rehearsal', 'manage_relationship_rehearsal', 'present_view'] },
};

export function workspaceSurfaceDirectory(tools: ReadonlySet<string>, capabilities: ReadonlySet<string>) {
  return Object.entries(surfaces).map(([surface, entry]) => ({ surface, meaning: entry.meaning,
    operations: [...entry.tools.filter(tool => tools.has(tool)).map(tool => ({ tool })),
      ...(entry.capabilities || []).filter(capability => capabilities.has(capability)).map(capability => ({
        tool: 'look_up', arguments: { source: 'capability', capability, describeOnly: true },
      }))], returnTo: { surface } }));
}

export function workspaceToolFamilies(context?: WorkspaceContext): DeferredFamily[] {
  if (!context) return [];
  const kinds = new Set(context.objects.map(object => object.target.kind));
  return [
    ...(context.surface === 'study' || kinds.has('study') ? ['study' as const] : []),
    ...(context.surface === 'rehearsal' || kinds.has('rehearsal') ? ['rehearsal' as const] : []),
    ...(context.surface === 'letter' || kinds.has('letter') ? ['letter' as const] : []),
    ...(kinds.has('curiosity') ? ['curiosity' as const] : []),
    ...(kinds.has('companion') ? ['companion' as const] : []),
    ...(context.surface === 'agenda' || kinds.has('agenda') ? ['planning' as const] : []),
  ];
}
