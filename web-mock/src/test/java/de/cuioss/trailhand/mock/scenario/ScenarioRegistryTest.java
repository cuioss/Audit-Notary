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
package de.cuioss.trailhand.mock.scenario;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.test.generator.Generators;
import de.cuioss.test.generator.junit.EnableGeneratorController;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableGeneratorController
@DisplayName("ScenarioRegistry")
class ScenarioRegistryTest {

    private final ScenarioRegistry registry = new ScenarioRegistry(new ScenarioLoader(new ObjectMapper()),
            ScenarioRegistryTest.class.getClassLoader());

    @Test
    @DisplayName("resolves a name to its start state")
    void shouldResolveName() {
        // Act
        var reference = registry.resolve("workshop").orElseThrow();
        // Assert
        assertAll(
                () -> assertEquals("workshop", reference.scenario().name()),
                () -> assertEquals("ready", reference.state()),
                () -> assertEquals("workshop#ready", reference.display()));
    }

    @Test
    @DisplayName("resolves name#state to that state")
    void shouldResolveNameWithState() {
        assertEquals("saved-by-other", registry.resolve("workshop#saved-by-other").orElseThrow().state());
    }

    @Test
    @DisplayName("answers empty for an unknown name")
    void shouldAnswerEmptyForUnknownName() {
        String name = Generators.letterStrings(8, 16).next().toLowerCase(Locale.ROOT);
        assertTrue(registry.resolve(name).isEmpty());
    }

    @Test
    @DisplayName("refuses a reference whose state is unknown")
    void shouldRefuseUnknownState() {
        assertThrows(ScenarioValidationException.class, () -> registry.resolve("workshop#nowhere"));
    }

    @Test
    @DisplayName("loads a scenario from a file path")
    void shouldLoadFromFile(@TempDir Path folder) throws Exception {
        // Arrange
        var file = folder.resolve("own.json");
        Files.writeString(file, """
                {"format_version": 1, "name": "own", "user": {"name": "Own"}, "start": "only",
                 "states": {"only": {}, "second": {}}}
                """);
        // Act
        var reference = registry.resolve(file + "#second").orElseThrow();
        // Assert
        assertAll(
                () -> assertEquals("own", reference.scenario().name()),
                () -> assertEquals("second", reference.state()));
    }

    @Test
    @DisplayName("lists the primary profiles in file order")
    void shouldListPrimaries() {
        assertEquals(List.of("workshop", "first-login", "read-only", "degraded", "empty"), registry.primaryNames());
    }
}
