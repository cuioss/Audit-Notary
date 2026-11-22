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
package de.cuioss.notary.audit.web;

import de.cuioss.notary.audit.security.LoginIdentity;
import de.cuioss.notary.audit.security.SessionStore;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
@DisplayName("Event stream, health and metrics (AUN-WEB-9, AUN-OPS-2, AUN-GEN-5)")
class RuntimeEndpointsTest {

    @Inject
    SessionStore sessions;

    @TestHTTPResource("/api/v1/events")
    URL events;

    @Test
    @DisplayName("the event stream opens with the status event")
    void eventStream() throws Exception {
        var session = sessions.open(new LoginIdentity("https://idp.example.org", "s", "Alex", List.of(), null, null));
        var request = HttpRequest.newBuilder(URI.create(events.toString())).timeout(Duration.ofSeconds(10))
                .header("Cookie", Cookies.SESSION + "=" + session.id()).header("Accept", "text/event-stream").build();

        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofInputStream());

        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("text/event-stream"));
        try (var reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            var first = reader.readLine();
            var second = reader.readLine();
            // A field may be followed by a space or not (WHATWG HTML, server-sent events, field parsing).
            assertEquals("event:status", first.replace(": ", ":"));
            assertTrue(second.replace(": ", ":").startsWith("data:{\"version\""), second);
        }
    }

    @Test
    @DisplayName("readiness names the repositories, metrics are on the management port")
    void management() {
        var managementPort = Integer.parseInt(System.getProperty("quarkus.management.test-port", "9001"));
        var health = given().port(managementPort).get("/q/health/ready").then().extract();
        assertTrue(health.asString().contains("\"repositories\""), health.asString());
        given().port(managementPort).get("/q/health/group/git-remote").then().extract();
        given().port(managementPort).get("/q/metrics").then().statusCode(200);
    }
}
