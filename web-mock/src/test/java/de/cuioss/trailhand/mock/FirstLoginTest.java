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

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;

import static de.cuioss.trailhand.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("Profile first-login")
class FirstLoginTest {

    private static final String ENTRY = "{\"name\":\"Robin Newcomer\",\"team\":\"payments\",\"role\":\"developer\"}";

    private MockClient client;

    @BeforeEach
    void startMock() {
        client = MockClient.start("first-login").login();
    }

    @AfterEach
    void stopMock() {
        client.close();
    }

    @Test
    @DisplayName("the session says first login, without pseudonym")
    void shouldAnswerFirstLoginSession() {
        var session = json(client.get("/api/v1/session"));
        assertAll(
                () -> assertTrue(session.path("firstLoginRequired").asBoolean()),
                () -> assertTrue(session.path("user").path("pseudonym").isNull()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/directory/me", "/api/v1/catalogs/team", "/api/v1/catalogs/role",
            "/api/v1/status", "/api/v1/messages"})
    @DisplayName("answers the requests of the allow-list")
    void shouldAnswerAllowList(String path) {
        assertEquals(200, client.get(path).statusCode());
    }

    @Test
    @DisplayName("refuses any other request with FIRST_LOGIN_REQUIRED")
    void shouldRefuseOthers() {
        var response = client.get("/api/v1/due");
        assertAll(
                () -> assertEquals(403, response.statusCode()),
                () -> assertEquals("FIRST_LOGIN_REQUIRED", json(response).path("outcome").asText()));
    }

    @Test
    @DisplayName("saving the entry ends the first login")
    void shouldEndFirstLoginOnSave() {
        // Act
        var saved = client.change("PUT", "/api/v1/directory/me", ENTRY);
        // Assert
        var session = json(client.get("/api/v1/session"));
        assertAll(
                () -> assertEquals(200, saved.statusCode()),
                () -> assertEquals("SAVED", json(saved).path("outcome").asText()),
                () -> assertFalse(session.path("firstLoginRequired").asBoolean()),
                () -> assertEquals(200, client.get("/api/v1/due").statusCode()),
                () -> assertEquals("first-login#registered", client.mock().current()));
    }

    @Test
    @DisplayName("an invalid team is refused and the form stays")
    void shouldRefuseInvalidTeam() {
        // Arrange
        client.send("POST", "/mock/goto/invalid-team", null, Map.of());
        // Act
        var refused = client.change("PUT", "/api/v1/directory/me", ENTRY);
        // Assert
        assertAll(
                () -> assertEquals(422, refused.statusCode()),
                () -> assertEquals("/team", json(refused).path("errors").get(0).path("pointer").asText()),
                () -> assertEquals("first-login#invalid-team", client.mock().current()));
    }
}
