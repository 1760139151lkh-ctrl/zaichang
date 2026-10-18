import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  base: './',
  optimizeDeps: { entries: ['index.html'] },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    watch: { ignored: ['**/.test-data/**', '**/.runtime/**', '**/output/**', '**/release/**', '**/dist-electron/**', '**/dist-review/**', '**/前端视觉创新设计/**'] },
  },
});
