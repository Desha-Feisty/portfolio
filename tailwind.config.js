/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['mostafa-portfolio.html', 'src/app.jsx'],
  theme: {
    extend: {
      colors: {
        dark: '#0A0A0F',
        surfaced: '#12121A',
        neon: '#00D4FF',
        electric: '#0066FF',
        txtprimary: '#F0F4FF',
        txtsecondary: '#8899B0',
        border: '#1E2A3A',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0,212,255,0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(0,212,255,0.5)' },
        },
      },
    },
  },
  plugins: [],
}
