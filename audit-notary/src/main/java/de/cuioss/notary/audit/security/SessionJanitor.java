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
package de.cuioss.notary.audit.security;

import de.cuioss.sheriff.token.client.lifecycle.TokenLifecycleManager;
import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import org.jspecify.annotations.Nullable;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Removes expired sessions every minute and drops their tokens (AUN-AUTH-1: idle timeout and absolute lifetime).
 */
@ApplicationScoped
public class SessionJanitor {

    private final SessionStore sessions;
    private final TokenLifecycleManager tokens;
    private @Nullable ScheduledExecutorService scheduler;

    /**
     * @param sessions the sessions
     * @param tokens   the tokens of the sessions
     */
    public SessionJanitor(SessionStore sessions, TokenLifecycleManager tokens) {
        this.sessions = sessions;
        this.tokens = tokens;
    }

    void onStart(@Observes StartupEvent event) {
        scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("audit-notary-sessions").factory());
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
