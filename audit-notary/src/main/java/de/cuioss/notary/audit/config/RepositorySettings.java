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

import java.time.Period;

/**
 * One repository of {@code audit-notary.yaml} (AUN-CONF-2).
 *
 * @param alias           the stable alias, {@code [a-z0-9-]+}
 * @param remote          the remote: an {@code https} URL or a {@code file:} URL of a local bare repository
 * @param confidentiality the confidentiality class: {@code public-internal}, {@code restricted} or
 *                        {@code strongly-restricted}
 * @param retention       the retention period; {@code null} for {@code unlimited}
 * @param credentialRef   the reference to the credential of the technical user; {@code null} for a {@code file:}
 *                        remote
 */
public record RepositorySettings(String alias, String remote, String confidentiality, @Nullable Period retention,
@Nullable String credentialRef) {

    /**
     * @return whether the remote is a local bare repository
     */
    public boolean isLocal() {
        return remote.startsWith("file:");
    }
}
