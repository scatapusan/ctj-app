import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // .tsx too: component tests opt into jsdom with a per-file
    // `// @vitest-environment jsdom` docblock, so the node default here still
    // applies to every route and database test.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup-dom.ts"],
    // DB-level tests boot an embedded PostgreSQL in beforeAll — give it room.
    hookTimeout: 120000,
    testTimeout: 30000,
  },
  // tsconfig.json sets jsx: "preserve" for Next's own compiler, which vite's
  // esbuild pass cannot parse. This plugin compiles the component tests' JSX;
  // it does not affect the app build, which still goes through Next.
  plugins: [react()],
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" path alias so route imports resolve in tests.
      "@": path.resolve(process.cwd()),
    },
  },
})
