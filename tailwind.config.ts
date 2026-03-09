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
        "pos-bg": "#f6f3ef",
        "pos-card": "#ffffff",
        "pos-ink": "#221f1b",
        "pos-soft": "#6f6458",
        "pos-line": "#e9e0d7",
        "pos-accent": "#5e4126",
        "pos-accent-soft": "#efe7de",
        "pos-success": "#156f4a",
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
