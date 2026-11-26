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

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("requires and directory_confirmation_due")
class RequiresAndConfirmationDueTest {

    private static final String WRITE = "/api/v1/catalogs/service";
    private static final String REQUIRES = "\"requires\": {\"repository\": \"directory\", \"action\": \"administer-catalogs\"}";

    @TempDir
    Path directory;

    private MockClient start(String rights, String extra) throws IOException {
        Path scenario = directory.resolve("tiny.json");
        Files.writeString(scenario, """
                {"format_version": 1, "name": "tiny", "user": {"pseudonym": "p-1", "name": "Alex"},
                 "rights": %s,
                 "start": "ready",
                 "routes": {
                   "POST /api/v1/catalogs/service": {"status": 201, "body": {"outcome": "CREATED"}, %s},
                   "POST /api/v1/catalogs/team": {"status": 201, "body": {"outcome": "CREATED"}}},
                 "states": {"ready": {"links": {
                              "create": {"method": "POST", "path": "/api/v1/catalogs/system", "next": "done", "status": 201,
                                         "body": {"outcome": "CREATED"}, %s}}},
                            "done": {}}, %s}
                """.formatted(rights, REQUIRES, REQUIRES, extra));
        return MockClient.start(scenario.toString()).login();
    }

    private static final String HELD = "[{\"repository\": \"directory\", \"actions\": [\"read\", \"administer-catalogs\"]}]";
    private static final String NOT_HELD = "[{\"repository\": \"directory\", \"actions\": [\"read\", \"edit\"]}]";
    private static final String OTHER_REPOSITORY = "[{\"repository\": \"isms-register\", \"actions\": [\"administer-catalogs\"]}]";

    @Nested
    @DisplayName("requires")
    class Requires {

