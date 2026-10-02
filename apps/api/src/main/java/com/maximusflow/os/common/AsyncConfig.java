package com.maximusflow.os.common;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * {@code @EnableAsync} is required by Spring Modulith's {@code @ApplicationModuleListener}
 * (asynchronous, after commit); {@code @EnableScheduling} runs the retention cleanups.
 */
@Configuration(proxyBeanMethods = false)
@EnableAsync
@EnableScheduling
class AsyncConfig {

}
