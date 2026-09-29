import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    exclude: ["dist/**", "node_modules/**"],
    setupFiles: ["src/__tests__/setup-env.ts"],
  },
});