        @Test
        @DisplayName("lets a route answer when the rights hold the action on the repository")
        void shouldAnswerWithTheRight() throws IOException {
            try (var client = start(HELD, "\"description\": \"tiny\"")) {
                var response = client.change("POST", WRITE, "{}");
                assertAll(
                        () -> assertEquals(201, response.statusCode()),
                        () -> assertEquals("CREATED", json(response).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("answers 403 FORBIDDEN without the action, and with the action on another repository")
        void shouldRefuseWithoutTheRight() throws IOException {
            for (String rights : new String[]{NOT_HELD, OTHER_REPOSITORY}) {
                try (var client = start(rights, "\"description\": \"tiny\"")) {
                    var response = client.change("POST", WRITE, "{}");
                    assertAll(rights,
                            () -> assertEquals(403, response.statusCode()),
                            () -> assertEquals("FORBIDDEN", json(response).path("outcome").asText()));
                }
            }
        }

        @Test
        @DisplayName("leaves a route without requires open to every user")
        void shouldLeaveOtherRoutesOpen() throws IOException {
            try (var client = start(NOT_HELD, "\"description\": \"tiny\"")) {
                assertEquals(201, client.change("POST", "/api/v1/catalogs/team", "{}").statusCode());
            }
        }

        @Test
        @DisplayName("moves a link on when the right is held")
        void shouldMoveTheLinkOn() throws IOException {
            try (var client = start(HELD, "\"description\": \"tiny\"")) {
                var response = client.change("POST", "/api/v1/catalogs/system", "{}");
                assertAll(
                        () -> assertEquals(201, response.statusCode()),
                        () -> assertEquals("tiny#done", json(client.get("/mock/state")).path("scenario").asText() + "#"
                                + json(client.get("/mock/state")).path("state").asText()));
            }
        }

        @Test
        @DisplayName("answers 403 FORBIDDEN for a link without the right and does not move the state")
        void shouldNotMoveTheLinkOn() throws IOException {
            try (var client = start(NOT_HELD, "\"description\": \"tiny\"")) {
                var response = client.change("POST", "/api/v1/catalogs/system", "{}");
                assertAll(
                        () -> assertEquals(403, response.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(response).path("outcome").asText()),
                        () -> assertEquals("ready", json(client.get("/mock/state")).path("state").asText()));
            }
        }

        @Test
        @DisplayName("records the refused request as an act, as sent")
        void shouldRecordTheRefusedAct() throws IOException {
            try (var client = start(NOT_HELD, "\"description\": \"tiny\"")) {
                client.change("POST", WRITE, "{\"id\":\"x\"}");
                var acts = json(client.get("/mock/acts"));
                assertAll(
                        () -> assertEquals(1, acts.size()),
                        () -> assertEquals(WRITE, acts.get(0).path("path").asText()),
                        () -> assertEquals("x", acts.get(0).path("body").path("id").asText()));
            }
        }
    }

    @Nested
    @DisplayName("directory_confirmation_due")
    class ConfirmationDue {

        @Test
        @DisplayName("is false in the session by default, always present")
        void shouldBeFalseByDefault() throws IOException {
            try (var client = start(HELD, "\"description\": \"tiny\"")) {
                var session = json(client.get("/api/v1/session"));
                assertAll(
                        () -> assertTrue(session.has("directoryConfirmationDue")),
                        () -> assertFalse(session.path("directoryConfirmationDue").asBoolean(true)),
                        () -> assertFalse(json(client.get("/mock/state")).path("directory_confirmation_due").asBoolean(true)));
            }
        }

        @Test
        @DisplayName("is true when the scenario says so, and a state overrides it either way")
        void shouldFollowTheScenarioAndTheState() throws IOException {
            try (var client = start(HELD, "\"directory_confirmation_due\": true")) {
                var before = json(client.get("/api/v1/session")).path("directoryConfirmationDue").asBoolean();
                var move = client.change("POST", "/api/v1/catalogs/system", "{}");
                var after = json(client.get("/api/v1/session")).path("directoryConfirmationDue").asBoolean();
                assertAll(
                        () -> assertTrue(before),
                        () -> assertEquals(201, move.statusCode()),
                        () -> assertTrue(after),
                        () -> assertTrue(json(client.get("/mock/state")).path("directory_confirmation_due").asBoolean()));
            }
        }

        @Test
        @DisplayName("is overridden by a state of the same scenario")
        void shouldBeOverriddenByAState() throws IOException {
            Path scenario = directory.resolve("override.json");
            Files.writeString(scenario, """
                    {"format_version": 1, "name": "override", "user": {"pseudonym": "p-1", "name": "Alex"},
                     "rights": [{"repository": "directory", "actions": ["read"]}], "start": "due",
                     "directory_confirmation_due": false,
                     "states": {"due": {"directory_confirmation_due": true}, "plain": {}}}
                    """);
            try (var client = MockClient.start(scenario.toString()).login()) {
                var due = json(client.get("/api/v1/session")).path("directoryConfirmationDue").asBoolean();
                client.send("POST", "/mock/goto/plain", null, Map.of());
                var plain = json(client.get("/api/v1/session")).path("directoryConfirmationDue").asBoolean();
                assertAll(() -> assertTrue(due), () -> assertFalse(plain));
            }
        }

        @Test
        @DisplayName("lets a session without a right confirm the own entry, as it reads and saves it")
        void shouldLetASessionWithoutRightsConfirm() throws IOException {
            Path scenario = directory.resolve("norights.json");
            Files.writeString(scenario, """
                    {"format_version": 1, "name": "norights", "user": {"pseudonym": "p-1", "name": "Alex"},
                     "start": "ready", "routes": {
                       "POST /api/v1/directory/me/confirmation": {"body": {"outcome": "CONFIRMED"}},
                       "POST /api/v1/directory/erasures": {"body": {"outcome": "ERASED"}}},
                     "states": {"ready": {}}}
                    """);
            try (var client = MockClient.start(scenario.toString()).login()) {
                assertAll(
                        () -> assertEquals(200, client.change("POST", "/api/v1/directory/me/confirmation", null).statusCode()),
                        () -> assertEquals(403, client.change("POST", "/api/v1/directory/erasures", null).statusCode()));
            }
        }
    }
}
