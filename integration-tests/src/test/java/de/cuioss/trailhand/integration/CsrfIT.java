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
package de.cuioss.trailhand.integration;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("Anti-CSRF header and Origin check (TRH-WEB-8)")
class CsrfIT {

    private static Stack.Login login;

    @BeforeAll
    static void signIn() {
        login = Stack.login("alex-assessor", "/");
    }

    @Test
    @DisplayName("a request without session is refused with 401 and the login address")
    void unauthenticated() {
        var answer = Stack.request().get(Stack.BASE + "/api/v1/session");
        assertEquals(401, answer.statusCode());
        assertEquals("/api/v1/auth/login", answer.jsonPath().getString("login"));
    }

    @Test
    @DisplayName("a state-changing request without the anti-CSRF header is refused")
    void missingToken() {
        var answer = Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId()).post(Stack.BASE + "/api/v1/auth/logout");
        assertEquals(403, answer.statusCode());
        assertEquals("CSRF_REJECTED", answer.jsonPath().getString("outcome"));
    }

    @Test
    @DisplayName("a state-changing request from a foreign origin is refused even with the token")
    void foreignOrigin() {
        var answer = Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId())
                .header("X-CSRF-Token", login.csrfToken()).header("Origin", "https://evil.example")
                .post(Stack.BASE + "/api/v1/auth/logout");
        assertEquals(403, answer.statusCode());
    }

    @Test
    @DisplayName("a wrong token is refused")
    void wrongToken() {
        var answer = Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId()).header("X-CSRF-Token", "wrong")
                .post(Stack.BASE + "/api/v1/auth/logout");
        assertEquals(403, answer.statusCode());
    }
}
