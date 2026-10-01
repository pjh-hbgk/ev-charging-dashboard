/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#fcfcfb', page: '#f9f9f7', dark: '#1a1a19', darkpage: '#0d0d0d' },
        ink: {
          primary: '#0b0b0b', secondary: '#52514e', muted: '#898781',
          dprimary: '#ffffff', dsecondary: '#c3c2b7',
        },
        line: { hair: '#e1e0d9', axis: '#c3c2b7', dhair: '#2c2c2a', daxis: '#383835' },
        series: {
          1: '#2a78d6', 2: '#eb6834', 3: '#1baf7a', 4: '#eda100',
          5: '#e87ba4', 6: '#008300', 7: '#4a3aa7', 8: '#e34948',
        },
        status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
