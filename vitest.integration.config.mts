import { defineConfig } from "vitest/config";
import path from "node:path";

// Needs the local stack (npm run e2e:stack) or a Supabase project reachable via INTEGRATION_* env vars.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 30_000, fileParallelism: false },
});
