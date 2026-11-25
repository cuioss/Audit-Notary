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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("GET /api/v1/events")
class EventStreamTest {

    private MockClient client;
    private final BlockingQueue<String> lines = new LinkedBlockingQueue<>();

    @BeforeEach
    void startMock() {
        client = MockClient.start("workshop").login();
    }

    @AfterEach
    void stopMock() {
        client.close();
    }

    private void openStream() {
        var response = client.events();
        assertEquals(200, response.statusCode());
        assertEquals("text/event-stream", response.headers().firstValue("Content-Type").orElseThrow());
        Thread.ofVirtual().start(() -> response.body().forEach(lines::add));
    }

    /** Reads the stream up to the named event and returns its id line and data. */
    private Frame awaitEvent(String name) throws InterruptedException {
        String id = "";
        while (true) {
            String line = lines.poll(5, TimeUnit.SECONDS);
            assertNotNull(line, "no event " + name + " within 5 s");
            if (line.startsWith("id: ")) {
                id = line.substring(4);
            } else if (line.equals("event: " + name)) {
                String data = lines.poll(5, TimeUnit.SECONDS);
                assertNotNull(data);
                assertTrue(data.startsWith("data: "), data);
                try {
                    return new Frame(id, MockClient.MAPPER.readTree(data.substring(6)));
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }
        }
    }

    private record Frame(String id, JsonNode data) {
    }

    @Test
    @DisplayName("refuses a stream without session")
    void shouldRefuseWithoutSession() {
        try (var anonymous = MockClient.start("workshop")) {
            assertEquals(401, anonymous.get("/api/v1/events").statusCode());
        }
    }

    @Test
    @DisplayName("pushes a broadcast event as an SSE frame with id, event and data")
    void shouldPushBroadcast() throws Exception {
        // Arrange
        openStream();
        // Act
        client.send("POST", "/mock/broadcast", "{\"event\":\"document-saved\",\"data\":{\"id\":\"x\"}}", Map.of());
        // Assert
        var frame = awaitEvent("document-saved");
        assertAll(
                () -> assertTrue(Long.parseLong(frame.id()) > 0),
                () -> assertEquals("x", frame.data().path("id").asText()));
    }

    @Test
    @DisplayName("pushes the status and the events of an entered state")
    void shouldPushStateEvents() throws Exception {
        // Arrange
        openStream();
        // Act
        client.send("POST", "/mock/goto/saved-by-other", null, Map.of());
        // Assert
        var status = awaitEvent("status");
        var saved = awaitEvent("document-saved");
        assertAll(
                () -> assertTrue(status.data().has("degraded")),
                () -> assertEquals("payments-2026-q4", saved.data().path("id").asText()),
                () -> assertTrue(Long.parseLong(saved.id()) > Long.parseLong(status.id())));
    }
}
