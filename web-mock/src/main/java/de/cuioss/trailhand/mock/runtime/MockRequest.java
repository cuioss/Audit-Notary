/*
 * Copyright © 2026-present CUI-OpenSource-Software (info@cuioss.de)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package de.cuioss.trailhand.mock.runtime;

import org.jspecify.annotations.Nullable;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * A request as the engine sees it.
 *
 * @param method  the HTTP method
 * @param path    the decoded path, without query
 * @param query   the raw query string, possibly empty
 * @param headers the headers by lower-case name, the first value of each
 * @param body    the body text, possibly empty
 */
public record MockRequest(String method, String path, String query, Map<String, String> headers, String body) {

    /**
     * Copies the headers with lower-case names.
     *
     * @param method  the method
     * @param path    the path
     * @param query   the query
     * @param headers the headers
     * @param body    the body
     */
    public MockRequest {
        Map<String, String> lower = new LinkedHashMap<>();
        headers.forEach((name, value) -> lower.putIfAbsent(name.toLowerCase(Locale.ROOT), value));
        headers = Map.copyOf(lower);
    }

    /**
     * A header value.
     *
     * @param name the header name, in any case
     * @return the first value, or empty
     */
    public Optional<String> header(String name) {
        return Optional.ofNullable(headers.get(name.toLowerCase(Locale.ROOT)));
    }

    /**
     * A query parameter.
     *
     * @param name the parameter name
     * @return the first decoded value, or empty
     */
    public Optional<String> queryParameter(String name) {
        for (String pair : query.split("&")) {
            int equals = pair.indexOf('=');
            String key = equals < 0 ? pair : pair.substring(0, equals);
            if (URLDecoder.decode(key, StandardCharsets.UTF_8).equals(name)) {
                return Optional.of(equals < 0 ? "" : URLDecoder.decode(pair.substring(equals + 1),
                        StandardCharsets.UTF_8));
            }
        }
        return Optional.empty();
    }

    /**
     * A cookie the request carries.
     *
     * @param name the cookie name
     * @return the value, or empty
     */
    public Optional<String> cookie(String name) {
        @Nullable String header = headers.get("cookie");
        if (header == null) {
            return Optional.empty();
        }
        for (String part : header.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith(name + "=")) {
                return Optional.of(trimmed.substring(name.length() + 1));
            }
        }
        return Optional.empty();
    }

    /**
     * Whether the request changes state: every method except {@code GET} and {@code HEAD}.
     *
     * @return {@code true} for a state-changing method
     */
    public boolean isStateChanging() {
        return !"GET".equals(method) && !"HEAD".equals(method);
    }
}
