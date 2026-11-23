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
package de.cuioss.notary.audit.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.Readiness;

/**
 * The readiness check {@code repositories} (AUN-OPS-2): {@code UP} once every repository has a local copy; a later
 * fetch failure does not drop it. The data name the fetch state per alias.
 */
@Readiness
@ApplicationScoped
public class RepositoriesHealthCheck implements HealthCheck {

    private final RepositoryService repositories;

    /**
     * @param repositories the repository service
     */
    public RepositoriesHealthCheck(RepositoryService repositories) {
        this.repositories = repositories;
    }

    @Override
    public HealthCheckResponse call() {
        var snapshot = repositories.states();
        var builder = HealthCheckResponse.named("repositories").status(RepositoryService.allPresent(snapshot));
        for (RepositoryState state : snapshot) {
            builder.withData(state.alias(), describe(state));
        }
        return builder.build();
    }

    /**
     * @param state the state of one repository
     * @return {@code ABSENT}, {@code UP} or {@code FETCH_DOWN}
     */
    static String describe(RepositoryState state) {
        if (!state.present()) {
            return "ABSENT";
        }
        return state.fetchUp() ? "UP" : "FETCH_DOWN";
    }
}
