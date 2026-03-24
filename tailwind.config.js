/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          primary: '#9333EA',
          dark: '#7C3AED',
          light: '#A855F7',
        },
        pink: {
          primary: '#EC4899',
          dark: '#DB2777',
          light: '#F472B6',
        },
        bg: {
          primary: '#000',
          secondary: '#111',
          tertiary: '#1a1a1a',
        },
        border: {
          DEFAULT: '#333',
        },
        text: {
          primary: '#fff',
          secondary: '#999',
          tertiary: '#666',
        },
      },
      backgroundImage: {
        'gradient-purple-pink': 'linear-gradient(135deg, #9333EA 0%, #EC4899 100%)',
        'gradient-bg': `
          radial-gradient(circle at 20% 50%, rgba(147, 51, 234, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 40% 20%, rgba(168, 85, 247, 0.1) 0%, transparent 50%),
          #000
        `,
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          '"Fira Sans"',
          '"Droid Sans"',
          '"Helvetica Neue"',
          'sans-serif',
        ],
      },
    },
  },
  corePlugins: {
    aspectRatio: false,
  },
  plugins: [
    require('@tailwindcss/aspect-ratio'),
  ],
}

