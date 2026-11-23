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
package de.cuioss.notary.audit.mock.cli;

import de.cuioss.notary.audit.mock.WebMock;
import de.cuioss.notary.audit.mock.runtime.Timing;
import de.cuioss.test.generator.Generators;
import de.cuioss.test.generator.junit.EnableGeneratorController;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableGeneratorController
@DisplayName("CliOptions")
class CliOptionsTest {

    @Test
    @DisplayName("defaults to workshop, port 7420 and realistic timing")
    void shouldApplyDefaults() {
        var options = CliOptions.parse(List.of(), Map.of()).options().orElseThrow();
        assertAll(
                () -> assertEquals(WebMock.DEFAULT_SCENARIO, options.scenario()),
                () -> assertEquals(WebMock.DEFAULT_PORT, options.port()),
                () -> assertEquals(Timing.REALISTIC, options.timing()),
                () -> assertFalse(options.help()));
    }

    @Test
    @DisplayName("takes the port from AUDIT_NOTARY_MOCK_PORT")
    void shouldReadPortVariable() {
        int port = Generators.integers(1024, 65_535).next();
        var options = CliOptions.parse(List.of(), Map.of(CliOptions.PORT_VARIABLE, String.valueOf(port)));
        assertEquals(port, options.options().orElseThrow().port());
    }

    @Test
    @DisplayName("reads short and long options; the argument wins over the variable")
    void shouldReadOptions() {
        var options = CliOptions.parse(List.of("-s", "degraded#recovered", "--port", "0", "-t", "ordered", "-h"),
                Map.of(CliOptions.PORT_VARIABLE, "9999")).options().orElseThrow();
        assertAll(
                () -> assertEquals("degraded#recovered", options.scenario()),
                () -> assertEquals(0, options.port()),
                () -> assertEquals(Timing.ORDERED, options.timing()),
                () -> assertTrue(options.help()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"--unknown", "-p", "-p=1", "-p x", "-p 70000", "-t fast"})
    @DisplayName("refuses invalid arguments with a reason")
    void shouldRefuseInvalid(String line) {
        var result = CliOptions.parse(List.of(line.split(" ")), Map.of());
        assertAll(
                () -> assertTrue(result.options().isEmpty()),
                () -> assertFalse(result.error().isBlank()));
    }
}
