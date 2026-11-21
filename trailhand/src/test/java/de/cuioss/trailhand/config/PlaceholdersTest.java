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
package de.cuioss.trailhand.config;

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
@DisplayName("Placeholders: ${NAME} and ${NAME:-default} from the environment (TRH-CONF-1)")
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

        assertEquals(List.of("client.id", "1A", ""), unresolved);
    }

    @Test
    @DisplayName("resolves every string of a tree and keeps the other values")
    void resolvesTree() {
        var tree = Map.of("list", List.of("${X}", 3), "nested", Map.of("flag", true, "text", "${X}"));

        var resolved = Placeholders.resolveTree(tree, Map.of("X", "x")::get, new ArrayList<>());

        assertEquals(Map.of("list", List.of("x", 3), "nested", Map.of("flag", true, "text", "x")), resolved);
    }
}
