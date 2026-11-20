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
package de.cuioss.trailhand.security;

import de.cuioss.trailhand.config.TrailhandConfiguration;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The web sessions, held in memory (TRH-AUTH-1, TRH-GEN-3: sessions are lost on restart; ADR-0001: one instance).
 * A session ends after the idle timeout or the absolute lifetime of {@code web.session}.
 */
@ApplicationScoped
public class SessionStore {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final Map<String, UserSession> sessions = new ConcurrentHashMap<>();
    private final Duration idleTimeout;
    private final Duration maxLifetime;
    private final Clock clock;

    /**
     * @param configuration the configuration with the session lifetimes
     */
    @Inject
    public SessionStore(TrailhandConfiguration configuration) {
        this(configuration.web().idleTimeout(), configuration.web().maxLifetime(), Clock.systemUTC());
    }

    /**
     * @param idleTimeout the idle timeout
     * @param maxLifetime the absolute lifetime
     * @param clock       the clock
     */
    SessionStore(Duration idleTimeout, Duration maxLifetime, Clock clock) {
        this.idleTimeout = idleTimeout;
        this.maxLifetime = maxLifetime;
        this.clock = clock;
    }

    /**
     * @return a random, URL-safe token of 256 bits
     */
    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * Opens a session for a completed login.
     *
     * @param identity the identity values of the login
     * @return the new session
     */
    public UserSession open(LoginIdentity identity) {
        var now = clock.instant();
        var session = new UserSession(randomToken(), identity.issuer(), identity.subject(), identity.name(),
                identity.groups(), identity.authTime(), identity.acr(), randomToken(), now, now);
        sessions.put(session.id(), session);
        return session;
    }

    /**
     * Finds a live session and records the access; an expired one is removed.
     *
     * @param id the session id from the cookie
     * @return the session, or empty when unknown or expired
     */
    public Optional<UserSession> use(String id) {
        var session = sessions.get(id);
        if (session == null) {
            return Optional.empty();
        }
        var now = clock.instant();
        if (expired(session, now)) {
            sessions.remove(id);
            return Optional.empty();
        }
        var touched = session.touched(now);
        sessions.put(id, touched);
        return Optional.of(touched);
    }

    /**
     * @param id the session id
     * @return the removed session, if it existed
     */
    public Optional<UserSession> close(String id) {
        return Optional.ofNullable(sessions.remove(id));
    }

    /**
     * Removes every expired session.
     *
     * @return the ids of the removed sessions, so their tokens can be dropped
     */
    public List<String> evictExpired() {
        var now = clock.instant();
        var expired = sessions.values().stream().filter(session -> expired(session, now)).map(UserSession::id)
                .toList();
        expired.forEach(sessions::remove);
        return expired;
    }

    private boolean expired(UserSession session, Instant now) {
        return session.lastAccess().plus(idleTimeout).isBefore(now) || session.created().plus(maxLifetime).isBefore(now);
    }
}
