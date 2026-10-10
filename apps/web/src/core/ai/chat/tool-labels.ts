/**
 * Names people read for the assistant's tools; a tool not listed shows its own name. A client module
 * adds its tools here when it registers them.
 */
const LABELS: Record<string, string> = {
  consultoria_projetos: "Consultar os projetos",
  consultoria_reunioes: "Ler as reuniões transcritas",
  consultoria_horas: "Comparar horas lançadas com o orçado",
  consultoria_entregaveis: "Consultar os entregáveis",
  consultoria_avisos: "Ler os avisos da IA",
  tasks_list: "Listar tarefas",
  tasks_get: "Ver uma tarefa",
  tasks_create: "Criar tarefa",
  tasks_complete: "Concluir tarefa",
  tasks_delete: "Excluir tarefa",
  iam_list_users: "Listar usuários",
  iam_get_user: "Ver um usuário",
  iam_list_roles: "Listar roles",
  iam_disable_user: "Desativar usuário",
  audit_search: "Consultar a auditoria",
};

export function toolLabel(name: string) {
  return LABELS[name] ?? name;
}
