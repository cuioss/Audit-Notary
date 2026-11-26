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
import com.fasterxml.jackson.databind.node.ObjectNode;
import de.cuioss.notary.audit.mock.runtime.CanonicalAddresses;
import de.cuioss.notary.audit.mock.scenario.ScenarioLoader;
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The SAMM completion of the profiles workshop, read-only, release, empty, degraded and local
 * (doc/specification/rest-api.adoc, <em>SAMM Requests</em>): the pinned models, the trend, the creates of a scope and an
 * assessment, the targets, the evidence, the frozen assessment and the refusals.
 */
@DisplayName("The SAMM completion")
class SammCompletionTest {

    private static final String SAMM = "/api/v1/samm/";
    private static final String DOC = "/api/v1/documents/samm-assessments/";
    private static final String DRAFT = "/api/v1/drafts/samm-assessments/";
    private static final String RELEASE = "/api/v1/releases/samm-assessments/";
    private static final Pattern HEX7 = Pattern.compile("[0-9a-f]{7}");
    private static final Pattern CHECKSUM = Pattern.compile("sha256:[0-9a-f]{64}");
    private static final double TOLERANCE = 1e-12;
    private static final List<String> SCOPES = List.of("payments", "identity", "shop", "organisation");
    private static final List<String> ASSESSMENT_FILES = List.of("identity-2026-q4", "organisation-2026-h1",
            "payments-2025-q4", "payments-2026-q2", "payments-2026-q4", "payments-2026-q4-in-review",
            "payments-2026-q4-released", "payments-2026-q4-saved-by-other", "shop-2026-q3");
    private static final List<String> FROZEN = List.of("payments-2026-q2", "payments-2025-q4", "shop-2026-q3",
            "organisation-2026-h1");

    private static final ClassLoader CLASS_LOADER = SammCompletionTest.class.getClassLoader();
    private static final ScenarioRegistry REGISTRY = new ScenarioRegistry(
            new ScenarioLoader(MockClient.MAPPER, name -> ScenarioRegistry.readDataFile(CLASS_LOADER, name)), CLASS_LOADER);

    private static MockClient start(String reference) {
        return MockClient.start(reference).login();
    }

    private static JsonNode get(MockClient client, String path) {
        return json(client.get(path));
    }

    private static void goTo(MockClient client, String state) {
        assertEquals(200, client.send("POST", "/mock/goto/" + state, null, Map.of()).statusCode(), state);
    }

    private static String stateOf(MockClient client) {
        return get(client, "/mock/state").path("state").asText();
    }

