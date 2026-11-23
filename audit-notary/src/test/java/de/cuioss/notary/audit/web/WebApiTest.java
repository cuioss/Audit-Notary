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
package de.cuioss.notary.audit.web;

import de.cuioss.notary.audit.security.LoginIdentity;
import de.cuioss.notary.audit.security.SessionStore;
import de.cuioss.notary.audit.security.UserSession;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
@DisplayName("The web API: gate, page security and shell requests (AUN-WEB-1, AUN-WEB-8, AUN-WEB-9, AUN-AUTH-1)")
class WebApiTest {

    private static final String OWN_ORIGIN = "https://audit-notary.example.org";

    @Inject
    SessionStore sessions;

    private UserSession session;

    @BeforeEach
    void openSession() {
        session = sessions.open(new LoginIdentity("https://idp.example.org/realms/audit-notary", "sub-1", "Alex Example",
                List.of("assessors"), Instant.now(), "1"));
    }

    @Nested
    @DisplayName("Public requests")
    class PublicRequests {

        @Test
        @DisplayName("status answers without login and names the repositories")
        void status() {
            var body = given().when().get("/api/v1/status").then().statusCode(200).extract().jsonPath();
            assertNotNull(body.getString("version"));
            assertEquals("samm-assessments", body.getString("repositories[0].alias"));
        }

        @Test
        @DisplayName("messages answer English by default, German on request, and refuse another language")
        void messages() {
            assertEquals("Due", given().get("/api/v1/messages").then().statusCode(200).extract().path("'lens.due'"));
            assertEquals("Fällig",
                    given().get("/api/v1/messages?lang=de").then().statusCode(200).extract().path("'lens.due'"));
            assertEquals("VALIDATION",
                    given().get("/api/v1/messages?lang=fr").then().statusCode(400).extract().path("outcome"));
        }
    }

    @Nested
    @DisplayName("The session gate")
    class Gate {

        @Test
        @DisplayName("refuses a request without session with 401 and the login address")
        void unauthenticated() {
            var body = given().get("/api/v1/session").then().statusCode(401).extract().jsonPath();
            assertEquals("UNAUTHENTICATED", body.getString("outcome"));
            assertEquals("/api/v1/auth/login", body.getString("login"));
            given().cookie(Cookies.SESSION, "unknown").get("/api/v1/due").then().statusCode(401);
        }

        @Test
        @DisplayName("answers the session with the mapped rights and the anti-CSRF token")
        void sessionBody() {
            var body = given().cookie(Cookies.SESSION, session.id()).get("/api/v1/session").then().statusCode(200)
                    .extract().jsonPath();
            assertEquals("Alex Example", body.getString("user.name"));
            assertEquals(session.csrfToken(), body.getString("csrfToken"));
            assertEquals("samm-assessments", body.getString("rights[0].repository"));
            assertEquals(List.of("read", "edit"), body.getList("rights[0].actions"));
            assertFalse(body.getBoolean("firstLoginRequired"));
        }

        @Test
        @DisplayName("answers the due list for a session")
        void due() {
            given().cookie(Cookies.SESSION, session.id()).get("/api/v1/due").then().statusCode(200);
        }

        @Test
        @DisplayName("refuses a state-changing request without the anti-CSRF header")
        void csrfMissing() {
            assertEquals("CSRF_REJECTED", given().cookie(Cookies.SESSION, session.id()).post("/api/v1/auth/logout")
                    .then().statusCode(403).extract().path("outcome"));
        }

        @Test
        @DisplayName("refuses a state-changing request from a foreign origin even with the token")
        void foreignOrigin() {
            given().cookie(Cookies.SESSION, session.id()).header(RequestGate.CSRF_HEADER, session.csrfToken())
                    .header("Origin", "https://evil.example").post("/api/v1/auth/logout").then().statusCode(403);
        }

        @Test
        @DisplayName("logs out with the token from the own origin and deletes the session cookie")
        void logout() {
            var response = given().cookie(Cookies.SESSION, session.id())
                    .header(RequestGate.CSRF_HEADER, session.csrfToken()).header("Origin", OWN_ORIGIN)
                    .post("/api/v1/auth/logout").then().statusCode(200).extract();
            assertEquals(OWN_ORIGIN + "/", response.path("redirect"));
            assertTrue(response.header("Set-Cookie").contains("Max-Age=0"));
            given().cookie(Cookies.SESSION, session.id()).get("/api/v1/session").then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("The login callback")
    class Callback {

        @Test
        @DisplayName("refuses a callback without login transaction and offers a new login")
        void withoutTransaction() {
            var response = given().get("/api/v1/auth/callback?code=x&state=y").then().statusCode(400).extract();
            assertTrue(response.asString().contains("/api/v1/auth/login?return=/"));
            assertTrue(response.header("Set-Cookie").startsWith(Cookies.LOGIN + "=;"));
        }

        @Test
        @DisplayName("refuses a callback with an unknown login transaction")
        void unknownTransaction() {
            given().cookie(Cookies.LOGIN, "unknown").get("/api/v1/auth/callback?code=x&state=y").then()
                    .statusCode(400);
        }
    }

    @Nested
    @DisplayName("Page security and the web app")
    class Pages {

        @Test
        @DisplayName("every canonical address answers the web app's index.html with the policy header")
        void appPage() {
            var response = given().accept("text/html").get("/samm/payments/2026-q4").then().statusCode(200).extract();
            assertTrue(response.asString().contains("theme-init.js"));
            var policy = response.header("Content-Security-Policy");
            assertTrue(policy.contains("script-src 'self' 'sha256-"), policy);
            assertTrue(policy.endsWith("frame-ancestors 'none'"), policy);
            assertFalse(policy.contains("unsafe-inline"), policy);
            assertEquals("nosniff", response.header("X-Content-Type-Options"));
            assertEquals("no-referrer", response.header("Referrer-Policy"));
        }

        @Test
        @DisplayName("files of the web app are served as files")
        void staticFile() {
            given().get("/theme-init.js").then().statusCode(200).contentType(Matchers.containsString("javascript"));
        }

        @Test
        @DisplayName("an unknown API path is no page")
        void unknownApi() {
            given().cookie(Cookies.SESSION, session.id()).get("/api/v1/nothing").then().statusCode(404);
        }
    }
}
