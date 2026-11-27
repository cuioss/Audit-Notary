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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.notary.audit.mock.runtime.CanonicalAddresses;
import de.cuioss.notary.audit.mock.runtime.MockEngine;
import de.cuioss.notary.audit.mock.scenario.Route;
import de.cuioss.notary.audit.mock.scenario.ScenarioLoader;
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The primary profiles")
class ProfilesTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final ClassLoader CLASS_LOADER = ProfilesTest.class.getClassLoader();
    private static final ScenarioRegistry REGISTRY = new ScenarioRegistry(
            new ScenarioLoader(MAPPER, name -> ScenarioRegistry.readDataFile(CLASS_LOADER, name)), CLASS_LOADER);

    static Stream<String> primaries() {
        return REGISTRY.primaryNames().stream();
    }

    @ParameterizedTest
    @MethodSource("primaries")
    @DisplayName("load, answer status, messages and session, and link only canonical addresses")
    void shouldServeEveryPrimary(String name) {
        // Arrange
        var scenario = REGISTRY.resolve(name).orElseThrow().scenario();
        var addresses = CanonicalAddresses.load(MAPPER, ProfilesTest.class.getClassLoader());
        List<String> linked = new ArrayList<>();
        Stream.concat(scenario.routes().values().stream(),
                scenario.states().values().stream().flatMap(state -> state.routes().values().stream()))
                .map(Route::body).forEach(body -> body.path("items").forEach(item ->
                linked.add(item.path("address").asText())));
        try (var client = MockClient.start(name).login()) {
            // Act
            var status = client.get("/api/v1/status");
            var session = client.get("/api/v1/session");
            // Assert
            assertAll(
                    () -> assertEquals(name, scenario.name()),
                    () -> assertEquals(200, status.statusCode()),
                    () -> assertTrue(json(status).has("degraded")),
                    () -> assertEquals(200, session.statusCode()),
                    () -> assertEquals(200, client.get("/api/v1/messages").statusCode()),
                    () -> linked.forEach(address -> assertTrue(addresses.isCanonical(address),
                            name + " links a non-canonical address " + address)));
        }
    }

    @Nested
    @DisplayName("workshop")
    class Workshop {

        @Test
        @DisplayName("lists due items of every kind and the catalogs")
        void shouldServeDueAndCatalogs() {
            try (var client = MockClient.start("workshop").login()) {
                var items = json(client.get("/api/v1/due")).path("items");
                List<String> kinds = new ArrayList<>();
                items.forEach(item -> kinds.add(item.path("kind").asText()));
                assertAll(
                        () -> assertTrue(items.size() >= 5),
                        () -> assertTrue(kinds.containsAll(List.of("deadline", "review", "release"))),
                        () -> assertFalse(json(client.get("/api/v1/catalogs/team")).path("entries").isEmpty()),
                        () -> assertFalse(json(client.get("/api/v1/catalogs/role")).path("entries").isEmpty()));
            }
        }

        @Test
        @DisplayName("grants read, edit and approve on the threat models, so that the release of a review can be walked through")
        void shouldGrantApproveOnTheThreatModels() {
            try (var client = MockClient.start("workshop").login()) {
                List<String> actions = new ArrayList<>();
                json(client.get("/api/v1/session")).path("rights").forEach(right -> {
                    if ("threat-models".equals(right.path("repository").asText())) {
                        right.path("actions").forEach(action -> actions.add(action.asText()));
                    }
                });
                assertEquals(List.of("read", "edit", "approve"), actions);
            }
        }

        @Test
        @DisplayName("serves the SAMM model, the scopes and the open assessment from the data files")
        void shouldServeSamm() {
            try (var client = MockClient.start("workshop").login()) {
                var model = json(client.get("/api/v1/samm/models/v2.2.0"));
                var scope = json(client.get("/api/v1/samm/scopes/payments"));
                var assessment = json(client.get("/api/v1/documents/samm-assessments/payments-2026-q4"));
                int questions = 0;
                for (var fn : model.path("functions")) {
                    for (var practice : fn.path("practices")) {
                        for (var stream : practice.path("streams")) {
                            questions += stream.path("questions").size();
                        }
                    }
                }
                int total = questions;
                assertAll(
                        () -> assertEquals(90, total),
                        () -> assertEquals(5, model.path("functions").size()),
                        () -> assertEquals(4, json(client.get("/api/v1/samm/scopes")).path("scopes").size()),
                        () -> assertEquals("payments-2026-q4", scope.path("assessments").get(0).path("document").asText()),
                        () -> assertEquals("draft", assessment.path("state").asText()),
                        () -> assertEquals(200,
                                client.get("/api/v1/documents/samm-assessments/payments-2026-q4/diff?from=released")
                                        .statusCode()));
            }
        }

        @Test
        @DisplayName("refuses the submit of the draft with exactly the answers it lacks")
        void shouldRefuseSubmitWithMissingAnswers() {
            try (var client = MockClient.start("workshop").login()) {
                var model = json(client.get("/api/v1/samm/models/v2.2.0"));
                var answers = json(client.get("/api/v1/documents/samm-assessments/payments-2026-q4")).path("answers");
                List<String> expected = new ArrayList<>();
                for (var fn : model.path("functions")) {
                    for (var practice : fn.path("practices")) {
                        for (var stream : practice.path("streams")) {
                            for (var question : stream.path("questions")) {
                                String p = practice.path("id").asText();
                                String q = question.path("id").asText();
                                if (!answers.path(p).path(q).path("answer").isNumber()) {
                                    expected.add("/answers/" + p + "/" + q + "/answer");
                                }
                            }
                        }
                    }
                }
                var refused = client.change("POST",
                        "/api/v1/documents/samm-assessments/payments-2026-q4/transitions/samm.submit", null);
                List<String> missing = new ArrayList<>();
                json(refused).path("missing").forEach(pointer -> missing.add(pointer.asText()));
                assertAll(
                        () -> assertEquals(422, refused.statusCode()),
                        () -> assertFalse(expected.isEmpty()),
                        () -> assertEquals(expected, missing));
            }
        }

        @Test
        @DisplayName("serves in saved-by-other the answers another assessor changed")
        void shouldServeOtherAnswers() {
            try (var client = MockClient.start("workshop").login()) {
                var path = "/api/v1/documents/samm-assessments/payments-2026-q4";
                var before = json(client.get(path)).path("answers").path("sm");
                client.send("POST", "/mock/goto/saved-by-other", null, Map.of());
                var after = json(client.get(path)).path("answers").path("sm");
                assertAll(
                        () -> assertNotEquals(before.path("sm-b-1"), after.path("sm-b-1")),
                        () -> assertNotEquals(before.path("sm-b-2"), after.path("sm-b-2")));
            }
        }

        @Test
        @DisplayName("keeps a draft, saves for everyone, and answers CONFLICT in the state conflict")
        void shouldSaveAndConflict() {
            try (var client = MockClient.start("workshop").login()) {
                var draft = client.change("PUT", "/api/v1/drafts/samm-assessments/payments-2026-q4", "{}");
                var saved = client.change("POST", "/api/v1/documents/samm-assessments/payments-2026-q4/save", "{}");
                client.send("POST", "/mock/goto/conflict", null, Map.of());
                var conflict = client.change("POST", "/api/v1/documents/samm-assessments/payments-2026-q4/save",
                        "{}");
                assertAll(
                        () -> assertEquals("DRAFT_SAVED", json(draft).path("outcome").asText()),
                        () -> assertEquals("SAVED", json(saved).path("outcome").asText()),
                        () -> assertEquals(409, conflict.statusCode()),
                        () -> assertEquals("sm", json(conflict).path("conflicts").get(0).path("part").asText()));
            }
        }
    }

    @Nested
    @DisplayName("release")
    class Release {

        private static final String RELEASE = "/api/v1/releases/samm-assessments/payments-2026-q4";

        @Test
        @DisplayName("holds no right on the threat models, which the lens answers with FORBIDDEN")
        void shouldHoldNoRightOnTheThreatModels() {
            try (var client = MockClient.start("release").login()) {
                List<String> repositories = new ArrayList<>();
                json(client.get("/api/v1/session")).path("rights").forEach(right -> repositories.add(right.path("repository").asText()));
                assertAll(
                        () -> assertFalse(repositories.contains("threat-models")),
                        () -> assertEquals(403, client.get("/api/v1/threat-models/payment-api").statusCode()));
            }
        }

        @Test
        @DisplayName("asks for step-up first, then releases and serves the frozen assessment")
        void shouldReleaseAfterStepUp() {
            try (var client = MockClient.start("release").login()) {
                var first = client.change("POST", RELEASE, null);
                var second = client.change("POST", RELEASE, null);
                var assessment = json(client.get("/api/v1/documents/samm-assessments/payments-2026-q4"));
                assertAll(
                        () -> assertEquals(403, first.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(first).path("outcome").asText()),
                        () -> assertTrue(json(first).path("stepUp").asText().startsWith("/api/v1/auth/login")),
                        () -> assertEquals("RELEASED", json(second).path("outcome").asText()),
                        () -> assertEquals("released", assessment.path("state").asText()),
                        () -> assertEquals("assessments/payments-2026-q4/v1",
                                assessment.path("release").path("tag").asText()));
            }
        }

        @Test
        @DisplayName("refuses a wrong password and reports a change since the review")
        void shouldRefuse() {
            try (var client = MockClient.start("release#wrong-password").login()) {
                var status = json(client.get("/api/v1/status"));
                var stepUp = status.path("stepUp").asText();
                var wrong = client.change("POST", RELEASE, "{\"password\":\"nope\"}");
                client.send("POST", "/mock/goto/changed", null, Map.of());
                var changed = client.change("POST", RELEASE, null);
                var recorded = json(client.get("/mock/acts")).get(0).path("body");
                assertAll(
                        () -> assertEquals("password", stepUp),
                        () -> assertEquals("[redacted]", recorded.path("password").asText(),
                                "a password must not be readable in /mock/acts"),
                        () -> assertEquals(401, wrong.statusCode()),
                        () -> assertEquals("INVALID_CREDENTIALS", json(wrong).path("outcome").asText()),
                        () -> assertEquals("local", status.path("loginProvider").asText()),
                        () -> assertEquals("CHANGED_SINCE_REVIEW", json(changed).path("outcome").asText()));
            }
        }
    }

    @Nested
    @DisplayName("release, with too many logins")
    class ReleaseTooManyLogins {

        private static final String RELEASE = "/api/v1/releases/samm-assessments/payments-2026-q4";

        @Test
        @DisplayName("refuses the release with 503 and Retry-After, writes nothing and leaves with the review state")
        void shouldRefuseWhenTooManyLoginsArePending() {
            try (var client = MockClient.start("release#too-many-logins").login()) {
                var refused = client.change("POST", RELEASE, null);
                var state = json(client.get("/mock/state"));
                var acts = json(client.get("/mock/acts"));
                var assessment = json(client.get("/api/v1/documents/samm-assessments/payments-2026-q4"));
                client.send("POST", "/mock/goto/review", null, Map.of());
                var asked = client.change("POST", RELEASE, null);
                assertAll(
                        () -> assertEquals(503, refused.statusCode()),
                        () -> assertEquals("60", refused.headers().firstValue("Retry-After").orElse("")),
                        () -> assertEquals("TOO_MANY_LOGINS", json(refused).path("outcome").asText()),
                        () -> assertEquals("too-many-logins", state.path("state").asText(),
                                "the state does not change"),
                        () -> assertEquals(1, acts.size(), "the attempt is recorded"),
                        () -> assertEquals("in-review", assessment.path("state").asText(), "nothing is written"),
                        () -> assertEquals("STEP_UP_REQUIRED", json(asked).path("outcome").asText()));
            }
        }
    }

    @Nested
    @DisplayName("read-only")
    class ReadOnly {

        @Test
        @DisplayName("grants only read and refuses an edit with FORBIDDEN")
        void shouldGrantReadOnly() {
            try (var client = MockClient.start("read-only").login()) {
                var rights = json(client.get("/api/v1/session")).path("rights");
                List<String> actions = new ArrayList<>();
                rights.forEach(right -> right.path("actions").forEach(action -> actions.add(action.asText())));
                var edit = client.change("PUT", "/api/v1/directory/me", "{}");
                assertAll(
                        () -> assertTrue(actions.stream().allMatch("read"::equals)),
                        () -> assertEquals(403, edit.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(edit).path("outcome").asText()));
            }
        }
    }

    @Nested
    @DisplayName("degraded")
    class Degraded {

        @Test
        @DisplayName("reports degraded, refuses a save with GIT_UNAVAILABLE and recovers")
        void shouldDegradeAndRecover() {
            try (var client = MockClient.start("degraded").login()) {
                JsonNode down = json(client.get("/api/v1/status"));
                var save = client.change("PUT", "/api/v1/directory/me", "{}");
                client.send("POST", "/mock/goto/recovered", null, Map.of());
                JsonNode up = json(client.get("/api/v1/status"));
                assertAll(
                        () -> assertTrue(down.path("degraded").asBoolean()),
                        () -> assertEquals("DOWN", down.path("repositories").get(0).path("fetch").asText()),
                        () -> assertEquals(503, save.statusCode()),
                        () -> assertEquals("GIT_UNAVAILABLE", json(save).path("outcome").asText()),
                        () -> assertEquals(200, client.get("/api/v1/due").statusCode()),
                        () -> assertFalse(up.path("degraded").asBoolean()),
                        () -> assertEquals("SAVED", json(client.change("POST",
                                "/api/v1/documents/samm-assessments/payments-2026-q4/save", "{}")).path("outcome")
                                .asText(), "a save succeeds again once the Git server is back"));
            }
        }
    }

    @Nested
    @DisplayName("empty")
    class Empty {

        @Test
        @DisplayName("has nothing due")
        void shouldHaveNothingDue() {
            try (var client = MockClient.start("empty").login()) {
                assertEquals(0, json(client.get("/api/v1/due")).path("items").size());
            }
        }
    }

    @Nested
    @DisplayName("local")
    class Local {

        private static final String FORM = "application/x-www-form-urlencoded";

        @Test
        @DisplayName("is no primary profile and names the provider local with step-up off")
        void shouldBeLocalAndNotPrimary() {
            try (var client = MockClient.start("local")) {
                var status = json(client.get("/api/v1/status"));
                assertAll(
                        () -> assertFalse(REGISTRY.primaryNames().contains("local")),
                        () -> assertEquals("local", status.path("loginProvider").asText()),
                        () -> assertEquals("off", status.path("stepUp").asText()));
            }
        }

        @Test
        @DisplayName("sends the login start to the page /login with the checked return, and creates no session")
        void shouldRedirectLoginStart() {
            try (var client = MockClient.start("local")) {
                var samm = client.get("/api/v1/auth/login?return=/samm");
                var refused = client.get("/api/v1/auth/login?return=//evil.example/x");
                var outside = client.get("/api/v1/auth/login?return=/login");
                assertAll(
                        () -> assertEquals(302, samm.statusCode()),
                        () -> assertEquals("/login?return=%2Fsamm", samm.headers().firstValue("Location").orElse("")),
                        () -> assertTrue(samm.headers().firstValue("Set-Cookie").isEmpty()),
                        () -> assertEquals("/login?return=%2F", refused.headers().firstValue("Location").orElse("")),
                        () -> assertEquals("/login?return=%2F", outside.headers().firstValue("Location").orElse(""),
                                "an address outside the shell is no valid return"));
            }
        }

        @Test
        @DisplayName("answers a request without session with 401 and the login page")
        void shouldNameTheLoginPage() {
            try (var client = MockClient.start("local")) {
                var response = client.get("/api/v1/session");
                assertAll(
                        () -> assertEquals(401, response.statusCode()),
                        () -> assertEquals("UNAUTHENTICATED", json(response).path("outcome").asText()),
                        () -> assertEquals("/login", json(response).path("login").asText()));
            }
        }

        @Test
        @DisplayName("starts a session with the right username and password: 200, empty body, cookie")
        void shouldLogIn() {
            try (var client = MockClient.start("local")) {
                var login = client.sendForm("alex", "local-password");
                client.adopt(login);
                assertAll(
                        () -> assertEquals(200, login.statusCode()),
                        () -> assertEquals("", login.body()),
                        () -> assertTrue(login.headers().firstValue("Set-Cookie").orElse("")
                                .startsWith("audit-notary-mock-session=")),
                        () -> assertEquals(200, client.get("/api/v1/session").statusCode()),
                        () -> assertEquals("Alex Example", json(client.get("/api/v1/session")).path("user")
                                .path("name").asText()));
            }
        }

        @Test
        @DisplayName("refuses a wrong password and an unknown user alike: 401, empty body, no cookie")
        void shouldRefuseWrongCredentials() {
            try (var client = MockClient.start("local")) {
                var wrong = client.sendForm("alex", "nope");
                var unknown = client.sendForm("nobody", "local-password");
                assertAll(
                        () -> assertEquals(401, wrong.statusCode()),
                        () -> assertEquals("", wrong.body()),
                        () -> assertTrue(wrong.headers().firstValue("Set-Cookie").isEmpty()),
                        () -> assertEquals(401, unknown.statusCode()),
                        () -> assertEquals("", unknown.body()),
                        () -> assertTrue(unknown.headers().firstValue("Set-Cookie").isEmpty()),
                        () -> assertEquals(401, client.get("/api/v1/session").statusCode()));
            }
        }

        @Test
        @DisplayName("refuses a login without Origin or from another origin: 403 CSRF_REJECTED")
        void shouldRefuseForeignOrigin() {
            try (var client = MockClient.start("local")) {
                var body = "j_username=alex&j_password=local-password";
                var without = client.send("POST", "/j_security_check", body, Map.of("Content-Type", FORM));
                var foreign = client.send("POST", "/j_security_check", body,
                        Map.of("Content-Type", FORM, "Origin", "https://evil.example"));
                assertAll(
                        () -> assertEquals(403, without.statusCode()),
                        () -> assertEquals("CSRF_REJECTED", json(without).path("outcome").asText()),
                        () -> assertEquals(403, foreign.statusCode()),
                        () -> assertTrue(foreign.headers().firstValue("Set-Cookie").isEmpty()));
            }
        }

        @Test
        @DisplayName("logs out to /signed-out, and never records a password in the acts")
        void shouldLogOutAndKeepNoPassword() {
            try (var client = MockClient.start("local").loginLocal("alex", "local-password")) {
                client.change("PUT", "/api/v1/directory/me", null);
                var form = client.send("PUT", "/api/v1/directory/me", "j_password=secret&x=1", Map.of(
                        "X-CSRF-Token", client.csrfToken(), "Content-Type", FORM));
                var acts = client.get("/mock/acts");
                var logout = client.change("POST", "/api/v1/auth/logout", null);
                assertAll(
                        () -> assertEquals(404, form.statusCode()),
                        () -> assertEquals("[redacted]", json(acts).get(1).path("body").path("j_password").asText()),
                        () -> assertEquals("1", json(acts).get(1).path("body").path("x").asText()),
                        () -> assertFalse(acts.body().contains("secret") || acts.body().contains("local-password")),
                        () -> assertEquals("/signed-out", json(logout).path("redirect").asText()),
                        () -> assertEquals(401, client.get("/api/v1/session").statusCode()));
            }
        }

        @Test
        @DisplayName("answers /j_security_check with 404 MOCK_NO_ROUTE when the login goes through the identity provider")
        void shouldNotKnowTheFormLoginWithOidc() {
            try (var client = MockClient.start("workshop")) {
                var response = client.sendForm("alex", "local-password");
                assertAll(
                        () -> assertEquals(404, response.statusCode()),
                        () -> assertEquals("MOCK_NO_ROUTE", json(response).path("outcome").asText()));
            }
        }
    }

    @Nested
    @DisplayName("no-rights")
    class NoRights {

        @Test
        @DisplayName("is a session like any other, with an empty list of rights")
        void shouldHaveASessionWithoutRights() {
            try (var client = MockClient.start("no-rights").login()) {
                var session = json(client.get("/api/v1/session"));
                assertAll(
                        () -> assertTrue(REGISTRY.primaryNames().contains("no-rights")),
                        () -> assertEquals("Sam Outsider", session.path("user").path("name").asText()),
                        () -> assertEquals(0, session.path("rights").size()),
                        () -> assertFalse(session.path("firstLoginRequired").asBoolean()),
                        () -> assertEquals(0, json(client.get("/api/v1/due")).path("items").size()),
                        () -> assertEquals(200, client.get("/api/v1/status").statusCode()),
                        () -> assertEquals(200, client.get("/api/v1/messages").statusCode()));
            }
        }

        @Test
        @DisplayName("refuses every request on a repository with FORBIDDEN")
        void shouldRefuseRepositoryRequests() {
            try (var client = MockClient.start("no-rights").login()) {
                var scopes = client.get("/api/v1/samm/scopes");
                var draft = client.change("PUT", "/api/v1/drafts/samm-assessments/x", "{}");
                assertAll(
                        () -> assertEquals(403, scopes.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(scopes).path("outcome").asText()),
                        () -> assertEquals(403, draft.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(draft).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("keeps the shell working: events and logout")
        void shouldKeepTheShell() {
            try (var client = MockClient.start("no-rights").login()) {
                var events = client.events();
                var logout = client.change("POST", "/api/v1/auth/logout", null);
                assertAll(
                        () -> assertEquals(200, events.statusCode()),
                        () -> assertEquals(200, logout.statusCode()));
            }
        }
    }

    @Nested
    @DisplayName("login-trouble")
    class LoginTrouble {

        private static final String LOGIN = "/api/v1/auth/login?return=/";
        private static final Map<String, String> BROWSER = Map.of("Accept", "text/html,application/xhtml+xml");

        @Test
        @DisplayName("starts in idp-unavailable, is no primary profile and answers the JSON to a client")
        void shouldAnswerIdpUnavailableAsJson() {
            try (var client = MockClient.start("login-trouble")) {
                var response = client.get(LOGIN);
                assertAll(
                        () -> assertFalse(REGISTRY.primaryNames().contains("login-trouble")),
                        () -> assertEquals(502, response.statusCode()),
                        () -> assertEquals("IDENTITY_PROVIDER_UNAVAILABLE", json(response).path("outcome").asText()),
                        () -> assertTrue(response.headers().firstValue("Set-Cookie").isEmpty()));
            }
        }

        @Test
        @DisplayName("sends a browser from idp-unavailable to /login-problem")
        void shouldSendBrowserFromIdpUnavailable() {
            try (var client = MockClient.start("login-trouble")) {
                var response = client.send("GET", LOGIN, null, BROWSER);
                assertAll(
                        () -> assertEquals(303, response.statusCode()),
                        () -> assertEquals("/login-problem?reason=idp-unavailable",
                                response.headers().firstValue("Location").orElse("")),
                        () -> assertEquals("", response.body()),
                        () -> assertTrue(response.headers().firstValue("Set-Cookie").isEmpty()));
            }
        }

        @Test
        @DisplayName("answers 503 with Retry-After in too-many-logins, and sends a browser to /login-problem")
        void shouldAnswerTooManyLogins() {
            try (var client = MockClient.start("login-trouble#too-many-logins")) {
                var json = client.get(LOGIN);
                var browser = client.send("GET", LOGIN, null, BROWSER);
                assertAll(
                        () -> assertEquals(503, json.statusCode()),
                        () -> assertEquals("60", json.headers().firstValue("Retry-After").orElse("")),
                        () -> assertEquals("TOO_MANY_LOGINS", json(json).path("outcome").asText()),
                        () -> assertEquals(303, browser.statusCode()),
                        () -> assertEquals("/login-problem?reason=too-many-logins",
                                browser.headers().firstValue("Location").orElse("")));
            }
        }

        @Test
        @DisplayName("finds a login route that lists a query, and keeps the built-in login for a request without it")
        void shouldFindALoginRouteWithAQuery(@TempDir Path directory) throws IOException {
            var file = directory.resolve("query-login.json");
            Files.writeString(file, """
                    {"format_version": 1, "name": "query-login", "user": {"name": "Alex"}, "start": "a",
                     "routes": {"GET /api/v1/auth/login?step-up=mfa": {"status": 503, "body": {"outcome": "TOO_MANY_LOGINS"}}},
                     "states": {"a": {}}}
                    """);
            try (var client = MockClient.start(file.toString())) {
                var listed = client.get("/api/v1/auth/login?return=/&step-up=mfa");
                var plain = client.get(LOGIN);
                assertAll(
                        () -> assertEquals(503, listed.statusCode()),
                        () -> assertEquals("TOO_MANY_LOGINS", json(listed).path("outcome").asText()),
                        () -> assertEquals(200, plain.statusCode()));
            }
        }

        @Test
        @DisplayName("lets the login start in unknown-transaction and refuses its callback")
        void shouldRefuseTheCallback() {
            try (var client = MockClient.start("login-trouble#unknown-transaction")) {
                var start = client.get(LOGIN);
                var json = client.get("/api/v1/auth/callback?code=mock&state=mock&iss=mock");
                var browser = client.send("GET", "/api/v1/auth/callback?code=mock&state=mock&iss=mock", null,
                        BROWSER);
                assertAll(
                        () -> assertEquals(200, start.statusCode()),
                        () -> assertTrue(start.body().contains("/api/v1/auth/callback?code=mock&amp;state=mock&amp;iss=mock")),
                        () -> assertTrue(start.headers().firstValue("Set-Cookie").isEmpty(), "no session"),
                        () -> assertEquals(400, json.statusCode()),
                        () -> assertEquals("UNKNOWN_TRANSACTION", json(json).path("outcome").asText()),
                        () -> assertEquals(303, browser.statusCode()),
                        () -> assertEquals("/login-problem?reason=unknown-transaction",
                                browser.headers().firstValue("Location").orElse("")));
            }
        }

        @Test
        @DisplayName("signs in as usual in recovered")
        void shouldSignInWhenRecovered() {
            try (var client = MockClient.start("login-trouble#recovered").login()) {
                assertAll(
                        () -> assertEquals(200, client.get("/api/v1/session").statusCode()),
                        () -> assertEquals("oidc", json(client.get("/api/v1/status")).path("loginProvider").asText()));
            }
        }

        @Test
        @DisplayName("moves from one trouble to the next with /mock/goto")
        void shouldMoveBetweenTroubles() {
            try (var client = MockClient.start("login-trouble")) {
                client.send("POST", "/mock/goto/too-many-logins", null, Map.of());
                assertEquals(503, client.get(LOGIN).statusCode());
            }
        }
    }

    @Nested
    @DisplayName("workshop, session-replaced and session-ended")
    class SessionChanges {

        private static void awaitEnd(Iterator<String> lines) throws Exception {
            var ended = CompletableFuture.supplyAsync(() -> {
                while (lines.hasNext()) {
                    lines.next();
                }
                return true;
            });
            assertTrue(ended.get(5, TimeUnit.SECONDS), "the stream must end");
        }

        @Test
        @DisplayName("session-replaced closes the stream and changes the token; the old token is refused")
        void shouldReplaceTheSession() throws Exception {
            try (var client = MockClient.start("workshop").login()) {
                var before = json(client.get("/api/v1/session")).path("csrfToken").asText();
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                client.send("POST", "/mock/goto/session-replaced", null, Map.of());
                awaitEnd(lines);
                var after = json(client.get("/api/v1/session"));
                var stale = client.change("PUT", "/api/v1/drafts/samm-assessments/payments-2026-q4", "{}");
                var reopened = client.events();
                assertAll(
                        () -> assertEquals(200, client.get("/api/v1/session").statusCode()),
                        () -> assertFalse(after.path("csrfToken").asText().isEmpty()),
                        () -> assertNotEquals(before, after.path("csrfToken").asText()),
                        () -> assertEquals(403, stale.statusCode()),
                        () -> assertEquals("CSRF_REJECTED", json(stale).path("outcome").asText()),
                        () -> assertEquals(200, reopened.statusCode(), "a reconnect opens a fresh stream"));
            }
        }

        @Test
        @DisplayName("session-ended closes the stream and the next request answers UNAUTHENTICATED")
        void shouldEndTheSession() throws Exception {
            try (var client = MockClient.start("workshop").login()) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                client.send("POST", "/mock/goto/session-ended", null, Map.of());
                awaitEnd(lines);
                var session = client.get("/api/v1/session");
                assertAll(
                        () -> assertEquals(401, session.statusCode()),
                        () -> assertEquals("UNAUTHENTICATED", json(session).path("outcome").asText()),
                        () -> assertEquals("/api/v1/auth/login", json(session).path("login").asText()));
            }
        }
    }

    @Nested
    @DisplayName("the form kit routes of workshop and read-only")
    class FormKit {

        private static final String RENDER = "/api/v1/render/asciidoc";

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("serve the three fixture schemas with the x- markers of the vocabulary")
        void shouldServeTheSchemas(String profile) {
            try (var client = MockClient.start(profile).login()) {
                var note = json(client.get("/api/v1/categories/test-note/schema"));
                var sections = json(client.get("/api/v1/categories/form-sections/schema"));
                var validation = json(client.get("/api/v1/categories/form-validation/schema"));
                var noteSchema = note.path("kinds").get(0).path("schema");
                var properties = noteSchema.path("properties");
                assertAll(
                        () -> assertEquals("test-note", note.path("category").asText()),
                        () -> assertEquals("note", note.path("kinds").get(0).path("id").asText()),
                        () -> assertEquals("test-notes", note.path("kinds").get(0).path("repository").asText()),
                        () -> assertEquals("https://json-schema.org/draft/2020-12/schema",
                                noteSchema.path("$schema").asText()),
                        () -> assertEquals("service", properties.path("service").path("x-catalog").asText()),
                        () -> assertEquals("gdr-link", properties.path("service").path("format").asText()),
                        () -> assertEquals("gdr-link", properties.path("related").path("format").asText()),
                        () -> assertTrue(properties.path("owner").path("x-person").asBoolean()),
                        () -> assertTrue(properties.path("body").path("x-asciidoc").asBoolean()),
                        () -> assertTrue(properties.path("summary").path("x-free-text").asBoolean()),
                        () -> assertEquals("sections", sections.path("kinds").get(0).path("id").asText()),
                        () -> assertEquals("form-sections", sections.path("category").asText()),
                        () -> assertEquals("validation", validation.path("kinds").get(0).path("id").asText()),
                        () -> assertEquals("test-notes", validation.path("kinds").get(0).path("repository").asText()),
                        () -> assertEquals("https://json-schema.org/draft/2020-12/schema",
                                validation.path("kinds").get(0).path("schema").path("$schema").asText()));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("refuse an unknown category with 404 NOT_FOUND")
        void shouldRefuseAnUnknownCategory(String profile) {
            try (var client = MockClient.start(profile).login()) {
                var response = client.get("/api/v1/categories/unknown-category/schema");
                assertAll(
                        () -> assertEquals(404, response.statusCode()),
                        () -> assertEquals("NOT_FOUND", json(response).path("outcome").asText()));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("hold the retired entries of the catalogs: the ledger in the services, the legacy billing in the teams")
        void shouldServeTheServiceCatalog(String profile) {
            try (var client = MockClient.start(profile).login()) {
                var service = json(client.get("/api/v1/catalogs/service")).path("entries");
                var team = json(client.get("/api/v1/catalogs/team")).path("entries");
                List<String> retired = new ArrayList<>();
                service.forEach(entry -> {
                    if (entry.path("retired").asBoolean()) {
                        retired.add(entry.path("id").asText());
                    }
                });
                List<String> retiredTeams = new ArrayList<>();
                team.forEach(entry -> {
                    if (entry.path("retired").asBoolean()) {
                        retiredTeams.add(entry.path("id").asText());
                    }
                });
                assertAll(
                        () -> assertEquals(8, service.size()),
                        () -> assertEquals(List.of("ledger"), retired),
                        () -> assertEquals(5, team.size()),
                        () -> assertEquals(List.of("legacy-billing"), retiredTeams));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("list five persons with one unbound entry, not truncated")
        void shouldListThePersons(String profile) {
            try (var client = MockClient.start(profile).login()) {
                var persons = json(client.get("/api/v1/directory/persons"));
                List<String> unbound = new ArrayList<>();
                persons.path("persons").forEach(person -> {
                    if ("unbound".equals(person.path("state").asText())) {
                        unbound.add(person.path("pseudonym").asText());
                    }
                });
                assertAll(
                        () -> assertEquals(5, persons.path("persons").size()),
                        () -> assertEquals(List.of("p-7d52e8"), unbound),
                        () -> assertFalse(persons.path("truncated").asBoolean()));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("keep every entry of the person list equal to the person it lists (the two fixtures mirror each other)")
        void shouldKeepTheListAndThePersonsConsistent(String profile) {
            try (var client = MockClient.start(profile).login()) {
                var persons = json(client.get("/api/v1/directory/persons")).path("persons");
                persons.forEach(entry -> {
                    var pseudonym = entry.path("pseudonym").asText();
                    var person = json(client.get("/api/v1/directory/persons/" + pseudonym));
                    assertAll(pseudonym,
                            () -> assertEquals(entry.path("name"), person.path("name")),
                            () -> assertEquals(entry.path("state"), person.path("state")),
                            () -> assertEquals(entry.path("memberships"), person.path("memberships")));
                });
                assertEquals(5, persons.size());
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("answer a person as bound, unbound and former, and an unknown pseudonym as NOT_FOUND")
        void shouldServeAPerson(String profile) {
            try (var client = MockClient.start(profile).login()) {
                var bound = json(client.get("/api/v1/directory/persons/p-4c1a9e"));
                var unbound = json(client.get("/api/v1/directory/persons/p-7d52e8"));
                var former = json(client.get("/api/v1/directory/persons/p-0f8a42"));
                var unknown = client.get("/api/v1/directory/persons/p-3b9d00");
                assertAll(
                        () -> assertEquals("bound", bound.path("state").asText()),
                        () -> assertTrue(bound.path("erasedOn").isNull()),
                        () -> assertEquals("unbound", unbound.path("state").asText()),
                        () -> assertEquals("former", former.path("state").asText()),
                        () -> assertTrue(former.path("name").isNull()),
                        () -> assertEquals("team:payments", former.path("memberships").get(0).path("team").asText()),
                        () -> assertEquals("2026-09-30", former.path("erasedOn").asText()),
                        () -> assertEquals(404, unknown.statusCode()),
                        () -> assertEquals("NOT_FOUND", json(unknown).path("outcome").asText()));
                for (String pseudonym : List.of("p-2b7f10", "p-61c0d4", "p-9e33a1")) {
                    assertEquals(pseudonym, json(client.get("/api/v1/directory/persons/" + pseudonym))
                            .path("pseudonym").asText());
                }
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("resolve references: found, retired, without address and not found, whatever the query")
        void shouldResolveReferences(String profile) {
            try (var client = MockClient.start(profile).login()) {
                var answer = json(client.get("/api/v1/references/resolve?ref=a:b/c&ref=x:y/z")).path("references");
                Map<String, JsonNode> byRef = new HashMap<>();
                answer.forEach(entry -> byRef.put(entry.path("ref").asText(), entry));
                assertAll(
                        () -> assertTrue(byRef.get("samm-assessments:assessment/payments-2026-q4").path("found")
                                .asBoolean()),
                        () -> assertEquals("/samm/payments/2026-q4/sm",
                                byRef.get("samm-assessments:assessment/payments-2026-q4#sm").path("address").asText()),
                        () -> assertTrue(byRef.get("service:ledger").path("retired").asBoolean()),
                        () -> assertTrue(byRef.get("test-notes:note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G").path("found")
                                .asBoolean()),
                        () -> assertTrue(byRef.get("test-notes:note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G").path("address")
                                .isNull()),
                        () -> assertFalse(byRef.get("isms-register:risk/R-999").path("found").asBoolean()),
                        () -> assertFalse(byRef.get("service:unknown-service").path("found").asBoolean()));
            }
        }

        @Test
        @DisplayName("workshop grants read, edit and approve on test-notes, read-only grants read; the status lists it")
        void shouldGrantTestNotes() {
            for (var entry : Map.of("workshop", List.of("read", "edit", "approve"), "read-only", List.of("read")).entrySet()) {
                try (var client = MockClient.start(entry.getKey()).login()) {
                    List<String> actions = new ArrayList<>();
                    json(client.get("/api/v1/session")).path("rights").forEach(right -> {
                        if ("test-notes".equals(right.path("repository").asText())) {
                            right.path("actions").forEach(action -> actions.add(action.asText()));
                        }
                    });
                    List<String> aliases = new ArrayList<>();
                    json(client.get("/api/v1/status")).path("repositories")
                            .forEach(repository -> aliases.add(repository.path("alias").asText() + ":"
                                    + repository.path("fetch").asText()));
                    assertAll(entry.getKey(),
                            () -> assertEquals(entry.getValue(), actions),
                            () -> assertTrue(aliases.contains("test-notes:UP")));
                }
            }
        }

        @Test
        @DisplayName("stay out of the other profiles: degraded, empty and release answer no route; empty has no persons")
        void shouldNotExtendTheOtherProfiles() {
            for (String profile : List.of("degraded", "empty", "release")) {
                try (var client = MockClient.start(profile).login()) {
                    assertEquals("MOCK_NO_ROUTE", json(client.get("/api/v1/categories/test-note/schema"))
                            .path("outcome").asText(), profile);
                }
            }
            for (String profile : List.of("degraded", "release")) {
                try (var client = MockClient.start(profile).login()) {
                    assertEquals("MOCK_NO_ROUTE", json(client.get("/api/v1/directory/persons"))
                            .path("outcome").asText(), profile);
                }
            }
        }

        @Test
        @DisplayName("no-rights refuses every form kit request with FORBIDDEN")
        void shouldRefuseWithoutRights() {
            try (var client = MockClient.start("no-rights").login()) {
                for (String path : List.of("/api/v1/categories/test-note/schema", "/api/v1/catalogs/service",
                        "/api/v1/directory/persons", "/api/v1/directory/persons/p-4c1a9e",
                        "/api/v1/references/resolve")) {
                    assertEquals(403, client.get(path).statusCode(), path);
                }
                var render = client.change("POST", RENDER, "{\"source\":\"x\"}");
                assertAll(
                        () -> assertEquals(403, render.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(render).path("outcome").asText()));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("render the example source: heading, strong and code")
        void shouldRenderTheExample(String profile) {
            try (var client = MockClient.start(profile).login()) {
                var response = client.change("POST", RENDER,
                        "{\"source\":\"== Decision\\n\\nWe *agree* to rotate the keys, see `ops/keys`.\"}");
                assertAll(
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertEquals("<h2>Decision</h2><div><p>We <strong>agree</strong> to rotate the keys, "
                                + "see <code>ops/keys</code>.</p></div>", json(response).path("html").asText()));
            }
        }

        @Test
        @DisplayName("render an empty source as an empty html")
        void shouldRenderAnEmptySource() {
            try (var client = MockClient.start("workshop").login()) {
                var response = client.change("POST", RENDER, "{\"source\":\"\"}");
                assertAll(
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertEquals("", json(response).path("html").asText()));
            }
        }

        @Test
        @DisplayName("escape the source: a script comes out as text")
        void shouldEscapeTheSource() {
            try (var client = MockClient.start("workshop").login()) {
                var response = client.change("POST", RENDER, "{\"source\":\"<script>alert('x')</script>\"}");
                assertEquals("<div><p>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</p></div>",
                        json(response).path("html").asText());
            }
        }

        @Test
        @DisplayName("refuse a missing source with 422 REQUIRED and a source that is no string with 422 TYPE")
        void shouldRefuseABadBody() {
            try (var client = MockClient.start("workshop").login()) {
                var missing = client.change("POST", RENDER, "{}");
                var noBody = client.change("POST", RENDER, null);
                var array = client.change("POST", RENDER, "[\"x\"]");
                var number = client.change("POST", RENDER, "{\"source\":5}");
                assertAll(
                        () -> assertEquals(422, missing.statusCode()),
                        () -> assertEquals("VALIDATION", json(missing).path("outcome").asText()),
                        () -> assertEquals("/source", json(missing).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("REQUIRED", json(missing).path("errors").get(0).path("code").asText()),
                        () -> assertEquals(422, noBody.statusCode()),
                        () -> assertEquals("REQUIRED", json(noBody).path("errors").get(0).path("code").asText()),
                        () -> assertEquals("REQUIRED", json(array).path("errors").get(0).path("code").asText()),
                        () -> assertEquals(422, number.statusCode()),
                        () -> assertEquals("TYPE", json(number).path("errors").get(0).path("code").asText()),
                        () -> assertEquals("/source", json(number).path("errors").get(0).path("pointer").asText()));
            }
        }

        @Test
        @DisplayName("render 65,536 bytes of UTF-8 and refuse 65,537 with 413 TOO_LARGE and the limit")
        void shouldLimitTheSource() {
            try (var client = MockClient.start("workshop").login()) {
                var atLimit = client.change("POST", RENDER, "{\"source\":\"" + "a".repeat(65_536) + "\"}");
                var over = client.change("POST", RENDER, "{\"source\":\"" + "a".repeat(65_537) + "\"}");
                // 32,769 characters of two bytes each: 65,538 bytes although fewer than 65,536 characters
                var multibyte = client.change("POST", RENDER, "{\"source\":\"" + "ä".repeat(32_769) + "\"}");
                assertAll(
                        () -> assertEquals(200, atLimit.statusCode()),
                        () -> assertEquals(413, over.statusCode()),
                        () -> assertEquals("TOO_LARGE", json(over).path("outcome").asText()),
                        () -> assertEquals(65_536, json(over).path("limit").asInt()),
                        () -> assertEquals(413, multibyte.statusCode()));
            }
        }

        @Test
        @DisplayName("refuse a body above the transport cap with 413 TOO_LARGE before it is buffered")
        void shouldRefuseAnOversizedBody() {
            try (var client = MockClient.start("workshop").login()) {
                var over = client.change("POST", RENDER,
                        "{\"source\":\"" + "a".repeat(MockEngine.MAX_BODY_BYTES) + "\"}");
                var atCap = client.change("POST", RENDER, "{\"source\":\"" + "a".repeat(65_536) + "\"}");
                assertAll(
                        () -> assertEquals(413, over.statusCode()),
                        () -> assertEquals("TOO_LARGE", json(over).path("outcome").asText()),
                        () -> assertEquals(65_536, json(over).path("limit").asInt()),
                        () -> assertEquals(200, atCap.statusCode()));
            }
        }

        @Test
        @DisplayName("let an import of 1.5 MiB reach its route and refuse a body above the cap with the limit of the import")
        void shouldTakeALargeImport() {
            try (var client = MockClient.start("catalog-admin").login()) {
                var content = "a".repeat(1_572_864);
                var valid = client.change("POST", "/api/v1/catalogs/import/backstage/preview",
                        "{\"documents\":[{\"name\":\"catalog-info.yaml\",\"content\":\"" + content + "\"}]}");
                var over = client.change("POST", "/api/v1/catalogs/import/backstage",
                        "{\"documents\":[{\"content\":\"" + "a".repeat(MockEngine.MAX_BODY_BYTES) + "\"}]}");
                assertAll(
                        () -> assertEquals(200, valid.statusCode()),
                        () -> assertEquals(413, over.statusCode()),
                        () -> assertEquals("TOO_LARGE", json(over).path("outcome").asText()),
                        () -> assertEquals(MockEngine.IMPORT_LIMIT_BYTES, json(over).path("limit").asInt()),
                        () -> assertEquals(2_097_152, json(over).path("limit").asInt()));
            }
        }

        @Test
        @DisplayName("require the anti-CSRF header like every other POST")
        void shouldRequireTheCsrfHeader() {
            try (var client = MockClient.start("workshop").login()) {
                var response = client.send("POST", RENDER, "{\"source\":\"x\"}", Map.of());
                assertAll(
                        () -> assertEquals(403, response.statusCode()),
                        () -> assertEquals("CSRF_REJECTED", json(response).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("preview-hostile answers the hostile html whatever the source")
        void shouldAnswerHostile() {
            try (var client = MockClient.start("workshop#preview-hostile").login()) {
                var response = client.change("POST", RENDER, "{\"source\":\"plain\"}");
                var html = json(response).path("html").asText();
                assertAll(
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertTrue(html.contains("<script>")),
                        () -> assertTrue(html.contains("onclick")),
                        () -> assertTrue(html.contains("javascript:")),
                        () -> assertTrue(html.contains("<iframe")));
            }
        }

        @Test
        @DisplayName("preview-unavailable answers 503 RENDER_UNAVAILABLE")
        void shouldAnswerUnavailable() {
            try (var client = MockClient.start("workshop").login()) {
                client.send("POST", "/mock/goto/preview-unavailable", null, Map.of());
                var response = client.change("POST", RENDER, "{\"source\":\"plain\"}");
                assertAll(
                        () -> assertEquals(503, response.statusCode()),
                        () -> assertEquals("RENDER_UNAVAILABLE", json(response).path("outcome").asText()));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("both preview states exist and the start state stays ready")
        void shouldKnowThePreviewStates(String profile) {
            var scenario = REGISTRY.resolve(profile).orElseThrow().scenario();
            assertAll(
                    () -> assertEquals("ready", scenario.start()),
                    () -> assertTrue(scenario.states().containsKey("preview-hostile")),
                    () -> assertTrue(scenario.states().containsKey("preview-unavailable")),
                    () -> assertFalse(scenario.state("preview-hostile").orElseThrow().description().isBlank()));
        }

        @Test
        @DisplayName("lists a render in the acts like any request, without being a save")
        void shouldRecordTheRenderAsAnAct() {
            try (var client = MockClient.start("workshop").login()) {
                client.change("POST", RENDER, "{\"source\":\"x\"}");
                var acts = json(client.get("/mock/acts"));
                assertAll(
                        () -> assertEquals(1, acts.size()),
                        () -> assertEquals(RENDER, acts.get(0).path("path").asText()));
            }
        }
    }
}
