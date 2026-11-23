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

import de.cuioss.notary.audit.mock.runtime.MockEngine;
import de.cuioss.test.generator.Generators;
import de.cuioss.test.generator.junit.EnableGeneratorController;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableGeneratorController
@DisplayName("Session and anti-CSRF emulation")
class SessionAndCsrfTest {

    private static final String BODY = "{\"name\":\"Alex\"}";
    private static final String DIRECTORY = "/api/v1/directory/me";

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
    @DisplayName("answers 401 with the login address without session")
    void shouldAnswerUnauthenticated() {
        // Act
        var response = client.get("/api/v1/due");
        // Assert
        assertAll(
                () -> assertEquals(401, response.statusCode()),
                () -> assertEquals("UNAUTHENTICATED", json(response).path("outcome").asText()),
                () -> assertEquals(MockEngine.LOGIN_PATH, json(response).path("login").asText()));
    }

    @Test
    @DisplayName("answers the status without session")
    void shouldAnswerStatusWithoutSession() {
        assertEquals(200, client.get("/api/v1/status").statusCode());
    }

    @Test
    @DisplayName("login sets an HttpOnly, SameSite=Strict cookie and navigates without script")
    void shouldSetCookieOnLogin() {
        // Act
        var response = client.get("/api/v1/auth/login?return=/samm/payments");
        // Assert
        String cookie = response.headers().firstValue("Set-Cookie").orElseThrow();
        assertAll(
                () -> assertEquals(200, response.statusCode()),
                () -> assertTrue(cookie.startsWith(MockEngine.SESSION_COOKIE + "="), cookie),
                () -> assertTrue(cookie.contains("HttpOnly")),
                () -> assertTrue(cookie.contains("SameSite=Strict")),
                () -> assertTrue(response.body().contains("content=\"0;url=/samm/payments\"")),
                () -> assertFalse(response.body().contains("<script")));
    }

    @Test
    @DisplayName("login replaces a foreign return address by /")
    void shouldReplaceForeignReturn() {
        var response = client.get("/api/v1/auth/login?return=//evil.example/");
        assertTrue(response.body().contains("content=\"0;url=/\""), response.body());
    }

    @Test
    @DisplayName("the session names user, rights and token")
    void shouldAnswerSession() {
        // Act
        var session = json(client.login().get("/api/v1/session"));
        // Assert
        assertAll(
                () -> assertEquals("p-4c1a9e", session.path("user").path("pseudonym").asText()),
                () -> assertEquals("Alex Example", session.path("user").path("name").asText()),
                () -> assertEquals("samm-assessments", session.path("rights").get(0).path("repository").asText()),
                () -> assertFalse(session.path("csrfToken").asText().isBlank()),
                () -> assertFalse(session.path("firstLoginRequired").asBoolean()));
    }

    @Nested
    @DisplayName("a state-changing request")
    class StateChanging {

        @BeforeEach
        void login() {
            client.login();
        }

        @Test
        @DisplayName("passes with the token and without Origin")
        void shouldPassWithToken() {
            assertEquals(404, client.change("PUT", DIRECTORY, BODY).statusCode());
        }

        @Test
        @DisplayName("is refused without the token")
        void shouldRefuseWithoutToken() {
            var response = client.send("PUT", DIRECTORY, BODY, Map.of());
            assertAll(
                    () -> assertEquals(403, response.statusCode()),
                    () -> assertEquals("CSRF_REJECTED", json(response).path("outcome").asText()));
        }

        @Test
        @DisplayName("is refused with a wrong token")
        void shouldRefuseWrongToken() {
            var response = client.send("PUT", DIRECTORY, BODY,
                    Map.of(MockEngine.CSRF_HEADER, Generators.letterStrings(20, 30).next()));
            assertEquals(403, response.statusCode());
        }

        @Test
        @DisplayName("is refused with a foreign Origin")
        void shouldRefuseForeignOrigin() {
            var response = client.send("PUT", DIRECTORY, BODY,
                    Map.of(MockEngine.CSRF_HEADER, client.csrfToken(), "Origin", "https://evil.example"));
            assertEquals(403, response.statusCode());
        }

        @Test
        @DisplayName("passes with the own origin of the Host header")
        void shouldPassOwnHostOrigin() {
            var response = client.send("PUT", DIRECTORY, BODY,
                    Map.of(MockEngine.CSRF_HEADER, client.csrfToken(), "Origin", client.mock().baseUrl()));
            assertEquals(404, response.statusCode());
        }

        @Test
        @DisplayName("passes with the forwarded origin of the Vite proxy")
        void shouldPassForwardedOrigin() {
            var response = client.send("PUT", DIRECTORY, BODY, Map.of(MockEngine.CSRF_HEADER, client.csrfToken(),
                    "Origin", "http://localhost:5173", "X-Forwarded-Host", "localhost:5173",
                    "X-Forwarded-Proto", "http"));
            assertEquals(404, response.statusCode());
        }

        @Test
        @DisplayName("is refused when the Origin differs from the forwarded origin")
        void shouldRefuseOriginOtherThanForwarded() {
            var response = client.send("PUT", DIRECTORY, BODY, Map.of(MockEngine.CSRF_HEADER, client.csrfToken(),
                    "Origin", client.mock().baseUrl(), "X-Forwarded-Host", "localhost:5173"));
            assertEquals(403, response.statusCode());
        }

        @Test
        @DisplayName("logout needs the token, ends the session and expires the cookie")
        void shouldLogout() {
            // Arrange
            assertEquals(403, client.send("POST", "/api/v1/auth/logout", null, Map.of()).statusCode());
            // Act
            var response = client.change("POST", "/api/v1/auth/logout", null);
            // Assert
            assertAll(
                    () -> assertEquals(200, response.statusCode()),
                    () -> assertEquals(MockEngine.SIGNED_OUT_PATH, json(response).path("redirect").asText()),
                    () -> assertTrue(response.headers().firstValue("Set-Cookie").orElseThrow().contains("Max-Age=0")),
                    () -> assertEquals(401, client.get("/api/v1/session").statusCode()),
                    () -> assertEquals(200, client.get(MockEngine.SIGNED_OUT_PATH).statusCode()));
        }
    }
}
