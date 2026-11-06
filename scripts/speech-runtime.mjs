import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { configureNetwork } from '../src/main/network.ts';

// Stages the local voice-input runtime: the recognizer process, sherpa-onnx's native
// libraries, detector and verified model. A shipped app never downloads on first use.
const PROJECT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOCK_PATH = path.join(PROJECT, 'runtime/speech/lock.json');
const VAD_SOURCE = path.join(PROJECT, 'runtime/speech/vad/silero_vad.onnx');
const WORKER_SOURCE = path.join(PROJECT, 'dist-electron/speech-worker.cjs');
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = filename => fs.access(filename).then(() => true, () => false);

async function digestFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function readLock() {
  const lock = JSON.parse(await fs.readFile(LOCK_PATH, 'utf8'));
  if (lock.version !== 1 || !lock.dependencies?.['sherpa-onnx-node'] || !Array.isArray(lock.bundled) || lock.bundled.length !== 1)
    throw new Error('Speech runtime lock contract mismatch.');
  return lock;
}

/** Only an incomplete build checkout needs the pinned public model sources. */
async function prepareModels(lock) {
  const directory = path.join(PROJECT, 'runtime/speech/model');
  for (const file of lock.download) {
    const target = path.resolve(directory, file.path);
    if (!target.startsWith(directory + path.sep)) throw new Error('Speech model path escaped its root.');
    if (await exists(target) && (await fs.stat(target)).size === file.bytes && await digestFile(target) === file.sha256) continue;
    configureNetwork();
    await fs.mkdir(path.dirname(target), { recursive: true });
    const part = target + '.part';
    let complete = false;
    for (const source of file.sources) {
      try {
        let address = source, response;
        const signal = AbortSignal.timeout(180_000);
        for (let hops = 0; hops <= 6; hops++) {
          const url = new URL(address);
          if (url.protocol !== 'https:' || url.username || url.password || url.port
            || !lock.hosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) throw new Error('Unapproved speech model host.');
          response = await fetch(address, { redirect: 'manual', credentials: 'omit', cache: 'no-store', signal });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) throw new Error('Speech model redirect is incomplete.');
          address = new URL(location, address).toString();
        }
        if (!response?.ok || !response.body) throw new Error('Speech model download failed.');
        let bytes = 0;
        const limit = new Transform({ transform(chunk, _encoding, next) {
          bytes += chunk.length;
          next(bytes > file.bytes ? new Error('Speech model exceeds its locked size.') : null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(part), { signal });
        if (bytes !== file.bytes || await digestFile(part) !== file.sha256) throw new Error('Speech model differs from its lock.');
        await fs.rm(target, { force: true });
        await fs.rename(part, target);
        complete = true;
        break;
      } catch { await fs.rm(part, { force: true }); }
    }
    if (!complete) throw new Error('Could not prepare the bundled speech model: ' + file.path);
  }
  return directory;
}
function safeDestination(destination) {
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('Speech runtime destination is required.');
  const root = path.resolve(destination);
  if (root === path.parse(root).root || root === PROJECT || PROJECT.startsWith(root + path.sep)
    || root === path.join(PROJECT, 'node_modules') || root.startsWith(path.join(PROJECT, 'node_modules') + path.sep)
    || root.includes('.asar' + path.sep)) throw new Error('Unsafe speech runtime destination.');
  return root;
}
async function readPackage(name) {
  const source = path.join(PROJECT, 'node_modules', name);
  const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  return { source, pkg };
}
async function listFiles(root, relative = '') {
  const found = [];
  for (const entry of (await fs.readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Speech runtime source must not contain symlinks: ' + name);
    if (entry.isDirectory()) found.push(...await listFiles(root, name));
    else if (entry.isFile()) found.push(name);
  }
  return found;
}

/** Copy only when the bytes differ, so a running dev instance that holds the DLLs open is not disturbed. */
async function place(source, destination) {
  const info = await fs.lstat(source);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) throw new Error('Unexpected speech runtime source: ' + source);
  if (await exists(destination) && (await fs.stat(destination)).size === info.size && await digestFile(destination) === await digestFile(source)) return false;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  return true;
}

/** Stage the speech runtime into an asar-external folder. Windows x64 only for now. */
export async function stageSpeechRuntime(destination) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The pinned speech runtime currently supports Windows x64 only.');
  const root = safeDestination(destination);
  const lock = await readLock();
  if (!await exists(WORKER_SOURCE)) throw new Error('Build the desktop JavaScript first: dist-electron/speech-worker.cjs is missing.');
  if (!await exists(VAD_SOURCE)) throw new Error('runtime/speech/vad/silero_vad.onnx is missing.');
  const [vad] = lock.bundled;
  if (await digestFile(VAD_SOURCE) !== vad.sha256) throw new Error('The voice detector differs from runtime/speech/lock.json.');

  const plan = [[WORKER_SOURCE, 'worker.cjs'], [VAD_SOURCE, vad.path], [LOCK_PATH, 'lock.json']];
  const modelDirectory = await prepareModels(lock);
  for (const file of lock.download) plan.push([path.join(modelDirectory, file.path), 'model/' + file.path]);
  for (const [name, version] of Object.entries(lock.dependencies)) {
    const { source, pkg } = await readPackage(name);
    if (pkg.name !== name || pkg.version !== version) throw new Error(`Installed ${name} is ${pkg.version}, but the speech lock pins ${version}.`);
    for (const file of await listFiles(source)) plan.push([path.join(source, file), `node_modules/${name}/${file}`]);
  }
  for (const name of ['SenseVoice-model-FunASR-1.1.txt', 'Silero-VAD-MIT.txt', 'sherpa-onnx-Apache-2.0.txt']) {
    const license = path.join(PROJECT, 'licenses', name);
    if (!await exists(license)) throw new Error('Speech runtime license is missing: ' + name);
    plan.push([license, `licenses/${name}`]);
  }
  for (const notice of lock.nativeRuntimeNotices || []) {
    const source = path.join(PROJECT, notice.path);
    if (!await exists(source) || await digestFile(source) !== notice.sha256) throw new Error('Speech native-runtime notice differs from its lock: ' + notice.path);
    plan.push([source, 'licenses/' + path.basename(notice.path)]);
  }

  let changed = 0;
  const files = [];
  for (const [source, relative] of plan) {
    const destinationFile = path.join(root, relative);
    if (!destinationFile.startsWith(root + path.sep)) throw new Error('Speech runtime path escaped its root.');
    if (await place(source, destinationFile)) changed++;
    files.push({ path: relative, bytes: (await fs.stat(destinationFile)).size, sha256: await digestFile(destinationFile) });
  }
  const manifest = { version: 1, runtimeVersion: lock.runtimeVersion, platform: 'win32', arch: 'x64', dependencies: lock.dependencies,
    licenseNote: 'Includes SenseVoiceSmall (FunASR Model Open Source License 1.1), sherpa-onnx (Apache-2.0), Silero VAD (MIT), and ONNX Runtime (MIT and bundled third-party notices). See licenses and THIRD_PARTY_NOTICES.md.', files };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const manifestFile = path.join(root, 'manifest.json');
  if (!await exists(manifestFile) || sha256(await fs.readFile(manifestFile)) !== sha256(manifestBytes)) await fs.writeFile(manifestFile, manifestBytes);
  return { path: root, changed, files: files.length, manifestSha256: sha256(manifestBytes) };
}
