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
package de.cuioss.notary.audit.config;

import lombok.experimental.UtilityClass;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Resolves {@code ${NAME}} and {@code ${NAME:-default}} in string values from the environment, before validation
 * (AUN-CONF-1). {@code NAME} is an environment variable name (letters, digits and underscores, not starting with a
 * digit). Any other {@code ${...}}, a nested one in a default included, is reported like an unresolved placeholder, so
 * it can never pass as a literal value.
 */
@UtilityClass
public class Placeholders {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([^}]*)}");
    private static final Pattern NAME = Pattern.compile("[A-Za-z_]\\w*");
    private static final String DEFAULT_SEPARATOR = ":-";

    /**
     * Resolves every placeholder of a string.
     *
     * @param value       the string
     * @param environment the environment
     * @param unresolved  receives the name of every placeholder without value and without default
     * @return the resolved string
     */
    public static String resolve(String value, UnaryOperator<String> environment, List<String> unresolved) {
        Matcher matcher = PLACEHOLDER.matcher(value);
        var result = new StringBuilder();
        while (matcher.find()) {
            String body = matcher.group(1);
            int separator = body.indexOf(DEFAULT_SEPARATOR);
            String name = separator < 0 ? body : body.substring(0, separator);
            String replacement = null;
            // A nested ${...} in a default is not resolved; it is refused like an unresolved placeholder.
            if (NAME.matcher(name).matches() && !body.contains("${")) {
                replacement = environment.apply(name);
                if (replacement == null && separator >= 0) {
                    replacement = body.substring(separator + DEFAULT_SEPARATOR.length());
                }
            }
            if (replacement == null) {
                unresolved.add(name);
                replacement = "";
            }
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    /**
     * Resolves the placeholders of every string in a tree of maps and lists, as Jackson reads YAML.
     *
     * @param node        a node of the tree
     * @param environment the environment
     * @param unresolved  receives the names of placeholders without value and default
     * @return the resolved node
     */
    @SuppressWarnings("unchecked")
    public static Object resolveTree(Object node, UnaryOperator<String> environment, List<String> unresolved) {
        return switch (node) {
            case String text -> resolve(text, environment, unresolved);
            case Map<?, ?> map -> {
                var copy = new LinkedHashMap<String, Object>();
                ((Map<String, Object>) map).forEach((key, value) -> copy.put(key,
                        value == null ? null : resolveTree(value, environment, unresolved)));
                yield copy;
            }
            case List<?> list -> list.stream()
                    .map(entry -> entry == null ? null : resolveTree(entry, environment, unresolved)).toList();
            default -> node;
        };
    }
}
