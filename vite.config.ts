// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

const serverEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "PUBLIC_URL",
  "PUBLISHABLE_KEY",
  "SUPABASE_PUBLIC_ANON_KEY",
  "SAGE_MODE",
  "SAGE_CLIENT_ID",
  "SAGE_CLIENT_SECRET",
  "SAGE_REDIRECT_URI",
  "SAGE_API_KEY",
];
const envMode = process.env.NODE_ENV === "production" ? "production" : "development";
const localEnv = loadEnv(envMode, process.cwd(), "");

// Server routes use process.env; copy only their allowlisted inputs from Vite's env files.
for (const key of serverEnvKeys) {
  if (!process.env[key]?.trim() && localEnv[key]) process.env[key] = localEnv[key];
}

export default defineConfig({
  vite: {
    base: process.env.NODE_ENV === "production" ? "https://app.officeandco.co.za/" : "/",
    envPrefix: ["VITE_", "PUBLIC_URL", "PUBLISHABLE_KEY", "SUPABASE_PUBLIC_ANON_KEY"],
    resolve: {
      tsconfigPaths: true,
    },
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 700,
    },
    server: {
      host: "localhost",
      port: 3005,
      strictPort: true,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    preset: "node",
  },
});
