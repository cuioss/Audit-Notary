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

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("RP-initiated logout (TRH-AUTH-1)")
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
        assertTrue(redirect.startsWith("https://localhost:1443/realms/trailhand/protocol/openid-connect/logout?"),
                redirect);
        assertTrue(redirect.contains("id_token_hint="), redirect);
        assertTrue(redirect.contains("post_logout_redirect_uri=https%3A%2F%2Flocalhost%3A10443%2F"), redirect);
        assertEquals(401, Stack.request().cookie(Stack.SESSION_COOKIE, login.sessionId())
                .get(Stack.BASE + "/api/v1/session").statusCode());

        var endSession = Stack.request().get(redirect);
        assertEquals(302, endSession.statusCode(), endSession.asString());
        assertTrue(endSession.header("Location").startsWith(Stack.BASE + "/"), endSession.header("Location"));
    }
}
