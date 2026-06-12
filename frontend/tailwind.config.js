/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Aksen hangat (oranye/coral) untuk pengalaman isi-survei (surveyor).
        accent: {
          50: '#fff5ed',
          100: '#ffe8d4',
          200: '#fecda9',
          300: '#fdac72',
          400: '#fb8138',
          500: '#f96316',
          600: '#ea4c0c',
          700: '#c23a0c',
          800: '#9a3012',
          900: '#7c2912',
        },
        // Latar krem hangat untuk layar surveyor.
        cream: '#faf6f0',
      },
    },
  },
  plugins: [],
};
