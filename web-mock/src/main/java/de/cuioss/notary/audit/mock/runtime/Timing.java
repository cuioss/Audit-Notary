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
package de.cuioss.notary.audit.mock.runtime;

import java.util.Locale;
import java.util.Optional;

/**
 * How the delays of events and timed transitions are played.
 */
public enum Timing {

    /** Delays are waited for, as a user would see them. */
    REALISTIC,

    /** Delays are ignored: events go out at once, in file order, and timed transitions are taken at once. */
    ORDERED;

    /**
     * Parses the command-line form.
     *
     * @param value {@code realistic} or {@code ordered}, in any case
     * @return the timing, or empty for another value
     */
    public static Optional<Timing> parse(String value) {
        for (Timing timing : values()) {
            if (timing.name().equals(value.toUpperCase(Locale.ROOT))) {
                return Optional.of(timing);
            }
        }
        return Optional.empty();
    }
}
