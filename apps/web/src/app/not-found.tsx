import Link from "next/link";
import { House, MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinOff />
          </EmptyMedia>
          <p className="font-mono text-sm text-muted-foreground">404</p>
          <EmptyTitle>Página não encontrada</EmptyTitle>
          <EmptyDescription>O endereço não existe ou foi movido. Confira o link ou volte ao início.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link replace href="/">
              <House data-icon="inline-start" />
              Voltar ao início
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
