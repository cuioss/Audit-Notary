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
import de.cuioss.test.generator.Generators;
import de.cuioss.test.generator.junit.EnableGeneratorController;
import de.cuioss.trailhand.config.Action;
import de.cuioss.trailhand.config.RightSettings;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableGeneratorController
@DisplayName("The security package (TRH-AUTH-1, TRH-AUTH-2)")
class SecurityTest {

    private static final Instant START = Instant.parse("2026-11-20T08:00:00Z");

    /** A clock the test moves. */
    private static final class MovableClock extends Clock {
        private Instant now = START;

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }
    }

    private static LoginIdentity identity() {
        return new LoginIdentity("https://idp.example.org", "sub", "Alex", List.of("assessors"), START, "1");
    }

    @Nested
    @DisplayName("SessionStore")
    class Sessions {

        @Test
        @DisplayName("opens sessions with random ids and tokens and ends them after the idle timeout")
        void idle() {
            var clock = new MovableClock();
            var store = new SessionStore(Duration.ofMinutes(30), Duration.ofHours(8), clock);
            var first = store.open(identity());
            var second = store.open(identity());
            assertNotEquals(first.id(), second.id());
            assertNotEquals(first.csrfToken(), first.id());

            clock.advance(Duration.ofMinutes(29));
            assertTrue(store.use(first.id()).isPresent());
            clock.advance(Duration.ofMinutes(29));
            assertTrue(store.use(first.id()).isPresent(), "use renews the idle time");
            clock.advance(Duration.ofMinutes(31));
            assertTrue(store.use(first.id()).isEmpty());
            assertEquals(List.of(second.id()), store.evictExpired());
            assertFalse(second.toString().contains(second.csrfToken()));
        }

        @Test
        @DisplayName("ends a session after its absolute lifetime however active it is")
        void lifetime() {
            var clock = new MovableClock();
            var store = new SessionStore(Duration.ofMinutes(30), Duration.ofHours(1), clock);
            var session = store.open(identity());
            for (int step = 0; step < 3; step++) {
                clock.advance(Duration.ofMinutes(20));
                assertTrue(store.use(session.id()).isPresent());
            }
            clock.advance(Duration.ofMinutes(1));
            assertTrue(store.use(session.id()).isEmpty());
            assertTrue(store.close(session.id()).isEmpty());
            assertTrue(store.use("unknown").isEmpty());
        }
    }

    @Nested
    @DisplayName("RightsMapper")
    class Rights {

        private final RightsMapper mapper = new RightsMapper(Map.of(
                "assessors", List.of(new RightSettings("samm", Set.of(Action.READ, Action.EDIT))),
                "approvers", List.of(new RightSettings("samm", Set.of(Action.APPROVE)),
                        new RightSettings("isms", Set.of(Action.READ)))));

        @Test
        @DisplayName("unites the rights of all groups per repository")
        void unites() {
            assertEquals(Map.of("samm", Set.of(Action.READ, Action.EDIT, Action.APPROVE), "isms", Set.of(Action.READ)),
                    mapper.rightsOf(List.of("assessors", "approvers")));
            assertTrue(mapper.permits(List.of("approvers"), "samm", Action.APPROVE));
        }

        @Test
        @DisplayName("denies by default")
        void deniesByDefault() {
            var group = Generators.letterStrings(4, 12).next();
            assertTrue(mapper.rightsOf(List.of(group)).isEmpty());
            assertFalse(mapper.permits(List.of("assessors"), "samm", Action.APPROVE));
            assertFalse(mapper.permits(List.of(), "samm", Action.READ));
        }
    }

    @Nested
    @DisplayName("ReturnAddresses")
    class Returns {

        private final ReturnAddresses addresses = new ReturnAddresses();

        @ParameterizedTest
        @ValueSource(strings = {"/", "/samm", "/samm/payments/2026-q4/sm", "/samm/payments/2026-q4/release",
                "/incidents/2026/inc-0007", "/settings/appearance", "/welcome"})
        @DisplayName("accepts a canonical address")
        void accepts(String address) {
            assertEquals(address, addresses.check(address));
        }

        @ParameterizedTest
        @ValueSource(strings = {"//evil.example/x", "https://evil.example", "/\\evil", "samm", "/unknown",
                "/incidents/26/x", "/samm/A", "", "/%2F%2Fevil"})
        @DisplayName("replaces anything else by /")
        void replaces(String address) {
            assertEquals("/", addresses.check(address));
        }

        @Test
        @DisplayName("drops a query, a trailing slash and refuses null and overlong values")
        void normalises() {
            assertEquals("/samm", addresses.check("/samm/?x=1"));
            assertEquals("/", addresses.check(null));
            assertEquals("/", addresses.check("/samm/" + "a".repeat(600)));
            var segment = Generators.letterStrings(3, 20).next().toLowerCase(Locale.ROOT);
            assertEquals("/catalogs/" + segment, addresses.check("/catalogs/" + segment));
        }
    }

    @Nested
    @DisplayName("LoginTransactions")
    class Transactions {

        @Test
        @DisplayName("hand a transaction out once and only within ten minutes")
        void once() {
            var clock = new MovableClock();
            var transactions = new LoginTransactions(clock);
            var context = FlowContext.create("https://trailhand.example.org/api/v1/auth/callback");
            var reference = transactions.begin(context, "/samm");

            var taken = transactions.take(reference);
            assertTrue(taken.isPresent());
            assertEquals("/samm", taken.get().returnAddress());
            assertTrue(transactions.take(reference).isEmpty());

            var late = transactions.begin(context, "/");
            clock.advance(LoginTransactions.LIFETIME.plusSeconds(1));
            assertTrue(transactions.take(late).isEmpty());
        }
    }
}
