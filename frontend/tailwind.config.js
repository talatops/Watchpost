/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#0B0E14",
        darkCard: "#151B26",
        darkBorder: "#222C3D",
        accentCyan: "#00D2FF",
        accentBlue: "#0072FF",
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(110%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideOutRight: {
          '0%':   { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(110%)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%':      { transform: 'translateX(-6px)' },
          '40%':      { transform: 'translateX(6px)' },
          '60%':      { transform: 'translateX(-4px)' },
          '80%':      { transform: 'translateX(4px)' },
        },
        modalIn: {
          '0%':   { opacity: '0', transform: 'scale(0.94) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        pulse2: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,210,255,0)' },
          '50%':      { boxShadow: '0 0 12px 3px rgba(0,210,255,0.25)' },
        },
      },
      animation: {
        'fade-in-up':       'fadeInUp 0.4s ease-out both',
        'fade-in':          'fadeIn 0.3s ease-out both',
        'slide-down':       'slideDown 0.25s ease-out both',
        'slide-in-right':   'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1) both',
        'slide-out-right':  'slideOutRight 0.25s ease-in both',
        'shake':            'shake 0.4s ease both',
        'modal-in':         'modalIn 0.25s cubic-bezier(0.16,1,0.3,1) both',
        'pulse2':           'pulse2 2s ease-in-out infinite',
        'shimmer':          'shimmer 2s linear infinite',
        'scale-in':         'scaleIn 0.2s ease-out both',
        'glow-pulse':       'glowPulse 2s ease-in-out infinite',
      },
      transitionProperty: {
        'transform-opacity': 'transform, opacity',
      },
    },
  },
  plugins: [],
}
