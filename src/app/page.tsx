"use client";

/**
 * ExitLane operator screen — Phase 4
 *
 * Visual design follows docs/DESIGN_SYSTEM.md v1.5 exactly.
 * Three sections:
 *   1. Plan   — operator plain-language plan → AI mandate draft
 *   2. Proof  — live WETH/USDC evidence from /api/evidence (The Graph)
 *   3. Outcome — extracted mandate terms + disabled sign control
 *
 * Trust model: "Software checks; AI explains."
 * AI draft is clearly labeled untrusted. Sign/execute disabled until Phase 5.
 *
 * Accessibility: semantic HTML, visible focus ring, ≥44px targets, ARIA labels,
 * reduced-motion support via globals.css, color + icon + text for all signals.
 */

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import type { MandateDraft } from "@/server/ai/mandate-draft";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvidenceData {
  inputToken: string;
  outputToken: string;
  price: string;
  observedAtMs: number;
  indexedBlock: string;
  priceScale: number;
}

interface EvidenceResult {
  ok: true;
  evidence: EvidenceData;
  provenance: {
    provider: string;
    sourceChainId: number;
    subgraphId: string;
    poolAddress: string;
    indexedBlock: number;
    observedTimestampSec: number;
  };
  fetchedAt: string;
}

interface EvidenceError {
  ok: false;
  error: { code: string; message: string };
}

type EvidenceResponse = EvidenceResult | EvidenceError;

interface DraftState {
  draft: MandateDraft | null;
  loading: boolean;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format scaled bigint price string to USD display string */
function formatPrice(priceStr: string, scale: number): string {
  try {
    const priceInt = BigInt(priceStr);
    const scaleBig = BigInt(scale);
    const whole = priceInt / scaleBig;
    const frac = priceInt % scaleBig;
    const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
    return fracStr
      ? `$${whole.toLocaleString()}.${fracStr}`
      : `$${whole.toLocaleString()}`;
  } catch {
    return "—";
  }
}

/** Truncate wallet address for display */
function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Get first Ethereum wallet address from Privy user linked accounts */
function getWalletAddress(
  user: {
    linkedAccounts?: Array<{ type: string; address?: string }>;
  } | null,
): string | null {
  if (!user?.linkedAccounts) return null;
  for (const account of user.linkedAccounts) {
    if (
      (account.type === "wallet" ||
        account.type === "ethereum" ||
        account.type === "privy") &&
      account.address
    ) {
      return account.address;
    }
  }
  return null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────


function EnvBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: "var(--radius-control)",
        border: "1px solid #b91372",
        color: "#b91372",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        letterSpacing: "0.08em",
        lineHeight: 1,
      }}
      role="status"
      aria-label="Environment: Testnet — no real funds"
    >
      TESTNET
    </span>
  );
}

function DraftBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "var(--radius-control)",
        border: "1px solid var(--border-strong)",
        color: "var(--text-muted)",
        fontSize: "12px",
        fontFamily: "var(--font-sans)",
        fontWeight: 500,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
      aria-label="Mandate status: Draft"
    >
      <span aria-hidden="true" style={{ opacity: 0.5 }}>○</span>
      Draft
    </span>
  );
}

interface FieldRowProps {
  label: string;
  value: string | null;
  sourceSpan: string | null;
}

function FieldRow({ label, value, sourceSpan }: FieldRowProps) {
  const isEmpty = value === null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        padding: "14px 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-sans)",
            color: "var(--text-muted)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            paddingTop: "1px",
          }}
        >
          {label}
        </span>
        {isEmpty ? (
          <span
            style={{
              fontSize: "13px",
              fontFamily: "var(--font-sans)",
              color: "var(--status-danger)",
              fontWeight: 600,
            }}
            role="status"
          >
            Needs operator input
          </span>
        ) : (
          <span
            style={{
              fontSize: "14px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-primary)",
              fontWeight: 500,
            }}
          >
            {value}
          </span>
        )}
      </div>
      {!isEmpty && sourceSpan && (
        <span
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-sans)",
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}
          aria-label={`Source: "${sourceSpan}"`}
        >
          Source: &ldquo;{sourceSpan}&rdquo;
        </span>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EXAMPLE_PLAN =
  "If ETH falls below $2,000, sell no more than 5 WETH into USDC with maximum 1% slippage.";

