import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0E1726", 2: "#3A4556", 3: "#6B7686", 4: "#A3ABB7" },
        paper: { DEFAULT: "#F6F3EE", 2: "#EFEAE2", card: "#FFFFFF", line: "#E4DED4" },
        er: { 50: "#FFF1F1", 100: "#FFDCDC", 500: "#E5252A", 600: "#C8161D", 700: "#A10F16", 900: "#5C0509" },
        ur: { 50: "#FFF7E8", 100: "#FDEAC4", 500: "#E89A0C", 600: "#C57F00", 700: "#8F5B00" },
        rt: { 50: "#EEF4FF", 100: "#DCE7FF", 500: "#2F6FEB", 600: "#1F57C9", 700: "#173F94" },
        sc: { 50: "#ECF8F1", 100: "#D2F0DF", 500: "#1E9E5A", 600: "#14804A", 700: "#0E5E36" },
        pp: { DEFAULT: "#003087", light: "#009CDE", gold: "#FFC439" },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        display: ['"Instrument Serif"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(14,23,38,0.04), 0 1px 2px rgba(14,23,38,0.06), 0 8px 24px -12px rgba(14,23,38,0.12)",
        lift: "0 2px 4px rgba(14,23,38,0.06), 0 24px 48px -20px rgba(14,23,38,0.28)",
      },
      keyframes: {
        pulsering: { "0%": { transform: "scale(0.9)", opacity: "0.7" }, "100%": { transform: "scale(2.2)", opacity: "0" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        dash: { to: { strokeDashoffset: "-24" } },
      },
      animation: {
        pulsering: "pulsering 1.8s cubic-bezier(0.2,0.6,0.3,1) infinite",
        shimmer: "shimmer 2.2s linear infinite",
        dash: "dash 1s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
