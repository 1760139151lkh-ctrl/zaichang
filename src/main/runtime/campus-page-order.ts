import { sceneViewDsl, type CampusScene, type PresentationView, type SceneSnapshot } from '../../shared/scenes';
import { canonical } from './semantics';

type Page = { scene: CampusScene; offset: number; returned: number; key: string };
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;
const position = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

function page(scene: SceneSnapshot | undefined): Page | undefined {
  if (!scene || scene.kind !== 'campus' || scene.domain !== 'schedule' || scene.origin !== 'zju_account' || !scene.nativeRead) return;
  const proof = object(scene.nativeRead.snapshotProof);
  if (!proof || proof.sourceId !== scene.source.sourceId || proof.resource !== 'classes'
    || typeof proof.bundleId !== 'string' || typeof proof.version !== 'string') return;
  const args = { ...scene.nativeRead.arguments }, spec = object(args.spec);
  // For retained pages written before nativePage, these are the original
  // typed CLI pagination coordinates, including its documented zero default.
  const offset = position(scene.nativePage?.offset) ?? position(spec?.offset) ?? position(args.offset) ?? 0;
  const returned = position(scene.nativePage?.returned) ?? scene.records.length;
  if (!returned || returned < scene.records.length) return;
  delete args.offset; delete args.limit; delete args.refresh;
  if (spec) {
    const selection = { ...spec };
    delete selection.offset; delete selection.limit;
    args.spec = selection;
  }
  return { scene, offset, returned, key: canonical({ capability: scene.nativeRead.capability, arguments: args,
    sourceId: scene.source.sourceId, bundleId: proof.bundleId, resource: proof.resource, version: proof.version,
    term: scene.term, total: scene.total }) };
}

/** Join only contiguous publications of one original source query. Program,
 * comparison and mixed-source layouts keep their declared relationships. */
export function orderCampusPageViews(views: readonly PresentationView[], scenes: readonly SceneSnapshot[]): PresentationView[] {
  const byRef = new Map(scenes.map(scene => [`${scene.id}@${scene.revision}`, scene]));
  const candidate = (view: PresentationView) => {
    if (view.libraryVersion !== 1 || view.program || view.programReference || view.comparison || !view.sceneRefs.length) return;
    const selected = view.sceneRefs.map(ref => byRef.get(`${ref.id}@${ref.revision}`));
    const pages = selected.map(page);
    if (pages.some(value => !value) || view.dsl !== sceneViewDsl(selected as SceneSnapshot[], 'stack')) return;
    const actual = pages as Page[];
    return actual.every(value => value.key === actual[0].key) ? { key: actual[0].key, pages: actual } : undefined;
  };
  const ordered: PresentationView[] = [];
  for (let index = 0; index < views.length;) {
    const first = candidate(views[index]);
    if (!first) { ordered.push(views[index++]); continue; }
    const group = [views[index]], pages = [...first.pages];
    let end = index + 1;
    while (end < views.length) {
      const next = candidate(views[end]);
      if (!next || next.key !== first.key) break;
      group.push(views[end++]); pages.push(...next.pages);
    }
    const sorted = [...pages].sort((left, right) => left.offset - right.offset);
    const contiguous = sorted.every((value, at) => !at || sorted[at - 1].offset + sorted[at - 1].returned === value.offset);
    if (!contiguous || new Set(sorted.map(value => `${value.scene.id}@${value.scene.revision}`)).size !== pages.length) ordered.push(...group);
    else if (group.length === 1 && pages.every((value, at) => value === sorted[at])) ordered.push(group[0]);
    else ordered.push({ ...group[0], revision: Math.max(...group.map(view => view.revision)) + 1,
      sceneRefs: sorted.map(({ scene }) => ({ id: scene.id, revision: scene.revision })),
      dsl: sceneViewDsl(sorted.map(value => value.scene), 'stack') });
    index = end;
  }
  return ordered;
}
