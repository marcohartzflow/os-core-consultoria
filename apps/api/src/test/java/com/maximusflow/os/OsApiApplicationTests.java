package com.maximusflow.os;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc // same context configuration as the flow tests, so the suite boots it once
@ActiveProfiles("test")
class OsApiApplicationTests {

	@Test
	void contextLoads() {
	}

}
