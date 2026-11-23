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

import java.io.Serial;

/**
 * Stops the boot on an invalid configuration (AUN-CONF-1). The violations themselves were logged one by one.
 */
public class InvalidConfigurationException extends IllegalStateException {

    @Serial
    private static final long serialVersionUID = 1L;

    /**
     * @param violations the number of violations
     */
    public InvalidConfigurationException(int violations) {
        super("Invalid configuration: " + violations + " violation(s), see the log records AUDIT-NOTARY-200");
    }
}
