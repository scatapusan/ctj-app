import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" path alias so route imports resolve in tests.
      "@": path.resolve(process.cwd()),
    },
  },
})
