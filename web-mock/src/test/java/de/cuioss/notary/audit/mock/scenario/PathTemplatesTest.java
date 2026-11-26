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

@DisplayName("Path templates in route and link keys")
class PathTemplatesTest {

    private static final Scenario SCENARIO = new ScenarioLoader(new ObjectMapper()).parse("templates.json", """
            {"format_version": 1, "name": "templates", "user": {"name": "Alex"}, "start": "a",
             "routes": {
               "GET /api/v1/catalogs/service/{id}": {"body": {"which": "scenario-template"}},
               "GET /api/v1/catalogs/service/schema": {"body": {"which": "scenario-exact"}},
               "GET /api/v1/catalogs/{catalog}/{id}": {"body": {"which": "scenario-two"}},
               "GET /api/v1/catalogs/{catalog}/{id}?at=v1": {"body": {"which": "scenario-two-at"}},
               "GET /api/v1/catalogs/service/{id}?at=v1": {"body": {"which": "scenario-template-at"}},
               "GET /api/v1/catalogs/service/{a}/{b}": {"body": {"which": "scenario-b"}},
               "GET /api/v1/catalogs/{x}/{y}/retirement": {"body": {"which": "scenario-text-y"}},
               "GET /api/v1/catalogs/{p}/{q}/retirement?z=1": {"body": {"which": "scenario-text-q"}},
               "GET /api/v1/catalogs/{x}/special/{y}": {"body": {"which": "scenario-text-x"}},
               "GET /api/v1/catalogs/{x}/{y}/{z}": {"body": {"which": "scenario-three"}}},
             "states": {
               "a": {},
               "b": {"routes": {"GET /api/v1/catalogs/{catalog}/{id}": {"body": {"which": "state-template"}}}},
               "c": {"links": {
                       "template": {"method": "POST", "path": "/api/v1/catalogs/service/{id}/retirement", "next": "a",
                                    "body": {"which": "link-template"}},
                       "exact": {"method": "POST", "path": "/api/v1/catalogs/service/customer-portal/retirement",
                                 "next": "b", "body": {"which": "link-exact"}}}}}}
            """);

    private static String which(String state, String path, Map<String, String> query) {
        return SCENARIO.route(SCENARIO.state(state).orElseThrow(), "GET", path, query)
                .map(route -> route.body().path("which").asText()).orElse("none");
    }

