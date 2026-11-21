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

import de.cuioss.sheriff.token.client.flow.FlowContext;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The server-side login transactions (TRH-AUTH-1): {@code state}, {@code nonce} and PKCE verifier (Token Sheriff's
 * {@link FlowContext}) and the checked {@code return}, under an opaque reference the transaction cookie carries.
 * A transaction lives ten minutes and is taken once.
 * <p>
 * The login is reachable without a session, so the store is bounded: at most {@value #MAX_PENDING} transactions are
 * pending, and the expired ones are swept at most once per {@link #SWEEP_INTERVAL}, not on every start.
 */
@ApplicationScoped
public class LoginTransactions {

    /** The lifetime of a transaction, also the {@code Max-Age} of its cookie. */
    public static final Duration LIFETIME = Duration.ofMinutes(10);

    /** The most transactions pending at once; a start beyond it is refused. */
    public static final int MAX_PENDING = 10_000;

    /** The shortest time between two sweeps of the expired transactions. */
    static final Duration SWEEP_INTERVAL = Duration.ofMinutes(1);

    private final Map<String, Transaction> transactions = new ConcurrentHashMap<>();
    private final AtomicInteger pending = new AtomicInteger();
    private final AtomicReference<Instant> lastSweep = new AtomicReference<>(Instant.MIN);
    private final Clock clock;
    private final int maxPending;

    /** Creates the store with the system clock. */
    public LoginTransactions() {
        this(Clock.systemUTC(), MAX_PENDING);
    }

    /**
     * @param clock      the clock
     * @param maxPending the most transactions pending at once
     */
    LoginTransactions(Clock clock, int maxPending) {
        this.clock = clock;
        this.maxPending = maxPending;
    }

    /**
     * @param context       the flow context of the authorization request
     * @param returnAddress the checked return address
     * @return the opaque reference for the transaction cookie, or empty when {@value #MAX_PENDING} logins are pending
     */
    public Optional<String> begin(FlowContext context, String returnAddress) {
        var now = clock.instant();
        sweep(now, pending.get() >= maxPending);
        if (pending.incrementAndGet() > maxPending) {
            pending.decrementAndGet();
            return Optional.empty();
        }
        var reference = SessionStore.randomToken();
        transactions.put(reference, new Transaction(context, returnAddress, now.plus(LIFETIME)));
        return Optional.of(reference);
    }

    /**
     * Takes a transaction: it can be completed once.
     *
     * @param reference the reference from the cookie
     * @return the live transaction, or empty
     */
    public Optional<Transaction> take(String reference) {
        var transaction = transactions.remove(reference);
        if (transaction == null) {
            return Optional.empty();
        }
        pending.decrementAndGet();
        return transaction.expires().isBefore(clock.instant()) ? Optional.empty() : Optional.of(transaction);
    }

    /**
     * Removes the expired transactions, at most once per {@link #SWEEP_INTERVAL} unless the store is full.
     *
     * @param now   the current time
     * @param force whether to sweep regardless of the interval
     */
    private void sweep(Instant now, boolean force) {
        var last = lastSweep.get();
        var recent = !last.equals(Instant.MIN) && last.plus(SWEEP_INTERVAL).isAfter(now);
        if ((recent && !force) || !lastSweep.compareAndSet(last, now)) {
            return;
        }
        for (var entry : transactions.entrySet()) {
            if (entry.getValue().expires().isBefore(now) && transactions.remove(entry.getKey(), entry.getValue())) {
                pending.decrementAndGet();
            }
        }
    }

    /**
     * A pending login.
     *
     * @param context       the flow context
     * @param returnAddress the checked return address
     * @param expires       when the transaction ends
     */
    public record Transaction(FlowContext context, String returnAddress, Instant expires) {
    }
}