// How long to wait before declaring Privy init as timed out.
// A missing NEXT_PUBLIC_PRIVY_APP_ID causes PrivyProvider not to mount;
// the page discovers this via the timeout state rather than a static env check
// (which can freeze to the wrong value during static prerendering).
const PRIVY_INIT_TIMEOUT_MS = 10_000;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OperatorPage() {
  const { ready, authenticated, user, login, logout, getAccessToken } =
    usePrivy();

  // Detect when Privy fails to reach `ready` within the timeout window.
  const [privyTimedOut, setPrivyTimedOut] = useState(false);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => {
      setPrivyTimedOut(true);
    }, PRIVY_INIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  // Plan state
  const [operatorText, setOperatorText] = useState("");

  // Draft state
  const [draftState, setDraftState] = useState<DraftState>({
    draft: null,
    loading: false,
    error: null,
  });

  // Evidence state
  const [evidence, setEvidence] = useState<EvidenceResult | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceRetry, setEvidenceRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const evidenceAge = evidence
    ? Math.floor((now - evidence.evidence.observedAtMs) / 1000)
    : null;

  // Evidence polling
  useEffect(() => {
    let cancelled = false;

    async function loadEvidence() {
      try {
        const res = await fetch("/api/evidence", { cache: "no-store" });
        const data: EvidenceResponse = (await res.json()) as EvidenceResponse;
        if (cancelled) return;
        if (data.ok) {
          setEvidence(data);
          setEvidenceError(null);
        } else {
          setEvidenceError(data.error?.message ?? "Evidence unavailable");
        }
      } catch {
        if (!cancelled) setEvidenceError("Could not reach evidence service");
      }
    }

    void loadEvidence();
    const interval = setInterval(() => {
      if (!document.hidden) void loadEvidence();
    }, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [evidenceRetry]);

  // Age ticker
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Draft generation
  async function handleGenerateDraft() {
    if (!authenticated) return;
    if (draftState.loading) return;

    setDraftState({ draft: null, loading: true, error: null });

    let accessToken: string | null = null;
    try {
      accessToken = await getAccessToken();
    } catch {
      setDraftState({
        draft: null,
        loading: false,
        error: "Could not obtain authentication token. Please log in again.",
      });
      return;
    }

    if (!accessToken) {
      setDraftState({
        draft: null,
        loading: false,
        error: "Authentication session expired. Please log in again.",
      });
      return;
    }

    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ operatorText }),
      });

      type DraftResponse =
        | { ok: true; draft: MandateDraft }
        | { ok: false; error: { code: string; message: string } };

      const data: DraftResponse = (await res.json()) as DraftResponse;

      if (data.ok) {
        setDraftState({ draft: data.draft, loading: false, error: null });
      } else {
        const code = data.error?.code ?? "UNKNOWN";
        const msg =
          code === "UNAUTHENTICATED"
            ? "Session expired. Please log in again."
            : code === "INVALID_INPUT"
              ? "Please enter your emergency plan (1–1,000 characters)."
              : code === "AI_UNAVAILABLE"
                ? "AI service is temporarily unavailable. Please try again."
                : code === "INVALID_DRAFT"
                  ? "The AI could not produce a valid draft from this text. Please rephrase your plan."
                  : "Draft generation failed. Please try again.";
        setDraftState({ draft: null, loading: false, error: msg });
      }
    } catch {
      setDraftState({
        draft: null,
        loading: false,
        error: "Network error. Please check your connection and try again.",
      });
    }
  }

  // Derived values
  const walletAddress = getWalletAddress(
    user as { linkedAccounts?: Array<{ type: string; address?: string }> } | null,
  );
  const isStale = evidenceAge !== null && evidenceAge > 60;
  const charCount = operatorText.length;
  const canGenerate =
    authenticated && !draftState.loading && charCount > 0 && charCount <= 1000;

  // ── Auth controls node (inlined in nav to avoid component-in-render lint) ──
  // No static env-var check here — module-scope NEXT_PUBLIC_ reads can freeze
  // to the wrong value during static prerendering and cause a false error state.
  // A missing PrivyProvider (env var absent) is caught by the 10 s timeout.
  const authControlsNode = authenticated && ready && user ? (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      {walletAddress && (
        <span
          style={{
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            color: "rgba(253,255,252,0.7)",
          }}
          aria-label={`Wallet: ${walletAddress}`}
          title={walletAddress}
        >
          {shortAddress(walletAddress)}
        </span>
      )}
      <button
        onClick={() => void logout()}
        style={{
          padding: "8px 16px",
          minHeight: "44px",
          borderRadius: "var(--radius-control)",
          border: "1px solid rgba(253,255,252,0.25)",
          background: "transparent",
          color: "var(--text-inverse)",
          fontSize: "13px",
          fontFamily: "var(--font-sans)",
          fontWeight: 500,
          cursor: "pointer",
        }}
        aria-label="Log out of ExitLane"
      >
        Log out
      </button>
    </div>
  ) : privyTimedOut ? (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span
        role="alert"
        style={{
          fontSize: "12px",
          color: "#ff7088",
          fontFamily: "var(--font-sans)",
        }}
        title="Check: Privy dashboard → Allowed origins → http://localhost:3000"
      >
        ⚠ Auth failed to load
      </span>
      <button
        onClick={() => { window.location.reload(); }}
        style={{
          padding: "6px 14px",
          minHeight: "44px",
          borderRadius: "var(--radius-control)",
          border: "1px solid rgba(253,255,252,0.3)",
          background: "transparent",
          color: "var(--text-inverse)",
          fontSize: "12px",
          fontFamily: "var(--font-sans)",
          cursor: "pointer",
        }}
        aria-label="Reload page to retry Privy initialization"
      >
        Reload
      </button>
    </div>
  ) : (
    <button
      onClick={() => { if (ready) void login(); }}
      disabled={!ready}
      style={{
        padding: "10px 22px",
        minHeight: "44px",
        borderRadius: "var(--radius-control)",
        border: "none",
        background: ready ? "var(--action-primary)" : "rgba(253,255,252,0.1)",
        color: ready ? "#011627" : "rgba(253,255,252,0.4)",
        fontSize: "14px",
        fontFamily: "var(--font-sans)",
        fontWeight: 700,
        cursor: ready ? "pointer" : "default",
        transition: "background var(--duration-fast) var(--ease-standard)",
        letterSpacing: "-0.01em",
      }}
      aria-label={ready ? "Log in to ExitLane" : "Connecting to auth provider…"}
      aria-busy={!ready}
    >
      {ready ? "Log in" : "Connecting…"}
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface-canvas)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── Navigation ──────────────────────────────────────────────────────── */}
      <nav
        aria-label="ExitLane site navigation"
        style={{
          background: "var(--surface-inverse)",
          borderBottom: "1px solid rgba(253,255,252,0.08)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            padding: "0 24px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          {/* Logo lockup — official asset */}
          <div style={{ flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/exitlane-logo.png"
              alt="ExitLane"
              style={{ height: "34px", width: "auto", display: "block" }}
            />
          </div>

          {/* Right side: env badge + auth */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <EnvBadge />
            {authControlsNode}
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          /* Corridor image: left text area is solid Midnight; right half reveals the image */
          backgroundImage:
            "linear-gradient(to right, #011627 42%, rgba(1,22,39,0.75) 65%, rgba(1,22,39,0.15) 100%), url('/exitlane-hero.png')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
          backgroundRepeat: "no-repeat",
          color: "var(--text-inverse)",
          borderBottom: "1px solid rgba(253,255,252,0.08)",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            padding: "72px 24px 0",
          }}
        >
          {/* Eyebrow */}
          <p
            style={{
              margin: "0 0 28px",
              fontSize: "12px",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--action-primary)",
            }}
          >
            Treasury safety system&nbsp;/&nbsp;ETHOnline 2026
          </p>

          {/* Headline */}
          <h1
            style={{
              margin: "0 0 28px",
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(42px, 6vw, 72px)",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--text-inverse)",
              maxWidth: "680px",
            }}
          >
            Your treasury&rsquo;s{" "}
            <span
              style={{
                fontStyle: "italic",
                borderBottom: "3px solid var(--action-primary)",
                paddingBottom: "4px",
              }}
            >
              pre-authorized way out.
            </span>
          </h1>

          {/* Supporting copy */}
          <p
            style={{
              margin: "0 0 0",
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(16px, 2vw, 19px)",
              lineHeight: 1.65,
              color: "rgba(253,255,252,0.70)",
              maxWidth: "560px",
            }}
          >
            ExitLane lets a treasury agree on an emergency sale before markets
            move. When the chosen price is reached, every signed rule is checked
            before any funds can move.
          </p>

          {/* Principles row */}
          <div
            className="principles-row"
            style={{
              marginTop: "52px",
              borderTop: "1px solid rgba(253,255,252,0.12)",
            }}
          >
            {[
              ["01", "Permission is clear"],
              ["02", "Proof comes first"],
              ["03", "Software checks; AI explains"],
            ].map(([num, text]) => (
              <div
                key={num}
                style={{
                  padding: "20px 0",
                  borderTop: "1px solid rgba(253,255,252,0.08)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--action-primary)",
                    letterSpacing: "0.08em",
                    marginRight: "10px",
                  }}
                >
                  {num}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "rgba(253,255,252,0.75)",
                  }}
                >
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Operator workspace ───────────────────────────────────────────────── */}
      <main
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "56px 24px 80px",
        }}
      >
        {/* Status row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "44px",
            flexWrap: "wrap",
          }}
        >
          <DraftBadge />
          <span
            style={{
              fontSize: "13px",
              fontFamily: "var(--font-sans)",
              color: "var(--text-muted)",
            }}
          >
            Software checks; AI explains.
          </span>
        </div>

        {/* ── Top: Plan + Proof side by side on desktop ───────────────────── */}
        <div className="workspace-top">

          {/* ── Section 1: Plan ───────────────────────────────────────────── */}
          <section aria-labelledby="section-plan-title">
            {/* Section header */}
            <div
              style={{
                borderBottom: "2px solid var(--border-strong)",
                paddingBottom: "16px",
                marginBottom: "28px",
              }}
            >
              <p
                style={{
                  margin: "0 0 6px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Section 01
              </p>
              <h2
                id="section-plan-title"
                style={{
                  margin: 0,
                  fontFamily: "var(--font-serif)",
                  fontSize: "clamp(26px, 3vw, 34px)",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                Plan
              </h2>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: "15px",
                  fontFamily: "var(--font-sans)",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                Describe your emergency exit in plain language. The AI will
                extract the economic terms. You review and sign the final
                mandate.
              </p>
            </div>

            {/* Auth gate notice */}
            {ready && !authenticated && (
              <div
                role="status"
                style={{
                  padding: "14px 18px",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--surface-elevated)",
                  marginBottom: "20px",
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                Log in to generate a mandate draft.
              </div>
            )}

            {/* Plan textarea */}
            <div>
              <label
                htmlFor="operator-plan"
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                Emergency plan
              </label>
              <textarea
                id="operator-plan"
                value={operatorText}
                onChange={(e) => setOperatorText(e.target.value)}
                disabled={!authenticated}
                rows={6}
                maxLength={1000}
                placeholder={EXAMPLE_PLAN}
                aria-describedby="plan-help plan-count"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "16px",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "4px",
                  background: authenticated
                    ? "var(--surface-elevated)"
                    : "#f7f8f7",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-sans)",
                  fontSize: "15px",
                  lineHeight: 1.7,
                  resize: "vertical",
                  minHeight: "120px",
                  boxSizing: "border-box",
                  opacity: authenticated ? 1 : 0.6,
                  cursor: authenticated ? "text" : "not-allowed",
                  outline: "none",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginTop: "8px",
                  gap: "12px",
                }}
              >
                <p
                  id="plan-help"
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    margin: 0,
                    lineHeight: 1.5,
                    fontStyle: "italic",
                  }}
                >
                  E.g.&nbsp;&ldquo;{EXAMPLE_PLAN}&rdquo;
                </p>
                <span
                  id="plan-count"
                  aria-live="polite"
                  style={{
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    color:
                      charCount > 1000
                        ? "var(--status-danger)"
                        : "var(--text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {charCount}/1000
                </span>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={() => { void handleGenerateDraft(); }}
              disabled={!canGenerate}
              aria-label={
                !authenticated
                  ? "Log in to generate a mandate draft"
                  : !operatorText.trim()
                    ? "Enter your emergency plan first"
                    : draftState.loading
                      ? "Generating draft…"
                      : "Generate mandate draft"
              }
              aria-busy={draftState.loading}
              style={{
                display: "block",
                width: "100%",
                marginTop: "20px",
                padding: "16px 20px",
                minHeight: "52px",
                borderRadius: "var(--radius-control)",
                border: "none",
                background: canGenerate
                  ? "var(--action-primary)"
                  : "var(--border-subtle)",
                color: canGenerate ? "#011627" : "var(--text-muted)",
                fontSize: "15px",
                fontFamily: "var(--font-sans)",
                fontWeight: 700,
                cursor: canGenerate ? "pointer" : "not-allowed",
                transition: "background var(--duration-fast) var(--ease-standard)",
                letterSpacing: "-0.01em",
              }}
            >
              {draftState.loading ? "Generating draft…" : "Generate mandate draft"}
            </button>

            {/* Draft error */}
            {draftState.error && (
              <div
                role="alert"
                style={{
                  marginTop: "14px",
                  padding: "14px 16px",
                  border: "1px solid var(--status-danger)",
                  background: "rgba(255,0,34,0.04)",
                  fontSize: "14px",
                  color: "var(--status-danger)",
                  lineHeight: 1.5,
                }}
              >
                {draftState.error}
              </div>
            )}
          </section>

          {/* ── Section 2: Proof ──────────────────────────────────────────── */}
          <section aria-labelledby="section-proof-title">
            {/* Section header */}
            <div
              style={{
                borderBottom: "2px solid var(--border-strong)",
                paddingBottom: "16px",
                marginBottom: "28px",
              }}
            >
              <p
                style={{
                  margin: "0 0 6px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Section 02
              </p>
              <h2
                id="section-proof-title"
                style={{
                  margin: 0,
                  fontFamily: "var(--font-serif)",
                  fontSize: "clamp(26px, 3vw, 34px)",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                Proof
              </h2>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: "15px",
                  fontFamily: "var(--font-sans)",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                Live WETH/USDC evidence from The Graph — Uniswap v3, Base
                mainnet. Evidence only; does not authorize execution.
              </p>
            </div>

            {/* Evidence panel */}
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                background: "var(--surface-elevated)",
                boxShadow: "var(--shadow-panel)",
                padding: "24px",
              }}
            >
              {evidence ? (
                <>
                  {/* Price — prominent */}
                  <div style={{ marginBottom: "20px" }}>
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: "11px",
                        fontFamily: "var(--font-sans)",
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      WETH / USDC
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "clamp(32px, 4vw, 44px)",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          letterSpacing: "-0.02em",
                          lineHeight: 1,
                        }}
                        aria-label={`WETH price: ${formatPrice(evidence.evidence.price, evidence.evidence.priceScale)}`}
                      >
                        {formatPrice(
                          evidence.evidence.price,
                          evidence.evidence.priceScale,
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: "13px",
                          fontFamily: "var(--font-sans)",
                          color: isStale
                            ? "var(--status-watch)"
                            : "var(--text-muted)",
                          fontWeight: isStale ? 600 : 400,
                        }}
                        role="status"
                        aria-live="polite"
                        aria-label={
                          evidenceAge !== null
                            ? `Evidence is ${evidenceAge} seconds old`
                            : "Loading evidence age"
                        }
                      >
                        {evidenceAge !== null
                          ? `${evidenceAge}s old${isStale ? " · stale" : ""}`
                          : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Provenance grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                      paddingTop: "20px",
                      borderTop: "1px solid var(--border-subtle)",
                    }}
                  >
                    {[
                      {
                        label: "Source",
                        value: evidence.provenance.provider,
                        mono: false,
                      },
                      {
                        label: "Indexed block",
                        value: `#${evidence.evidence.indexedBlock}`,
                        mono: true,
                      },
                      {
                        label: "Pool",
                        value: shortAddress(evidence.provenance.poolAddress),
                        mono: true,
                      },
                      {
                        label: "Fetched",
                        value: new Date(evidence.fetchedAt).toLocaleTimeString(),
                        mono: true,
                      },
                    ].map(({ label, value, mono }) => (
                      <div key={label}>
                        <p
                          style={{
                            margin: "0 0 2px",
                            fontSize: "11px",
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-sans)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {label}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            fontFamily: mono
                              ? "var(--font-mono)"
                              : "var(--font-sans)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : evidenceError ? (
                <div role="status" aria-live="polite">
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: "14px",
                      fontFamily: "var(--font-sans)",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Evidence unavailable
                  </p>
                  <p
                    style={{
                      margin: "0 0 16px",
                      fontSize: "13px",
                      color: "var(--status-danger)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {evidenceError}
                  </p>
                  <button
                    onClick={() => {
                      setEvidenceRetry((c) => c + 1);
                      setEvidenceError(null);
                    }}
                    style={{
                      padding: "8px 18px",
                      minHeight: "44px",
                      borderRadius: "var(--radius-control)",
                      border: "1px solid var(--border-strong)",
                      background: "transparent",
                      color: "var(--text-primary)",
                      fontSize: "13px",
                      fontFamily: "var(--font-sans)",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                    aria-label="Retry loading market evidence"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                /* Loading skeleton */
                <div
                  role="status"
                  aria-live="polite"
                  aria-label="Loading market evidence"
                >
                  <div
                    style={{
                      height: "44px",
                      width: "160px",
                      borderRadius: "4px",
                      background: "var(--border-subtle)",
                      marginBottom: "16px",
                    }}
                  />
                  <div
                    style={{
                      height: "13px",
                      width: "220px",
                      borderRadius: "4px",
                      background: "var(--border-subtle)",
                    }}
                  />
                  <span className="sr-only">Loading market evidence…</span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Section 3: Outcome — full width ─────────────────────────────── */}
        <section
          aria-labelledby="section-outcome-title"
          style={{ marginTop: "60px" }}
        >
          {/* Section header */}
          <div
            style={{
              borderBottom: "2px solid var(--border-strong)",
              paddingBottom: "16px",
              marginBottom: "28px",
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Section 03
            </p>
            <h2
              id="section-outcome-title"
              style={{
                margin: 0,
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(26px, 3vw, 34px)",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Outcome
            </h2>
          </div>

          {draftState.draft ? (
            <>
              {/* AI-generated label + summary */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 12px",
                    border: "1px solid var(--action-primary)",
                    background: "rgba(65,234,212,0.08)",
                    color: "var(--action-primary)",
                    fontSize: "12px",
                    fontFamily: "var(--font-sans)",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                  aria-label="This draft was generated by AI and requires human review"
                >
                  AI-generated draft
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    fontFamily: "var(--font-sans)",
                    color: "var(--text-muted)",
                  }}
                >
                  Untrusted — review before signing
                </span>
              </div>

              {/* Summary box */}
              {draftState.draft.summary && (
                <div
                  style={{
                    padding: "16px 20px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-elevated)",
                    fontSize: "15px",
                    fontFamily: "var(--font-sans)",
                    color: "var(--text-secondary)",
                    lineHeight: 1.65,
                    marginBottom: "24px",
                  }}
                >
                  {draftState.draft.summary}
                </div>
              )}

              {/* Extracted fields */}
              <div
                style={{
                  border: "1px solid var(--border-subtle)",
                  background: "var(--surface-elevated)",
                  boxShadow: "var(--shadow-panel)",
                  padding: "0 24px",
                  maxWidth: "680px",
                }}
              >
                <FieldRow
                  label="Input asset"
                  value={draftState.draft.inputAssetSymbol.value}
                  sourceSpan={draftState.draft.inputAssetSymbol.sourceSpan}
                />
                <FieldRow
                  label="Output asset"
                  value={draftState.draft.outputAssetSymbol.value}
                  sourceSpan={draftState.draft.outputAssetSymbol.sourceSpan}
                />
                <FieldRow
                  label="Maximum input amount"
                  value={
                    draftState.draft.maxInputAmount.value
                      ? `${draftState.draft.maxInputAmount.value} ${draftState.draft.inputAssetSymbol.value ?? ""}`
                      : null
                  }
                  sourceSpan={draftState.draft.maxInputAmount.sourceSpan}
                />
                <FieldRow
                  label="Trigger condition"
                  value={
                    draftState.draft.triggerComparator.value
                      ? "Price at or below (≤)"
                      : null
                  }
                  sourceSpan={draftState.draft.triggerComparator.sourceSpan}
                />
                <FieldRow
                  label="Trigger threshold (USD)"
                  value={
                    draftState.draft.triggerThresholdUsd.value
                      ? `$${draftState.draft.triggerThresholdUsd.value}`
                      : null
                  }
                  sourceSpan={draftState.draft.triggerThresholdUsd.sourceSpan}
                />
                <FieldRow
                  label="Maximum slippage"
                  value={
                    draftState.draft.maxSlippagePercent.value
                      ? `${draftState.draft.maxSlippagePercent.value}%`
                      : null
                  }
                  sourceSpan={draftState.draft.maxSlippagePercent.sourceSpan}
                />
                <FieldRow
                  label="Validity duration"
                  value={
                    draftState.draft.validityDurationMinutes.value
                      ? `${draftState.draft.validityDurationMinutes.value} minutes`
                      : null
                  }
                  sourceSpan={draftState.draft.validityDurationMinutes.sourceSpan}
                />
              </div>

              {/* Missing fields notice */}
              {draftState.draft.missingFields.length > 0 && (
                <div
                  role="status"
                  style={{
                    marginTop: "16px",
                    padding: "14px 20px",
                    border: "1px solid var(--border-strong)",
                    background: "var(--surface-elevated)",
                    fontSize: "14px",
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    maxWidth: "680px",
                  }}
                >
                  <strong style={{ color: "var(--text-primary)" }}>
                    {draftState.draft.missingFields.length} field
                    {draftState.draft.missingFields.length !== 1 ? "s" : ""}{" "}
                    need operator input
                  </strong>
                  {" "}before this mandate can be signed. Edit your plan above to fill in the marked fields.
                </div>
              )}
            </>
          ) : (
            <p
              style={{
                fontSize: "15px",
                fontFamily: "var(--font-sans)",
                color: "var(--text-muted)",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              {draftState.loading
                ? "Generating your mandate draft…"
                : "Enter your emergency plan above and click Generate mandate draft."}
            </p>
          )}

          {/* ── Disabled next-step control ─────────────────────────────────── */}
          <div
            style={{
              marginTop: "40px",
              padding: "24px",
              border: "1px solid var(--border-subtle)",
              background: "var(--surface-elevated)",
              maxWidth: "680px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="4"
                  y="8"
                  width="10"
                  height="8"
                  rx="1.5"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                />
                <path
                  d="M6 8V6a3 3 0 0 1 6 0v2"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "-0.01em",
                }}
              >
                Sign mandate
              </span>
            </div>
            <p
              style={{
                fontSize: "13px",
                fontFamily: "var(--font-sans)",
                color: "var(--text-muted)",
                margin: "0 0 16px",
                lineHeight: 1.6,
              }}
            >
              EIP-712 signing becomes available after trusted router and
              execution configuration are verified (Phase 5). No funds can
              move until the mandate is signed and all policy checks pass.
            </p>
            <button
              disabled
              aria-disabled="true"
              aria-label="Sign and arm mandate — not available until trusted configuration is verified"
              style={{
                display: "block",
                width: "100%",
                padding: "16px 20px",
                minHeight: "52px",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--border-subtle)",
                background: "var(--border-subtle)",
                color: "var(--text-muted)",
                fontSize: "15px",
                fontFamily: "var(--font-sans)",
                fontWeight: 700,
                cursor: "not-allowed",
                letterSpacing: "-0.01em",
              }}
            >
              Sign &amp; arm mandate
            </button>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "24px",
          background: "var(--surface-canvas)",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/exitlane-logo.png"
              alt="ExitLane"
              style={{ height: "20px", width: "auto", opacity: 0.5 }}
            />
            <span
              style={{
                fontSize: "12px",
                fontFamily: "var(--font-sans)",
                color: "var(--text-muted)",
              }}
            >
              ETHOnline 2026
            </span>
          </div>
          <p
            style={{
              fontSize: "12px",
              fontFamily: "var(--font-sans)",
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            No funds move without a signed mandate and all policy checks passing.
          </p>
        </div>
      </footer>
    </div>
  );
}
