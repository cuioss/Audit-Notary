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

import java.util.ArrayList;

import static de.cuioss.trailhand.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@DisplayName("GET /api/v1/messages")
class MessagesTest {

    private MockClient client;

    @BeforeEach
    void startMock() {
        client = MockClient.start("workshop");
    }

    @AfterEach
    void stopMock() {
        client.close();
    }

    @Test
    @DisplayName("answers the English catalogue without login and without lang")
    void shouldAnswerEnglishByDefault() {
        // Act
        var response = client.get("/api/v1/messages");
        // Assert
        assertAll(
                () -> assertEquals(200, response.statusCode()),
                () -> assertEquals("Due", json(response).path("lens.due").asText()));
    }

    @Test
    @DisplayName("answers both languages with the same keys")
    void shouldAnswerSameKeys() {
        // Act
        var en = json(client.get("/api/v1/messages?lang=en"));
        var de = json(client.get("/api/v1/messages?lang=de"));
        // Assert
        var enKeys = new ArrayList<String>();
        en.fieldNames().forEachRemaining(enKeys::add);
        var deKeys = new ArrayList<String>();
        de.fieldNames().forEachRemaining(deKeys::add);
        assertAll(
                () -> assertFalse(enKeys.isEmpty()),
                () -> assertEquals(enKeys, deKeys),
                () -> assertEquals("Fällig", de.path("lens.due").asText()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"fr", "EN", "en-US", ""})
    @DisplayName("refuses any other language with 400")
    void shouldRefuseOtherLanguage(String language) {
        // Act
        var response = client.get("/api/v1/messages?lang=" + language);
        // Assert
        assertAll(
                () -> assertEquals(400, response.statusCode()),
                () -> assertEquals("VALIDATION", json(response).path("outcome").asText()),
                () -> assertEquals("/lang", json(response).path("errors").get(0).path("pointer").asText()));
    }
}
