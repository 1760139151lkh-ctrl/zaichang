import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { configureNetwork } from '../src/main/network.ts';

export const EMBEDDING_RUNTIME_VERSION = 'bge-small-zh-v1.5-q8-ort1.30.0-tokenizers0.2.0-v1';
export const EMBEDDING_MODEL_ID = 'bge-small-zh-v1.5-q8-cls-l2-v1';
const PROJECT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOCK_PATH = path.join(PROJECT, 'runtime/embedding/lock.json');
export const EMBEDDING_ASSET_DIRECTORY = path.join(PROJECT, 'runtime/embedding/model');
const DEPENDENCIES = Object.freeze({ 'onnxruntime-node': '1.30.0', 'onnxruntime-common': '1.30.0', '@huggingface/tokenizers': '0.2.0' });
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const MAX_RUNTIME_BYTES = 512 * 1024 * 1024;
const MAX_FILES = 1000;
const ASSET_MARKER = 'manifest.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = filename => fs.access(filename).then(() => true, () => false);
// Metadata object insertion order is not part of the asset/dependency contract;
// array order and every JSON value remain significant.
const stableJson = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const equal = (left, right) => stableJson(left) === stableJson(right);
const requiredFiles = [
  'worker.cjs', 'lock.json', 'licenses/BGE-small-zh-v1.5-MIT.txt',
  'licenses/ONNXRuntime-MIT.txt', 'licenses/ONNXRuntime-ThirdPartyNotices.txt',
  'model/config.json', 'model/tokenizer.json', 'model/tokenizer_config.json', 'model/onnx/model_quantized.onnx',
  'node_modules/onnxruntime-node/package.json', 'node_modules/onnxruntime-node/dist/index.js',
  'node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node',
  'node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll',
  'node_modules/onnxruntime-node/bin/napi-v6/win32/x64/DirectML.dll',
  'node_modules/onnxruntime-node/bin/napi-v6/win32/x64/dxcompiler.dll',
  'node_modules/onnxruntime-node/bin/napi-v6/win32/x64/dxil.dll',
  'node_modules/onnxruntime-common/package.json',
  'node_modules/onnxruntime-common/dist/cjs/index.js', 'node_modules/onnxruntime-common/dist/cjs/package.json',
  'node_modules/@huggingface/tokenizers/package.json', 'node_modules/@huggingface/tokenizers/LICENSE',
  'node_modules/@huggingface/tokenizers/dist/tokenizers.cjs', 'node_modules/@huggingface/tokenizers/dist/tokenizers.mjs',
];

