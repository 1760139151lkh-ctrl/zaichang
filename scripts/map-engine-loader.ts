import path from 'node:path';
import { normalizePath, type Plugin } from 'vite';

const publicId = 'virtual:zaichang-map-engine-url';
const virtualId = '\0' + publicId;
const engineId = normalizePath(path.resolve(import.meta.dirname, '../src/renderer/map/map-engine.ts'));

/** Keep one compiled engine entry, while allowing a failed fetch to be retried
 * under a fresh URL without reloading the workspace. */
export function mapEngineLoader(): Plugin {
  let development = false;
  let reference: string | undefined;
  return {
    name: 'zaichang-map-engine-loader',
    configResolved(config) { development = config.command === 'serve'; },
    buildStart() { reference = undefined; },
    resolveId(id) { if (id === publicId) return virtualId; },
    load(id) {
      if (id !== virtualId) return;
      if (development) return `export default ${JSON.stringify('/@fs/' + engineId)};`;
      reference ??= this.emitFile({ type: 'chunk', id: engineId, name: 'map-engine', preserveSignature: 'strict' });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
    generateBundle(_options, bundle) {
      if (!reference) return;
      const engine = bundle[this.getFileName(reference)];
      const host = Object.values(bundle).find(chunk => chunk.type === 'chunk' && virtualId in chunk.modules);
      if (engine?.type !== 'chunk' || host?.type !== 'chunk')
        this.error('校园地图的载入入口没有完整生成。');
      const available = new Set<string>();
      const availableCss = new Set<string>();
      const styles = (chunk: object) => (chunk as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss;
      const collect = (file: string) => {
        if (available.has(file)) return;
        available.add(file);
        const chunk = bundle[file];
        if (chunk?.type === 'chunk') {
          for (const css of styles(chunk) || []) availableCss.add(css);
          for (const dependency of chunk.imports) collect(dependency);
        }
      };
      collect(host.fileName);
      // A fresh entry URL cannot repair a failed dependency URL. Every engine
      // dependency must already be loaded with the surface that requests it.
      for (const dependency of engine.imports) {
        if (!available.has(dependency))
          this.error('校园地图新增了尚未随界面载入的程序，请先调整分块再构建。');
      }
      const engineCss = styles(engine);
      if (!engineCss) this.error('校园地图的样式载入信息没有完整生成。');
      for (const css of engineCss) {
        if (!availableCss.has(css)) this.error('校园地图的样式需要随界面载入，再构建地图程序。');
      }
    },
  };
}
