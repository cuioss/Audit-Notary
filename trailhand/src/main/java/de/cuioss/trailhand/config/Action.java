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
package de.cuioss.trailhand.config;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * The actions a right permits (TRH-AUTH-2).
 */
public enum Action {

    /** Reading documents, index views and diffs. */
    READ,

    /** Drafts, saves and transitions that are no release. */
    EDIT,

    /** Releases, with step-up. */
    APPROVE,

    /** Changes of the catalogs, erasure of persons, deletion of expired repositories. */
    ADMINISTER_CATALOGS;

    /**
     * @return the name used in {@code trailhand.yaml} and on the wire, e.g. {@code administer-catalogs}
     */
    public String wireName() {
        return name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    /**
     * @param wireName the name of {@code trailhand.yaml}
     * @return the action, or empty for an unknown name
     */
    public static Optional<Action> fromWireName(String wireName) {
        return Arrays.stream(values()).filter(action -> action.wireName().equals(wireName)).findFirst();
    }
}
