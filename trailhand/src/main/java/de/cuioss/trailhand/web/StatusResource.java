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
package de.cuioss.trailhand.web;

import de.cuioss.trailhand.service.RepositoryService;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.List;

/**
 * {@code GET /api/v1/status} (TRH-WEB-9): the application version and the degraded state; no login needed and no
 * personal data.
 */
@Path(StatusResource.PATH)
public class StatusResource {

    /** The address of the request; public. */
    public static final String PATH = "/api/v1/status";

    private final RepositoryService repositories;
    private final String version;

    /**
     * @param repositories the repository service
     * @param version      the application version
     */
    public StatusResource(RepositoryService repositories,
            @ConfigProperty(name = "quarkus.application.version", defaultValue = "dev") String version) {
        this.repositories = repositories;
        this.version = version;
    }

    /**
     * @return the status
     */
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Status status() {
        return current(repositories, version);
    }

    /**
     * @param repositories the repository service
     * @param version      the version
     * @return the status as the request and the event {@code status} carry it
     */
    static Status current(RepositoryService repositories, String version) {
        var snapshot = repositories.states();
        var states = snapshot.stream()
                .map(state -> new RepositoryStatus(state.alias(), state.fetchUp() ? "UP" : "DOWN")).toList();
        return new Status(version, RepositoryService.degraded(snapshot), states);
    }

    /**
     * The body of the status.
     *
     * @param version      the version
     * @param degraded     whether a fetch fails
     * @param repositories the fetch state per repository
     */
    public record Status(String version, boolean degraded, List<RepositoryStatus> repositories) {
    }

    /**
     * The fetch state of one repository.
     *
     * @param alias the alias
     * @param fetch {@code UP} or {@code DOWN}
     */
    public record RepositoryStatus(String alias, String fetch) {
    }
}
