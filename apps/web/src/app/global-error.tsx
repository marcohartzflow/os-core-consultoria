"use client";

import "./globals.css";
import { PRODUCT_NAME } from "@/core/brand";
import { ScreenError } from "@/core/ui/screen-error";

// Replaces the root layout when it (or a group layout: the session loader, the shell) crashes, where
// no error.tsx can catch it. It renders its own document, so it brings the global styles itself;
// the theme class set by next-themes is not there, so it shows in the light theme.
export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-svh items-center justify-center font-sans antialiased">
        <title>{`Erro · ${PRODUCT_NAME}`}</title>
        <ScreenError {...props} />
      </body>
    </html>
  );
}
