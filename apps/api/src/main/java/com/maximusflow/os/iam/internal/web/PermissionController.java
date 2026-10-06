package com.maximusflow.os.iam.internal.web;

import java.util.List;

import com.maximusflow.os.iam.PermissionDefinition;
import com.maximusflow.os.iam.internal.application.PermissionService;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/iam/permissions")
class PermissionController {

	private final PermissionService service;

	PermissionController(PermissionService service) {
		this.service = service;
	}

	@GetMapping
	List<PermissionDefinition> list() {
		return this.service.list();
	}

}
