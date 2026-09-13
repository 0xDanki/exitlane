"use client";

/**
 * Client-only provider wrapper.
 *
 * Renders server-side as a transparent pass-through; all provider logic
 * executes only in the browser. Never import server-only modules here.
 *
 * Tree:
 *   QueryClientProvider (React Query)
 *     └── PrivyProvider
 *           └── {children}
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { useState } from "react";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Stable QueryClient instance per component mount (avoids sharing between SSR renders)
  const [queryClient] = useState(() => new QueryClient());

  // Use the exact static expression that Next.js replaces at bundle time.
  // No ?? "" fallback — a falsy value means the env var is genuinely absent
  // and PrivyProvider should not be mounted (it throws on empty appId).
  // The page handles this via the 10-second privyTimedOut state.
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Diagnostic only — logs presence and length, never the value itself.
  if (typeof window !== "undefined") {
    console.debug(
      "[ExitLane] Privy appId present in client bundle:",
      !!appId,
      "| length:",
      appId?.length ?? 0,
    );
  }

  if (!appId) {
    console.warn(
      "[ExitLane] NEXT_PUBLIC_PRIVY_APP_ID is absent from the client bundle. " +
        "PrivyProvider will not mount. Ensure the variable is set in .env.local " +
        "and the dev server was restarted after it was added.",
    );
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PrivyProvider
        appId={appId}
        config={{
          /**
           * Login via email (passwordless link) or connected external wallet.
           * SMS / social logins are out of scope for the hackathon demo.
           */
          loginMethods: ["email", "wallet"],
          appearance: {
            theme: "light",
          },
          embeddedWallets: {
            /**
             * Create an Ethereum embedded wallet for users who do not already
             * have a wallet. This satisfies the "users-without-wallets" config
             * requirement from docs/ARCHITECTURE.md Phase 4.
             */
            ethereum: {
              createOnLogin: "users-without-wallets",
            },
          },
        }}
      >
        {children}
      </PrivyProvider>
    </QueryClientProvider>
  );
}
