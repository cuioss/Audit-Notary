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
import java.util.Locale;

/**
 * The web app: {@code trailhand.yaml} → {@code web} (TRH-AUTH-1, TRH-WEB-8).
 *
 * @param origin      the application's own origin, an absolute {@code https} URI without path; the Origin check and
 *                    the login callback address use it
 * @param idleTimeout the idle time after which a session ends, default 30 minutes
 * @param maxLifetime the absolute lifetime of a session, default 8 hours
 */
public record WebSettings(URI origin, Duration idleTimeout, Duration maxLifetime) {

    private static final int HTTPS_PORT = 443;
    private static final int HTTP_PORT = 80;

    /** The default of {@code session.idle-timeout}. */
    public static final Duration DEFAULT_IDLE_TIMEOUT = Duration.ofMinutes(30);

    /** The default of {@code session.max-lifetime}. */
    public static final Duration DEFAULT_MAX_LIFETIME = Duration.ofHours(8);

    /**
     * @return the origin as the browser sends it in the {@code Origin} header: scheme and host in lower case and the
     *         port only when it is not the default of the scheme (RFC 6454, section 6.1)
     */
    public String originHeaderValue() {
        var scheme = origin.getScheme().toLowerCase(Locale.ROOT);
        var defaultPort = "https".equals(scheme) ? HTTPS_PORT : HTTP_PORT;
        var port = origin.getPort() == -1 || origin.getPort() == defaultPort ? "" : ":" + origin.getPort();
        return scheme + "://" + origin.getHost().toLowerCase(Locale.ROOT) + port;
    }
}
