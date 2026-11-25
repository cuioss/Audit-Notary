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

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("ScenarioLoader")
class ScenarioLoaderTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Map<String, String> DATA = Map.of(
            "model.json", "{\"version\": \"v2.2.0\"}",
            "broken.json", "{nope",
            "blank.json", "  ",
            "trailing.json", "{\"a\": 1} junk");
    private final ScenarioLoader loader = new ScenarioLoader(MAPPER, name -> Optional.ofNullable(DATA.get(name)));

    private static ObjectNode valid() {
        try {
            return (ObjectNode) MAPPER.readTree("""
                    {
                      "format_version": 1,
                      "name": "sample",
                      "description": "A sample",
                      "user": {"pseudonym": "p-1", "name": "Alex", "groups": ["g"]},
                      "rights": [{"repository": "samm-assessments", "actions": ["read", "edit"]}],
                      "start": "a",
                      "routes": {"GET /api/v1/status": {"body": {"degraded": false}}},
                      "states": {
                        "a": {
                          "links": {"go": {"method": "PUT", "path": "/api/v1/directory/me", "next": "b", "status": 201}},
                          "events": [{"after_ms": 5, "event": "status", "data": {"x": 1}}]
                        },
                        "b": {"first_login_required": true, "auto": {"after_ms": 10, "next": "a"},
                              "routes": {"GET /api/v1/due": {"status": 403, "body": {"outcome": "FORBIDDEN"}}}}
                      }
                    }
                    """);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String rejectionOf(Consumer<ObjectNode> change) {
        var root = valid();
        change.accept(root);
        return assertThrows(ScenarioValidationException.class, () -> loader.read("sample.json", root)).getMessage();
    }

    @Test
    @DisplayName("reads every part of a valid scenario")
    void shouldReadValidScenario() {
        // Act
        var scenario = loader.read("sample.json", valid());
        // Assert
        var a = scenario.state("a").orElseThrow();
        var b = scenario.state("b").orElseThrow();
        assertAll(
                () -> assertEquals("sample", scenario.name()),
                () -> assertEquals("p-1", scenario.user().pseudonym()),
                () -> assertEquals("a", scenario.start()),
                () -> assertEquals(201, a.linkFor("PUT", "/api/v1/directory/me").orElseThrow().status()),
                () -> assertEquals(5, a.events().getFirst().afterMs()),
                () -> assertNull(a.firstLoginRequired()),
                () -> assertTrue(scenario.firstLoginRequired(b)),
                () -> assertEquals(200, scenario.route(a, "GET /api/v1/status").orElseThrow().status()),
                () -> assertEquals(403, scenario.route(b, "GET /api/v1/due").orElseThrow().status()),
                () -> assertEquals("a", b.auto().next()));
    }

    @Test
    @DisplayName("defaults status to 200, body to an empty object and delays to 0")
    void shouldApplyDefaults() {
        // Arrange
        var root = valid();
        ((ObjectNode) root.path("states").path("a").path("links").path("go")).remove("status");
        ((ObjectNode) root.path("states").path("a").path("events").get(0)).remove("after_ms");
        // Act
        var a = loader.read("sample.json", root).state("a").orElseThrow();
        // Assert
        var link = a.linkFor("PUT", "/api/v1/directory/me").orElseThrow();
        assertAll(
                () -> assertEquals(200, link.status()),
                () -> assertTrue(link.body().isObject() && link.body().isEmpty()),
                () -> assertEquals(0, a.events().getFirst().afterMs()));
    }

    @Test
    @DisplayName("answers the JSON of the data file a route or a link names")
    void shouldReadBodyFile() {
        // Arrange
        var root = valid();
        ((ObjectNode) root.path("routes").path("GET /api/v1/status")).remove("body");
        ((ObjectNode) root.path("routes").path("GET /api/v1/status")).put("body_file", "model.json");
        ((ObjectNode) root.path("states").path("a").path("links").path("go")).put("body_file", "model.json");
        // Act
        var scenario = loader.read("sample.json", root);
        // Assert
        var link = scenario.state("a").orElseThrow().linkFor("PUT", "/api/v1/directory/me").orElseThrow();
        assertAll(
                () -> assertEquals("v2.2.0", scenario.routes().get("GET /api/v1/status").body().path("version").asText()),
                () -> assertEquals("v2.2.0", link.body().path("version").asText()));
    }

    @Nested
    @DisplayName("refuses a body_file")
    class BodyFileRefusals {

        private String rejectionWith(String name, boolean withBody) {
            return rejectionOf(root -> {
                var route = (ObjectNode) root.path("routes").path("GET /api/v1/status");
                if (!withBody) {
                    route.remove("body");
                }
                route.put("body_file", name);
            });
        }

        @Test
        @DisplayName("beside a body")
        void shouldRefuseBodyAndFile() {
            var message = rejectionWith("model.json", true);
            assertTrue(message.contains("either body or body_file"), message);
        }

        @ParameterizedTest
        @ValueSource(strings = {"../secret.json", "Model.json", "model.yaml", ".json"})
        @DisplayName("whose name breaks the pattern")
        void shouldRefuseName(String name) {
            var message = rejectionWith(name, false);
            assertTrue(message.contains("body_file"), message);
        }

        @Test
        @DisplayName("that names no data file")
        void shouldRefuseMissingFile() {
            var message = rejectionWith("absent.json", false);
            assertTrue(message.contains("names no data file"), message);
        }

        @ParameterizedTest
        @ValueSource(strings = {"broken.json", "trailing.json"})
        @DisplayName("whose data file is no JSON, or more than one value")
        void shouldRefuseBrokenFile(String name) {
            var message = rejectionWith(name, false);
            assertTrue(message.contains("not valid JSON"), message);
        }

        @Test
        @DisplayName("whose data file is blank")
        void shouldRefuseBlankFile() {
            var message = rejectionWith("blank.json", false);
            assertTrue(message.contains("holds no JSON value"), message);
        }

        @Test
        @DisplayName("with a loader that resolves no data file")
        void shouldRefuseWithoutResolver() {
            var root = valid();
            var route = (ObjectNode) root.path("routes").path("GET /api/v1/status");
            route.remove("body");
            route.put("body_file", "model.json");
            var plain = new ScenarioLoader(MAPPER);
            var thrown = assertThrows(ScenarioValidationException.class, () -> plain.read("sample.json", root));
            assertTrue(thrown.getMessage().contains("names no data file"), thrown.getMessage());
        }
    }

    @Nested
    @DisplayName("refuses")
    class Refusals {

        @Test
        @DisplayName("text that is no JSON")
        void shouldRefuseNoJson() {
            var thrown = assertThrows(ScenarioValidationException.class, () -> loader.parse("x.json", "{nope"));
            assertTrue(thrown.getMessage().contains("not valid JSON"));
        }

        @Test
        @DisplayName("a JSON value that is no object")
        void shouldRefuseNoObject() {
            assertThrows(ScenarioValidationException.class, () -> loader.parse("x.json", "[]"));
        }

        @Test
        @DisplayName("another format version")
        void shouldRefuseFormatVersion() {
            assertTrue(rejectionOf(root -> root.put("format_version", 2)).contains("format_version"));
        }

        @Test
        @DisplayName("a missing name")
        void shouldRefuseMissingName() {
            assertTrue(rejectionOf(root -> root.remove("name")).contains("name"));
        }

        @Test
        @DisplayName("a user without name")
        void shouldRefuseUserWithoutName() {
            assertTrue(rejectionOf(root -> ((ObjectNode) root.path("user")).remove("name")).contains("name"));
        }

        @Test
        @DisplayName("an unknown action of a right")
        void shouldRefuseUnknownAction() {
            var message = rejectionOf(root -> ((ObjectNode) root.path("rights").get(0)).putArray("actions").add("own"));
            assertTrue(message.contains("rights[0].actions"), message);
        }

        @Test
        @DisplayName("a start that names no state")
        void shouldRefuseUnknownStart() {
            assertTrue(rejectionOf(root -> root.put("start", "missing")).contains("start"));
        }

        @Test
        @DisplayName("a scenario without states")
        void shouldRefuseNoStates() {
            assertTrue(rejectionOf(root -> root.putObject("states")).contains("states"));
        }

        @Test
        @DisplayName("a link whose next names no state")
        void shouldRefuseUnknownLinkTarget() {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("a").path("links").path("go"))
                    .put("next", "nowhere"));
            assertTrue(message.contains("states.a.links.go.next"), message);
        }

        @Test
        @DisplayName("a timed transition whose next names no state")
        void shouldRefuseUnknownAutoTarget() {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("b").path("auto"))
                    .put("next", "nowhere"));
            assertTrue(message.contains("states.b.auto.next"), message);
        }

        @ParameterizedTest
        @ValueSource(strings = {"PATCH", "HEAD", "get"})
        @DisplayName("an unsupported link method")
        void shouldRefuseLinkMethod(String method) {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("a").path("links").path("go"))
                    .put("method", method));
            assertTrue(message.contains("method"), message);
        }

        @ParameterizedTest
        @ValueSource(strings = {"/other/path", "/api/v1/due?x=1", "api/v1/due"})
        @DisplayName("a link path outside /api/v1/ or with a query")
        void shouldRefuseLinkPath(String path) {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("a").path("links").path("go"))
                    .put("path", path));
            assertTrue(message.contains("path"), message);
        }

        @ParameterizedTest
        @ValueSource(strings = {"GET/api/v1/due", "PATCH /api/v1/due", "GET /mock/state"})
        @DisplayName("a malformed route key")
        void shouldRefuseRouteKey(String key) {
            var message = rejectionOf(root -> ((ObjectNode) root.path("routes")).putObject(key));
            assertTrue(message.contains("routes."), message);
        }

        @ParameterizedTest
        @ValueSource(ints = {99, 600, -1})
        @DisplayName("a status outside 100 to 599")
        void shouldRefuseStatus(int status) {
            var message = rejectionOf(root -> ((ObjectNode) root.path("routes").path("GET /api/v1/status"))
                    .put("status", status));
            assertTrue(message.contains("status"), message);
        }

        @Test
        @DisplayName("a negative delay")
        void shouldRefuseNegativeDelay() {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("a").path("events").get(0))
                    .put("after_ms", -5));
            assertTrue(message.contains("after_ms"), message);
        }

        @Test
        @DisplayName("an event without name")
        void shouldRefuseEventWithoutName() {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("a").path("events").get(0))
                    .remove("event"));
            assertTrue(message.contains("events[0]"), message);
        }

        @Test
        @DisplayName("a first-login flag that is no boolean")
        void shouldRefuseFirstLoginFlag() {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("b"))
                    .put("first_login_required", "yes"));
            assertTrue(message.contains("first_login_required"), message);
        }

        @Test
        @DisplayName("and names the source in the message")
        void shouldNameSource() {
            assertTrue(rejectionOf(root -> root.put("start", "missing")).startsWith("Scenario sample.json"));
        }
    }
}
