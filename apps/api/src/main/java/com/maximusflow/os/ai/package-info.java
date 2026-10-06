/**
 * Agente de IA: registry de tools, filtro por permissão, confirmação humana,
 * auditoria de tool calls, memória de conversa.
 * Módulo core: só pode depender de common e iam. Descobre tools de outros módulos
 * via Spring (beans com @Tool), nunca por import direto.
 */
@ApplicationModule(allowedDependencies = { "common", "iam" })
package com.maximusflow.os.ai;

import org.springframework.modulith.ApplicationModule;
