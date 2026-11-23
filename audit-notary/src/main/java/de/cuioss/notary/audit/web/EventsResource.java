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
package de.cuioss.notary.audit.web;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

/**
 * {@code GET /api/v1/events} (AUN-WEB-5, AUN-WEB-9): the event stream of the web app. On connect it sends the event
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
