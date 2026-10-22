# Map deployment

2026-10-21 local continuation: see [PROJECT_BASELINE](PROJECT_BASELINE.md) and [current evidence](CURRENT_STATUS.md#deep-refactor-20261021). The 2026-10-19 [source synchronization](CURRENT_STATUS.md#repository-sync-20261019) and the release/public-deployment records below retain their own revisions. Editing or pushing source does not rebuild the recorded Windows executable or publish the Sites map. The product version remains 0.3.0; this continuation has not published a new EXE or Site.

The repository is the canonical implementation. `apps/review-web/main.tsx` builds only the shared public map, using `src/main/mapService.ts` and `src/renderer/map/`; a hosting artifact is a generated copy, not another product implementation. Desktop conversation scenes also use this map, but their OpenUI layer, weather scenes, notes, plans, persona settings and companion images belong to the desktop entry and are not review-web features.

The recorded publication is [the Sites map](https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/). Its project identity is in `apps/review-web/hosting.json`. This URL and the historical checks in [CLOUD_REVIEW.md](CLOUD_REVIEW.md) do not establish that the current checkout has been deployed. No deployment is performed by editing these documents or running a local build.

GitHub Pages activation was previously rejected for this private repository under the account plan used then; account eligibility has not been rechecked here. `.github/workflows/pages.yml` remains opt-in: its build job requires repository variable `ENABLE_GITHUB_PAGES` to equal `true` and either a successful CI workflow run or manual dispatch. Do not change repository visibility to enable the preview.

## Prepare and inspect the public artifact

Use the Node/npm versions in `.nvmrc` and `package.json`. A map-only local build needs no Hermes installation, model key or university account:

```sh
npm ci
npm run check
npm run build:review
node scripts/check-review.mjs
npm run preview
```

`npm run review` serves development at `http://127.0.0.1:5174`; `npm run preview` serves `dist-review` at `http://127.0.0.1:4173`. Exercise the five scenes and relevant camera, route and graphics-fallback behavior described in [CLOUD_REVIEW.md](CLOUD_REVIEW.md). A file inspection or successful build does not replace that review.

`vite.review.config.ts` emits exactly these ten public map inputs: `manifest.json`, `places.json`, `network.json`, `geography.geojson`, `display-geography.geojson`, `sports-details.geojson`, `shared-facts.json`, `venues.json`, `building-supplement.json` and `source.osm.json.gz`. The first nine are losslessly gzipped; the existing source archive stays gzipped. The browser storage adapter preloads only the nine runtime JSON/GeoJSON files and refuses every other file; the source archive is supplied separately for source/attribution access. The build also includes the selected map/software notices and assets reached from this entry, including packaged Noto fonts.

`scripts/check-review.mjs` rejects unexpected top-level/map/license files, symlinks, personal place overlays and specified private-integration/credential patterns. Its `assets/` allowance does not certify an image's provenance or prove the absence of every secret. Before release inspect the exact exported file set, asset rights, source/deployed hashes and any changed import graph. Do not copy desktop `dist`, a profile, `.runtime`, test evidence, logs or reference images into review-web.

After those checks, `npm run export:review` runs the public-artifact inspection again and copies `dist-review` into a fresh ignored `work/review-site-*` checkout containing `dist` and `.openai/hosting.json`. It neither builds the map nor publishes it. Use the installed Sites workflow and its current instructions on that checkout when deployment is authorized; keep credentials out of Git, files, arguments and logs. Preserve the exact deployment artifact/source identity, then confirm hosting success and operate the actual published scenes before updating publication evidence.

The earlier Windows hosting run used Git Bash and `TAR_OPTIONS=--force-local` to avoid WSL selection and drive letters being interpreted as remote archive hosts. This is a historical packaging workaround, not evidence about the currently installed hosting tool.

## Desktop packaging is separate

For the full product, follow `README.md` and the existing CI gates: `npm run setup`, `npm run build`, `npm test`, `npm run test:hermes`, and the Windows desktop/PDF checks when applicable. The current CI definition is `.github/workflows/ci.yml`; the dated release record below identifies the checks actually run.

These are the normal release procedures. Later direct requests authorized current local builds, real Luna conversations and connected-campus read-only checks; the early 2026-10-18 postponement is historical. Actual commands and results belong to [CURRENT_STATUS](CURRENT_STATUS.md#deep-refactor-20261021), rather than inheriting the older release checks below.

`npm run package` builds, runs `scripts/stage-hermes-runtime.mjs`, then invokes electron-builder with `build/hermes-builder.json` for Windows x64. Staging checks the pinned Hermes commit and recorded patch hashes, copies selected Git-tracked runtime sources and a relocatable Python runtime, stages the hash-locked PDF/canvas and local embedding resources, and writes local build reports. These desktop resources, model transport and personal-data stores are excluded from the static Site. Staging is not a mobile/always-on service deployment, and packaged desktop artwork must satisfy the separate provenance boundary in [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md).

Current local staging completed on 2026-10-21 with the current sidecar and relocatable Python. Windows repeatedly returned EPERM when renaming a fully verified embedding resource directory. Only the packaging call enables `immutableResource`: its destination must initially be absent, and only that operation's unchanged, fully reverified staging directory can be returned after bounded EPERM/EBUSY retries. The builder copies the returned path into `resources/embedding-runtime`; the packaged app does not depend on the build directory. Ordinary fixed-location installation/build replacement retains its atomic replacement and rollback. Staging integrity alone is not packaged launch, model inference or a published release.

### Fifth local-memory backend increment: embedding installation and distribution

`scripts/setup-desktop.mjs`, invoked explicitly by `npm run setup`, now calls the setup-only installer in `scripts/embedding-runtime.mjs`. Its source of truth is [runtime/embedding/lock.json](../runtime/embedding/lock.json): `Xenova/bge-small-zh-v1.5` revision `75c43b069aac4d136ba6bc1122f995fedcfd2781`, q8, with exactly `config.json`, `tokenizer.json`, `tokenizer_config.json` and `onnx/model_quantized.onnx`. These four files total **24,451,050 bytes**. Setup uses the project's existing explicit environment/manual Windows proxy policy, downloads only the fixed files, checks every locked size and SHA-256, and installs under `runtime/embedding/model` through a staging directory and atomic directory replacement. An already matching installation can be reused. Application runtime has no Hub client, automatic download or network model fallback; a missing or unusable local runtime leaves existing lexical, scan and browse retrieval available.

The desktop build emits `dist-electron/embedding-worker.cjs` and stages the worker, model and project-owned runtime dependencies under `dist-electron/embedding-runtime`. Packaging stages the same layout as **`resources/embedding-runtime` outside `app.asar`**; its packaged worker is `worker.cjs`, with the four assets under `model/`. The pinned dependencies are `onnxruntime-node@1.30.0`, `onnxruntime-common@1.30.0` and `@huggingface/tokenizers@0.2.0`. Inference is assigned to the host-owned CPU worker, not another agent, Python process or model service. ORT's original `node_modules/onnxruntime-node/bin/napi-v6/win32/x64` layout retains `onnxruntime_binding.node`, `onnxruntime.dll`, `DirectML.dll`, `dxcompiler.dll` and `dxil.dll`; keeping those shipped DLLs does not select a GPU execution provider. CommonJS package boundaries and runtime JavaScript are retained alongside the native files. The resource manifest records the worker, model-lock and complete file-set fingerprints; installation/staging integrity checks do not establish native loading or inference compatibility.

The resource includes the original BGE MIT basis and fixed Xenova export attribution, plus upstream ORT 1.30.0 MIT and complete third-party notices in `licenses/`; the tokenizer's original Apache-2.0 text remains beside its package. The export repository has no separate license file, so its attribution is preserved without claiming an additional Xenova license. Development needs the explicit setup and a subsequent desktop build to produce the current worker/resources. The public review map entry does not import or distribute this worker, its inference dependencies or the model weights; its ten-file map artifact contract above is unchanged.

**Historical evidence at the fifth increment:** pinned npm dependencies were installed with lifecycle scripts disabled, and the explicit four-file model installation completed. The first installer attempt reported a manifest mismatch because object insertion order differed between `{path, sha256, bytes}` and `{path, bytes, sha256}`. The script now compares recursively ordered object keys while preserving array order and all values; the second installation succeeded with the original size/hash/file requirements intact. At that stage there was no desktop build, resource staging, package creation, native-module/model load, inference, UI or Luna validation for the increment, so independent distribution had not been accepted as runnable. Later local staging is recorded separately above; the older v0.3.0 artifact below does not include or validate these later source changes.

<a id="latest-windows-release"></a>
## Latest Windows desktop release

The latest desktop release is [v0.3.0](https://github.com/1760139151lkh-ctrl/zaichang/releases/tag/v0.3.0), built on 2026-10-18 from `74e099a2a3e23d0e7fffb075a1c1e22727976004`. [Latest release](https://github.com/1760139151lkh-ctrl/zaichang/releases/latest) is the stable download entry. Its assets are `Zaichang-0.3.0-Windows.exe` and `SHA256SUMS.txt`; binaries are Release assets rather than Git source blobs. This private repository requires repository access to download them.

The Windows x64 portable EXE includes the pinned Hermes 0.21.2 runtime, Python 3.13.14 and the hash-locked PDF/canvas runtime. It runs without this checkout, a system Python installation or Codex. Model credentials and optional campus connectors remain configured separately through their existing private paths; user databases, credentials and local diagnostic evidence are not release assets.

The exact local packaging command was:

```sh
npm run package -- --config.directories.output=release/zaichang-0.3.0-20261018-74e099a
```

The EXE and `win-unpacked/` are under that ignored output directory. The portable launcher expands its bundled resources at startup, which took several minutes on this Windows host; the local `win-unpacked/在场.exe` launches directly. The original default output and existing desktop shortcuts are unchanged. `v0.3.0` identifies the actual built source commit; later documentation-only commits do not change that artifact identity.

Validation on this Windows checkout: type check, desktop/review build, 141 existing mechanism checks, 9 Hermes checks, public-artifact inspection, isolated Electron startup/map/memory entry and native PDF text/JPEG checks all passed. The packaged `app.asar` program also opened its home screen and the shared map (`campus-v3-f86b9ec6a26fb2b2`) with no page errors using an isolated profile. One existing host-tool Hermes check ran against the bundled runtime, and PDF describe/read/render ran against the bundled material runtime. The final portable EXE completed self-extraction, opened its home screen with another isolated profile and closed normally. These packaging checks did not call a real model or campus account, reaccept every frontend workflow, update the old desktop shortcut, or publish a new map Site.

