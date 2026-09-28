package com.maximusflow.os.auth.internal;

import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.UserDirectory;

import org.springframework.stereotype.Service;

@Service
public class SessionAdminService {

	private final UserDirectory userDirectory;

	private final SessionTerminator sessions;

	private final AuditRecorder audit;

	SessionAdminService(UserDirectory userDirectory, SessionTerminator sessions, AuditRecorder audit) {
		this.userDirectory = userDirectory;
		this.sessions = sessions;
		this.audit = audit;
	}

	@RequiresPermission(value = "auth.session.terminate", description = "Encerrar sessões de outros usuários")
	public int terminateAll(UUID userId) {
		AccountSnapshot account = this.userDirectory.findById(userId)
			.orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
		int count = this.sessions.terminateAll(account.email());
		this.audit.record("auth.sessions.terminated_by_admin", "user", userId.toString(), Map.of("count", count));
		return count;
	}

}
