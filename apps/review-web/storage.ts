import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
const files = new Map<string, Uint8Array>();
const encoder = new TextEncoder(), decoder = new TextDecoder();
/** Only build-selected public map assets are reachable. No host filesystem, profiles or persistence. */
export async function preloadPublicMap() {
  const names = ['manifest.json','places.json','network.json','geography.geojson','display-geography.geojson','sports-details.geojson','shared-facts.json','venues.json'];
  await Promise.all(names.map(async name => {
    const response = await fetch(new URL('map/' + name + '.gz', document.baseURI));
    if (!response.ok) throw new Error('地图资料未能载入：' + name);
    const received=new Uint8Array(await response.arrayBuffer());
    // Some static hosts send Content-Encoding:gzip, so fetch already decoded
    // the file. Other hosts expose the compressed asset as application/gzip.
    const compressed=received[0]===0x1f&&received[1]===0x8b;
    const bytes=compressed
      ? new Uint8Array(await new Response(new Blob([received]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
      : received;
    files.set('map/' + name, bytes);
  }));
}
export function readFileSync(name:string, encoding?:string):any {
  const bytes = files.get(name);
  if (!bytes) throw new Error('在线地图只能读取公开地图资料。');
  return encoding ? decoder.decode(bytes) : bytes;
}
export function statSync(name:string) {
  if (!files.has(name)) throw new Error('在线地图没有此文件。');
  return {mtimeMs:1};
}
export const path = {join:(...parts:string[]) => parts.join('/').replaceAll(String.fromCharCode(92), '/').split('/').filter(Boolean).join('/')};
export function createHash(algorithm:string) {
  if (algorithm !== 'sha256') throw new Error('Unsupported digest');
  const parts:Uint8Array[]=[];
  const hash = {
    update(value:Uint8Array|string) {parts.push(typeof value === 'string' ? encoder.encode(value) : value); return hash;},
    digest(encoding:string) {
      if (encoding !== 'hex') throw new Error('Unsupported encoding');
      const bytes = new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let offset=0;
      for (const part of parts) {bytes.set(part,offset);offset+=part.length;}
      return bytesToHex(sha256(bytes));
    },
  };
  return hash;
}
