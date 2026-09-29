import { Command, LockKeyhole } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh p-2 lg:grid-cols-2">
      <div className="relative order-2 hidden rounded-3xl bg-primary lg:flex">
        <div className="absolute top-10 space-y-1 px-10 text-primary-foreground">
          <Command className="size-10" />
          <h1 className="text-2xl font-medium">OS</h1>
          <p className="text-sm">Portal único da empresa.</p>
        </div>
        <div className="absolute bottom-10 flex w-full justify-between px-10">
          <div className="flex-1 space-y-1 text-primary-foreground">
            <h2 className="flex items-center gap-2 font-medium">
              <LockKeyhole className="size-4" />
              Dados confidenciais
            </h2>
            <p className="text-sm">Cada acesso é registrado na auditoria. Não compartilhe sua senha.</p>
          </div>
          <Separator orientation="vertical" className="mx-3 h-auto! bg-primary-foreground/30" />
          <div className="flex-1 space-y-1 text-primary-foreground">
            <h2 className="font-medium">Precisa de ajuda?</h2>
            <p className="text-sm">Fale com um administrador do portal para receber ou recuperar acesso.</p>
          </div>
        </div>
      </div>
      <div className="relative order-1 flex flex-col">
        <div className="flex items-center gap-2 px-6 pt-5 font-medium lg:hidden">
          <Command className="size-5" />
          OS
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full sm:w-[350px]">{children}</div>
        </div>
        <div className="px-10 pb-5 text-sm text-muted-foreground">© {new Date().getFullYear()} OS</div>
      </div>
    </main>
  );
}
