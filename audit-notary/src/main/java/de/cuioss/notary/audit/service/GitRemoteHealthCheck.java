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

import io.smallrye.health.api.HealthGroup;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;

/**
 * The check {@code git-remote} (AUN-GEN-6): {@code DOWN} while the fetch of a repository fails, with the fetch state
 * per alias. It is a health group of its own ({@code /q/health/group/git-remote}), so an unreachable Git server
 * neither drops readiness nor restarts the container.
 */
@HealthGroup("git-remote")
@ApplicationScoped
public class GitRemoteHealthCheck implements HealthCheck {

    private final RepositoryService repositories;

    /**
     * @param repositories the repository service
     */
    public GitRemoteHealthCheck(RepositoryService repositories) {
        this.repositories = repositories;
    }

    @Override
    public HealthCheckResponse call() {
        var snapshot = repositories.states();
        var builder = HealthCheckResponse.named("git-remote").status(!RepositoryService.degraded(snapshot));
        for (RepositoryState state : snapshot) {
            builder.withData(state.alias(), state.fetchUp() ? "UP" : "DOWN");
        }
        return builder.build();
    }
}
