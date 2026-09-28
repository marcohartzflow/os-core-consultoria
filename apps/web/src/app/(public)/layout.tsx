import { Card, CardContent } from "@/components/ui/card";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <div className="mb-6 text-center font-heading text-xl font-semibold">OS</div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
