import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  // In dev, Vite serves the app on 4200 (the project's port) and sends /api to the Bun server on 4201.
  server: { port: 4200, strictPort: true, proxy: { '/api': 'http://localhost:4201' } },
  build: { outDir: 'dist', target: 'es2022' },
});
