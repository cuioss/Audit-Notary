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

    private static final ClassLoader CLASS_LOADER = ScenarioRegistryTest.class.getClassLoader();
    private final ScenarioRegistry registry = new ScenarioRegistry(
            new ScenarioLoader(new ObjectMapper(), name -> ScenarioRegistry.readDataFile(CLASS_LOADER, name)),
            CLASS_LOADER);

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
        assertEquals(List.of("workshop", "first-login", "read-only", "degraded", "empty", "no-rights"), registry.primaryNames());
    }
}
