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
package de.cuioss.notary.audit.config;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * The actions a right permits (AUN-AUTH-2).
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
     * @return the name used in {@code audit-notary.yaml} and on the wire, e.g. {@code administer-catalogs}
     */
    public String wireName() {
        return name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    /**
     * @param wireName the name of {@code audit-notary.yaml}
     * @return the action, or empty for an unknown name
     */
    public static Optional<Action> fromWireName(String wireName) {
        return Arrays.stream(values()).filter(action -> action.wireName().equals(wireName)).findFirst();
    }
}
