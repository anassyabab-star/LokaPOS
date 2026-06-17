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
        // ── Loka customer-ordering design tokens (design_handoff_loka_ordering) ──
        maroon: { DEFAULT: "#7F1D1D", ink: "#5E1414" },
        espresso: "#2A1D16",
        cream: { DEFAULT: "#F6EFE3", "2": "#F4ECE1" },
        card: "#FFFFFF",
        hairline: { DEFAULT: "#EADFCD", soft: "#EFE6D6" },
        muted: { DEFAULT: "#8A7461", "2": "#B7A48D", "3": "#9C8B79" },
        melon: { DEFAULT: "#E8604C", soft: "#F0A793" },
        leaf: "#3F7D4F",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        label: "0.16em",
        wordmark: "0.18em",
      },
      boxShadow: {
        soft: "0 2px 12px rgba(34, 31, 27, 0.06)",
        card: "0 1px 3px rgba(0,0,0,.08)",
      },
      borderRadius: {
        xl: "1rem",
      },
      keyframes: {
        scrIn: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        sheetUp: { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: { "0%": { transform: "scale(.9)", opacity: "0" }, "60%": { transform: "scale(1.04)" }, "100%": { transform: "scale(1)", opacity: "1" } },
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(127,29,29,.35)" }, "70%": { boxShadow: "0 0 0 11px rgba(127,29,29,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(127,29,29,0)" } },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: {
        scrIn: "scrIn .3s ease both",
        sheetUp: "sheetUp .32s cubic-bezier(.2,.8,.2,1)",
        fadeIn: "fadeIn .2s ease both",
        pop: "pop .5s ease both",
        "pulse-ring": "pulseRing 1.8s infinite",
        blink: "blink 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
