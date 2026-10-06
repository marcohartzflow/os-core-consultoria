/**
 * Shared kernel: erros, paginação, auditoria base, utilitários.
 * Módulo aberto: qualquer módulo pode depender dele. Ele não depende de nenhum outro.
 */
@ApplicationModule(type = ApplicationModule.Type.OPEN)
package com.maximusflow.os.common;

import org.springframework.modulith.ApplicationModule;
