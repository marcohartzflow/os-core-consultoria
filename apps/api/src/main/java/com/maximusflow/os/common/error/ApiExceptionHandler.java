package com.maximusflow.os.common.error;

import java.util.LinkedHashMap;
import java.util.Map;

import com.maximusflow.os.common.logging.Denials;
import com.maximusflow.os.common.logging.Sanitize;

import jakarta.servlet.http.HttpServletRequest;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Maps exceptions to RFC 9457 Problem Details. Never leaks stack traces, internal messages or
 * validation internals for unexpected errors (ASVS 16.5.1).
 */
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	@ExceptionHandler(NotFoundException.class)
	ProblemDetail notFound(NotFoundException ex) {
		return problem(HttpStatus.NOT_FOUND, "Não encontrado", ex.getMessage());
	}

	@ExceptionHandler(ConflictException.class)
	ProblemDetail conflict(ConflictException ex) {
		return problem(HttpStatus.CONFLICT, "Conflito", ex.getMessage());
	}

	/**
	 * A unique or foreign key the database enforced after a check in code passed: two requests raced
	 * (the same e-mail invited twice, a role deleted while being assigned). The code checks first for
	 * a precise message; this is what the loser of the race sees instead of a 500.
	 */
	@ExceptionHandler(DataIntegrityViolationException.class)
	ProblemDetail integrityViolation(DataIntegrityViolationException ex) {
		log.warn("Integrity violation: {}", ex.getMostSpecificCause().getClass().getSimpleName());
		return problem(HttpStatus.CONFLICT, "Conflito",
				"Os dados mudaram enquanto a operação era feita. Atualize a tela e tente de novo");
	}

	@ExceptionHandler(InvalidRequestException.class)
	ProblemDetail invalidRequest(InvalidRequestException ex) {
		return problem(HttpStatus.BAD_REQUEST, "Parâmetros inválidos", ex.getMessage());
	}

	/** The portal shows the title above the detail, so it speaks to the person, not the developer. */
	@ExceptionHandler(DomainRuleException.class)
	ProblemDetail domainRule(DomainRuleException ex) {
		return problem(HttpStatus.UNPROCESSABLE_CONTENT, "Não foi possível concluir", ex.getMessage());
	}

	@ExceptionHandler(AuthenticationException.class)
	ProblemDetail unauthenticated(AuthenticationException ex) {
		return problem(HttpStatus.UNAUTHORIZED, "Não autenticado", "Autenticação necessária");
	}

	@ExceptionHandler(AccessDeniedException.class)
	ProblemDetail forbidden(AccessDeniedException ex, HttpServletRequest request) {
		// Denials of a permission check (@RequiresPermission, reserved actions) go to the security log
		// with the resource asked for and the rule that refused it (ASVS 16.3.2). Request id and client
		// IP come from the MDC (RequestLoggingContextFilter).
		security.warn("access denied method={} uri={} rule={} user={}", Sanitize.forLog(request.getMethod()),
				Sanitize.forLog(request.getRequestURI()), Denials.rule(ex), Sanitize.maskEmail(request.getRemoteUser()));
		return problem(HttpStatus.FORBIDDEN, "Acesso negado", "Você não tem permissão para esta ação");
	}

	@ExceptionHandler(RateLimitedException.class)
	ProblemDetail rateLimited(RateLimitedException ex) {
		return problem(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas", ex.getMessage());
	}

	/**
	 * Invalid request body: one message per field, so the form can point at the field. Only the
	 * field name and the constraint message leave the server, never the rejected value.
	 */
	@Override
	protected @Nullable ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		Map<String, String> errors = new LinkedHashMap<>();
		ex.getBindingResult()
			.getFieldErrors()
			.forEach((error) -> errors.putIfAbsent(error.getField(),
					error.getDefaultMessage() != null ? error.getDefaultMessage() : "valor inválido"));
		ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "Dados inválidos", "Confira os campos destacados");
		problem.setProperty("errors", errors);
		return handleExceptionInternal(ex, problem, headers, status, request);
	}

	/** Invalid query or path parameters (for example a page number out of range). */
	@Override
	protected @Nullable ResponseEntity<Object> handleHandlerMethodValidationException(
			HandlerMethodValidationException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "Parâmetros inválidos",
				"A requisição tem parâmetros fora do permitido");
		return handleExceptionInternal(ex, problem, headers, status, request);
	}

	/** A query or path parameter of the wrong type (an unknown status, a malformed id or date). */
	@Override
	protected @Nullable ResponseEntity<Object> handleTypeMismatch(TypeMismatchException ex, HttpHeaders headers,
			HttpStatusCode status, WebRequest request) {
		ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "Parâmetros inválidos",
				"A requisição tem parâmetros fora do permitido");
		return handleExceptionInternal(ex, problem, headers, status, request);
	}

	/**
	 * The stack trace goes to the log only. Its message can hold request text; in production the log is
	 * structured JSON (logging.structured.format.console in application-prod.yml), whose encoder escapes
	 * CR, LF and every other control character, so it cannot forge a log line (ASVS 16.4.1). The plain
	 * text console of development does not escape it.
	 */
	@ExceptionHandler(Exception.class)
	ProblemDetail unexpected(Exception ex, HttpServletRequest request) {
		log.error("Unhandled exception method={} uri={}", Sanitize.forLog(request.getMethod()),
				Sanitize.forLog(request.getRequestURI()), ex);
		return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Erro interno", "Ocorreu um erro inesperado");
	}

	private static ProblemDetail problem(HttpStatus status, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		return problem;
	}

}
