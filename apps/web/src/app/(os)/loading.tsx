import { DashboardSkeleton } from "@/core/ui/page-skeleton";

// Shown inside the shell while the next screen loads. Every route is dynamic (the CSP nonce), and
// Next prefetches a dynamic route only up to its loading boundary: without this file, a click
// waits on the server with no feedback. Screens with another shape have their own loading.tsx.
export default function Loading() {
  return <DashboardSkeleton />;
}
