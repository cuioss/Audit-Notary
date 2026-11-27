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
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

import static de.cuioss.notary.audit.mock.IsmsTest.data;
import static de.cuioss.notary.audit.mock.IsmsTest.list;
import static de.cuioss.notary.audit.mock.IsmsTest.reviewStatus;
import static de.cuioss.notary.audit.mock.IsmsTest.risk;
import static de.cuioss.notary.audit.mock.IsmsTest.text;
import static de.cuioss.notary.audit.mock.IsmsTest.texts;
import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The states of the profile workshop for the ISMS lens (doc/specification/rest-api.adoc, <em>ISMS Requests</em>): the create of a risk
 * with and without an origin, the number that is taken, the completion, the submit and the reopening of a risk, the release of R-018
 * with the step-up and the diff that changed, the new and the released policy, the refusals and the outage, plus the first number
 * of {@code empty}, the Due items of {@code release} and the reads of a release of a document with the diffs between two of them.
 * The files of the states are checked against the derivation like the base files ({@link IsmsTest}); the chains walk the links the
 * way the web app does.
 */
@DisplayName("The ISMS lens: the states of workshop")
class IsmsStatesTest {

    private static final String REGISTER = "/api/v1/documents/isms-register/";
    private static final String CORE = "/api/v1/documents/isms-core/";
    private static final String RELEASES = "/api/v1/releases/";
    private static final String DRAFT = "/api/v1/isms/risks/draft?origin=";
    private static final String GAP = "samm-assessments:assessment/payments-2026-q2#sm";
    private static final String THREAT = "threat-models:threat-model/payment-api-checkout-flow#T-02";
    private static final String THREAT_MODEL = "/api/v1/threat-models/payment-api/checkout-flow";
    private static final String POLICY = "01JZB1C3E5G7J9M1P3R5T7W9Y2";
    private static final String SDP = "01JZB3E5G7J9M1P3R5T7W9Y1B4";
    private static final String SCOPE = "01JZB4F6H8K0N2Q4S6V8X0Z2C5";
    private static final String AUDIT = "01JZB6H8K0N2Q4S6V8X0Z2C4E7";
    private static final String NEW_DOCUMENT = "01JZB9M1P3R5T7W9Y1B3D5F7H0";
    private static final ClassLoader CLASS_LOADER = IsmsStatesTest.class.getClassLoader();
    private static final CanonicalAddresses ADDRESSES = CanonicalAddresses.load(MockClient.MAPPER, CLASS_LOADER);
    private static final JsonNode WORKSHOP = scenario("workshop");
    /** The states of the ISMS lens in {@code workshop}: the ones that this step adds (by name). */
    private static final List<String> STATES = List.of("risk-created", "risk-origin-gap", "risk-created-from-gap", "risk-origin-threat",
            "risk-created-from-threat", "risk-origin-not-recorded", "risk-created-not-recorded", "risk-release-transfer-pending",
            "risk-number-taken", "risk-created-taken", "risk-create-invalid", "risk-completed", "risk-submitted", "risk-reopened",
            "risk-released", "risk-release-step-up", "risk-release-stepped-up", "risk-release-changed", "risk-release-changed-refused",
            "risk-release-changed-reviewed", "risk-release-released-meanwhile", "risk-saved-by-other", "risk-invalid",
            "risk-origin-read-only", "isms-document-created", "isms-document-released", "isms-document-release-step-up",
            "isms-document-release-stepped-up", "isms-document-saved-by-other", "isms-document-invalid", "isms-git-unavailable");

