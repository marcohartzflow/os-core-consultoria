import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// shadcn maps `font-sans` to --font-sans and `font-mono` to --font-geist-mono (see globals.css).
// Applying a preset with a different font rewrites both this file and globals.css.
const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fontMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "OS", template: "%s · OS" },
  description: "Portal único da empresa",
};

// Every page renders per request so the CSP nonce generated in proxy.ts is applied to scripts.
// The portal sits behind a login; static prerendering would buy nothing here.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
