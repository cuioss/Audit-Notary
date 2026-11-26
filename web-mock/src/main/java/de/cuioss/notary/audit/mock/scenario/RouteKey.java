/*
 * Copyright © 2026-present Oliver Wolff
 *
 * SPDX-License-Identifier: FSL-1.1-ALv2
 *
 * Licensed under the Functional Source License, Version 1.1, ALv2 Future License
 * (the "License"); you may not use this file except in compliance with the License.
 * The License is in the file LICENSE.md at the root of this repository and at
 * https://github.com/cuioss/Audit-Notary/blob/main/LICENSE.md.
 */
package de.cuioss.notary.audit.mock.scenario;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * What a route key or a link names: a method, a path and an optional query. The text form is
 * {@code "METHOD /path"} or {@code "METHOD /path?name=value[&name=value]"}.
 * <p>
 * A key matches a request of the same method and path whose query holds every listed name with exactly the listed
 * (percent-decoded) value; further parameters do not hinder the match, and a key without query matches any query.
 * Of several keys that match, the one with the most listed parameters is the more specific.
 *
 * @param method the HTTP method
 * @param path   the path, without query
 * @param query  the required query parameters, decoded, in the order written
 */
public record RouteKey(String method, String path, Map<String, String> query) {

    /**
     * Copies the query in its order.
     *
     * @param method the method
     * @param path   the path
     * @param query  the query
     */
    public RouteKey {
        query = Collections.unmodifiableMap(new LinkedHashMap<>(query));
    }

    /**
     * Parses a key the loader has checked.
     *
     * @param method the method
     * @param target the path, optionally followed by {@code ?} and the query
     * @return the key, or empty when the query breaks the rules of {@link #parseQuery(String)}
     */
    public static Optional<RouteKey> of(String method, String target) {
        int mark = target.indexOf('?');
        if (mark < 0) {
            return Optional.of(new RouteKey(method, target, Map.of()));
        }
        return parseQuery(target.substring(mark + 1)).map(query -> new RouteKey(method, target.substring(0, mark), query));
    }

    /**
     * Reads the query of a key: {@code name=value} pairs split at {@code &}, names and values non-empty, no
     * {@code #}, no name twice.
     *
     * @param raw the text after the {@code ?}
     * @return the decoded parameters in the order written, or empty when a rule is broken
     */
    public static Optional<Map<String, String>> parseQuery(String raw) {
        if (raw.isEmpty() || raw.indexOf('#') >= 0) {
            return Optional.empty();
        }
        Map<String, String> query = new LinkedHashMap<>();
        for (String pair : raw.split("&", -1)) {
            int equals = pair.indexOf('=');
            if (equals <= 0 || equals == pair.length() - 1) {
                return Optional.empty();
            }
            String name = URLDecoder.decode(pair.substring(0, equals), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(equals + 1), StandardCharsets.UTF_8);
            if (name.isEmpty() || value.isEmpty() || query.putIfAbsent(name, value) != null) {
                return Optional.empty();
            }
        }
        return Optional.of(query);
    }

    /**
     * The text form of the target: the path, and the query when there is one.
     *
     * @return {@code path} or {@code path?name=value&...}
     */
    public String target() {
        if (query.isEmpty()) {
            return path;
        }
        var text = new StringBuilder(path).append('?');
        query.forEach((name, value) -> text.append(name).append('=').append(value).append('&'));
        text.setLength(text.length() - 1);
        return text.toString();
    }

    /**
     * Whether a request matches this key.
     *
     * @param requestMethod the method of the request
     * @param requestPath   the path of the request, without query
     * @param requestQuery  the decoded parameters of the request (the first value of each name)
     * @return {@code true} when method and path are equal and every listed parameter has the listed value
     */
    public boolean matches(String requestMethod, String requestPath, Map<String, String> requestQuery) {
        return method.equals(requestMethod) && path.equals(requestPath)
                && query.entrySet().stream().allMatch(entry -> entry.getValue().equals(requestQuery.get(entry.getKey())));
    }
}
