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

/**
 * What a route or a link demands of the scenario user: one action on one repository (the member {@code requires} of a
 * route or link). When the rights of the scenario do not hold it the engine answers {@code 403 FORBIDDEN} before the
 * route or link is used, and a link does not move on.
 *
 * @param repository the repository alias
 * @param action     the action, one of {@link Right#ALLOWED_ACTIONS}
 */
public record Requirement(String repository, String action) {

    /**
     * Whether rights hold the requirement.
     *
     * @param rights the rights of the scenario
     * @return {@code true} when a right names the repository and the action
     */
    public boolean heldBy(List<Right> rights) {
        return rights.stream().anyMatch(right -> right.repository().equals(repository)
                && right.actions().contains(action));
    }
}
