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
package de.cuioss.notary.audit.mock;

import com.fasterxml.jackson.databind.JsonNode;
import de.cuioss.notary.audit.mock.runtime.CanonicalAddresses;
import de.cuioss.notary.audit.mock.scenario.ScenarioLoader;
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.Period;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The Reports lens of the profiles workshop, read-only, release, empty, degraded and local
 * (doc/specification/rest-api.adoc, <em>Reports Requests</em>): the dashboard summary, the trend of every scope, the
 * comparison pair, the threat evaluation and the risk register as of a date. The fixtures are static: the section
 * {@code Mirrors} reads the data files and checks that they still agree with one another.
 */
@DisplayName("The Reports lens")
class ReportsLensTest {

    private static final String REPORTS = "/api/v1/reports/";
    private static final String SAMM = "/api/v1/samm/";
    private static final String RISKS = "/api/v1/isms/risks";
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 26);
    private static final double TOLERANCE = 1e-12;
    private static final Pattern HEX7 = Pattern.compile("[0-9a-f]{7}");
    private static final List<String> SCOPES = List.of("payments", "identity", "shop", "organisation");
    private static final List<String> FUNCTIONS = List.of("governance", "design", "implementation", "verification", "operations");
    private static final ClassLoader CLASS_LOADER = ReportsLensTest.class.getClassLoader();
    private static final ScenarioRegistry REGISTRY = new ScenarioRegistry(
            new ScenarioLoader(MockClient.MAPPER, name -> ScenarioRegistry.readDataFile(CLASS_LOADER, name)), CLASS_LOADER);
    private static final CanonicalAddresses ADDRESSES = CanonicalAddresses.load(MockClient.MAPPER, CLASS_LOADER);

    private static MockClient start(String reference) {
        return MockClient.start(reference).login();
    }

    /** A successful read: the status is {@code 200} before the body is decoded; a refusal is read with {@code client.get}. */
    private static JsonNode get(MockClient client, String path) {
        var response = client.get(path);
        assertEquals(200, response.statusCode(), path);
        return json(response);
    }

    private static void goTo(MockClient client, String state) {
        assertEquals(200, client.send("POST", "/mock/goto/" + state, null, Map.of()).statusCode(), state);
    }

    private static JsonNode data(String name) {
        try {
            return MockClient.MAPPER.readTree(ScenarioRegistry.readDataFile(CLASS_LOADER, name).orElseThrow());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static List<String> fieldNames(JsonNode object) {
        List<String> names = new ArrayList<>();
        object.fieldNames().forEachRemaining(names::add);
        return names;
    }

    /** The member {@code name} of every element of an array, as text (a nested member of the same name is not met). */
    private static List<String> column(JsonNode array, String name) {
        List<String> result = new ArrayList<>();
        array.forEach(item -> result.add(item.path(name).asText()));
        return result;
    }

    private static List<String> ids(JsonNode risks) {
        return column(risks, "id");
    }

    private static List<String> points(JsonNode scopes) {
        List<String> result = new ArrayList<>();
        scopes.forEach(scope -> result.add(String.valueOf(scope.path("points").size())));
        return result;
    }

    private static List<String> serviceIds(JsonNode rows) {
        List<String> result = new ArrayList<>();
        rows.forEach(row -> result.add(row.path("service").path("id").asText()));
        return result;
    }

    private static List<String> practiceIds(JsonNode functions) {
        List<String> result = new ArrayList<>();
        functions.forEach(function -> function.path("practices").forEach(practice -> result.add(practice.path("id").asText())));
        return result;
    }

    private static JsonNode register(MockClient client, String asOf) {
        return get(client, RISKS + (asOf == null ? "" : "?as-of=" + asOf));
    }

    private static String pointer(JsonNode refusal) {
        return refusal.path("errors").get(0).path("pointer").asText();
    }

    private static String code(JsonNode refusal) {
        return refusal.path("errors").get(0).path("code").asText();
    }

    private static String fetchOf(JsonNode status, String alias) {
        for (var repository : status.path("repositories")) {
            if (alias.equals(repository.path("alias").asText())) {
                return repository.path("fetch").asText();
            }
        }
        throw new IllegalStateException(alias);
    }

    private static void assertCanonical(String address) {
        int query = address.indexOf('?');
        String path = query < 0 ? address : address.substring(0, query);
        assertTrue(ADDRESSES.isCanonical(path), address);
    }

    /** The counts of the risks of an answer: by rating, review due within 30 days, review overdue. */
    private record RiskFigures(Map<String, Integer> byRating, int dueSoon, int overdue, String latestRelease) {

        static RiskFigures of(JsonNode risks) {
            Map<String, Integer> byRating = new LinkedHashMap<>();
            for (var rating : List.of("critical", "high", "medium", "low")) {
                byRating.put(rating, 0);
            }
            int dueSoon = 0;
            int overdue = 0;
            String latest = null;
            for (var risk : risks) {
                byRating.merge(risk.path("rating").asText(), 1, Integer::sum);
                if (!risk.path("reviewDue").isNull()) {
                    long days = ChronoUnit.DAYS.between(TODAY, LocalDate.parse(risk.path("reviewDue").asText()));
                    if (days < 0) {
                        overdue++;
                    } else if (days <= 30) {
                        dueSoon++;
                    }
                }
                String released = risk.path("releasedAt").asText();
                if (latest == null || released.compareTo(latest) > 0) {
                    latest = released;
                }
            }
            return new RiskFigures(byRating, dueSoon, overdue, latest);
        }
    }

    private static void assertRisksSection(JsonNode section, JsonNode listed) {
        var figures = RiskFigures.of(listed);
        assertAll(
                () -> assertEquals(listed.size(), section.path("entries").asInt()),
                () -> figures.byRating().forEach((rating, count) ->
                        assertEquals(count, section.path("byRating").path(rating).asInt(), rating)),
                () -> assertEquals(figures.dueSoon(), section.path("dueSoon").asInt()),
                () -> assertEquals(figures.overdue(), section.path("overdue").asInt()),
                () -> assertEquals(figures.latestRelease(),
                        section.path("latestRelease").isNull() ? null : section.path("latestRelease").asText()));
    }

    private static void assertThreatSection(JsonNode section, JsonNode evaluation) {
        var rows = evaluation.path("models");
        int open = 0;
        int untreated = 0;
        int overdue = 0;
        int dueSoon = 0;
        for (var row : rows) {
            open += row.path("threats").path("open").asInt();
            untreated += row.path("threats").path("untreated").asInt();
            overdue += "overdue".equals(row.path("status").asText()) ? 1 : 0;
            dueSoon += "due-soon".equals(row.path("status").asText()) ? 1 : 0;
        }
        int withoutModel = evaluation.path("withoutModel").size();
        int withModel = new HashSet<>(serviceIds(rows)).size();
        var expected = List.of(withModel + withoutModel, withModel, withoutModel, open, untreated, overdue, dueSoon);
        var actual = List.of(section.path("services").asInt(), section.path("withModel").asInt(),
                section.path("withoutModel").asInt(), section.path("openThreats").asInt(),
                section.path("untreatedThreats").asInt(), section.path("overdue").asInt(), section.path("dueSoon").asInt());
        assertEquals(expected, actual);
    }

    private static void assertSammSection(JsonNode section, JsonNode scopes) {
        var list = scopes.path("scopes");
        int withoutRelease = 0;
        int open = 0;
        List<String> latest = new ArrayList<>();
        for (var scope : list) {
            withoutRelease += scope.path("latest").isNull() ? 1 : 0;
            open += scope.path("open").isNull() ? 0 : 1;
            if (!scope.path("latest").isNull()) {
                latest.add(scope.path("id").asText() + "/" + scope.path("latest").path("assessment").asText() + "/"
                        + scope.path("latest").path("overall").asDouble());
            }
        }
        List<String> shown = new ArrayList<>();
        for (var item : section.path("latest")) {
            shown.add(item.path("scope").asText() + "/" + item.path("assessment").asText() + "/"
                    + item.path("overall").asDouble());
        }
        int finalWithoutRelease = withoutRelease;
        int finalOpen = open;
        assertAll(
                () -> assertEquals(list.size(), section.path("scopes").asInt()),
                () -> assertEquals(finalWithoutRelease, section.path("withoutRelease").asInt()),
                () -> assertEquals(finalOpen, section.path("open").asInt()),
                () -> assertEquals(latest, shown));
    }

    @Nested
    @DisplayName("the dashboard summary")
    class Summary {

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only", "degraded"})
        @DisplayName("workshop, read-only and degraded answer the three sections with the counts of the contract, which the reports confirm")
        void shouldAnswerTheThreeSections(String profile) {
            try (var client = start(profile)) {
                var summary = get(client, REPORTS + "summary");
                var scopes = get(client, SAMM + "scopes");
                var evaluation = get(client, REPORTS + "threat-evaluation");
                var risks = register(client, null);
                assertAll(
                        () -> assertEquals(List.of("today", "samm", "threatModels", "risks"), fieldNames(summary)),
                        () -> assertEquals("2026-11-26", summary.path("today").asText()),
                        () -> assertEquals(4, summary.path("samm").path("scopes").asInt()),
                        () -> assertEquals(1, summary.path("samm").path("withoutRelease").asInt()),
                        () -> assertEquals(2, summary.path("samm").path("open").asInt()),
                        () -> assertEquals(List.of("payments", "shop", "organisation"),
                                column(summary.path("samm").path("latest"), "scope")),
                        () -> assertEquals(0.3999999999999998, summary.path("samm").path("latest").get(0).path("change").asDouble()),
                        () -> assertTrue(summary.path("samm").path("latest").get(1).path("change").isNull()),
                        () -> assertTrue(summary.path("samm").path("latest").get(2).path("change").isNull()),
                        () -> assertSammSection(summary.path("samm"), scopes),
                        () -> assertEquals(8, summary.path("threatModels").path("services").asInt()),
                        () -> assertEquals(13, summary.path("threatModels").path("openThreats").asInt()),
                        () -> assertEquals(10, summary.path("threatModels").path("untreatedThreats").asInt()),
                        () -> assertThreatSection(summary.path("threatModels"), evaluation),
                        () -> assertEquals(7, summary.path("risks").path("entries").asInt()),
                        () -> assertEquals(1, summary.path("risks").path("dueSoon").asInt()),
                        () -> assertEquals(1, summary.path("risks").path("overdue").asInt()),
                        () -> assertEquals("2026-11-12T10:41:00Z", summary.path("risks").path("latestRelease").asText()),
                        () -> assertRisksSection(summary.path("risks"), risks.path("risks")));
            }
        }

        @Test
        @DisplayName("local answers the same summary")
        void shouldAnswerLocal() {
            try (var client = MockClient.start("local").loginLocal("alex", "local-password")) {
                assertAll(
                        () -> assertEquals(data("reports-summary-workshop.json"), get(client, REPORTS + "summary")),
                        () -> assertEquals(data("reports-samm-trend.json"), get(client, REPORTS + "samm-trend")),
                        () -> assertEquals(data("reports-threat-evaluation.json"), get(client, REPORTS + "threat-evaluation")),
                        () -> assertEquals(200, client.get(RISKS + "?as-of=2026-03-01").statusCode()));
            }
        }

        @Test
        @DisplayName("release has no threatModels section (no right on threat-models); the evaluation is 403 FORBIDDEN; the trend and the register answer")
        void shouldLeaveOutTheThreatModelsForRelease() {
            try (var client = start("release")) {
                var summary = get(client, REPORTS + "summary");
                var evaluation = client.get(REPORTS + "threat-evaluation");
                assertAll(
                        () -> assertEquals(List.of("today", "samm", "risks"), fieldNames(summary)),
                        () -> assertEquals(4, summary.path("samm").path("scopes").asInt()),
                        () -> assertEquals(7, summary.path("risks").path("entries").asInt()),
                        () -> assertEquals(403, evaluation.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(evaluation).path("outcome").asText()),
                        () -> assertEquals(4, get(client, REPORTS + "samm-trend").path("scopes").size()),
                        () -> assertEquals(7, register(client, null).path("risks").size()),
                        () -> assertEquals(4, register(client, "2026-06-30").path("risks").size()));
            }
        }

        @Test
        @DisplayName("release: released and released-meanwhile show the third point and one open assessment less, review brings the base back")
        void shouldFollowTheReleaseOfTheAssessment() {
            try (var client = start("release")) {
                var before = get(client, REPORTS + "summary");
                var trendBefore = get(client, REPORTS + "samm-trend");
                goTo(client, "released");
                var released = get(client, REPORTS + "summary");
                var trendReleased = get(client, REPORTS + "samm-trend");
                goTo(client, "review");
                goTo(client, "released-meanwhile");
                var meanwhile = get(client, REPORTS + "summary");
                assertAll(
                        () -> assertEquals(2, before.path("samm").path("open").asInt()),
                        () -> assertEquals(2, trendBefore.path("scopes").get(0).path("points").size()),
                        () -> assertEquals(1, released.path("samm").path("open").asInt()),
                        () -> assertEquals("2026-q4", released.path("samm").path("latest").get(0).path("assessment").asText()),
                        () -> assertEquals(1.65, released.path("samm").path("latest").get(0).path("overall").asDouble()),
                        () -> assertEquals(0.29166666666666674, released.path("samm").path("latest").get(0).path("change").asDouble()),
                        () -> assertFalse(released.has("threatModels")),
                        () -> assertEquals(3, trendReleased.path("scopes").get(0).path("points").size()),
                        () -> assertEquals(released, meanwhile));
            }
        }
    }

    @Nested
    @DisplayName("the trend of every scope")
    class Trend {

        @Test
        @DisplayName("the scopes are in the order of the scope list, the points are the ones of the request of each scope without practices")
        void shouldAnswerTheScopesInOrder() {
            try (var client = start("workshop")) {
                var report = get(client, REPORTS + "samm-trend").path("scopes");
                var list = get(client, SAMM + "scopes").path("scopes");
                assertAll(
                        () -> assertEquals(column(list, "id"), column(report, "scope")),
                        () -> assertEquals(SCOPES, column(report, "scope")),
                        () -> SCOPES.forEach(scope -> {
                            var own = get(client, SAMM + scope + "/trend");
                            var shown = report.get(SCOPES.indexOf(scope));
                            assertEquals(List.of("scope", "title", "subject", "modelVersion", "omitted", "points"),
                                    fieldNames(shown), scope);
                            assertEquals(own.path("modelVersion"), shown.path("modelVersion"), scope);
                            assertEquals(own.path("omitted"), shown.path("omitted"), scope);
                            assertEquals(own.path("points").size(), shown.path("points").size(), scope);
                            for (int i = 0; i < own.path("points").size(); i++) {
                                var point = shown.path("points").get(i);
                                var source = own.path("points").get(i);
                                assertEquals(List.of("assessment", "document", "title", "date", "overall", "functions"),
                                        fieldNames(point), scope);
                                assertFalse(point.has("practices"), scope);
                                assertEquals(source.path("overall").asDouble(), point.path("overall").asDouble(), 0, scope);
                                assertEquals(FUNCTIONS, fieldNames(point.path("functions")), scope);
                                double sum = 0;
                                for (var function : FUNCTIONS) {
                                    assertEquals(source.path("functions").path(function).asDouble(),
                                            point.path("functions").path(function).asDouble(), 0, scope + "/" + function);
                                    sum += point.path("functions").path(function).asDouble();
                                }
                                assertEquals(point.path("overall").asDouble(), sum / FUNCTIONS.size(), TOLERANCE, scope);
                            }
                        }));
            }
        }

        @Test
        @DisplayName("identity has no point and no model version; the others are v2.2.0 with nothing omitted; the subject of a scope is that of the scope list")
        void shouldListTheScopeWithoutRelease() {
            try (var client = start("workshop")) {
                var report = get(client, REPORTS + "samm-trend").path("scopes");
                var list = get(client, SAMM + "scopes").path("scopes");
                assertAll(
                        () -> assertEquals(0, report.get(1).path("points").size()),
                        () -> assertTrue(report.get(1).path("modelVersion").isNull()),
                        () -> assertEquals(List.of("2", "0", "1", "1"), points(report)),
                        () -> assertEquals(List.of("v2.2.0", "", "v2.2.0", "v2.2.0"), column(report, "modelVersion").stream()
                                .map(v -> "null".equals(v) ? "" : v).toList()),
                        () -> assertEquals(List.of("0", "0", "0", "0"), column(report, "omitted")),
                        () -> SCOPES.forEach(scope -> {
                            int index = SCOPES.indexOf(scope);
                            assertEquals(list.get(index).path("subject"), report.get(index).path("subject"), scope);
                            assertEquals(list.get(index).path("title"), report.get(index).path("title"), scope);
                        }));
            }
        }

        @Test
        @DisplayName("read-only answers the same trend; empty answers no scope")
        void shouldAnswerReadOnlyAndEmpty() {
            try (var client = start("read-only")) {
                assertEquals(data("reports-samm-trend.json"), get(client, REPORTS + "samm-trend"));
            }
            try (var client = start("empty")) {
                var report = get(client, REPORTS + "samm-trend");
                assertAll(
                        () -> assertEquals(0, report.path("scopes").size()),
                        () -> assertTrue(report.path("scopes").isArray()));
            }
        }

        @Test
        @DisplayName("scope-created adds Mobile Apps last, without point and model version, and the summary counts five scopes")
        void shouldAddTheCreatedScope() {
            try (var client = start("workshop")) {
                var created = client.change("POST", SAMM + "scopes", "{}");
                var report = get(client, REPORTS + "samm-trend").path("scopes");
                var summary = get(client, REPORTS + "summary");
                var scopes = get(client, SAMM + "scopes");
                assertAll(
                        () -> assertEquals(201, created.statusCode()),
                        () -> assertEquals(5, report.size()),
                        () -> assertEquals("mobile", report.get(4).path("scope").asText()),
                        () -> assertEquals("Mobile Apps", report.get(4).path("title").asText()),
                        () -> assertEquals("team", report.get(4).path("subject").path("kind").asText()),
                        () -> assertEquals("mobile", report.get(4).path("subject").path("id").asText()),
                        () -> assertTrue(report.get(4).path("modelVersion").isNull()),
                        () -> assertEquals(0, report.get(4).path("points").size()),
                        () -> assertEquals(5, summary.path("samm").path("scopes").asInt()),
                        () -> assertEquals(2, summary.path("samm").path("withoutRelease").asInt()),
                        () -> assertSammSection(summary.path("samm"), scopes),
                        () -> assertEquals(data("reports-samm-trend-scope-created.json").path("scopes").size(), report.size()));
            }
        }

        @Test
        @DisplayName("shop-assessment-created and organisation-assessment-created count three open assessments")
        void shouldCountTheCreatedAssessments() {
            for (var create : List.of("shop", "organisation")) {
                try (var client = start("workshop")) {
                    assertEquals(201, client.change("POST", SAMM + create + "/assessments", "{}").statusCode());
                    var summary = get(client, REPORTS + "summary");
                    assertAll(create,
                            () -> assertEquals(3, summary.path("samm").path("open").asInt()),
                            () -> assertEquals(4, summary.path("samm").path("scopes").asInt()),
                            () -> assertSammSection(summary.path("samm"), get(client, SAMM + "scopes")));
                }
            }
        }

        @Test
        @DisplayName("assessment-released-meanwhile: the trend has Payments 2026 Q4 as third point, the summary one open assessment and the new latest")
        void shouldShowTheReleasedAssessment() {
            try (var client = start("workshop")) {
                goTo(client, "assessment-released-meanwhile");
                var report = get(client, REPORTS + "samm-trend").path("scopes");
                var summary = get(client, REPORTS + "summary");
                var own = get(client, SAMM + "payments/trend");
                assertAll(
                        () -> assertEquals(3, report.get(0).path("points").size()),
                        () -> assertEquals("2026-q4", report.get(0).path("points").get(2).path("assessment").asText()),
                        () -> assertEquals(own.path("points").get(2).path("overall").asDouble(),
                                report.get(0).path("points").get(2).path("overall").asDouble(), 0),
                        () -> assertEquals(1, summary.path("samm").path("open").asInt()),
                        () -> assertEquals("2026-q4", summary.path("samm").path("latest").get(0).path("assessment").asText()),
                        () -> assertEquals("2026-11-24", summary.path("samm").path("latest").get(0).path("date").asText()),
                        () -> assertEquals(1.65, summary.path("samm").path("latest").get(0).path("overall").asDouble()),
                        () -> assertEquals(0.29166666666666674, summary.path("samm").path("latest").get(0).path("change").asDouble()),
                        () -> assertEquals(3, summary.path("samm").path("latest").size()),
                        () -> assertSammSection(summary.path("samm"), get(client, SAMM + "scopes")),
                        () -> assertEquals(8, summary.path("threatModels").path("services").asInt()));
            }
        }

        @Test
        @DisplayName("trend-mixed-models: Payments v2.2.0 with one point and one omitted, Web shop v2.1.0; every other report is as in ready")
        void shouldShowMixedModels() {
            try (var client = start("workshop")) {
                goTo(client, "trend-mixed-models");
                var report = get(client, REPORTS + "samm-trend").path("scopes");
                assertAll(
                        () -> assertEquals("v2.2.0", report.get(0).path("modelVersion").asText()),
                        () -> assertEquals(1, report.get(0).path("omitted").asInt()),
                        () -> assertEquals(1, report.get(0).path("points").size()),
                        () -> assertEquals("2026-q2", report.get(0).path("points").get(0).path("assessment").asText()),
                        () -> assertEquals("v2.1.0", report.get(2).path("modelVersion").asText()),
                        () -> assertEquals(1, report.get(2).path("points").size()),
                        () -> assertEquals(0, report.get(2).path("omitted").asInt()),
                        () -> assertEquals("v2.2.0", report.get(3).path("modelVersion").asText()),
                        () -> assertTrue(report.get(1).path("modelVersion").isNull()),
                        () -> assertEquals(data("reports-summary-workshop.json"), get(client, REPORTS + "summary")),
                        () -> assertEquals(data("reports-threat-evaluation.json"), get(client, REPORTS + "threat-evaluation")));
            }
        }
    }

    @Nested
    @DisplayName("the comparison pair of the report page")
    class Compare {

        private static final String PAIR = SAMM + "payments/compare?from=2025-q4&to=2026-q2";

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only", "release", "degraded"})
        @DisplayName("the pair 2025-q4 to 2026-q2 answers its own file with delta = to - from everywhere; the other pair keeps the keyless answer")
        void shouldAnswerThePair(String profile) {
            try (var client = start(profile)) {
                var pair = get(client, PAIR);
                var other = get(client, SAMM + "payments/compare?from=2026-q2&to=2026-q4");
                assertAll(
                        () -> assertEquals("2025-q4", pair.path("from").asText()),
                        () -> assertEquals("2026-q2", pair.path("to").asText()),
                        () -> assertEquals("v2.2.0", pair.path("modelVersion").asText()),
                        () -> assertEquals(0.9583333333333334, pair.path("overall").path("from").asDouble()),
                        () -> assertEquals(1.3583333333333332, pair.path("overall").path("to").asDouble()),
                        () -> assertEquals(0.3999999999999998, pair.path("overall").path("delta").asDouble()),
                        () -> assertDeltas(pair),
                        () -> assertEquals("2026-q4", other.path("to").asText()));
            }
        }

        @Test
        @DisplayName("local answers the pair too")
        void shouldAnswerLocal() {
            try (var client = MockClient.start("local").loginLocal("alex", "local-password")) {
                assertEquals(data("samm-compare-payments-2025-q4-2026-q2.json"), get(client, PAIR));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only", "release", "degraded"})
        @DisplayName("an unknown from is 404 NOT_FOUND whatever to is")
        void shouldAnswerNotFound(String profile) {
            try (var client = start(profile)) {
                var response = client.get(SAMM + "payments/compare?from=nope&to=2026-q4");
                assertAll(
                        () -> assertEquals(404, response.statusCode()),
                        () -> assertEquals("NOT_FOUND", json(response).path("outcome").asText()),
                        () -> assertEquals(404, client.get(SAMM + "payments/compare?from=nope&to=2026-q2").statusCode()));
            }
        }

        @Test
        @DisplayName("model-versions-differ answers every pair 422 MODEL_VERSIONS_DIFFER: the state's keyless route is looked up before the keys of the scenario")
        void shouldAnswerEveryPairInModelVersionsDiffer() {
            try (var client = start("workshop")) {
                goTo(client, "model-versions-differ");
                var flow = client.get(SAMM + "payments/compare?from=2026-q2&to=2026-q4");
                var page = client.get(PAIR);
                assertAll(
                        () -> assertEquals(422, flow.statusCode()),
                        () -> assertEquals("MODEL_VERSIONS_DIFFER", json(flow).path("outcome").asText()),
                        () -> assertEquals(422, page.statusCode()),
                        () -> assertEquals(json(flow), json(page)),
                        () -> assertEquals(422, client.get(SAMM + "payments/compare?from=nope&to=2026-q4").statusCode()));
            }
        }

        @Test
        @DisplayName("one function score of the file is computed from the two assessments and the model")
        void shouldRecomputeAFunctionScore() {
            var pair = data("samm-compare-payments-2025-q4-2026-q2.json");
            var model = data("samm-model-v2.2.0.json");
            var from = data("samm-assessment-payments-2025-q4.json").path("answers");
            var to = data("samm-assessment-payments-2026-q2.json").path("answers");
            var verification = pair.path("functions").get(3);
            var function = model.path("functions").get(3);
            assertAll(
                    () -> assertEquals("verification", verification.path("id").asText()),
                    () -> assertEquals("verification", function.path("id").asText()),
                    () -> assertEquals(functionScore(function, from), verification.path("from").asDouble(), TOLERANCE),
                    () -> assertEquals(functionScore(function, to), verification.path("to").asDouble(), TOLERANCE),
                    () -> assertEquals(functionScore(function, to) - functionScore(function, from),
                            verification.path("delta").asDouble(), TOLERANCE));
        }
    }

    /** The score of a function: the average of its practices, each the average of its two stream sums. */
    private static double functionScore(JsonNode function, JsonNode answers) {
        double total = 0;
        for (var practice : function.path("practices")) {
            double streams = 0;
            for (var stream : practice.path("streams")) {
                double sum = 0;
                for (var question : stream.path("questions")) {
                    var answer = answers.path(practice.path("id").asText()).path(question.path("id").asText()).path("answer");
                    sum += answer.isNumber() ? answer.asDouble() : 0;
                }
                streams += sum;
            }
            total += streams / practice.path("streams").size();
        }
        return total / function.path("practices").size();
    }

    private static void assertDeltas(JsonNode pair) {
        assertEquals(pair.path("overall").path("to").asDouble() - pair.path("overall").path("from").asDouble(),
                pair.path("overall").path("delta").asDouble(), TOLERANCE);
        for (var function : pair.path("functions")) {
            assertEquals(function.path("to").asDouble() - function.path("from").asDouble(), function.path("delta").asDouble(),
                    TOLERANCE, function.path("id").asText());
            for (var practice : function.path("practices")) {
                assertEquals(practice.path("to").asDouble() - practice.path("from").asDouble(),
                        practice.path("delta").asDouble(), TOLERANCE, practice.path("id").asText());
                for (var stream : practice.path("streams")) {
                    assertEquals(stream.path("to").asDouble() - stream.path("from").asDouble(),
                            stream.path("delta").asDouble(), TOLERANCE, practice.path("id").asText() + stream.path("letter").asText());
                }
            }
        }
    }

    /** The date columns of a row recomputed from the last review and the interval. */
    private static void assertRowDates(JsonNode row) {
        String service = row.path("service").path("id").asText();
        var interval = Period.parse(row.path("reviewInterval").asText());
        var expectedInterval = switch (row.path("protectionNeed").asText()) {
            case "very-high" -> Period.ofMonths(6);
            case "high" -> Period.ofMonths(12);
            default -> Period.ofMonths(24);
        };
        assertEquals(expectedInterval, interval, service);
        assertTrue(row.path("threats").path("untreated").asInt() <= row.path("threats").path("open").asInt(), service);
        assertTrue(row.path("threats").path("open").asInt() <= row.path("threats").path("total").asInt(), service);
        if (row.path("lastReview").isNull()) {
            assertAll(service,
                    () -> assertEquals("unreleased", row.path("status").asText()),
                    () -> assertTrue(row.path("version").isNull()),
                    () -> assertTrue(row.path("daysSinceReview").isNull()),
                    () -> assertTrue(row.path("reviewDue").isNull()),
                    () -> assertTrue(row.path("dueInDays").isNull()));
            return;
        }
        var last = LocalDate.parse(row.path("lastReview").asText());
        var due = last.plus(interval);
        long dueIn = ChronoUnit.DAYS.between(TODAY, due);
        String status = dueIn < 0 ? "overdue" : dueIn <= 30 ? "due-soon" : "ok";
        assertAll(service,
                () -> assertEquals(ChronoUnit.DAYS.between(last, TODAY), row.path("daysSinceReview").asLong()),
                () -> assertEquals(due.toString(), row.path("reviewDue").asText()),
                () -> assertEquals(dueIn, row.path("dueInDays").asLong()),
                () -> assertEquals(status, row.path("status").asText()),
                () -> assertTrue(row.path("version").asInt() >= 1));
    }

    @Nested
    @DisplayName("the threat evaluation")
    class Evaluation {

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only", "degraded"})
        @DisplayName("six rows ordered by review due with the date columns of the contract; two services without a model; the retired service is in neither list")
        void shouldAnswerTheSixRows(String profile) {
            try (var client = start(profile)) {
                var evaluation = get(client, REPORTS + "threat-evaluation");
                var models = evaluation.path("models");
                assertAll(
                        () -> assertEquals(List.of("today", "models", "withoutModel"), fieldNames(evaluation)),
                        () -> assertEquals("2026-11-26", evaluation.path("today").asText()),
                        () -> assertEquals(List.of("customer-portal", "identity-provider", "payment-api", "reporting",
                                "customer-db", "notification-service"), serviceIds(models)),
                        () -> assertEquals(List.of("overdue", "overdue", "due-soon", "ok", "ok", "unreleased"),
                                column(models, "status")),
                        () -> assertEquals(List.of("-177", "-43", "5", "104", "123", "null"), column(models, "dueInDays")
                                .stream().map(v -> v.isEmpty() ? "null" : v).toList()),
                        () -> assertEquals(List.of("/threat-models/customer-portal/portal",
                                "/threat-models/identity-provider/login-flow", "/threat-models/payment-api/checkout-flow",
                                "/threat-models/reporting/report-generation", "/threat-models/customer-db/storage",
                                "/threat-models/notification-service/notification-flows"), column(models, "address")),
                        () -> models.forEach(row -> assertEquals(List.of("service", "protectionNeed", "reviewInterval", "model",
                                "address", "state", "version", "lastReview", "daysSinceReview", "reviewDue", "dueInDays", "status",
                                "threats"), fieldNames(row))),
                        () -> models.forEach(ReportsLensTest::assertRowDates),
                        () -> assertEquals(List.of("notification-gateway", "report-scheduler"),
                                serviceIds(evaluation.path("withoutModel"))),
                        () -> assertEquals(List.of("service", "lifecycle", "owner", "protectionNeed", "address"),
                                fieldNames(evaluation.path("withoutModel").get(0))),
                        () -> assertEquals("planned", evaluation.path("withoutModel").get(0).path("lifecycle").asText()),
                        () -> assertEquals("mobile", evaluation.path("withoutModel").get(0).path("owner").path("id").asText()),
                        () -> assertEquals("Mobile Apps", evaluation.path("withoutModel").get(0).path("owner").path("name").asText()),
                        () -> assertEquals("active", evaluation.path("withoutModel").get(1).path("lifecycle").asText()),
                        () -> assertEquals("security-office", evaluation.path("withoutModel").get(1).path("owner").path("id").asText()),
                        () -> assertFalse(evaluation.toString().contains("\"ledger\"")),
                        () -> assertEquals("/threat-models/report-scheduler",
                                evaluation.path("withoutModel").get(1).path("address").asText()));
            }
        }

        @Test
        @DisplayName("the six model addresses and the addresses of the services without a model are canonical addresses")
        void shouldAnswerCanonicalAddresses() {
            try (var client = start("workshop")) {
                var evaluation = get(client, REPORTS + "threat-evaluation");
                evaluation.path("models").forEach(row -> assertCanonical(row.path("address").asText()));
                evaluation.path("withoutModel").forEach(row -> assertCanonical(row.path("address").asText()));
                assertCanonical("/reports");
                assertCanonical("/reports/samm-trend");
                assertCanonical("/reports/samm-compare");
                assertCanonical("/reports/threat-evaluation");
                assertCanonical("/reports/risk-register");
            }
        }

        @Test
        @DisplayName("the threats of payment-api reproduce what Step 7 has to build: 9 in all, 3 open, 2 untreated, 1 transferred")
        void shouldFixThePaymentApiFigures() {
            try (var client = start("workshop")) {
                var row = get(client, REPORTS + "threat-evaluation").path("models").get(2);
                assertAll(
                        () -> assertEquals("payment-api", row.path("service").path("id").asText()),
                        () -> assertEquals("Payment API", row.path("service").path("name").asText()),
                        () -> assertEquals(9, row.path("threats").path("total").asInt()),
                        () -> assertEquals(3, row.path("threats").path("open").asInt()),
                        () -> assertEquals(2, row.path("threats").path("untreated").asInt()),
                        () -> assertEquals(1, row.path("threats").path("transferred").asInt()));
            }
        }

        @Test
        @DisplayName("no-threat-models lists no model and the eight services, the very-high ones first; the summary counts them")
        void shouldAnswerNoThreatModels() {
            try (var client = start("workshop")) {
                goTo(client, "no-threat-models");
                var evaluation = get(client, REPORTS + "threat-evaluation");
                var summary = get(client, REPORTS + "summary");
                var without = evaluation.path("withoutModel");
                assertAll(
                        () -> assertEquals(0, evaluation.path("models").size()),
                        () -> assertEquals(8, without.size()),
                        () -> assertEquals(List.of("very-high", "very-high", "very-high", "very-high", "normal", "normal",
                                "normal", "normal"), column(without, "protectionNeed")),
                        () -> assertEquals(List.of("customer-db", "customer-portal", "identity-provider", "payment-api",
                                "notification-gateway", "notification-service", "report-scheduler", "reporting"),
                                serviceIds(without)),
                        () -> assertThreatSection(summary.path("threatModels"), evaluation),
                        () -> assertEquals(0, summary.path("threatModels").path("withModel").asInt()),
                        () -> assertEquals(8, summary.path("threatModels").path("withoutModel").asInt()),
                        () -> assertEquals(7, summary.path("risks").path("entries").asInt()));
            }
        }

        @Test
        @DisplayName("empty answers no model and no service")
        void shouldAnswerEmpty() {
            try (var client = start("empty")) {
                var evaluation = get(client, REPORTS + "threat-evaluation");
                assertAll(
                        () -> assertEquals("2026-11-26", evaluation.path("today").asText()),
                        () -> assertEquals(0, evaluation.path("models").size()),
                        () -> assertTrue(evaluation.path("models").isArray()),
                        () -> assertEquals(0, evaluation.path("withoutModel").size()),
                        () -> assertTrue(evaluation.path("withoutModel").isArray()));
            }
        }
    }

    @Nested
    @DisplayName("the risk register as of a date")
    class Register {

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only", "release", "degraded"})
        @DisplayName("as of now seven risks in the order of the number, requested null, today as the date, and the two tags newest first")
        void shouldAnswerAsOfNow(String profile) {
            try (var client = start(profile)) {
                var answer = register(client, null);
                var risks = answer.path("risks");
                assertAll(
                        () -> assertEquals(List.of("asOf", "tags", "risks"), fieldNames(answer)),
                        () -> assertEquals(List.of("requested", "date", "tag", "commit", "at"), fieldNames(answer.path("asOf"))),
                        () -> assertTrue(answer.path("asOf").path("requested").isNull()),
                        () -> assertEquals("2026-11-26", answer.path("asOf").path("date").asText()),
                        () -> assertTrue(answer.path("asOf").path("tag").isNull()),
                        () -> assertEquals("e41c9a7", answer.path("asOf").path("commit").asText()),
                        () -> assertEquals(List.of("management-review-2026-06", "audit-2026-03"),
                                column(answer.path("tags"), "tag")),
                        () -> assertEquals(List.of("b81d4e6", "3f9a1c2"), column(answer.path("tags"), "commit")),
                        () -> assertEquals(List.of("2026-06-18T13:05:00Z", "2026-02-27T16:20:00Z"),
                                column(answer.path("tags"), "at")),
                        () -> assertEquals(List.of("R-004", "R-007", "R-009", "R-012", "R-015", "R-018", "R-021"), ids(risks)),
                        () -> assertEquals(List.of("id", "entry", "title", "rating", "treatment", "owner", "version", "releasedAt",
                                "reviewDue", "reference", "address"), fieldNames(risks.get(0))),
                        () -> risks.forEach(risk -> assertEquals("/isms/risks/" + risk.path("entry").asText(),
                                risk.path("address").asText())),
                        () -> risks.forEach(risk -> assertEquals("team", risk.path("owner").path("kind").asText())),
                        () -> assertEquals("critical", risks.get(2).path("rating").asText()),
                        () -> assertEquals("/threat-models/payment-api/checkout-flow",
                                risks.get(2).path("reference").path("address").asText()),
                        () -> assertEquals("/samm/payments/2026-q2/st", risks.get(4).path("reference").path("address").asText()),
                        () -> assertTrue(risks.get(0).path("reference").isNull()));
            }
        }

        @Test
        @DisplayName("the date 2026-03-01 and the tag audit-2026-03 read the same three risks at the commit 3f9a1c2; the tag one carries the tag")
        void shouldReadMarch() {
            try (var client = start("workshop")) {
                var byDate = register(client, "2026-03-01");
                var byTag = register(client, "audit-2026-03");
                assertAll(
                        () -> assertEquals(List.of("R-004", "R-007", "R-012"), ids(byDate.path("risks"))),
                        () -> assertEquals(byDate.path("risks"), byTag.path("risks")),
                        () -> assertEquals("2026-03-01", byDate.path("asOf").path("requested").asText()),
                        () -> assertEquals("2026-03-01", byDate.path("asOf").path("date").asText()),
                        () -> assertTrue(byDate.path("asOf").path("tag").isNull()),
                        () -> assertEquals("3f9a1c2", byDate.path("asOf").path("commit").asText()),
                        () -> assertEquals("2026-02-27T16:20:00Z", byDate.path("asOf").path("at").asText()),
                        () -> assertEquals("audit-2026-03", byTag.path("asOf").path("requested").asText()),
                        () -> assertEquals("audit-2026-03", byTag.path("asOf").path("tag").asText()),
                        () -> assertEquals("2026-02-27", byTag.path("asOf").path("date").asText()),
                        () -> assertEquals("3f9a1c2", byTag.path("asOf").path("commit").asText()),
                        () -> assertEquals(byDate.path("tags"), register(client, null).path("tags")),
                        () -> assertEquals(List.of("1", "1", "1"), column(byDate.path("risks"), "version")));
            }
        }

        @Test
        @DisplayName("the date 2026-06-30 and the tag management-review-2026-06 read the same four risks at the commit b81d4e6")
        void shouldReadJune() {
            try (var client = start("workshop")) {
                var byDate = register(client, "2026-06-30");
                var byTag = register(client, "management-review-2026-06");
                assertAll(
                        () -> assertEquals(List.of("R-004", "R-007", "R-009", "R-012"), ids(byDate.path("risks"))),
                        () -> assertEquals(byDate.path("risks"), byTag.path("risks")),
                        () -> assertEquals("b81d4e6", byDate.path("asOf").path("commit").asText()),
                        () -> assertEquals("2026-06-18T13:05:00Z", byDate.path("asOf").path("at").asText()),
                        () -> assertEquals("management-review-2026-06", byTag.path("asOf").path("tag").asText()),
                        () -> assertEquals("2026-06-18", byTag.path("asOf").path("date").asText()),
                        () -> assertEquals(List.of("2", "1", "1", "1"), column(byDate.path("risks"), "version")),
                        () -> assertEquals("high", byDate.path("risks").get(2).path("rating").asText()),
                        () -> assertEquals("/threat-models/payment-api/checkout-flow",
                                byDate.path("risks").get(2).path("reference").path("address").asText()));
            }
        }

        @Test
        @DisplayName("a date before the first commit lists nothing and has no commit; the tags are still offered")
        void shouldReadBeforeTheFirstCommit() {
            try (var client = start("workshop")) {
                var answer = register(client, "2025-06-01");
                assertAll(
                        () -> assertEquals(0, answer.path("risks").size()),
                        () -> assertTrue(answer.path("risks").isArray()),
                        () -> assertTrue(answer.path("asOf").path("commit").isNull()),
                        () -> assertTrue(answer.path("asOf").path("at").isNull()),
                        () -> assertEquals("2025-06-01", answer.path("asOf").path("requested").asText()),
                        () -> assertEquals(2, answer.path("tags").size()));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only", "release", "degraded"})
        @DisplayName("FUTURE, PATTERN and UNKNOWN_TAG are 422 VALIDATION with the pointer /as-of")
        void shouldRefuseTheValues(String profile) {
            try (var client = start(profile)) {
                var future = client.get(RISKS + "?as-of=2027-01-01");
                var pattern = client.get(RISKS + "?as-of=2026-13-45");
                var unknown = client.get(RISKS + "?as-of=no-such-tag");
                assertAll(
                        () -> List.of(future, pattern, unknown).forEach(response -> {
                            assertEquals(422, response.statusCode());
                            assertEquals("VALIDATION", json(response).path("outcome").asText());
                            assertEquals(1, json(response).path("errors").size());
                            assertEquals("/as-of", pointer(json(response)));
                        }),
                        () -> assertEquals("FUTURE", code(json(future))),
                        () -> assertEquals("PATTERN", code(json(pattern))),
                        () -> assertEquals("UNKNOWN_TAG", code(json(unknown))));
            }
        }

        @Test
        @DisplayName("a past read pins every address to the version it shows (?at=v<n>), the read as of now carries none; every address and reference is canonical")
        void shouldMarkTheOlderVersions() {
            try (var client = start("workshop")) {
                Map<String, Integer> newest = new LinkedHashMap<>();
                register(client, null).path("risks").forEach(risk -> newest.put(risk.path("entry").asText(), risk.path("version").asInt()));
                List<String> asOf = List.of("2026-03-01", "audit-2026-03", "2026-06-30", "management-review-2026-06");
                for (var value : asOf) {
                    for (var risk : register(client, value).path("risks")) {
                        String entry = risk.path("entry").asText();
                        int version = risk.path("version").asInt();
                        assertTrue(version <= newest.get(entry), entry);
                        assertEquals("/isms/risks/" + entry + "?at=v" + version, risk.path("address").asText(), value + "/" + entry);
                        assertCanonical(risk.path("address").asText());
                        if (!risk.path("reference").isNull()) {
                            assertCanonical(risk.path("reference").path("address").asText());
                        }
                    }
                }
                var now = register(client, null).path("risks");
                now.forEach(risk -> assertEquals("/isms/risks/" + risk.path("entry").asText(), risk.path("address").asText()));
                now.forEach(risk -> assertCanonical(risk.path("address").asText()));
                now.forEach(risk -> assertTrue(risk.path("reference").isNull() || risk.path("reference").path("ref").asText().contains(":")));
                assertCanonical("/isms/risks/r-004");
            }
        }

        @Test
        @DisplayName("every commit is seven hexadecimal digits, every tag points at a commit the answers use")
        void shouldUseCommits() {
            try (var client = start("workshop")) {
                for (var value : new String[]{null, "2026-03-01", "2026-06-30", "audit-2026-03", "management-review-2026-06"}) {
                    var answer = register(client, value);
                    assertTrue(HEX7.matcher(answer.path("asOf").path("commit").asText()).matches(), String.valueOf(value));
                    answer.path("tags").forEach(tag -> assertTrue(HEX7.matcher(tag.path("commit").asText()).matches()));
                }
            }
        }

        @Test
        @DisplayName("any other value reads as of now, the date of the answer is today (a documented limit)")
        void shouldReadAnyOtherValueAsOfNow() {
            try (var client = start("workshop")) {
                var answer = register(client, "2026-09-01");
                assertAll(
                        () -> assertEquals(7, answer.path("risks").size()),
                        () -> assertEquals("2026-11-26", answer.path("asOf").path("date").asText()));
            }
        }

        @Test
        @DisplayName("risk-register-git-unavailable: the status is degraded, the four past commits answer 503 GIT_UNAVAILABLE, the register as of now and every other report answer 200")
        void shouldAnswerGitUnavailable() {
            try (var client = start("workshop")) {
                goTo(client, "risk-register-git-unavailable");
                var status = get(client, "/api/v1/status");
                assertAll(
                        () -> assertTrue(status.path("degraded").asBoolean()),
                        () -> assertEquals("DOWN", fetchOf(status, "isms-register")),
                        () -> assertEquals("UP", fetchOf(status, "samm-assessments")),
                        () -> List.of("2026-03-01", "audit-2026-03", "2026-06-30", "management-review-2026-06").forEach(value -> {
                            var response = client.get(RISKS + "?as-of=" + value);
                            assertEquals(503, response.statusCode(), value);
                            assertEquals("GIT_UNAVAILABLE", json(response).path("outcome").asText(), value);
                        }),
                        () -> assertEquals(200, client.get(RISKS).statusCode()),
                        () -> assertEquals(7, register(client, null).path("risks").size()),
                        () -> assertEquals(200, client.get(RISKS + "?as-of=2025-06-01").statusCode()),
                        () -> assertEquals(422, client.get(RISKS + "?as-of=2027-01-01").statusCode()),
                        () -> assertEquals(200, client.get(REPORTS + "summary").statusCode()),
                        () -> assertEquals(200, client.get(REPORTS + "samm-trend").statusCode()),
                        () -> assertEquals(200, client.get(REPORTS + "threat-evaluation").statusCode()));
            }
        }

        @Test
        @DisplayName("risk-register-empty: no risk as of now or any day, no tag, a name is UNKNOWN_TAG, the summary counts no risk")
        void shouldAnswerAnEmptyRegister() {
            try (var client = start("workshop")) {
                goTo(client, "risk-register-empty");
                var now = register(client, null);
                var march = register(client, "2026-03-01");
                var summary = get(client, REPORTS + "summary");
                var tag = client.get(RISKS + "?as-of=audit-2026-03");
                assertAll(
                        () -> assertEquals(0, now.path("risks").size()),
                        () -> assertEquals(0, now.path("tags").size()),
                        () -> assertTrue(now.path("asOf").path("commit").isNull()),
                        () -> assertEquals("2026-11-26", now.path("asOf").path("date").asText()),
                        () -> assertEquals(0, march.path("risks").size()),
                        () -> assertEquals("2026-03-01", march.path("asOf").path("requested").asText()),
                        () -> assertTrue(march.path("asOf").path("commit").isNull()),
                        () -> assertEquals(0, register(client, "2025-06-01").path("risks").size()),
                        () -> assertEquals(422, tag.statusCode()),
                        () -> assertEquals("UNKNOWN_TAG", code(json(tag))),
                        () -> assertEquals("FUTURE", code(json(client.get(RISKS + "?as-of=2027-01-01")))),
                        () -> assertEquals("PATTERN", code(json(client.get(RISKS + "?as-of=2026-13-45")))),
                        () -> assertRisksSection(summary.path("risks"), now.path("risks")),
                        () -> assertEquals(0, summary.path("risks").path("entries").asInt()),
                        () -> assertTrue(summary.path("risks").path("latestRelease").isNull()),
                        () -> assertEquals(13, summary.path("threatModels").path("openThreats").asInt()));
            }
        }

        @Test
        @DisplayName("degraded: the past commits answer 503 while unreachable, then 200 after recovered; now and the 422 values answer in both")
        void shouldFollowTheRecoveryOfDegraded() {
            var past = List.of("2026-03-01", "audit-2026-03", "2026-06-30", "management-review-2026-06");
            try (var client = start("degraded")) {
                List<Integer> before = past.stream().map(v -> client.get(RISKS + "?as-of=" + v).statusCode()).toList();
                var now = client.get(RISKS).statusCode();
                var future = client.get(RISKS + "?as-of=2027-01-01").statusCode();
                var summary = client.get(REPORTS + "summary").statusCode();
                var evaluation = client.get(REPORTS + "threat-evaluation").statusCode();
                goTo(client, "recovered");
                List<Integer> after = past.stream().map(v -> client.get(RISKS + "?as-of=" + v).statusCode()).toList();
                assertAll(
                        () -> assertEquals(List.of(503, 503, 503, 503), before),
                        () -> assertEquals(200, now),
                        () -> assertEquals(422, future),
                        () -> assertEquals(200, summary),
                        () -> assertEquals(200, evaluation),
                        () -> assertEquals(List.of(200, 200, 200, 200), after),
                        () -> assertEquals(3, register(client, "2026-03-01").path("risks").size()),
                        () -> assertEquals(422, client.get(RISKS + "?as-of=2026-13-45").statusCode()));
            }
        }

        @Test
        @DisplayName("release answers the register in every state")
        void shouldAnswerReleaseInEveryState() {
            try (var client = start("release")) {
                goTo(client, "released");
                assertEquals(7, register(client, null).path("risks").size());
            }
        }
    }

    @Nested
    @DisplayName("empty")
    class Empty {

        @Test
        @DisplayName("the summary is zeros, the chain scope-created to assessment-created adds one scope and one open assessment, the register and the evaluation are empty")
        void shouldRunTheEmptyChain() {
            try (var client = start("empty")) {
                var base = get(client, REPORTS + "summary");
                var scopeCreated = client.change("POST", SAMM + "scopes", "{}");
                var afterScope = get(client, REPORTS + "summary");
                var trendAfterScope = get(client, REPORTS + "samm-trend");
                var assessment = client.change("POST", SAMM + "mobile/assessments", "{}");
                var afterAssessment = get(client, REPORTS + "summary");
                var trendAfterAssessment = get(client, REPORTS + "samm-trend");
                assertAll(
                        () -> assertEquals(List.of("today", "samm", "threatModels", "risks"), fieldNames(base)),
                        () -> assertEquals(0, base.path("samm").path("scopes").asInt()),
                        () -> assertEquals(0, base.path("samm").path("latest").size()),
                        () -> assertTrue(base.path("samm").path("latest").isArray()),
                        () -> base.path("threatModels").forEach(value -> assertEquals(0, value.asInt())),
                        () -> assertEquals(7, base.path("threatModels").size()),
                        () -> assertEquals(0, base.path("risks").path("entries").asInt()),
                        () -> assertTrue(base.path("risks").path("latestRelease").isNull()),
                        () -> assertEquals(0, register(client, null).path("risks").size()),
                        () -> assertEquals(0, register(client, null).path("tags").size()),
                        () -> assertEquals(201, scopeCreated.statusCode()),
                        () -> assertEquals(1, afterScope.path("samm").path("scopes").asInt()),
                        () -> assertEquals(1, afterScope.path("samm").path("withoutRelease").asInt()),
                        () -> assertEquals(0, afterScope.path("samm").path("open").asInt()),
                        () -> assertEquals(List.of("mobile"), column(trendAfterScope.path("scopes"), "scope")),
                        () -> assertEquals(0, trendAfterScope.path("scopes").get(0).path("points").size()),
                        () -> assertTrue(trendAfterScope.path("scopes").get(0).path("modelVersion").isNull()),
                        () -> assertEquals(201, assessment.statusCode()),
                        () -> assertEquals(1, afterAssessment.path("samm").path("scopes").asInt()),
                        () -> assertEquals(1, afterAssessment.path("samm").path("withoutRelease").asInt()),
                        () -> assertEquals(1, afterAssessment.path("samm").path("open").asInt()),
                        () -> assertEquals(trendAfterScope, trendAfterAssessment),
                        () -> List.of("2026-03-01", "2025-06-01").forEach(value -> {
                            var answer = register(client, value);
                            assertEquals(0, answer.path("risks").size(), value);
                            assertEquals(value, answer.path("asOf").path("requested").asText(), value);
                            assertTrue(answer.path("asOf").path("commit").isNull(), value);
                        }),
                        () -> assertEquals("FUTURE", code(json(client.get(RISKS + "?as-of=2027-01-01")))),
                        () -> assertEquals("PATTERN", code(json(client.get(RISKS + "?as-of=2026-13-45")))),
                        () -> assertEquals("UNKNOWN_TAG", code(json(client.get(RISKS + "?as-of=no-such-tag")))));
            }
        }

        @Test
        @DisplayName("first-login, no-rights, catalog-admin and login-trouble answer no report")
        void shouldAnswerNoReportElsewhere() {
            for (var profile : List.of("no-rights", "first-login", "login-trouble", "catalog-admin")) {
                var scenario = REGISTRY.resolve(profile).orElseThrow().scenario();
                assertFalse(scenario.routes().keySet().stream().anyMatch(key -> key.contains("/reports/") || key.contains("/isms/risks")),
                        profile);
            }
        }
    }

    @Nested
    @DisplayName("the states of workshop that this step adds")
    class States {

        @Test
        @DisplayName("describe every state, and the start state stays ready")
        void shouldDescribeTheStates() {
            var scenario = REGISTRY.resolve("workshop").orElseThrow().scenario();
            assertAll(
                    () -> assertEquals("ready", scenario.start()),
                    () -> assertTrue(scenario.states().keySet().containsAll(List.of("trend-mixed-models", "no-threat-models",
                            "risk-register-git-unavailable", "risk-register-empty"))),
                    () -> scenario.states().values().forEach(state -> assertFalse(state.description().isBlank(), state.id())));
        }
    }

    @Nested
    @DisplayName("the data files that mirror one another")
    class Mirrors {

        private final JsonNode evaluation = data("reports-threat-evaluation.json");
        private final JsonNode risks = data("reports-risks-now.json");

        @Test
        @DisplayName("the summary of workshop: the sections are the figures of the scope list, the evaluation and the register")
        void shouldMirrorTheSummary() {
            var summary = data("reports-summary-workshop.json");
            assertAll(
                    () -> assertSammSection(summary.path("samm"), data("samm-scopes.json")),
                    () -> assertThreatSection(summary.path("threatModels"), evaluation),
                    () -> assertRisksSection(summary.path("risks"), risks.path("risks")));
        }

        @Test
        @DisplayName("the variants of the summary are the base plus their one change")
        void shouldMirrorTheVariants() {
            var base = data("reports-summary-workshop.json");
            var released = data("reports-summary-released.json");
            assertAll(
                    () -> assertSammSection(data("reports-summary-scope-created.json").path("samm"),
                            data("samm-scopes-scope-created.json")),
                    () -> assertSammSection(data("reports-summary-assessment-created.json").path("samm"),
                            data("samm-scopes-shop-assessment-created.json")),
                    () -> assertSammSection(data("reports-summary-assessment-created.json").path("samm"),
                            data("samm-scopes-organisation-assessment-created.json")),
                    () -> assertSammSection(released.path("samm"), data("samm-scopes-release-released.json")),
                    () -> assertEquals(base.path("threatModels"), released.path("threatModels")),
                    () -> assertEquals(base.path("risks"), released.path("risks")),
                    () -> assertEquals(base.path("samm").path("latest").get(1), released.path("samm").path("latest").get(1)),
                    () -> assertEquals(base.path("samm").path("latest").get(2), released.path("samm").path("latest").get(2)),
                    () -> assertEquals(base.path("samm").path("withoutRelease"), released.path("samm").path("withoutRelease")),
                    () -> assertSammSection(data("reports-summary-release.json").path("samm"), data("samm-scopes-release-review.json")),
                    () -> assertEquals(withoutThreatModels(base), data("reports-summary-release.json")),
                    () -> assertEquals(withoutThreatModels(released), data("reports-summary-release-released.json")),
                    () -> assertEquals(withThreatModels(base, "threatModels", data("reports-summary-no-threat-models.json").path("threatModels")),
                            data("reports-summary-no-threat-models.json")),
                    () -> assertEquals(8, data("reports-summary-no-threat-models.json").path("threatModels").path("withoutModel").asInt()),
                    () -> assertEquals(base.path("samm"), data("reports-summary-no-risks.json").path("samm")),
                    () -> assertEquals(base.path("threatModels"), data("reports-summary-no-risks.json").path("threatModels")),
                    () -> assertEquals(0, data("reports-summary-no-risks.json").path("risks").path("entries").asInt()),
                    () -> assertEquals(data("reports-summary-empty.json").path("risks"), data("reports-summary-no-risks.json").path("risks")),
                    () -> assertEquals(1, data("reports-summary-empty-scope-created.json").path("samm").path("scopes").asInt()),
                    () -> assertEquals(1, data("reports-summary-empty-scope-created.json").path("samm").path("withoutRelease").asInt()),
                    () -> assertEquals(0, data("reports-summary-empty-scope-created.json").path("samm").path("open").asInt()),
                    () -> assertEquals(1, data("reports-summary-empty-assessment-created.json").path("samm").path("open").asInt()),
                    () -> assertSammSection(data("reports-summary-empty-scope-created.json").path("samm"), data("samm-scopes-empty-created.json")),
                    () -> assertSammSection(data("reports-summary-empty-assessment-created.json").path("samm"),
                            data("samm-scopes-empty-assessment.json")));
        }

        private JsonNode withoutThreatModels(JsonNode summary) {
            var copy = summary.deepCopy();
            ((com.fasterxml.jackson.databind.node.ObjectNode) copy).remove("threatModels");
            return copy;
        }

        private JsonNode withThreatModels(JsonNode summary, String name, JsonNode value) {
            var copy = (com.fasterxml.jackson.databind.node.ObjectNode) summary.deepCopy();
            copy.set(name, value);
            return copy;
        }

        @Test
        @DisplayName("the trend report copies every point of the per-scope trend files without practices; the functions average to the overall")
        void shouldMirrorTheTrends() {
            Map<String, String> files = Map.of("payments", "samm-trend-payments.json", "shop", "samm-trend-shop.json",
                    "organisation", "samm-trend-organisation.json");
            var base = data("reports-samm-trend.json").path("scopes");
            files.forEach((scope, file) -> {
                var report = base.get(SCOPES.indexOf(scope));
                var source = data(file);
                assertEquals(source.path("points").size(), report.path("points").size(), scope);
                for (int i = 0; i < source.path("points").size(); i++) {
                    var copy = source.path("points").get(i).deepCopy();
                    ((com.fasterxml.jackson.databind.node.ObjectNode) copy).remove("practices");
                    assertEquals(copy, report.path("points").get(i), scope);
                }
            });
            var released = data("reports-samm-trend-released.json").path("scopes");
            var releasedSource = data("samm-trend-payments-released.json").path("points");
            assertAll(
                    () -> assertEquals(3, released.get(0).path("points").size()),
                    () -> assertEquals(releasedSource.get(2).path("overall").asDouble(),
                            released.get(0).path("points").get(2).path("overall").asDouble(), 0),
                    () -> assertEquals(base.get(0).path("points").get(0), released.get(0).path("points").get(0)),
                    () -> assertEquals(base.get(2), released.get(2)),
                    () -> assertEquals(base.size() + 1, data("reports-samm-trend-scope-created.json").path("scopes").size()),
                    () -> assertEquals(base.get(3), data("reports-samm-trend-scope-created.json").path("scopes").get(3)),
                    () -> assertEquals(data("reports-samm-trend-scope-created.json").path("scopes").get(4),
                            data("reports-samm-trend-empty-created.json").path("scopes").get(0)));
        }

        @Test
        @DisplayName("the change of the summary is the latest overall minus the one before in the trend of the scope, null for the first point")
        void shouldMirrorTheChange() {
            var trend = data("reports-samm-trend.json").path("scopes");
            var latest = data("reports-summary-workshop.json").path("samm").path("latest");
            for (var item : latest) {
                var points = trend.get(SCOPES.indexOf(item.path("scope").asText())).path("points");
                var last = points.get(points.size() - 1);
                assertEquals(last.path("overall").asDouble(), item.path("overall").asDouble(), 0);
                assertEquals(last.path("assessment").asText(), item.path("assessment").asText());
                if (points.size() == 1) {
                    assertTrue(item.path("change").isNull(), item.path("scope").asText());
                } else {
                    assertEquals(last.path("overall").asDouble() - points.get(points.size() - 2).path("overall").asDouble(),
                            item.path("change").asDouble(), 0, item.path("scope").asText());
                }
            }
        }

        @Test
        @DisplayName("the comparison pair has the functions of the trend, with the practices and streams of the model, and its deltas hold")
        void shouldMirrorTheComparison() {
            var pair = data("samm-compare-payments-2025-q4-2026-q2.json");
            var trend = data("samm-trend-payments.json").path("points");
            var model = data("samm-model-v2.2.0.json");
            assertAll(
                    () -> assertEquals(trend.get(0).path("overall").asDouble(), pair.path("overall").path("from").asDouble(), 0),
                    () -> assertEquals(trend.get(1).path("overall").asDouble(), pair.path("overall").path("to").asDouble(), 0),
                    () -> assertDeltas(pair),
                    () -> assertEquals(FUNCTIONS, column(pair.path("functions"), "id")),
                    () -> pair.path("functions").forEach(function -> {
                        String id = function.path("id").asText();
                        assertEquals(trend.get(0).path("functions").path(id).asDouble(), function.path("from").asDouble(), TOLERANCE, id);
                        assertEquals(trend.get(1).path("functions").path(id).asDouble(), function.path("to").asDouble(), TOLERANCE, id);
                    }),
                    () -> assertEquals(practiceIds(model.path("functions")), practiceIds(pair.path("functions"))));
        }

        @Test
        @DisplayName("the evaluation: dates recomputed from the last review, ordered by review due, the none file lists the eight services")
        void shouldMirrorTheEvaluation() {
            evaluation.path("models").forEach(ReportsLensTest::assertRowDates);
            var none = data("reports-threat-evaluation-none.json");
            var dues = new ArrayList<String>();
            evaluation.path("models").forEach(row -> {
                if (!row.path("reviewDue").isNull()) {
                    dues.add(row.path("reviewDue").asText());
                }
            });
            var withModel = serviceIds(evaluation.path("models"));
            var without = serviceIds(evaluation.path("withoutModel"));
            assertAll(
                    () -> assertEquals(dues.stream().sorted().toList(), dues),
                    () -> assertTrue(evaluation.path("models").get(5).path("reviewDue").isNull()),
                    () -> assertEquals(0, none.path("models").size()),
                    () -> assertEquals(8, none.path("withoutModel").size()),
                    () -> assertEquals(withModel.size() + without.size(), none.path("withoutModel").size()),
                    () -> assertTrue(serviceIds(none.path("withoutModel")).containsAll(withModel)),
                    () -> assertEquals(evaluation.path("withoutModel").get(0),
                            none.path("withoutModel").get(4)));
        }

        @Test
        @DisplayName("the services of the evaluation, the Due items of the threat models and the owners are those of the catalogs")
        void shouldMirrorTheCatalogs() {
            Map<String, String> services = new LinkedHashMap<>();
            Map<String, Boolean> retired = new LinkedHashMap<>();
            data("catalog-service-entries.json").path("entries").forEach(entry -> {
                services.put(entry.path("id").asText(), entry.path("name").asText());
                retired.put(entry.path("id").asText(), entry.path("retired").asBoolean());
            });
            Map<String, String> teams = new LinkedHashMap<>();
            data("catalog-team-entries.json").path("entries").forEach(entry -> teams.put(entry.path("id").asText(), entry.path("name").asText()));
            var listed = new ArrayList<JsonNode>();
            evaluation.path("models").forEach(row -> listed.add(row.path("service")));
            evaluation.path("withoutModel").forEach(row -> {
                listed.add(row.path("service"));
                assertEquals(teams.get(row.path("owner").path("id").asText()), row.path("owner").path("name").asText());
            });
            risks.path("risks").forEach(risk -> assertEquals(teams.get(risk.path("owner").path("id").asText()),
                    risk.path("owner").path("name").asText(), risk.path("id").asText()));
            for (var service : listed) {
                assertEquals(services.get(service.path("id").asText()), service.path("name").asText());
                assertFalse(retired.get(service.path("id").asText()), service.path("id").asText());
            }
            var active = services.keySet().stream().filter(id -> !retired.get(id)).collect(Collectors.toSet());
            var withModelIds = new HashSet<>(serviceIds(evaluation.path("models")));
            var withoutModelIds = new HashSet<>(serviceIds(evaluation.path("withoutModel")));
            assertEquals(withoutModelIds.size(), evaluation.path("withoutModel").size(), "a service without a model is listed once");
            assertTrue(Collections.disjoint(withModelIds, withoutModelIds), "a service is in one population only");
            var covered = new HashSet<>(withModelIds);
            covered.addAll(withoutModelIds);
            assertEquals(active, covered);
            for (var due : List.of("due-workshop-lifecycle.json", "due-workshop-lifecycle-n5-released.json")) {
                for (var item : data(due).path("items")) {
                    if ("threat-models".equals(item.path("lens").asText())) {
                        var parts = item.path("address").asText().split("/");
                        assertTrue(services.containsKey(parts[2]), due + ": " + item.path("address").asText());
                        assertEquals(services.get(parts[2]) + ": checkout flow", item.path("title").asText());
                        assertEquals("2026-12-01", item.path("due").asText());
                        assertCanonical(item.path("address").asText());
                    }
                }
            }
        }

        @Test
        @DisplayName("the Due items of degraded and local name payment-api, a service of the catalog")
        void shouldMirrorTheDueOfDegradedAndLocal() {
            for (var profile : List.of("degraded", "local")) {
                var items = REGISTRY.resolve(profile).orElseThrow().scenario().routes().get("GET /api/v1/due").body().path("items");
                var threat = new ArrayList<JsonNode>();
                items.forEach(item -> {
                    if ("threat-models".equals(item.path("lens").asText())) {
                        threat.add(item);
                    }
                });
                assertEquals(1, threat.size(), profile);
                assertEquals("/threat-models/payment-api/checkout-flow", threat.get(0).path("address").asText(), profile);
                assertEquals("Payment API: checkout flow", threat.get(0).path("title").asText(), profile);
                assertEquals("2026-12-01", threat.get(0).path("due").asText(), profile);
            }
        }

        @Test
        @DisplayName("the register: every version is at most the newest, every older release precedes its commit, the tags are the ones of the files")
        void shouldMirrorTheRegister() {
            var now = risks.path("risks");
            Map<String, Integer> newest = new LinkedHashMap<>();
            now.forEach(risk -> newest.put(risk.path("entry").asText(), risk.path("version").asInt()));
            var files = List.of("reports-risks-2026-03.json", "reports-risks-audit-2026-03.json", "reports-risks-2026-06.json",
                    "reports-risks-management-review-2026-06.json", "reports-risks-before-first.json");
            for (var file : files) {
                var answer = data(file);
                String at = answer.path("asOf").path("at").asText();
                assertEquals(risks.path("tags"), answer.path("tags"), file);
                for (var risk : answer.path("risks")) {
                    assertTrue(risk.path("version").asInt() <= newest.get(risk.path("entry").asText()), file);
                    assertTrue(risk.path("releasedAt").asText().compareTo(at) <= 0, file + " " + risk.path("id").asText());
                }
            }
            assertAll(
                    () -> assertEquals(data("reports-risks-2026-03.json").path("risks"), data("reports-risks-audit-2026-03.json").path("risks")),
                    () -> assertEquals(data("reports-risks-2026-06.json").path("risks"),
                            data("reports-risks-management-review-2026-06.json").path("risks")),
                    () -> assertEquals(data("reports-risks-2026-03.json").path("asOf").path("commit"),
                            data("reports-risks-audit-2026-03.json").path("asOf").path("commit")),
                    () -> assertEquals(risks.path("asOf").path("at").asText(),
                            column(now, "releasedAt").stream().max(String::compareTo).orElseThrow()),
                    () -> assertEquals("R-007", now.get(1).path("id").asText()),
                    () -> assertEquals(data("reports-risks-empty.json").path("tags").size(), 0));
        }
    }
}
