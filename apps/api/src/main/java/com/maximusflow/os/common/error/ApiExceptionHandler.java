package com.maximusflow.os.common.error;

import java.util.LinkedHashMap;
import java.util.Map;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
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

	@ExceptionHandler(NotFoundException.class)
	ProblemDetail notFound(NotFoundException ex) {
		return problem(HttpStatus.NOT_FOUND, "Não encontrado", ex.getMessage());
	}

	@ExceptionHandler(ConflictException.class)
	ProblemDetail conflict(ConflictException ex) {
		return problem(HttpStatus.CONFLICT, "Conflito", ex.getMessage());
	}

	@ExceptionHandler(InvalidRequestException.class)
	ProblemDetail invalidRequest(InvalidRequestException ex) {
		return problem(HttpStatus.BAD_REQUEST, "Parâmetros inválidos", ex.getMessage());
	}

	@ExceptionHandler(DomainRuleException.class)
	ProblemDetail domainRule(DomainRuleException ex) {
		return problem(HttpStatus.UNPROCESSABLE_CONTENT, "Regra de negócio", ex.getMessage());
	}

	@ExceptionHandler(AuthenticationException.class)
	ProblemDetail unauthenticated(AuthenticationException ex) {
		return problem(HttpStatus.UNAUTHORIZED, "Não autenticado", "Autenticação necessária");
	}

	@ExceptionHandler(AccessDeniedException.class)
	ProblemDetail forbidden(AccessDeniedException ex) {
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

	@ExceptionHandler(Exception.class)
	ProblemDetail unexpected(Exception ex) {
		log.error("Unhandled exception", ex);
		return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Erro interno", "Ocorreu um erro inesperado");
	}

	private static ProblemDetail problem(HttpStatus status, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		return problem;
	}

}
