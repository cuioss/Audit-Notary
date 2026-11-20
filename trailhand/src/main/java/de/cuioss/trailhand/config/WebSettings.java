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

import java.net.URI;
import java.time.Duration;

/**
 * The web app: {@code trailhand.yaml} → {@code web} (TRH-AUTH-1, TRH-WEB-8).
 *
 * @param origin      the application's own origin, an absolute {@code https} URI without path; the Origin check and
 *                    the login callback address use it
 * @param idleTimeout the idle time after which a session ends, default 30 minutes
 * @param maxLifetime the absolute lifetime of a session, default 8 hours
 */
public record WebSettings(URI origin, Duration idleTimeout, Duration maxLifetime) {

    /** The default of {@code session.idle-timeout}. */
    public static final Duration DEFAULT_IDLE_TIMEOUT = Duration.ofMinutes(30);

    /** The default of {@code session.max-lifetime}. */
    public static final Duration DEFAULT_MAX_LIFETIME = Duration.ofHours(8);

    /**
     * @return the origin as the browser sends it in the {@code Origin} header: scheme, host and a non-default port
     */
    public String originHeaderValue() {
        var port = origin.getPort() == -1 ? "" : ":" + origin.getPort();
        return origin.getScheme() + "://" + origin.getHost() + port;
    }
}
