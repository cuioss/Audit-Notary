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
package de.cuioss.notary.audit.integration;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("Anti-CSRF header and Origin check (AUN-WEB-8)")
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
