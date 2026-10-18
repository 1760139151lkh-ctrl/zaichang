# Map deployment

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

For the full product, follow `README.md` and the existing CI gates: `npm run setup`, `npm run build`, `npm test`, `npm run test:hermes`, and the Windows desktop/PDF checks when applicable. The current CI definition is `.github/workflows/ci.yml`; this document does not report a new execution of those commands.

`npm run package` builds, runs `scripts/stage-hermes-runtime.mjs`, then invokes electron-builder with `build/hermes-builder.json` for Windows x64. Staging checks the pinned Hermes commit and recorded patch hashes, copies selected Git-tracked runtime sources and a relocatable Python runtime, stages the hash-locked PDF/canvas resources, and writes local build reports. These desktop resources, model transport and personal-data stores are excluded from the static Site. Staging is not a mobile/always-on service deployment, and packaged desktop artwork must satisfy the separate provenance boundary in [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md).

