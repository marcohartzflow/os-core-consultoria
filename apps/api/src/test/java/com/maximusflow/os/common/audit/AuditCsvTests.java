package com.maximusflow.os.common.audit;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The CSV export is opened in spreadsheets: no cell may start a formula, and quoting is RFC 4180. */
class AuditCsvTests {

	@Test
	void formulaPrefixesAreNeutralized() {
		assertThat(AuditQueryService.csv("=HYPERLINK(\"http://evil\")")).isEqualTo("\"\t=HYPERLINK(\"\"http://evil\"\")\"");
		assertThat(AuditQueryService.csv("+1")).isEqualTo("\"\t+1\"");
		assertThat(AuditQueryService.csv("-1")).isEqualTo("\"\t-1\"");
		assertThat(AuditQueryService.csv("@SUM(A1)")).isEqualTo("\"\t@SUM(A1)\"");
		assertThat(AuditQueryService.csv("\tcmd")).isEqualTo("\"\t\tcmd\"");
		// A leading line break and the full-width forms some spreadsheets also read as formulas.
		assertThat(AuditQueryService.csv("\n=1")).isEqualTo("\"\t\n=1\"");
		assertThat(AuditQueryService.csv("\uFF1DSUM(A1)")).isEqualTo("\"\t\uFF1DSUM(A1)\"");
		assertThat(AuditQueryService.csv("\uFF20x")).isEqualTo("\"\t\uFF20x\"");
		assertThat(AuditQueryService.csv("\rcmd")).isEqualTo("\"\t\rcmd\"");
	}

	@Test
	void ordinaryValuesAreQuotedAndNullIsEmpty() {
		assertThat(AuditQueryService.csv("iam.user.invited")).isEqualTo("\"iam.user.invited\"");
		assertThat(AuditQueryService.csv("a,b\nc")).isEqualTo("\"a,b\nc\"");
		assertThat(AuditQueryService.csv(null)).isEmpty();
	}

}
