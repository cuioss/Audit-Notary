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

import java.util.Set;

/**
 * One entry of {@code audit-notary.yaml} → {@code rights}: what a group may do on a repository (AUN-AUTH-2).
 *
 * @param repository the alias of the repository
 * @param actions    the actions
 */
public record RightSettings(String repository, Set<Action> actions) {

    /**
     * Copies the actions.
     *
     * @param repository the alias
     * @param actions    the actions
     */
    public RightSettings {
        actions = Set.copyOf(actions);
    }
}
