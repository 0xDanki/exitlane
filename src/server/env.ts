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

// ── Privy ─────────────────────────────────────────────────────────────────────

/**
 * Privy application ID. Although NEXT_PUBLIC_PRIVY_APP_ID is also available
 * client-side, reading it here via requireEnv ensures server-side code can
 * construct a PrivyClient without accessing the public env var prefix.
 *
 * @see src/server/auth/privy.ts
 */
export function getPrivyAppId(): string {
  // Accepts either PRIVY_APP_ID (server-only) or NEXT_PUBLIC_PRIVY_APP_ID (public)
  // so a single env var serves both purposes when both names are identical.
  const value =
    process.env["PRIVY_APP_ID"] ?? process.env["NEXT_PUBLIC_PRIVY_APP_ID"];
  if (!value || value.trim() === "") {
    throw new Error(
      'Required server environment variable "PRIVY_APP_ID" (or "NEXT_PUBLIC_PRIVY_APP_ID") is not set or is empty.',
    );
  }
  return value;
}

/**
 * Privy application secret — server-side only.
 * Used to construct a PrivyClient for access-token verification.
 * Never log or include in responses.
 */
export function getPrivyAppSecret(): string {
  return requireEnv("PRIVY_APP_SECRET");
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

/**
 * Anthropic API key — server-side only.
 * Used exclusively for the two constrained AI workflows defined in
 * docs/PRODUCT_SCOPE.md. AI output is never trusted for authorization.
 * Never log or include in responses.
 */
export function getAnthropicApiKey(): string {
  return requireEnv("ANTHROPIC_API_KEY");
}

/**
 * Anthropic model identifier — server-side only.
 * The model is selected by the server; the browser never provides it.
 * Hackathon default: claude-sonnet-5 (see .env.example).
 */
export function getAnthropicModel(): string {
  return requireEnv("ANTHROPIC_MODEL");
}
