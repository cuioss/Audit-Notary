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

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

/**
 * {@code GET /api/v1/events} (TRH-WEB-5, TRH-WEB-9): the event stream of the web app. On connect it sends the event
 * {@code status}; later events come from {@link EventStream}.
 */
@Path("/api/v1/events")
public class EventsResource {

    private final EventStream stream;

    /**
     * @param stream the shared stream
     */
    public EventsResource(EventStream stream) {
        this.stream = stream;
    }

    /**
     * @param sink the sink of this connection
     * @param sse  the SSE factory
     */
    @GET
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public void events(@Context SseEventSink sink, @Context Sse sse) {
        stream.register(sink, sse);
    }
}
