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
package de.cuioss.notary.audit.mock.scenario;

import com.fasterxml.jackson.databind.JsonNode;
import org.jspecify.annotations.Nullable;

import java.util.Set;

/**
 * The answer of a scenario or a state: a static JSON body, or a built-in handler of the engine.
 *
 * @param status  the HTTP status of a static answer
 * @param body    the JSON body of a static answer
 * @param handler the name of the built-in handler that computes the answer, or {@code null} for a static answer
 */
public record Route(int status, JsonNode body, @Nullable String handler) {

    /** The handler of {@code POST /api/v1/render/asciidoc}: the deterministic preview of the form kit. */
    public static final String RENDER_ASCIIDOC = "render-asciidoc";

    /** The names of the built-in handlers a scenario may name. */
    public static final Set<String> HANDLERS = Set.of(RENDER_ASCIIDOC);

    /**
     * A static answer.
     *
     * @param status the HTTP status
     * @param body   the JSON body
     */
    public Route(int status, JsonNode body) {
        this(status, body, null);
    }
}
