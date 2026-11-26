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

import static org.junit.jupiter.api.Assertions.assertAll;
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
            "/reports/trends", "/settings/appearance", "/settings/profile", "/catalogs", "/catalogs/service",
            "/catalogs/service/new", "/catalogs/service/payment-api", "/directory/import", "/directory/persons"})
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

    @ParameterizedTest
    @ValueSource(strings = {"/categories", "/categories/test-note", "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v1", "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v12",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=4be0c3a",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?%61t=v1",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=0123456789abcdef0123456789abcdef01234567",
            "/categories/test-note/new", "/categories/test-note/new?kind=note",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G/release"})
    @DisplayName("keeps a return address of the generic documents lens, with its allowed query")
    void shouldKeepDocumentAddressesWithAllowedQuery(String address) {
        assertEquals(address, addresses.checkReturn(address));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=zzz",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=V1",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v12345",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=abc123",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?foo=1",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v1&foo=1",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v1&at=v2",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?kind=note",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v1#x",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v1&&",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?%zz=v1",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=%ff",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=%", "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=%zz",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G#x",
            "/categories/test-note/new?at=v1", "/categories/test-note/new?kind=NOTE", "/categories/test-note/new?kind=a&kind=b",
            "/categories/test-note/new#x", "/categories/test-note?at=v1", "/categories?kind=note",
            "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G/release?at=v1", "/samm/payments?at=v1"})
    @DisplayName("replaces a return address with a name the address does not admit, a bad or repeated value or a fragment by /")
    void shouldReplaceDocumentAddressesWithOtherQueries(String candidate) {
        assertEquals(CanonicalAddresses.FALLBACK, addresses.checkReturn(candidate));
    }

    @Test
    @DisplayName("refuses a query of more than 256 characters")
    void shouldLimitTheQuery() {
        String path = "/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G";
        assertAll(
                () -> assertEquals(path + "?at=v1", addresses.checkReturn(path + "?at=v1")),
                () -> assertEquals(CanonicalAddresses.FALLBACK,
                        addresses.checkReturn(path + "?at=v1&at=" + "1".repeat(260))),
                () -> assertEquals(CanonicalAddresses.FALLBACK,
                        addresses.checkReturn(path + "?at=" + "a".repeat(257))));
    }

    @Test
    @DisplayName("keeps isCanonical on the path only")
    void shouldKeepIsCanonicalOnThePath() {
        assertAll(
                () -> assertTrue(addresses.isCanonical("/categories/test-note/new")),
                () -> assertTrue(addresses.isCanonical("/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G")),
                () -> assertFalse(addresses.isCanonical("/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v1")),
                () -> assertFalse(addresses.isCanonical("/categories/test-note/a/b/c")));
    }

    @Test
    @DisplayName("matches the whole path only")
    void shouldAnchorWholePath() {
        assertTrue(addresses.isCanonical("/samm/payments"));
        assertFalse(addresses.isCanonical("/samm/payments/"));
        assertFalse(addresses.isCanonical("/x/samm"));
    }
}
