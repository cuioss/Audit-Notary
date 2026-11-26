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
import static org.junit.jupiter.api.Assertions.assertFalse;
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
    @DisplayName("reads the login and the session flags, and defaults to the identity provider")
    void shouldReadLoginAndSessionFlags() {
        // Arrange
        var root = valid();
        var login = root.putObject("login").put("provider", "local");
        login.putArray("users").addObject().put("username", "alex").put("password", "local-password");
        ((ObjectNode) root.path("states").path("a")).put("session_replaced", true);
        ((ObjectNode) root.path("states").path("b")).put("session_ended", true);
        // Act
        var local = loader.read("sample.json", root);
        var defaulted = loader.read("sample.json", valid());
        // Assert
        assertAll(
                () -> assertTrue(local.login().isLocal()),
                () -> assertEquals("alex", local.login().authenticate("alex", "local-password").orElseThrow().username()),
                () -> assertTrue(local.login().authenticate("alex", "wrong").isEmpty()),
                () -> assertTrue(local.state("a").orElseThrow().sessionReplaced()),
                () -> assertTrue(local.state("b").orElseThrow().sessionEnded()),
                () -> assertEquals("oidc", defaulted.login().provider()),
                () -> assertTrue(defaulted.login().users().isEmpty()),
                () -> assertFalse(defaulted.state("a").orElseThrow().sessionReplaced()));
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

    @Test
    @DisplayName("admits every handler of the enum by its id, and only those")
    void shouldAdmitEveryHandler() {
        for (Handler handler : Handler.values()) {
            var root = valid();
            var route = MAPPER.createObjectNode().put("handler", handler.id());
            if (handler.usesDataFile()) {
                route.put("data_file", "model.json");
            }
            ((ObjectNode) root.path("routes")).set("POST /api/v1/handler", route);
            assertEquals(handler, loader.read("sample.json", root).routes().get("POST /api/v1/handler").handler());
            assertEquals(Optional.of(handler), Handler.byId(handler.id()));
        }
        assertEquals(Optional.empty(), Handler.byId("render-markdown"));
    }

    @Test
    @DisplayName("reads a route that names a built-in handler")
    void shouldReadAHandlerRoute() {
        // Arrange
        var root = valid();
        ((ObjectNode) root.path("routes")).set("POST /api/v1/render/asciidoc",
                MAPPER.createObjectNode().put("handler", "render-asciidoc"));
        // Act
        var route = loader.read("sample.json", root).routes().get("POST /api/v1/render/asciidoc");
        // Assert
        assertAll(
                () -> assertEquals(Handler.RENDER_ASCIIDOC, route.handler()),
                () -> assertNull(loader.read("sample.json", valid()).routes().get("GET /api/v1/status").handler()));
    }

    @Test
    @DisplayName("reads a route key and a link with a query and keeps the query apart from the path")
    void shouldReadQueryKeys() {
        // Arrange
        var root = valid();
        ((ObjectNode) root.path("routes")).putObject("GET /api/v1/due?at=v1&kind=note").put("status", 200);
        ((ObjectNode) root.path("states").path("a").path("links").path("go")).put("path", "/api/v1/directory/me?x=%20a");
        // Act
        var scenario = loader.read("sample.json", root);
        var link = scenario.state("a").orElseThrow().links().get("go");
        // Assert
        assertAll(
                () -> assertTrue(scenario.routes().containsKey("GET /api/v1/due?at=v1&kind=note")),
                () -> assertEquals("/api/v1/directory/me", link.path()),
                () -> assertEquals(Map.of("x", " a"), link.query()),
                () -> assertTrue(scenario.state("a").orElseThrow().linkFor("PUT", "/api/v1/directory/me",
                        Map.of("x", " a", "y", "1")).isPresent()),
                () -> assertTrue(scenario.state("a").orElseThrow().linkFor("PUT", "/api/v1/directory/me").isEmpty()));
    }

    @Nested
    @DisplayName("reads and refuses the data file of a handler")
    class HandlerDataFile {

        private String rejectionWith(Consumer<ObjectNode> route) {
            return rejectionOf(root -> {
                var node = MAPPER.createObjectNode().put("handler", "search-documents");
                route.accept(node);
                ((ObjectNode) root.path("routes")).set("GET /api/v1/search", node);
            });
        }

        @Test
        @DisplayName("keeps the JSON of the data file as the body of the route")
        void shouldReadDataFile() {
            var root = valid();
            ((ObjectNode) root.path("routes")).set("GET /api/v1/search",
                    MAPPER.createObjectNode().put("handler", "search-documents").put("data_file", "model.json"));
            var route = loader.read("sample.json", root).routes().get("GET /api/v1/search");
            assertAll(
                    () -> assertEquals(Handler.SEARCH_DOCUMENTS, route.handler()),
                    () -> assertEquals("v2.2.0", route.body().path("version").asText()));
        }

        @Test
        @DisplayName("that needs one and has none")
        void shouldRefuseMissingDataFile() {
            var message = rejectionWith(node -> { });
            assertTrue(message.contains("GET /api/v1/search.handler") && message.contains("needs a data_file"), message);
        }

        @Test
        @DisplayName("that names no file, a bad name or a broken file")
        void shouldRefuseBadDataFile() {
            assertAll(
                    () -> assertTrue(rejectionWith(node -> node.put("data_file", "absent.json"))
                            .contains("GET /api/v1/search.data_file: names no data file: absent.json")),
                    () -> assertTrue(rejectionWith(node -> node.put("data_file", "../x.json")).contains("must name a data file")),
                    () -> assertTrue(rejectionWith(node -> node.put("data_file", "broken.json")).contains("not valid JSON")));
        }

        @Test
        @DisplayName("together with a body, and a data_file on a handler that reads none")
        void shouldRefuseMisplacedDataFile() {
            var withBody = rejectionWith(node -> node.put("data_file", "model.json").putObject("body"));
            var onOther = rejectionOf(root -> ((ObjectNode) root.path("routes")).set("POST /api/v1/render/asciidoc",
                    MAPPER.createObjectNode().put("handler", "render-asciidoc").put("data_file", "model.json")));
            assertAll(
                    () -> assertTrue(withBody.contains("a route with a handler has no body"), withBody),
                    () -> assertTrue(onOther.contains("POST /api/v1/render/asciidoc.data_file"), onOther));
        }
    }

    @Nested
    @DisplayName("refuses a handler")
    class HandlerRefusals {

        private String rejectionWith(Consumer<ObjectNode> route) {
            return rejectionOf(root -> {
                var node = MAPPER.createObjectNode().put("handler", "render-asciidoc");
                route.accept(node);
                ((ObjectNode) root.path("routes")).set("POST /api/v1/render/asciidoc", node);
            });
        }

        @Test
        @DisplayName("that no engine implements")
        void shouldRefuseAnUnknownHandler() {
            var message = rejectionWith(node -> node.put("handler", "render-markdown"));
            assertAll(
                    () -> assertTrue(message.contains("POST /api/v1/render/asciidoc.handler"), message),
                    () -> assertTrue(message.contains("render-markdown"), message),
                    () -> assertTrue(message.contains("render-asciidoc"), message));
        }

        @Test
        @DisplayName("that is no string")
        void shouldRefuseANonTextHandler() {
            assertTrue(rejectionWith(node -> node.put("handler", 5)).contains("handler"));
        }

        @ParameterizedTest
        @ValueSource(strings = {"body", "body_file", "status"})
        @DisplayName("next to a body, a data file or a status")
        void shouldRefuseAHandlerWithAnswerMembers(String member) {
            var message = rejectionWith(node -> {
                if ("status".equals(member)) {
                    node.put(member, 200);
                } else {
                    node.put(member, "model.json");
                }
            });
            assertTrue(message.contains("has no " + member), message);
        }
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
        @ValueSource(strings = {"/other/path", "api/v1/due", "/api/v1/due?", "/api/v1/due?x", "/api/v1/due?x=",
                "/api/v1/due?=1", "/api/v1/due?x=1&x=2", "/api/v1/due?x=1#y", "/api/v1/due?x=1&&y=2"})
        @DisplayName("a link path outside /api/v1/ or with a malformed query")
        void shouldRefuseLinkPath(String path) {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("a").path("links").path("go"))
                    .put("path", path));
            assertTrue(message.contains("path"), message);
        }

        @ParameterizedTest
        @ValueSource(strings = {"GET /api/v1/due?", "GET /api/v1/due?at", "GET /api/v1/due?at=", "GET /api/v1/due?=v1",
                "GET /api/v1/due?at=v1&at=v2", "GET /api/v1/due?at=v1#x"})
        @DisplayName("a route key with a malformed query")
        void shouldRefuseRouteKeyQuery(String key) {
            var message = rejectionOf(root -> ((ObjectNode) root.path("routes")).putObject(key));
            assertAll(
                    () -> assertTrue(message.contains("sample.json"), message),
                    () -> assertTrue(message.contains("routes." + key), message),
                    () -> assertTrue(message.contains("a query is name=value"), message));
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
        @DisplayName("a login provider other than oidc and local")
        void shouldRefuseUnknownProvider() {
            var message = rejectionOf(root -> root.putObject("login").put("provider", "saml"));
            assertTrue(message.contains("login.provider"), message);
        }

        @Test
        @DisplayName("users of the provider oidc")
        void shouldRefuseUsersWithoutLocalProvider() {
            var message = rejectionOf(root -> {
                var login = root.putObject("login").put("provider", "oidc");
                login.putArray("users").addObject().put("username", "alex").put("password", "x");
            });
            assertTrue(message.contains("login.users"), message);
        }

        @Test
        @DisplayName("a local user without password")
        void shouldRefuseUserWithoutPassword() {
            var message = rejectionOf(root -> {
                var login = root.putObject("login").put("provider", "local");
                login.putArray("users").addObject().put("username", "alex");
            });
            assertTrue(message.contains("login.users[0]") && message.contains("password"), message);
        }

        @Test
        @DisplayName("a session flag that is no boolean")
        void shouldRefuseSessionFlag() {
            var message = rejectionOf(root -> ((ObjectNode) root.path("states").path("a"))
                    .put("session_replaced", "yes"));
            assertTrue(message.contains("states.a.session_replaced"), message);
        }

        @Test
        @DisplayName("and names the source in the message")
        void shouldNameSource() {
            assertTrue(rejectionOf(root -> root.put("start", "missing")).startsWith("Scenario sample.json"));
        }
    }
}
