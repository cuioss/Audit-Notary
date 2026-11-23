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
package de.cuioss.notary.audit.security;

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
 * The check of the login's {@code return} (AUN-AUTH-1): a same-origin relative path that matches a canonical address
 * of the web app (AUN-WEB-3); anything else becomes {@code /}. The addresses are the ones the web app routes with,
 * {@code META-INF/audit-notary/canonical-addresses.json} of the {@code web-app} JAR.
 */
@ApplicationScoped
public class ReturnAddresses {

    /** The resource holding the canonical addresses. */
    public static final String RESOURCE = "META-INF/audit-notary/canonical-addresses.json";

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
