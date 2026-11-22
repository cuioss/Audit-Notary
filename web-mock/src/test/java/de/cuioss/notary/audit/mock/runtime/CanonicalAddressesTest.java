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
package de.cuioss.notary.audit.mock.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("CanonicalAddresses")
class CanonicalAddressesTest {

    private final CanonicalAddresses addresses = CanonicalAddresses.load(new ObjectMapper(),
            CanonicalAddressesTest.class.getClassLoader());

    @ParameterizedTest
    @ValueSource(strings = {"/", "/welcome", "/samm", "/samm/payments", "/samm/payments/2026-q4",
            "/samm/payments/2026-q4/sm", "/samm/a/b/release", "/threat-models/payment-gateway/checkout-flow",
            "/incidents/2026/inc-0007", "/isms/risks/r-012", "/isms/documents/policy-01", "/catalogs/team/payments",
            "/reports/trends", "/settings/appearance"})
    @DisplayName("keeps a canonical return address")
    void shouldKeepCanonical(String address) {
        assertEquals(address, addresses.checkReturn(address));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"//evil.example", "/\\evil", "https://evil.example/", "evil", "/samm/a/b/c/d",
            "/incidents/26/x", "/unknown", "/samm/A", "/samm/x?y=1", "/samm/x#y", "/samm/\u0007", "/samm/../x"})
    @DisplayName("replaces any other return value by /")
    void shouldReplaceOthers(String candidate) {
        assertEquals(CanonicalAddresses.FALLBACK, addresses.checkReturn(candidate));
    }

    @Test
    @DisplayName("matches the whole path only")
    void shouldAnchorWholePath() {
        assertTrue(addresses.isCanonical("/samm/payments"));
        assertFalse(addresses.isCanonical("/samm/payments/"));
        assertFalse(addresses.isCanonical("/x/samm"));
    }
}
