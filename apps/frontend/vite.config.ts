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
      },
      includeAssets: ['favicon.svg', 'icons/*.png', 'screenshots/*.png', 'offline.html'],
      manifest: {
        name: 'Masjid Al-Rahma Academy',
        short_name: 'Al-Rahma LMS',
        description: 'Barashada Diinta Islaamka — Learn Quran, Fiqh, Aqeedah & Arabic online',
        theme_color: '#059669',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        lang: 'en',
        dir: 'ltr',
        categories: ['education', 'religious', 'productivity'],
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/pwa-180x180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'apple touch icon',
          },
        ],
        screenshots: [
          {
            src: '/screenshots/desktop-landing.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Landing Page',
          },
          {
            src: '/screenshots/mobile-dashboard.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Student Dashboard',
          },
        ],
        shortcuts: [
          {
            name: 'My Courses',
            short_name: 'Courses',
            description: 'Go to your enrolled courses',
            url: '/student/courses',
            icons: [{ src: '/icons/shortcut-courses.png', sizes: '96x96' }],
          },
          {
            name: 'Assignments',
            short_name: 'Assignments',
            description: 'View your assignments',
            url: '/student/assignments',
            icons: [{ src: '/icons/shortcut-assignments.png', sizes: '96x96' }],
          },
          {
            name: 'Exams',
            short_name: 'Exams',
            description: 'View upcoming exams',
            url: '/student/exams',
            icons: [{ src: '/icons/shortcut-exams.png', sizes: '96x96' }],
          },
          {
            name: 'Analytics',
            short_name: 'Analytics',
            description: 'Track your progress',
            url: '/student/analytics',
            icons: [{ src: '/icons/shortcut-analytics.png', sizes: '96x96' }],
          },
        ],
      },
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
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
});