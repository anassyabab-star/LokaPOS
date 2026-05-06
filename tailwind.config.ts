import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "pos-bg": "#ffffff",
        "pos-card": "#ffffff",
        "pos-ink": "#111111",
        "pos-soft": "#6f6458",
        "pos-line": "#e5e7eb",
        "pos-accent": "#7F1D1D",
        "pos-accent-soft": "#fef2f2",
        "pos-success": "#156f4a",
        "pos-brand": "#7F1D1D",
      },
      boxShadow: {
        soft: "0 2px 12px rgba(34, 31, 27, 0.06)",
      },
      borderRadius: {
        xl: "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