    private static JsonNode scenario(String name) {
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

    private static String sha(String text) {
        try {
            var digest = MessageDigest.getInstance("SHA-1").digest(text.getBytes(StandardCharsets.UTF_8));
            var out = new StringBuilder();
            for (int i = 0; i < 4; i++) {
                out.append(String.format("%02x", digest[i]));
            }
            return out.substring(0, 7);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The saves of the part {@code data} that the history of a read names, the create counting as the first: the blob is {@code h7(id/data/n)}. */
    private static int saves(JsonNode read) {
        int n = 0;
        for (var item : read.path("history")) {
            if ("create".equals(item.path("kind").asText())) {
                n++;
            } else if ("save".equals(item.path("kind").asText()) && "data".equals(item.path("part").asText())) {
                n += item.path("count").asInt(1);
            }
        }
        return n;
    }

    private static JsonNode state(String name) {
        return WORKSHOP.path("states").path(name);
    }

    private static JsonNode link(String stateName, String linkName) {
        return state(stateName).path("links").path(linkName);
    }

    private static JsonNode route(String stateName, String key) {
        return state(stateName).path("routes").path(key);
    }

    /** The answer a route or a link names: the file or the inline body. */
    private static JsonNode answer(JsonNode route) {
        return route.has("body_file") ? data(route.path("body_file").asText()) : route.path("body");
    }

    private static String encodeOrigin(String reference) {
        return reference.replace(":", "%3A").replace("/", "%2F").replace("#", "%23");
    }

    /** {@code [total, open, untreated, transferred]} of the model of a threat model read, the rule of the evaluation. */
    private static List<Integer> figures(JsonNode read) {
        var model = read.path("parts").path("model").path("value");
        Set<String> named = new HashSet<>();
        model.path("mitigations").forEach(mitigation -> named.add(mitigation.path("attributes").path("threat").asText()));
        int open = 0;
        int untreated = 0;
        int transferred = 0;
        for (var threat : model.path("threats")) {
            var attributes = threat.path("attributes");
            boolean carries = attributes.has("transferred");
            transferred += carries ? 1 : 0;
            if ("open".equals(attributes.path("status").asText())) {
                open++;
                untreated += !named.contains(threat.path("id").asText()) && !carries ? 1 : 0;
            }
        }
        return List.of(model.path("threats").size(), open, untreated, transferred);
    }

    private static List<Integer> countsOf(JsonNode threats) {
        return List.of(threats.path("total").asInt(), threats.path("open").asInt(), threats.path("untreated").asInt(),
                threats.path("transferred").asInt());
    }

    /** A row of the register list, derived from the read of the risk: the rule of <em>The Register of Risks</em>. */
    private static void assertRow(JsonNode row, JsonNode read) {
        var value = read.path("parts").path("data").path("value");
        String id = read.path("id").asText();
        assertAll(id,
                () -> assertEquals(id.toLowerCase(), row.path("entry").asText()),
                () -> assertEquals(value.path("title"), row.path("title")),
                () -> assertEquals(read.path("state"), row.path("state")),
                () -> assertEquals(read.path("version"), row.path("version")),
                () -> assertEquals(value.path("rating"), row.path("rating")),
                () -> assertEquals(text(value.path("treatment")), text(row.path("treatment"))),
                () -> assertEquals("team:" + row.path("owner").path("id").asText(), value.path("owner").asText()),
                () -> assertEquals(text(value.path("review-due")), text(row.path("reviewDue"))),
                () -> assertEquals(reviewStatus(text(row.path("reviewDue"))), row.path("reviewStatus").asText()),
                () -> assertEquals(text(value.path("origin")), row.path("origin").isNull() ? null : row.path("origin").path("ref").asText()),
                () -> assertEquals(read.path("history").get(0).path("at"), row.path("updatedAt")),
                () -> assertEquals(read.path("history").get(0).path("by"), row.path("updatedBy")),
                () -> assertEquals(read.path("release").isNull() ? null : read.path("release").path("tag").asText(),
                        row.path("release").isNull() ? null : row.path("release").path("tag").asText()),
                () -> assertEquals("/isms/risks/" + id.toLowerCase(), row.path("address").asText()));
    }

    /** The register list of a state: the rows of the base except the ones that the state replaces or appends, ordered by number. */
    private static void assertListOfState(String file, Map<String, JsonNode> reads, Set<String> unreadRows) {
        var base = data("isms-register.json");
        var list = data(file);
        Map<String, JsonNode> baseRows = new LinkedHashMap<>();
        base.path("risks").forEach(row -> baseRows.put(row.path("id").asText(), row));
        List<String> ids = new ArrayList<>();
        list.path("risks").forEach(row -> ids.add(row.path("id").asText()));
        Set<String> expected = new TreeSet<>(baseRows.keySet());
        expected.addAll(reads.keySet());
        expected.addAll(unreadRows);
        assertAll(file,
                () -> assertEquals(base.path("today"), list.path("today")),
                () -> assertFalse(list.path("truncated").asBoolean()),
                () -> assertEquals(List.copyOf(expected), ids),
                () -> list.path("risks").forEach(row -> {
                    String id = row.path("id").asText();
                    if (reads.containsKey(id)) {
                        assertRow(row, reads.get(id));
                    } else if (baseRows.containsKey(id)) {
                        assertEquals(baseRows.get(id), row, id + " keeps the row of the base");
                    }
                }));
    }

    // ---------------------------------------------------------------------------------------------------------- the data
    @Nested
    @DisplayName("Mirrors: the files of the states keep the derivation")
    class Mirrors {

        private final List<String> variants = List.of("risk-r-043.json", "risk-r-043-gap.json", "risk-r-043-threat.json", "risk-r-043-threat-in-review.json",
                "risk-r-001.json", "risk-r-044.json", "risk-r-042-completed.json", "risk-r-042-in-review.json", "risk-r-012-reopened.json",
                "risk-r-018-released.json", "risk-r-018-at-v2.json");

        @Test
        @DisplayName("every read of a risk in a state has the shape of the base: the history, the blob, the state and the transitions of its history")
        void shouldKeepTheInvariantsOfTheReads() {
            List<String> names = new ArrayList<>(variants);
            for (String base : List.of("risk-r-004", "risk-r-007", "risk-r-009", "risk-r-012", "risk-r-015", "risk-r-018", "risk-r-021", "risk-r-042")) {
                names.add(base + ".json");
            }
            for (String name : names) {
                var read = data(name);
                var history = list(read.path("history"));
                int releases = (int) history.stream().filter(item -> "release".equals(item.path("kind").asText())).count();
                String last = history.get(0).path("kind").asText();
                String stateName = "release".equals(last) ? "released" : "submit".equals(last) ? "in-review" : "draft";
                int version = "release".equals(last) ? releases : releases + 1;
                String id = read.path("id").asText();
                var value = read.path("parts").path("data").path("value");
                assertAll(name,
                        () -> assertEquals(read.path("state").asText(), stateName),
                        () -> assertEquals(version, read.path("version").asInt()),
                        () -> assertEquals("create", history.get(history.size() - 1).path("kind").asText()),
                        () -> assertEquals(value.path("title"), read.path("title")),
                        () -> assertEquals(releases == 0, read.path("release").isNull()),
                        () -> assertEquals(sha(id + "/data/" + saves(read)), read.path("parts").path("data").path("blob").asText()),
                        () -> assertEquals(savedAtOfLastSave(read), read.path("parts").path("data").path("savedAt")),
                        () -> assertEquals(stateName.equals("draft") ? List.of("isms.submit") : stateName.equals("in-review") ? List.of("isms.release") : List.of(),
                                list(read.path("transitions")).stream().map(item -> item.path("id").asText()).toList()),
                        () -> assertEquals(releases == 0 ? null : "risks/" + id + "/v" + releases,
                                read.path("release").isNull() ? null : read.path("release").path("tag").asText()),
                        () -> assertEquals(name.endsWith("-at-v2.json"), read.path("frozen").asBoolean()),
                        () -> assertEquals(name.endsWith("-at-v2.json"), read.has("at")));
            }
        }

        private JsonNode savedAtOfLastSave(JsonNode read) {
            for (var item : read.path("history")) {
                if (("save".equals(item.path("kind").asText()) && "data".equals(item.path("part").asText())) || "create".equals(item.path("kind").asText())) {
                    return item.path("at");
                }
            }
            throw new IllegalStateException(read.path("id").asText());
        }

        @Test
        @DisplayName("the register list of a state has the rows of the base and, for what the state names, the rows that its reads derive")
        void shouldKeepTheRegisterLists() {
            assertListOfState("isms-register-created.json", Map.of("R-043", data("risk-r-043.json")), Set.of());
            assertListOfState("isms-register-gap.json", Map.of("R-043", data("risk-r-043-gap.json")), Set.of());
            assertListOfState("isms-register-threat.json", Map.of("R-043", data("risk-r-043-threat.json")), Set.of());
            assertListOfState("isms-register-taken.json", Map.of("R-044", data("risk-r-044.json")), Set.of("R-043"));
            assertListOfState("isms-register-completed.json", Map.of("R-042", data("risk-r-042-completed.json")), Set.of());
            assertListOfState("isms-register-submitted.json", Map.of("R-042", data("risk-r-042-in-review.json")), Set.of());
            assertListOfState("isms-register-reopened.json", Map.of("R-012", data("risk-r-012-reopened.json")), Set.of());
            assertListOfState("isms-register-released.json", Map.of("R-018", data("risk-r-018-released.json")), Set.of());
            var empty = data("isms-register-empty-created.json");
            assertAll(
                    () -> assertEquals(1, empty.path("risks").size()),
                    () -> assertRow(empty.path("risks").get(0), data("risk-r-001.json")),
                    () -> assertFalse(empty.path("truncated").asBoolean()),
                    () -> assertEquals("2026-11-26", empty.path("today").asText()));
            // the taken number: R-043 is Jordan Weber's draft of 09:40, R-044 is Alex's
            var rows = list(data("isms-register-taken.json").path("risks"));
            var taken = rows.stream().filter(row -> "R-043".equals(row.path("id").asText())).findFirst().orElseThrow();
            assertAll(
                    () -> assertEquals("p-2b7f10", taken.path("updatedBy").path("pseudonym").asText()),
                    () -> assertEquals("2026-11-26T09:40:00Z", taken.path("updatedAt").asText()),
                    () -> assertEquals("draft", taken.path("state").asText()),
                    () -> assertEquals(10, rows.size()),
                    () -> assertEquals("p-4c1a9e", rows.get(9).path("updatedBy").path("pseudonym").asText()));
        }

        @Test
        @DisplayName("the risks of the three origins carry the origin of their create, and the drafts of the base are their prefill")
        void shouldAgreeWithTheDrafts() {
            var gap = data("risk-r-043-gap.json").path("parts").path("data").path("value");
            var threat = data("risk-r-043-threat.json").path("parts").path("data").path("value");
            var draftGap = data("isms-draft-gap-sm.json");
            var draftThreat = data("isms-draft-threat-t02.json");
            var origins = Map.of(GAP, link("risk-origin-gap", "created-from-gap"), THREAT, link("risk-origin-threat", "created-from-threat"));
            assertAll(
                    () -> assertEquals(GAP, gap.path("origin").asText()),
                    () -> assertEquals(THREAT, threat.path("origin").asText()),
                    () -> assertEquals(draftGap.path("fields").path("/title"), gap.path("title")),
                    () -> assertEquals(draftGap.path("fields").path("/owner"), gap.path("owner")),
                    () -> assertEquals(draftGap.path("fields").path("/treatment"), gap.path("treatment")),
                    () -> assertTrue(gap.path("description").asText().startsWith(draftGap.path("fields").path("/description").asText())),
                    () -> assertEquals(draftThreat.path("fields").path("/title"), threat.path("title")),
                    () -> assertEquals(draftThreat.path("fields").path("/owner"), threat.path("owner")),
                    () -> assertTrue(threat.path("description").asText().startsWith(draftThreat.path("fields").path("/description").asText())),
                    () -> assertFalse(draftThreat.path("fields").has("/treatment"), "an open threat prefills no treatment"),
                    () -> assertFalse(data("risk-r-043.json").path("parts").path("data").path("value").has("origin")),
                    () -> assertFalse(answer(WORKSHOP.path("states").path("ready").path("links").path("create-risk")).has("origin")),
                    () -> origins.forEach((reference, created) -> {
                        assertEquals(reference, answer(created).path("origin").path("ref").asText());
                        assertTrue(answer(created).path("origin").path("recorded").asBoolean());
                    }),
                    () -> assertEquals(THREAT, answer(link("risk-origin-not-recorded", "created-not-recorded")).path("origin").path("ref").asText()),
                    () -> assertFalse(answer(link("risk-origin-not-recorded", "created-not-recorded")).path("origin").path("recorded").asBoolean()));
        }

        @Test
        @DisplayName("the gaps of payments with the risk of the gap differ from the base in the gap sm only, and name the risk of the register")
        void shouldCarryTheRiskOfTheGap() {
            var base = data("isms-gaps-payments.json");
            var changed = data("isms-gaps-payments-risk.json");
            var register = data("isms-register-gap.json");
            var row = list(register.path("risks")).stream().filter(item -> GAP.equals(item.path("origin").path("ref").asText())).findFirst().orElseThrow();
            assertEquals(base.path("gaps").size(), changed.path("gaps").size());
            for (int i = 0; i < base.path("gaps").size(); i++) {
                var before = base.path("gaps").get(i);
                var after = changed.path("gaps").get(i);
                if ("sm".equals(before.path("practice").asText())) {
                    assertNull(text(before.path("risk")));
                    assertEquals(row.path("id").asText(), after.path("risk").path("id").asText());
                    assertEquals(row.path("entry").asText(), after.path("risk").path("entry").asText());
                    assertEquals(row.path("title").asText(), after.path("risk").path("title").asText());
                    assertEquals(row.path("address").asText(), after.path("risk").path("address").asText());
                    assertEquals(before.path("reference"), after.path("reference"));
                } else {
                    assertEquals(before, after, before.path("practice").asText());
                }
            }
            assertEquals(base.path("assessment"), changed.path("assessment"));
        }

        @Test
        @DisplayName("the transfer is written in the threat model of the state: T-02 carries R-043, the counts and every list say so")
        void shouldRecordTheTransfer() {
            var base = data("threat-model-payment-api-checkout-flow.json");
            var read = data("threat-model-payment-api-checkout-flow-transferred.json");
            var model = read.path("parts").path("model").path("value");
            var baseModel = base.path("parts").path("model").path("value");
            var t02 = list(model.path("threats")).stream().filter(item -> "T-02".equals(item.path("id").asText())).findFirst().orElseThrow();
            var risk = data("risk-r-043-threat.json");
            var evaluation = list(data("reports-threat-evaluation-transferred.json").path("models")).stream()
                    .filter(row -> "checkout-flow".equals(row.path("model").asText())).findFirst().orElseThrow();
            var page = data("threat-model-service-payment-api-transferred.json").path("models").get(0);
            var indexRow = list(data("threat-models-index-transferred.json").path("documents")).stream()
                    .filter(row -> "payment-api-checkout-flow".equals(row.path("id").asText())).findFirst().orElseThrow();
            var baseEvaluation = data("reports-threat-evaluation.json");
            var transferredEvaluation = data("reports-threat-evaluation-transferred.json");
            assertAll(
                    () -> assertEquals("isms-register:risk/" + risk.path("id").asText(), t02.path("attributes").path("transferred").asText()),
                    () -> assertEquals(THREAT, "threat-models:threat-model/payment-api-checkout-flow#" + t02.path("id").asText()),
                    () -> assertEquals(THREAT, risk.path("parts").path("data").path("value").path("origin").asText()),
                    () -> assertEquals("open", t02.path("attributes").path("status").asText()),
                    () -> assertEquals(List.of(9, 3, 1, 2), figures(read)),
                    () -> assertEquals(List.of(9, 3, 2, 1), figures(base)),
                    () -> assertEquals(countsOf(read.path("threats")), figures(read)),
                    () -> assertEquals(figures(read), countsOf(evaluation.path("threats"))),
                    () -> assertEquals(figures(read), countsOf(page.path("threats"))),
                    () -> assertEquals("draft", read.path("state").asText()),
                    () -> assertEquals(4, read.path("version").asInt()),
                    () -> assertEquals(base.path("release"), read.path("release")),
                    () -> assertEquals(List.of("threat-model.submit"), list(read.path("transitions")).stream().map(item -> item.path("id").asText()).toList()),
                    () -> assertEquals("draft", evaluation.path("state").asText()),
                    () -> assertEquals("draft", page.path("state").asText()),
                    () -> assertEquals("draft", indexRow.path("state").asText()),
                    () -> assertEquals(4, indexRow.path("version").asInt()),
                    () -> assertEquals(read.path("history").get(0).path("at"), indexRow.path("updatedAt")),
                    () -> assertEquals(read.path("history").get(0).path("at"), page.path("updatedAt")),
                    () -> assertEquals(read.path("review").path("lastReview"), evaluation.path("lastReview")),
                    () -> assertEquals(read.path("review").path("reviewDue"), evaluation.path("reviewDue")),
                    () -> assertEquals(read.path("review").path("status"), evaluation.path("status")),
                    () -> assertEquals(base.path("history").size() + 1, read.path("history").size()),
                    () -> assertEquals("model", read.path("history").get(0).path("part").asText()),
                    () -> assertEquals("p-4c1a9e", read.path("history").get(0).path("by").path("pseudonym").asText()),
                    () -> assertEquals(sha("payment-api-checkout-flow/model/4"), read.path("parts").path("model").path("blob").asText()),
                    // only T-02 changed in the model
                    () -> {
                        for (int i = 0; i < baseModel.path("threats").size(); i++) {
                            var before = baseModel.path("threats").get(i);
                            var after = model.path("threats").get(i);
                            if ("T-02".equals(before.path("id").asText())) {
                                assertNotEquals(before, after);
                            } else {
                                assertEquals(before, after, before.path("id").asText());
                            }
                        }
                        assertEquals(baseModel.path("mitigations"), model.path("mitigations"));
                    },
                    // the other rows of the evaluation are those of the base
                    () -> {
                        assertEquals(baseEvaluation.path("models").size(), transferredEvaluation.path("models").size());
                        for (int i = 0; i < baseEvaluation.path("models").size(); i++) {
                            if (!"checkout-flow".equals(baseEvaluation.path("models").get(i).path("model").asText())) {
                                assertEquals(baseEvaluation.path("models").get(i), transferredEvaluation.path("models").get(i));
                            }
                        }
                    });
        }

        @Test
        @DisplayName("R-018 released: the read, the read of the release, the revisions and the register as of now agree with each other")
        void shouldAgreeTheReleaseOfR018() {
            var released = data("risk-r-018-released.json");
            var at = data("risk-r-018-at-v2.json");
            var revisions = data("risk-r-018-released-revisions.json").path("revisions");
            var now = data("reports-risks-released.json");
            var baseNow = data("reports-risks-now.json");
            var summary = list(now.path("risks")).stream().filter(item -> "R-018".equals(item.path("id").asText())).findFirst().orElseThrow();
            var value = released.path("parts").path("data").path("value");
            assertAll(
                    () -> assertEquals("risks/R-018/v2", released.path("release").path("tag").asText()),
                    () -> assertEquals("2026-11-26T10:05:00Z", released.path("release").path("at").asText()),
                    () -> assertEquals("p-7d2e58", released.path("release").path("by").path("pseudonym").asText()),
                    () -> assertEquals(released.path("release"), at.path("release")),
                    () -> assertEquals(value, at.path("parts").path("data").path("value")),
                    () -> assertEquals(released.path("history"), at.path("history")),
                    () -> assertEquals(0, released.path("transitions").size()),
                    () -> assertEquals(0, at.path("transitions").size()),
                    () -> assertEquals("v2", revisions.get(0).path("ref").asText()),
                    () -> assertEquals("release", revisions.get(0).path("kind").asText()),
                    () -> assertEquals(at.path("at").path("commit"), revisions.get(0).path("commit")),
                    () -> assertEquals(released.path("release").path("at"), revisions.get(0).path("at")),
                    () -> assertEquals(data("risk-r-018-revisions.json").path("revisions").size() + 1, revisions.size()),
                    () -> assertEquals(at.path("at").path("commit"), now.path("asOf").path("commit")),
                    () -> assertEquals(released.path("release").path("at"), now.path("asOf").path("at")),
                    () -> assertEquals(2, summary.path("version").asInt()),
                    () -> assertEquals(released.path("release").path("at"), summary.path("releasedAt")),
                    () -> assertEquals(value.path("title"), summary.path("title")),
                    () -> assertEquals(value.path("rating"), summary.path("rating")),
                    () -> assertEquals(value.path("treatment"), summary.path("treatment")),
                    () -> assertEquals(value.path("review-due"), summary.path("reviewDue")),
                    () -> assertEquals("team:" + summary.path("owner").path("id").asText(), value.path("owner").asText()),
                    () -> assertEquals(baseNow.path("tags"), now.path("tags")),
                    () -> assertEquals(baseNow.path("risks").size(), now.path("risks").size()),
                    () -> {
                        for (int i = 0; i < baseNow.path("risks").size(); i++) {
                            if (!"R-018".equals(baseNow.path("risks").get(i).path("id").asText())) {
                                assertEquals(baseNow.path("risks").get(i), now.path("risks").get(i));
                            }
                        }
                    });
        }

        @Test
        @DisplayName("the policies of the states: the new draft, the released one with its read of the release, and the lists")
        void shouldAgreeThePolicies() {
            var created = data("isms-doc-incident-communication-policy.json");
            var released = data("isms-doc-secure-development-policy-released.json");
            var at = data("isms-doc-secure-development-policy-at-v2.json");
            var revisions = data("isms-doc-secure-development-policy-released-revisions.json").path("revisions");
            var createdList = list(data("isms-documents-created.json").path("documents"));
            var releasedList = list(data("isms-documents-released.json").path("documents"));
            var base = list(data("isms-documents.json").path("documents"));
            var row = createdList.get(0);
            var releasedRow = releasedList.stream().filter(item -> SDP.equals(item.path("id").asText())).findFirst().orElseThrow();
            assertAll(
                    () -> assertTrue(Pattern.compile("[0-9A-HJKMNP-TV-Z]{26}").matcher(created.path("id").asText()).matches()),
                    () -> assertEquals(NEW_DOCUMENT, created.path("id").asText()),
                    () -> assertEquals("policy", created.path("kind").asText()),
                    () -> assertEquals("Incident communication policy", created.path("title").asText()),
                    () -> assertEquals("role:ciso", created.path("parts").path("data").path("value").path("owner").asText()),
                    () -> assertFalse(created.path("parts").path("data").path("value").has("statements")),
                    () -> assertEquals(sha(NEW_DOCUMENT + "/data/1"), created.path("parts").path("data").path("blob").asText()),
                    () -> assertEquals(9, createdList.size()),
                    () -> assertEquals(NEW_DOCUMENT, row.path("id").asText()),
                    () -> assertEquals(created.path("history").get(0).path("at"), row.path("updatedAt")),
                    () -> assertEquals(created.path("state"), row.path("state")),
                    () -> assertEquals("/isms/documents/" + NEW_DOCUMENT, row.path("address").asText()),
                    () -> assertEquals(base, createdList.subList(1, 9)),
                    () -> assertEquals(1, data("isms-doc-incident-communication-policy-revisions.json").path("revisions").size()),
                    () -> assertEquals("policies/" + SDP + "/v2", released.path("release").path("tag").asText()),
                    () -> assertEquals("released", released.path("state").asText()),
                    () -> assertEquals(2, released.path("version").asInt()),
                    () -> assertEquals(0, released.path("transitions").size()),
                    () -> assertEquals(released.path("release"), at.path("release")),
                    () -> assertEquals(released.path("parts"), at.path("parts")),
                    () -> assertTrue(at.path("frozen").asBoolean()),
                    () -> assertEquals("v2", at.path("at").path("ref").asText()),
                    () -> assertEquals("v2", revisions.get(0).path("ref").asText()),
                    () -> assertEquals(at.path("at").path("commit"), revisions.get(0).path("commit")),
                    () -> assertEquals(released.path("release").path("tag"), revisions.get(0).path("tag")),
                    () -> assertEquals("released", releasedRow.path("state").asText()),
                    () -> assertEquals(2, releasedRow.path("version").asInt()),
                    () -> assertEquals(released.path("release").path("at"), releasedRow.path("updatedAt")),
                    () -> assertEquals(released.path("release").path("tag"), releasedRow.path("release").path("tag")),
                    () -> assertEquals(8, releasedList.size()),
                    () -> assertEquals(releasedList.stream().map(item -> item.path("updatedAt").asText()).sorted(java.util.Comparator.reverseOrder()).toList(),
                            releasedList.stream().map(item -> item.path("updatedAt").asText()).toList()));
        }

        @Test
        @DisplayName("the diffs of the states: R-018 with the change that was saved meanwhile, and R-043 against nothing")
        void shouldAgreeTheDiffsOfTheStates() {
            var base = data("isms-diff-r-018-released.json");
            var changed = data("isms-diff-r-018-released-changed.json");
            var r43 = data("isms-diff-r-043-released.json");
            var value = data("risk-r-043-threat-in-review.json").path("parts").path("data").path("value");
            var pointers = list(changed.path("sections").path(0).path("changes")).stream().map(change -> change.path("pointer").asText()).toList();
            assertAll(
                    () -> assertEquals(list(base.path("sections").path(0).path("changes")).stream().map(change -> change.path("pointer").asText()).toList(), pointers),
                    () -> assertEquals(base.path("from"), changed.path("from")),
                    () -> assertEquals(List.of("OPS-211", "OPS-212", "OPS-213"), texts(list(changed.path("sections").path(0).path("changes")).stream()
                            .filter(change -> "/issues".equals(change.path("pointer").asText())).findFirst().orElseThrow().path("after"))),
                    () -> assertTrue(r43.path("from").isNull()),
                    () -> assertEquals("working", r43.path("to").asText()),
                    () -> assertEquals(value.size(), r43.path("sections").path(0).path("changes").size()),
                    () -> r43.path("sections").path(0).path("changes").forEach(change -> {
                        assertTrue(change.path("before").isNull());
                        assertEquals(value.at(change.path("pointer").asText()), change.path("after"));
                    }));
        }

        @Test
        @DisplayName("the search index of risk-created has the seventeen entries of the ISMS: the base and R-043 with the title and the state of its read")
        void shouldIndexTheNewRisk() {
            var base = list(data("documents-index.json").path("entries"));
            var created = list(data("documents-index-isms-created.json").path("entries"));
            var added = created.stream().filter(entry -> !base.contains(entry)).toList();
            assertAll(
                    () -> assertEquals(base.size() + 1, created.size()),
                    () -> assertTrue(created.containsAll(base)),
                    () -> assertEquals(1, added.size()),
                    () -> assertEquals("isms-register", added.get(0).path("repository").asText()),
                    () -> assertEquals("R-043", added.get(0).path("id").asText()),
                    () -> assertEquals(data("risk-r-043.json").path("title"), added.get(0).path("title")),
                    () -> assertEquals(data("risk-r-043.json").path("state"), added.get(0).path("state")),
                    () -> assertEquals("/isms/risks/r-043", added.get(0).path("address").asText()),
                    () -> assertEquals(17, created.stream().filter(entry -> "isms".equals(entry.path("category").asText())).count()));
        }
    }

    // ---------------------------------------------------------------------------------------------------------- the states
    @Nested
    @DisplayName("The states: the links walk the chains and the answers agree with the files")
    class Chains {

        @Test
        @DisplayName("workshop has every state of the ISMS lens, each with a description, and every link of ready names its state")
        void shouldHaveTheStates() {
            for (String name : STATES) {
                assertTrue(state(name).has("description"), name);
                assertFalse(state(name).path("description").asText().isBlank(), name);
            }
            var ready = state("ready").path("links");
            assertAll(
                    () -> assertEquals("risk-created", ready.path("create-risk").path("next").asText()),
                    () -> assertEquals("risk-reopened", ready.path("save-r012").path("next").asText()),
                    () -> assertEquals("risk-completed", ready.path("save-r042").path("next").asText()),
                    () -> assertEquals("risk-released", ready.path("release-r018").path("next").asText()),
                    () -> assertEquals("isms-document-created", ready.path("create-document").path("next").asText()),
                    () -> assertEquals("isms-document-released", ready.path("release-policy").path("next").asText()),
                    // the base has no route for the saves of R-012 and R-042 (their links are the saves), nor for a release or a create
                    () -> assertFalse(WORKSHOP.path("routes").has("POST " + REGISTER + "R-012/save")),
                    () -> assertFalse(WORKSHOP.path("routes").has("POST " + REGISTER + "R-042/save")),
                    () -> assertFalse(WORKSHOP.path("routes").has("POST " + RELEASES + "isms-register/R-018")),
                    () -> assertFalse(WORKSHOP.path("routes").has("POST /api/v1/documents/isms-register")),
                    () -> assertFalse(WORKSHOP.path("routes").has("POST /api/v1/documents/isms-core")));
        }

        @Test
        @DisplayName("the events of the states are the generic ones: document-created, document-saved and document-transitioned")
        void shouldPlayTheEvents() {
            Map<String, List<String>> expected = Map.ofEntries(Map.entry("risk-created", List.of("document-created")),
                    Map.entry("risk-created-from-gap", List.of("document-created")),
                    Map.entry("risk-created-from-threat", List.of("document-created", "document-saved")),
                    Map.entry("risk-created-not-recorded", List.of("document-created")), Map.entry("risk-created-taken", List.of("document-created")),
                    Map.entry("risk-completed", List.of("document-saved")), Map.entry("risk-submitted", List.of("document-transitioned")),
                    Map.entry("risk-reopened", List.of("document-saved")), Map.entry("risk-released", List.of("document-transitioned")),
                    Map.entry("isms-document-created", List.of("document-created")),
                    Map.entry("isms-document-released", List.of("document-transitioned")));
            expected.forEach((name, events) -> assertEquals(events, list(state(name).path("events")).stream().map(item -> item.path("event").asText()).toList(), name));
            var transferred = state("risk-created-from-threat").path("events").get(1).path("data");
            assertAll(
                    () -> assertEquals("threat-models", transferred.path("repository").asText()),
                    () -> assertEquals("payment-api-checkout-flow", transferred.path("id").asText()),
                    () -> assertEquals("model", transferred.path("part").asText()),
                    () -> assertEquals(List.of("/threats"), texts(transferred.path("fields"))),
                    () -> assertEquals("p-4c1a9e", transferred.path("by").path("pseudonym").asText()),
                    () -> assertEquals(Set.of("risk"), Set.of(state("risk-created").path("events").get(0).path("data").path("kind").asText())),
                    () -> assertEquals("R-043", state("risk-created").path("events").get(0).path("data").path("id").asText()),
                    () -> assertEquals("R-044", state("risk-created-taken").path("events").get(0).path("data").path("id").asText()),
                    () -> assertEquals("policy", state("isms-document-created").path("events").get(0).path("data").path("kind").asText()),
                    () -> assertEquals("risk-created", scenario("empty").path("states").path("ready").path("links").path("create-risk").path("next").asText()),
                    () -> assertEquals("document-created", scenario("empty").path("states").path("risk-created").path("events").get(0).path("event").asText()));
        }

        @Test
        @DisplayName("create-risk answers 201 R-043 and moves to risk-created: the read, the revisions, the register of nine, the search and the saves follow")
        void shouldCreateARisk() {
            try (var client = start()) {
                var before = get(client, "/api/v1/isms/register");
                var created = post(client, "/api/v1/documents/isms-register", 201, "CREATED");
                var read = get(client, REGISTER + "R-043");
                var register = get(client, "/api/v1/isms/register");
                var search = get(client, "/api/v1/search?q=signing+keys").path("results");
                var saved = post(client, REGISTER + "R-043/save", 200, "SAVED");
                assertAll(
                        () -> assertEquals("risk-created", stateOf(client)),
                        () -> assertEquals("R-043", created.path("id").asText()),
                        () -> assertEquals("/isms/risks/r-043", created.path("address").asText()),
                        () -> assertEquals("2026-11-26T09:41:00Z", created.path("at").asText()),
                        () -> assertFalse(created.has("origin")),
                        () -> assertEquals(read.path("parts").path("data").path("blob"), created.path("parts").path("data").path("blob")),
                        () -> assertEquals(read.path("history").get(0).path("at"), created.path("at")),
                        () -> assertEquals("draft", read.path("state").asText()),
                        () -> assertEquals(8, before.path("risks").size()),
                        () -> assertEquals(9, register.path("risks").size()),
                        () -> assertEquals("R-043", register.path("risks").get(8).path("id").asText()),
                        () -> assertEquals("none", register.path("risks").get(8).path("reviewStatus").asText()),
                        () -> assertEquals(1, get(client, REGISTER + "R-043/revisions").path("revisions").size()),
                        () -> assertEquals("create", get(client, REGISTER + "R-043/revisions").path("revisions").get(0).path("kind").asText()),
                        () -> assertEquals(risk("R-018"), get(client, REGISTER + "R-018")),
                        () -> assertTrue(list(search).stream().anyMatch(hit -> "R-043".equals(hit.path("id").asText())), "the search finds the risk"),
                        () -> assertEquals("draft", saved.path("state").asText()),
                        () -> assertEquals(1, saved.path("version").asInt()),
                        () -> assertEquals(200, client.change("PUT", "/api/v1/drafts/isms-register/R-043", "{}").statusCode()),
                        // the references and the generic list are those of the base (a documented limit)
                        () -> assertEquals(data("isms-register-documents.json"), get(client, "/api/v1/documents/isms-register")));
            }
        }

        @Test
        @DisplayName("risk-origin-gap: the create records the origin, the gap carries the risk, the draft of the gap is ORIGIN_HAS_RISK")
        void shouldCreateFromAGap() {
            try (var client = start()) {
                get(client, DRAFT + encodeOrigin(GAP));
                goTo(client, "risk-origin-gap");
                var created = post(client, "/api/v1/documents/isms-register", 201, "CREATED");
                var read = get(client, REGISTER + "R-043");
                var gaps = get(client, "/api/v1/samm/payments/gaps");
                var draft = client.get(DRAFT + encodeOrigin(GAP));
                var register = get(client, "/api/v1/isms/register");
                var sm = list(gaps.path("gaps")).stream().filter(gap -> "sm".equals(gap.path("practice").asText())).findFirst().orElseThrow();
                assertAll(
                        () -> assertEquals("risk-created-from-gap", stateOf(client)),
                        () -> assertEquals(GAP, created.path("origin").path("ref").asText()),
                        () -> assertTrue(created.path("origin").path("recorded").asBoolean()),
                        () -> assertEquals(GAP, read.path("parts").path("data").path("value").path("origin").asText()),
                        () -> assertEquals("R-043", sm.path("risk").path("id").asText()),
                        () -> assertEquals(15, gaps.path("gaps").size()),
                        () -> assertEquals(409, draft.statusCode()),
                        () -> assertEquals("ORIGIN_HAS_RISK", json(draft).path("outcome").asText()),
                        () -> assertEquals("R-043", json(draft).path("risk").path("id").asText()),
                        () -> assertEquals(sm.path("risk"), json(draft).path("risk")),
                        () -> assertEquals("Payments 2026 Q2, Strategy and Metrics", register.path("risks").get(8).path("origin").path("title").asText()),
                        // the threat model is not touched by a gap
                        () -> assertEquals("released", get(client, THREAT_MODEL).path("state").asText()),
                        () -> assertEquals(data("threat-model-payment-api-checkout-flow.json"), get(client, THREAT_MODEL)));
            }
        }

        @Test
        @DisplayName("risk-origin-threat: the create records the transfer in the threat model: T-02 carries R-043, draft v4, the evaluation counts it")
        void shouldCreateFromAThreat() {
            try (var client = start()) {
                goTo(client, "risk-origin-threat");
                var draftBefore = client.get(DRAFT + encodeOrigin(THREAT));
                var created = post(client, "/api/v1/documents/isms-register", 201, "CREATED");
                var model = get(client, THREAT_MODEL);
                var evaluation = get(client, "/api/v1/reports/threat-evaluation");
                var draft = client.get(DRAFT + encodeOrigin(THREAT));
                var row = list(evaluation.path("models")).stream().filter(item -> "checkout-flow".equals(item.path("model").asText())).findFirst().orElseThrow();
                assertAll(
                        () -> assertEquals(200, draftBefore.statusCode()),
                        () -> assertEquals("risk-created-from-threat", stateOf(client)),
                        () -> assertTrue(created.path("origin").path("recorded").asBoolean()),
                        () -> assertEquals(THREAT, created.path("origin").path("ref").asText()),
                        () -> assertEquals("draft", model.path("state").asText()),
                        () -> assertEquals(4, model.path("version").asInt()),
                        () -> assertEquals("models/payment-api-checkout-flow/v3", model.path("release").path("tag").asText()),
                        () -> assertEquals(List.of("threat-model.submit"), list(model.path("transitions")).stream().map(item -> item.path("id").asText()).toList()),
                        () -> assertEquals(model, get(client, "/api/v1/documents/threat-models/payment-api-checkout-flow")),
                        () -> assertEquals(data("threat-model-payment-api-checkout-flow-transferred-revisions.json"),
                                get(client, "/api/v1/documents/threat-models/payment-api-checkout-flow/revisions")),
                        () -> assertEquals(List.of(9, 3, 1, 2), countsOf(row.path("threats"))),
                        () -> assertEquals("draft", row.path("state").asText()),
                        () -> assertEquals(List.of(9, 3, 1, 2), countsOf(get(client, "/api/v1/threat-models/payment-api").path("models").get(0).path("threats"))),
                        () -> assertEquals("draft", list(get(client, "/api/v1/documents/threat-models").path("documents")).stream()
                                .filter(item -> "payment-api-checkout-flow".equals(item.path("id").asText())).findFirst().orElseThrow().path("state").asText()),
                        () -> assertEquals(409, draft.statusCode()),
                        () -> assertEquals("ORIGIN_HAS_RISK", json(draft).path("outcome").asText()),
                        () -> assertEquals("R-043", json(draft).path("risk").path("id").asText()),
                        () -> assertEquals("Account takeover by credential stuffing at checkout", get(client, REGISTER + "R-043").path("title").asText()),
                        () -> assertEquals("high", get(client, REGISTER + "R-043").path("parts").path("data").path("value").path("rating").asText()));
            }
        }

        @Test
        @DisplayName("risk-origin-not-recorded: the origin is recorded: false, the threat model is unchanged, and the release is refused TRANSFER_PENDING")
        void shouldKeepThePendingTransfer() {
            try (var client = start()) {
                goTo(client, "risk-origin-not-recorded");
                var created = post(client, "/api/v1/documents/isms-register", 201, "CREATED");
                var draft = client.get(DRAFT + encodeOrigin(THREAT));
                assertAll(
                        () -> assertEquals("risk-created-not-recorded", stateOf(client)),
                        () -> assertFalse(created.path("origin").path("recorded").asBoolean()),
                        () -> assertEquals(THREAT, created.path("origin").path("ref").asText()),
                        () -> assertEquals(data("threat-model-payment-api-checkout-flow.json"), get(client, THREAT_MODEL)),
                        () -> assertEquals(data("reports-threat-evaluation.json"), get(client, "/api/v1/reports/threat-evaluation")),
                        () -> assertEquals(THREAT, get(client, REGISTER + "R-043").path("parts").path("data").path("value").path("origin").asText()),
                        () -> assertEquals(9, get(client, "/api/v1/isms/register").path("risks").size()),
                        () -> assertEquals("ORIGIN_HAS_RISK", json(draft).path("outcome").asText()));
                // the submit goes on, the release is refused while the write fails
                var submitted = post(client, REGISTER + "R-043/transitions/isms.submit", 200, "TRANSITIONED");
                var review = get(client, REGISTER + "R-043");
                var diff = get(client, REGISTER + "R-043/diff?from=released");
                assertAll(
                        () -> assertEquals("risk-release-transfer-pending", stateOf(client)),
                        () -> assertEquals("in-review", submitted.path("state").asText()),
                        () -> assertEquals("in-review", review.path("state").asText()),
                        () -> assertEquals(List.of("isms.release"), list(review.path("transitions")).stream().map(item -> item.path("id").asText()).toList()),
                        () -> assertEquals(data("isms-diff-r-043-released.json"), diff));
                for (int attempt = 0; attempt < 2; attempt++) {
                    var response = client.change("POST", RELEASES + "isms-register/R-043", "{}");
                    var body = json(response);
                    assertAll(
                            () -> assertEquals(409, response.statusCode()),
                            () -> assertEquals("TRANSFER_PENDING", body.path("outcome").asText()),
                            () -> assertEquals(THREAT, body.path("origin").path("ref").asText()),
                            () -> assertFalse(body.path("origin").path("recorded").asBoolean()),
                            () -> assertEquals("risk-release-transfer-pending", stateOf(client)));
                }
            }
        }

        @Test
        @DisplayName("risk-number-taken: the create answers R-044, the register has ten entries and R-043 is Jordan Weber's")
        void shouldTakeTheNextNumber() {
            try (var client = start()) {
                goTo(client, "risk-number-taken");
                var created = post(client, "/api/v1/documents/isms-register", 201, "CREATED");
                var register = get(client, "/api/v1/isms/register");
                assertAll(
                        () -> assertEquals("risk-created-taken", stateOf(client)),
                        () -> assertEquals("R-044", created.path("id").asText()),
                        () -> assertEquals("/isms/risks/r-044", created.path("address").asText()),
                        () -> assertEquals("2026-11-26T09:43:00Z", created.path("at").asText()),
                        () -> assertEquals(10, register.path("risks").size()),
                        () -> assertEquals(List.of("R-043", "R-044"), list(register.path("risks")).stream().skip(8).map(row -> row.path("id").asText()).toList()),
                        () -> assertEquals("Signing keys of the release pipeline are not rotated", get(client, REGISTER + "R-044").path("title").asText()),
                        () -> assertEquals(created.path("parts").path("data").path("blob"), get(client, REGISTER + "R-044").path("parts").path("data").path("blob")),
                        () -> assertEquals(1, get(client, REGISTER + "R-044/revisions").path("revisions").size()),
                        () -> assertEquals(404, client.get(REGISTER + "R-043").statusCode(), "reading R-043 is not routed: a documented limit"));
            }
        }

        @Test
        @DisplayName("the create of a risk with errors is 422 with REQUIRED, REFERENCE_NOT_FOUND and ENUM")
        void shouldRefuseTheCreate() {
            try (var client = start()) {
                goTo(client, "risk-create-invalid");
                var response = client.change("POST", "/api/v1/documents/isms-register", "{}");
                var errors = list(json(response).path("errors"));
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("VALIDATION", json(response).path("outcome").asText()),
                        () -> assertEquals(List.of("/title:REQUIRED", "/owner:REFERENCE_NOT_FOUND", "/rating:ENUM"),
                                errors.stream().map(error -> error.path("pointer").asText() + ":" + error.path("code").asText()).toList()),
                        () -> assertTrue(errors.stream().allMatch(error -> "data".equals(error.path("part").asText()))));
            }
        }

        @Test
        @DisplayName("save-r042 completes the draft, the submit that was refused in ready is the link of risk-completed and moves to risk-submitted")
        void shouldCompleteAndSubmitTheDraft() {
            try (var client = start()) {
                var refused = client.change("POST", REGISTER + "R-042/transitions/isms.submit", "{}");
                var saved = post(client, REGISTER + "R-042/save", 200, "SAVED");
                var read = get(client, REGISTER + "R-042");
                var register = get(client, "/api/v1/isms/register");
                assertAll(
                        () -> assertEquals(422, refused.statusCode()),
                        () -> assertEquals("MANDATORY_FIELDS_MISSING", json(refused).path("outcome").asText()),
                        () -> assertEquals("risk-completed", stateOf(client)),
                        () -> assertEquals("draft", saved.path("state").asText()),
                        () -> assertEquals("2026-11-26T10:12:00Z", saved.path("at").asText()),
                        () -> assertEquals(read.path("parts").path("data").path("blob"), saved.path("parts").path("data").path("blob")),
                        () -> assertEquals("mitigate", read.path("parts").path("data").path("value").path("treatment").asText()),
                        () -> assertTrue(read.path("parts").path("data").path("value").has("treatment-notes")),
                        () -> assertEquals(List.of("isms.submit"), list(read.path("transitions")).stream().map(item -> item.path("id").asText()).toList()),
                        () -> assertEquals("mitigate", list(register.path("risks")).stream().filter(row -> "R-042".equals(row.path("id").asText()))
                                .findFirst().orElseThrow().path("treatment").asText()),
                        () -> assertEquals(8, register.path("risks").size()));
                var submitted = post(client, REGISTER + "R-042/transitions/isms.submit", 200, "TRANSITIONED");
                var review = get(client, REGISTER + "R-042");
                var after = list(get(client, "/api/v1/isms/register").path("risks")).stream().filter(row -> "R-042".equals(row.path("id").asText())).findFirst().orElseThrow();
                assertAll(
                        () -> assertEquals("risk-submitted", stateOf(client)),
                        () -> assertEquals("in-review", submitted.path("state").asText()),
                        () -> assertEquals(1, submitted.path("version").asInt()),
                        () -> assertEquals("2026-11-26T10:14:00Z", submitted.path("at").asText()),
                        () -> assertEquals("in-review", review.path("state").asText()),
                        () -> assertEquals(List.of("isms.release"), list(review.path("transitions")).stream().map(item -> item.path("id").asText()).toList()),
                        () -> assertTrue(review.path("transitions").get(0).path("release").asBoolean()),
                        () -> assertEquals("in-review", after.path("state").asText()),
                        () -> assertEquals(1, after.path("version").asInt()));
            }
        }

        @Test
        @DisplayName("save-r012 reopens the released risk as draft v3 with the release v2; the as-of lists are those of the base")
        void shouldReopenAReleasedRisk() {
            try (var client = start()) {
                var saved = post(client, REGISTER + "R-012/save", 200, "SAVED");
                var read = get(client, REGISTER + "R-012");
                var row = list(get(client, "/api/v1/isms/register").path("risks")).stream().filter(item -> "R-012".equals(item.path("id").asText())).findFirst().orElseThrow();
                assertAll(
                        () -> assertEquals("risk-reopened", stateOf(client)),
                        () -> assertEquals("draft", saved.path("state").asText()),
                        () -> assertEquals(3, saved.path("version").asInt()),
                        () -> assertEquals(read.path("parts").path("data").path("blob"), saved.path("parts").path("data").path("blob")),
                        () -> assertEquals("draft", read.path("state").asText()),
                        () -> assertEquals(3, read.path("version").asInt()),
                        () -> assertEquals("risks/R-012/v2", read.path("release").path("tag").asText()),
                        () -> assertEquals(List.of("isms.submit"), list(read.path("transitions")).stream().map(item -> item.path("id").asText()).toList()),
                        () -> assertEquals("draft", row.path("state").asText()),
                        () -> assertEquals("due-soon", row.path("reviewStatus").asText()),
                        () -> assertEquals(data("reports-risks-now.json"), get(client, "/api/v1/isms/risks")),
                        () -> assertEquals(data("risk-r-012-at-v2.json"), get(client, REGISTER + "R-012?at=v2")),
                        () -> assertEquals(data("risk-r-012-revisions.json"), get(client, REGISTER + "R-012/revisions")));
            }
        }

        @Test
        @DisplayName("release-r018 releases v2 by Noor Haddad: the read is released, ?at=v2 is frozen, the revisions end with v2, the register as of now lists v2")
        void shouldReleaseARisk() {
            try (var client = start()) {
                var before = get(client, REGISTER + "R-018");
                var released = post(client, RELEASES + "isms-register/R-018", 200, "RELEASED");
                var read = get(client, REGISTER + "R-018");
                var at = get(client, REGISTER + "R-018?at=v2");
                var revisions = get(client, REGISTER + "R-018/revisions");
                var now = get(client, "/api/v1/isms/risks");
                var row = list(get(client, "/api/v1/isms/register").path("risks")).stream().filter(item -> "R-018".equals(item.path("id").asText())).findFirst().orElseThrow();
                var summary = list(now.path("risks")).stream().filter(item -> "R-018".equals(item.path("id").asText())).findFirst().orElseThrow();
                assertAll(
                        () -> assertEquals("in-review", before.path("state").asText()),
                        () -> assertEquals("risk-released", stateOf(client)),
                        () -> assertEquals("risks/R-018/v2", released.path("tag").asText()),
                        () -> assertEquals("2026-11-26T10:05:00Z", released.path("at").asText()),
                        () -> assertEquals(released.path("tag"), read.path("release").path("tag")),
                        () -> assertEquals(released.path("at"), read.path("release").path("at")),
                        () -> assertEquals("released", read.path("state").asText()),
                        () -> assertEquals(2, read.path("version").asInt()),
                        () -> assertEquals(0, read.path("transitions").size()),
                        () -> assertTrue(at.path("frozen").asBoolean()),
                        () -> assertEquals("v2", at.path("at").path("ref").asText()),
                        () -> assertEquals("v2", revisions.path("revisions").get(0).path("ref").asText()),
                        () -> assertEquals("released", row.path("state").asText()),
                        () -> assertEquals(2, row.path("version").asInt()),
                        () -> assertEquals(2, summary.path("version").asInt()),
                        () -> assertEquals("2026-11-26T10:05:00Z", summary.path("releasedAt").asText()),
                        () -> assertEquals("e41c9a8", now.path("asOf").path("commit").asText()),
                        () -> assertEquals(data("risk-r-018-at-v1.json"), get(client, REGISTER + "R-018?at=v1")),
                        () -> assertEquals(risk("R-009"), get(client, REGISTER + "R-009")));
            }
        }

        @Test
        @DisplayName("the release of R-018 with the step-up: 403 STEP_UP_REQUIRED, then 200 RELEASED and risk-released")
        void shouldReleaseWithTheStepUp() {
            try (var client = start()) {
                goTo(client, "risk-release-step-up");
                var response = client.change("POST", RELEASES + "isms-register/R-018", "{}");
                assertAll(
                        () -> assertEquals(403, response.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(response).path("outcome").asText()),
                        () -> assertEquals("/api/v1/auth/login?step-up=mfa", json(response).path("stepUp").asText()),
                        () -> assertEquals("risk-release-stepped-up", stateOf(client)));
                var done = post(client, RELEASES + "isms-register/R-018", 200, "RELEASED");
                assertAll(
                        () -> assertEquals("risks/R-018/v2", done.path("tag").asText()),
                        () -> assertEquals("risk-released", stateOf(client)),
                        () -> assertEquals("released", get(client, REGISTER + "R-018").path("state").asText()));
            }
        }

        @Test
        @DisplayName("the release of R-018 changed since the review is refused until the diff is read again, then it passes")
        void shouldRefuseTheChangedRelease() {
            try (var client = start()) {
                goTo(client, "risk-release-changed");
                String diff = REGISTER + "R-018/diff?from=released";
                assertEquals(data("isms-diff-r-018-released.json"), get(client, diff));
                for (int attempt = 0; attempt < 2; attempt++) {
                    var response = client.change("POST", RELEASES + "isms-register/R-018", "{}");
                    assertAll(
                            () -> assertEquals(409, response.statusCode()),
                            () -> assertEquals("CHANGED_SINCE_REVIEW", json(response).path("outcome").asText()),
                            () -> assertEquals("risk-release-changed-refused", stateOf(client)));
                }
                var reviewed = get(client, diff);
                assertAll(
                        () -> assertEquals(data("isms-diff-r-018-released-changed.json"), reviewed),
                        () -> assertNotEquals(data("isms-diff-r-018-released.json"), reviewed),
                        () -> assertEquals("risk-release-changed-reviewed", stateOf(client)),
                        () -> assertEquals(reviewed, get(client, diff)));
                var done = post(client, RELEASES + "isms-register/R-018", 200, "RELEASED");
                assertAll(
                        () -> assertEquals("risks/R-018/v2", done.path("tag").asText()),
                        () -> assertEquals("risk-released", stateOf(client)));
            }
        }

        @Test
        @DisplayName("released meanwhile: the release answers DOCUMENT_RELEASED with the tag and the risk reads released; a save is not refused")
        void shouldAnswerTheReleaseOfSomebodyElse() {
            try (var client = start()) {
                goTo(client, "risk-release-released-meanwhile");
                var response = client.change("POST", RELEASES + "isms-register/R-018", "{}");
                assertAll(
                        () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("DOCUMENT_RELEASED", json(response).path("outcome").asText()),
                        () -> assertEquals("risks/R-018/v2", json(response).path("tag").asText()),
                        () -> assertEquals("released", get(client, REGISTER + "R-018").path("state").asText()),
                        () -> assertEquals(data("risk-r-018-at-v2.json"), get(client, REGISTER + "R-018?at=v2")),
                        () -> assertEquals(200, client.change("POST", REGISTER + "R-018/save", "{}").statusCode()));
            }
        }

        @Test
        @DisplayName("the conflict of R-018 names the description and the review date with both values and Jordan Weber")
        void shouldReportTheConflictOfARisk() {
            try (var client = start()) {
                goTo(client, "risk-saved-by-other");
                var response = client.change("POST", REGISTER + "R-018/save", "{}");
                var conflict = json(response).path("conflicts").get(0);
                var fields = list(conflict.path("fields"));
                assertAll(
                        () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("CONFLICT", json(response).path("outcome").asText()),
                        () -> assertEquals("data", conflict.path("part").asText()),
                        () -> assertEquals(List.of("/description", "/review-due"), fields.stream().map(field -> field.path("pointer").asText()).toList()),
                        () -> assertEquals("2027-05-05", fields.get(1).path("own").asText()),
                        () -> assertEquals("2027-04-05", fields.get(1).path("other").asText()),
                        () -> assertNotEquals(fields.get(0).path("own"), fields.get(0).path("other")),
                        () -> assertTrue(fields.stream().allMatch(field -> "p-2b7f10".equals(field.path("by").path("pseudonym").asText()))),
                        () -> assertTrue(fields.stream().allMatch(field -> "Jordan Weber".equals(field.path("by").path("name").asText()))),
                        () -> assertEquals(risk("R-018").path("parts").path("data").path("value").path("description"), fields.get(0).path("own")));
            }
        }

        @Test
        @DisplayName("the refusals: invalid risk (save and draft), the origin that is read-only, invalid policy, the conflict of the policy")
        void shouldRefuse() {
            var schema = data("categories-isms-schema.json");
            try (var client = start()) {
                goTo(client, "risk-invalid");
                for (var request : List.of(List.of("POST", REGISTER + "R-018/save"), List.of("PUT", "/api/v1/drafts/isms-register/R-018"))) {
                    var response = client.change(request.get(0), request.get(1), "{}");
                    var errors = list(json(response).path("errors"));
                    assertAll(request.toString(),
                            () -> assertEquals(422, response.statusCode()),
                            () -> assertEquals(List.of("/owner:REFERENCE_NOT_FOUND", "/issues/0:MAX_LENGTH", "/related/0:REFERENCE_NOT_FOUND"),
                                    errors.stream().map(error -> error.path("pointer").asText() + ":" + error.path("code").asText()).toList()),
                            () -> assertTrue(errors.stream().allMatch(error -> "data".equals(error.path("part").asText()))),
                            () -> errors.forEach(error -> assertTrue(schema.path("kinds").get(4).path("schema").path("properties")
                                    .has(error.path("pointer").asText().split("/")[1]))));
                }
                goTo(client, "risk-origin-read-only");
                var response = client.change("POST", REGISTER + "R-015/save", "{}");
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("/origin", json(response).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("READ_ONLY", json(response).path("errors").get(0).path("code").asText()),
                        () -> assertTrue(schema.path("kinds").get(4).path("schema").path("properties").path("origin").path("readOnly").asBoolean()));
                goTo(client, "isms-document-invalid");
                for (var request : List.of(List.of("POST", CORE + POLICY + "/save"), List.of("PUT", "/api/v1/drafts/isms-core/" + POLICY))) {
                    var doc = client.change(request.get(0), request.get(1), "{}");
                    var errors = list(json(doc).path("errors"));
                    assertAll(request.toString(),
                            () -> assertEquals(422, doc.statusCode()),
                            () -> assertEquals(List.of("/owner:REFERENCE_NOT_FOUND", "/applies-to/0:REFERENCE_NOT_FOUND"),
                                    errors.stream().map(error -> error.path("pointer").asText() + ":" + error.path("code").asText()).toList()),
                            () -> errors.forEach(error -> assertTrue(schema.path("kinds").get(0).path("schema").path("properties")
                                    .has(error.path("pointer").asText().split("/")[1]))));
                }
                goTo(client, "isms-document-saved-by-other");
                var conflict = client.change("POST", CORE + POLICY + "/save", "{}");
                var field = json(conflict).path("conflicts").get(0).path("fields").get(0);
                assertAll(
                        () -> assertEquals(409, conflict.statusCode()),
                        () -> assertEquals("CONFLICT", json(conflict).path("outcome").asText()),
                        () -> assertEquals("/statements", field.path("pointer").asText()),
                        () -> assertNotEquals(field.path("own"), field.path("other")),
                        () -> assertEquals("Jordan Weber", field.path("by").path("name").asText()),
                        () -> assertTrue(field.path("own").asText().startsWith(data("isms-doc-information-security-policy.json").path("parts").path("data")
                                .path("value").path("statements").asText())));
            }
        }

        @Test
        @DisplayName("create-document creates the draft policy: the read, the revisions and the list of nine; release-policy releases v2 and the list follows")
        void shouldCreateAndReleaseAPolicy() {
            try (var client = start()) {
                var created = post(client, "/api/v1/documents/isms-core", 201, "CREATED");
                var read = get(client, CORE + NEW_DOCUMENT);
                var list = get(client, "/api/v1/documents/isms-core");
                assertAll(
                        () -> assertEquals("isms-document-created", stateOf(client)),
                        () -> assertEquals(NEW_DOCUMENT, created.path("id").asText()),
                        () -> assertEquals("/isms/documents/" + NEW_DOCUMENT, created.path("address").asText()),
                        () -> assertEquals("2026-11-26T09:41:00Z", created.path("at").asText()),
                        () -> assertEquals(read.path("parts").path("data").path("blob"), created.path("parts").path("data").path("blob")),
                        () -> assertEquals("draft", read.path("state").asText()),
                        () -> assertEquals("policy", read.path("kind").asText()),
                        () -> assertEquals(1, get(client, CORE + NEW_DOCUMENT + "/revisions").path("revisions").size()),
                        () -> assertEquals(9, list.path("documents").size()),
                        () -> assertEquals(NEW_DOCUMENT, list.path("documents").get(0).path("id").asText()));
            }
            try (var client = start()) {
                var before = get(client, CORE + SDP);
                var released = post(client, RELEASES + "isms-core/" + SDP, 200, "RELEASED");
                var read = get(client, CORE + SDP);
                var at = get(client, CORE + SDP + "?at=v2");
                var row = list(get(client, "/api/v1/documents/isms-core").path("documents")).stream().filter(item -> SDP.equals(item.path("id").asText())).findFirst().orElseThrow();
                assertAll(
                        () -> assertEquals("in-review", before.path("state").asText()),
                        () -> assertEquals("isms-document-released", stateOf(client)),
                        () -> assertEquals("policies/" + SDP + "/v2", released.path("tag").asText()),
                        () -> assertEquals("released", read.path("state").asText()),
                        () -> assertEquals(2, read.path("version").asInt()),
                        () -> assertEquals(released.path("tag"), read.path("release").path("tag")),
                        () -> assertTrue(at.path("frozen").asBoolean()),
                        () -> assertEquals("v2", get(client, CORE + SDP + "/revisions").path("revisions").get(0).path("ref").asText()),
                        () -> assertEquals("released", row.path("state").asText()),
                        () -> assertEquals(data("isms-doc-secure-development-policy-at-v1.json"), get(client, CORE + SDP + "?at=v1")));
            }
        }

        @Test
        @DisplayName("the release of the policy with the step-up: 403 STEP_UP_REQUIRED, then 200 RELEASED and isms-document-released")
        void shouldReleaseAPolicyWithTheStepUp() {
            try (var client = start()) {
                goTo(client, "isms-document-release-step-up");
                var response = client.change("POST", RELEASES + "isms-core/" + SDP, "{}");
                assertAll(
                        () -> assertEquals(403, response.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(response).path("outcome").asText()),
                        () -> assertEquals("/api/v1/auth/login?step-up=mfa", json(response).path("stepUp").asText()),
                        () -> assertEquals("isms-document-release-stepped-up", stateOf(client)));
                var done = post(client, RELEASES + "isms-core/" + SDP, 200, "RELEASED");
                assertAll(
                        () -> assertEquals("policies/" + SDP + "/v2", done.path("tag").asText()),
                        () -> assertEquals("isms-document-released", stateOf(client)));
            }
        }

        @Test
        @DisplayName("every Git write of the ISMS is answered 503 in the outage, derived from the writes of the base and the links of ready; the draft stays out")
        void shouldCoverEveryGitWriteInTheOutage() {
            var outage = state("isms-git-unavailable").path("routes");
            Set<String> writes = new TreeSet<>();
            for (String key : fieldNames(WORKSHOP.path("routes"))) {
                if (key.startsWith("POST ") && (key.contains("/isms-register/") || key.contains("/isms-core/")) && !key.contains("/releases/")) {
                    writes.add(key);
                }
            }
            for (var link : state("ready").path("links")) {
                String path = link.path("path").asText();
                if ("POST".equals(link.path("method").asText()) && (path.contains("isms-register") || path.contains("isms-core"))) {
                    writes.add("POST " + path);
                }
            }
            assertEquals(13, writes.size(), writes.toString());
            for (String write : writes) {
                assertEquals(503, outage.path(write).path("status").asInt(), write);
                assertEquals("GIT_UNAVAILABLE", outage.path(write).path("body").path("outcome").asText(), write);
            }
            for (String key : fieldNames(outage)) {
                assertFalse(key.startsWith("PUT "), "the draft stays outside the outage: " + key);
            }
            try (var client = start()) {
                goTo(client, "isms-git-unavailable");
                var status = get(client, "/api/v1/status");
                Map<String, String> fetch = new LinkedHashMap<>();
                status.path("repositories").forEach(repository -> fetch.put(repository.path("alias").asText(), repository.path("fetch").asText()));
                assertAll(
                        () -> assertTrue(status.path("degraded").asBoolean()),
                        () -> assertEquals("DOWN", fetch.get("isms-register")),
                        () -> assertEquals("DOWN", fetch.get("isms-core")),
                        () -> assertEquals("UP", fetch.get("samm-assessments")),
                        () -> assertEquals("UP", fetch.get("threat-models")),
                        () -> assertEquals(data("isms-register.json"), get(client, "/api/v1/isms/register")),
                        () -> assertEquals(risk("R-018"), get(client, REGISTER + "R-018")),
                        () -> assertEquals(200, client.change("PUT", "/api/v1/drafts/isms-register/R-018", "{}").statusCode()),
                        () -> assertEquals(503, client.change("POST", REGISTER + "R-018/save", "{}").statusCode()),
                        () -> assertEquals(503, client.change("POST", REGISTER + "R-012/save", "{}").statusCode()),
                        () -> assertEquals(503, client.change("POST", REGISTER + "R-042/transitions/isms.submit", "{}").statusCode()),
                        () -> assertEquals(503, client.change("POST", RELEASES + "isms-register/R-018", "{}").statusCode()),
                        () -> assertEquals(503, client.change("POST", "/api/v1/documents/isms-register", "{}").statusCode()),
                        () -> assertEquals(503, client.change("POST", "/api/v1/documents/isms-core", "{}").statusCode()),
                        () -> assertEquals(503, client.change("POST", CORE + AUDIT + "/transitions/isms.submit", "{}").statusCode()),
                        () -> assertEquals(503, client.change("POST", RELEASES + "isms-core/" + SDP, "{}").statusCode()));
                assertEquals("isms-git-unavailable", stateOf(client));
            }
        }

        @Test
        @DisplayName("a state overrides only what it names: the other risks, the gaps and the documents read as in the base")
        void shouldKeepTheBaseElsewhere() {
            try (var client = start()) {
                post(client, "/api/v1/documents/isms-register", 201, "CREATED");
                for (String id : List.of("R-004", "R-007", "R-009", "R-012", "R-015", "R-018", "R-021", "R-042")) {
                    assertEquals(risk(id), get(client, REGISTER + id), id);
                }
                assertEquals(data("isms-documents.json"), get(client, "/api/v1/documents/isms-core"));
                assertEquals(data("isms-gaps-payments.json"), get(client, "/api/v1/samm/payments/gaps"));
                assertEquals(data("reports-risks-now.json"), get(client, "/api/v1/isms/risks"));
                assertEquals(data("due-workshop-lifecycle.json"), get(client, "/api/v1/due"));
                assertEquals(404, client.get(REGISTER + "R-999").statusCode());
            }
        }
    }

    // ---------------------------------------------------------------------------------------------------------- the other profiles
    @Nested
    @DisplayName("The other profiles: the first number of empty, the Due items of release, the refusals of read-only")
    class Profiles {

        @Test
        @DisplayName("empty: the create answers R-001 and moves to risk-created: the read, the revisions and the register of one entry")
        void shouldCreateTheFirstRisk() {
            try (var client = MockClient.start("empty").login()) {
                var created = post(client, "/api/v1/documents/isms-register", 201, "CREATED");
                var read = get(client, REGISTER + "R-001");
                var register = get(client, "/api/v1/isms/register");
                assertAll(
                        () -> assertEquals("risk-created", stateOf(client)),
                        () -> assertEquals("R-001", created.path("id").asText()),
                        () -> assertEquals("/isms/risks/r-001", created.path("address").asText()),
                        () -> assertEquals(created.path("parts").path("data").path("blob"), read.path("parts").path("data").path("blob")),
                        () -> assertEquals("draft", read.path("state").asText()),
                        () -> assertEquals(1, get(client, REGISTER + "R-001/revisions").path("revisions").size()),
                        () -> assertEquals(1, register.path("risks").size()),
                        () -> assertEquals("R-001", register.path("risks").get(0).path("id").asText()),
                        () -> assertEquals(404, client.get(REGISTER + "R-002").statusCode()),
                        () -> assertEquals(404, client.change("POST", "/api/v1/documents/isms-core", "{}").statusCode()));
            }
        }

        @Test
        @DisplayName("release: the Due list has the reviews of the risks that Noor Haddad may read (R-007, R-012) and no document of isms-core")
        void shouldListTheDueRisksInRelease() {
            var scenario = scenario("release");
            var items = list(scenario.path("routes").path("GET /api/v1/due").path("body").path("items"));
            var isms = items.stream().filter(item -> "isms".equals(item.path("lens").asText())).toList();
            assertAll(
                    () -> assertEquals(List.of("samm"), items.stream().map(item -> item.path("lens").asText()).filter(lens -> !"isms".equals(lens)).toList()),
                    () -> assertEquals(List.of("/isms/risks/r-007", "/isms/risks/r-012"), isms.stream().map(item -> item.path("address").asText()).toList()),
                    () -> assertEquals(list(data("due-workshop-lifecycle.json").path("items")).stream()
                            .filter(item -> "isms".equals(item.path("lens").asText()) && item.path("address").asText().startsWith("/isms/risks/")).toList(), isms),
                    () -> assertTrue(isms.stream().allMatch(item -> "review".equals(item.path("kind").asText()))),
                    () -> assertEquals(Set.of("isms-register"), Set.of(scenario.path("rights").get(1).path("repository").asText())));
            try (var client = MockClient.start("release").login()) {
                var due = list(get(client, "/api/v1/due").path("items"));
                assertEquals(3, due.size());
                assertEquals(403, client.get("/api/v1/documents/isms-core").statusCode());
            }
        }

        @Test
        @DisplayName("read-only refuses every write of the ISMS lens by its right, including the ones that are links in workshop")
        void shouldRefuseEveryWriteInReadOnly() {
            try (var client = MockClient.start("read-only").login()) {
                for (var request : List.of(List.of("POST", "/api/v1/documents/isms-register"), List.of("POST", "/api/v1/documents/isms-core"),
                        List.of("POST", REGISTER + "R-012/save"), List.of("POST", REGISTER + "R-042/save"), List.of("POST", RELEASES + "isms-register/R-018"),
                        List.of("POST", RELEASES + "isms-core/" + SDP), List.of("POST", REGISTER + "R-042/transitions/isms.submit"),
                        List.of("PUT", "/api/v1/drafts/isms-register/R-012"))) {
                    var response = client.change(request.get(0), request.get(1), "{}");
                    assertAll(request.toString(), () -> assertEquals(403, response.statusCode()),
                            () -> assertEquals("FORBIDDEN", json(response).path("outcome").asText()));
                }
            }
        }
    }

    // ---------------------------------------------------------------------------------------------------------- the reads of a release of a document
    @Nested
    @DisplayName("Reads of a release of a document and the compare page")
    class Compare {

        private static final String SECURITY_DIFF = CORE + POLICY + "/diff";

        @Test
        @DisplayName("every release of a document has its read: frozen, no transition, the tag of its collection, the value as it was then")
        void shouldReadEveryRelease() {
            try (var client = start()) {
                Map<String, List<Integer>> releases = Map.of("information-security-policy", List.of(1, 2, 3), "access-control-policy", List.of(1, 2),
                        "secure-development-policy", List.of(1), "isms-scope", List.of(1, 2), "internal-audit-2025", List.of(1),
                        "management-review-2026-h1", List.of(1), "management-review-2025", List.of(1));
                for (var entry : releases.entrySet()) {
                    var current = data("isms-doc-" + entry.getKey() + ".json");
                    String collection = Map.of("policy", "policies", "isms-scope", "scope", "audit-report", "audits", "management-review",
                            "management-reviews").get(current.path("kind").asText());
                    for (int version : entry.getValue()) {
                        var at = get(client, CORE + current.path("id").asText() + "?at=v" + version);
                        var revisions = list(data("isms-doc-" + entry.getKey() + "-revisions.json").path("revisions")).stream()
                                .filter(revision -> ("v" + version).equals(revision.path("ref").asText())).findFirst().orElseThrow();
                        assertAll(entry.getKey() + " v" + version,
                                () -> assertEquals(data("isms-doc-" + entry.getKey() + "-at-v" + version + ".json"), at),
                                () -> assertTrue(at.path("frozen").asBoolean()),
                                () -> assertEquals("released", at.path("state").asText()),
                                () -> assertEquals(version, at.path("version").asInt()),
                                () -> assertEquals(0, at.path("transitions").size()),
                                () -> assertTrue(at.path("draft").isNull()),
                                () -> assertEquals(collection + "/" + current.path("id").asText() + "/v" + version, at.path("at").path("tag").asText()),
                                () -> assertEquals(at.path("at").path("tag"), at.path("release").path("tag")),
                                () -> assertEquals(revisions.path("commit"), at.path("at").path("commit")),
                                () -> assertEquals(revisions.path("at"), at.path("at").path("at")),
                                () -> assertEquals(at.path("parts").path("data").path("value").path("title"), at.path("title")),
                                () -> assertEquals(at.path("release").path("at"), at.path("at").path("at")));
                    }
                    int latest = entry.getValue().get(entry.getValue().size() - 1);
                    if ("released".equals(current.path("state").asText())) {
                        assertEquals(current.path("parts").path("data").path("value"),
                                data("isms-doc-" + entry.getKey() + "-at-v" + latest + ".json").path("parts").path("data").path("value"), entry.getKey());
                    }
                }
                var refused = client.get(CORE + POLICY + "?at=v9");
                var format = client.get(CORE + POLICY + "?at=zzz");
                assertAll(
                        () -> assertEquals(404, refused.statusCode()),
                        () -> assertEquals("NOT_FOUND", json(refused).path("outcome").asText()),
                        () -> assertEquals(422, format.statusCode()),
                        () -> assertEquals("/at", json(format).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("FORMAT", json(format).path("errors").get(0).path("code").asText()));
            }
        }

        @Test
        @DisplayName("the compare of two releases answers the diffs of the named pairs; v9 is 404, zzz is 422 FORMAT, no from is 422 REQUIRED")
        void shouldCompareTwoReleases() {
            try (var client = start()) {
                for (var pair : List.of(List.of(1, 2), List.of(2, 3), List.of(1, 3))) {
                    var diff = get(client, SECURITY_DIFF + "?from=v" + pair.get(0) + "&to=v" + pair.get(1));
                    assertEquals(data("isms-diff-information-security-policy-v" + pair.get(0) + "-v" + pair.get(1) + ".json"), diff, pair.toString());
                    assertEquals("policies/" + POLICY + "/v" + pair.get(0), diff.path("from").asText());
                    assertEquals("policies/" + POLICY + "/v" + pair.get(1), diff.path("to").asText());
                }
                assertEquals(data("isms-diff-isms-scope-v1-v2.json"), get(client, CORE + SCOPE + "/diff?from=v1&to=v2"));
                var missing = client.get(SECURITY_DIFF + "?from=v9&to=v2");
                var format = client.get(SECURITY_DIFF + "?from=zzz&to=v2");
                var required = client.get(SECURITY_DIFF);
                assertAll(
                        () -> assertEquals(404, missing.statusCode()),
                        () -> assertEquals("NOT_FOUND", json(missing).path("outcome").asText()),
                        () -> assertEquals(422, format.statusCode()),
                        () -> assertEquals("/from", json(format).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("FORMAT", json(format).path("errors").get(0).path("code").asText()),
                        () -> assertEquals(422, required.statusCode()),
                        () -> assertEquals("/from", json(required).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("REQUIRED", json(required).path("errors").get(0).path("code").asText()),
                        // a pair that is not named is a documented limit
                        () -> assertEquals(404, client.get(CORE + SCOPE + "/diff?from=v2&to=v1").statusCode()),
                        () -> assertEquals(200, client.get(CORE + SDP + "/diff?from=released").statusCode()));
            }
        }

        @Test
        @DisplayName("read-only and degraded read the compare page; release answers 403 for isms-core; degraded and local read the policy of a release")
        void shouldReadTheComparisonInTheProfiles() {
            for (String profile : List.of("read-only", "workshop")) {
                try (var client = MockClient.start(profile).login()) {
                    assertEquals(data("isms-diff-information-security-policy-v1-v3.json"), get(client, SECURITY_DIFF + "?from=v1&to=v3"), profile);
                    assertEquals(data("isms-doc-information-security-policy-at-v2.json"), get(client, CORE + POLICY + "?at=v2"), profile);
                }
            }
            for (String profile : List.of("degraded", "local", "release")) {
                try (var client = "local".equals(profile) ? MockClient.start(profile).loginLocal("alex", "local-password") : MockClient.start(profile).login()) {
                    var response = client.get(CORE + POLICY + "?at=v2");
                    if ("release".equals(profile)) {
                        assertEquals(403, response.statusCode());
                    } else {
                        assertEquals(200, response.statusCode(), profile);
                        assertEquals(data("isms-doc-information-security-policy-at-v2.json"), json(response), profile);
                    }
                }
            }
        }
    }

    @Test
    @DisplayName("every address in a file or an answer of a state is a canonical address of the web app")
    void shouldUseCanonicalAddresses() {
        Set<String> addresses = new TreeSet<>();
        for (String name : List.of("isms-register-created.json", "isms-register-gap.json", "isms-register-threat.json", "isms-register-taken.json",
                "isms-register-completed.json", "isms-register-submitted.json", "isms-register-reopened.json", "isms-register-released.json",
                "isms-register-empty-created.json")) {
            data(name).path("risks").forEach(row -> {
                addresses.add(row.path("address").asText());
                if (!row.path("origin").isNull()) {
                    addresses.add(row.path("origin").path("address").asText());
                }
            });
        }
        for (String name : List.of("isms-documents-created.json", "isms-documents-released.json")) {
            data(name).path("documents").forEach(row -> addresses.add(row.path("address").asText()));
        }
        for (String name : List.of("risk-r-043.json", "risk-r-043-gap.json", "risk-r-043-threat.json", "risk-r-001.json", "risk-r-044.json",
                "isms-doc-incident-communication-policy.json")) {
            var read = data(name);
            addresses.add("isms-register".equals(read.path("repository").asText()) ? "/isms/risks/" + read.path("id").asText().toLowerCase()
                    : "/isms/documents/" + read.path("id").asText());
        }
        for (String name : List.of("isms-gaps-payments-risk.json")) {
            data(name).path("gaps").forEach(gap -> {
                if (!gap.path("risk").isNull()) {
                    addresses.add(gap.path("risk").path("address").asText());
                }
            });
        }
        for (String state : STATES) {
            for (var link : state(state).path("links")) {
                for (String key : List.of("address", "origin")) {
                    if (link.path("body").path(key).isTextual() && link.path("body").path(key).asText().startsWith("/")) {
                        addresses.add(link.path("body").path(key).asText());
                    }
                }
            }
        }
        for (String reference : List.of(GAP, THREAT)) {
            addresses.add("/isms/risks/new?origin=" + java.net.URLEncoder.encode(reference, StandardCharsets.UTF_8));
        }
        addresses.addAll(List.of("/isms/documents/" + POLICY + "/compare?from=v1&to=v3", "/isms/documents/" + SCOPE + "/compare?from=v1&to=v2",
                "/isms/risks/r-018?at=v2", "/isms/documents/" + SDP + "?at=v2", "/isms/risks/r-043/release"));
        assertTrue(addresses.size() >= 12, addresses.toString());
        addresses.forEach(address -> assertEquals(address, ADDRESSES.checkReturn(address), address));
    }

    @Test
    @DisplayName("the data file of every route of the states exists, and the registry loads the profile")
    void shouldLoadTheProfile() {
        for (String name : STATES) {
            for (var route : state(name).path("routes")) {
                if (route.has("body_file")) {
                    assertTrue(ScenarioRegistry.readDataFile(CLASS_LOADER, route.path("body_file").asText()).isPresent(), name);
                }
            }
        }
        assertEquals(31, STATES.size());
        assertNotEquals(0, fieldNames(WORKSHOP.path("states")).size());
    }
}
