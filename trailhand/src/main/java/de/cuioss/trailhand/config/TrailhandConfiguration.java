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

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * The validated policy configuration of {@code trailhand.yaml} (TRH-CONF-1), as far as the application uses it.
 *
 * @param repositories  the repositories in file order
 * @param rights        the rights per identity-provider group
 * @param oidc          the web login
 * @param web           the web app
 * @param fetchInterval the interval of the periodic fetch, default 5 minutes
 */
public record TrailhandConfiguration(List<RepositorySettings> repositories, Map<String, List<RightSettings>> rights,
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
    public TrailhandConfiguration {
        repositories = List.copyOf(repositories);
        rights = Map.copyOf(rights);
    }
}
