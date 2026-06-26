import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // DB-level tests boot an embedded PostgreSQL in beforeAll — give it room.
    hookTimeout: 120000,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" path alias so route imports resolve in tests.
      "@": path.resolve(process.cwd()),
    },
  },
})
