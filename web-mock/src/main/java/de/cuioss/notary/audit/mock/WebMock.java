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
package de.cuioss.notary.audit.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.notary.audit.mock.http.MockHttpServer;
import de.cuioss.notary.audit.mock.runtime.CanonicalAddresses;
import de.cuioss.notary.audit.mock.runtime.MessageCatalogue;
import de.cuioss.notary.audit.mock.runtime.MockEngine;
import de.cuioss.notary.audit.mock.runtime.Timing;
import de.cuioss.notary.audit.mock.scenario.ScenarioLoader;
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;
import de.cuioss.notary.audit.mock.scenario.ScenarioValidationException;
import de.cuioss.tools.logging.CuiLogger;

import java.io.IOException;

/**
 * A running web mock: engine and HTTP server, started from a scenario reference.
 * <p>
 * Use it from tests with {@code try (var mock = WebMock.start("workshop", 0, Timing.ORDERED)) { ... }}.
 */
public final class WebMock implements AutoCloseable {

    /** The default port of the web mock. */
    public static final int DEFAULT_PORT = 7420;

    /** The default profile. */
    public static final String DEFAULT_SCENARIO = "workshop";

    private static final CuiLogger LOGGER = new CuiLogger(WebMock.class);

    private final MockHttpServer server;
    private final MockEngine engine;

    private WebMock(MockHttpServer server, MockEngine engine) {
        this.server = server;
        this.engine = engine;
    }

    /**
     * Starts a web mock.
     *
     * @param reference the scenario reference, {@code name} or {@code name#state} or a file path
     * @param port      the port; {@code 0} picks a free one
     * @param timing    how delays are played
     * @return the running mock
     * @throws IOException                 if the port cannot be bound
     * @throws IllegalArgumentException    if the reference names no scenario
     * @throws ScenarioValidationException if the scenario breaks a rule of the format
     */
    public static WebMock start(String reference, int port, Timing timing) throws IOException {
        var mapper = new ObjectMapper();
        ClassLoader classLoader = WebMock.class.getClassLoader();
        var registry = new ScenarioRegistry(new ScenarioLoader(mapper), classLoader);
        var initial = registry.resolve(reference)
                .orElseThrow(() -> new IllegalArgumentException("No scenario named " + reference));
        var engine = new MockEngine(initial, timing, mapper, registry, CanonicalAddresses.load(mapper, classLoader),
                MessageCatalogue.load(classLoader));
        MockHttpServer server;
        try {
            server = MockHttpServer.start(engine, port);
        } catch (IOException e) {
            engine.close();
            throw e;
        }
        LOGGER.info(WebMockLogMessages.INFO.STARTED, server.baseUrl(), initial.display(), timing);
        return new WebMock(server, engine);
    }

    /**
     * The bound port.
     *
     * @return the port
     */
    public int port() {
        return server.port();
    }

    /**
     * The base address.
     *
     * @return {@code http://127.0.0.1:<port>}
     */
    public String baseUrl() {
        return server.baseUrl();
    }

    /**
     * The active scenario and state.
     *
     * @return {@code name#state}
     */
    public String current() {
        return engine.current();
    }

    /** Stops the mock. */
    @Override
    public void close() {
        server.close();
    }
}
