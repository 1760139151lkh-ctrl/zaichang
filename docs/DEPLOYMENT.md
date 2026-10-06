# Map deployment
The GitHub repository is the canonical implementation. The Site is a public static build of that implementation; its private artifact-source storage is not a second product implementation.

GitHub Pages activation was rejected for this private repository by the current account plan. The workflow remains disabled unless ENABLE_GITHUB_PAGES=true is explicitly configured for an eligible account. Keep the main repository private.

Current host: Sites, project identity in apps/review-web/hosting.json. Live map:
https://zaichang-campus-review-20261006.sugary-loom-6961.chatgpt.site/

To prepare a new reviewed deployment:
1. npm ci; npm run check; npm run build; npm test; npm run test:hermes.
2. On Windows run node scripts/desktop-smoke.mjs and node scripts/pdf-smoke.mjs.
3. npm run export:review. It verifies the public artifact and returns a fresh, ignored static checkout with dist and .openai/hosting.json.
4. Use the installed Sites hosting workflow on that static checkout. Mint a temporary credential for the same project ID, pass it through hidden stdin, save the exact pushed artifact-source SHA with its verified archive, and deploy the saved version publicly. Never put the credential in Git, files, arguments or logs.
5. On Windows select Git Bash for that process and TAR_OPTIONS=--force-local; the bundled packager otherwise can select WSL or interpret a drive letter as a remote archive host.
6. Confirm native deployment success, then verify the requested real scenes and update CLOUD_REVIEW.md if behavior/URLs changed.

Only index, hashed assets, losslessly compressed public map data and required licenses enter the static archive. Assistant code, accounts, keys, memories, private locations, databases, logs and recordings are excluded. No connector or runtime secret is needed for this Site.

