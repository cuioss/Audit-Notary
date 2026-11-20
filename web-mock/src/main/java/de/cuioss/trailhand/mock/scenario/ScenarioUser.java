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

import org.jspecify.annotations.Nullable;

import java.util.List;

/**
 * The signed-in user of a scenario.
 *
 * @param pseudonym the pseudonym of the directory entry; {@code null} for a user without an entry
 * @param name      the display name
 * @param groups    the identity-provider groups
 */
public record ScenarioUser(@Nullable String pseudonym, String name, List<String> groups) {

    /**
     * Copies the groups.
     *
     * @param pseudonym the pseudonym, possibly {@code null}
     * @param name      the display name
     * @param groups    the groups
     */
    public ScenarioUser {
        groups = List.copyOf(groups);
    }
}
