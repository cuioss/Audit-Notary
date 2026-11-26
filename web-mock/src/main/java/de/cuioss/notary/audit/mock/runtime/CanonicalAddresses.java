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
package de.cuioss.notary.audit.mock.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jspecify.annotations.Nullable;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The canonical addresses of the web app (doc/specification/web-app.adoc, AUN-WEB-3), read from the class path
 * resource {@value #RESOURCE} of the {@code web-app} JAR, and the check of a login's {@code return} address
 * (doc/specification/authentication.adoc, AUN-AUTH-1).
 */
public final class CanonicalAddresses {

    /** The class path resource with the address patterns. */
    public static final String RESOURCE = "META-INF/audit-notary/canonical-addresses.json";

    /** The address a refused {@code return} value is replaced by. */
    public static final String FALLBACK = "/";

    /** The longest query string an address may carry (doc/specification/rest-api.adoc, Allowed Queries of an Address). */
    public static final int MAX_QUERY_LENGTH = 256;

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-z]+)}");

    private final List<Address> addresses;
    private final Map<String, Pattern> queries;

    private CanonicalAddresses(List<Address> addresses, Map<String, Pattern> queries) {
        this.addresses = List.copyOf(addresses);
        this.queries = Map.copyOf(queries);
    }

    /** A compiled address: its path pattern and the query names it admits. */
    private record Address(Pattern pattern, List<String> query) {
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
                        + "; the audit-notary-web-app JAR must be on the class path");
            }
            return of(mapper.readTree(in));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Compiles the patterns of a parsed address file.
     *
     * @param root the parsed {@value #RESOURCE}: {@code segment}, {@code params}, {@code queries} (name to value
     *             pattern), {@code addresses[].pattern} and the optional {@code addresses[].query} (the names the
     *             address admits)
     * @return the addresses
     */
    public static CanonicalAddresses of(JsonNode root) {
        String segment = root.path("segment").asText();
        var params = root.path("params");
        List<Address> compiled = new ArrayList<>();
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
            List<String> names = new ArrayList<>();
            address.path("query").forEach(name -> names.add(name.asText()));
            compiled.add(new Address(Pattern.compile(regex.toString()), names));
        }
        Map<String, Pattern> values = new LinkedHashMap<>();
        root.path("queries").properties().forEach(entry -> values.put(entry.getKey(),
                Pattern.compile(entry.getValue().asText())));
        return new CanonicalAddresses(compiled, values);
    }

    /**
     * Whether a path is a canonical address.
     *
     * @param path the path, without query and fragment
     * @return {@code true} when one pattern matches the whole path
     */
    public boolean isCanonical(String path) {
        return match(path).isPresent();
    }

    /** The first address in file order whose pattern matches the whole path: the one whose query names count. */
    private Optional<Address> match(String path) {
        return addresses.stream().filter(address -> address.pattern().matcher(path).matches()).findFirst();
    }

    /**
     * Checks a login's {@code return} value: a same-origin relative path that starts with a single {@code /} (not
     * {@code //}, no {@code \}, no scheme, no authority) and is a canonical address, optionally followed by a query
     * of at most {@value #MAX_QUERY_LENGTH} characters. Every name of the query must be one the matched address admits,
     * each once, with a value that matches its pattern in {@code queries}; a fragment, an unknown name, a bad value or
     * a repeated name falls back.
     *
     * @param candidate the requested value, possibly {@code null}
     * @return the value when it passes, {@value #FALLBACK} otherwise
     */
    public String checkReturn(@Nullable String candidate) {
        if (candidate == null || !candidate.startsWith("/") || candidate.startsWith("//")
                || candidate.contains("\\") || candidate.chars().anyMatch(Character::isISOControl)) {
            return FALLBACK;
        }
        int mark = candidate.indexOf('?');
        if (mark < 0) {
            return isCanonical(candidate) ? candidate : FALLBACK;
        }
        String query = candidate.substring(mark + 1);
        if (query.isEmpty() || query.length() > MAX_QUERY_LENGTH || query.indexOf('#') >= 0) {
            return FALLBACK;
        }
        var address = match(candidate.substring(0, mark));
        return address.isPresent() && queryPasses(address.get(), query) ? candidate : FALLBACK;
    }

    private boolean queryPasses(Address address, String query) {
        Set<String> seen = new HashSet<>();
        for (String pair : query.split("&", -1)) {
            int equals = pair.indexOf('=');
            if (equals <= 0) {
                return false;
            }
            String name = decode(pair.substring(0, equals));
            String value = decode(pair.substring(equals + 1));
            var allowed = queries.get(name);
            if (!address.query().contains(name) || allowed == null || !allowed.matcher(value).matches()
                    || !seen.add(name)) {
                return false;
            }
        }
        return true;
    }

    /** Percent-decodes once; a {@code +} stays a plus. */
    private static String decode(String text) {
        return URLDecoder.decode(text.replace("+", "%2B"), StandardCharsets.UTF_8);
    }
}
