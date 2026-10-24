import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ImageAttachment } from '../../shared/types';

export type ImageCrop = { x: number; y: number; width: number; height: number };
/** Reads only the installed skill's public index and public birdseye asset.
 * Personal profiles, GPS endpoints, alternate apps and exported histories are
 * not imported. Namespaces keep this evidence separate from native OSM routes. */
export class CampusReferenceAdapter {
  readonly namespace = 'zju-official-birdseye';
  private imagePath?: string;
  private version = '';
  private source: Record<string, any> = {};
  private places: { id: string; name: string; aliases: string[] }[] = [];
  constructor(root: string, private encode: (file: string, crop?: ImageCrop) => ImageAttachment) {
    const base = path.resolve(root), image = path.join(base, 'assets', 'birdseye-overview.png'), index = path.join(base, 'data', 'places.tsv'), source = path.join(base, 'assets', 'birdseye-source.json');
    if (![image, index, source].every(file => existsSync(file))) return;
    if ([image, index, source].some(file => { const relative = path.relative(realpathSync(base), realpathSync(file)); return relative.startsWith('..') || path.isAbsolute(relative); })) return;
    const metadata = JSON.parse(readFileSync(source, 'utf8'));
    if (metadata.schema !== 'zju-official-birdseye/v1') return;
    this.imagePath = image;
    this.version = createHash('sha256').update(readFileSync(image)).digest('hex');
    this.source = { url: metadata.source_page, retrievedAt: metadata.retrieved, imageDate: metadata.official_image_collection_date, rotationDegrees: metadata.rotation_degrees, overlookDegrees: metadata.overlook_degrees, attribution: metadata.copyright };
    const lines = readFileSync(index, 'utf8').trim().split(/\r?\n/), header = lines.shift()!.split('\t');
    this.places = lines.map(line => Object.fromEntries(line.split('\t').map((value, index) => [header[index], value]))).map(row => ({ id: row.uid || row.id, name: row.name, aliases: (row.aliases || '').split('|').filter(Boolean) }));
  }
  overview() { return { connected: !!this.imagePath, namespace: this.namespace, version: this.version, source: this.source, count: this.places.length, meaning: '公开俯瞰图与地点名称索引，适合认建筑与相对位置；实际可走路线另看路网，当天门禁仍需现场确认。' }; }
  search(query: string, limit = 5) {
    const q = query.normalize('NFKC').trim().toLowerCase();
    return this.places.filter(place => [place.name, place.id, ...place.aliases].some(name => name.normalize('NFKC').toLowerCase().includes(q))).slice(0, limit).map(place => ({ ...place, namespace: this.namespace, version: this.version, source: this.source, nativeMapEquivalence: 'not_established' }));
  }
  has(id: string) { return this.places.some(place => place.id === id); }
  image(crop?: ImageCrop) {
    if (!this.imagePath) return undefined;
    const originalVersion = createHash('sha256').update(readFileSync(this.imagePath)).digest('hex');
    if (originalVersion !== this.version) throw new Error('俯瞰图版本已改变，请重新载入来源。');
    const image = this.encode(this.imagePath, crop);
    return { image, version: this.version, crop: crop || null, namespace: this.namespace, source: this.source };
  }
}
