package com.maximusflow.os.common;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/** Required by Spring Modulith's {@code @ApplicationModuleListener} (asynchronous, after commit). */
@Configuration(proxyBeanMethods = false)
@EnableAsync
class AsyncConfig {

}
