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
package de.cuioss.trailhand.mock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.trailhand.mock.runtime.CanonicalAddresses;
import de.cuioss.trailhand.mock.scenario.Route;
import de.cuioss.trailhand.mock.scenario.ScenarioLoader;
import de.cuioss.trailhand.mock.scenario.ScenarioRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static de.cuioss.trailhand.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The primary profiles")
class ProfilesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final ScenarioRegistry REGISTRY = new ScenarioRegistry(new ScenarioLoader(MAPPER),
            ProfilesTest.class.getClassLoader());

    static Stream<String> primaries() {
        return REGISTRY.primaryNames().stream();
    }

    @ParameterizedTest
    @MethodSource("primaries")
    @DisplayName("load, answer status, messages and session, and link only canonical addresses")
    void shouldServeEveryPrimary(String name) {
        // Arrange
        var scenario = REGISTRY.resolve(name).orElseThrow().scenario();
        var addresses = CanonicalAddresses.load(MAPPER, ProfilesTest.class.getClassLoader());
        List<String> linked = new ArrayList<>();
        Stream.concat(scenario.routes().values().stream(),
                scenario.states().values().stream().flatMap(state -> state.routes().values().stream()))
                .map(Route::body).forEach(body -> body.path("items").forEach(item ->
                linked.add(item.path("address").asText())));
        try (var client = MockClient.start(name).login()) {
            // Act
            var status = client.get("/api/v1/status");
            var session = client.get("/api/v1/session");
            // Assert
            assertAll(
                    () -> assertEquals(name, scenario.name()),
                    () -> assertEquals(200, status.statusCode()),
                    () -> assertTrue(json(status).has("degraded")),
                    () -> assertEquals(200, session.statusCode()),
                    () -> assertEquals(200, client.get("/api/v1/messages").statusCode()),
                    () -> linked.forEach(address -> assertTrue(addresses.isCanonical(address),
                            name + " links a non-canonical address " + address)));
        }
    }

    @Nested
    @DisplayName("workshop")
    class Workshop {

        @Test
        @DisplayName("lists due items of every kind and the catalogs")
        void shouldServeDueAndCatalogs() {
            try (var client = MockClient.start("workshop").login()) {
                var items = json(client.get("/api/v1/due")).path("items");
                List<String> kinds = new ArrayList<>();
                items.forEach(item -> kinds.add(item.path("kind").asText()));
                assertAll(
                        () -> assertTrue(items.size() >= 5),
                        () -> assertTrue(kinds.containsAll(List.of("deadline", "review", "release"))),
                        () -> assertFalse(json(client.get("/api/v1/catalogs/team")).path("entries").isEmpty()),
                        () -> assertFalse(json(client.get("/api/v1/catalogs/role")).path("entries").isEmpty()));
            }
        }
    }

    @Nested
    @DisplayName("read-only")
    class ReadOnly {

        @Test
        @DisplayName("grants only read and refuses an edit with FORBIDDEN")
        void shouldGrantReadOnly() {
            try (var client = MockClient.start("read-only").login()) {
                var rights = json(client.get("/api/v1/session")).path("rights");
                List<String> actions = new ArrayList<>();
                rights.forEach(right -> right.path("actions").forEach(action -> actions.add(action.asText())));
                var edit = client.change("PUT", "/api/v1/directory/me", "{}");
                assertAll(
                        () -> assertTrue(actions.stream().allMatch("read"::equals)),
                        () -> assertEquals(403, edit.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(edit).path("outcome").asText()));
            }
        }
    }

    @Nested
    @DisplayName("degraded")
    class Degraded {

        @Test
        @DisplayName("reports degraded, refuses a save with GIT_UNAVAILABLE and recovers")
        void shouldDegradeAndRecover() {
            try (var client = MockClient.start("degraded").login()) {
                JsonNode down = json(client.get("/api/v1/status"));
                var save = client.change("PUT", "/api/v1/directory/me", "{}");
                client.send("POST", "/mock/goto/recovered", null, Map.of());
                JsonNode up = json(client.get("/api/v1/status"));
                assertAll(
                        () -> assertTrue(down.path("degraded").asBoolean()),
                        () -> assertEquals("DOWN", down.path("repositories").get(0).path("fetch").asText()),
                        () -> assertEquals(503, save.statusCode()),
                        () -> assertEquals("GIT_UNAVAILABLE", json(save).path("outcome").asText()),
                        () -> assertEquals(200, client.get("/api/v1/due").statusCode()),
                        () -> assertFalse(up.path("degraded").asBoolean()));
            }
        }
    }

    @Nested
    @DisplayName("empty")
    class Empty {

        @Test
        @DisplayName("has nothing due")
        void shouldHaveNothingDue() {
            try (var client = MockClient.start("empty").login()) {
                assertEquals(0, json(client.get("/api/v1/due")).path("items").size());
            }
        }
    }
}
