import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // Force a single copy of React/ReactDOM so hooks don't end up bound to
    // a stale dispatcher ("null is not an object (evaluating 'dispatcher.useState')")
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@base44/sdk')) return 'base44-sdk';
          if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('@tanstack/react-query') || /node_modules\/react\//.test(id)) return 'react-vendor';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor';
          if (id.includes('@radix-ui') || id.includes('framer-motion') || id.includes('lucide-react') || id.includes('/cmdk/') || id.includes('/vaul/')) return 'ui-vendor';
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('react-markdown') || id.includes('remark') || id.includes('rehype')) return 'export-vendor';
          return 'vendor';
        },
      },
    },
  },
});