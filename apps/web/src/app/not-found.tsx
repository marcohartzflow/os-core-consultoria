import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">Página não encontrada.</h1>
      <p className="text-muted-foreground">O endereço não existe ou foi movido.</p>
      <Button variant="outline" className="mt-2" asChild>
        <Link replace href="/">
          Voltar ao início
        </Link>
      </Button>
    </div>
  );
}
