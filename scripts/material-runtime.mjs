import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'esbuild';

export const MATERIAL_READER_VERSION = 'pdfjs-dist6.2.108-canvas1.0.6';
const PROJECT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEPENDENCIES = Object.freeze({ 'pdfjs-dist': '6.2.108', '@napi-rs/canvas': '1.0.6', '@napi-rs/canvas-win32-x64-msvc': '1.0.6' });
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ASSET_BYTES = 64 * 1024 * 1024;
const MAX_RUNTIME_BYTES = 256 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = filename => fs.access(filename).then(() => true, () => false);
const requiredFiles = [
  'worker.cjs', 'node_modules/pdfjs-dist/package.json', 'node_modules/pdfjs-dist/LICENSE',
  'node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  'node_modules/pdfjs-dist/legacy/LICENSE_COREJS_3.49.0',
  'node_modules/pdfjs-dist/cmaps/LICENSE', 'node_modules/pdfjs-dist/standard_fonts/LICENSE_FOXIT',
  'node_modules/pdfjs-dist/standard_fonts/LICENSE_LIBERATION', 'node_modules/pdfjs-dist/wasm/LICENSE_OPENJPEG',
  'node_modules/pdfjs-dist/wasm/LICENSE_QCMS', 'node_modules/pdfjs-dist/wasm/LICENSE_JBIG2',
  'node_modules/pdfjs-dist/wasm/openjpeg.wasm', 'node_modules/pdfjs-dist/wasm/qcms_bg.wasm', 'node_modules/pdfjs-dist/wasm/jbig2.wasm',
  'node_modules/pdfjs-dist/iccs/LICENSE', 'node_modules/pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc',
  'node_modules/@napi-rs/canvas/package.json', 'node_modules/@napi-rs/canvas/LICENSE',
  'node_modules/@napi-rs/canvas/index.js', 'node_modules/@napi-rs/canvas/js-binding.js',
  'node_modules/@napi-rs/canvas-win32-x64-msvc/package.json',
  'node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node',
  'node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat',
];
// Original embedded core-js 3.49.0 license, checked at its immutable tag:
// https://raw.githubusercontent.com/zloirock/core-js/v3.49.0/LICENSE
const COREJS_LICENSE = `Copyright (c) 2013–2025 Denis Pushkarev (zloirock.ru)
Copyright (c) 2025–2026 CoreJS Company (core-js.io)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`;

/** @typedef {{required:true,path:string,manifestSha256:string,workerSha256:string,assetLockSha256:string}} MaterialRuntimeRef */

function safeRelative(relative) {
  return typeof relative === 'string' && /^[A-Za-z0-9_@.+/-]+$/.test(relative) && !relative.startsWith('/')
    && relative.split('/').every(part => part && part !== '.' && part !== '..');
}
function inside(root, relative) {
  if (!safeRelative(relative)) throw new Error('Unsafe material runtime path.');
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) throw new Error('Material runtime path escaped its root.');
  return absolute;
}
async function records(root) {
  const files = [];
  let totalBytes = 0;
  async function walk(directory, relative = '') {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (!safeRelative(name) || entry.isSymbolicLink()) throw new Error('Unsafe material runtime entry: ' + name);
      const filename = inside(root, name);
      if (entry.isDirectory()) await walk(filename, name);
      else if (entry.isFile()) {
        if (name === 'manifest.json') continue;
        const stat = await fs.lstat(filename);
        totalBytes += stat.size;
        if (stat.size > MAX_ASSET_BYTES || totalBytes > MAX_RUNTIME_BYTES || files.length >= 1000) throw new Error('Material runtime asset budget exceeded.');
        files.push({ path: name, sha256: sha256(await fs.readFile(filename)), bytes: stat.size });
      } else throw new Error('Non-file material runtime entry: ' + name);
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Verify the pinned manifest, every asset, the exact file set and all hashes. */
export async function verifyMaterialRuntime(ref) {
  if (!ref || ref.required !== true || typeof ref.path !== 'string' || !path.isAbsolute(ref.path)
    || !['manifestSha256', 'workerSha256', 'assetLockSha256'].every(key => /^[a-f0-9]{64}$/.test(ref[key]))) throw new Error('Invalid material runtime reference.');
  const root = path.resolve(ref.path);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid material runtime root.');
  const manifestPath = path.join(root, 'manifest.json');
  const manifestStat = await fs.lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > MAX_MANIFEST_BYTES) throw new Error('Invalid material runtime manifest file.');
  const bytes = await fs.readFile(manifestPath);
  if (sha256(bytes) !== ref.manifestSha256) throw new Error('Material runtime manifest hash mismatch.');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.version !== 1 || manifest.readerVersion !== MATERIAL_READER_VERSION
    || JSON.stringify(manifest.dependencies) !== JSON.stringify(DEPENDENCIES)
    || manifest.worker?.path !== 'worker.cjs' || manifest.worker.sha256 !== ref.workerSha256
    || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 1000
    || sha256(JSON.stringify(manifest.files)) !== ref.assetLockSha256) throw new Error('Material runtime manifest contract mismatch.');
  const names = new Set();
  for (const file of manifest.files) {
    if (!file || !safeRelative(file.path) || names.has(file.path.toLowerCase())
      || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_ASSET_BYTES) throw new Error('Invalid material runtime asset record.');
    inside(root, file.path); names.add(file.path.toLowerCase());
  }
  for (const name of requiredFiles) if (!names.has(name.toLowerCase())) throw new Error('Required material runtime asset missing: ' + name);
  const actual = await records(root);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('Material runtime asset set or fingerprint mismatch.');
  if (actual.find(file => file.path === 'worker.cjs')?.sha256 !== ref.workerSha256) throw new Error('Material runtime worker hash mismatch.');
  for (const [name, version] of Object.entries(DEPENDENCIES)) {
    const pkg = JSON.parse(await fs.readFile(inside(root, 'node_modules/' + name + '/package.json'), 'utf8'));
    if (pkg.name !== name || pkg.version !== version) throw new Error('Material runtime installed package version mismatch.');
  }
  return ref;
}

