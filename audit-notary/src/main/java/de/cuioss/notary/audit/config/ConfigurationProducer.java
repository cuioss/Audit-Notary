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

import de.cuioss.tools.logging.CuiLogger;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.nio.file.Path;

import static de.cuioss.notary.audit.AuditNotaryLogMessages.ERROR;

/**
 * Loads {@code audit-notary.yaml} from {@code audit-notary.config.dir} once and provides it (AUN-CONF-1). An invalid
 * configuration stops the boot: every violation was logged as one ERROR record, and the producer fails.
 */
@ApplicationScoped
public class ConfigurationProducer {

    private static final CuiLogger LOGGER = new CuiLogger(ConfigurationProducer.class);

    private final Path directory;

    /**
     * @param directory the configuration directory, {@code audit-notary.config.dir}
     */
    public ConfigurationProducer(@ConfigProperty(name = "audit-notary.config.dir", defaultValue = "config") String directory) {
        this.directory = Path.of(directory);
    }

    /**
     * @return the validated configuration
     * @throws InvalidConfigurationException if the configuration has a violation
     */
    @Produces
    // @Singleton, not @ApplicationScoped: a record is final and cannot stand behind the client proxy of a normal scope.
    @Singleton
    public AuditNotaryConfiguration configuration() {
        var result = ConfigurationLoader.fromProcessEnvironment().load(directory);
        var configuration = result.configuration();
        if (!result.isValid() || configuration == null) {
            LOGGER.error(ERROR.BOOT_STOPPED, result.violations().size());
            throw new InvalidConfigurationException(result.violations().size());
        }
        return configuration;
    }
}
