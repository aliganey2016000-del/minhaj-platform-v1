import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ------------------------------------------------------------------
      // Colors — Islamic Green + Gold Palette
      // ------------------------------------------------------------------
      colors: {
        // Primary — Emerald / Islamic Green
        primary: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',    // Base green
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // Accent — Gold / Amber
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',    // Base gold
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // Cream / Warm paper tones
        cream: {
          50: '#fefdfb',
          100: '#fdf9f2',
          200: '#faf3e4',
          300: '#f5e8cc',
          400: '#edd5a3',
          500: '#e2bd74',
          600: '#d4a24a',
          700: '#b38335',
          800: '#92692c',
          900: '#785626',
        },
        // Obsidian / Deep charcoal for dark mode
        obsidian: {
          50: '#f8fafc',
          100: '#e2e8f0',
          200: '#cbd5e1',
          300: '#94a3b8',
          400: '#64748b',
          500: '#475569',
          600: '#1e293b',
          700: '#0f172a',
          800: '#0a0f1a',
          900: '#060a10',
          950: '#020408',
        },
      },

      // ------------------------------------------------------------------
      // Fonts
      // ------------------------------------------------------------------
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        arabic: ['Noto Naskh Arabic', 'Scheherazade New', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      // ------------------------------------------------------------------
      // Glass Morphism Utilities
      // ------------------------------------------------------------------
      backdropBlur: {
        xs: '2px',
      },
      backgroundColor: {
        glass: 'rgba(255, 255, 255, 0.08)',
        'glass-dark': 'rgba(0, 0, 0, 0.25)',
        'glass-strong': 'rgba(255, 255, 255, 0.15)',
        'glass-strong-dark': 'rgba(0, 0, 0, 0.4)',
      },
      borderColor: {
        glass: 'rgba(255, 255, 255, 0.15)',
        'glass-dark': 'rgba(255, 255, 255, 0.06)',
      },

      // ------------------------------------------------------------------
      // Spacing
      // ------------------------------------------------------------------
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        88: '22rem',
        128: '32rem',
      },

      // ------------------------------------------------------------------
      // Border Radius
      // ------------------------------------------------------------------
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      // ------------------------------------------------------------------
      // Box Shadows
      // ------------------------------------------------------------------
      boxShadow: {
        'gold-sm': '0 0 15px rgba(245, 158, 11, 0.15)',
        'gold-md': '0 0 30px rgba(245, 158, 11, 0.2)',
        'gold-lg': '0 0 60px rgba(245, 158, 11, 0.25)',
        'glass-light': '0 8px 32px rgba(0, 0, 0, 0.06)',
        'glass-dark': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 10px 40px rgba(0,0,0,0.1)',
        'elevated': '0 20px 60px rgba(0,0,0,0.12)',
      },

      // ------------------------------------------------------------------
      // Animation Keyframes
      // ------------------------------------------------------------------
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.7s ease-out forwards',
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'slide-in-left': 'slide-in-left 0.7s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.7s ease-out forwards',
        'scale-in': 'scale-in 0.5s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 7s ease-in-out 1s infinite',
        'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
        'spin-slow': 'spin-slow 20s linear infinite',
      },

      // ------------------------------------------------------------------
      // Transition durations
      // ------------------------------------------------------------------
      transitionDuration: {
        '400': '400ms',
        '800': '800ms',
        '1200': '1200ms',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;