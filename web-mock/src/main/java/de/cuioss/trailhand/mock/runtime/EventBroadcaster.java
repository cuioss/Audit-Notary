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
package de.cuioss.trailhand.mock.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jspecify.annotations.Nullable;

import java.time.Duration;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The one broadcaster behind every open event stream ({@code GET /api/v1/events}). Each published event becomes one
 * Server-Sent Events frame {@code id: <n>}, {@code event: <name>}, {@code data: <json>} for every subscriber.
 */
public final class EventBroadcaster implements AutoCloseable {

    /** The frame that ends a subscription. */
    private static final String END = "";

    private final ObjectMapper mapper;
    private final AtomicLong ids = new AtomicLong();
    private final Set<Subscription> subscriptions = ConcurrentHashMap.newKeySet();

    /**
     * Creates a broadcaster.
     *
     * @param mapper the mapper that writes the event data
     */
    public EventBroadcaster(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * Opens a subscription; its frames start with the next published event.
     *
     * @return the subscription, to be closed by the stream that reads it
     */
    public Subscription subscribe() {
        var subscription = new Subscription(this);
        subscriptions.add(subscription);
        return subscription;
    }

    /**
     * Publishes an event to every subscriber.
     *
     * @param event the event name
     * @param data  the event data
     */
    public void publish(String event, JsonNode data) {
        String json;
        try {
            json = mapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Event data cannot be written: " + event, e);
        }
        String frame = "id: " + ids.incrementAndGet() + "\nevent: " + event + "\ndata: " + json + "\n\n";
        subscriptions.forEach(subscription -> subscription.offer(frame));
    }

    /**
     * The number of open subscriptions.
     *
     * @return the count
     */
    public int subscriberCount() {
        return subscriptions.size();
    }

    /** Ends every subscription. */
    @Override
    public void close() {
        subscriptions.forEach(Subscription::close);
    }

    /**
     * The frames of one open event stream.
     */
    public static final class Subscription implements AutoCloseable {

        private final EventBroadcaster owner;
        private final BlockingQueue<String> frames = new LinkedBlockingQueue<>();

        private Subscription(EventBroadcaster owner) {
            this.owner = owner;
        }

        private void offer(String frame) {
            frames.add(frame);
        }

        /**
         * Waits for the next frame.
         *
         * @param timeout how long to wait
         * @return the frame; empty after the timeout (the caller sends a keep-alive) or when the subscription ended,
         *         which {@link #isOpen()} tells apart
         * @throws InterruptedException if the waiting thread is interrupted
         */
        public Optional<String> next(Duration timeout) throws InterruptedException {
            @Nullable String frame = frames.poll(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (frame == null || END.equals(frame)) {
                if (END.equals(frame)) {
                    owner.subscriptions.remove(this);
                }
                return Optional.empty();
            }
            return Optional.of(frame);
        }

        /**
         * Whether the subscription is still registered.
         *
         * @return {@code false} once it was closed
         */
        public boolean isOpen() {
            return owner.subscriptions.contains(this);
        }

        /** Ends the subscription; a waiting {@link #next(Duration)} returns at once. */
        @Override
        public void close() {
            owner.subscriptions.remove(this);
            frames.add(END);
        }
    }
}
