/**
 * HTTP client for The Graph gateway.
 *
 * Responsibilities:
 *   - Authenticate via Authorization header (key never in URL).
 *   - Apply a request timeout and classify the error.
 *   - Parse and surface GraphQL `errors` arrays as typed errors.
 *   - Return only the `data` payload — raw response is never forwarded.
 *
 * This module uses the global `fetch` so that tests can stub it easily with
 * `vi.stubGlobal("fetch", vi.fn())`.
 */

import { GRAPH_GATEWAY_BASE_URL, GRAPH_SUBGRAPH_ID } from "@/config/markets";
import { getGraphApiKey } from "@/server/env";

/** Maximum wait for a Graph response before aborting. */
export const GRAPH_REQUEST_TIMEOUT_MS = 8_000 as const;

// ── Error types ───────────────────────────────────────────────────────────────

export type GraphClientErrorKind =
  | { type: "HTTP_ERROR"; status: number; statusText: string }
  | { type: "GRAPHQL_ERRORS"; errors: ReadonlyArray<{ message: string }> }
  | { type: "TIMEOUT" }
  | { type: "NETWORK_ERROR"; message: string }
  | { type: "CONFIGURATION_ERROR"; message: string };

export class GraphFetchError extends Error {
  public readonly kind: GraphClientErrorKind;

  constructor(kind: GraphClientErrorKind) {
    super(GraphFetchError.#describe(kind));
    this.name = "GraphFetchError";
    this.kind = kind;
  }

  static #describe(k: GraphClientErrorKind): string {
    switch (k.type) {
      case "HTTP_ERROR":
        return `The Graph returned HTTP ${k.status} ${k.statusText}`;
      case "GRAPHQL_ERRORS":
        return `GraphQL errors: ${k.errors.map((e) => e.message).join("; ")}`;
      case "TIMEOUT":
        return `The Graph request timed out after ${GRAPH_REQUEST_TIMEOUT_MS} ms`;
      case "NETWORK_ERROR":
        return `Network error reaching The Graph: ${k.message}`;
      case "CONFIGURATION_ERROR":
        return `Graph client configuration error: ${k.message}`;
    }
  }
}

// ── Raw GraphQL response shape ────────────────────────────────────────────────

interface RawGraphResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// ── Query function ────────────────────────────────────────────────────────────

/**
 * Send a GraphQL query to the configured Uniswap v3 Base subgraph.
 *
 * Authentication: Authorization: Bearer <THE_GRAPH_API_KEY>
 * The key is never included in the URL, response body, or logs.
 *
 * Throws `GraphFetchError` on:
 *   - Missing API key
 *   - Non-2xx HTTP response
 *   - GraphQL `errors` array present and non-empty
 *   - Request timeout (AbortError)
 *   - Network-level failure
 */
export async function queryGraph<T>(query: string): Promise<T> {
  let apiKey: string;
  try {
    apiKey = getGraphApiKey();
  } catch (e) {
    throw new GraphFetchError({
      type: "CONFIGURATION_ERROR",
      message: e instanceof Error ? e.message : "API key unavailable",
    });
  }

  const url = `${GRAPH_GATEWAY_BASE_URL}/${GRAPH_SUBGRAPH_ID}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Key in header, never in URL — see performance and security model.
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new GraphFetchError({ type: "TIMEOUT" });
    }
    throw new GraphFetchError({
      type: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Unknown network error",
    });
  }
  clearTimeout(timer);

  if (!response.ok) {
    throw new GraphFetchError({
      type: "HTTP_ERROR",
      status: response.status,
      statusText: response.statusText,
    });
  }

  const json = (await response.json()) as RawGraphResponse<T>;

  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new GraphFetchError({
      type: "GRAPHQL_ERRORS",
      errors: json.errors,
    });
  }

  // `data` may be absent if the server returned an unexpected shape;
  // callers validate with Zod so this is caught downstream.
  return json.data as T;
}
