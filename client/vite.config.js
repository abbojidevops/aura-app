import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build output goes to client/dist, which the Express server serves in production.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '0.0.0.0', port: 5173, proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } } },
});
