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

import org.jspecify.annotations.Nullable;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * One state of a scenario.
 *
 * @param id                 the state id
 * @param description        what the state represents
 * @param firstLoginRequired the override of the scenario's first-login flag; {@code null} keeps the scenario value
 * @param routes             the static answers of the state by {@code "METHOD /path"}; they win over the scenario's
 * @param links              the transitions by name, in file order
 * @param events             the events pushed when the state is entered
 * @param auto               the timed transition, possibly {@code null}
 * @param sessionReplaced    whether entering the state replaces the session: the event streams close and every
 *                           session gets a new anti-CSRF token
 * @param sessionEnded       whether entering the state ends every session and closes the event streams
 */
public record ScenarioState(String id, String description, @Nullable Boolean firstLoginRequired,
Map<String, Route> routes, Map<String, Link> links, List<ScenarioEvent> events,
@Nullable AutoTransition auto, boolean sessionReplaced, boolean sessionEnded) {

    /**
     * Copies the collections; the maps keep their order.
     *
     * @param id                 the state id
     * @param description        the description
     * @param firstLoginRequired the first-login override, possibly {@code null}
     * @param routes             the routes
     * @param links              the links
     * @param events             the events
     * @param auto               the timed transition, possibly {@code null}
     * @param sessionReplaced    the session-replaced flag
     * @param sessionEnded       the session-ended flag
     */
    public ScenarioState {
        routes = Map.copyOf(routes);
        links = Collections.unmodifiableMap(new LinkedHashMap<>(links));
        events = List.copyOf(events);
    }

    /**
     * The link a request takes.
     *
     * @param method the request method
     * @param path   the request path, without query
     * @return the first link matching method and path, with no query to match
     */
    public Optional<Link> linkFor(String method, String path) {
        return linkFor(method, path, Map.of());
    }

    /**
     * The link a request takes: of the links that match, the one with the most listed query parameters, the first of
     * them in the order of the state.
     *
     * @param method the request method
     * @param path   the request path, without query
     * @param query  the decoded query parameters of the request
     * @return the most specific link matching method, path and query
     */
    public Optional<Link> linkFor(String method, String path, Map<String, String> query) {
        return links.values().stream().filter(link -> link.matches(method, path, query))
                .reduce((best, link) -> link.query().size() > best.query().size() ? link : best);
    }
}
