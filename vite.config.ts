import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  // In dev, Vite serves the frontend on 5173 and sends /api to the Bun server on 3000.
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist', target: 'es2022' },
});
