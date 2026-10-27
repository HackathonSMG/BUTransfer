export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a'
        },
        brand: {
          DEFAULT: '#cc0000',
          dark: '#990000',
          light: '#ff3333'
        },
        // Staff portal surfaces and text, taken from the Transfer Credit Copilot prototype
        staff: {
          bg: '#f5f6f8',
          sunk: '#f1f3f6',
          line: '#e3e6eb',
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
        card: '0 1px 2px rgba(16,24,40,.05)',
        lift: '0 1px 3px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.05)',
        pop: '0 12px 32px rgba(16,24,40,.14)'
      }
    }
  },
  plugins: []
}
