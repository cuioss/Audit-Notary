/*
 * Copyright © 2026-present CUI-OpenSource-Software (info@cuioss.de)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package de.cuioss.trailhand.service;

import io.smallrye.health.api.HealthGroup;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;

/**
 * The check {@code git-remote} (TRH-GEN-6): {@code DOWN} while the fetch of a repository fails, with the fetch state
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
        var builder = HealthCheckResponse.named("git-remote").status(!repositories.degraded());
        for (RepositoryState state : repositories.states()) {
            builder.withData(state.alias(), state.fetchUp() ? "UP" : "DOWN");
        }
        return builder.build();
    }
}
