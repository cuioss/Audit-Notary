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
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jspecify.annotations.Nullable;

import java.util.List;
import java.util.Map;

/**
 * {@code GET /api/v1/messages?lang=en|de} (TRH-WEB-7): the catalogue as one JSON object; a missing {@code lang} answers
 * English, any other value {@code 400}.
 */
@Path("/api/v1/messages")
public class MessagesResource {

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
