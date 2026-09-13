/**
 * POST /api/draft
 *
 * Generates an untrusted AI mandate draft from an operator's plain-language
 * emergency plan. The draft is schema-validated and source-span-verified
 * before being returned for human review.
 *
 * Security contract:
 * - Privy access token must be verified before any Anthropic call.
 * - Model is read from server environment only — never from the request body.
 * - Input length is strictly bounded (1–1,000 characters).
 * - Raw Anthropic errors and provider details are never returned.
 * - The response contains no token, key, secret, address, or authorization claim.
 * - Exactly one Anthropic call per request; no automatic retries.
 *
 * See docs/API_CONTRACTS.md § POST /api/draft.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken, PrivyAuthError } from "@/server/auth/privy";
import {
  fetchMandateDraft,
  AIDraftError,
  type MandateDraft,
} from "@/server/ai/mandate-draft";
import { getAnthropicApiKey, getAnthropicModel } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stable error response shape. */
type DraftErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

/** Success response shape. */
type DraftSuccessResponse = {
  ok: true;
  draft: MandateDraft;
};

type DraftRouteResponse = DraftSuccessResponse | DraftErrorResponse;

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse<DraftErrorResponse> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<DraftRouteResponse>> {
  // ── 1. Extract and verify Privy access token ───────────────────────────────
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse("UNAUTHENTICATED", "Authorization required", 401);
  }
  const accessToken = authHeader.slice("Bearer ".length).trim();

  try {
    await verifyPrivyToken(accessToken);
  } catch (err) {
    if (err instanceof PrivyAuthError) {
      return errorResponse("UNAUTHENTICATED", "Invalid or expired token", 401);
    }
    return errorResponse("INTERNAL_ERROR", "Authentication check failed", 500);
  }

  // ── 2. Parse and validate request body ────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Request body must be JSON", 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("operatorText" in body) ||
    typeof (body as Record<string, unknown>)["operatorText"] !== "string"
  ) {
    return errorResponse(
      "INVALID_INPUT",
      "Request body must include a string field 'operatorText'",
      400,
    );
  }

  const operatorText = (body as Record<string, unknown>)[
    "operatorText"
  ] as string;

  if (operatorText.trim().length === 0) {
    return errorResponse(
      "INVALID_INPUT",
      "operatorText must not be empty",
      400,
    );
  }

  if (operatorText.length > 1000) {
    return errorResponse(
      "INVALID_INPUT",
      "operatorText must be 1,000 characters or fewer",
      400,
    );
  }

  // ── 3. Read Anthropic configuration ───────────────────────────────────────
  let apiKey: string;
  let model: string;
  try {
    apiKey = getAnthropicApiKey();
    model = getAnthropicModel();
  } catch {
    return errorResponse(
      "AI_UNAVAILABLE",
      "AI service is not configured on this server",
      503,
    );
  }

  // ── 4. Generate draft (one Anthropic request; no retries) ─────────────────
  let draft: MandateDraft;
  try {
    draft = await fetchMandateDraft(operatorText, apiKey, model);
  } catch (err) {
    if (err instanceof AIDraftError) {
      if (err.kind === "PROVIDER_ERROR") {
        return errorResponse(
          "AI_UNAVAILABLE",
          "AI provider request failed. Please try again.",
          503,
        );
      }
      // SCHEMA_INVALID or SPAN_INVALID — model returned an unusable response
      return errorResponse(
        "INVALID_DRAFT",
        "AI response did not produce a valid mandate draft",
        422,
      );
    }
    return errorResponse("AI_UNAVAILABLE", "Unexpected AI error", 503);
  }

  // ── 5. Return the validated draft ─────────────────────────────────────────
  // The response must not contain: tokens, keys, addresses, auth claims,
  // calldata, router, or recipient fields (all excluded by MandateDraftSchema).
  return NextResponse.json({ ok: true, draft }, { status: 200 });
}
