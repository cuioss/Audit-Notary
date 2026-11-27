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
import de.cuioss.notary.audit.mock.scenario.ScenarioLoader;
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static de.cuioss.notary.audit.mock.IncidentFixtures.IDS;
import static de.cuioss.notary.audit.mock.IncidentFixtures.STAGES;
import static de.cuioss.notary.audit.mock.IncidentFixtures.data;
import static de.cuioss.notary.audit.mock.IncidentFixtures.read;
import static de.cuioss.notary.audit.mock.IncidentFixtures.texts;
import static de.cuioss.notary.audit.mock.IncidentsTest.doc;
import static de.cuioss.notary.audit.mock.IncidentsTest.dom;
import static de.cuioss.notary.audit.mock.IncidentsTest.rowOf;
import static de.cuioss.notary.audit.mock.IncidentsTest.stage;
import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The states of the profile workshop for the incident reports: the completion and the reopening of a stage, the submit and the
 * release of the credential stuffing, the clock, the refusals and the new incident. The files of the states are checked against
 * the derivation like the base files (the section {@code Mirrors}); the chains walk the links the way the web app does.
 */
@DisplayName("The Incident reports lens: the states of workshop")
class IncidentStatesTest {

    private static final String K = IDS.get("credential-stuffing");
    private static final String CARD = IDS.get("card-data");
    private static final String PHISHING = IDS.get("phishing-link");
    private static final String NEW = "01JZA8F0H2K4M6P8R0T2W4Y6A8";
    private static final String REPOSITORY = "/api/v1/documents/isms-incidents-2026";
    private static final ClassLoader CLASS_LOADER = IncidentStatesTest.class.getClassLoader();
    private static final ScenarioRegistry REGISTRY = new ScenarioRegistry(
            new ScenarioLoader(MockClient.MAPPER, name -> ScenarioRegistry.readDataFile(CLASS_LOADER, name)), CLASS_LOADER);
    private static final JsonNode WORKSHOP = readScenario("workshop");
    /** The states of the incident reports, found in the profile and not listed a second time. */
    private static final List<String> STATES = fieldNames(WORKSHOP.path("states")).stream()
            .filter(name -> name.startsWith("incident-")).toList();


