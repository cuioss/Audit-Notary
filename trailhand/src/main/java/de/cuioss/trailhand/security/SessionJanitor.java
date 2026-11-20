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

import de.cuioss.sheriff.token.client.lifecycle.TokenLifecycleManager;
import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Removes expired sessions every minute and drops their tokens (TRH-AUTH-1: idle timeout and absolute lifetime).
 */
@ApplicationScoped
public class SessionJanitor {

    private final SessionStore sessions;
    private final TokenLifecycleManager tokens;
    private ScheduledExecutorService scheduler;

    /**
     * @param sessions the sessions
     * @param tokens   the tokens of the sessions
     */
    public SessionJanitor(SessionStore sessions, TokenLifecycleManager tokens) {
        this.sessions = sessions;
        this.tokens = tokens;
    }

    void onStart(@Observes StartupEvent event) {
        scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("trailhand-sessions").factory());
        scheduler.scheduleWithFixedDelay(this::evict, 1, 1, TimeUnit.MINUTES);
    }

    void onStop(@Observes ShutdownEvent event) {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    void evict() {
        sessions.evictExpired().forEach(tokens::revokeAndClear);
    }
}
