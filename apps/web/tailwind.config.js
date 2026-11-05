/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Unbounded', 'Manrope', 'sans-serif'],
      },
      colors: {
        app: 'rgb(var(--bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        raised: 'rgb(var(--raised-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        primary: 'rgb(var(--text-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        accent2: 'rgb(var(--accent2-rgb) / <alpha-value>)',
        ink: {
          950: '#070711',
          900: '#0b0b18',
          850: '#10101f',
          800: '#151529',
          700: '#1e1e38',
        },
        violet: {
          glow: '#9d6bff',
        },
      },
      backgroundImage: {
        'aurora': 'radial-gradient(circle at 15% 0%, rgba(139,92,246,.22), transparent 38%), radial-gradient(circle at 85% 10%, rgba(236,72,153,.16), transparent 34%), radial-gradient(circle at 50% 100%, rgba(59,130,246,.12), transparent 40%)',
        'brand': 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 45%, #ec4899 100%)',
        'brand-soft': 'linear-gradient(135deg, rgba(139,92,246,.18), rgba(236,72,153,.10))',
      },
      boxShadow: {
        glow: '0 0 60px rgba(139,92,246,.22)',
        card: '0 18px 60px -28px rgba(0,0,0,.8)',
        'inner-line': 'inset 0 1px 0 rgba(255,255,255,.06)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '.45', transform: 'scale(1)' },
          '50%': { opacity: '.9', transform: 'scale(1.06)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        'pulse-glow': 'pulseGlow 5s ease-in-out infinite',
        rise: 'rise .5s cubic-bezier(.16,1,.3,1) both',
      },
    },
  },
  plugins: [],
};
