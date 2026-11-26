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
    RENDER_ASCIIDOC("render-asciidoc", false),

    /**
     * {@code GET /api/v1/search}: the search of documents over the {@code data_file} of the route, restricted to the
     * repositories the scenario's rights grant {@code read} on.
     */
    SEARCH_DOCUMENTS("search-documents", true),

    /**
     * The entry requests of one catalog over the {@code data_file} of the route, which holds
     * {@code {"catalog", "entries": [...]}}: {@code GET} reads an entry, {@code PUT} saves it, {@code POST} of
     * {@code .../retirement} retires it. The route key is a template with the segment {@code {id}}.
     */
    CATALOG_ENTRY("catalog-entry", true);

    private final String id;
    private final boolean dataFile;

    Handler(String id, boolean dataFile) {
        this.id = id;
        this.dataFile = dataFile;
    }

    /**
     * Whether the handler reads a data file the route names with {@code data_file}.
     *
     * @return {@code true} when the route needs, and only then may carry, a {@code data_file}
     */
    public boolean usesDataFile() {
        return dataFile;
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
