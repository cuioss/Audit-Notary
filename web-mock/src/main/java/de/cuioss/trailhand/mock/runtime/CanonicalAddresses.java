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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jspecify.annotations.Nullable;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The canonical addresses of the web app (doc/specification/web-app.adoc, TRH-WEB-3), read from the class path
 * resource {@value #RESOURCE} of the {@code web-app} JAR, and the check of a login's {@code return} address
 * (doc/specification/authentication.adoc, TRH-AUTH-1).
 */
public final class CanonicalAddresses {

    /** The class path resource with the address patterns. */
    public static final String RESOURCE = "META-INF/trailhand/canonical-addresses.json";

    /** The address a refused {@code return} value is replaced by. */
    public static final String FALLBACK = "/";

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-z]+)}");

    private final List<Pattern> patterns;

    private CanonicalAddresses(List<Pattern> patterns) {
        this.patterns = List.copyOf(patterns);
    }

    /**
     * Reads the patterns from the class path.
     *
     * @param mapper      the JSON mapper
     * @param classLoader the class loader that holds {@value #RESOURCE}
     * @return the addresses
     * @throws IllegalStateException if the resource is missing
     */
    public static CanonicalAddresses load(ObjectMapper mapper, ClassLoader classLoader) {
        try (InputStream in = classLoader.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("Missing class path resource " + RESOURCE
                        + "; the trailhand-web-app JAR must be on the class path");
            }
            return of(mapper.readTree(in));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Compiles the patterns of a parsed address file.
     *
     * @param root the parsed {@value #RESOURCE}: {@code segment}, {@code params}, {@code addresses[].pattern}
     * @return the addresses
     */
    public static CanonicalAddresses of(JsonNode root) {
        String segment = root.path("segment").asText();
        var params = root.path("params");
        List<Pattern> compiled = new ArrayList<>();
        for (var address : root.path("addresses")) {
            String pattern = address.path("pattern").asText();
            Matcher matcher = PLACEHOLDER.matcher(pattern);
            var regex = new StringBuilder("^");
            int last = 0;
            while (matcher.find()) {
                regex.append(Pattern.quote(pattern.substring(last, matcher.start())));
                String own = params.path(matcher.group(1)).asText("");
                regex.append('(').append(own.isEmpty() ? segment : own).append(')');
                last = matcher.end();
            }
            regex.append(Pattern.quote(pattern.substring(last))).append('$');
            compiled.add(Pattern.compile(regex.toString()));
        }
        return new CanonicalAddresses(compiled);
    }

    /**
     * Whether a path is a canonical address.
     *
     * @param path the path, without query and fragment
     * @return {@code true} when one pattern matches the whole path
     */
    public boolean isCanonical(String path) {
        return patterns.stream().anyMatch(pattern -> pattern.matcher(path).matches());
    }

    /**
     * Checks a login's {@code return} value: a same-origin relative path that starts with a single {@code /} (not
     * {@code //}, no {@code \}, no scheme, no authority) and is a canonical address.
     *
     * @param candidate the requested value, possibly {@code null}
     * @return the value when it passes, {@value #FALLBACK} otherwise
     */
    public String checkReturn(@Nullable String candidate) {
        if (candidate == null || !candidate.startsWith("/") || candidate.startsWith("//")
                || candidate.contains("\\") || candidate.chars().anyMatch(Character::isISOControl)) {
            return FALLBACK;
        }
        return isCanonical(candidate) ? candidate : FALLBACK;
    }
}
