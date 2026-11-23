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

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.ArrayList;

import static de.cuioss.notary.audit.mock.MockClient.json;
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
