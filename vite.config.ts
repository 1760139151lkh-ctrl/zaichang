import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mapEngineLoader } from './scripts/map-engine-loader';
export default defineConfig({
  plugins: [react(), mapEngineLoader()],
  publicDir: false,
  base: './',
  optimizeDeps: { entries: ['index.html'] },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    watch: { ignored: ['**/.test-data/**', '**/.test-build/**', '**/.runtime/**', '**/output/**', '**/release/**', '**/dist-electron/**', '**/dist-review/**', '**/build/**', '**/artifacts/**', '**/work/**',
      '**/前端视觉创新设计/分类总库/04-来源与制作记录/来源记录/**', '**/前端视觉创新设计/分类总库/03-补充设计稿/补充图稿/**', '**/前端视觉创新设计/分类总库/06-过程核对/仅本机/**'] },
  },
});
