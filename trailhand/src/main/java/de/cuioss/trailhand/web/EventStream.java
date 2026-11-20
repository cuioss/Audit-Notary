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
package de.cuioss.trailhand.web;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.trailhand.service.RepositoryService;
import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseBroadcaster;
import jakarta.ws.rs.sse.SseEventSink;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * The one event stream of all browsers (TRH-WEB-9): the event {@code status} when the degraded state changes, and a
 * comment every 15 seconds so idle connections stay open. {@code document-saved} joins with the save operation.
 */
@ApplicationScoped
public class EventStream {

    private final RepositoryService repositories;
    private final String version;
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile Sse sse;
    private volatile SseBroadcaster broadcaster;
    private volatile String lastStatus = "";
    private ScheduledExecutorService scheduler;

    /**
     * @param repositories the repository service
     * @param version      the application version
     */
    public EventStream(RepositoryService repositories,
            @ConfigProperty(name = "quarkus.application.version", defaultValue = "dev") String version) {
        this.repositories = repositories;
        this.version = version;
    }

    void onStart(@Observes StartupEvent event) {
        scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("trailhand-events").factory());
        scheduler.scheduleWithFixedDelay(this::tick, 5, 5, TimeUnit.SECONDS);
        scheduler.scheduleWithFixedDelay(this::keepAlive, 15, 15, TimeUnit.SECONDS);
    }

    void onStop(@Observes ShutdownEvent event) {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        if (broadcaster != null) {
            broadcaster.close();
        }
    }

    /**
     * Adds a connection and sends it the current status.
     *
     * @param sink the connection
     * @param sseFactory the SSE factory of the request
     */
    synchronized void register(SseEventSink sink, Sse sseFactory) {
        if (broadcaster == null) {
            sse = sseFactory;
            broadcaster = sseFactory.newBroadcaster();
        }
        broadcaster.register(sink);
        sink.send(sseFactory.newEventBuilder().name("status").data(statusJson()).build());
    }

    void tick() {
        var current = statusJson();
        if (!current.equals(lastStatus)) {
            lastStatus = current;
            if (broadcaster != null) {
                broadcaster.broadcast(sse.newEventBuilder().name("status").data(current).build());
            }
        }
    }

    void keepAlive() {
        if (broadcaster != null) {
            broadcaster.broadcast(sse.newEventBuilder().comment("keepalive").build());
        }
    }

    private String statusJson() {
        try {
            return mapper.writeValueAsString(StatusResource.current(repositories, version));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
