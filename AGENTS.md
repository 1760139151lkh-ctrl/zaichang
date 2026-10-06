# Zaichang repository rules
Read README.md, PROJECT_NAVIGATION.md, docs/CURRENT_STATUS.md; use docs/CLOUD_REVIEW.md for browser review and docs/PRODUCT_CONTRACT.md for map/product changes.

- src/ is the sole product implementation. Desktop and apps/review-web share src/renderer/map, src/main/mapService.ts, src/shared/map-routing.ts and assets/map-v2. Never create a second map implementation.
- Keep the existing warm gray/gold, transparent spatial map and real camera controls. The old 2D-only/absolute neutral-gray requirements are obsolete.
- Do not upload keys, cookies, accounts, .env, personal memories, databases, profiles, device coordinates, research/chat bundles, logs, generated builds, videos or reference images. Only explicitly reviewed, redistributable assets may enter Git or deployment.
- Before committing inspect the tracked file set, size, local paths, secrets and asset provenance. Build artifacts are disposable and ignored. Stage explicit files; do not bulk-add the old workspace.
- Review only deploys the public map. Never connect it to desktop data, credentials, model services or the university account. Browser storage must refuse all files outside the selected public map set.
- Changes to maps require actual overview, top-down, oblique, route and building-focus checks. Test pan/zoom/rotation, interrupted camera movement and a realistic no-WebGL fallback when changing those paths. Few screenshots; no repeated recordings or enormous visual regression infrastructure.
- Harness, memory and action results require source/permission/version checks and real receipts. Distinguish deterministic mechanism checks, live model/service results and unknowns. Do not re-label simulations as production success.
- Production DeepSeek model/transport policy resides in src/shared/model-contract.json. Change it only with explicit authorization and current official contract verification. Hermes is pinned by runtime/hermes/lock.json; keep host permissions, budgets and storage authoritative.
- Update PROJECT_NAVIGATION.md when entry points, responsibilities or build/deploy structure change. Update docs/CLOUD_REVIEW.md when scenes, URLs or browser/desktop differences change. Update product/status documentation for actual behavior or architecture changes, not routine work narration.
- Retain current sources and recovery notes locally through substantial work; follow the user's context policy. Do not put local notes or pasted prompts into the remote repository.
