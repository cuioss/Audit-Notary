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
import jakarta.ws.rs.core.MediaType;

import java.util.List;
import java.util.Map;

/**
 * {@code GET /api/v1/due} (TRH-WEB-9): the launcher of the Due lens. Empty until the index and the reminders are built
 * (TRH-GEN-3).
 */
@Path("/api/v1/due")
public class DueResource {

    /**
     * @return the due entries
     */
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Map<String, List<Object>> due() {
        return Map.of("items", List.of());
    }
}
