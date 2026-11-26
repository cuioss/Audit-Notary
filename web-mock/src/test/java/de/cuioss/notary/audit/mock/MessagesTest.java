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

import de.cuioss.notary.audit.mock.runtime.MessageCatalogue;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

    @Test
    @DisplayName("merges the fixture messages in both languages, with the same keys, all under category.")
    void shouldServeTheFixtureMessages() throws Exception {
        // Act
        var en = json(client.get("/api/v1/messages?lang=en"));
        var de = json(client.get("/api/v1/messages?lang=de"));
        var fixtureEn = fixtureKeys("en");
        var fixtureDe = fixtureKeys("de");
        // Assert
        assertAll(
                () -> assertFalse(fixtureEn.isEmpty()),
                () -> assertEquals(fixtureEn, fixtureDe),
                () -> assertTrue(fixtureEn.stream().allMatch(key -> key.startsWith("category."))),
                () -> assertTrue(fixtureEn.stream().allMatch(key -> en.has(key) && de.has(key))),
                () -> assertEquals("Form sections", en.path("category.form-sections.name").asText()),
                () -> assertFalse(de.path("category.form-sections.name").asText().isBlank()),
                () -> assertNotEquals(en.path("category.test-note.note.field.title").asText(),
                        de.path("category.test-note.note.field.title").asText()));
    }

    @Test
    @DisplayName("names the submit transition of the test category in both languages")
    void shouldNameTheSubmitTransition() {
        var en = json(client.get("/api/v1/messages"));
        var de = json(client.get("/api/v1/messages?lang=de"));
        String key = "category.test-note.transition.test-note.submit";
        assertAll(
                () -> assertEquals("Submit for review", en.path(key).asText()),
                () -> assertEquals("Zur Pr\u00fcfung einreichen", de.path(key).asText()),
                () -> assertFalse(en.has("category.test-note.transition.test-note.release"),
                        "the release has no key: its text is the Release of the web app"));
    }

    @Test
    @DisplayName("keeps the web app catalogue next to the fixture keys")
    void shouldKeepTheCatalogue() {
        // Act
        var de = json(client.get("/api/v1/messages?lang=de"));
        // Assert
        assertEquals("Fällig", de.path("lens.due").asText());
    }

    @Test
    @DisplayName("refuses to start when a fixture key already exists in the web app catalogue")
    void shouldRefuseAClashingKey() {
        // Act
        var thrown = assertThrows(IllegalStateException.class,
                () -> MessageCatalogue.load(MessagesTest.class.getClassLoader(), "scenarios-clash/messages"));
        // Assert
        assertAll(
                () -> assertTrue(thrown.getMessage().contains("lens.due"), thrown.getMessage()),
                () -> assertTrue(thrown.getMessage().contains("scenarios-clash/messages/messages_"),
                        thrown.getMessage()));
    }

    @Test
    @DisplayName("starts without fixture messages when the directory does not exist")
    void shouldStartWithoutFixtureMessages() {
        // Act
        var catalogue = MessageCatalogue.load(MessagesTest.class.getClassLoader(), "scenarios-absent");
        // Assert
        assertTrue(catalogue.messages("en").orElseThrow().containsKey("lens.due"));
    }

    private static Set<String> fixtureKeys(String language) throws IOException {
        var properties = new Properties();
        try (var in = MessagesTest.class.getClassLoader().getResourceAsStream(
                MessageCatalogue.FIXTURE_DIRECTORY + "/messages_" + language + ".properties")) {
            assertNotNull(in);
            properties.load(new InputStreamReader(in, StandardCharsets.UTF_8));
        }
        return new TreeSet<>(properties.stringPropertyNames());
    }
}