    private static JsonNode data(String name) {
        try {
            return MockClient.MAPPER.readTree(ScenarioRegistry.readDataFile(CLASS_LOADER, name).orElseThrow());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static List<String> texts(JsonNode array) {
        List<String> result = new ArrayList<>();
        array.forEach(node -> result.add(node.asText()));
        return result;
    }

    private static List<String> texts(List<JsonNode> nodes) {
        return nodes.stream().map(JsonNode::asText).toList();
    }

    private static List<JsonNode> values(JsonNode array) {
        List<JsonNode> result = new ArrayList<>();
        array.forEach(result::add);
        return result;
    }

    private static List<String> fieldNames(JsonNode object) {
        List<String> names = new ArrayList<>();
        object.fieldNames().forEachRemaining(names::add);
        return names;
    }

    /** Reads the stream up to the named event and returns its data. */
    private static JsonNode awaitEvent(Iterator<String> lines, String name) throws Exception {
        return CompletableFuture.supplyAsync(() -> {
            try {
                while (lines.hasNext()) {
                    if (lines.next().equals("event: " + name)) {
                        return MockClient.MAPPER.readTree(lines.next().substring("data: ".length()));
                    }
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            throw new IllegalStateException("the stream ended before " + name);
        }).get(5, TimeUnit.SECONDS);
    }

    /** The scores of AUN-SAMM-5, in the order of summation of {@code web-app/src/lib/samm/scores.ts}. */
    private record Scores(double overall, Map<String, Double> functions, Map<String, Double> practices) {

        static Scores of(JsonNode model, JsonNode answers) {
            Map<String, Double> practices = new LinkedHashMap<>();
            Map<String, Double> functions = new LinkedHashMap<>();
            for (var function : model.path("functions")) {
                double functionSum = 0;
                for (var practice : function.path("practices")) {
                    Map<String, Double> byLetter = new LinkedHashMap<>();
                    for (var stream : practice.path("streams")) {
                        double sum = 0;
                        for (var question : stream.path("questions")) {
                            var answer = answers.path(practice.path("id").asText()).path(question.path("id").asText())
                                    .path("answer");
                            if (answer.isNumber()) {
                                sum += answer.asDouble();
                            }
                        }
                        byLetter.put(stream.path("letter").asText(), sum);
                    }
                    double score = (byLetter.get("A") + byLetter.get("B")) / 2;
                    practices.put(practice.path("id").asText(), score);
                    functionSum += score;
                }
                functions.put(function.path("id").asText(), functionSum / function.path("practices").size());
            }
            double overall = functions.values().stream().mapToDouble(Double::doubleValue).sum() / functions.size();
            return new Scores(overall, functions, practices);
        }
    }

    private static void assertScores(JsonNode point, Scores expected) {
        assertEquals(expected.overall(), point.path("overall").asDouble(), TOLERANCE, "overall");
        assertEquals(List.of("governance", "design", "implementation", "verification", "operations"),
                fieldNames(point.path("functions")));
        assertEquals(15, point.path("practices").size());
        expected.functions().forEach((id, score) ->
                assertEquals(score, point.path("functions").path(id).asDouble(), TOLERANCE, id));
        expected.practices().forEach((id, score) ->
                assertEquals(score, point.path("practices").path(id).asDouble(), TOLERANCE, id));
        double average = 0;
        for (var function : point.path("functions")) {
            average += function.asDouble();
        }
        assertEquals(point.path("overall").asDouble(), average / 5, TOLERANCE, "the functions average to the overall");
    }

    @Nested
    @DisplayName("the reads of workshop: models, trend, scopes and assessments")
    class Reads {

        @Test
        @DisplayName("the models list has two entries, newest first, exactly one default; v2.1.0 has no model file")
        void shouldListThePinnedModels() {
            try (var client = start("workshop")) {
                var models = get(client, SAMM + "models").path("models");
                long defaultCount = values(models).stream().filter(m -> m.path("default").asBoolean()).count();
                var older = client.get(SAMM + "models/v2.1.0");
                assertAll(
                        () -> assertEquals(2, models.size()),
                        () -> assertEquals(1, defaultCount),
                        () -> assertEquals("v2.2.0", models.get(0).path("version").asText()),
                        () -> assertTrue(models.get(0).path("default").asBoolean()),
                        () -> assertEquals("v2.1.0", models.get(1).path("version").asText()),
                        () -> assertEquals("https://github.com/owaspsamm/core/tree/v2.2.0/model",
                                models.get(0).path("source").asText()),
                        () -> assertEquals("2026-02-03", models.get(0).path("pinnedAt").asText()),
                        () -> assertEquals("2025-03-17", models.get(1).path("pinnedAt").asText()),
                        () -> models.forEach(m -> assertTrue(CHECKSUM.matcher(m.path("checksum").asText()).matches(),
                                m.path("version").asText())),
                        () -> assertEquals(404, older.statusCode()),
                        () -> assertEquals("NOT_FOUND", json(older).path("outcome").asText()),
                        () -> assertEquals(200, client.get(SAMM + "models/v2.2.0").statusCode()));
            }
        }

        @Test
        @DisplayName("every scope has a trend: points oldest first, the overall of the scope read, functions that average to it")
        void shouldServeATrendPerScope() {
            try (var client = start("workshop")) {
                var model = get(client, SAMM + "models/v2.2.0");
                for (String scope : SCOPES) {
                    var trend = get(client, SAMM + scope + "/trend");
                    var read = get(client, SAMM + "scopes/" + scope);
                    var points = trend.path("points");
                    String previous = "";
                    for (var point : points) {
                        String assessment = point.path("assessment").asText();
                        var summary = findAssessment(read, assessment);
                        var document = get(client, DOC + point.path("document").asText());
                        assertAll(scope + "/" + assessment,
                                () -> assertEquals("released", summary.path("state").asText()),
                                () -> assertEquals(summary.path("overall").asDouble(), point.path("overall").asDouble(), TOLERANCE),
                                () -> assertEquals(summary.path("document").asText(), point.path("document").asText()),
                                () -> assertEquals(summary.path("date").asText(), point.path("date").asText()),
                                () -> assertEquals(summary.path("title").asText(), point.path("title").asText()),
                                () -> assertScores(point, Scores.of(model, document.path("answers"))));
                        String date = point.path("date").asText();
                        assertTrue(previous.compareTo(date) < 0, scope + ": oldest first");
                        previous = date;
                    }
                    long released = values(read.path("assessments")).stream()
                            .filter(a -> "released".equals(a.path("state").asText())).count();
                    assertAll(scope,
                            () -> assertEquals(scope, trend.path("scope").asText()),
                            () -> assertEquals(0, trend.path("omitted").asInt(-1)),
                            () -> assertEquals(released, points.size(), "one point per released assessment"));
                }
                var payments = get(client, SAMM + "payments/trend");
                assertAll(
                        () -> assertEquals(List.of("2025-q4", "2026-q2"),
                                texts(payments.path("points").findValues("assessment"))),
                        () -> assertEquals("v2.2.0", payments.path("modelVersion").asText()),
                        () -> assertEquals(0.9583333333333334, payments.path("points").get(0).path("overall").asDouble()),
                        () -> assertEquals(1.3583333333333332, payments.path("points").get(1).path("overall").asDouble()));
            }
        }

        @Test
        @DisplayName("the scope without a released assessment has no points and no model version")
        void shouldHaveNoPointsForTheUnreleasedScope() {
            try (var client = start("workshop")) {
                var trend = get(client, SAMM + "identity/trend");
                assertAll(
                        () -> assertEquals("identity", trend.path("scope").asText()),
                        () -> assertTrue(trend.path("points").isArray()),
                        () -> assertEquals(0, trend.path("points").size()),
                        () -> assertTrue(trend.path("modelVersion").isNull()),
                        () -> assertEquals(0, trend.path("omitted").asInt(-1)));
            }
        }

        @Test
        @DisplayName("every scope read has document equal to id and the two parts with blob, savedAt and savedBy")
        void shouldGiveEveryScopeItsDocumentAndParts() {
            try (var client = start("workshop")) {
                for (String scope : SCOPES) {
                    var read = get(client, SAMM + "scopes/" + scope);
                    assertAll(scope,
                            () -> assertEquals(List.of("id", "document", "title", "subject", "modelVersion", "targets", "parts",
                                    "assessments"), fieldNames(read)),
                            () -> assertEquals(read.path("id").asText(), read.path("document").asText()),
                            () -> assertEquals(List.of("data", "targets"), fieldNames(read.path("parts"))),
                            () -> read.path("parts").forEach(part -> {
                                assertTrue(HEX7.matcher(part.path("blob").asText()).matches());
                                assertTrue(part.path("savedAt").asText().compareTo(read.path("assessments")
                                        .findValues("date").stream().map(JsonNode::asText).min(String::compareTo)
                                        .orElseThrow()) < 0, "saved before the first assessment");
                                assertEquals("Noor Haddad", part.path("savedBy").path("name").asText());
                                assertEquals("Chief Information Security Officer", part.path("savedBy").path("role").asText());
                            }));
                }
            }
        }

        @Test
        @DisplayName("every assessment read has evidence: https links whose question is null or a question of the practice")
        void shouldGiveEveryAssessmentItsEvidence() {
            var model = data("samm-model-v2.2.0.json");
            Map<String, List<String>> questions = new LinkedHashMap<>();
            model.path("functions").forEach(function -> function.path("practices").forEach(practice -> {
                List<String> ids = new ArrayList<>();
                practice.path("streams").forEach(stream -> stream.path("questions").forEach(q -> ids.add(q.path("id").asText())));
                questions.put(practice.path("id").asText(), ids);
            }));
            int links = 0;
            for (String name : ASSESSMENT_FILES) {
                var assessment = data("samm-assessment-" + name + ".json");
                assertTrue(assessment.has("evidence"), name);
                assertEquals(List.of("id", "repository", "scope", "slug", "title", "date", "modelVersion", "state", "assessors",
                        "answers", "evidence", "parts", "history", "release"), fieldNames(assessment), name);
                var evidence = assessment.path("evidence");
                for (var entry : evidence.properties()) {
                    assertTrue(questions.containsKey(entry.getKey()), name + " " + entry.getKey());
                    assertTrue(entry.getValue().size() <= 50);
                    for (var link : entry.getValue()) {
                        assertAll(name + " " + entry.getKey(),
                                () -> assertTrue(link.path("url").asText().startsWith("https://")),
                                () -> assertTrue(link.path("url").asText().length() <= 2048),
                                () -> assertFalse(link.path("title").asText().isBlank()),
                                () -> assertTrue(link.path("title").asText().length() <= 200),
                                () -> assertTrue(link.path("question").isNull()
                                        || questions.get(entry.getKey()).contains(link.path("question").asText())),
                                () -> assertEquals(List.of("question", "title", "url"), fieldNames(link)));
                        links++;
                    }
                }
            }
            assertTrue(links > 0);
        }

        @Test
        @DisplayName("the evidence and the AsciiDoc comment are those of the register in the four Payments 2026 Q4 files, the others as they are")
        void shouldCarryTheEvidenceOfThePayments() {
            String comment = "Dependency scanning runs in *every* pipeline.\n\n* Scanner: the template of the platform team\n"
                    + "* The SBOM is not yet published.";
            for (String suffix : List.of("", "-in-review", "-released", "-saved-by-other")) {
                var assessment = data("samm-assessment-payments-2026-q4" + suffix + ".json");
                var evidence = assessment.path("evidence");
                assertAll(suffix,
                        () -> assertEquals(comment, assessment.path("answers").path("sb").path("sb-b-1").path("comment").asText()),
                        () -> assertEquals(List.of("sb", "ta"), fieldNames(evidence)),
                        () -> assertEquals(2, evidence.path("sb").size()),
                        () -> assertEquals("sb-b-1", evidence.path("sb").get(0).path("question").asText()),
                        () -> assertTrue(evidence.path("sb").get(1).path("question").isNull()),
                        () -> assertEquals("ta-b-2", evidence.path("ta").get(0).path("question").asText()));
            }
            assertAll(
                    () -> assertEquals(1, data("samm-assessment-payments-2026-q2.json").path("evidence").path("sb").size()),
                    () -> assertEquals(1, data("samm-assessment-payments-2026-q2.json").path("evidence").size()),
                    () -> assertEquals(0, data("samm-assessment-payments-2025-q4.json").path("evidence").size()),
                    () -> assertEquals(0, data("samm-assessment-shop-2026-q3.json").path("evidence").size()),
                    () -> assertEquals(0, data("samm-assessment-identity-2026-q4.json").path("evidence").size()),
                    () -> assertEquals(0, data("samm-assessment-organisation-2026-h1.json").path("evidence").size()));
        }

        private JsonNode findAssessment(JsonNode scope, String id) {
            for (var assessment : scope.path("assessments")) {
                if (id.equals(assessment.path("id").asText())) {
                    return assessment;
                }
            }
            throw new AssertionError("no assessment " + id);
        }
    }

    @Nested
    @DisplayName("creating a scope and an assessment in workshop")
    class Creates {

        @Test
        @DisplayName("POST /samm/scopes answers 201 CREATED, moves to scope-created, and the list and the scope read show Mobile Apps")
        void shouldCreateAScope() {
            try (var client = start("workshop")) {
                var response = client.change("POST", SAMM + "scopes", "{}");
                var created = json(response);
                var list = get(client, SAMM + "scopes").path("scopes");
                var scope = get(client, SAMM + "scopes/mobile");
                assertAll(
                        () -> assertEquals(201, response.statusCode()),
                        () -> assertEquals("CREATED", created.path("outcome").asText()),
                        () -> assertEquals("mobile", created.path("id").asText()),
                        () -> assertEquals("mobile", created.path("document").asText()),
                        () -> assertEquals("/samm/mobile", created.path("address").asText()),
                        () -> assertEquals("2026-11-26T09:30:00Z", created.path("at").asText()),
                        () -> assertEquals("c41e07d", created.path("parts").path("data").path("blob").asText()),
                        () -> assertEquals("9a02f5b", created.path("parts").path("targets").path("blob").asText()),
                        () -> assertEquals("scope-created", stateOf(client)),
                        () -> assertEquals(5, list.size()),
                        () -> assertEquals("mobile", list.get(4).path("id").asText()),
                        () -> assertTrue(list.get(4).path("latest").isNull()),
                        () -> assertTrue(list.get(4).path("open").isNull()),
                        () -> assertEquals(0, list.get(4).path("assessments").asInt(-1)),
                        () -> assertEquals("Mobile Apps", scope.path("title").asText()),
                        () -> assertEquals("team:mobile", scope.path("subject").path("kind").asText() + ":"
                                + scope.path("subject").path("id").asText()),
                        () -> assertEquals("v2.2.0", scope.path("modelVersion").asText()),
                        () -> assertEquals(0, scope.path("assessments").size()),
                        () -> assertEquals(2.5, scope.path("targets").path("ta").path("target").asDouble()),
                        () -> assertEquals("2027-03-31", scope.path("targets").path("ta").path("due").asText()),
                        () -> assertEquals(1.5, scope.path("targets").path("sb").path("target").asDouble()),
                        () -> assertEquals("Alex Example", scope.path("parts").path("data").path("savedBy").path("name").asText()),
                        () -> assertEquals(created.path("parts"), scope.path("parts")),
                        () -> assertEquals(0, get(client, SAMM + "mobile/trend").path("points").size()),
                        () -> assertEquals(200, client.change("POST", DOC + "mobile/save", "{}").statusCode()));
            }
        }

        @Test
        @DisplayName("an assessment of Payments or Identity is refused with ASSESSMENT_OPEN that names the open one")
        void shouldRefuseAnAssessmentWhileOneIsOpen() {
            try (var client = start("workshop")) {
                var payments = client.change("POST", SAMM + "payments/assessments", "{}");
                var identity = client.change("POST", SAMM + "identity/assessments", "{}");
                assertAll(
                        () -> assertEquals(409, payments.statusCode()),
                        () -> assertEquals("ASSESSMENT_OPEN", json(payments).path("outcome").asText()),
                        () -> assertEquals("2026-q4", json(payments).path("assessment").asText()),
                        () -> assertEquals("draft", json(payments).path("state").asText()),
                        () -> assertEquals(409, identity.statusCode()),
                        () -> assertEquals("2026-q4", json(identity).path("assessment").asText()),
                        () -> assertEquals("in-review", json(identity).path("state").asText()),
                        () -> assertEquals("ready", stateOf(client)));
            }
        }

        @ParameterizedTest(name = "{0}")
        @ValueSource(strings = {"shop", "organisation"})
        @DisplayName("an assessment of a scope without an open one answers 201, the list shows the open draft, a second create is refused")
        void shouldCreateAnAssessment(String scope) {
            String slug = "shop".equals(scope) ? "2026-q4" : "2026-h2";
            String document = scope + "-" + slug;
            String at = "shop".equals(scope) ? "2026-11-26T09:35:00Z" : "2026-11-26T09:36:00Z";
            try (var client = start("workshop")) {
                var response = client.change("POST", SAMM + scope + "/assessments", "{}");
                var created = json(response);
                var entry = values(get(client, SAMM + "scopes").path("scopes")).stream()
                        .filter(s -> scope.equals(s.path("id").asText())).findFirst().orElseThrow();
                var read = get(client, SAMM + "scopes/" + scope);
                var assessment = get(client, DOC + document);
                var second = client.change("POST", SAMM + scope + "/assessments", "{}");
                var draft = client.change("PUT", DRAFT + document, "{}");
                var saved = client.change("POST", DOC + document + "/save", "{}");
                assertAll(
                        () -> assertEquals(201, response.statusCode()),
                        () -> assertEquals("CREATED", created.path("outcome").asText()),
                        () -> assertEquals(slug, created.path("id").asText()),
                        () -> assertEquals(document, created.path("document").asText()),
                        () -> assertEquals(scope, created.path("scope").asText()),
                        () -> assertEquals("/samm/" + scope + "/" + slug, created.path("address").asText()),
                        () -> assertEquals("draft", created.path("state").asText()),
                        () -> assertEquals(at, created.path("at").asText()),
                        () -> assertEquals(0, created.path("parts").size()),
                        () -> assertEquals(scope + "-assessment-created", stateOf(client)),
                        () -> assertEquals(slug, entry.path("open").path("assessment").asText()),
                        () -> assertEquals("draft", entry.path("open").path("state").asText()),
                        () -> assertEquals(2, entry.path("assessments").asInt()),
                        () -> assertEquals(slug, read.path("assessments").get(0).path("id").asText()),
                        () -> assertEquals(document, read.path("assessments").get(0).path("document").asText()),
                        () -> assertEquals("draft", read.path("assessments").get(0).path("state").asText()),
                        () -> assertTrue(read.path("assessments").get(0).path("overall").isNull()),
                        () -> assertEquals(0, read.path("assessments").get(0).path("answered").asInt(-1)),
                        () -> assertEquals(document, assessment.path("id").asText()),
                        () -> assertEquals("draft", assessment.path("state").asText()),
                        () -> assertEquals(0, assessment.path("answers").size()),
                        () -> assertEquals(0, assessment.path("evidence").size()),
                        () -> assertEquals(0, assessment.path("parts").size()),
                        () -> assertTrue(assessment.path("release").isNull()),
                        () -> assertEquals(1, assessment.path("history").size()),
                        () -> assertEquals("create", assessment.path("history").get(0).path("kind").asText()),
                        () -> assertEquals(at, assessment.path("history").get(0).path("at").asText()),
                        () -> assertEquals("shop".equals(scope) ? List.of("Alex Example", "Jordan Weber") : List.of("Alex Example"),
                                texts(assessment.path("assessors").findValues("name"))),
                        () -> assertEquals(409, second.statusCode()),
                        () -> assertEquals("ASSESSMENT_OPEN", json(second).path("outcome").asText()),
                        () -> assertEquals(slug, json(second).path("assessment").asText()),
                        () -> assertEquals("DRAFT_SAVED", json(draft).path("outcome").asText()),
                        () -> assertEquals("SAVED", json(saved).path("outcome").asText()),
                        () -> assertEquals(0, json(saved).path("parts").size()));
            }
        }

        @Test
        @DisplayName("the creates push document-created (kind scope, kind assessment) to an open stream")
        void shouldPushDocumentCreated() throws Exception {
            try (var client = start("workshop")) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                client.change("POST", SAMM + "scopes", "{}");
                var scope = awaitEvent(lines, "document-created");
                goTo(client, "ready");
                client.change("POST", SAMM + "shop/assessments", "{}");
                var shop = awaitEvent(lines, "document-created");
                goTo(client, "ready");
                client.change("POST", SAMM + "organisation/assessments", "{}");
                var organisation = awaitEvent(lines, "document-created");
                assertAll(
                        () -> assertEquals("samm-assessments", scope.path("repository").asText()),
                        () -> assertEquals("mobile", scope.path("id").asText()),
                        () -> assertEquals("scope", scope.path("kind").asText()),
                        () -> assertEquals("shop-2026-q4", shop.path("id").asText()),
                        () -> assertEquals("assessment", shop.path("kind").asText()),
                        () -> assertEquals("organisation-2026-h2", organisation.path("id").asText()),
                        () -> assertEquals("assessment", organisation.path("kind").asText()));
            }
        }

        @Test
        @DisplayName("the addresses of the created scope and assessments are canonical addresses of the web app")
        void shouldAnswerCanonicalAddresses() {
            var addresses = CanonicalAddresses.load(MockClient.MAPPER, CLASS_LOADER);
            assertAll(
                    () -> assertTrue(addresses.isCanonical("/samm/mobile")),
                    () -> assertTrue(addresses.isCanonical("/samm/shop/2026-q4")),
                    () -> assertTrue(addresses.isCanonical("/samm/organisation/2026-h2")),
                    () -> assertTrue(addresses.isCanonical("/samm/mobile/2026-q4")),
                    () -> assertTrue(addresses.isCanonical("/samm/new")),
                    () -> assertTrue(addresses.isCanonical("/samm/shop/new")));
        }
    }

    @Nested
    @DisplayName("the targets of a scope in workshop")
    class Targets {

        private static final String SAVE = DOC + "payments/save";

        @Test
        @DisplayName("the first save of the targets answers SAVED with the blob a41f09c and moves to targets-saved; the scope read shows them")
        void shouldSaveTheTargets() {
            try (var client = start("workshop")) {
                var response = client.change("POST", SAVE, "{}");
                var saved = json(response);
                var scope = get(client, SAMM + "scopes/payments");
                assertAll(
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertEquals("SAVED", saved.path("outcome").asText()),
                        () -> assertEquals("2026-11-26T09:45:00Z", saved.path("at").asText()),
                        () -> assertEquals("a41f09c", saved.path("parts").path("targets").path("blob").asText()),
                        () -> assertEquals("Alex Example", saved.path("parts").path("targets").path("savedBy").path("name").asText()),
                        () -> assertEquals("targets-saved", stateOf(client)),
                        () -> assertEquals(saved.path("parts").path("targets"), scope.path("parts").path("targets")),
                        () -> assertEquals(3, scope.path("targets").path("ta").path("target").asDouble()),
                        () -> assertEquals("2027-03-31", scope.path("targets").path("ta").path("due").asText()),
                        () -> assertEquals(2, scope.path("targets").path("rt").path("target").asDouble()),
                        () -> assertEquals("2027-09-30", scope.path("targets").path("rt").path("due").asText()),
                        () -> assertFalse(scope.path("targets").has("om")),
                        () -> assertEquals(14, scope.path("targets").size()),
                        () -> assertEquals(200, client.change("POST", SAVE, "{}").statusCode()));
            }
        }

        @Test
        @DisplayName("the other scopes answer SAVED without a state change")
        void shouldSaveTheTargetsOfTheOtherScopes() {
            try (var client = start("workshop")) {
                for (String scope : List.of("identity", "shop", "organisation")) {
                    var response = client.change("POST", DOC + scope + "/save", "{}");
                    var saved = json(response);
                    assertAll(scope,
                            () -> assertEquals(200, response.statusCode()),
                            () -> assertEquals("SAVED", saved.path("outcome").asText()),
                            () -> assertTrue(HEX7.matcher(saved.path("parts").path("targets").path("blob").asText()).matches()),
                            () -> assertEquals("ready", stateOf(client)));
                }
            }
        }

        @Test
        @DisplayName("targets-saved pushes document-saved with part targets and the changed fields")
        void shouldPushDocumentSaved() throws Exception {
            try (var client = start("workshop")) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                client.change("POST", SAVE, "{}");
                var event = awaitEvent(lines, "document-saved");
                assertAll(
                        () -> assertEquals("samm-assessments", event.path("repository").asText()),
                        () -> assertEquals("payments", event.path("id").asText()),
                        () -> assertEquals("targets", event.path("part").asText()),
                        () -> assertEquals(List.of("/ta", "/rt", "/om"), texts(event.path("fields"))),
                        () -> assertEquals("p-4c1a9e", event.path("by").path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("targets-invalid refuses the save with the part and the pointers")
        void shouldRefuseInvalidTargets() {
            try (var client = start("workshop")) {
                goTo(client, "targets-invalid");
                var response = client.change("POST", SAVE, "{}");
                var errors = json(response).path("errors");
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("VALIDATION", json(response).path("outcome").asText()),
                        () -> assertEquals(2, errors.size()),
                        () -> assertEquals("targets", errors.get(0).path("part").asText()),
                        () -> assertEquals("/ta/target", errors.get(0).path("pointer").asText()),
                        () -> assertEquals("ENUM", errors.get(0).path("code").asText()),
                        () -> assertEquals("/rt/due", errors.get(1).path("pointer").asText()),
                        () -> assertEquals("PATTERN", errors.get(1).path("code").asText()));
            }
        }

        @Test
        @DisplayName("targets-conflict answers the first save CONFLICT with both entries, the second SAVED and moves to targets-saved")
        void shouldAnswerAConflictOnce() {
            try (var client = start("workshop")) {
                goTo(client, "targets-conflict");
                var first = client.change("POST", SAVE, "{}");
                var conflict = json(first).path("conflicts").get(0);
                var field = conflict.path("fields").get(0);
                var stateAfterFirst = stateOf(client);
                var second = client.change("POST", SAVE, "{}");
                assertAll(
                        () -> assertEquals(409, first.statusCode()),
                        () -> assertEquals("CONFLICT", json(first).path("outcome").asText()),
                        () -> assertEquals("targets", conflict.path("part").asText()),
                        () -> assertEquals("c05e92a", conflict.path("blob").asText()),
                        () -> assertEquals("/ta", field.path("pointer").asText()),
                        () -> assertEquals(3, field.path("own").path("target").asDouble()),
                        () -> assertEquals("2027-03-31", field.path("own").path("due").asText()),
                        () -> assertEquals(2, field.path("other").path("target").asDouble()),
                        () -> assertFalse(field.path("other").has("due")),
                        () -> assertEquals("Jordan Weber", field.path("by").path("name").asText()),
                        () -> assertEquals("Team Lead", field.path("by").path("role").asText()),
                        () -> assertEquals("targets-conflict-resolved", stateAfterFirst),
                        () -> assertEquals(200, second.statusCode()),
                        () -> assertEquals("a41f09c", json(second).path("parts").path("targets").path("blob").asText()),
                        () -> assertEquals("targets-saved", stateOf(client)),
                        () -> assertEquals(3, get(client, SAMM + "scopes/payments").path("targets").path("ta").path("target").asDouble()));
            }
        }
    }

    @Nested
    @DisplayName("the frozen assessments and the refusals of workshop")
    class Refusals {

        static Stream<String> frozenRoutes() {
            return FROZEN.stream().flatMap(document -> Stream.of(
                    "PUT " + DRAFT + document, "POST " + DOC + document + "/save",
                    "POST " + DOC + document + "/transitions/samm.submit", "POST " + RELEASE + document));
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("frozenRoutes")
        @DisplayName("every write to a released assessment answers 409 DOCUMENT_RELEASED with its own tag")
        void shouldRefuseEveryWriteOfAFrozenAssessment(String route) {
            String[] parts = route.split(" ", 2);
            String document = FROZEN.stream().filter(parts[1]::contains).findFirst().orElseThrow();
            try (var client = start("workshop")) {
                var response = client.change(parts[0], parts[1], "{}");
                assertAll(
                        () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("DOCUMENT_RELEASED", json(response).path("outcome").asText()),
                        () -> assertEquals("assessments/" + document + "/v1", json(response).path("tag").asText()),
                        () -> assertEquals(data("samm-assessment-" + document + ".json").path("release").path("tag").asText(),
                                json(response).path("tag").asText()),
                        () -> assertEquals("ready", stateOf(client)));
            }
        }

        @Test
        @DisplayName("assessment-released-meanwhile: the save and the draft of Payments 2026 Q4 answer DOCUMENT_RELEASED and the reads show it released")
        void shouldAnswerReleasedMeanwhile() throws Exception {
            try (var client = start("workshop")) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                goTo(client, "assessment-released-meanwhile");
                var event = awaitEvent(lines, "document-transitioned");
                var save = client.change("POST", DOC + "payments-2026-q4/save", "{}");
                var draft = client.change("PUT", DRAFT + "payments-2026-q4", "{}");
                var assessment = get(client, DOC + "payments-2026-q4");
                var scope = get(client, SAMM + "scopes/payments");
                var list = get(client, SAMM + "scopes").path("scopes").get(0);
                var trend = get(client, SAMM + "payments/trend");
                assertAll(
                        () -> assertEquals(409, save.statusCode()),
                        () -> assertEquals("assessments/payments-2026-q4/v1", json(save).path("tag").asText()),
                        () -> assertEquals(409, draft.statusCode()),
                        () -> assertEquals("DOCUMENT_RELEASED", json(draft).path("outcome").asText()),
                        () -> assertEquals("released", assessment.path("state").asText()),
                        () -> assertEquals("released", scope.path("assessments").get(0).path("state").asText()),
                        () -> assertEquals("2026-q4", list.path("latest").path("assessment").asText()),
                        () -> assertTrue(list.path("open").isNull()),
                        () -> assertEquals(3, trend.path("points").size()),
                        () -> assertEquals("2026-q4", trend.path("points").get(2).path("assessment").asText()),
                        () -> assertEquals("payments-2026-q4", event.path("id").asText()),
                        () -> assertEquals("released", event.path("state").asText()),
                        () -> assertEquals(1, event.path("version").asInt()),
                        () -> assertEquals("p-7d2e58", event.path("by").path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("evidence-invalid refuses the save and the draft of Payments 2026 Q4 with the pointers into the assessment")
        void shouldRefuseInvalidEvidence() {
            try (var client = start("workshop")) {
                goTo(client, "evidence-invalid");
                for (var response : List.of(client.change("POST", DOC + "payments-2026-q4/save", "{}"),
                        client.change("PUT", DRAFT + "payments-2026-q4", "{}"))) {
                    var errors = json(response).path("errors");
                    assertAll(
                            () -> assertEquals(422, response.statusCode()),
                            () -> assertEquals("VALIDATION", json(response).path("outcome").asText()),
                            () -> assertEquals(3, errors.size()),
                            () -> assertEquals("sb", errors.get(0).path("part").asText()),
                            () -> assertEquals("/evidence/sb/1/url", errors.get(0).path("pointer").asText()),
                            () -> assertEquals("PATTERN", errors.get(0).path("code").asText()),
                            () -> assertEquals("/evidence/sb/0/title", errors.get(1).path("pointer").asText()),
                            () -> assertEquals("REQUIRED", errors.get(1).path("code").asText()),
                            () -> assertEquals("/answers/sb/sb-b-1/comment", errors.get(2).path("pointer").asText()),
                            () -> assertEquals("MAX_LENGTH", errors.get(2).path("code").asText()));
                }
            }
        }

        @Test
        @DisplayName("model-versions-differ answers the comparison 422 MODEL_VERSIONS_DIFFER with both assessments; ready answers the comparison")
        void shouldAnswerModelVersionsDiffer() {
            try (var client = start("workshop")) {
                var before = client.get(SAMM + "payments/compare?from=2026-q2&to=2026-q4");
                goTo(client, "model-versions-differ");
                var response = client.get(SAMM + "payments/compare?from=2026-q2&to=2026-q4");
                var body = json(response);
                assertAll(
                        () -> assertEquals(200, before.statusCode()),
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("MODEL_VERSIONS_DIFFER", body.path("outcome").asText()),
                        () -> assertEquals("2026-q2", body.path("from").path("assessment").asText()),
                        () -> assertEquals("v2.1.0", body.path("from").path("modelVersion").asText()),
                        () -> assertEquals("2026-q4", body.path("to").path("assessment").asText()),
                        () -> assertEquals("v2.2.0", body.path("to").path("modelVersion").asText()));
            }
        }

        @Test
        @DisplayName("models-none lists no model")
        void shouldListNoModel() {
            try (var client = start("workshop")) {
                goTo(client, "models-none");
                assertAll(
                        () -> assertEquals(0, get(client, SAMM + "models").path("models").size()),
                        () -> assertTrue(get(client, SAMM + "models").path("models").isArray()));
            }
        }

        @Test
        @DisplayName("scope-invalid refuses the create of a scope with the four errors of the contract")
        void shouldRefuseAnInvalidScope() {
            try (var client = start("workshop")) {
                goTo(client, "scope-invalid");
                var response = client.change("POST", SAMM + "scopes", "{}");
                var errors = json(response).path("errors");
                List<String> pairs = new ArrayList<>();
                errors.forEach(error -> pairs.add(error.path("pointer").asText() + " " + error.path("code").asText()));
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("VALIDATION", json(response).path("outcome").asText()),
                        () -> assertEquals(List.of("/title REQUIRED", "/subject REFERENCE_NOT_FOUND", "/targets/ta/target ENUM",
                                "/targets/rt/due PATTERN"), pairs),
                        () -> assertEquals("scope-invalid", stateOf(client)));
            }
        }

        @ParameterizedTest(name = "{0}")
        @ValueSource(strings = {"shop", "organisation"})
        @DisplayName("assessment-invalid refuses the create of an assessment with the three errors of the contract")
        void shouldRefuseAnInvalidAssessment(String scope) {
            try (var client = start("workshop")) {
                goTo(client, "assessment-invalid");
                var response = client.change("POST", SAMM + scope + "/assessments", "{}");
                List<String> pairs = new ArrayList<>();
                json(response).path("errors").forEach(error ->
                        pairs.add(error.path("pointer").asText() + " " + error.path("code").asText()));
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals(List.of("/date PATTERN", "/modelVersion ENUM", "/assessors/1 PSEUDONYM_UNKNOWN"), pairs));
            }
        }

        @Test
        @DisplayName("samm-git-unavailable: the status is degraded and the creates and the save of the targets answer 503; the draft and the reads work")
        void shouldAnswerGitUnavailable() {
            try (var client = start("workshop")) {
                goTo(client, "samm-git-unavailable");
                var status = get(client, "/api/v1/status");
                List<String> down = new ArrayList<>();
                status.path("repositories").forEach(repo -> {
                    if ("DOWN".equals(repo.path("fetch").asText())) {
                        down.add(repo.path("alias").asText());
                    }
                });
                var writes = List.of(client.change("POST", SAMM + "scopes", "{}"),
                        client.change("POST", SAMM + "shop/assessments", "{}"),
                        client.change("POST", SAMM + "organisation/assessments", "{}"),
                        client.change("POST", DOC + "payments/save", "{}"));
                assertAll(
                        () -> assertTrue(status.path("degraded").asBoolean()),
                        () -> assertEquals(List.of("samm-assessments"), down),
                        () -> writes.forEach(write -> {
                            assertEquals(503, write.statusCode());
                            assertEquals("GIT_UNAVAILABLE", json(write).path("outcome").asText());
                        }),
                        () -> assertEquals("DRAFT_SAVED", json(client.change("PUT", DRAFT + "payments-2026-q4", "{}"))
                                .path("outcome").asText()),
                        () -> assertEquals(200, client.get(SAMM + "scopes").statusCode()),
                        () -> assertEquals(200, client.get(SAMM + "payments/trend").statusCode()),
                        () -> assertEquals(200, client.get(SAMM + "models").statusCode()));
            }
        }

        @Test
        @DisplayName("describes every state of workshop that this step adds, and the start state stays ready")
        void shouldDescribeTheStates() {
            var scenario = REGISTRY.resolve("workshop").orElseThrow().scenario();
            var names = new ArrayList<>(scenario.states().keySet());
            assertAll(
                    () -> assertEquals("ready", scenario.start()),
                    () -> assertTrue(names.containsAll(List.of("scope-created", "scope-invalid", "targets-saved",
                            "targets-invalid", "targets-conflict", "targets-conflict-resolved", "shop-assessment-created",
                            "organisation-assessment-created", "assessment-invalid", "assessment-released-meanwhile",
                            "evidence-invalid", "model-versions-differ", "models-none", "samm-git-unavailable"))),
                    () -> scenario.states().values().forEach(state -> assertFalse(state.description().isBlank(), state.id())));
        }
    }

    @Nested
    @DisplayName("the other profiles")
    class OtherProfiles {

        @Test
        @DisplayName("read-only reads the models and the four trends, and answers the three writes 403 FORBIDDEN")
        void shouldRefuseTheWritesOfReadOnly() {
            try (var client = start("read-only")) {
                var writes = List.of(client.change("POST", SAMM + "scopes", "{}"),
                        client.change("POST", SAMM + "shop/assessments", "{}"),
                        client.change("POST", DOC + "payments/save", "{}"));
                assertAll(
                        () -> assertEquals(2, get(client, SAMM + "models").path("models").size()),
                        () -> SCOPES.forEach(scope -> assertEquals(200, client.get(SAMM + scope + "/trend").statusCode(), scope)),
                        () -> assertEquals(2, get(client, SAMM + "payments/trend").path("points").size()),
                        () -> writes.forEach(write -> {
                            assertEquals(403, write.statusCode());
                            assertEquals("FORBIDDEN", json(write).path("outcome").asText());
                        }),
                        () -> assertEquals("ready", stateOf(client)));
            }
        }

        @Test
        @DisplayName("release reads the models and the trends; released adds the third point, released-meanwhile answers the release DOCUMENT_RELEASED")
        void shouldServeTheReleaseProfile() {
            try (var client = start("release")) {
                var before = get(client, SAMM + "payments/trend");
                goTo(client, "released");
                var released = get(client, SAMM + "payments/trend");
                goTo(client, "review");
                goTo(client, "released-meanwhile");
                var response = client.change("POST", RELEASE + "payments-2026-q4", "{}");
                var assessment = get(client, DOC + "payments-2026-q4");
                var scope = get(client, SAMM + "scopes/payments");
                var list = get(client, SAMM + "scopes").path("scopes").get(0);
                var trend = get(client, SAMM + "payments/trend");
                assertAll(
                        () -> assertEquals(2, get(client, SAMM + "models").path("models").size()),
                        () -> SCOPES.forEach(s -> assertEquals(200, client.get(SAMM + s + "/trend").statusCode(), s)),
                        () -> assertEquals(2, before.path("points").size()),
                        () -> assertEquals(3, released.path("points").size()),
                        () -> assertEquals(1.65, released.path("points").get(2).path("overall").asDouble()),
                        () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("DOCUMENT_RELEASED", json(response).path("outcome").asText()),
                        () -> assertEquals("assessments/payments-2026-q4/v1", json(response).path("tag").asText()),
                        () -> assertEquals("released", assessment.path("state").asText()),
                        () -> assertEquals("released", scope.path("assessments").get(0).path("state").asText()),
                        () -> assertTrue(list.path("open").isNull()),
                        () -> assertEquals(3, trend.path("points").size()));
            }
        }

        @Test
        @DisplayName("empty: no scope, one model; the create moves to scope-created, then the assessment to assessment-created")
        void shouldRunTheEmptyChain() {
            try (var client = start("empty")) {
                var models = get(client, SAMM + "models").path("models");
                var empty = get(client, SAMM + "scopes").path("scopes");
                var scope = client.change("POST", SAMM + "scopes", "{}");
                var afterScope = stateOf(client);
                var scopes = get(client, SAMM + "scopes").path("scopes");
                var read = get(client, SAMM + "scopes/mobile");
                var trend = get(client, SAMM + "mobile/trend");
                var assessment = client.change("POST", SAMM + "mobile/assessments", "{}");
                var afterAssessment = stateOf(client);
                var list = get(client, SAMM + "scopes").path("scopes");
                var scopeRead = get(client, SAMM + "scopes/mobile");
                var document = get(client, DOC + "mobile-2026-q4");
                var second = client.change("POST", SAMM + "mobile/assessments", "{}");
                assertAll(
                        () -> assertEquals(1, models.size()),
                        () -> assertEquals("v2.2.0", models.get(0).path("version").asText()),
                        () -> assertTrue(models.get(0).path("default").asBoolean()),
                        () -> assertEquals(200, client.get(SAMM + "models/v2.2.0").statusCode()),
                        () -> assertEquals(0, empty.size()),
                        () -> assertEquals(201, scope.statusCode()),
                        () -> assertEquals("mobile", json(scope).path("id").asText()),
                        () -> assertEquals("scope-created", afterScope),
                        () -> assertEquals(1, scopes.size()),
                        () -> assertEquals("mobile", scopes.get(0).path("id").asText()),
                        () -> assertEquals(0, read.path("assessments").size()),
                        () -> assertEquals(0, trend.path("points").size()),
                        () -> assertEquals(201, assessment.statusCode()),
                        () -> assertEquals("2026-q4", json(assessment).path("id").asText()),
                        () -> assertEquals("mobile-2026-q4", json(assessment).path("document").asText()),
                        () -> assertEquals("/samm/mobile/2026-q4", json(assessment).path("address").asText()),
                        () -> assertEquals("2026-11-26T09:40:00Z", json(assessment).path("at").asText()),
                        () -> assertEquals("assessment-created", afterAssessment),
                        () -> assertEquals("2026-q4", list.get(0).path("open").path("assessment").asText()),
                        () -> assertEquals(1, list.get(0).path("assessments").asInt()),
                        () -> assertEquals("mobile-2026-q4", scopeRead.path("assessments").get(0).path("document").asText()),
                        () -> assertEquals("Mobile Apps 2026 Q4", document.path("title").asText()),
                        () -> assertEquals(List.of("Sam Firstuser"), texts(document.path("assessors").findValues("name"))),
                        () -> assertEquals("Chief Information Security Officer", document.path("assessors").get(0).path("role").asText()),
                        () -> assertEquals("p-0a11ce", document.path("assessors").get(0).path("pseudonym").asText()),
                        () -> assertEquals(0, document.path("answers").size()),
                        () -> assertEquals("DRAFT_SAVED", json(client.change("PUT", DRAFT + "mobile-2026-q4", "{}")).path("outcome").asText()),
                        () -> assertEquals(0, json(client.change("POST", DOC + "mobile-2026-q4/save", "{}")).path("parts").size()),
                        () -> assertEquals(409, second.statusCode()),
                        () -> assertEquals("ASSESSMENT_OPEN", json(second).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("empty: no-model lists no model; the first-login profile and no-rights answer no SAMM data of this step")
        void shouldListNoModelInEmpty() {
            try (var client = start("empty")) {
                goTo(client, "no-model");
                assertEquals(0, get(client, SAMM + "models").path("models").size());
            }
            try (var client = MockClient.start("no-rights").login()) {
                assertEquals(403, client.get(SAMM + "models").statusCode());
            }
        }

        @Test
        @DisplayName("empty pushes document-created for the scope and the assessment")
        void shouldPushDocumentCreatedInEmpty() throws Exception {
            try (var client = start("empty")) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                client.change("POST", SAMM + "scopes", "{}");
                var scope = awaitEvent(lines, "document-created");
                client.change("POST", SAMM + "mobile/assessments", "{}");
                var assessment = awaitEvent(lines, "document-created");
                assertAll(
                        () -> assertEquals("scope", scope.path("kind").asText()),
                        () -> assertEquals("mobile", scope.path("id").asText()),
                        () -> assertEquals("assessment", assessment.path("kind").asText()),
                        () -> assertEquals("mobile-2026-q4", assessment.path("id").asText()));
            }
        }

        @Test
        @DisplayName("degraded: the writes answer 503 GIT_UNAVAILABLE, the reads work, recovered lets them through")
        void shouldAnswerDegraded() {
            try (var client = start("degraded")) {
                var writes = List.of(client.change("POST", SAMM + "scopes", "{}"),
                        client.change("POST", SAMM + "shop/assessments", "{}"),
                        client.change("POST", DOC + "payments/save", "{}"));
                var models = client.get(SAMM + "models");
                var trends = SCOPES.stream().map(scope -> client.get(SAMM + scope + "/trend")).toList();
                goTo(client, "recovered");
                var created = client.change("POST", SAMM + "scopes", "{}");
                assertAll(
                        () -> writes.forEach(write -> {
                            assertEquals(503, write.statusCode());
                            assertEquals("GIT_UNAVAILABLE", json(write).path("outcome").asText());
                        }),
                        () -> assertEquals(200, models.statusCode()),
                        () -> trends.forEach(trend -> assertEquals(200, trend.statusCode())),
                        () -> assertEquals(201, created.statusCode()));
            }
        }

        @Test
        @DisplayName("local reads the models and the four trends")
        void shouldServeLocal() {
            try (var client = MockClient.start("local").loginLocal("alex", "local-password")) {
                assertAll(
                        () -> assertEquals(2, get(client, SAMM + "models").path("models").size()),
                        () -> SCOPES.forEach(scope -> assertEquals(200, client.get(SAMM + scope + "/trend").statusCode(), scope)));
            }
        }
    }

    @Nested
    @DisplayName("the data files that mirror one another")
    class Mirrors {

        private ObjectNode copy(String name) {
            return (ObjectNode) data(name).deepCopy();
        }

        @Test
        @DisplayName("the models list is that of the model file: newest first, one default, the source of the model")
        void shouldMirrorTheModelFile() {
            var models = data("samm-models.json").path("models");
            var model = data("samm-model-v2.2.0.json");
            assertAll(
                    () -> assertEquals(model.path("version").asText(), models.get(0).path("version").asText()),
                    () -> assertEquals(model.path("source").asText(), models.get(0).path("source").asText()),
                    () -> assertEquals(1, models.findValues("default").stream().filter(JsonNode::asBoolean).count()),
                    () -> assertEquals(texts(models.findValues("version")).stream().sorted().toList().reversed(),
                            texts(models.findValues("version"))));
        }

        @Test
        @DisplayName("the trends are the scores of the answers: the three of Payments are the same points, the one of Shop and Organisation likewise")
        void shouldMirrorTheAnswers() {
            var model = data("samm-model-v2.2.0.json");
            Map<String, String> documents = Map.of("samm-trend-payments.json", "payments", "samm-trend-payments-released.json",
                    "payments", "samm-trend-shop.json", "shop", "samm-trend-organisation.json", "organisation");
            documents.forEach((trendFile, scope) -> {
                var trend = data(trendFile);
                assertEquals(scope, trend.path("scope").asText(), trendFile);
                for (var point : trend.path("points")) {
                    // the third point of Payments is the released Payments 2026 Q4, which has a file of its own
                    String document = point.path("document").asText();
                    String file = "payments-2026-q4".equals(document) ? document + "-released" : document;
                    assertScores(point, Scores.of(model, data("samm-assessment-" + file + ".json").path("answers")));
                }
            });
            var withThree = data("samm-trend-payments-released.json").path("points");
            var withTwo = data("samm-trend-payments.json").path("points");
            assertAll(
                    () -> assertEquals(withTwo.get(0), withThree.get(0)),
                    () -> assertEquals(withTwo.get(1), withThree.get(1)),
                    () -> assertEquals("2026-q4", withThree.get(2).path("assessment").asText()),
                    () -> assertEquals("2026-11-24", withThree.get(2).path("date").asText()),
                    () -> assertEquals(1.65, withThree.get(2).path("overall").asDouble()));
        }

        @Test
        @DisplayName("the scope reads of one scope differ only in their assessments; the targets and the parts are the same")
        void shouldKeepTheScopeVariantsAlike() {
            var base = data("samm-scope-payments.json");
            for (String variant : List.of("samm-scope-payments-in-review.json", "samm-scope-payments-released.json")) {
                var other = data(variant);
                assertAll(variant,
                        () -> assertEquals(base.path("parts"), other.path("parts")),
                        () -> assertEquals(base.path("targets"), other.path("targets")),
                        () -> assertEquals(base.path("subject"), other.path("subject")));
            }
            var saved = copy("samm-scope-payments-targets-saved.json");
            var expected = copy("samm-scope-payments.json");
            var targets = (ObjectNode) expected.path("targets");
            targets.set("ta", MockClient.MAPPER.createObjectNode().put("target", 3).put("due", "2027-03-31"));
            targets.set("rt", MockClient.MAPPER.createObjectNode().put("target", 2).put("due", "2027-09-30"));
            targets.remove("om");
            var parts = (ObjectNode) expected.path("parts");
            parts.set("targets", saved.path("parts").path("targets"));
            assertAll(
                    () -> assertEquals(expected, saved),
                    () -> assertEquals("a41f09c", saved.path("parts").path("targets").path("blob").asText()),
                    () -> assertEquals("2026-11-26T09:45:00Z", saved.path("parts").path("targets").path("savedAt").asText()));
        }

        @Test
        @DisplayName("the lists and the scope reads of the states are the baseline plus their one change")
        void shouldDeriveTheStatesFromTheBaseline() {
            var baseline = data("samm-scopes.json").path("scopes");
            var created = data("samm-scopes-scope-created.json").path("scopes");
            List<JsonNode> expectedCreated = new ArrayList<>();
            baseline.forEach(expectedCreated::add);
            var mobile = MockClient.MAPPER.createObjectNode();
            mobile.put("id", "mobile").put("title", "Mobile Apps");
            mobile.set("subject", data("samm-scope-mobile.json").path("subject"));
            mobile.putNull("latest").putNull("open").put("assessments", 0);
            expectedCreated.add(mobile);
            List<JsonNode> actualCreated = new ArrayList<>();
            created.forEach(actualCreated::add);
            assertEquals(expectedCreated, actualCreated);
            assertEquals(List.of(mobile), values(data("samm-scopes-empty-created.json").path("scopes")));
            for (String scope : List.of("shop", "organisation")) {
                var list = data("samm-scopes-" + scope + "-assessment-created.json").path("scopes");
                var read = data("samm-scope-" + scope + "-assessment-created.json");
                var base = data("samm-scope-" + scope + ".json");
                var open = read.path("assessments").get(0);
                assertAll(scope,
                        () -> assertEquals(baseline.size(), list.size()),
                        () -> assertEquals(base.path("assessments").size() + 1, read.path("assessments").size()),
                        () -> assertEquals(base.path("assessments").get(0), read.path("assessments").get(1)),
                        () -> assertEquals("draft", open.path("state").asText()),
                        () -> assertEquals(base.path("parts"), read.path("parts")),
                        () -> assertEquals(base.path("targets"), read.path("targets")),
                        () -> list.forEach(entry -> {
                            if (scope.equals(entry.path("id").asText())) {
                                assertEquals(open.path("id").asText(), entry.path("open").path("assessment").asText());
                                assertEquals(open.path("title").asText(), entry.path("open").path("title").asText());
                                assertEquals(read.path("assessments").size(), entry.path("assessments").asInt());
                                assertEquals(values(baseline).stream().filter(s -> scope.equals(s.path("id").asText()))
                                        .findFirst().orElseThrow().path("latest"), entry.path("latest"));
                            } else {
                                assertEquals(values(baseline).stream().filter(s -> s.path("id").equals(entry.path("id")))
                                        .findFirst().orElseThrow(), entry);
                            }
                        }));
            }
        }

        @Test
        @DisplayName("the created scope and assessments of empty are the ones of workshop: same scope, same shape of the assessment")
        void shouldKeepTheCreatedFilesAlike() {
            var scope = data("samm-scope-mobile.json");
            var withAssessment = data("samm-scope-mobile-assessment.json");
            var assessment = data("samm-assessment-mobile-2026-q4.json");
            var shop = data("samm-assessment-shop-2026-q4.json");
            assertAll(
                    () -> assertEquals(scope.path("targets"), withAssessment.path("targets")),
                    () -> assertEquals(scope.path("parts"), withAssessment.path("parts")),
                    () -> assertEquals(1, withAssessment.path("assessments").size()),
                    () -> assertEquals("mobile-2026-q4", withAssessment.path("assessments").get(0).path("document").asText()),
                    () -> assertEquals(fieldNames(shop), fieldNames(assessment)),
                    () -> assertEquals("mobile", assessment.path("scope").asText()),
                    () -> assertEquals("mobile-2026-q4", assessment.path("id").asText()),
                    () -> assertEquals(data("samm-scopes-empty-assessment.json").path("scopes").get(0).path("open").path("assessment"),
                            assessment.path("slug")),
                    () -> assertTrue(CHECKSUM.matcher(data("samm-models.json").path("models").get(0).path("checksum")
                            .asText()).matches()));
        }
    }
}
