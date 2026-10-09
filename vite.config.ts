import { defineConfig } from 'vite';

export default defineConfig({
  // Aset runtime hanya dari lokal (public/), tidak ada CDN.
  server: {
    host: false,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
