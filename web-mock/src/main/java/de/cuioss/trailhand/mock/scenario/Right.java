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

import java.util.List;
import java.util.Set;

/**
 * A right of the scenario user: the actions permitted on one repository (doc/specification/authentication.adoc,
 * TRH-AUTH-2).
 *
 * @param repository the repository alias
 * @param actions    the actions, a subset of {@link #ACTIONS}
 */
public record Right(String repository, List<String> actions) {

    /** The actions a right may name. */
    public static final Set<String> ACTIONS = Set.of("read", "edit", "approve", "administer-catalogs");

    /**
     * Copies the actions.
     *
     * @param repository the repository alias
     * @param actions    the actions
     */
    public Right {
        actions = List.copyOf(actions);
    }
}
