export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F9FF",
        surface: "#FFFFFF",
        "content-bg": "#F3F7FC",
        navy: { DEFAULT: "#0F1B33" },
        gray: { DEFAULT: "#5B6472", soft: "#8791A0" },
        line: "#E7EDF6",
        "line-soft": "#B8CCE8",
        blue: { 50: "#EAF2FF", 100: "#D6E7FF", 500: "#2E7DFA", 600: "#1C64F2", 700: "#134FCB" },
        orange: { 1: "#FFB25E", 2: "#FF7A45" },
        green: "#22A559",
        red: { DEFAULT: "#E5484D", bg: "#FDEBEC" },
        amber: { DEFAULT: "#F5A524", bg: "#FEF3DE" },
      },
      borderRadius: { card: "16px", control: "10px", pill: "20px" },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.06), 0 0 0 1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 8px -1px rgb(0 0 0 / 0.1), 0 12px 24px -6px rgb(0 0 0 / 0.1), 0 0 0 1px rgb(0 0 0 / 0.05)',
        'panel': '0 0 0 1px rgba(15,27,51,0.06), 0 2px 4px rgba(15,27,51,0.06), 0 8px 16px rgba(15,27,51,0.08), 0 20px 40px -8px rgba(15,27,51,0.14)',
        'panel-hover': '0 0 0 1px rgba(15,27,51,0.07), 0 4px 8px rgba(15,27,51,0.08), 0 16px 32px rgba(15,27,51,0.12), 0 32px 64px -12px rgba(15,27,51,0.18)',
      },
    },
  },
  plugins: [],
};
