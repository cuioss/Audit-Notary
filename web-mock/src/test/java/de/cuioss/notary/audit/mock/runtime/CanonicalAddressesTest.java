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
