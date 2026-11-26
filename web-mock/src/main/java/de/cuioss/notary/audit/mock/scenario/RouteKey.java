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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * What a route key or a link names: a method, a path and an optional query. The text form is
 * {@code "METHOD /path"} or {@code "METHOD /path?name=value[&name=value]"}.
 * <p>
 * A key matches a request of the same method and path whose query holds every listed name with exactly the listed
 * (percent-decoded) value; further parameters do not hinder the match, and a key without query matches any query.
 * Of several keys that match, the one with the most listed parameters is the more specific.
 * <p>
 * A path may hold segments {@code {name}} (name {@code [a-z][a-z0-9]*}), each standing for exactly one non-empty path
 * segment of the request; {@link #capture} returns what they stood for. A key without such a segment is an exact path;
 * at the same level an exact path comes before a templated one, then the key with more literal segments, then the one
 * with more listed parameters ({@link #compareSpecificity}).
 *
 * @param method the HTTP method
 * @param path   the path, without query
 * @param query  the required query parameters, decoded, in the order written
 */
public record RouteKey(String method, String path, Map<String, String> query) {

    private static final String TEMPLATE_NAME_REGEX = "[a-z][a-z0-9]*";
    private static final Pattern TEMPLATE_NAME = Pattern.compile(TEMPLATE_NAME_REGEX);
    private static final Pattern TEMPLATE_SEGMENT = Pattern.compile("\\{(" + TEMPLATE_NAME_REGEX + ")}");

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
            String name;
            String value;
            try {
                name = URLDecoder.decode(pair.substring(0, equals), StandardCharsets.UTF_8);
                value = URLDecoder.decode(pair.substring(equals + 1), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException malformedEscape) {
                return Optional.empty();
            }
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
        query.forEach((name, value) -> text.append(encode(name)).append('=').append(encode(value)).append('&'));
        text.setLength(text.length() - 1);
        return text.toString();
    }

    /** Percent-encodes a query component so that {@link #parseQuery(String)} reads it back unchanged. */
    private static String encode(String component) {
        return URLEncoder.encode(component, StandardCharsets.UTF_8);
    }

    /**
     * Whether a request matches this key.
     *
     * @param requestMethod the method of the request
     * @param requestPath   the path of the request, without query
     * @param requestQuery  the decoded parameters of the request (the first value of each name)
     * @return {@code true} when method and path are equal (a {@code {name}} segment matches any one segment) and every
     * listed parameter has the listed value
     */
    public boolean matches(String requestMethod, String requestPath, Map<String, String> requestQuery) {
        return capture(requestMethod, requestPath, requestQuery).isPresent();
    }

    /**
     * Matches a request and returns the segments the template names stood for.
     *
     * @param requestMethod the method of the request
     * @param requestPath   the path of the request, without query
     * @param requestQuery  the decoded parameters of the request
     * @return the captured segments by name (empty for an exact path), or empty when the request does not match
     */
    public Optional<Map<String, String>> capture(String requestMethod, String requestPath,
            Map<String, String> requestQuery) {
        if (!method.equals(requestMethod)
                || !query.entrySet().stream().allMatch(entry -> entry.getValue().equals(requestQuery.get(entry.getKey())))) {
            return Optional.empty();
        }
        if (!isTemplate()) {
            return path.equals(requestPath) ? Optional.of(Map.of()) : Optional.empty();
        }
        String[] own = path.split("/", -1);
        String[] given = requestPath.split("/", -1);
        if (own.length != given.length) {
            return Optional.empty();
        }
        Map<String, String> captured = new LinkedHashMap<>();
        for (int i = 0; i < own.length; i++) {
            var name = templateName(own[i]);
            if (name.isPresent()) {
                if (given[i].isEmpty()) {
                    return Optional.empty();
                }
                captured.put(name.get(), given[i]);
            } else if (!own[i].equals(given[i])) {
                return Optional.empty();
            }
        }
        return Optional.of(Collections.unmodifiableMap(captured));
    }

    /**
     * Whether the path holds a {@code {name}} segment.
     *
     * @return {@code true} for a templated path
     */
    public boolean isTemplate() {
        return path.indexOf('{') >= 0;
    }

    /**
     * The number of non-empty path segments that are no {@code {name}}.
     *
     * @return the literal segments
     */
    public int literalSegments() {
        return (int) Arrays.stream(path.split("/")).filter(segment -> !segment.isEmpty() && templateName(segment).isEmpty())
                .count();
    }

    /**
     * Orders two keys that both match a request: the more specific comes first. An exact path before a templated one;
     * then more literal segments; then more listed query parameters. Keys that are equally specific compare as equal.
     *
     * @param other the other key
     * @return a negative number when this key is more specific, positive when the other is, else {@code 0}
     */
    public int compareSpecificity(RouteKey other) {
        if (isTemplate() != other.isTemplate()) {
            return isTemplate() ? 1 : -1;
        }
        int segments = Integer.compare(other.literalSegments(), literalSegments());
        return segments != 0 ? segments : Integer.compare(other.query.size(), query.size());
    }

    /**
     * Reads a path for its template segments and checks the rules of the scenario format.
     *
     * @param path a path, without query
     * @return the refusal (what is wrong), or empty when every segment is literal or a valid {@code {name}} and no name
     * appears twice
     */
    public static Optional<String> templateRefusal(String path) {
        Set<String> seen = new HashSet<>();
        for (String segment : path.split("/", -1)) {
            if (segment.indexOf('{') < 0 && segment.indexOf('}') < 0) {
                continue;
            }
            if ("{}".equals(segment)) {
                return Optional.of("a template segment has a name, {name}, not {}");
            }
            var name = templateName(segment);
            if (name.isEmpty()) {
                return Optional.of("a path segment is either literal or exactly {name} with a name of "
                        + TEMPLATE_NAME.pattern() + ", never { or } inside text: " + segment);
            }
            if (!seen.add(name.get())) {
                return Optional.of("a template name appears only once in a path: {" + name.get() + "}");
            }
        }
        return Optional.empty();
    }

    private static Optional<String> templateName(String segment) {
        var matcher = TEMPLATE_SEGMENT.matcher(segment);
        return matcher.matches() ? Optional.of(matcher.group(1)) : Optional.empty();
    }
}
