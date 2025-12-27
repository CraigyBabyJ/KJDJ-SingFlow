/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};
