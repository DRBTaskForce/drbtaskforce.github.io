/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.njk',
    './src/**/*.html',
    './src/assets/css/tailwind.css',
  ],
  safelist: [
    // Built dynamically by JS via string concatenation — scanner can't see them
    'chat-msg-right',
    'chat-msg-left',
  ],
  theme: {
    extend: {
      colors: {
        'brand-blue':   '#6366f1',
        'brand-purple': '#a78bfa',
        'brand-cyan':   '#38bdf8',
        'brand-aurora': '#10d9a0',
        'bg':           '#080b1a',
        'surface':      'rgba(255,255,255,0.04)',
        'border-col':   'rgba(255,255,255,0.08)',
        'text-primary': '#f1f5f9',
        'text-muted':   '#94a3b8',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['Space Grotesk', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        brand: '12px',
      },
      boxShadow: {
        'glow-blue':    '0 4px 20px rgba(99,102,241,0.3)',
        'glow-blue-lg': '0 8px 28px rgba(99,102,241,0.4)',
        'glow-cyan':    '0 4px 24px rgba(56,189,248,0.25)',
        'glow-cyan-lg': '0 4px 32px rgba(56,189,248,0.4)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2.5s ease-in-out infinite',
      },
      height: {
        'hero': '720px',
      },
    },
  },
};
