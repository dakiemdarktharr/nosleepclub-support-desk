import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    // Keep the 128-case integration run from competing with one worker per CPU.
    // Assertions and the existing per-test timeout remain unchanged.
    maxWorkers: 4,
    include: ["tests/**/*.test.ts"],
  },
});
