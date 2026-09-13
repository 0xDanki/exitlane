/**
 * Server-side Privy access-token verification.
 *
 * Uses @privy-io/node PrivyClient which internally manages JWKS fetching
 * and caching. The PrivyClient is constructed once per process (module-level
 * singleton) to amortise JWKS fetch overhead.
 *
 * Authentication proves the user session only. It does NOT prove that
 * mandate.owner equals the authenticated wallet — that additional check
 * must happen in the mandate-evaluation API layer (see docs/SECURITY_MODEL.md).
 *
 * Never log, return, or forward raw Privy errors or access tokens.
 */
import "server-only";
import { PrivyClient } from "@privy-io/node";
import { getPrivyAppId, getPrivyAppSecret } from "../env";

/**
 * Typed error thrown when an access token fails verification.
 * The API layer maps this to HTTP 401.
 */
export class PrivyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivyAuthError";
  }
}

/**
 * Lazy-initialised PrivyClient singleton.
 * Built on first call to avoid startup errors when env vars are absent
 * (e.g., during build-time static analysis).
 */
let _privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!_privyClient) {
    _privyClient = new PrivyClient({
      appId: getPrivyAppId(),
      appSecret: getPrivyAppSecret(),
    });
  }
  return _privyClient;
}

/**
 * Verifies a Privy access token.
 *
 * @param bearerToken - The raw access token (without "Bearer " prefix).
 * @returns The verified payload containing the Privy `userId`.
 * @throws {PrivyAuthError} If the token is missing, malformed, expired,
 *   or otherwise invalid. Raw Privy errors are never forwarded.
 */
export async function verifyPrivyToken(
  bearerToken: string,
): Promise<{ userId: string }> {
  if (!bearerToken || bearerToken.trim() === "") {
    throw new PrivyAuthError("Missing access token");
  }

  try {
    const result = await getPrivyClient()
      .utils()
      .auth()
      .verifyAccessToken(bearerToken);
    return { userId: result.user_id };
  } catch {
    // Never forward the raw Privy error — it may contain token material.
    throw new PrivyAuthError("Invalid or expired access token");
  }
}
