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

/**
 * The server-side login transactions (TRH-AUTH-1): {@code state}, {@code nonce} and PKCE verifier (Token Sheriff's
 * {@link FlowContext}) and the checked {@code return}, under an opaque reference the transaction cookie carries.
 * A transaction lives ten minutes and is taken once.
 */
@ApplicationScoped
public class LoginTransactions {

    /** The lifetime of a transaction, also the {@code Max-Age} of its cookie. */
    public static final Duration LIFETIME = Duration.ofMinutes(10);

    private final Map<String, Transaction> transactions = new ConcurrentHashMap<>();
    private final Clock clock;

    /** Creates the store with the system clock. */
    public LoginTransactions() {
        this(Clock.systemUTC());
    }

    /**
     * @param clock the clock
     */
    LoginTransactions(Clock clock) {
        this.clock = clock;
    }

    /**
     * @param context      the flow context of the authorization request
     * @param returnAddress the checked return address
     * @return the opaque reference for the transaction cookie
     */
    public String begin(FlowContext context, String returnAddress) {
        var now = clock.instant();
        transactions.values().removeIf(transaction -> transaction.expires().isBefore(now));
        var reference = SessionStore.randomToken();
        transactions.put(reference, new Transaction(context, returnAddress, now.plus(LIFETIME)));
        return reference;
    }

    /**
     * Takes a transaction: it can be completed once.
     *
     * @param reference the reference from the cookie
     * @return the live transaction, or empty
     */
    public Optional<Transaction> take(String reference) {
        var transaction = transactions.remove(reference);
        if (transaction == null || transaction.expires().isBefore(clock.instant())) {
            return Optional.empty();
        }
        return Optional.of(transaction);
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
