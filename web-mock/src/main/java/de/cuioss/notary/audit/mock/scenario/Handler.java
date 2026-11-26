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

import java.util.Arrays;
import java.util.Optional;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * The built-in handlers of the engine a route may name instead of a static body. This enum is the single definition:
 * the scenario loader admits exactly its names and the engine dispatches over it exhaustively, so the two cannot drift.
 */
public enum Handler {

    /** {@code POST /api/v1/render/asciidoc}: the deterministic preview of the form kit. */
    RENDER_ASCIIDOC("render-asciidoc");

    private final String id;

    Handler(String id) {
        this.id = id;
    }

    /**
     * The name a scenario file uses.
     *
     * @return the name of the handler in a scenario
     */
    public String id() {
        return id;
    }

    /**
     * Looks a handler up by its name in a scenario.
     *
     * @param name the name
     * @return the handler, or empty for an unknown name
     */
    public static Optional<Handler> byId(String name) {
        return Arrays.stream(values()).filter(handler -> handler.id.equals(name)).findFirst();
    }

    /**
     * The names a scenario may use, sorted, for the message of a refusal.
     *
     * @return the sorted names
     */
    public static String ids() {
        return Arrays.stream(values()).map(Handler::id).collect(Collectors.toCollection(TreeSet::new)).toString();
    }
}
