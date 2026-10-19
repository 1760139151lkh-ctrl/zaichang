import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizedRoots } from './campus-query';
import { canonical } from '../runtime/semantics';

export interface CampusSnapshotProof {
  sourceId: 'campus:zju-account'; bundleId: string; resource: string; version: string;
  selection: 'saved_head' | 'historical'; collectedAt?: string;
  sourceFetchedAt: Record<string, string>; coverage: unknown;
  original: { bundleId: string; pointer: string };
}
interface MetadataStamp { root: string; account: string; head: string; headFile: string }
interface Issued { proof: CampusSnapshotProof; stamp: MetadataStamp; bundle: string; issuedAt: number }
interface SavedMetadata { bundle_id?: string; kind?: string; semester_id?: string; endpoint?: string }
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const fileDigest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const academic = new Set(['classes', 'courses', 'exams', 'grades', 'gpa_semesters', 'gpa_overall', 'gpa_cumulative',
  'retakes', 'projects', 'practice_summary', 'todos', 'holidays', 'calendar_pending', 'cancelled_classes', 'source_status']);
const sourceEndpoints: Record<string, string> = { reservations: 'booking.seats', reservation_violations: 'booking.violations',
  card_accounts: 'ecard.cards', transactions: 'ecard.transactions', student_profile: 'eta.profile', roles: 'eta.roles', learning_courses: 'courses.list' };

/** Signs only the bundle actually returned by the existing connector. This
 * class neither decrypts datasets nor selects, normalizes or executes queries. */
export class CampusSnapshotProofs {
  private issued = new Map<string, Issued>();
  private groups = new Map<string, CampusSnapshotProof[]>();
  constructor(private activeRoot: () => string | null) {}
  private directory() { return process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'CodexZjuStudentInfo') : undefined; }
  beforeMetadata(resource: string): MetadataStamp | undefined {
    const directory = this.directory(), root = this.activeRoot();
    if (!directory || !root) return undefined;
    const headFile = academic.has(resource) ? 'latest-academic.dpapi' : 'source-index.dpapi';
    try { return { root, account: fileDigest(path.join(directory, 'credentials.dpapi')), head: fileDigest(path.join(directory, headFile)), headFile }; }
    catch { return undefined; }
  }
  headStamp(resource: string) { const stamp = this.beforeMetadata(resource); return stamp ? digest(stamp) : undefined; }
  /** Local invalidation token only. No decryption, authentication or refresh;
   * callers must not present it as an observation from the university. */
  savedRevision(): string | null {
    const directory = this.directory(), root = this.activeRoot();
    if (!directory || !root) return null;
    try { return digest({ root, files: ['credentials.dpapi', 'latest-academic.dpapi', 'source-index.dpapi'].map(name => {
      const file = path.join(directory, name);
      return [name, existsSync(file) ? fileDigest(file) : null];
    }) }); } catch { return null; }
  }
  issue(result: any, resource: string, history: any, before: MetadataStamp | undefined): CampusSnapshotProof | undefined {
    const directory = this.directory(), current = this.beforeMetadata(resource);
    if (!directory || !before || !current || canonical(before) !== canonical(current)
      || !/^[a-f0-9]{32}$/.test(String(result?.bundle_id || '')) || history?.status !== 'ok' || !Array.isArray(history.items)) return undefined;
    // The existing history command filters its metadata by the current vault
    // account. A bundle absent from that bounded page receives no new receipt.
    const entries = history.items as SavedMetadata[], actual = entries.find(item => item.bundle_id === result.bundle_id);
    if (!actual) return undefined;
    const matches = (item: SavedMetadata) => academic.has(resource)
      ? item.kind === 'academic' && item.semester_id === actual.semester_id
      : item.kind === 'source' && !!sourceEndpoints[resource] && item.endpoint === sourceEndpoints[resource];
    if (!matches(actual)) return undefined;
    const head = entries.find(matches), sourceFetchedAt = Object.fromEntries(Object.entries(result.coverage?.source_fetched_at || {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Number.isFinite(Date.parse(entry[1]))));
    const collectedAt = Object.values(sourceFetchedAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    const file = path.join(directory, 'datasets', result.bundle_id + '.dpapi');
    try {
      const bundle = fileDigest(file), proof: CampusSnapshotProof = { sourceId: 'campus:zju-account', bundleId: result.bundle_id, resource,
        version: digest({ bundleId: result.bundle_id, resource, bundle }), selection: head?.bundle_id === result.bundle_id ? 'saved_head' : 'historical',
        ...(collectedAt ? { collectedAt } : {}), sourceFetchedAt, coverage: result.coverage || { complete: false, scope: 'saved_object_navigation' },
        original: { bundleId: result.bundle_id, pointer: normalizedRoots[resource as keyof typeof normalizedRoots] || '/normalized/items' } };
      if (canonical(this.beforeMetadata(resource)) !== canonical(before)) return undefined;
      for (const [key, entry] of this.issued) if (Date.now() - entry.issuedAt > 1800000) this.issued.delete(key);
      this.issued.set(digest(proof), { proof, stamp: before, bundle, issuedAt: Date.now() });
      return proof;
    } catch { return undefined; }
  }
  isCurrentSnapshot(proof: CampusSnapshotProof) {
    const issued = this.issued.get(digest(proof)), directory = this.directory();
    if (!issued || !directory || !this.activeRoot() || proof.selection !== 'saved_head') return false;
    try { return canonical(this.beforeMetadata(proof.resource)) === canonical(issued.stamp)
      && existsSync(path.join(directory, 'datasets', proof.bundleId + '.dpapi'))
      && fileDigest(path.join(directory, 'datasets', proof.bundleId + '.dpapi')) === issued.bundle; }
    catch { return false; }
  }
  bindSnapshots(proofs: CampusSnapshotProof[]): string | undefined {
    if (!proofs.length || proofs.some(proof => !this.isCurrentSnapshot(proof))) return undefined;
    const version = digest(proofs.map(proof => ({ resource: proof.resource, version: proof.version })));
    while (this.groups.size >= 50) this.groups.delete(this.groups.keys().next().value!);
    this.groups.set(version, structuredClone(proofs));
    return version;
  }
  isCurrentVersion(version: string): boolean {
    const group = this.groups.get(version);
    if (group) return group.every(proof => this.isCurrentSnapshot(proof));
    return [...this.issued.values()].some(entry => entry.proof.version === version && this.isCurrentSnapshot(entry.proof));
  }
  clear() { this.issued.clear(); this.groups.clear(); }
}
