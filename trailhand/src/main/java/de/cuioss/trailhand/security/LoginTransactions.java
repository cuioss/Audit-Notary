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
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The server-side login transactions (TRH-AUTH-1): {@code state}, {@code nonce} and PKCE verifier (Token Sheriff's
 * {@link FlowContext}) and the checked {@code return}, under an opaque reference the transaction cookie carries.
 * A transaction lives ten minutes and is taken once.
 * <p>
 * The login is reachable without a session, so the store is bounded: at most {@value #MAX_PENDING} transactions are
 * pending. Every transaction lives {@link #LIFETIME}, so the order of the starts is the order of expiry: a queue in
 * that order lets each start drop the expired and the taken transactions at its head, without scanning the store.
 */
@ApplicationScoped
public class LoginTransactions {

    /** The lifetime of a transaction, also the {@code Max-Age} of its cookie. */
    public static final Duration LIFETIME = Duration.ofMinutes(10);

    /** The most transactions pending at once; a start beyond it is refused. */
    public static final int MAX_PENDING = 10_000;

    private final Map<String, Transaction> transactions = new ConcurrentHashMap<>();
    /** The references in the order of their start, which is the order of their expiry. */
    private final Queue<String> byExpiry = new ConcurrentLinkedQueue<>();
    private final AtomicInteger queued = new AtomicInteger();
    private final AtomicBoolean compacting = new AtomicBoolean();
    private final AtomicInteger pending = new AtomicInteger();
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
        dropExpired(now);
        if (pending.incrementAndGet() > maxPending) {
            pending.decrementAndGet();
            return Optional.empty();
        }
        var reference = SessionStore.randomToken();
        // The expiry is taken and queued in one step, so the queue order is the expiry order across threads.
        synchronized (byExpiry) {
            transactions.put(reference, new Transaction(context, returnAddress, clock.instant().plus(LIFETIME)));
            byExpiry.add(reference);
        }
        if (queued.incrementAndGet() > 2 * Math.max(maxPending, 1)) {
            compact();
        }
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
     * Drops the transactions at the head of the queue that are taken or expired; it stops at the first live one, so
     * its cost is the number of transactions it drops.
     *
     * @param now the current time
     */
    private void dropExpired(Instant now) {
        for (String head = byExpiry.peek(); head != null; head = byExpiry.peek()) {
            var transaction = transactions.get(head);
            if (transaction != null && !transaction.expires().isBefore(now)) {
                return;
            }
            if (byExpiry.remove(head)) {
                queued.decrementAndGet();
                if (transaction != null && transactions.remove(head, transaction)) {
                    pending.decrementAndGet();
                }
            }
        }
    }

    /**
     * Drops the references of taken transactions from the queue. It runs when the queue holds twice the limit, which
     * only starts that are taken again soon can cause; after it the queue holds at most the pending transactions, so
     * its cost is spread over the starts that filled it.
     */
    private void compact() {
        if (!compacting.compareAndSet(false, true)) {
            return;
        }
        try {
            byExpiry.removeIf(reference -> !transactions.containsKey(reference));
            queued.set(byExpiry.size());
        } finally {
            compacting.set(false);
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
