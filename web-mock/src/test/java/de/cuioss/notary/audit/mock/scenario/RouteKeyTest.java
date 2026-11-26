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
package de.cuioss.notary.audit.mock.scenario;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("Route keys with a query")
class RouteKeyTest {

    private static final Scenario SCENARIO = new ScenarioLoader(new ObjectMapper()).parse("keys.json", """
            {"format_version": 1, "name": "keys", "user": {"name": "Alex"}, "start": "a",
             "routes": {
               "GET /api/v1/documents/test-notes/X": {"status": 200, "body": {"which": "scenario-plain"}},
               "GET /api/v1/documents/test-notes/X?at=v1": {"status": 200, "body": {"which": "scenario-at"}},
               "GET /api/v1/documents/test-notes/X?at=v1&kind=note": {"status": 200, "body": {"which": "scenario-both"}},
               "GET /api/v1/documents/test-notes/X?kind=note": {"status": 200, "body": {"which": "scenario-kind"}},
               "GET /api/v1/documents/test-notes/Y": {"status": 200, "body": {"which": "scenario-y"}},
               "GET /api/v1/documents/test-notes/XX": {"status": 200, "body": {"which": "scenario-xx"}}},
             "states": {
               "a": {},
               "b": {"routes": {"GET /api/v1/documents/test-notes/X?at=v1": {"status": 200, "body": {"which": "state-at"}}}},
               "c": {"routes": {"GET /api/v1/documents/test-notes/X": {"status": 200, "body": {"which": "state-plain"}}},
                     "links": {
                       "plain": {"method": "POST", "path": "/api/v1/go", "next": "a", "body": {"which": "link-plain"}},
                       "one": {"method": "POST", "path": "/api/v1/go?a=1", "next": "a", "body": {"which": "link-one"}},
                       "two": {"method": "POST", "path": "/api/v1/go?a=1&b=2", "next": "a", "body": {"which": "link-two"}}}},
               "d": {"links": {
                       "second-b": {"method": "POST", "path": "/api/v1/tie?b=2", "next": "a"},
                       "first-a": {"method": "POST", "path": "/api/v1/tie?a=1", "next": "a"}}}}}
            """);

    private static String which(String state, String method, String path, Map<String, String> query) {
        return SCENARIO.route(SCENARIO.state(state).orElseThrow(), method, path, query)
                .map(route -> route.body().path("which").asText()).orElse("none");
    }

    @Test
    @DisplayName("matches a key without query to any query")
    void shouldMatchPlainKeyToAnyQuery() {
        assertAll(
                () -> assertEquals("scenario-plain", which("a", "GET", "/api/v1/documents/test-notes/X", Map.of())),
                () -> assertEquals("scenario-plain", which("a", "GET", "/api/v1/documents/test-notes/X", Map.of("at", "v2"))),
                () -> assertEquals("scenario-plain", which("a", "GET", "/api/v1/documents/test-notes/X", Map.of("z", "1"))));
    }

    @Test
    @DisplayName("matches a key with a query only to a request that holds every listed name with the listed value")
    void shouldMatchQueryKeyExactlyOnTheListedValues() {
        assertAll(
                () -> assertEquals("scenario-at", which("a", "GET", "/api/v1/documents/test-notes/X", Map.of("at", "v1"))),
                () -> assertEquals("scenario-at", which("a", "GET", "/api/v1/documents/test-notes/X",
                        Map.of("at", "v1", "other", "x"))),
                () -> assertEquals("scenario-plain", which("a", "GET", "/api/v1/documents/test-notes/X", Map.of("at", "V1"))),
                () -> assertEquals("scenario-kind", which("a", "GET", "/api/v1/documents/test-notes/X",
                        Map.of("kind", "note"))));
    }

    @Test
    @DisplayName("prefers the key with the most listed parameters")
    void shouldPreferTheMostSpecificKey() {
        assertEquals("scenario-both", which("a", "GET", "/api/v1/documents/test-notes/X",
                Map.of("kind", "note", "at", "v1")));
    }

