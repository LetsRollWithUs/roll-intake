import type { Config } from "tailwindcss";
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aubergine: "#2F2141",
        pink: "#F6A9C6",
        offwhite: "#FEFAF2",
      },
      fontFamily: { sans: ["Figtree", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
