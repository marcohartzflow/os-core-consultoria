"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// From the shadcn/ui dark mode guide for Next.js.
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
