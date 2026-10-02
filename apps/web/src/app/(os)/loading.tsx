import { Skeleton } from "@/components/ui/skeleton";

// Shown inside the shell while the next screen loads. Every route is dynamic (the CSP nonce), and
// Next prefetches a dynamic route only up to its loading boundary: without this file, a click
// waits on the server with no feedback.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
