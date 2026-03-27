/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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
        // Brand colors use RGB channel vars so opacity modifiers (brand-blue/30) work
        'brand-blue':   'rgb(var(--brand-blue) / <alpha-value>)',
        'brand-purple': 'rgb(var(--brand-purple) / <alpha-value>)',
        'brand-cyan':   'rgb(var(--brand-cyan) / <alpha-value>)',
        'brand-aurora': 'rgb(var(--brand-aurora) / <alpha-value>)',
        // Semantic tokens reference CSS vars directly
        'bg':           'var(--color-bg)',
        'surface':      'var(--color-surface)',
        'border-col':   'var(--color-border)',
        'text-primary': 'var(--color-text)',
        'text-muted':   'var(--color-muted)',
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
        'glow-blue':    'var(--shadow-glow-blue)',
        'glow-blue-lg': 'var(--shadow-glow-blue-lg)',
        'glow-cyan':    'var(--shadow-glow-cyan)',
        'glow-cyan-lg': 'var(--shadow-glow-cyan-lg)',
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
