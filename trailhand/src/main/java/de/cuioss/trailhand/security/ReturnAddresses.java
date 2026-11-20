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
package de.cuioss.trailhand.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import org.jspecify.annotations.Nullable;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The check of the login's {@code return} (TRH-AUTH-1): a same-origin relative path that matches a canonical address
 * of the web app (TRH-WEB-3); anything else becomes {@code /}. The addresses are the ones the web app routes with,
 * {@code META-INF/trailhand/canonical-addresses.json} of the {@code web-app} JAR.
 */
@ApplicationScoped
public class ReturnAddresses {

    /** The resource holding the canonical addresses. */
    public static final String RESOURCE = "META-INF/trailhand/canonical-addresses.json";

    /** The address used for every refused value. */
    public static final String DEFAULT = "/";

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-z][a-z0-9]*)}");
    private static final int MAX_LENGTH = 512;

    private final List<Pattern> patterns;

    /**
     * Reads the canonical addresses from the class path.
     */
    public ReturnAddresses() {
        this(readResource());
    }

    /**
     * @param definition the content of {@code canonical-addresses.json}
     */
    ReturnAddresses(JsonNode definition) {
        var segment = definition.path("segment").asText();
        var params = definition.path("params");
        var compiled = new ArrayList<Pattern>();
        for (JsonNode address : definition.path("addresses")) {
            Matcher matcher = PLACEHOLDER.matcher(address.path("pattern").asText());
            var regex = new StringBuilder();
            int last = 0;
            var pattern = address.path("pattern").asText();
            while (matcher.find()) {
                regex.append(Pattern.quote(pattern.substring(last, matcher.start())));
                var own = params.path(matcher.group(1));
                regex.append('(').append(own.isMissingNode() ? segment : own.asText()).append(')');
                last = matcher.end();
            }
            regex.append(Pattern.quote(pattern.substring(last)));
            compiled.add(Pattern.compile(regex.toString()));
        }
        this.patterns = List.copyOf(compiled);
    }

    private static JsonNode readResource() {
        try (InputStream in = ReturnAddresses.class.getClassLoader().getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException(RESOURCE + " is missing from the class path");
            }
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * @param value the {@code return} of the login request, possibly {@code null}
     * @return the value when it is a canonical address, otherwise {@code /}
     */
    public String check(@Nullable String value) {
        if (value == null || value.isEmpty() || value.length() > MAX_LENGTH || !value.startsWith("/")
                || value.startsWith("//") || value.contains("\\")) {
            return DEFAULT;
        }
        int query = value.indexOf('?');
        var path = query < 0 ? value : value.substring(0, query);
        if (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        for (Pattern pattern : patterns) {
            if (pattern.matcher(path).matches()) {
                return path;
            }
        }
        return DEFAULT;
    }
}
