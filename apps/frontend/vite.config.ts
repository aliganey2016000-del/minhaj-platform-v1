import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate' silently reloads the page the instant a new service
      // worker activates — with 'auto' injection, vite-plugin-pwa reloads
      // as soon as the update is detected, with no warning. Deploying a new
      // build while someone has the app open (e.g. mid-edit in the Course
      // Builder) would blow away unsaved work. 'prompt' + the update banner
      // below (registered in main.tsx) lets the user choose when to reload.
      registerType: 'prompt',
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        // Large marketing/landing photos (e.g. public/images/*) aren't part
        // of the app shell and shouldn't bloat the service worker's
        // precache for every user — they load fine on demand instead.
        globIgnores: ['images/**'],
      },
      includeAssets: ['favicon.svg', 'icons/*.png', 'screenshots/*.png', 'offline.html'],
      // The manifest is served dynamically by the backend
      // (/api/v1/tenant/manifest.webmanifest, linked from index.html) so
      // each org's subdomain gets its own name/logo on "Add to Home
      // Screen" instead of one hardcoded platform identity. Letting this
      // plugin also generate a static manifest.webmanifest would inject a
      // second, conflicting <link rel="manifest"> into the built HTML.
      manifest: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts/')) return 'charts';
          if (
            id.includes('node_modules/@tiptap/') ||
            id.includes('node_modules/@tiptap/pm/') ||
            id.includes('node_modules/prosemirror-')
          ) {
            return 'rich-text-editor';
          }
          if (id.includes('node_modules/framer-motion/')) return 'motion';
          if (id.includes('node_modules/i18next/') || id.includes('node_modules/react-i18next/')) return 'i18n';
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
});
