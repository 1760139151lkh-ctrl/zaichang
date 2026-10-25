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
    watch: { ignored: ['**/.test-data/**', '**/.test-build/**', '**/.runtime/**', '**/output/**', '**/release/**', '**/dist-electron/**', '**/dist-review/**',
      '**/前端视觉创新设计/来源记录/**', '**/前端视觉创新设计/补充图稿/**', '**/前端视觉创新设计/仅本机/**'] },
  },
});
