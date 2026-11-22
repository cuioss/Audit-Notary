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

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.notary.audit.service.RepositoryService;
import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseBroadcaster;
import jakarta.ws.rs.sse.SseEventSink;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jspecify.annotations.Nullable;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The one event stream of all browsers (AUN-WEB-9): the event {@code status} when the degraded state changes, and a
 * comment every 15 seconds so idle connections stay open. {@code document-saved} joins with the save operation.
 */
@ApplicationScoped
public class EventStream {

    private static final String STATUS_EVENT = "status";

    private final RepositoryService repositories;
    private final String version;
    private final ObjectMapper mapper = new ObjectMapper();
    /** The SSE factory and the broadcaster, created with the first connection. */
    private final AtomicReference<@Nullable Channel> channel = new AtomicReference<>();
    private final AtomicReference<String> lastStatus = new AtomicReference<>("");
    /** Orders the initial status of a connection with the status broadcasts. */
    private final Object statusLock = new Object();
    private @Nullable ScheduledExecutorService scheduler;

    /**
     * The SSE factory of the first request and the broadcaster it created.
     *
     * @param sse         the factory of events
     * @param broadcaster the broadcaster of all connections
     */
    private record Channel(Sse sse, SseBroadcaster broadcaster) {
    }

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
        scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("audit-notary-events").factory());
        scheduler.scheduleWithFixedDelay(this::tick, 5, 5, TimeUnit.SECONDS);
        scheduler.scheduleWithFixedDelay(this::keepAlive, 15, 15, TimeUnit.SECONDS);
    }

    void onStop(@Observes ShutdownEvent event) {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        var current = channel.get();
        if (current != null) {
            current.broadcaster().close();
        }
    }

    /**
     * Adds a connection and sends it the current status.
     *
     * @param sink the connection
     * @param sseFactory the SSE factory of the request
     */
    void register(SseEventSink sink, Sse sseFactory) {
        var current = channel.updateAndGet(
                existing -> existing != null ? existing : new Channel(sseFactory, sseFactory.newBroadcaster()));
        // One lock with tick(): a status broadcast cannot overtake the initial status of a new connection. A status
        // that changed since the last tick goes to every connection, so no connection keeps a status the others missed.
        synchronized (statusLock) {
            current.broadcaster().register(sink);
            var status = statusJson();
            if (status.equals(lastStatus.getAndSet(status))) {
                sink.send(sseFactory.newEventBuilder().name(STATUS_EVENT).data(status).build());
            } else {
                current.broadcaster().broadcast(current.sse().newEventBuilder().name(STATUS_EVENT).data(status).build());
            }
        }
    }

    void tick() {
        synchronized (statusLock) {
            var status = statusJson();
            var previous = lastStatus.getAndSet(status);
            var current = channel.get();
            if (!status.equals(previous) && current != null) {
                current.broadcaster().broadcast(current.sse().newEventBuilder().name(STATUS_EVENT).data(status).build());
            }
        }
    }

    void keepAlive() {
        var current = channel.get();
        if (current != null) {
            current.broadcaster().broadcast(current.sse().newEventBuilder().comment("keepalive").build());
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
