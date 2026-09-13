/**
 * Vitest global setup.
 *
 * Mocks packages that are safe in a Node.js test environment but would throw
 * when their conditional exports are not resolved to the server bundle.
 */
import { vi } from "vitest";

/**
 * `server-only` uses conditional exports:
 *   "react-server" condition → empty module (safe)
 *   default (client)         → throws
 *
 * Vitest runs in Node.js without the "react-server" condition, so the
 * default export (throw) would be selected.  Mock it as a no-op: the
 * real protection comes from Next.js build-time enforcement.
 */
vi.mock("server-only", () => ({}));
