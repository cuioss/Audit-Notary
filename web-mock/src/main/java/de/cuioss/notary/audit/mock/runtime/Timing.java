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