function safeRelative(relative) {
  return typeof relative === 'string' && /^[A-Za-z0-9_@.+/-]+$/.test(relative) && !relative.startsWith('/')
    && relative.split('/').every(part => part && part !== '.' && part !== '..');
}
function inside(root, relative) {
  if (!safeRelative(relative)) throw new Error('Unsafe embedding runtime path.');
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) throw new Error('Embedding runtime path escaped its root.');
  return absolute;
}
async function readSmallJson(filename) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MANIFEST_BYTES) throw new Error('Invalid embedding runtime metadata file.');
  const bytes = await fs.readFile(filename);
  return { value: JSON.parse(bytes.toString('utf8')), bytes };
}
async function readLock() {
  const { value: lock, bytes } = await readSmallJson(LOCK_PATH);
  if (lock.version !== 1 || lock.runtimeVersion !== EMBEDDING_RUNTIME_VERSION || lock.modelId !== EMBEDDING_MODEL_ID
    || lock.repository !== 'Xenova/bge-small-zh-v1.5' || lock.revision !== '75c43b069aac4d136ba6bc1122f995fedcfd2781'
    || !equal(lock.dependencies, DEPENDENCIES) || !Array.isArray(lock.files) || lock.files.length !== 4) throw new Error('Embedding model lock contract mismatch.');
  const names = new Set();
  for (const file of lock.files) {
    if (!safeRelative(file.path) || names.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_ASSET_BYTES) throw new Error('Invalid embedding model asset lock.');
    names.add(file.path.toLowerCase());
  }
  if (!['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'].every(name => names.has(name))) throw new Error('Embedding model asset lock is incomplete.');
  return { lock, bytes };
}
async function digestFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function records(root, excluded = new Set(['manifest.json'])) {
  const files = [];
  let totalBytes = 0;
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Embedding runtime root is not a regular directory.');
  async function walk(directory, relative = '') {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (!safeRelative(name) || entry.isSymbolicLink()) throw new Error('Unsafe embedding runtime entry: ' + name);
      const filename = inside(root, name);
      if (entry.isDirectory()) await walk(filename, name);
      else if (entry.isFile()) {
        if (excluded.has(name)) continue;
        const stat = await fs.lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Embedding runtime asset changed type: ' + name);
        totalBytes += stat.size;
        if (stat.size > MAX_ASSET_BYTES || totalBytes > MAX_RUNTIME_BYTES || files.length >= MAX_FILES) throw new Error('Embedding runtime asset budget exceeded.');
        files.push({ path: name, sha256: await digestFile(filename), bytes: stat.size });
      } else throw new Error('Non-file embedding runtime entry: ' + name);
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Hash/size installation integrity only. This never loads a model or native module. */
export async function verifyEmbeddingAssets(directory = EMBEDDING_ASSET_DIRECTORY) {
  const root = path.resolve(directory);
  const { lock, bytes } = await readLock();
  const { value: marker } = await readSmallJson(path.join(root, ASSET_MARKER));
  if (marker.version !== 1 || marker.modelId !== lock.modelId || marker.modelLockSha256 !== sha256(bytes)
    || !equal(marker.files, lock.files)) throw new Error('Embedding asset installation marker mismatch.');
  if (!equal(await records(root), lock.files)) throw new Error('Embedding model asset set or fingerprint mismatch.');
  return { path: root, modelId: lock.modelId, modelLockSha256: sha256(bytes), bytes: lock.files.reduce((sum, file) => sum + file.bytes, 0) };
}

function safeDestination(destination) {
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('Embedding runtime destination is required.');
  const root = path.resolve(destination);
  if (root === path.parse(root).root || root === PROJECT || PROJECT.startsWith(root + path.sep)
    || root === path.join(PROJECT, 'node_modules') || root.startsWith(path.join(PROJECT, 'node_modules') + path.sep)
    || root === path.dirname(LOCK_PATH) || root.includes('.asar' + path.sep)) throw new Error('Unsafe embedding runtime destination.');
  return root;
}
async function replaceDirectory(root, create, acceptsExisting, publishVerifiedStaging) {
  const parent = path.dirname(root);
  const move = async (source, destination) => {
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(source, destination); return; }
      catch (error) {
        if (process.platform !== 'win32' || !['EPERM', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
        console.warn(`Embedding runtime rename returned ${error.code}; retry ${attempt + 1}/5.`);
        await delay(500 * 2 ** attempt);
      }
    }
  };
  await fs.mkdir(parent, { recursive: true });
  if (await exists(root)) {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Embedding runtime destination is not a regular directory.');
    if ((await fs.readdir(root)).length && !(await acceptsExisting(root))) throw new Error('Refusing to replace an unrelated nonempty embedding directory.');
  }
  const staging = root + '.staging-' + randomUUID(), previous = root + '.previous-' + randomUUID();
  const cleanSibling = async target => {
    // Recursive cleanup is confined to this operation's checked, task-created sibling.
    const absolute = path.resolve(target);
    if ((absolute !== staging && absolute !== previous) || path.dirname(absolute) !== parent || !absolute.startsWith(root + '.')) throw new Error('Unsafe embedding runtime cleanup path.');
    await fs.rm(absolute, { recursive: true, force: true });
  };
  let movedPrevious = false, movedNew = false;
  try {
    await fs.mkdir(staging);
    const result = await create(staging);
    if (await exists(root)) { await move(root, previous); movedPrevious = true; }
    try { await move(staging, root); movedNew = true; }
    catch (error) {
      // A package can publish its verified, uniquely named resource by ref.
      // Fixed runtime locations still require the original atomic replacement.
      if (!publishVerifiedStaging || movedPrevious || movedNew || process.platform !== 'win32'
        || !['EPERM', 'EBUSY'].includes(error.code) || await exists(root) || !(await exists(staging))) throw error;
      return await publishVerifiedStaging(result, staging);
    }
    if (movedPrevious) await cleanSibling(previous);
    return result;
  } catch (error) {
    if (!movedNew && movedPrevious && !(await exists(root))) await move(previous, root);
    await cleanSibling(staging);
    throw error;
  }
}
function allowedAssetUrl(url) {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port
    && (url.hostname === 'huggingface.co' || url.hostname.endsWith('.huggingface.co') || url.hostname.endsWith('.hf.co'));
}
async function downloadAsset(url, filename, expected) {
  let current = new URL(url), response;
  for (let redirects = 0; redirects <= 8; redirects++) {
    if (!allowedAssetUrl(current)) throw new Error('Embedding asset redirect left the permitted HTTPS hosts.');
    response = await fetch(current, { redirect: 'manual', headers: { 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(180_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 8) throw new Error('Invalid embedding asset redirect.');
      current = new URL(location, current);
      continue;
    }
    break;
  }
  if (!response?.ok || !response.body) throw new Error('Embedding asset download failed: HTTP ' + response?.status);
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) !== expected.bytes)) {
    await response.body.cancel();
    throw new Error('Embedding asset HTTP size differs from its lock.');
  }
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const handle = await fs.open(filename, 'wx');
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > expected.bytes) throw new Error('Embedding asset exceeded its locked size.');
      hash.update(chunk);
      // FileHandle.write can be partial; writeFile consumes the whole supplied chunk.
      await handle.writeFile(chunk);
    }
    if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) throw new Error('Embedding asset size or SHA-256 mismatch: ' + expected.path);
    await handle.sync();
  } finally { await handle.close(); }
}

