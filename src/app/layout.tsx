import type { Metadata } from "next";
import { Literata, Hanken_Grotesk, Fragment_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Design system fonts (docs/DESIGN_SYSTEM.md § Typography):
 *   Literata  — display headings and section titles
 *   Hanken Grotesk — all body copy, labels, UI text
 *   Fragment Mono — prices, addresses, hashes, signed values only
 */
const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fragment",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ExitLane — Pre-authorized emergency exit",
  description:
    "Pre-authorize the emergency plan—not unrestricted wallet access.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${literata.variable} ${hankenGrotesk.variable} ${fragmentMono.variable} h-full`}
    >
      <body
          className="min-h-full flex flex-col"
          suppressHydrationWarning
        >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
