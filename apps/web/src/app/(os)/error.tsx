"use client";

import Link from "next/link";
import { House, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

// Renders inside the portal shell when a screen crashes. The message itself is not shown: it may
// carry internals; the digest lets support find the server log entry.
export default function ScreenError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>Esta tela encontrou um erro</EmptyTitle>
        <EmptyDescription>
          Algo inesperado aconteceu ao montar a página. Tente de novo; se continuar, avise o suporte
          {error.digest ? (
            <>
              {" "}
              informando o código <code className="font-mono">{error.digest}</code>
            </>
          ) : null}
          .
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button onClick={retry}>
          <RotateCw data-icon="inline-start" />
          Tentar novamente
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">
            <House data-icon="inline-start" />
            Ir para o início
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