/** Explicit setup-time download only. Application runtime must never call this. */
export async function installEmbeddingAssets(options = {}) {
  const root = safeDestination(options.destination ?? EMBEDDING_ASSET_DIRECTORY);
  const { lock, bytes } = await readLock();
  if (await exists(root)) {
    try { return await verifyEmbeddingAssets(root); } catch { /* A marked previous installation may be replaced below. */ }
  }
  // Use the same explicit environment/manual Windows proxy route as the desktop
  // transport. This enables Node fetch proxy support; no port or secret is fixed.
  configureNetwork();
  const result = await replaceDirectory(root, async staging => {
    for (const file of lock.files) {
      const url = `https://huggingface.co/${lock.repository}/resolve/${lock.revision}/${file.path}`;
      await downloadAsset(url, inside(staging, file.path), file);
    }
    await fs.writeFile(path.join(staging, ASSET_MARKER), JSON.stringify({ version: 1, modelId: lock.modelId, modelLockSha256: sha256(bytes), files: lock.files }, null, 2) + '\n');
    return await verifyEmbeddingAssets(staging);
  }, async existing => {
    try { const { value } = await readSmallJson(path.join(existing, ASSET_MARKER)); return value.version === 1 && value.modelId === EMBEDDING_MODEL_ID; }
    catch { return false; }
  });
  return { ...result, path: root };
}

async function copyChecked(source, destination) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error('Embedding runtime source must not be a symlink.');
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const name of (await fs.readdir(source)).sort()) await copyChecked(path.join(source, name), path.join(destination, name));
  } else if (stat.isFile()) {
    if (stat.size > MAX_ASSET_BYTES) throw new Error('Embedding runtime source file exceeds budget.');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  } else throw new Error('Embedding runtime source is not a regular file/directory.');
}

/** Verify the precise staged file set. This establishes integrity, not inference compatibility. */
export async function verifyEmbeddingRuntime(ref) {
  if (!ref || ref.required !== true || typeof ref.path !== 'string' || !path.isAbsolute(ref.path)
    || !['manifestSha256', 'workerSha256', 'assetLockSha256', 'modelLockSha256'].every(key => /^[a-f0-9]{64}$/.test(ref[key]))) throw new Error('Invalid embedding runtime reference.');
  const root = path.resolve(ref.path);
  const { value: manifest, bytes } = await readSmallJson(path.join(root, 'manifest.json'));
  const { lock, bytes: lockBytes } = await readLock();
  if (sha256(bytes) !== ref.manifestSha256 || manifest.version !== 1 || manifest.runtimeVersion !== EMBEDDING_RUNTIME_VERSION
    || manifest.modelId !== EMBEDDING_MODEL_ID || manifest.platform !== 'win32' || manifest.arch !== 'x64'
    || !equal(manifest.dependencies, DEPENDENCIES) || manifest.worker?.path !== 'worker.cjs'
    || manifest.worker.sha256 !== ref.workerSha256 || manifest.modelLockSha256 !== sha256(lockBytes)
    || ref.modelLockSha256 !== manifest.modelLockSha256 || !Array.isArray(manifest.files)
    || !manifest.files.length || manifest.files.length > MAX_FILES || sha256(JSON.stringify(manifest.files)) !== ref.assetLockSha256) throw new Error('Embedding runtime manifest contract mismatch.');
  const names = new Set();
  for (const file of manifest.files) {
    if (!file || !safeRelative(file.path) || names.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_ASSET_BYTES) throw new Error('Invalid embedding runtime asset record.');
    inside(root, file.path); names.add(file.path.toLowerCase());
  }
  for (const name of requiredFiles) if (!names.has(name.toLowerCase())) throw new Error('Required embedding runtime asset missing: ' + name);
  const actual = await records(root);
  if (!equal(actual, manifest.files) || actual.find(file => file.path === 'worker.cjs')?.sha256 !== ref.workerSha256
    || actual.find(file => file.path === 'lock.json')?.sha256 !== sha256(lockBytes)) throw new Error('Embedding runtime asset set or fingerprint mismatch.');
  for (const file of lock.files) {
    const present = actual.find(record => record.path === 'model/' + file.path);
    if (present?.sha256 !== file.sha256 || present.bytes !== file.bytes) throw new Error('Embedding runtime model differs from fixed asset lock.');
  }
  for (const file of lock.runtimeLicenseFiles ?? []) {
    const present = actual.find(record => record.path === file.path);
    if (present?.sha256 !== file.sha256 || present.bytes !== file.bytes) throw new Error('Embedding runtime notice differs from fixed upstream text.');
  }
  for (const [name, version] of Object.entries(DEPENDENCIES)) {
    const { value: pkg } = await readSmallJson(inside(root, 'node_modules/' + name + '/package.json'));
    if (pkg.name !== name || pkg.version !== version) throw new Error('Embedding runtime dependency version mismatch.');
  }
  return ref;
}

