package com.maximusflow.os.common.privacy;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Data-subject rights across modules. Authorization is decided by the caller: a person exports
 * their own data from the account screen; an administrator with the permission anonymizes a
 * disabled account.
 */
@Service
public class PersonalDataService {

	private final List<PersonalDataContributor> contributors;

	private final AuditRecorder audit;

	PersonalDataService(List<PersonalDataContributor> contributors, AuditRecorder audit) {
		this.contributors = contributors.stream().sorted(Comparator.comparing(PersonalDataContributor::key)).toList();
		this.audit = audit;
	}

	@Transactional(readOnly = true)
	public Map<String, Object> export(UUID userId, String email) {
		Map<String, Object> sections = new LinkedHashMap<>();
		for (PersonalDataContributor contributor : this.contributors) {
			sections.put(contributor.key(), contributor.export(userId, email));
		}
		this.audit.record("privacy.data.exported", "user", userId.toString(), null);
		return sections;
	}

	@Transactional
	public void erase(UUID userId, String email) {
		for (PersonalDataContributor contributor : this.contributors) {
			contributor.erase(userId, email);
		}
	}

}
