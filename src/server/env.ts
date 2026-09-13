/**
 * Server-only environment variable access.
 *
 * This module must NEVER be imported by client code.
 * The "server-only" package enforces this at Next.js build time —
 * any accidental client import will fail the build immediately.
 *
 * Never log, return in a response, or include in an error message
 * any value returned by this module.
 */
import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Required server environment variable "${name}" is not set or is empty.`,
    );
  }
  return value;
}

/**
 * The Graph API key.
 * Authenticate with `Authorization: Bearer <key>` — never put in URL or log.
 * See https://thegraph.com/docs/en/querying/querying-the-graph/
 */
export function getGraphApiKey(): string {
  return requireEnv("THE_GRAPH_API_KEY");
}
