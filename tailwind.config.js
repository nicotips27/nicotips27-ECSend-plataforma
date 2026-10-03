/**
 * Puerto de la config del sitio web (index.html, tailwind.config inline).
 * Mismos valores exactos para que el programa de escritorio se vea igual.
 *
 * Se usa Tailwind v3 a proposito: el sitio corre sobre Play CDN v3 y hay 59
 * usos de `border` sin color explicito mas un `shadow-sm`. En v4 el color de
 * borde por defecto cambio a currentColor y shadow-sm paso a shadow-xs, asi
 * que migrar a v4 cambiaria el diseno en silencio.
 */
module.exports = {
  darkMode: 'class',
  content: [
    './src/renderer/index.html',
    './src/renderer/js/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        dark: '#09090b',
        panel: '#18181b',
        primary: '#0ea5e9',
        secondary: '#6366f1'
      },
      animation: {
        'radar-spin': 'radar-spin 4s linear infinite',
        'ping-slow': 'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out forwards'
      },
      keyframes: {
        'radar-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' }
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  /**
   * Estas clases solo existen interpoladas en plantillas de app.js
   * (`class="p-2 ${bg} rounded-lg"`), asi que hay que declararlas explicito.
   * Los valores vienen de las variables de app.js: colorClass, iconColorClass,
   * bubbleClass, iconColor, bg y color.
   */
  safelist: [
    'border-primary/50',
    'text-primary',
    'text-white',
    'bg-primary',
    'bg-primary/10',
    'bg-green-500/10',
    'bg-green-400',
    'text-green-400',
    'bg-yellow-500/10',
    'text-yellow-400',
    'bg-zinc-800',
    'text-zinc-100',
    'rounded-2xl',
    'rounded-tr-sm',
    'rounded-tl-sm',
    'shadow-md',
    'border-white/5',
    'self-end',
    'self-start',
    'animate-slide-up',
    'animate-radar-spin',
    'animate-ping-slow'
  ],
  plugins: []
};