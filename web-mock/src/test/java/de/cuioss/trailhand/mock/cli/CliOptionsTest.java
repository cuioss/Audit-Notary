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
package de.cuioss.trailhand.mock.cli;

import de.cuioss.test.generator.Generators;
import de.cuioss.test.generator.junit.EnableGeneratorController;
import de.cuioss.trailhand.mock.WebMock;
import de.cuioss.trailhand.mock.runtime.Timing;
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
    @DisplayName("takes the port from TRAILHAND_MOCK_PORT")
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
