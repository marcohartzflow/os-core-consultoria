/**
 * Autenticação: login por sessão, convite, definição e troca de senha, logout.
 * Módulo core: só pode depender de common e iam.
 */
@ApplicationModule(allowedDependencies = { "common", "iam" })
package com.maximusflow.os.auth;

import org.springframework.modulith.ApplicationModule;
