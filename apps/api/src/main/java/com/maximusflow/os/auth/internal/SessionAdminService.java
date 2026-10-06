package com.maximusflow.os.auth.internal;

import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.UserDirectory;

import org.springframework.stereotype.Service;

@Service
public class SessionAdminService {

	private final UserDirectory userDirectory;

	private final SessionTerminator sessions;

	private final AuditRecorder audit;

	private final CurrentUser currentUser;

	SessionAdminService(UserDirectory userDirectory, SessionTerminator sessions, AuditRecorder audit,
			CurrentUser currentUser) {
		this.currentUser = currentUser;
		this.userDirectory = userDirectory;
		this.sessions = sessions;
		this.audit = audit;
	}

	@RequiresPermission(value = "auth.session.terminate", description = "Encerrar sessões de outros usuários")
	public int terminateAll(UUID userId) {
		if (userId.equals(this.currentUser.require().getId())) {
			throw new DomainRuleException("Para as suas sessões, use Configurações › Sessões");
		}
		AccountSnapshot account = this.userDirectory.findById(userId)
			.orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
		// A delegated operator cannot repeatedly log out someone with more access (an administrator).
		this.userDirectory.assertCanManage(userId);
		int count = this.sessions.terminateAll(account.email());
		this.audit.record("auth.sessions.terminated_by_admin", "user", userId.toString(), Map.of("count", count));
		return count;
	}

}
