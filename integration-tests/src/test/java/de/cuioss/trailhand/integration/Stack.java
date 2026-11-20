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

import io.restassured.RestAssured;
import io.restassured.config.RedirectConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The addresses of the integration stack and a browser-like login through Keycloak (TRH-AUTH-1): no automatic
 * redirects, cookies kept per site, the provider's login form filled in.
 */
final class Stack {

    /** The application's own origin. */
    static final String BASE = System.getProperty("trailhand.it.base", "https://localhost:10443");

    /** The management interface. */
    static final String MANAGEMENT = System.getProperty("trailhand.it.management", "http://localhost:19000");

    /** The session cookie. */
    static final String SESSION_COOKIE = "__Host-trailhand-session";

    /** The login-transaction cookie. */
    static final String LOGIN_COOKIE = "__Host-trailhand-login";

    private static final Pattern FORM_ACTION = Pattern.compile("<form[^>]*id=\"kc-form-login\"[^>]*action=\"([^\"]+)\"");

    private Stack() {
    }

    /**
     * @return a request against the stack: self-signed certificates accepted, redirects not followed
     */
    static RequestSpecification request() {
        // The configuration first: config(...) replaces the whole configuration, the SSL settings included.
        return RestAssured.given()
                .config(RestAssuredConfig.config().redirect(RedirectConfig.redirectConfig().followRedirects(false)))
                .relaxedHTTPSValidation().urlEncodingEnabled(false);
    }

    /**
     * The result of a login.
     *
     * @param sessionId     the value of the session cookie
     * @param csrfToken     the anti-CSRF token of the session
     * @param returnAddress the address the callback page navigates to
     * @param callback      the callback answer
     */
    record Login(String sessionId, String csrfToken, String returnAddress, Response callback) {
    }

    /**
     * Logs a user in, from {@code GET /api/v1/auth/login} to the session.
     *
     * @param user          the Keycloak user; its password is {@code <user>-password}
     * @param returnAddress the requested return address
     * @return the session
     */
    static Login login(String user, String returnAddress) {
        var start = request().get(BASE + "/api/v1/auth/login?return=" + returnAddress);
        assertEquals(302, start.statusCode(), start.asString());
        var transaction = start.getCookie(LOGIN_COOKIE);
        assertNotNull(transaction, "login-transaction cookie");
        var authorization = start.header("Location");
        assertTrue(authorization.contains("response_mode=query"), authorization);
        assertTrue(authorization.contains("code_challenge_method=S256"), authorization);

        var page = request().get(authorization);
        assertEquals(200, page.statusCode());
        Map<String, String> keycloakCookies = new HashMap<>(page.getCookies());
        var matcher = FORM_ACTION.matcher(page.asString());
        assertTrue(matcher.find(), "Keycloak login form");
        var action = matcher.group(1).replace("&amp;", "&");

        var answer = request().cookies(keycloakCookies).contentType("application/x-www-form-urlencoded")
                .formParam("username", user).formParam("password", user + "-password").post(action);
        assertEquals(302, answer.statusCode(), answer.asString());
        var callbackAddress = answer.header("Location");
        assertTrue(callbackAddress.startsWith(BASE + "/api/v1/auth/callback?"), callbackAddress);

        var callback = request().cookie(LOGIN_COOKIE, transaction).get(callbackAddress);
        assertEquals(200, callback.statusCode(), callback.asString());
        var sessionId = callback.getCookie(SESSION_COOKIE);
        assertNotNull(sessionId, "session cookie");
        var session = request().cookie(SESSION_COOKIE, sessionId).get(BASE + "/api/v1/session");
        assertEquals(200, session.statusCode());
        var target = URI.create(BASE).resolve(returnAddress).getPath();
        return new Login(sessionId, session.jsonPath().getString("csrfToken"), target, callback);
    }
}
