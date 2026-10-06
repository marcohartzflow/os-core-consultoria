package com.maximusflow.os.common.paging;

import java.util.Locale;
import java.util.Map;

import com.maximusflow.os.common.error.InvalidRequestException;

import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.util.StringUtils;

/**
 * The one way every listing of the API turns {@code page}, {@code size} and {@code sort} query
 * parameters into a {@link Pageable}. Sorting accepts only the names a listing declares (an API
 * name mapped to an entity property): nobody can order a table by a column the listing does not
 * show, such as a password hash, and learn its values from the order. A tie-breaker on the id keeps
 * pages stable when many rows share the sorted value.
 */
public final class PageQuery {

	public static final int DEFAULT_SIZE = 20;

	public static final int MAX_SIZE = 100;

	public static final int MAX_PAGE = 10_000;

	private PageQuery() {
	}

	/**
	 * @param sort {@code name} or {@code name,asc|desc}; null or blank uses {@code defaultSort}
	 * @param sortable API name to entity property
	 */
	public static Pageable of(int page, int size, @Nullable String sort, Map<String, String> sortable,
			Sort defaultSort) {
		if (page < 0 || page > MAX_PAGE) {
			throw new InvalidRequestException("Página fora do intervalo permitido");
		}
		if (size < 1 || size > MAX_SIZE) {
			throw new InvalidRequestException("O tamanho da página deve ficar entre 1 e " + MAX_SIZE);
		}
		return PageRequest.of(page, size, parse(sort, sortable, defaultSort).and(Sort.by("id")));
	}

	private static Sort parse(@Nullable String sort, Map<String, String> sortable, Sort defaultSort) {
		if (!StringUtils.hasText(sort)) {
			return defaultSort;
		}
		String[] parts = sort.split(",", -1);
		String property = sortable.get(parts[0].strip());
		if (property == null || parts.length > 2) {
			throw new InvalidRequestException("Ordenação não permitida: use um de " + String.join(", ", sortable.keySet()));
		}
		String direction = parts.length == 2 ? parts[1].strip().toLowerCase(Locale.ROOT) : "asc";
		return switch (direction) {
			case "asc" -> Sort.by(Sort.Order.asc(property).nullsLast());
			case "desc" -> Sort.by(Sort.Order.desc(property).nullsLast());
			default -> throw new InvalidRequestException("Direção de ordenação deve ser asc ou desc");
		};
	}

	/**
	 * A LIKE pattern that matches {@code text} anywhere, typed characters taken literally: % and _
	 * are not wildcards for the person searching. Use with {@link #LIKE_ESCAPE}.
	 */
	public static String contains(String text) {
		return "%" + literal(text.strip().toLowerCase(Locale.ROOT)) + "%";
	}

	/** Same as {@link #contains} but anchored at the start (case kept). */
	public static String startsWith(String text) {
		return literal(text.strip()) + "%";
	}

	public static final char LIKE_ESCAPE = '\\';

	static String literal(String text) {
		return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

}
