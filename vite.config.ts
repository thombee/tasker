import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Inline all JS/CSS into index.html: module scripts are always fetched in
  // CORS mode, which file:// (Electron's loadFile) rejects — inline scripts
  // sidestep that entirely.
  base: './',
  plugins: [react(), viteSingleFile()],
});
