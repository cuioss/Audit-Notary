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

import de.cuioss.notary.audit.config.AuditNotaryConfiguration;
import de.cuioss.tools.logging.CuiLogger;
import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jspecify.annotations.Nullable;

import java.nio.file.Path;
import java.util.Objects;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import static de.cuioss.notary.audit.AuditNotaryLogMessages.WARN;

/**
 * Creates the {@link RepositoryService} at boot, clones or opens every repository in the background and fetches at
 * {@code fetch.interval} (AUN-CONF-2). The boot does not wait for the Git server: readiness reports the state
 * (AUN-OPS-2).
 */
@ApplicationScoped
public class RepositoryLifecycle {

    private static final CuiLogger LOGGER = new CuiLogger(RepositoryLifecycle.class);

    private final AuditNotaryConfiguration configuration;
    private final Path dataDirectory;
    private @Nullable ScheduledExecutorService scheduler;
    private @Nullable RepositoryService service;

    /**
     * @param configuration the configuration
     * @param dataDirectory the data directory, {@code audit-notary.data.dir}
     */
    public RepositoryLifecycle(AuditNotaryConfiguration configuration,
            @ConfigProperty(name = "audit-notary.data.dir", defaultValue = "data") String dataDirectory) {
        this.configuration = configuration;
        this.dataDirectory = Path.of(dataDirectory);
    }

    /**
     * @return the repository service
     * @throws IllegalStateException if the library refuses the repositories
     */
    @Produces
    // @Singleton, not @ApplicationScoped: the service is used directly, without a client proxy, by the health checks
    // and the web resources.
    @Singleton
    public synchronized RepositoryService repositoryService() {
        if (service == null) {
            var created = RepositoryService.create(configuration.repositories(), dataDirectory);
            if (created.value() == null) {
                throw new IllegalStateException("repositories refused: " + created.detail());
            }
            service = created.value();
        }
        return Objects.requireNonNull(service);
    }

    void onStart(@Observes StartupEvent event) {
        var repositories = repositoryService();
        scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("audit-notary-fetch").factory());
        long interval = configuration.fetchInterval().toMillis();
        scheduler.scheduleWithFixedDelay(() -> refreshSafely(repositories), 0, interval, TimeUnit.MILLISECONDS);
    }

    /**
     * Runs one refresh; a failure is logged and the next refresh runs as planned. A scheduled task that throws would
     * otherwise end the periodic fetch silently.
     *
     * @param repositories the repository service
     */
    static void refreshSafely(RepositoryService repositories) {
        try {
            repositories.refresh();
            // Deliberately broad: whatever a refresh throws must not end the periodic fetch.
            // cui-rewrite:disable InvalidExceptionUsageRecipe
        } catch (RuntimeException | LinkageError e) {
            LOGGER.warn(e, WARN.REFRESH_FAILED, e.getClass().getName(), e.getMessage());
        }
    }

    void onStop(@Observes ShutdownEvent event) {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }
}
