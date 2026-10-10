/**
 * Client the demo's video question is about: the one whose last meetings left requests without an
 * owner in the mock seed (src/mock/consultoria.ts). Kept here as a plain name so the client bundle
 * does not carry the seed.
 */
const CLIENTE_DO_VIDEO = "Ponte Alta";

/** Starting questions for an empty conversation, only for what the person may read. */
export function suggestionsFor(hasPermission: (permission: string) => boolean): [string, string][] {
  return [
    hasPermission("consultoria.reuniao.read") &&
      ([
        `Pedidos da ${CLIENTE_DO_VIDEO}`,
        `O que a ${CLIENTE_DO_VIDEO} pediu nas últimas três reuniões e o que ainda está pendente?`,
      ] as [string, string]),
    hasPermission("consultoria.aviso.read") && (["Resumo do dia", "Me dá o resumo do dia"] as [string, string]),
    hasPermission("consultoria.aviso.read") &&
      (["Renovações", "Quais projetos terminam sem proposta de continuidade?"] as [string, string]),
    hasPermission("consultoria.horas.read") &&
      (["Horas × orçado", "Quais projetos estão passando das horas orçadas?"] as [string, string]),
    hasPermission("tasks.task.read") && (["Tarefas atrasadas", "Quais tarefas estão atrasadas e com quem?"] as [string, string]),
    hasPermission("iam.user.read") &&
      (["Contas em risco", "Quem está com o acesso bloqueado ou sem duas etapas?"] as [string, string]),
    ["Minhas permissões", "Quais são as minhas permissões e o que consigo fazer com elas?"] as [string, string],
  ].filter((s): s is [string, string] => Boolean(s)).slice(0, 4);
}
