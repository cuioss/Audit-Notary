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
