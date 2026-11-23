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

/**
 * A resolved scenario reference: the scenario and the state it starts in.
 *
 * @param scenario the scenario
 * @param state    the id of the start state; the scenario's start, or the state a {@code name#state} reference
 *                 names
 */
public record ScenarioReference(Scenario scenario, String state) {

    /**
     * The reference in its written form.
     *
     * @return {@code name#state}
     */
    public String display() {
        return scenario.name() + "#" + state;
    }
}
