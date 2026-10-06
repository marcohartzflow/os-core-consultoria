/** Starting questions for an empty conversation, only for what the person may read. */
export function suggestionsFor(hasPermission: (permission: string) => boolean): [string, string][] {
  return [
    hasPermission("tasks.task.read") && (["Tarefas atrasadas", "Quais tarefas estão atrasadas e com quem?"] as [string, string]),
    hasPermission("iam.user.read") &&
      (["Contas em risco", "Quem está com o acesso bloqueado ou sem duas etapas?"] as [string, string]),
    hasPermission("audit.event.read") && (["Resumo do dia", "O que aconteceu hoje na auditoria?"] as [string, string]),
    ["Minhas permissões", "Quais são as minhas permissões e o que consigo fazer com elas?"] as [string, string],
  ].filter((s): s is [string, string] => Boolean(s));
}
