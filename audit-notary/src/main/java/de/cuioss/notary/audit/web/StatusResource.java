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
package de.cuioss.notary.audit.web;

import de.cuioss.notary.audit.service.RepositoryService;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.List;

/**
 * {@code GET /api/v1/status} (AUN-WEB-9): the application version and the degraded state; no login needed and no
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
