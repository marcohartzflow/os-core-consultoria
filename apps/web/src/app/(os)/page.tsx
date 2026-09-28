"use client";

import { useAuth } from "@/core/auth/AuthProvider";
import { PageHeader } from "@/core/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const { me } = useAuth();
  return (
    <>
      <PageHeader title={`Olá, ${me.name.split(" ")[0]}`} description="Painel inicial do OS." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
            <CardDescription>Atribuídas à sua conta</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{me.roles.length ? me.roles.join(", ") : "Nenhuma"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Permissões</CardTitle>
            <CardDescription>Ações que você pode executar, no portal e pelo agente</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{me.permissions.length}</CardContent>
        </Card>
      </div>
    </>
  );
}
