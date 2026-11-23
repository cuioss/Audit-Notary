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
package de.cuioss.notary.audit.security;

import org.jspecify.annotations.Nullable;

import java.time.Instant;
import java.util.List;

/**
 * The identity values a completed login yields (AUN-AUTH-3: issuer, subject, authentication time and context).
 *
 * @param issuer   {@code iss}
 * @param subject  {@code sub}
 * @param name     the display name
 * @param groups   the groups of the configured claim
 * @param authTime {@code auth_time}, or {@code null}
 * @param acr      {@code acr}, or {@code null}
 */
public record LoginIdentity(String issuer, String subject, String name, List<String> groups,
@Nullable Instant authTime, @Nullable String acr) {

    /**
     * Copies the groups.
     *
     * @param issuer   the issuer
     * @param subject  the subject
     * @param name     the name
     * @param groups   the groups
     * @param authTime the authentication time
     * @param acr      the authentication context class
     */
    public LoginIdentity {
        groups = List.copyOf(groups);
    }
}
