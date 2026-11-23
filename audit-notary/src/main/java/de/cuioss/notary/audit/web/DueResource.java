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
import jakarta.ws.rs.core.MediaType;

import java.util.List;
import java.util.Map;

/**
 * {@code GET /api/v1/due} (AUN-WEB-9): the launcher of the Due lens. Empty until the index and the reminders are built
 * (AUN-GEN-3).
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
