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

/**
 * A resolved scenario reference: the scenario and the state it starts in.
 *
 * @param scenario the scenario
 * @param state    the id of the start state; the scenario's start, or the state a {@code name#state} reference
 *                 names
 */
public record ScenarioReference(Scenario scenario, String state) {

    /**
     * The reference in its written form.
     *
     * @return {@code name#state}
     */
    public String display() {
        return scenario.name() + "#" + state;
    }
}
