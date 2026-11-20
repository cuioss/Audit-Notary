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
package de.cuioss.trailhand.config;

import de.cuioss.tools.logging.CuiLogger;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.nio.file.Path;

import static de.cuioss.trailhand.TrailhandLogMessages.ERROR;

/**
 * Loads {@code trailhand.yaml} from {@code trailhand.config.dir} once and provides it (TRH-CONF-1). An invalid
 * configuration stops the boot: every violation was logged as one ERROR record, and the producer fails.
 */
@ApplicationScoped
public class ConfigurationProducer {

    private static final CuiLogger LOGGER = new CuiLogger(ConfigurationProducer.class);

    private final Path directory;

    /**
     * @param directory the configuration directory, {@code trailhand.config.dir}
     */
    public ConfigurationProducer(@ConfigProperty(name = "trailhand.config.dir", defaultValue = "config") String directory) {
        this.directory = Path.of(directory);
    }

    /**
     * @return the validated configuration
     * @throws InvalidConfigurationException if the configuration has a violation
     */
    @Produces
    // @Singleton, not @ApplicationScoped: a record is final and cannot stand behind the client proxy of a normal scope.
    @Singleton
    public TrailhandConfiguration configuration() {
        var result = ConfigurationLoader.fromProcessEnvironment().load(directory);
        var configuration = result.configuration();
        if (!result.isValid() || configuration == null) {
            LOGGER.error(ERROR.BOOT_STOPPED, result.violations().size());
            throw new InvalidConfigurationException(result.violations().size());
        }
        return configuration;
    }
}
