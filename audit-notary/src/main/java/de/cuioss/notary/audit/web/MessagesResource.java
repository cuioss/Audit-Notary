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
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jspecify.annotations.Nullable;

import java.util.List;
import java.util.Map;

/**
 * {@code GET /api/v1/messages?lang=en|de} (AUN-WEB-7): the catalogue as one JSON object; a missing {@code lang} answers
 * English, any other value {@code 400}.
 */
@Path(MessagesResource.PATH)
public class MessagesResource {

    /** The address of the request; public. */
    public static final String PATH = "/api/v1/messages";

    private final MessageCatalogue catalogue;

    /**
     * @param catalogue the catalogue
     */
    public MessagesResource(MessageCatalogue catalogue) {
        this.catalogue = catalogue;
    }

    /**
     * @param lang the language
     * @return the catalogue or the refusal
     */
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Response messages(@QueryParam("lang") @Nullable String lang) {
        var language = lang == null ? "en" : lang;
        return catalogue.catalogue(language).map(messages -> Response.ok(messages).build())
                .orElseGet(() -> Response.status(400).entity(Map.of("outcome", "VALIDATION", "errors",
                        List.of(Map.of("pointer", "/lang", "code", "UNSUPPORTED")))).build());
    }
}
