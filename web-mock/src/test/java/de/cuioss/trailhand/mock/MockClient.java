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
package de.cuioss.trailhand.mock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.trailhand.mock.runtime.MockEngine;
import de.cuioss.trailhand.mock.runtime.Timing;
import org.jspecify.annotations.Nullable;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Stream;

/**
 * A test client of a running {@link WebMock}: starts the mock on a free port with ordered timing, logs in and sends
 * requests with the session cookie and the anti-CSRF token.
 */
public final class MockClient implements AutoCloseable {

    /** The mapper of the tests. */
    public static final ObjectMapper MAPPER = new ObjectMapper();

    private final WebMock mock;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private String cookie = "";
    private String csrfToken = "";

    private MockClient(WebMock mock) {
        this.mock = mock;
    }

    /**
     * Starts a mock on a free port.
     *
     * @param reference the scenario reference
     * @return the client
     */
    public static MockClient start(String reference) {
        try {
            return new MockClient(WebMock.start(reference, 0, Timing.ORDERED));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * The running mock.
     *
     * @return the mock
     */
    public WebMock mock() {
        return mock;
    }

    /**
     * Logs in through the emulated login and reads the anti-CSRF token of the session.
     *
     * @return this client
     */
    public MockClient login() {
        var login = send("GET", "/api/v1/auth/login?return=/", null, Map.of());
        String setCookie = login.headers().firstValue("Set-Cookie").orElseThrow();
        cookie = setCookie.substring(0, setCookie.indexOf(';'));
        csrfToken = json(send("GET", "/api/v1/session", null, Map.of())).path("csrfToken").asText();
        return this;
    }

    /**
     * The anti-CSRF token of the logged-in session.
     *
     * @return the token, empty before {@link #login()}
     */
    public String csrfToken() {
        return csrfToken;
    }

    /**
     * Sends a GET with the session cookie.
     *
     * @param path the path and query
     * @return the response
     */
    public HttpResponse<String> get(String path) {
        return send("GET", path, null, Map.of());
    }

    /**
     * Sends a state-changing request with the session cookie and the anti-CSRF token.
     *
     * @param method the method
     * @param path   the path
     * @param body   the JSON body, or {@code null}
     * @return the response
     */
    public HttpResponse<String> change(String method, String path, @Nullable String body) {
        return send(method, path, body, Map.of(MockEngine.CSRF_HEADER, csrfToken));
    }

    /**
     * Sends a request with the session cookie and the given headers.
     *
     * @param method  the method
     * @param path    the path and query
     * @param body    the body, or {@code null}
     * @param headers additional headers
     * @return the response
     */
    public HttpResponse<String> send(String method, String path, @Nullable String body, Map<String, String> headers) {
        var builder = HttpRequest.newBuilder(URI.create(mock.baseUrl() + path)).timeout(Duration.ofSeconds(10))
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(body));
        if (!cookie.isEmpty()) {
            builder.header("Cookie", cookie);
        }
        headers.forEach(builder::header);
        try {
            return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    /**
     * Opens the event stream.
     *
     * @return the streaming response; its body yields the lines of the stream
     */
    public HttpResponse<Stream<String>> events() {
        var request = HttpRequest.newBuilder(URI.create(mock.baseUrl() + "/api/v1/events")).header("Cookie", cookie)
                .GET().build();
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofLines());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    /**
     * Parses a JSON body.
     *
     * @param response the response
     * @return the parsed body
     */
    public static JsonNode json(HttpResponse<String> response) {
        try {
            return MAPPER.readTree(response.body());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public void close() {
        mock.close();
    }
}
