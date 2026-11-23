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

import java.util.List;
import java.util.Set;

/**
 * A right of the scenario user: the actions permitted on one repository (doc/specification/authentication.adoc,
 * AUN-AUTH-2).
 *
 * @param repository the repository alias
 * @param actions    the actions, a subset of {@link #ALLOWED_ACTIONS}
 */
public record Right(String repository, List<String> actions) {

    /** The actions a right may name. */
    public static final Set<String> ALLOWED_ACTIONS = Set.of("read", "edit", "approve", "administer-catalogs");

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
