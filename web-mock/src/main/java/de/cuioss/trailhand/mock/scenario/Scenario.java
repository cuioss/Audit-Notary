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
package de.cuioss.trailhand.mock.scenario;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * A scenario: one test profile of the web mock, a state machine over the requests of the web app
 * (doc/specification/testing.adoc, TRH-TEST-1).
 *
 * @param name               the scenario name
 * @param description        what the scenario represents
 * @param user               the user a login signs in as
 * @param rights             the rights of the user
 * @param firstLoginRequired whether the user has no directory entry yet; a state may override it
 * @param start              the id of the start state
 * @param routes             the static answers by {@code "METHOD /path"}, valid in every state
 * @param states             the states by id, in file order
 */
public record Scenario(String name, String description, ScenarioUser user, List<Right> rights,
boolean firstLoginRequired, String start, Map<String, Route> routes, Map<String, ScenarioState> states) {

    /**
     * Copies the collections; the state map keeps its order.
     *
     * @param name               the name
     * @param description        the description
     * @param user               the user
     * @param rights             the rights
     * @param firstLoginRequired the first-login flag
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
     * Whether the first login is required in a state.
     *
     * @param state the current state
     * @return the state's override, or the scenario value
     */
    public boolean firstLoginRequired(ScenarioState state) {
        var override = state.firstLoginRequired();
        return override != null ? override : firstLoginRequired;
    }
}
