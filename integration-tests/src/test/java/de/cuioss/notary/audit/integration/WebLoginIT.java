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

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The web login against Keycloak (AUN-AUTH-1, AUN-AUTH-2)")
class WebLoginIT {

    @Test
    @DisplayName("a login sets HttpOnly Secure cookies, ends at the return address and gives no token to the browser")
    void login() {
        var login = Stack.login("alex-assessor", "/samm/payments");
        var callback = login.callback();

        var cookies = callback.headers().getValues("Set-Cookie");
        var session = cookies.stream().filter(value -> value.startsWith(Stack.SESSION_COOKIE + "=")).findFirst()
                .orElseThrow();
        assertTrue(session.contains("HttpOnly") && session.contains("Secure") && session.contains("SameSite=Strict")
                && session.contains("Path=/"), session);
        assertTrue(cookies.stream().anyMatch(value -> value.startsWith(Stack.LOGIN_COOKIE + "=;")
                && value.contains("Max-Age=0")), cookies.toString());
        var page = callback.asString();
        assertTrue(page.contains("http-equiv=\"refresh\" content=\"0;url=/samm/payments\""), page);
        assertFalse(page.contains("<script"), page);

        var body = Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId()).get(Stack.BASE + "/api/v1/session")
                .asString();
        for (String answer : List.of(page, body, String.join(";", cookies))) {
            assertFalse(answer.contains("eyJ"), "a JWT reached the browser: " + answer);
        }
    }

    @ParameterizedTest
    @CsvSource({"alex-assessor,Alex Assessor,'read,edit'", "ana-approver,Ana Approver,'read,approve'",
            "rudi-reader,Rudi Reader,read"})
    @DisplayName("the session names the user and the rights mapped from the Keycloak groups")
    void rights(String user, String name, String actions) {
        var login = Stack.login(user, "/");
        var session = Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId()).get(Stack.BASE + "/api/v1/session")
                .jsonPath();

        assertEquals(name, session.getString("user.name"));
        assertEquals("samm-assessments", session.getString("rights[0].repository"));
        assertEquals(List.of(actions.split(",")), session.getList("rights[0].actions"));
    }

    @Test
    @DisplayName("a group without mapping grants nothing")
    void denyByDefault() {
        var login = Stack.login("cara-catalog", "/");
        var rights = Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId()).get(Stack.BASE + "/api/v1/session")
                .jsonPath().getList("rights.repository");

        assertEquals(List.of("directory"), rights, "a mapped group grants only its own repository");

        var outsider = Stack.login("otto-outsider", "/");
        var none = Stack.request().cookie(Stack.SESSION_COOKIE, outsider.sessionId())
                .get(Stack.BASE + "/api/v1/session").jsonPath().getList("rights");
        assertEquals(List.of(), none, "a group without mapping grants nothing");
    }

    @Test
    @DisplayName("a callback without the login transaction opens no session")
    void callbackWithoutTransaction() {
        var answer = Stack.request().get(Stack.BASE + "/api/v1/auth/callback?code=forged&state=forged");

        assertEquals(400, answer.statusCode());
        assertTrue(answer.headers().getValues("Set-Cookie").stream()
                .noneMatch(value -> value.startsWith(Stack.SESSION_COOKIE + "=") && !value.contains("Max-Age=0")));
    }
}