    private static JsonNode readScenario(String name) {
        try (var stream = CLASS_LOADER.getResourceAsStream("scenarios/" + name + ".json")) {
            return MockClient.MAPPER.readTree(java.util.Objects.requireNonNull(stream));
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    private static List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    private static MockClient start() {
        return MockClient.start("workshop").login();
    }

    private static JsonNode get(MockClient client, String path) {
        var response = client.get(path);
        assertEquals(200, response.statusCode(), path);
        return json(response);
    }

    private static java.util.Set<String> aliasesOf(JsonNode status) {
        java.util.Set<String> aliases = new java.util.TreeSet<>();
        status.path("repositories").forEach(repository -> aliases.add(repository.path("alias").asText()));
        return aliases;
    }

    private static void goTo(MockClient client, String state) {
        assertEquals(200, client.send("POST", "/mock/goto/" + state, null, Map.of()).statusCode(), state);
    }

    private static String stateOf(MockClient client) {
        return get(client, "/mock/state").path("state").asText();
    }

    private static JsonNode post(MockClient client, String path, int status, String outcome) {
        var response = client.change("POST", path, "{}");
        assertEquals(status, response.statusCode(), path);
        var body = json(response);
        assertEquals(outcome, body.path("outcome").asText(), path);
        return body;
    }

    private static List<String> statuses(JsonNode read) {
        return texts(read.path("stages").findValues("status"));
    }

    private static List<Boolean> reopened(JsonNode read) {
        List<Boolean> markers = new ArrayList<>();
        read.path("stages").forEach(stage -> markers.add(stage.path("predecessorReopened").asBoolean()));
        return markers;
    }

    private static JsonNode row(MockClient client, String id) {
        return rowOf(get(client, "/api/v1/incidents/2026"), id);
    }

    static Stream<String> states() {
        return STATES.stream();
    }

    // ---------------------------------------------------------------------------------------------------------- the data
    @Nested
    @DisplayName("Mirrors: the files of the states keep the derivation")
    class Mirrors {

        /**
         * File of the read, file of the list, the slug the list row replaces: every pair that a state of the profile serves
         * for the same incident, found in {@code workshop.json}.
         */
        private static final List<List<String>> VARIANTS = variants();

        private static List<List<String>> variants() {
            var slugs = new java.util.HashMap<String, String>();
            IDS.forEach((slug, id) -> slugs.put(id, slug));
            slugs.put(NEW, "suspicious-vpn");
            java.util.Set<List<String>> found = new java.util.LinkedHashSet<>();
            for (String state : STATES) {
                var routes = WORKSHOP.path("states").path(state).path("routes");
                String list = routes.path("GET /api/v1/incidents/2026").path("body_file").asText(null);
                for (String key : fieldNames(routes)) {
                    var matcher = java.util.regex.Pattern.compile("GET /api/v1/incidents/2026/([0-9A-Z]{26})").matcher(key);
                    String file = routes.path(key).path("body_file").asText(null);
                    if (list != null && file != null && matcher.matches()) {
                        found.add(List.of(file, list, slugs.get(matcher.group(1))));
                    }
                }
            }
            return List.copyOf(found);
        }

        @Test
        @DisplayName("the variants found are the nine files of the states, none of them forgotten")
        void shouldFindTheVariants() {
            assertTrue(VARIANTS.size() >= 9, VARIANTS.toString());
            assertTrue(VARIANTS.stream().map(variant -> variant.get(0)).collect(java.util.stream.Collectors.toSet())
                    .containsAll(List.of("incident-credential-stuffing-reopened.json", "incident-credential-stuffing-in-review.json",
                            "incident-credential-stuffing-released.json", "incident-suspicious-vpn.json")));
            assertTrue(STATES.size() >= 24, STATES.toString());
        }

        @Test
        @DisplayName("every variant recomputes its stages and deadlines at its asOf and carries a completion in the value and the stage")
        void shouldKeepTheInvariants() {
            var schema = data("categories-incident-reports-schema.json");
            for (var variant : VARIANTS) {
                var read = data(variant.get(0));
                var derived = IncidentFixtures.derive(read.path("parts"), schema);
                var expected = IncidentFixtures.deadlines(read.path("parts"), Instant.parse(read.path("asOf").asText()));
                assertEquals(expected, IncidentFixtures.deadlinesOf(read), variant.get(0));
                for (int i = 0; i < derived.size(); i++) {
                    var want = derived.get(i);
                    var stage = read.path("stages").get(i);
                    var value = read.path("parts").path(stage.path("part").asText()).path("value");
                    assertAll(variant.get(0) + " " + want.id(),
                            () -> assertEquals(want.status(), stage.path("status").asText()),
                            () -> assertEquals(want.unanswered(), stage.path("unanswered").asBoolean()),
                            () -> assertEquals(want.missing(), texts(stage.path("missing"))),
                            () -> assertEquals(want.blockedBy(), texts(stage.path("blockedBy"))),
                            () -> assertEquals(want.predecessorReopened(), stage.path("predecessorReopened").asBoolean()),
                            () -> assertEquals("completed".equals(want.status()), value.has("completion")),
                            () -> assertEquals("completed".equals(want.status()), !stage.path("completion").isNull()));
                }
                assertEquals(MockClient.MAPPER.valueToTree(IncidentFixtures.protection(read.path("parts").path("triage").path("value"),
                        data("catalog-service-entries.json"))), read.path("protection"), variant.get(0));
            }
        }

        @Test
        @DisplayName("every list of a state holds the row of the incident it replaces, equal to its read, and the others as in the base")
        void shouldMatchTheListsToTheReads() {
            var base = data("incidents-year-2026.json");
            for (var variant : VARIANTS) {
                var read = data(variant.get(0));
                var list = data(variant.get(1));
                var replaced = variant.get(2);
                var expectedAsOf = read.path("asOf").asText().compareTo("2026-11-26T10:00:00Z") > 0 ? read.path("asOf").asText()
                        : "2026-11-26T10:00:00Z";
                assertAll(variant.get(1),
                        () -> assertEquals(read.path("id").asText(), rowOf(list, read.path("id").asText()).path("id").asText()),
                        () -> assertEquals(expectedAsOf, list.path("asOf").asText()),
                        () -> IncidentFixtures.assertRow(rowOf(list, read.path("id").asText()), read),
                        () -> assertEquals("suspicious-vpn".equals(replaced) ? 8 : 7, list.path("incidents").size()));
                for (var row : base.path("incidents")) {
                    if (!row.path("id").asText().equals(read.path("id").asText())) {
                        assertEquals(row, rowOf(list, row.path("id").asText()), variant.get(1));
                    }
                }
            }
        }

        @Test
        @DisplayName("the years of the states count their lists; the revisions of the released incident end with v1 and the report is committed")
        void shouldCountTheYearsOfTheStates() {
            for (var years : List.of("incidents-years-b-released.json", "incidents-years-clock.json", "incidents-years-created.json")) {
                var body = data(years);
                var list = data(years.contains("released") ? "incidents-year-2026-b-released.json"
                        : years.contains("clock") ? "incidents-year-2026-clock.json" : "incidents-year-2026-created.json");
                var year = body.path("years").get(0);
                assertAll(years,
                        () -> assertEquals(list.path("incidents").size(), year.path("incidents").asInt()),
                        () -> assertEquals(list.path("incidents").findValues("state").stream()
                                .filter(state -> !"released".equals(state.asText())).count(), year.path("open").asLong()),
                        () -> assertEquals(list.path("incidents").findParents("missed").stream()
                                .filter(deadlines -> deadlines.path("missed").asInt() > 0).count(), year.path("withMissedDeadline").asLong()),
                        () -> assertEquals(list.path("today"), body.path("today")));
            }
            var released = data("incident-credential-stuffing-released.json");
            var revisions = data("incident-credential-stuffing-released-revisions.json").path("revisions");
            var report = data("incident-credential-stuffing-released-report.json");
            assertAll(
                    () -> assertEquals("v1", revisions.get(0).path("ref").asText()),
                    () -> assertEquals(released.path("release").path("tag"), revisions.get(0).path("tag")),
                    () -> assertEquals(released.path("history").size(), revisions.size()),
                    () -> assertEquals("committed", report.path("source").asText()),
                    () -> assertEquals(released.path("asOf"), report.path("asOf")),
                    () -> assertTrue(released.path("frozen").asBoolean()),
                    () -> assertEquals(0, released.path("transitions").size()),
                    () -> assertEquals(released.path("parts"), data("incident-credential-stuffing-released-at-v1.json").path("parts")),
                    () -> assertTrue(data("incident-credential-stuffing-released-at-v1.json").path("frozen").asBoolean()),
                    () -> assertEquals("2026-11-27", data("incidents-years-clock.json").path("today").asText()),
                    () -> assertEquals(2, data("incidents-years-clock.json").path("years").get(0).path("withMissedDeadline").asInt()),
                    () -> assertEquals(8, data("incidents-years-created.json").path("years").get(0).path("incidents").asInt()),
                    () -> assertEquals(5, data("incidents-years-b-released.json").path("years").get(0).path("open").asInt()));
        }

        @Test
        @DisplayName("the Due lists of the states are the base list without the item the state changes, derived from the reads")
        void shouldDeriveTheDueOfTheStates() {
            var base = data("due-workshop-lifecycle.json").path("items");
            List<String> baseIncidents = new ArrayList<>();
            base.forEach(item -> {
                if ("incidents".equals(item.path("lens").asText())) {
                    baseIncidents.add(item.path("deadline").path("rule").asText() + ":" + item.path("deadline").path("status").asText()
                            + ":" + item.path("address").asText());
                }
            });
            for (var name : List.of("due-incident-recorded.json", "due-incident-clock.json")) {
                var items = data(name).path("items");
                List<String> found = new ArrayList<>();
                items.forEach(item -> {
                    if ("incidents".equals(item.path("lens").asText())) {
                        found.add(item.path("deadline").path("rule").asText() + ":" + item.path("deadline").path("status").asText()
                                + ":" + item.path("address").asText());
                    }
                });
                assertEquals(items.size(), name.contains("recorded") ? base.size() - 1 : base.size(), name);
                assertEquals(name.contains("recorded") ? 2 : 3, found.size(), name);
                if (name.contains("clock")) {
                    assertEquals(baseIncidents.get(0), found.get(0));
                    assertEquals("gdpr-art33:MISSED:/incidents/2026/" + PHISHING + "?stage=notifications", found.get(1));
                    assertEquals(baseIncidents.get(2), found.get(2));
                } else {
                    assertEquals(List.of(baseIncidents.get(0), baseIncidents.get(2)), found);
                }
            }
        }
    }

    // ---------------------------------------------------------------------------------------------------------- the states
    @ParameterizedTest
    @MethodSource("states")
    @DisplayName("every state of the brief exists with a description")
    void shouldKnowTheState(String name) {
        var scenario = REGISTRY.resolve("workshop").orElseThrow().scenario();
        assertTrue(scenario.states().containsKey(name), name);
        assertFalse(scenario.state(name).orElseThrow().description().isBlank(), name);
    }

    @Test
    @DisplayName("the review is completed, submitted and released: every step reads back and the year counts follow")
    void shouldWalkTheReleaseOfTheCredentialStuffing() {
        try (var client = start()) {
            assertEquals(List.of("completed", "not-applicable", "completed", "not-applicable", "open"), statuses(get(client, dom("credential-stuffing"))));
            var completed = post(client, stage("credential-stuffing", "review", "complete"), 200, "COMPLETED");
            var afterComplete = get(client, dom("credential-stuffing"));
            assertAll(
                    () -> assertEquals("incident-review-completed", stateOf(client)),
                    () -> assertEquals("review", completed.path("stage").asText()),
                    () -> assertEquals("completed", completed.path("status").asText()),
                    () -> assertEquals("p-4c1a9e", completed.path("completion").path("by").path("pseudonym").asText()),
                    () -> assertEquals(afterComplete.path("parts").path("review").path("blob"),
                            completed.path("parts").path("review").path("blob")),
                    () -> assertEquals(texts(afterComplete.path("stages").findValues("status")),
                            texts(completed.path("stages").findValues("status"))),
                    () -> assertEquals(List.of("completed", "not-applicable", "completed", "not-applicable", "completed"), statuses(afterComplete)),
                    () -> assertEquals(List.of("incident.submit"), texts(afterComplete.path("transitions").findValues("id"))),
                    () -> assertEquals(afterComplete, get(client, doc("credential-stuffing"))),
                    () -> assertEquals(List.of("completed", "not-applicable", "completed", "not-applicable", "completed"),
                            texts(row(client, K).path("stages").findValues("status"))));
            var submitted = post(client, doc("credential-stuffing") + "/transitions/incident.submit", 200, "TRANSITIONED");
            var inReview = get(client, dom("credential-stuffing"));
            assertAll(
                    () -> assertEquals("in-review", submitted.path("state").asText()),
                    () -> assertEquals("incident-submitted", stateOf(client)),
                    () -> assertEquals("in-review", inReview.path("state").asText()),
                    () -> assertFalse(inReview.path("frozen").asBoolean()),
                    () -> assertEquals(List.of("incident.release"), texts(inReview.path("transitions").findValues("id"))),
                    () -> assertTrue(inReview.path("transitions").get(0).path("release").asBoolean()),
                    () -> assertEquals(data("incident-credential-stuffing-diff.json"), get(client, doc("credential-stuffing") + "/diff?from=released")),
                    () -> assertEquals("in-review", row(client, K).path("state").asText()));
            var released = post(client, "/api/v1/releases/isms-incidents-2026/" + K, 200, "RELEASED");
            var frozen = get(client, dom("credential-stuffing"));
            var report = get(client, dom("credential-stuffing") + "/report");
            var years = get(client, "/api/v1/incidents");
            assertAll(
                    () -> assertEquals("incidents/" + K + "/v1", released.path("tag").asText()),
                    () -> assertEquals("incidents/" + K + "/report.adoc", released.path("report").asText()),
                    () -> assertEquals("incident-released", stateOf(client)),
                    () -> assertEquals("released", frozen.path("state").asText()),
                    () -> assertTrue(frozen.path("frozen").asBoolean()),
                    () -> assertEquals(released.path("at"), frozen.path("release").path("at")),
                    () -> assertEquals("p-7d2e58", frozen.path("release").path("by").path("pseudonym").asText()),
                    () -> assertEquals(0, frozen.path("deadlines").size()),
                    () -> assertEquals("committed", report.path("source").asText()),
                    () -> assertEquals(released.path("at"), report.path("asOf")),
                    () -> assertEquals(5, years.path("years").get(0).path("open").asInt()),
                    () -> assertEquals(7, years.path("years").get(0).path("incidents").asInt()),
                    () -> assertEquals("v1", get(client, doc("credential-stuffing") + "/revisions").path("revisions").get(0).path("ref").asText()),
                    () -> assertEquals("released", get(client, dom("credential-stuffing") + "?at=v1").path("state").asText()),
                    () -> assertEquals("released", row(client, K).path("state").asText()),
                    () -> assertTrue(row(client, K).path("frozen").asBoolean()),
                    () -> assertEquals("incidents/" + K + "/v1", row(client, K).path("release").path("tag").asText()));
        }
    }

    @Test
    @DisplayName("reopening the triage marks the response and leaves the review open and not blocked; completing it again clears the markers")
    void shouldReopenAndRecomplete() {
        try (var client = start()) {
            var reopen = post(client, stage("credential-stuffing", "triage", "reopen"), 200, "REOPENED");
            var read = get(client, dom("credential-stuffing"));
            assertAll(
                    () -> assertEquals("incident-triage-reopened", stateOf(client)),
                    () -> assertEquals("open", reopen.path("status").asText()),
                    () -> assertEquals(List.of("open", "not-applicable", "completed", "not-applicable", "open"), statuses(read)),
                    () -> assertEquals(List.of(false, false, true, false, false), reopened(read)),
                    () -> assertEquals(0, read.path("stages").get(4).path("blockedBy").size()),
                    () -> assertTrue(read.path("stages").get(0).path("completion").isNull()),
                    () -> assertFalse(read.path("parts").path("triage").path("value").has("completion")),
                    () -> assertTrue(read.path("history").findValues("kind").stream().anyMatch(kind -> "complete".equals(kind.asText()))),
                    () -> assertEquals("reopen", read.path("history").get(0).path("kind").asText()),
                    () -> assertEquals("open", row(client, K).path("stages").get(0).path("status").asText()));
        }
        try (var client = start()) {
            var before = get(client, dom("wrong-recipient"));
            assertEquals(List.of(false, true, true, true, false), reopened(before));
            var complete = post(client, stage("wrong-recipient", "triage", "complete"), 200, "COMPLETED");
            var after = get(client, dom("wrong-recipient"));
            assertAll(
                    () -> assertEquals("incident-triage-recompleted", stateOf(client)),
                    () -> assertEquals("completed", complete.path("status").asText()),
                    () -> assertEquals(List.of("completed", "completed", "completed", "completed", "open"), statuses(after)),
                    () -> assertEquals(List.of(false, false, false, false, false), reopened(after)),
                    () -> assertEquals("complete", after.path("history").get(0).path("kind").asText()),
                    () -> assertEquals(1, row(client, IDS.get("wrong-recipient")).path("deadlines").path("met").asInt()));
        }
    }

    @Test
    @DisplayName("completing the privacy assessment of the phishing mail leaves the response open and unblocked")
    void shouldCompleteThePrivacyAssessment() {
        try (var client = start()) {
            var complete = post(client, stage("phishing-link", "privacy-assessment", "complete"), 200, "COMPLETED");
            var read = get(client, dom("phishing-link"));
            assertAll(
                    () -> assertEquals("incident-privacy-completed", stateOf(client)),
                    () -> assertEquals("privacy-assessment", complete.path("stage").asText()),
                    () -> assertEquals(List.of("completed", "completed", "open", "open", "open"), statuses(read)),
                    () -> assertEquals(0, read.path("stages").get(2).path("blockedBy").size()),
                    () -> assertEquals(List.of("response"), texts(read.path("stages").get(4).path("blockedBy"))),
                    () -> assertEquals("completed", row(client, PHISHING).path("stages").get(1).path("status").asText()));
        }
    }

    @Test
    @DisplayName("recording the notification meets gdpr-art33 and drops the Due item; the clock then makes a deadline missed")
    void shouldMoveTheClock() {
        try (var client = start()) {
            var before = get(client, dom("phishing-link"));
            var saved = post(client, doc("phishing-link") + "/save", 200, "SAVED");
            var read = get(client, dom("phishing-link"));
            var due = get(client, "/api/v1/due").path("items");
            assertAll(
                    () -> assertEquals("OPEN", before.path("deadlines").get(0).path("status").asText()),
                    () -> assertEquals("incident-notification-recorded", stateOf(client)),
                    () -> assertEquals("notifications", saved.path("parts").fieldNames().next()),
                    () -> assertEquals("MET", read.path("deadlines").get(0).path("status").asText()),
                    () -> assertEquals("2026-11-26T09:45:00Z", read.path("deadlines").get(0).path("sentAt").asText()),
                    () -> assertEquals(1, row(client, PHISHING).path("deadlines").path("met").asInt()),
                    () -> assertEquals(0, row(client, PHISHING).path("deadlines").path("open").asInt()),
                    () -> assertEquals(List.of("gdpr-art33", "nis2-final-report"), due.findValues("rule").stream().map(JsonNode::asText).toList()));
        }
        try (var client = start()) {
            goTo(client, "incident-clock-advanced");
            var read = get(client, dom("phishing-link"));
            var due = get(client, "/api/v1/due").path("items");
            List<String> statuses = new ArrayList<>();
            due.forEach(item -> {
                if ("incidents".equals(item.path("lens").asText())) {
                    statuses.add(item.path("deadline").path("status").asText());
                }
            });
            assertAll(
                    () -> assertEquals("MISSED", read.path("deadlines").get(0).path("status").asText()),
                    () -> assertEquals("2026-11-27T10:00:00Z", read.path("asOf").asText()),
                    () -> assertEquals(1, row(client, PHISHING).path("deadlines").path("missed").asInt()),
                    () -> assertEquals(2, get(client, "/api/v1/incidents").path("years").get(0).path("withMissedDeadline").asInt()),
                    () -> assertEquals(List.of("MISSED", "MISSED", "OPEN"), statuses),
                    () -> assertEquals("OPEN", get(client, dom("card-data")).path("deadlines").get(3).path("status").asText()));
        }
    }

    @Test
    @DisplayName("the refusals: a conflict, a locked stage, three field errors, a changed part; each in its own state")
    void shouldRefuseTheSaves() {
        try (var client = start()) {
            goTo(client, "incident-saved-by-other");
            var conflict = post(client, doc("card-data") + "/save", 409, "CONFLICT");
            var field = conflict.path("conflicts").get(0);
            assertAll(
                    () -> assertEquals("notifications", field.path("part").asText()),
                    () -> assertEquals(read("card-data").path("parts").path("notifications").path("blob"), field.path("blob")),
                    () -> assertEquals("/supervisory-authority", field.path("fields").get(0).path("pointer").asText()),
                    () -> assertEquals("p-2b7f10", field.path("fields").get(0).path("by").path("pseudonym").asText()),
                    () -> assertEquals("email", field.path("fields").get(0).path("other").path("channel").asText()),
                    () -> assertEquals("reporting-portal", field.path("fields").get(0).path("own").path("channel").asText()));
        }
        try (var client = start()) {
            goTo(client, "incident-stage-locked");
            for (var request : List.of(List.of("POST", doc("card-data") + "/save"),
                    List.of("PUT", "/api/v1/drafts/isms-incidents-2026/" + CARD))) {
                var response = client.change(request.get(0), request.get(1), "{}");
                assertAll(request.toString(), () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("STAGE_LOCKED", json(response).path("outcome").asText()),
                        () -> assertEquals(List.of("triage"), texts(json(response).path("stages"))));
            }
        }
        try (var client = start()) {
            goTo(client, "incident-invalid");
            for (var request : List.of(List.of("POST", doc("card-data") + "/save"),
                    List.of("PUT", "/api/v1/drafts/isms-incidents-2026/" + CARD))) {
                var response = client.change(request.get(0), request.get(1), "{}");
                var errors = json(response).path("errors");
                assertAll(request.toString(), () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("VALIDATION", json(response).path("outcome").asText()),
                        () -> assertEquals(List.of("READ_ONLY", "REFERENCE_NOT_FOUND", "OUT_OF_YEAR", "FORMAT"), texts(errors.findValues("code"))),
                        () -> assertEquals(List.of("triage", "triage", "triage", "notifications"), texts(errors.findValues("part"))),
                        () -> assertEquals("/completion", errors.get(0).path("pointer").asText()));
            }
        }
        try (var client = start()) {
            goTo(client, "incident-complete-changed");
            post(client, stage("phishing-link", "privacy-assessment", "complete"), 409, "CHANGED_SINCE_REVIEW");
            assertEquals("incident-complete-changed", stateOf(client));
        }
    }

    @Test
    @DisplayName("incident-git-unavailable: the status is degraded with the repository DOWN, every write is 503, the reads and the draft stay 200")
    void shouldBeUnavailable() {
        try (var client = start()) {
            var ready = aliasesOf(get(client, "/api/v1/status"));
            goTo(client, "incident-git-unavailable");
            var status = get(client, "/api/v1/status");
            Map<String, String> fetch = new java.util.HashMap<>();
            status.path("repositories").forEach(repository -> fetch.put(repository.path("alias").asText(), repository.path("fetch").asText()));
            assertAll(
                    () -> assertTrue(status.path("degraded").asBoolean()),
                    () -> assertEquals("DOWN", fetch.get("isms-incidents-2026")),
                    () -> assertEquals("UP", fetch.get("isms-incidents-2025")),
                    () -> assertEquals(ready, fetch.keySet(), "the repositories of the ready status"),
                    () -> assertEquals(data("incidents-year-2026.json"), get(client, "/api/v1/incidents/2026")),
                    () -> assertEquals(read("card-data"), get(client, dom("card-data"))),
                    () -> assertEquals("DRAFT_SAVED", json(client.change("PUT", "/api/v1/drafts/isms-incidents-2026/" + CARD, "{}"))
                            .path("outcome").asText()));
            for (String path : List.of(doc("card-data") + "/save", doc("phishing-link") + "/save", stage("credential-stuffing", "review", "complete"),
                    stage("credential-stuffing", "triage", "reopen"), stage("phishing-link", "privacy-assessment", "complete"),
                    stage("wrong-recipient", "triage", "complete"), doc("credential-stuffing") + "/transitions/incident.submit",
                    "/api/v1/releases/isms-incidents-2026/" + K, REPOSITORY)) {
                post(client, path, 503, "GIT_UNAVAILABLE");
            }
        }
    }

    @Test
    @DisplayName("the step-up of the review and of the release: first 403 STEP_UP_REQUIRED with the address, then the same request passes")
    void shouldStepUp() {
        try (var client = start()) {
            goTo(client, "incident-review-step-up");
            var first = post(client, stage("credential-stuffing", "review", "complete"), 403, "STEP_UP_REQUIRED");
            assertAll(
                    () -> assertEquals("/api/v1/auth/login?step-up=mfa", first.path("stepUp").asText()),
                    () -> assertEquals("incident-review-stepped-up", stateOf(client)));
            post(client, stage("credential-stuffing", "review", "complete"), 200, "COMPLETED");
            assertEquals("incident-review-completed", stateOf(client));
        }
        try (var client = start()) {
            goTo(client, "incident-release-step-up");
            var inReview = get(client, dom("credential-stuffing"));
            var first = post(client, "/api/v1/releases/isms-incidents-2026/" + K, 403, "STEP_UP_REQUIRED");
            assertAll(
                    () -> assertEquals("in-review", inReview.path("state").asText()),
                    () -> assertEquals("/api/v1/auth/login?step-up=mfa", first.path("stepUp").asText()),
                    () -> assertEquals("incident-release-stepped-up", stateOf(client)));
            post(client, "/api/v1/releases/isms-incidents-2026/" + K, 200, "RELEASED");
            assertEquals("incident-released", stateOf(client));
        }
    }

    @Test
    @DisplayName("a release that changed since the review stays refused until the diff is read again, then passes")
    void shouldRefuseTheChangedRelease() {
        try (var client = start()) {
            goTo(client, "incident-release-changed");
            post(client, "/api/v1/releases/isms-incidents-2026/" + K, 409, "CHANGED_SINCE_REVIEW");
            assertEquals("incident-release-changed-refused", stateOf(client));
            post(client, "/api/v1/releases/isms-incidents-2026/" + K, 409, "CHANGED_SINCE_REVIEW");
            assertEquals("incident-release-changed-refused", stateOf(client));
            var reviewed = get(client, doc("credential-stuffing") + "/diff");
            assertEquals(data("incident-credential-stuffing-diff-changed.json"), reviewed);
            assertNotEquals(data("incident-credential-stuffing-diff.json"), reviewed);
            assertEquals("incident-release-changed-reviewed", stateOf(client));
            assertEquals(reviewed, get(client, doc("credential-stuffing") + "/diff"));
            post(client, "/api/v1/releases/isms-incidents-2026/" + K, 200, "RELEASED");
            assertEquals("incident-released", stateOf(client));
        }
        try (var client = start()) {
            goTo(client, "incident-release-released-meanwhile");
            var refused = post(client, "/api/v1/releases/isms-incidents-2026/" + K, 409, "DOCUMENT_RELEASED");
            assertAll(
                    () -> assertEquals("incidents/" + K + "/v1", refused.path("tag").asText()),
                    () -> assertEquals("released", get(client, dom("credential-stuffing")).path("state").asText()),
                    () -> assertEquals("incident-release-released-meanwhile", stateOf(client)));
        }
    }

    @Test
    @DisplayName("the two diff variants of the release states are the baseline diff with one change each, so a change of the baseline cannot leave them behind")
    void shouldDeriveTheDiffVariantsFromTheBaselineDiff() {
        var changed = data("incident-credential-stuffing-diff.json").deepCopy();
        var reopened = data("incident-credential-stuffing-diff.json").deepCopy();
        for (var section : changed.path("sections")) {
            for (var change : section.path("changes")) {
                if ("triage".equals(section.path("part").asText()) && "/tickets".equals(change.path("pointer").asText())) {
                    ((com.fasterxml.jackson.databind.node.ArrayNode) change.path("after")).add("SEC-2201");
                }
            }
        }
        for (var section : reopened.path("sections")) {
            if ("review".equals(section.path("part").asText())) {
                var changes = (com.fasterxml.jackson.databind.node.ArrayNode) section.path("changes");
                for (int i = changes.size() - 1; i >= 0; i--) {
                    if ("/completion".equals(changes.get(i).path("pointer").asText())) {
                        changes.remove(i);
                    }
                }
            }
        }
        assertAll(
                () -> assertEquals(changed, data("incident-credential-stuffing-diff-changed.json")),
                () -> assertEquals(reopened, data("incident-credential-stuffing-diff-reopened.json")),
                () -> assertNotEquals(data("incident-credential-stuffing-diff.json"), changed),
                () -> assertNotEquals(data("incident-credential-stuffing-diff.json"), reopened));
    }

    @Test
    @DisplayName("a release refused because a stage was reopened meanwhile answers STAGES_OPEN with the stage and stays refused")
    void shouldRefuseTheReleaseWithOpenStages() {
        try (var client = start()) {
            goTo(client, "incident-release-stages-open");
            var inReview = get(client, dom("credential-stuffing"));
            var refused = post(client, "/api/v1/releases/isms-incidents-2026/" + K, 422, "STAGES_OPEN");
            var missing = refused.path("stages").get(0).path("missing");
            assertAll(
                    () -> assertEquals("in-review", inReview.path("state").asText()),
                    () -> assertEquals("completed", stageStatus(inReview, "review")),
                    () -> assertEquals(1, refused.path("stages").size()),
                    () -> assertEquals("review", refused.path("stages").get(0).path("stage").asText()),
                    () -> assertTrue(missing.isArray()),
                    () -> assertEquals(0, missing.size()),
                    () -> assertEquals("incident-release-stages-open-refused", stateOf(client)));
            // After the refusal the page reads the review as reopened, and every further release is refused again.
            var reopened = get(client, dom("credential-stuffing"));
            assertAll(
                    () -> assertEquals("in-review", reopened.path("state").asText()),
                    () -> assertEquals("open", stageStatus(reopened, "review")),
                    () -> assertEquals(data("incident-credential-stuffing-diff-reopened.json"),
                            get(client, doc("credential-stuffing") + "/diff")));
            post(client, "/api/v1/releases/isms-incidents-2026/" + K, 422, "STAGES_OPEN");
            assertEquals("incident-release-stages-open-refused", stateOf(client));
        }
    }

    /** @return the status of a stage of an incident as it reads */
    private static String stageStatus(JsonNode incident, String stage) {
        for (var entry : incident.path("stages")) {
            if (stage.equals(entry.path("id").asText())) {
                return entry.path("status").asText();
            }
        }
        throw new AssertionError("no stage " + stage);
    }

    @Test
    @DisplayName("the create makes a tenth incident that reads, has one revision, heads the year, is searched and counted")
    void shouldCreateAnIncident() {
        try (var client = start()) {
            var created = post(client, REPOSITORY, 201, "CREATED");
            var read = get(client, "/api/v1/incidents/2026/" + NEW);
            var years = get(client, "/api/v1/incidents").path("years").get(0);
            var list = get(client, "/api/v1/incidents/2026");
            var search = get(client, "/api/v1/search?q=vpn").path("results");
            assertAll(
                    () -> assertEquals("incident-created", stateOf(client)),
                    () -> assertEquals(NEW, created.path("id").asText()),
                    () -> assertEquals("/incidents/2026/" + NEW, created.path("address").asText()),
                    () -> assertEquals("Suspicious logins from the VPN gateway", read.path("title").asText()),
                    () -> assertEquals(read, get(client, REPOSITORY + "/" + NEW)),
                    () -> assertEquals(created.path("parts").path("triage").path("blob"), read.path("parts").path("triage").path("blob")),
                    () -> assertEquals(created.path("parts").path("data").path("blob"), read.path("parts").path("data").path("blob")),
                    () -> assertEquals(List.of("open", "not-applicable", "open", "not-applicable", "open"), statuses(read)),
                    () -> assertEquals(List.of(false, true, false, true, false),
                            read.path("stages").findValues("unanswered").stream().map(JsonNode::asBoolean).toList()),
                    () -> assertEquals(0, read.path("deadlines").size()),
                    () -> assertEquals(1, get(client, REPOSITORY + "/" + NEW + "/revisions").path("revisions").size()),
                    () -> assertEquals(8, list.path("incidents").size()),
                    () -> assertEquals(NEW, list.path("incidents").get(0).path("id").asText()),
                    () -> assertEquals(8, years.path("incidents").asInt()),
                    () -> assertEquals(7, years.path("open").asInt()),
                    () -> assertEquals(1, search.size()),
                    () -> assertEquals(NEW, search.get(0).path("id").asText()),
                    () -> assertEquals(read("suspicious-logins"), get(client, dom("suspicious-logins"))),
                    () -> assertEquals(read("suspicious-logins"), get(client, doc("suspicious-logins"))),
                    () -> assertEquals(data("incident-suspicious-logins-revisions.json"),
                            get(client, doc("suspicious-logins") + "/revisions")),
                    () -> assertEquals(8, get(client, REPOSITORY).path("documents").size()),
                    () -> assertEquals(NEW, get(client, REPOSITORY).path("documents").get(0).path("id").asText()));
        }
    }

    @Test
    @DisplayName("the create without a title is 422 REQUIRED; without the repository of the year the years list only 2025 and the create is 404")
    void shouldRefuseTheCreate() {
        try (var client = start()) {
            goTo(client, "incident-create-invalid");
            var response = client.change("POST", REPOSITORY, "{}");
            var error = json(response).path("errors").get(0);
            assertAll(
                    () -> assertEquals(422, response.statusCode()),
                    () -> assertEquals("data", error.path("part").asText()),
                    () -> assertEquals("/title", error.path("pointer").asText()),
                    () -> assertEquals("REQUIRED", error.path("code").asText()));
        }
        try (var client = start()) {
            goTo(client, "incident-year-missing");
            var years = get(client, "/api/v1/incidents").path("years");
            assertAll(
                    () -> assertEquals(1, years.size()),
                    () -> assertEquals(2025, years.get(0).path("year").asInt()),
                    () -> assertFalse(years.get(0).path("current").asBoolean()),
                    () -> assertEquals(404, client.get("/api/v1/incidents/2026").statusCode()),
                    () -> assertEquals(404, client.change("POST", REPOSITORY, "{}").statusCode()));
        }
    }

    @Test
    @DisplayName("a state overrides only what it names: the other incidents read as in the base")
    void shouldKeepTheBaseElsewhere() {
        try (var client = start()) {
            post(client, stage("credential-stuffing", "review", "complete"), 200, "COMPLETED");
            for (String slug : List.of("card-data", "wrong-recipient", "suspicious-logins", "notification-outage")) {
                assertEquals(read(slug), get(client, dom(slug)), slug);
            }
            assertEquals(STAGES.size(), get(client, dom("card-data")).path("stages").size());
        }
    }

    @Test
    @DisplayName("the report of a state says what its incident reads: state, asOf, source, the deadlines with their status and the notices")
    void shouldFollowTheReportsOfTheStates() {
        int checked = 0;
        for (String state : STATES) {
            var routes = WORKSHOP.path("states").path(state).path("routes");
            for (String key : fieldNames(routes)) {
                var matcher = Pattern.compile("GET /api/v1/incidents/2026/([0-9A-Z]{26})/report").matcher(key);
                if (!matcher.matches()) {
                    continue;
                }
                if (!routes.path(key).has("body_file")) {
                    continue;
                }
                checked++;
                var read = data(routes.path("GET /api/v1/incidents/2026/" + matcher.group(1)).path("body_file").asText());
                var report = data(routes.path(key).path("body_file").asText());
                String adoc = report.path("adoc").asText();
                String notifications = adoc.substring(adoc.indexOf("== Notifications"), adoc.indexOf("== Triage"));
                var notices = read.path("parts").path("notifications").path("value");
                assertAll(state + " " + key,
                        () -> assertEquals(read.path("id"), report.path("id")),
                        () -> assertEquals(read.path("title"), report.path("title")),
                        () -> assertEquals(read.path("asOf"), report.path("asOf")),
                        () -> assertEquals(read.path("frozen").asBoolean() ? "committed" : "generated", report.path("source").asText()),
                        () -> assertTrue(adoc.contains("\n|State |" + read.path("state").asText() + "\n")),
                        () -> assertEquals(notices.isEmpty(), notifications.contains("Nothing recorded.")),
                        () -> notices.fieldNames().forEachRemaining(name -> {
                            if (notices.path(name).has("sent-at")) {
                                assertTrue(notifications.contains(notices.path(name).path("sent-at").asText()), name);
                            }
                        }),
                        () -> IncidentFixtures.deadlinesOf(read).stream().filter(d -> d.due() != null).forEach(d -> assertTrue(
                                adoc.lines().anyMatch(line -> line.startsWith("|") && line.contains("|" + d.due() + " |"
                                        + ("MISSED".equals(d.status()) ? "*MISSED*" : d.status()) + " |"
                                        + (d.sentAt() == null ? "not sent" : d.sentAt()))), d.rule() + " " + d.status())));
            }
        }
        assertTrue(checked >= 10, "the reports of the states that were found: " + checked);
    }

    @Test
    @DisplayName("after the release a save and a draft of the credential stuffing answer DOCUMENT_RELEASED with the tag; in ready the save passes")
    void shouldRefuseAStaleSaveAfterTheRelease() {
        for (String state : List.of("incident-released", "incident-release-released-meanwhile")) {
            try (var client = start()) {
                goTo(client, state);
                for (var request : List.of(List.of("POST", doc("credential-stuffing") + "/save"),
                        List.of("PUT", "/api/v1/drafts/isms-incidents-2026/" + K))) {
                    var response = client.change(request.get(0), request.get(1), "{}");
                    assertAll(state + " " + request,
                            () -> assertEquals(409, response.statusCode()),
                            () -> assertEquals("DOCUMENT_RELEASED", json(response).path("outcome").asText()),
                            () -> assertEquals("incidents/" + K + "/v1", json(response).path("tag").asText()),
                            () -> assertEquals(state, stateOf(client)));
                }
            }
        }
        try (var client = start()) {
            post(client, doc("credential-stuffing") + "/save", 200, "SAVED");
        }
    }

    @Test
    @DisplayName("while the repository of the year is missing, no incident of 2026 and no report of it is read; 2025 is")
    void shouldHideTheIncidentsOfTheMissingYear() {
        try (var client = start()) {
            goTo(client, "incident-year-missing");
            for (String slug : IncidentFixtures.SLUGS) {
                if (IncidentFixtures.yearOf(slug) != 2026) {
                    assertEquals(200, client.get(dom(slug)).statusCode(), slug);
                    continue;
                }
                for (String path : List.of(dom(slug), dom(slug) + "/report", doc(slug), doc(slug) + "/revisions")) {
                    var response = client.get(path);
                    assertAll(path, () -> assertEquals(404, response.statusCode()),
                            () -> assertEquals("NOT_FOUND", json(response).path("outcome").asText()));
                }
            }
            assertEquals(404, client.get(REPOSITORY).statusCode());
            assertEquals(404, client.get(doc("credential-stuffing") + "/diff?from=released").statusCode());
        }
    }

    @Test
    @DisplayName("every Git write of the incidents is answered 503 in the outage, derived from the writes of the base; the draft stays out")
    void shouldCoverEveryGitWriteInTheOutage() {
        var degraded = readScenario("degraded");
        for (var scenario : List.of(
                List.of(WORKSHOP, WORKSHOP.path("states").path("incident-git-unavailable").path("routes")),
                List.of(degraded, degraded.path("states").path("unreachable").path("routes")))) {
            var profile = scenario.get(0);
            var outage = scenario.get(1);
            Set<String> writes = new TreeSet<>();
            for (String key : fieldNames(profile.path("routes"))) {
                if (key.startsWith("POST ") && key.contains("/isms-incidents-") && !key.contains("/releases/")) {
                    writes.add(key);
                }
            }
            for (String state : fieldNames(profile.path("states"))) {
                var links = profile.path("states").path(state).path("links");
                for (String name : fieldNames(links)) {
                    var link = links.path(name);
                    if ("POST".equals(link.path("method").asText()) && link.path("path").asText().contains("/isms-incidents-")) {
                        writes.add("POST " + link.path("path").asText());
                    }
                }
            }
            assertTrue(writes.size() >= 30, profile.path("name").asText() + ": " + writes.size());
            for (String write : writes) {
                assertEquals(503, outage.path(write).path("status").asInt(), profile.path("name").asText() + " " + write);
            }
            for (String key : fieldNames(outage)) {
                assertFalse(key.startsWith("PUT ") && key.contains("/drafts/isms-incidents-"), "the draft stays outside the outage: " + key);
            }
        }
    }
}
