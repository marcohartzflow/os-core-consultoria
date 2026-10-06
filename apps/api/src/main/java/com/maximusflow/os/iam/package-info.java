/**
 * Identity and Access Management: usuários, roles, permissões.
 * Módulo core: só pode depender de common.
 */
@ApplicationModule(allowedDependencies = { "common" })
package com.maximusflow.os.iam;

import org.springframework.modulith.ApplicationModule;
