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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The web login against Keycloak (TRH-AUTH-1, TRH-AUTH-2)")
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
