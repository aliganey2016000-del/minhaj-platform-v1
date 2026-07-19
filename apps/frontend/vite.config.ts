import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/.*\/my\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-student-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/courses\/.*\/content/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-course-content-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/gamification\/(my|leaderboard)/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-gamification-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /.*\.(png|jpg|jpeg|gif|svg|ico|webp)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Self-hosted lesson videos (direct .mp4/.webm links, not YouTube/Vimeo
            // iframes — those can't work offline regardless of caching). Explicitly
            // fetched once by the "Download for Offline" action to warm this cache
            // ahead of time, then served from here whenever the network is down.
            urlPattern: /.*\.(mp4|webm|ogg|mov|mkv|avi)(\?.*)?$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'offline-video-cache',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/_/],
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