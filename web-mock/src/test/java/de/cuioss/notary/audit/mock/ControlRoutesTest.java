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

import de.cuioss.test.juli.LogAsserts;
import de.cuioss.test.juli.TestLogLevel;
import de.cuioss.test.juli.junit5.EnableTestLogger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableTestLogger
@DisplayName("Control routes /mock")
class ControlRoutesTest {

    private MockClient client;

    @BeforeEach
    void startMock() {
        client = MockClient.start("workshop").login();
    }

    @AfterEach
    void stopMock() {
        client.close();
    }

    private void post(String path, String body) {
        client.send("POST", path, body, Map.of());
    }

    @Test
    @DisplayName("logs the start with the scenario")
    void shouldLogStart() {
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.INFO, "WEB_MOCK-1: Web mock listening on");
    }

    @Test
    @DisplayName("GET /mock/state names scenario, state and the offered links")
    void shouldAnswerState() {
        // Act
        var state = json(client.get("/mock/state"));
        // Assert
        assertAll(
                () -> assertEquals("workshop", state.path("scenario").asText()),
                () -> assertEquals("ready", state.path("state").asText()),
                () -> assertEquals("ordered", state.path("timing").asText()),
                () -> assertTrue(state.path("links").isArray()));
    }

    @Test
    @DisplayName("POST /mock/scenario switches profile and state, keeping the session")
    void shouldSwitchScenario() {
        // Act
        post("/mock/scenario", "{\"scenario\":\"first-login#invalid-team\"}");
        // Assert
        assertAll(
                () -> assertEquals("first-login#invalid-team", client.mock().current()),
                () -> assertEquals(200, client.get("/api/v1/session").statusCode()));
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.INFO, "WEB_MOCK-2");
    }

    @Test
    @DisplayName("POST /mock/scenario refuses an unknown scenario with 404")
    void shouldRefuseUnknownScenario() {
        var response = client.send("POST", "/mock/scenario", "{\"scenario\":\"nowhere\"}", Map.of());
        assertEquals(404, response.statusCode());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "WEB_MOCK-100");
    }

    @Test
    @DisplayName("POST /mock/goto moves the state; an unknown state is refused")
    void shouldGoTo() {
        post("/mock/goto/forbidden", null);
        assertEquals(403, client.get("/api/v1/due").statusCode());
        assertEquals(404, client.send("POST", "/mock/goto/nowhere", null, Map.of()).statusCode());
    }

    @Test
    @DisplayName("POST /mock/reset returns to the start state and clears the acts")
    void shouldReset() {
        // Arrange
        post("/mock/goto/forbidden", null);
        client.change("PUT", "/api/v1/directory/me", "{\"name\":\"x\"}");
        // Act
        post("/mock/reset", null);
        // Assert
        assertAll(
                () -> assertEquals("workshop#ready", client.mock().current()),
                () -> assertEquals(0, json(client.get("/mock/acts")).size()));
    }

    @Test
    @DisplayName("GET /mock/acts lists the state-changing requests with state and body")
    void shouldRecordActs() {
        // Act
        client.change("PUT", "/api/v1/directory/me", "{\"name\":\"x\"}");
        // Assert
        var act = json(client.get("/mock/acts")).get(0);
        assertAll(
                () -> assertEquals("PUT", act.path("method").asText()),
                () -> assertEquals("/api/v1/directory/me", act.path("path").asText()),
                () -> assertEquals("ready", act.path("state").asText()),
                () -> assertEquals("x", act.path("body").path("name").asText()));
        client.send("DELETE", "/mock/acts", null, Map.of());
        assertEquals(0, json(client.get("/mock/acts")).size());
    }

    @Test
    @DisplayName("POST /mock/sessions/clear drops every session")
    void shouldClearSessions() {
        post("/mock/sessions/clear", null);
        assertEquals(401, client.get("/api/v1/session").statusCode());
    }

    @Test
    @DisplayName("GET /mock/scenarios lists the primary profiles")
    void shouldListScenarios() {
        assertEquals(5, json(client.get("/mock/scenarios")).path("primary").size());
    }

    @Test
    @DisplayName("an unknown path answers 404 MOCK_NO_ROUTE")
    void shouldAnswerNoRoute() {
        var response = client.get("/api/v1/nothing-here");
        assertAll(
                () -> assertEquals(404, response.statusCode()),
                () -> assertEquals("MOCK_NO_ROUTE", json(response).path("outcome").asText()));
    }
}
