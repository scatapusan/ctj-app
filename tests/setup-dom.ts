/**
 * DOM matchers for component tests (toBeInTheDocument, toHaveFocus, …).
 *
 * vitest applies setupFiles to EVERY test file, including the route and
 * database suites that run in the node environment. Registering the matchers
 * there is harmless — they only touch the DOM when a test actually calls one,
 * and only jsdom files do, via their `// @vitest-environment jsdom` docblock.
 */
import "@testing-library/jest-dom/vitest"
