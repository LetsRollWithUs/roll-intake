import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// De werkplek draait ook op roll.nl/dashboard: WordPress serveert daar alleen de schil, de bestanden komen
// van deze app. Daarom wijzen ze in de productiebuild met een volledig adres naar intake.roll.nl.
// Testadressen en lokaal houden gewone paden. ASSET_BASE is er om dat lokaal na te bootsen.
const base = process.env.ASSET_BASE ?? (process.env.VERCEL_ENV === "production" ? "https://intake.roll.nl/" : "/");

export default defineConfig({
  base,
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { host: "::", port: 8081 },
});
