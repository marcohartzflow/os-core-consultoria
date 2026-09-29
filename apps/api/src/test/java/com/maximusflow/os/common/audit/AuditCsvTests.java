package com.maximusflow.os.common.audit;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The CSV export is opened in spreadsheets: no cell may start a formula, and quoting is RFC 4180. */
class AuditCsvTests {

	@Test
	void formulaPrefixesAreNeutralized() {
		assertThat(AuditQueryService.csv("=HYPERLINK(\"http://evil\")")).isEqualTo("\"'=HYPERLINK(\"\"http://evil\"\")\"");
		assertThat(AuditQueryService.csv("+1")).isEqualTo("\"'+1\"");
		assertThat(AuditQueryService.csv("-1")).isEqualTo("\"'-1\"");
		assertThat(AuditQueryService.csv("@SUM(A1)")).isEqualTo("\"'@SUM(A1)\"");
		assertThat(AuditQueryService.csv("\tcmd")).isEqualTo("\"'\tcmd\"");
		assertThat(AuditQueryService.csv("\rcmd")).isEqualTo("\"'\rcmd\"");
	}

	@Test
	void ordinaryValuesAreQuotedAndNullIsEmpty() {
		assertThat(AuditQueryService.csv("iam.user.invited")).isEqualTo("\"iam.user.invited\"");
		assertThat(AuditQueryService.csv("a,b\nc")).isEqualTo("\"a,b\nc\"");
		assertThat(AuditQueryService.csv(null)).isEmpty();
	}

}
