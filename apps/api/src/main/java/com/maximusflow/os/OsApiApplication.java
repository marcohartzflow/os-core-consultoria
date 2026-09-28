package com.maximusflow.os;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class OsApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(OsApiApplication.class, args);
	}

}
