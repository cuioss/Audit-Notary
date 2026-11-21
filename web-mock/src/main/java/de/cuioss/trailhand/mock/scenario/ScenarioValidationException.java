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

import java.io.Serial;

/**
 * A scenario file breaks a rule of the scenario format. The message names the source, the location inside the file
 * (state and field) and the broken rule.
 */
public class ScenarioValidationException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    /**
     * Creates the exception.
     *
     * @param source   the file or resource the scenario came from
     * @param location the location inside the file, a dotted path such as {@code states.ready.links.save}
     * @param detail   the broken rule
     */
    public ScenarioValidationException(String source, String location, String detail) {
        super("Scenario %s: %s: %s".formatted(source, location, detail));
    }
}
