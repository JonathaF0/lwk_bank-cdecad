import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // FiveM loads the UI from nui://<resource>/web/dist/, so asset paths must be relative.
  base: './',
  // The UI bundles config/locales/en.json from the resource root as its fallback strings.
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // ponytail: FiveM's CEF lags desktop Chrome; bump this once you've confirmed your client's version.
    target: 'chrome95',
    chunkSizeWarningLimit: 800,
  },
});
