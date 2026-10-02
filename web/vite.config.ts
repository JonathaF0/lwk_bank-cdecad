import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // FiveM loads the UI from nui://<resource>/html/, so asset paths must be relative.
  base: './',
  build: {
    outDir: '../html',
    emptyOutDir: true,
    // ponytail: FiveM's CEF lags desktop Chrome; bump this once you've confirmed your client's version.
    target: 'chrome95',
    chunkSizeWarningLimit: 800,
  },
});
