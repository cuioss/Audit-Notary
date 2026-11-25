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
package de.cuioss.notary.audit.mock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.notary.audit.mock.runtime.CanonicalAddresses;
import de.cuioss.notary.audit.mock.scenario.Route;
import de.cuioss.notary.audit.mock.scenario.ScenarioLoader;
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The primary profiles")
class ProfilesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final ClassLoader CLASS_LOADER = ProfilesTest.class.getClassLoader();
    private static final ScenarioRegistry REGISTRY = new ScenarioRegistry(
            new ScenarioLoader(MAPPER, name -> ScenarioRegistry.readDataFile(CLASS_LOADER, name)), CLASS_LOADER);

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

        @Test
        @DisplayName("serves the SAMM model, the scopes and the open assessment from the data files")
        void shouldServeSamm() {
            try (var client = MockClient.start("workshop").login()) {
                var model = json(client.get("/api/v1/samm/models/v2.2.0"));
                var scope = json(client.get("/api/v1/samm/scopes/payments"));
                var assessment = json(client.get("/api/v1/documents/samm-assessments/payments-2026-q4"));
                int questions = 0;
                for (var fn : model.path("functions")) {
                    for (var practice : fn.path("practices")) {
                        for (var stream : practice.path("streams")) {
                            questions += stream.path("questions").size();
                        }
                    }
                }
                int total = questions;
                assertAll(
                        () -> assertEquals(90, total),
                        () -> assertEquals(5, model.path("functions").size()),
                        () -> assertEquals(4, json(client.get("/api/v1/samm/scopes")).path("scopes").size()),
                        () -> assertEquals("payments-2026-q4", scope.path("assessments").get(0).path("document").asText()),
                        () -> assertEquals("draft", assessment.path("state").asText()),
                        () -> assertEquals(200,
                                client.get("/api/v1/documents/samm-assessments/payments-2026-q4/diff?from=released")
                                        .statusCode()));
            }
        }

        @Test
        @DisplayName("refuses the submit of the draft with exactly the answers it lacks")
        void shouldRefuseSubmitWithMissingAnswers() {
            try (var client = MockClient.start("workshop").login()) {
                var model = json(client.get("/api/v1/samm/models/v2.2.0"));
                var answers = json(client.get("/api/v1/documents/samm-assessments/payments-2026-q4")).path("answers");
                List<String> expected = new ArrayList<>();
                for (var fn : model.path("functions")) {
                    for (var practice : fn.path("practices")) {
                        for (var stream : practice.path("streams")) {
                            for (var question : stream.path("questions")) {
                                String p = practice.path("id").asText();
                                String q = question.path("id").asText();
                                if (!answers.path(p).path(q).path("answer").isNumber()) {
                                    expected.add("/answers/" + p + "/" + q + "/answer");
                                }
                            }
                        }
                    }
                }
                var refused = client.change("POST",
                        "/api/v1/documents/samm-assessments/payments-2026-q4/transitions/samm.submit", null);
                List<String> missing = new ArrayList<>();
                json(refused).path("missing").forEach(pointer -> missing.add(pointer.asText()));
                assertAll(
                        () -> assertEquals(422, refused.statusCode()),
                        () -> assertFalse(expected.isEmpty()),
                        () -> assertEquals(expected, missing));
            }
        }

        @Test
        @DisplayName("serves in saved-by-other the answers another assessor changed")
        void shouldServeOtherAnswers() {
            try (var client = MockClient.start("workshop").login()) {
                var path = "/api/v1/documents/samm-assessments/payments-2026-q4";
                var before = json(client.get(path)).path("answers").path("sm");
                client.send("POST", "/mock/goto/saved-by-other", null, Map.of());
                var after = json(client.get(path)).path("answers").path("sm");
                assertAll(
                        () -> assertFalse(before.path("sm-b-1").equals(after.path("sm-b-1"))),
                        () -> assertFalse(before.path("sm-b-2").equals(after.path("sm-b-2"))));
            }
        }

        @Test
        @DisplayName("keeps a draft, saves for everyone, and answers CONFLICT in the state conflict")
        void shouldSaveAndConflict() {
            try (var client = MockClient.start("workshop").login()) {
                var draft = client.change("PUT", "/api/v1/drafts/samm-assessments/payments-2026-q4", "{}");
                var saved = client.change("POST", "/api/v1/documents/samm-assessments/payments-2026-q4/save", "{}");
                client.send("POST", "/mock/goto/conflict", null, Map.of());
                var conflict = client.change("POST", "/api/v1/documents/samm-assessments/payments-2026-q4/save",
                        "{}");
                assertAll(
                        () -> assertEquals("DRAFT_SAVED", json(draft).path("outcome").asText()),
                        () -> assertEquals("SAVED", json(saved).path("outcome").asText()),
                        () -> assertEquals(409, conflict.statusCode()),
                        () -> assertEquals("sm", json(conflict).path("conflicts").get(0).path("part").asText()));
            }
        }
    }

    @Nested
    @DisplayName("release")
    class Release {

        private static final String RELEASE = "/api/v1/releases/samm-assessments/payments-2026-q4";

        @Test
        @DisplayName("asks for step-up first, then releases and serves the frozen assessment")
        void shouldReleaseAfterStepUp() {
            try (var client = MockClient.start("release").login()) {
                var first = client.change("POST", RELEASE, null);
                var second = client.change("POST", RELEASE, null);
                var assessment = json(client.get("/api/v1/documents/samm-assessments/payments-2026-q4"));
                assertAll(
                        () -> assertEquals(403, first.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(first).path("outcome").asText()),
                        () -> assertTrue(json(first).path("stepUp").asText().startsWith("/api/v1/auth/login")),
                        () -> assertEquals("RELEASED", json(second).path("outcome").asText()),
                        () -> assertEquals("released", assessment.path("state").asText()),
                        () -> assertEquals("assessments/payments-2026-q4/v1",
                                assessment.path("release").path("tag").asText()));
            }
        }

        @Test
        @DisplayName("refuses a wrong password and reports a change since the review")
        void shouldRefuse() {
            try (var client = MockClient.start("release#wrong-password").login()) {
                var stepUp = json(client.get("/api/v1/status")).path("stepUp").asText();
                var wrong = client.change("POST", RELEASE, "{\"password\":\"nope\"}");
                client.send("POST", "/mock/goto/changed", null, Map.of());
                var changed = client.change("POST", RELEASE, null);
                var recorded = json(client.get("/mock/acts")).get(0).path("body");
                assertAll(
                        () -> assertEquals("password", stepUp),
                        () -> assertEquals("[redacted]", recorded.path("password").asText(),
                                "a password must not be readable in /mock/acts"),
                        () -> assertEquals("INVALID_CREDENTIALS", json(wrong).path("outcome").asText()),
                        () -> assertEquals("CHANGED_SINCE_REVIEW", json(changed).path("outcome").asText()));
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
                        () -> assertFalse(up.path("degraded").asBoolean()),
                        () -> assertEquals("SAVED", json(client.change("POST",
                                "/api/v1/documents/samm-assessments/payments-2026-q4/save", "{}")).path("outcome")
                                .asText(), "a save succeeds again once the Git server is back"));
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