    @Test
    @DisplayName("prefers a route of the state to one of the scenario, whatever their parameters")
    void shouldPreferTheStateOverTheScenario() {
        assertAll(
                () -> assertEquals("state-at", which("b", "GET", "/api/v1/documents/test-notes/X", Map.of("at", "v1"))),
                () -> assertEquals("state-plain", which("c", "GET", "/api/v1/documents/test-notes/X", Map.of("at", "v1"))),
                () -> assertEquals("scenario-plain", which("b", "GET", "/api/v1/documents/test-notes/X", Map.of())));
    }

    @Test
    @DisplayName("matches the path as a whole and the method")
    void shouldMatchWholePathAndMethod() {
        assertAll(
                () -> assertEquals("scenario-y", which("a", "GET", "/api/v1/documents/test-notes/Y", Map.of())),
                () -> assertEquals("scenario-xx", which("a", "GET", "/api/v1/documents/test-notes/XX", Map.of())),
                () -> assertEquals("none", which("a", "POST", "/api/v1/documents/test-notes/X", Map.of())),
                () -> assertEquals("none", which("a", "GET", "/api/v1/documents/test-notes/Z", Map.of("at", "v1"))));
    }

    @Test
    @DisplayName("prefers the link with the most listed parameters, and a key without query matches any query")
    void shouldChooseTheMostSpecificLink() {
        var state = SCENARIO.state("c").orElseThrow();
        assertAll(
                () -> assertEquals("one", state.linkFor("POST", "/api/v1/go", Map.of("a", "1")).orElseThrow().name()),
                () -> assertEquals("two", state.linkFor("POST", "/api/v1/go", Map.of("b", "2", "a", "1")).orElseThrow().name()),
                () -> assertEquals("plain", state.linkFor("POST", "/api/v1/go", Map.of("a", "2")).orElseThrow().name()),
                () -> assertEquals("plain", state.linkFor("POST", "/api/v1/go").orElseThrow().name()),
                () -> assertEquals(Optional.empty(), state.linkFor("GET", "/api/v1/go", Map.of("a", "1"))));
    }

    @Test
    @DisplayName("takes the first link in the order of the state when links list equally many parameters")
    void shouldKeepTheFirstOfEqualLinks() {
        var state = SCENARIO.state("d").orElseThrow();
        assertEquals("second-b", state.linkFor("POST", "/api/v1/tie", Map.of("a", "1", "b", "2")).orElseThrow().name());
    }

    @Test
    @DisplayName("writes a link target with its query, for /mock/state")
    void shouldWriteTheTargetOfALink() {
        var links = SCENARIO.state("c").orElseThrow().links();
        assertAll(
                () -> assertEquals("/api/v1/go", links.get("plain").key().target()),
                () -> assertEquals("/api/v1/go?a=1&b=2", links.get("two").key().target()));
    }

    @Test
    @DisplayName("parses and decodes the query of a key")
    void shouldParseTheQuery() {
        var key = RouteKey.of("GET", "/api/v1/due?a=%C3%A4&b=x%26y").orElseThrow();
        assertAll(
                () -> assertEquals("/api/v1/due", key.path()),
                () -> assertEquals(Map.of("a", "ä", "b", "x&y"), key.query()),
                () -> assertTrue(key.matches("GET", "/api/v1/due", Map.of("a", "ä", "b", "x&y", "c", "1"))),
                () -> assertFalse(key.matches("GET", "/api/v1/due", Map.of("a", "ä"))));
    }

    @Test
    @DisplayName("writes the target with encoded query components, so that it parses back to the same key")
    void shouldRoundTripATargetWithReservedCharacters() {
        var key = RouteKey.of("GET", "/api/v1/go?b=x%26y&c=a%3Db%23").orElseThrow();
        var written = key.target();
        assertAll(
                () -> assertEquals("/api/v1/go?b=x%26y&c=a%3Db%23", written),
                () -> assertEquals(key, RouteKey.of("GET", written).orElseThrow()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "a", "a=", "=1", "a=1&a=2", "a=1#b", "a=1&", "&a=1", "a=1&&b=2", "a=%", "a=%zz", "%=1", "%4=1"})
    @DisplayName("refuses a query of another form")
    void shouldRefuseMalformedQueries(String query) {
        assertEquals(Optional.empty(), RouteKey.parseQuery(query));
        assertEquals(Optional.empty(), RouteKey.of("GET", "/api/v1/due?" + query));
    }
}
