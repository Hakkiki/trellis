import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve the `@/*` → `src/*` alias (mirrors tsconfig paths) so engine tests and
// component-level unit tests can import modules the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
