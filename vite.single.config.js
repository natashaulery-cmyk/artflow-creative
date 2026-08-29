import base44 from '@base44/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [
    base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: false,
      navigationNotifier: false,
      analyticsTracker: false,
      visualEditAgent: false
    }),
    react(),
    viteSingleFile(),
  ],
  build: {
    outDir: 'dist-single',
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined } },
  },
});
