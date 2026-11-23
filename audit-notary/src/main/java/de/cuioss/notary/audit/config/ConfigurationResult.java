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

import org.jspecify.annotations.Nullable;

import java.util.List;

/**
 * The result of loading {@code audit-notary.yaml}: the configuration, or every violation.
 *
 * @param configuration the configuration; {@code null} when there is a violation
 * @param violations    the violations, empty for a valid configuration
 */
public record ConfigurationResult(@Nullable AuditNotaryConfiguration configuration, List<Violation> violations) {

    /**
     * Copies the violations.
     *
     * @param configuration the configuration
     * @param violations    the violations
     */
    public ConfigurationResult {
        violations = List.copyOf(violations);
    }

    /**
     * @return whether the configuration is valid
     */
    public boolean isValid() {
        return configuration != null && violations.isEmpty();
    }
}