async function copyChecked(source, destination) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error('Material runtime source must not be a symlink.');
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const name of (await fs.readdir(source)).sort()) await copyChecked(path.join(source, name), path.join(destination, name));
  } else if (stat.isFile()) {
    if (stat.size > MAX_ASSET_BYTES) throw new Error('Material runtime source file exceeds budget.');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  } else throw new Error('Material runtime source is not a regular file/directory.');
}

/** Stage only project-owned production dependencies; no Codex/global runtime paths. */
export async function stageMaterialRuntime(destination) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The pinned material runtime currently supports Windows x64 only.');
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('Material runtime destination is required.');
  const root = path.resolve(destination), parent = path.dirname(root);
  if (root === path.parse(root).root || root === PROJECT || PROJECT.startsWith(root + path.sep)
    || root.startsWith(path.join(PROJECT, 'node_modules') + path.sep)) throw new Error('Unsafe material runtime destination.');
  await fs.mkdir(parent, { recursive: true });
  if (await exists(root)) {
    const current = await fs.lstat(root);
    if (!current.isDirectory() || current.isSymbolicLink()) throw new Error('Material runtime destination is not a regular directory.');
    const entries = await fs.readdir(root);
    if (entries.length) {
      const marker = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
      if (marker.version !== 1 || marker.readerVersion !== MATERIAL_READER_VERSION || marker.worker?.path !== 'worker.cjs') throw new Error('Refusing to replace an unrelated nonempty directory.');
    }
  }
  const staging = root + '.staging-' + randomUUID(), previous = root + '.previous-' + randomUUID();
  // Every recursive cleanup below is an explicitly checked, task-created sibling.
  const cleanSibling = async target => {
    const absolute = path.resolve(target);
    if (path.dirname(absolute) !== parent || !absolute.startsWith(root + '.') || absolute === root) throw new Error('Unsafe material runtime cleanup path.');
    await fs.rm(absolute, { recursive: true, force: true });
  };
  let movedPrevious = false, movedNew = false;
  try {
    await fs.mkdir(staging);
    for (const [name, version] of Object.entries(DEPENDENCIES)) {
      const source = path.join(PROJECT, 'node_modules', name);
      const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
      if (pkg.name !== name || pkg.version !== version) throw new Error('Installed production dependency is not pinned: ' + name);
      const target = path.join(staging, 'node_modules', name);
      if (name === 'pdfjs-dist') {
        for (const relative of ['package.json', 'LICENSE', 'legacy/build/pdf.mjs', 'legacy/build/pdf.worker.mjs', 'cmaps', 'standard_fonts', 'wasm', 'iccs']) {
          await copyChecked(path.join(source, relative), path.join(target, relative));
        }
        await fs.writeFile(path.join(target, 'legacy/LICENSE_COREJS_3.49.0'), COREJS_LICENSE);
      } else await copyChecked(source, target);
    }
    await build({ absWorkingDir: PROJECT, entryPoints: [path.join(PROJECT, 'src/main/materials/worker.ts')], bundle: true, outfile: path.join(staging, 'worker.cjs'),
      platform: 'node', format: 'cjs', target: 'node24', external: ['pdfjs-dist', '@napi-rs/canvas', '@napi-rs/canvas-win32-x64-msvc'], legalComments: 'inline' });
    const files = await records(staging);
    const workerSha256 = files.find(file => file.path === 'worker.cjs').sha256;
    const manifest = { version: 1, readerVersion: MATERIAL_READER_VERSION, pdfjsBuild: 'legacy', dependencies: DEPENDENCIES,
      embeddedDependencies: { 'core-js': '3.49.0' }, worker: { path: 'worker.cjs', sha256: workerSha256 },
      coordinateSpace: 'normalized_rotated_page', licenseNote: 'Original shipped package, CMap, font, WASM and ICC notices are included in their asset directories. The canvas MIT notice and the native package metadata declaring MIT are included; core-js 3.49.0 has its upstream MIT notice.', files };
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('Material runtime manifest exceeds budget.');
    await fs.writeFile(path.join(staging, 'manifest.json'), manifestBytes);
    const ref = { required: true, path: root, manifestSha256: sha256(manifestBytes), workerSha256, assetLockSha256: sha256(JSON.stringify(files)) };
    await verifyMaterialRuntime({ ...ref, path: staging });
    if (await exists(root)) { await fs.rename(root, previous); movedPrevious = true; }
    await fs.rename(staging, root); movedNew = true;
    if (movedPrevious) await cleanSibling(previous);
    return ref;
  } catch (error) {
    if (!movedNew && movedPrevious && !(await exists(root))) await fs.rename(previous, root);
    await cleanSibling(staging);
    throw error;
  }
}