/** Stage project-owned packages and an already installed model into an asar-external resource. */
export async function stageEmbeddingRuntime(destination, options = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The pinned embedding runtime currently supports Windows x64 only.');
  const root = safeDestination(destination);
  if (root === EMBEDDING_ASSET_DIRECTORY || root.startsWith(EMBEDDING_ASSET_DIRECTORY + path.sep)
    || EMBEDDING_ASSET_DIRECTORY.startsWith(root + path.sep)) throw new Error('Embedding staging must be separate from the installed model.');
  if (options.immutableResource && await exists(root)) throw new Error('Immutable embedding resource destination already exists.');
  const { lock, bytes: lockBytes } = await readLock();
  await verifyEmbeddingAssets();
  return await replaceDirectory(root, async staging => {
    await fs.writeFile(path.join(staging, 'lock.json'), lockBytes);
    for (const file of lock.files) await copyChecked(inside(EMBEDDING_ASSET_DIRECTORY, file.path), inside(staging, 'model/' + file.path));
    for (const name of ['BGE-small-zh-v1.5-MIT.txt', 'ONNXRuntime-MIT.txt', 'ONNXRuntime-ThirdPartyNotices.txt']) {
      await copyChecked(path.join(PROJECT, 'licenses', name), path.join(staging, 'licenses', name));
    }
    for (const [name, version] of Object.entries(DEPENDENCIES)) {
      const source = path.join(PROJECT, 'node_modules', name);
      const { value: pkg } = await readSmallJson(path.join(source, 'package.json'));
      if (pkg.name !== name || pkg.version !== version) throw new Error('Installed embedding production dependency is not pinned: ' + name);
      const target = path.join(staging, 'node_modules', name);
      const selected = name === 'onnxruntime-node'
        ? ['package.json', 'dist', 'bin/napi-v6/win32/x64']
        : name === 'onnxruntime-common' ? ['package.json', 'dist'] : ['package.json', 'LICENSE', 'dist'];
      for (const relative of selected) await copyChecked(path.join(source, relative), path.join(target, relative));
    }
    await copyChecked(path.join(PROJECT, 'dist-electron/embedding-worker.cjs'), path.join(staging, 'worker.cjs'));
    const files = await records(staging);
    const workerSha256 = files.find(file => file.path === 'worker.cjs').sha256;
    const modelLockSha256 = sha256(lockBytes);
    const manifest = { version: 1, runtimeVersion: EMBEDDING_RUNTIME_VERSION, modelId: EMBEDDING_MODEL_ID,
      platform: 'win32', arch: 'x64', modelLockSha256, dependencies: DEPENDENCIES,
      worker: { path: 'worker.cjs', sha256: workerSha256 },
      licenseNote: 'Original BGE MIT basis and fixed export attribution, plus upstream ONNX Runtime 1.30.0 MIT and complete third-party notices, are in licenses. The original HF tokenizer Apache-2.0 notice is retained beside its package.', files };
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('Embedding runtime manifest exceeds budget.');
    await fs.writeFile(path.join(staging, 'manifest.json'), manifestBytes);
    const ref = { required: true, path: root, manifestSha256: sha256(manifestBytes), workerSha256,
      assetLockSha256: sha256(JSON.stringify(files)), modelLockSha256 };
    await verifyEmbeddingRuntime({ ...ref, path: staging });
    return ref;
  }, async existing => {
    try { const { value } = await readSmallJson(path.join(existing, 'manifest.json')); return value.version === 1 && value.runtimeVersion === EMBEDDING_RUNTIME_VERSION && value.worker?.path === 'worker.cjs'; }
    catch { return false; }
  }, options.immutableResource ? async (ref, verifiedPath) => {
    const published = { ...ref, path: verifiedPath };
    await verifyEmbeddingRuntime(published);
    console.warn('Publishing the fully verified embedding resource at its immutable staging path.');
    return published;
  } : undefined);
}
