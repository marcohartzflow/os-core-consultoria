/**
 * Módulo de exemplo: tarefas internas. Existe para provar o ciclo completo do OS Core (use case
 * anotado vira REST e tool do agente com a mesma autorização) e para servir de modelo aos módulos
 * de negócio criados no fork de cada cliente. Pode ser removido do fork sem afetar os módulos core.
 * Depende de common e da API pública do iam (nomes dos responsáveis).
 */
@ApplicationModule(allowedDependencies = { "common", "iam" })
package com.maximusflow.os.tasks;

import org.springframework.modulith.ApplicationModule;
