export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Defined as CSS variables (src/index.css): blue on the public pages, BU red inside the staff portal
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)'
        },
        brand: {
          DEFAULT: '#cc0000',
          dark: '#990000',
          light: '#ff3333'
        },
        // Warm page background for the student pages
        paper: '#faf8f6',
        // Staff portal surfaces and text, taken from the Transfer Credit Copilot prototype
        staff: {
          bg: '#f6f7f9',
          sunk: '#f2f4f7',
          line: '#e4e7ec',
          line2: '#eef0f3',
          ink: '#121a2b',
          ink2: '#344054',
          muted: '#667085'
        }
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.03)',
        lift: '0 1px 3px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.05)',
        pop: '0 12px 32px rgba(16,24,40,.14)',
        // Cards that sit over the red band
        raised: '0 12px 32px -12px rgba(16,24,40,.22)'
      }
    }
  },
  plugins: []
}
