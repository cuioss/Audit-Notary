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
package de.cuioss.notary.audit.mock.http;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import de.cuioss.notary.audit.mock.WebMockLogMessages;
import de.cuioss.notary.audit.mock.runtime.MockEngine;
import de.cuioss.notary.audit.mock.runtime.MockRequest;
import de.cuioss.notary.audit.mock.runtime.MockResponse;
import de.cuioss.tools.logging.CuiLogger;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The HTTP adapter of the web mock: a JDK HTTP server on the loopback interface, one virtual thread per exchange.
 * It translates each exchange into a {@link MockRequest}, writes the engine's {@link MockResponse} and keeps the
 * exchange of {@code GET /api/v1/events} open as Server-Sent Events stream.
 */
public final class MockHttpServer implements AutoCloseable {

    /** The interval of the keep-alive comment on an idle event stream. */
    public static final Duration KEEP_ALIVE = Duration.ofSeconds(15);

    private static final CuiLogger LOGGER = new CuiLogger(MockHttpServer.class);

    private final HttpServer server;
    private final ExecutorService executor;
    private final MockEngine engine;

    private MockHttpServer(HttpServer server, ExecutorService executor, MockEngine engine) {
        this.server = server;
        this.executor = executor;
        this.engine = engine;
    }

    /**
     * Starts the server on {@code 127.0.0.1}.
     *
     * @param engine the engine that answers the requests
     * @param port   the port; {@code 0} picks a free one
     * @return the running server
     * @throws IOException if the port cannot be bound
     */
    public static MockHttpServer start(MockEngine engine, int port) throws IOException {
        var server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(executor);
        var mock = new MockHttpServer(server, executor, engine);
        server.createContext("/", mock::exchange);
        server.start();
        return mock;
    }

    /**
     * The bound port.
     *
     * @return the port the server listens on
     */
    public int port() {
        return server.getAddress().getPort();
    }

    /**
     * The base address of the server.
     *
     * @return {@code http://127.0.0.1:<port>}
     */
    public String baseUrl() {
        return "http://127.0.0.1:" + port();
    }

    private void exchange(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        try (exchange) {
            var request = toRequest(exchange);
            var response = engine.handle(request);
            if (response.eventStream()) {
                stream(exchange);
            } else {
                write(exchange, response);
            }
        } catch (IOException e) {
            LOGGER.debug(e, "Exchange %s %s ended by the client", method, path);
        }
        // the fault boundary of the mock: any fault of the engine becomes 500 MOCK_FAULT instead of a dropped
        // connection, so a test sees the failing request
        // cui-rewrite:disable InvalidExceptionUsageRecipe
        catch (RuntimeException e) {
            LOGGER.error(e, WebMockLogMessages.ERROR.REQUEST_FAILED, method, path);
            writeQuietly(exchange, MockResponse.text(500, MockResponse.JSON, "{\"outcome\":\"MOCK_FAULT\"}"));
        }
    }

    private static MockRequest toRequest(HttpExchange exchange) throws IOException {
        Map<String, String> headers = new LinkedHashMap<>();
        exchange.getRequestHeaders().forEach((name, values) -> {
            if (!values.isEmpty()) {
                headers.put(name, values.getFirst());
            }
        });
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String query = exchange.getRequestURI().getRawQuery();
        return new MockRequest(exchange.getRequestMethod(), exchange.getRequestURI().getPath(),
                query == null ? "" : query, headers, body);
    }

    private static void write(HttpExchange exchange, MockResponse response) throws IOException {
        var headers = exchange.getResponseHeaders();
        headers.set("Content-Type", response.contentType());
        headers.set("Cache-Control", "no-store");
        response.headers().forEach(header -> headers.add(header.getKey(), header.getValue()));
        byte[] body = response.body();
        exchange.sendResponseHeaders(response.status(), body.length == 0 ? -1 : body.length);
        if (body.length > 0) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        }
    }

    private static void writeQuietly(HttpExchange exchange, MockResponse response) {
        try {
            write(exchange, response);
        } catch (IOException e) {
            LOGGER.debug(e, "Could not write the fault answer");
        }
    }

    private void stream(HttpExchange exchange) throws IOException {
        var headers = exchange.getResponseHeaders();
        headers.set("Content-Type", MockResponse.EVENT_STREAM);
        headers.set("Cache-Control", "no-cache");
        exchange.sendResponseHeaders(200, 0);
        var subscription = engine.broadcaster().subscribe();
        try (subscription; OutputStream out = exchange.getResponseBody()) {
            out.write(": connected\n\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
            while (true) {
                var frame = subscription.next(KEEP_ALIVE);
                if (frame.isEmpty() && !subscription.isOpen()) {
                    return;
                }
                out.write(frame.orElse(": keepalive\n\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (IOException e) {
            LOGGER.warn(WebMockLogMessages.WARN.STREAM_CLOSED, engine.broadcaster().subscriberCount());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** Stops the server, the engine and the request threads. */
    @Override
    public void close() {
        engine.close();
        server.stop(0);
        executor.shutdownNow();
        LOGGER.info(WebMockLogMessages.INFO.STOPPED);
    }
}
