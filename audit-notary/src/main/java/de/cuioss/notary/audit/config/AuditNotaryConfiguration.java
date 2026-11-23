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

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * The validated policy configuration of {@code audit-notary.yaml} (AUN-CONF-1), as far as the application uses it.
 *
 * @param repositories  the repositories in file order
 * @param rights        the rights per identity-provider group
 * @param oidc          the web login
 * @param web           the web app
 * @param fetchInterval the interval of the periodic fetch, default 5 minutes
 */
public record AuditNotaryConfiguration(List<RepositorySettings> repositories, Map<String, List<RightSettings>> rights,
OidcSettings oidc, WebSettings web, Duration fetchInterval) {

    /** The default of {@code fetch.interval}. */
    public static final Duration DEFAULT_FETCH_INTERVAL = Duration.ofMinutes(5);

    /**
     * Copies the collections.
     *
     * @param repositories  the repositories
     * @param rights        the rights
     * @param oidc          the web login
     * @param web           the web app
     * @param fetchInterval the fetch interval
     */
    public AuditNotaryConfiguration {
        repositories = List.copyOf(repositories);
        rights = Map.copyOf(rights);
    }
}
