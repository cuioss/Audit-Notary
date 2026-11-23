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

import de.cuioss.test.generator.Generators;
import de.cuioss.test.generator.junit.EnableGeneratorController;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableGeneratorController
@DisplayName("Placeholders: ${NAME} and ${NAME:-default} from the environment (AUN-CONF-1)")
class PlaceholdersTest {

    @Test
    @DisplayName("resolves a value, a default and leaves text without placeholder alone")
    void resolves() {
        var value = Generators.letterStrings(5, 12).next();
        var unresolved = new ArrayList<String>();

        assertEquals("a-" + value + "-b", Placeholders.resolve("a-${NAME}-b", Map.of("NAME", value)::get, unresolved));
        assertEquals("fallback", Placeholders.resolve("${MISSING:-fallback}", name -> null, unresolved));
        assertEquals("", Placeholders.resolve("${EMPTY:-}", name -> null, unresolved));
        assertEquals("plain $ {text}", Placeholders.resolve("plain $ {text}", name -> null, unresolved));
        assertTrue(unresolved.isEmpty());
    }

    @Test
    @DisplayName("collects every placeholder without value and default")
    void collectsUnresolved() {
        var unresolved = new ArrayList<String>();

        Placeholders.resolve("${A}/${B:-b}/${C}", name -> null, unresolved);

        assertEquals(List.of("A", "C"), unresolved);
    }

    @Test
    @DisplayName("resolves a lowercase environment name and reports a placeholder that names no environment variable")
    void names() {
        var unresolved = new ArrayList<String>();

        assertEquals("id", Placeholders.resolve("${client_id}", Map.of("client_id", "id")::get, unresolved));
        assertEquals("", Placeholders.resolve("${client.id:-x}", name -> "never", unresolved));
        assertEquals("", Placeholders.resolve("${1A}", name -> "never", unresolved));
        assertEquals("", Placeholders.resolve("${}", name -> "never", unresolved));

        Placeholders.resolve("${MISSING:-${OTHER}}", name -> null, unresolved);

        assertEquals(List.of("client.id", "1A", "", "MISSING"), unresolved);
    }

    @Test
    @DisplayName("resolves every string of a tree and keeps the other values")
    void resolvesTree() {
        var tree = Map.of("list", List.of("${X}", 3), "nested", Map.of("flag", true, "text", "${X}"));

        var resolved = Placeholders.resolveTree(tree, Map.of("X", "x")::get, new ArrayList<>());

        assertEquals(Map.of("list", List.of("x", 3), "nested", Map.of("flag", true, "text", "x")), resolved);
    }
}
