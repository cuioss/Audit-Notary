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

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.Readiness;

/**
 * The readiness check {@code repositories} (TRH-OPS-2): {@code UP} once every repository has a local copy; a later
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
        var builder = HealthCheckResponse.named("repositories").status(repositories.allPresent());
        for (RepositoryState state : repositories.states()) {
            builder.withData(state.alias(), state.present() ? state.fetchUp() ? "UP" : "FETCH_DOWN" : "ABSENT");
        }
        return builder.build();
    }
}
