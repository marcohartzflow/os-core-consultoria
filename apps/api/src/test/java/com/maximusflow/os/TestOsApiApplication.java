package com.maximusflow.os;

import org.springframework.boot.SpringApplication;

public class TestOsApiApplication {

	public static void main(String[] args) {
		SpringApplication.from(OsApiApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
