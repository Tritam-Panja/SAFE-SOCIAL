/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        junior: {
          primary: '#FF6B6B',
          secondary: '#4ECDC4',
          accent: '#FFE66D',
          bg: '#FFF9F0',
        },
        explorer: {
          primary: '#6C5CE7',
          secondary: '#00CEC9',
          accent: '#FFAA00',
          bg: '#F8F9FE',
        },
        teen: {
          primary: '#8A2387',
          secondary: '#E94057',
          accent: '#F27121',
          bg: '#0F172A',
        },
      },
    },
  },
  plugins: [],
}