    @Test
    @DisplayName("captures the segments a template stood for, by name")
    void shouldCaptureTheSegments() {
        var key = RouteKey.of("PUT", "/api/v1/catalogs/{catalog}/{id}").orElseThrow();
        assertAll(
                () -> assertEquals(Optional.of(Map.of("catalog", "service", "id", "payment-api")),
                        key.capture("PUT", "/api/v1/catalogs/service/payment-api", Map.of())),
                () -> assertEquals(Optional.empty(), key.capture("GET", "/api/v1/catalogs/service/payment-api", Map.of())),
                () -> assertEquals(Optional.of(Map.of()),
                        RouteKey.of("GET", "/api/v1/status").orElseThrow().capture("GET", "/api/v1/status", Map.of())));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/catalogs/service", "/api/v1/catalogs/service/", "/api/v1/catalogs//x",
            "/api/v1/catalogs/service/a/b", "/api/v2/catalogs/service/a"})
    @DisplayName("lets a {name} stand for exactly one non-empty segment: not none, not an empty one, not two")
    void shouldMatchExactlyOneSegment(String path) {
        assertFalse(RouteKey.of("GET", "/api/v1/catalogs/service/{id}").orElseThrow().matches("GET", path, Map.of()));
    }

    @Test
    @DisplayName("matches a template segment by segment: a literal next to it must be equal")
    void shouldMatchLiteralSegments() {
        var key = RouteKey.of("POST", "/api/v1/catalogs/{catalog}/{id}/retirement").orElseThrow();
        assertAll(
                () -> assertTrue(key.matches("POST", "/api/v1/catalogs/team/payments/retirement", Map.of())),
                () -> assertFalse(key.matches("POST", "/api/v1/catalogs/team/payments/retire", Map.of())),
                () -> assertFalse(key.matches("POST", "/api/v1/catalogs/team/payments", Map.of())),
                () -> assertEquals(4, key.literalSegments()),
                () -> assertTrue(key.isTemplate()));
    }

    @Test
    @DisplayName("counts the literal segments of a key, without the {name} ones")
    void shouldCountTheLiteralSegments() {
        assertAll(
                () -> assertEquals(5, RouteKey.of("GET", "/api/v1/catalogs/service/schema").orElseThrow().literalSegments()),
                () -> assertEquals(4, RouteKey.of("GET", "/api/v1/catalogs/service/{id}").orElseThrow().literalSegments()),
                () -> assertEquals(3, RouteKey.of("GET", "/api/v1/catalogs/{c}/{id}").orElseThrow().literalSegments()));
    }

    @Test
    @DisplayName("prefers an exact path to a template, whatever the query of the template")
    void shouldPreferTheExactPath() {
        assertAll(
                () -> assertEquals("scenario-exact", which("a", "/api/v1/catalogs/service/schema", Map.of())),
                () -> assertEquals("scenario-exact", which("a", "/api/v1/catalogs/service/schema", Map.of("at", "v1"))),
                () -> assertEquals("scenario-template", which("a", "/api/v1/catalogs/service/payment-api", Map.of())));
    }

    @Test
    @DisplayName("prefers the template with more literal segments, then the one with more listed parameters")
    void shouldPreferTheMoreSpecificTemplate() {
        assertAll(
                () -> assertEquals("scenario-template", which("a", "/api/v1/catalogs/service/x", Map.of())),
                () -> assertEquals("scenario-template-at", which("a", "/api/v1/catalogs/service/x", Map.of("at", "v1"))),
                () -> assertEquals("scenario-two", which("a", "/api/v1/catalogs/team/x", Map.of())),
                () -> assertEquals("scenario-two-at", which("a", "/api/v1/catalogs/team/x", Map.of("at", "v1"))),
                () -> assertEquals("scenario-three", which("a", "/api/v1/catalogs/team/x/y", Map.of())),
                () -> assertEquals("scenario-b", which("a", "/api/v1/catalogs/service/x/y", Map.of())));
    }

    @Test
    @DisplayName("chooses by the text of the key when two templates are equally specific")
    void shouldChooseByTextWhenEqual() {
        assertAll(
                () -> assertEquals("scenario-text-y", which("a", "/api/v1/catalogs/team/x/retirement", Map.of())),
                () -> assertEquals("scenario-text-q", which("a", "/api/v1/catalogs/team/x/retirement", Map.of("z", "1"))),
                () -> assertEquals("scenario-text-x", which("a", "/api/v1/catalogs/team/special/y", Map.of())));
    }

    @Test
    @DisplayName("lets a template of the state beat an exact key of the scenario: the level comes first")
    void shouldPreferTheStateLevel() {
        assertAll(
                () -> assertEquals("state-template", which("b", "/api/v1/catalogs/service/schema", Map.of())),
                () -> assertEquals("state-template", which("b", "/api/v1/catalogs/team/x", Map.of())),
                () -> assertEquals("scenario-template", which("a", "/api/v1/catalogs/service/x", Map.of())));
    }

    @Test
    @DisplayName("passes the captured segments with the route")
    void shouldReturnTheCaptures() {
        var match = SCENARIO.match(SCENARIO.state("a").orElseThrow(), "GET", "/api/v1/catalogs/service/payment-api", Map.of());
        assertEquals(Map.of("id", "payment-api"), match.orElseThrow().captures());
    }

    @Test
    @DisplayName("chooses a link by the same order: the exact link beats the template link whatever their order in the state")
    void shouldChooseTheExactLink() {
        var state = SCENARIO.state("c").orElseThrow();
        assertAll(
                () -> assertEquals("exact", state.linkFor("POST", "/api/v1/catalogs/service/customer-portal/retirement")
                        .orElseThrow().name()),
                () -> assertEquals("template", state.linkFor("POST", "/api/v1/catalogs/service/payment-api/retirement")
                        .orElseThrow().name()),
                () -> assertEquals(Optional.empty(), state.linkFor("POST", "/api/v1/catalogs/service/payment-api")));
    }

    @Test
    @DisplayName("writes the target of a template link as it was read, for /mock/state")
    void shouldWriteTheTemplateTarget() {
        assertEquals("/api/v1/catalogs/service/{id}/retirement",
                SCENARIO.state("c").orElseThrow().links().get("template").key().target());
    }
}
