/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: {
          DEFAULT: '#111111',
          elevated: '#161616',
        },
        border: {
          DEFAULT: '#262626',
          subtle: '#1a1a1a',
        },
        primary: {
          DEFAULT: '#6366f1',
          hover: '#5558e8',
          muted: '#312e81',
        },
        text: {
          DEFAULT: '#e5e5e5',
          muted: '#737373',
          subtle: '#525252',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
