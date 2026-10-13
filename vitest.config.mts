import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the `@/*` -> `src/*` alias in tsconfig.json, so a test can import
  // a module that uses it (type-only `@/` imports are erased, value ones are
  // not — without this they fail to resolve).
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
