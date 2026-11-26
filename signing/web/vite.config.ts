import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `pnpm dev` serves the pages on 5173 and passes API calls to `latex-kit-sign serve` on 8787.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
