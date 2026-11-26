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
 * A scenario: one test profile of the web mock, a state machine over the requests of the web app
 * (doc/specification/testing.adoc, AUN-TEST-1).
 *
 * @param name               the scenario name
 * @param description        what the scenario represents
 * @param login              how the login works; the default is the identity provider
 * @param user               the user a login signs in as
 * @param rights             the rights of the user
 * @param firstLoginRequired whether the user has no directory entry yet; a state may override it
 * @param directoryConfirmationDue whether the session says the own directory entry is to be confirmed again; a state may
 *                           override it
 * @param start              the id of the start state
 * @param routes             the static answers by {@code "METHOD /path"}, valid in every state
 * @param states             the states by id, in file order
 */
public record Scenario(String name, String description, ScenarioLogin login, ScenarioUser user,
List<Right> rights, boolean firstLoginRequired, boolean directoryConfirmationDue, String start, Map<String, Route> routes, Map<String, ScenarioState> states) {

    /**
     * Copies the collections; the state map keeps its order.
     *
     * @param name               the name
     * @param description        the description
     * @param login              the login
     * @param user               the user
     * @param rights             the rights
     * @param firstLoginRequired the first-login flag
     * @param directoryConfirmationDue the reconfirmation flag
     * @param start              the start state
     * @param routes             the routes
     * @param states             the states
     */
    public Scenario {
        rights = List.copyOf(rights);
        routes = Map.copyOf(routes);
        states = Collections.unmodifiableMap(new LinkedHashMap<>(states));
    }

    /**
     * Looks up a state.
     *
     * @param id the state id
     * @return the state, or empty for an unknown id
     */
    public Optional<ScenarioState> state(String id) {
        return Optional.ofNullable(states.get(id));
    }

    /**
     * The answer of a route in a state: the state's route wins over the scenario's.
     *
     * @param state the current state
     * @param key   the route key {@code "METHOD /path"}
     * @return the route, or empty when neither the state nor the scenario defines it
     */
    public Optional<Route> route(ScenarioState state, String key) {
        var own = state.routes().get(key);
        if (own != null) {
            return Optional.of(own);
        }
        return Optional.ofNullable(routes.get(key));
    }

    /**
     * The answer of a route for a request: the route of the state wins over that of the scenario, and within one of
     * them the key that is the more specific ({@link RouteKey#compareSpecificity}: an exact path before a templated one,
     * then more literal segments, then more listed query parameters) wins; a key without query matches any query. Keys
     * that are equally specific are chosen by their text, so the choice never depends on the order of a map.
     *
     * @param state  the current state
     * @param method the request method
     * @param path   the request path, without query
     * @param query  the decoded query parameters of the request
     * @return the route, or empty when neither the state nor the scenario defines one that matches
     */
    public Optional<Route> route(ScenarioState state, String method, String path, Map<String, String> query) {
        return match(state, method, path, query).map(RouteMatch::route);
    }

    /**
     * Like {@link #route(ScenarioState, String, String, Map)}, with the path segments a template of the key stood for.
     *
     * @param state  the current state
     * @param method the request method
     * @param path   the request path, without query
     * @param query  the decoded query parameters of the request
     * @return the route and its captured segments, or empty when no route matches
     */
    public Optional<RouteMatch> match(ScenarioState state, String method, String path, Map<String, String> query) {
        return mostSpecific(state.routes(), method, path, query).or(() -> mostSpecific(routes, method, path, query));
    }

    /** A route that matched a request, and the path segments the template of its key stood for. */
    public record RouteMatch(Route route, Map<String, String> captures) {
    }

    private static Optional<RouteMatch> mostSpecific(Map<String, Route> candidates, String method, String path,
            Map<String, String> query) {
        String prefix = method + " ";
        @Nullable RouteMatch best = null;
        @Nullable RouteKey bestKey = null;
        String bestText = "";
        for (var entry : candidates.entrySet()) {
            String text = entry.getKey();
            if (!text.startsWith(prefix)) {
                continue;
            }
            var key = RouteKey.of(method, text.substring(prefix.length()));
            if (key.isEmpty()) {
                continue;
            }
            var captured = key.get().capture(method, path, query);
            if (captured.isEmpty()) {
                continue;
            }
            int order = bestKey == null ? -1 : key.get().compareSpecificity(bestKey);
            if (order < 0 || order == 0 && text.compareTo(bestText) < 0) {
                best = new RouteMatch(entry.getValue(), captured.get());
                bestKey = key.get();
                bestText = text;
            }
        }
        return Optional.ofNullable(best);
    }

    /**
     * Whether the first login is required in a state.
     *
     * @param state the current state
     * @return the state's override, or the scenario value
     */
    public boolean firstLoginRequired(ScenarioState state) {
        var override = state.firstLoginRequired();
        return override != null ? override : firstLoginRequired;
    }

    /**
     * Whether the session says the own directory entry is to be confirmed again in a state.
     *
     * @param state the current state
     * @return the state's override, or the scenario value
     */
    public boolean directoryConfirmationDue(ScenarioState state) {
        var override = state.directoryConfirmationDue();
        return override != null ? override : directoryConfirmationDue;
    }
}
