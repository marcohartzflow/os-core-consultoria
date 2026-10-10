import { COMPANY } from "@/core/brand";
import { cn } from "@/lib/utils";

/**
 * The client's wordmark: the logo file from COMPANY.logo, or the company name as text when there is none.
 * `onPrimary` is for surfaces painted with the brand colour (sign-in panel): a dark logo turns white there.
 */
export function BrandLogo({ className, onPrimary = false }: { className?: string; onPrimary?: boolean }) {
  if (!COMPANY.logo) {
    return (
      // The caller's height is sized for an image; text keeps its own line box, or a parent that
      // truncates (the sidebar button) clips the top of the letters.
      <span className={cn(className, "h-auto py-0.5 font-semibold leading-tight tracking-tight whitespace-nowrap", onPrimary && "text-primary-foreground")}>
        {COMPANY.name}
      </span>
    );
  }
  const invert = COMPANY.logoIsDark ? (onPrimary ? "invert" : "dark:invert") : "";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static wordmark, no optimisation needed
    <img src={COMPANY.logo} alt={COMPANY.fullName} className={cn("w-auto shrink-0", invert, className)} />
  );
}
