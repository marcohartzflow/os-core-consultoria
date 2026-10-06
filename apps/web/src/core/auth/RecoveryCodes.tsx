"use client";

import { Copy, Download, KeyRound } from "lucide-react";
import { saveFile } from "@/core/api/client";
import { notifyError, notifySuccess } from "@/core/ui/feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Shown once after the first factor or a regeneration: each code signs in once without the second factor. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  return (
    <Alert>
      <KeyRound />
      <AlertTitle>Guarde estes códigos de recuperação</AlertTitle>
      <AlertDescription>
        <p>Cada um vale uma vez, para entrar sem o celular ou a chave de acesso. Eles não aparecem de novo.</p>
        <Textarea readOnly aria-label="Códigos de recuperação" className="mt-2 font-mono text-xs" rows={codes.length} value={text} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(text).then(
                () => notifySuccess("Códigos copiados"),
                (e: unknown) => notifyError(e, "Não foi possível copiar"),
              )
            }
          >
            <Copy data-icon="inline-start" />
            Copiar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveFile(new Blob([text + "\n"], { type: "text/plain" }), "codigos-de-recuperacao.txt")}
          >
            <Download data-icon="inline-start" />
            Baixar .txt
          </Button>
          <Button size="sm" onClick={onDone}>
            Já guardei
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
