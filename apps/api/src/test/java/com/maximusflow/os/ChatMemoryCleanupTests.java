package com.maximusflow.os;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import com.maximusflow.os.ai.internal.persistence.ConversationRepository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/** Chat memory never outlives its conversation, also when the conversation went away outside the app. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ChatMemoryCleanupTests {

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	ConversationRepository conversations;

	@Test
	void memoryWithoutItsConversationIsRemovedAndTheRestKept() {
		UUID owner = this.jdbc.queryForObject("SELECT id FROM users LIMIT 1", UUID.class);
		UUID kept = UUID.randomUUID();
		this.jdbc.update("INSERT INTO ai_conversation (id, user_id, title, created_at, updated_at) VALUES (?, ?, '', now(), now())",
				kept, owner);
		String orphan = UUID.randomUUID().toString();
		remember(kept.toString());
		remember(orphan);

		int removed = this.conversations.deleteOrphanMemory();

		assertThat(removed).isGreaterThanOrEqualTo(1);
		assertThat(count(orphan)).isZero();
		assertThat(count(kept.toString())).isEqualTo(1);
	}

	private void remember(String conversationId) {
		this.jdbc.update("INSERT INTO spring_ai_chat_memory (conversation_id, content, type, \"timestamp\", sequence_id)"
				+ " VALUES (?, 'oi', 'USER', ?, 1)", conversationId, Timestamp.from(Instant.now()));
	}

	private int count(String conversationId) {
		Integer rows = this.jdbc.queryForObject("SELECT count(*) FROM spring_ai_chat_memory WHERE conversation_id = ?",
				Integer.class, conversationId);
		return rows == null ? 0 : rows;
	}

}
