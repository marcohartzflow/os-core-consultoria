import { LockKeyhole } from "lucide-react";
import { COMPANY, PRODUCT_NAME } from "@/core/brand";
import { BrandLogo } from "@/core/BrandLogo";
import { Separator } from "@/components/ui/separator";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh p-2 lg:grid-cols-2">
      <div className="relative order-2 hidden rounded-3xl bg-primary lg:flex">
        <div className="absolute top-10 space-y-1 px-10 text-primary-foreground">
          <BrandLogo onPrimary className="h-7 text-2xl" />
          <h1 className="pt-6 text-3xl font-medium tracking-tight">{COMPANY.headline}</h1>
          <p className="max-w-md text-sm text-primary-foreground/70">{COMPANY.pitch}</p>
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
          <BrandLogo className="h-4" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full sm:w-[350px]">{children}</div>
        </div>
        <div className="px-10 pb-5 text-sm text-muted-foreground">© {new Date().getFullYear()} {PRODUCT_NAME}</div>
      </div>
    </main>
  );
}
