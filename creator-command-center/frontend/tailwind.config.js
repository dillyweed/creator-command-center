/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#080808",
        s1: "#0f0f0f",
        s2: "#161616",
        s3: "#1e1e1e",
        bd: "#232323",
        bd2: "#2e2e2e",
        tp: "#e8e8e8",
        ts: "#888888",
        tm: "#4a4a4a",
        accent: "#4c8eff",
        success: "#2ecc71",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
