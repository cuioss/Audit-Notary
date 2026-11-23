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

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("RP-initiated logout (AUN-AUTH-1)")
class LogoutIT {

    @Test
    @DisplayName("logout ends the session, revokes the tokens and leads to Keycloak's end-session address")
    void logout() {
        var login = Stack.login("ana-approver", "/");

        var answer = Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId())
                .header("X-CSRF-Token", login.csrfToken()).header("Origin", Stack.BASE)
                .post(Stack.BASE + "/api/v1/auth/logout");

        assertEquals(200, answer.statusCode(), answer.asString());
        var redirect = answer.jsonPath().getString("redirect");
        assertTrue(redirect.startsWith(Stack.KEYCLOAK + "/realms/audit-notary/protocol/openid-connect/logout?"),
                redirect);
        assertTrue(redirect.contains("id_token_hint="), redirect);
        assertTrue(redirect.contains("post_logout_redirect_uri=" + URLEncoder.encode(Stack.BASE + "/",
                StandardCharsets.UTF_8)), redirect);
        assertEquals(401, Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId())
                .get(Stack.BASE + "/api/v1/session").statusCode());

        var endSession = Stack.request().get(redirect);
        assertEquals(302, endSession.statusCode(), endSession.asString());
        assertTrue(endSession.header("Location").startsWith(Stack.BASE + "/"), endSession.header("Location"));
    }
}
