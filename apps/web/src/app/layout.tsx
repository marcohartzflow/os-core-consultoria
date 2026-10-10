import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { headers } from "next/headers";
import { PRODUCT_NAME } from "@/core/brand";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import "./brand.css";
import { cn } from "@/lib/utils";

// shadcn maps `font-sans` to --font-sans and `font-mono` to --font-geist-mono (see globals.css).
// Applying a preset with a different font rewrites both this file and globals.css.
const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const fontMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "Portal único da empresa",
};

// Every page renders per request so the CSP nonce generated in proxy.ts is applied to scripts.
// The portal sits behind a login; static prerendering would buy nothing here.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // next-themes sets the theme class before the first paint with an inline script; the CSP only
  // runs it with the request nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange nonce={nonce}>
          <TooltipProvider>
            {children}
            <Toaster closeButton position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
