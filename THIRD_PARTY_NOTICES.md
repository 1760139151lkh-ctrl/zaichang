# Third-party notices
Third-party licenses apply to their own packages/data, not to the project as an open-source grant.

- OpenStreetMap database/derivatives: ODbL 1.0; licenses/ODbL-1.0.txt, visible attribution and included sanitized source.
- MapLibre GL JS: BSD-3-Clause; OpenLayers: BSD-2-Clause; corresponding notices in licenses/.
- MapLibre Style Spec and Earcut are also direct rendering dependencies; their shipped notices are retained in licenses/MapLibre-Style-Spec.txt and licenses/Earcut-ISC.txt and included in the public build.
- Noto Sans SC: SIL OFL 1.1; licenses/NotoSansSC-OFL.txt.
- Lucide: ISC; React and ReactDOM: MIT; @noble/hashes: MIT. The public-map build copies their installed package notices into its selected licenses directory; the source font/map notices remain in licenses/.
- OpenUI React Lang 1.0.1 and its OpenUI runtime dependencies: MIT, Thesys Inc.; installed upstream notice retained verbatim in licenses/OpenUI-MIT.txt. Used by desktop conversation scenes, not the public map bundle.
- KaTeX / remark-math / rehype-katex: MIT; included notices. Font assets are locally bundled.
- PDFJS: Apache-2.0; canvas: MIT; runtime staging retains original CMap/font/WASM/ICC and embedded notices.
- Hermes Agent 0.21.2 at runtime/hermes/lock.json commit d595e636c83aa0b9606d4e914e1140ae9c796897: MIT; downloaded separately with frozen uv.lock and recorded host adaptations. Windows staging verifies the commit/patch hashes and selects tracked runtime source; Python and PDF/canvas notices are retained with the separate packaged runtime resources. These runtimes are excluded from the public map artifact.
- osmtogeojson: MIT; development-only data transformation.

Official guide images, map tiles/screenshots, upstream website scripts/tokens, raw WFS/locator dumps and user profile data are not included. The public place facts and project-created map geometry retain traceable factual sources without copying restricted visual assets. Optional university connector remains separately installed; it is not redistributed here.

The six default companion PNGs imported from `src/renderer/assets/companion/` are separate desktop artwork. Retained local records identify `GPT Image (built-in)` generation on 2026-10-18; SHA-256 comparison matched all six product PNGs to their recorded outputs and named local assets. This generation evidence does not establish ownership, input-reference rights or redistribution approval, and none of the software/data licenses above grants rights to those images. Complete that separate rights review before desktop redistribution. User-selected companion pictures remain local user data, not licensed distributable assets. See [docs/ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md) for file identities and the exact boundary; prompts, private paths and the design/chat bundle remain local. Original third-party license texts in `licenses/` are not modified by these notices.
