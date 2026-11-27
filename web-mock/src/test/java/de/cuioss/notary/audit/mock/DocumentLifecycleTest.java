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
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.StreamSupport;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The document lifecycle of the test category {@code test-note} (doc/specification/rest-api.adoc, The Document
 * Lifecycle): the ten notes N1 to N10, the revisions, the search, the writes and the {@code note-*} states of
 * {@code workshop}.
 */
@DisplayName("The document lifecycle of the test notes")
class DocumentLifecycleTest {

    private static final ClassLoader CLASS_LOADER = DocumentLifecycleTest.class.getClassLoader();
    private static final ScenarioRegistry REGISTRY = new ScenarioRegistry(
            new ScenarioLoader(MockClient.MAPPER, name -> ScenarioRegistry.readDataFile(CLASS_LOADER, name)),
            CLASS_LOADER);

    private static final String N1 = "01JZ8Q4Y5N6V7X8B9C0D1E2F3G";
    private static final String N2 = "01JZ8R7A9C1E3G5J7M9P1S3V5X";
    private static final String N3 = "01JZ8S2B4D6F8H0K2N4Q6T8W0Y";
    private static final String N4 = "01JZ8T5C7E9G1J3M5P7R9V1X3Z";
    private static final String N5 = "01JZ8V8D0F2H4K6N8Q0S2W4Y6A";
    private static final String N6 = "01JZ8W1E3G5J7M9P1R3T5X7Z9B";
    private static final String N7 = "01JZ8X4F6H8K0N2Q4S6V8Y0A2C";
    private static final String N8 = "01JZ8Y7G9J1M3P5R7T9W1Z3B5D";
    private static final String N9 = "01JZ8Z0H2K4N6Q8S0V2X4A6C8E";
    private static final String N10 = "01JZ9A3J5M7P9R1T3W5Y7B9D1F";
    private static final List<String> NOTES = List.of(N1, N2, N3, N4, N5, N6, N7, N8, N9);
    private static final List<String> ALL = List.of(N1, N2, N3, N4, N5, N6, N7, N8, N9, N10);

    private static final String DOCS = "/api/v1/documents/test-notes";
    private static final String LIST = DOCS;
    private static final String CATEGORIES = "/api/v1/categories";
    private static final Pattern BLOB = Pattern.compile("[0-9a-f]{7}");
    private static final Pattern ULID = Pattern.compile("[0-9A-HJKMNP-TV-Z]{26}");

    private static String doc(String id) {
        return DOCS + "/" + id;
    }

    private static String draft(String id) {
        return "/api/v1/drafts/test-notes/" + id;
    }

    private static String save(String id) {
        return doc(id) + "/save";
    }

    private static String submit(String id) {
        return doc(id) + "/transitions/test-note.submit";
    }

    private static String release(String id) {
        return "/api/v1/releases/test-notes/" + id;
    }

    private static JsonNode body(MockClient client, String path) {
        return json(client.get(path));
    }

    private static JsonNode post(MockClient client, String path) {
        return json(client.change("POST", path, "{}"));
    }

    private static void goTo(MockClient client, String state) {
        assertEquals(200, client.send("POST", "/mock/goto/" + state, null, Map.of()).statusCode(), state);
    }

    private static String stateOf(MockClient client) {
        return body(client, "/mock/state").path("state").asText();
    }

    private static List<String> texts(JsonNode array) {
        List<String> result = new ArrayList<>();
        array.forEach(node -> result.add(node.asText()));
        return result;
    }

    /** A light check of a value against the schema of the category: required, type, enum, maxLength, maxItems. */
    private static List<String> problems(JsonNode schema, JsonNode value, String pointer) {
        List<String> problems = new ArrayList<>();
        switch (schema.path("type").asText("")) {
            case "object" -> {
                schema.path("required").forEach(name -> {
                    if (!value.has(name.asText())) {
                        problems.add(pointer + "/" + name.asText() + " missing");
                    }
                });
                value.properties().forEach(entry -> {
                    var property = schema.path("properties").path(entry.getKey());
                    if (property.isMissingNode()) {
                        problems.add(pointer + "/" + entry.getKey() + " unknown");
                    } else {
                        problems.addAll(problems(property, entry.getValue(), pointer + "/" + entry.getKey()));
                    }
                });
            }
            case "array" -> {
                if (!value.isArray() || value.size() > schema.path("maxItems").asInt(Integer.MAX_VALUE)) {
                    problems.add(pointer + " no array or too long");
                } else {
                    int index = 0;
                    for (var item : value) {
                        problems.addAll(problems(schema.path("items"), item, pointer + "/" + index++));
                    }
                }
            }
            case "boolean" -> {
                if (!value.isBoolean()) {
                    problems.add(pointer + " no boolean");
                }
            }
            case "string" -> {
                if (!value.isTextual() || value.asText().length() > schema.path("maxLength").asInt(Integer.MAX_VALUE)
                        || schema.has("enum") && !texts(schema.path("enum")).contains(value.asText())) {
                    problems.add(pointer + " no valid string");
                }
            }
            default -> problems.add(pointer + " unknown type");
        }
        return problems;
    }

    private static JsonNode noteSchema(MockClient client) {
        return body(client, "/api/v1/categories/test-note/schema").path("kinds").get(0).path("schema");
    }

    @Nested
    @DisplayName("workshop: categories and the list")
    class CategoriesAndList {

        @Test
        @DisplayName("lists the generic category test-note; the other profiles answer none")
        void shouldListCategories() {
            for (String profile : List.of("workshop", "read-only")) {
                try (var client = MockClient.start(profile).login()) {
                    var categories = body(client, CATEGORIES).path("categories");
                    assertAll(profile,
                            () -> assertEquals(1, categories.size()),
                            () -> assertEquals("test-note", categories.get(0).path("id").asText()),
                            () -> assertTrue(categories.get(0).path("generic").asBoolean()),
                            () -> assertEquals("note", categories.get(0).path("kinds").get(0).path("id").asText()),
                            () -> assertEquals("test-notes",
                                    categories.get(0).path("kinds").get(0).path("repository").asText()));
                }
            }
            for (String profile : List.of("empty", "degraded", "release", "local", "login-trouble#recovered")) {
                var started = MockClient.start(profile);
                try (var client = "local".equals(profile) ? started.loginLocal("alex", "local-password")
                        : started.login()) {
                    var response = client.get(CATEGORIES);
                    assertAll(profile,
                            () -> assertEquals(200, response.statusCode()),
                            () -> assertTrue(json(response).path("categories").isArray()),
                            () -> assertEquals(0, json(response).path("categories").size()));
                }
            }
        }

        @Test
        @DisplayName("lists nine documents, newest change first, with state, version, release and request")
        void shouldListNineDocuments() {
            try (var client = MockClient.start("workshop").login()) {
                var list = body(client, LIST);
                var documents = list.path("documents");
                Map<String, JsonNode> byId = new HashMap<>();
                documents.forEach(document -> byId.put(document.path("id").asText(), document));
                List<String> updated = new ArrayList<>();
                documents.forEach(document -> updated.add(document.path("updatedAt").asText()));
                assertAll(
                        () -> assertEquals("test-notes", list.path("repository").asText()),
                        () -> assertFalse(list.path("truncated").asBoolean()),
                        () -> assertEquals(9, documents.size()),
                        () -> assertEquals(updated.stream().sorted(Comparator.reverseOrder()).toList(),
                                updated),
                        () -> assertEquals("released", byId.get(N1).path("state").asText()),
                        () -> assertEquals("draft", byId.get(N2).path("state").asText()),
                        () -> assertEquals("draft", byId.get(N3).path("state").asText()),
                        () -> assertEquals("in-review", byId.get(N4).path("state").asText()),
                        () -> assertEquals("in-review", byId.get(N5).path("state").asText()),
                        () -> assertEquals(2, byId.get(N5).path("version").asInt()),
                        () -> assertEquals("released", byId.get(N6).path("state").asText()),
                        () -> assertEquals(2, byId.get(N6).path("version").asInt()),
                        () -> assertEquals(3, byId.get(N7).path("version").asInt()),
                        () -> assertEquals("draft", byId.get(N8).path("state").asText()),
                        () -> assertEquals("draft", byId.get(N9).path("state").asText()),
                        () -> assertTrue(byId.get(N2).path("requested").asBoolean()),
                        () -> assertTrue(byId.get(N5).path("requested").asBoolean()),
                        () -> assertFalse(byId.get(N1).path("requested").asBoolean()),
                        () -> assertEquals("notes/" + N1 + "/v1", byId.get(N1).path("release").path("tag").asText()),
                        () -> assertEquals("notes/" + N5 + "/v1", byId.get(N5).path("release").path("tag").asText()),
                        () -> assertEquals("notes/" + N6 + "/v2", byId.get(N6).path("release").path("tag").asText()),
                        () -> assertEquals("notes/" + N7 + "/v2", byId.get(N7).path("release").path("tag").asText()),
                        () -> assertTrue(byId.get(N2).path("release").isNull()),
                        () -> assertEquals("/categories/test-note/" + N4, byId.get(N4).path("address").asText()),
                        () -> assertEquals("note", byId.get(N4).path("kind").asText()));
            }
        }

        @Test
        @DisplayName("answers the same list to read-only")
        void shouldListToReadOnly() {
            try (var client = MockClient.start("read-only").login()) {
                assertEquals(9, body(client, LIST).path("documents").size());
            }
        }
    }

    @Nested
    @DisplayName("workshop: the reads")
    class Reads {

        @Test
        @DisplayName("reads N1 to N10 with a value valid for the schema (N3 lacks noted and status)")
        void shouldReadEveryNote() {
            try (var client = MockClient.start("workshop").login()) {
                var schema = noteSchema(client);
                for (String id : ALL) {
                    var read = body(client, doc(id));
                    var value = read.path("parts").path("data").path("value");
                    var problems = problems(schema, value, "");
                    List<String> expected = N3.equals(id) ? List.of("/noted missing", "/status missing") : List.of();
                    assertAll(id,
                            () -> assertEquals("test-notes", read.path("repository").asText()),
                            () -> assertEquals(id, read.path("id").asText()),
                            () -> assertEquals("test-note", read.path("category").asText()),
                            () -> assertEquals("note", read.path("kind").asText()),
                            () -> assertEquals(value.path("title").asText(), read.path("title").asText()),
                            () -> assertTrue(ULID.matcher(read.path("id").asText()).matches()),
                            () -> assertFalse(read.path("frozen").asBoolean()),
                            () -> assertTrue(BLOB.matcher(read.path("parts").path("data").path("blob").asText())
                                    .matches()),
                            () -> assertEquals(expected, problems),
                            () -> assertEquals(N2.equals(id), read.path("draft").isObject(), "draft only on N2"),
                            () -> assertEquals(N2.equals(id) || N5.equals(id), read.path("releaseRequest").isObject()),
                            () -> assertTrue(read.path("history").size() <= 20),
                            () -> assertTrue(read.path("history").size() >= 1));
                }
            }
        }

        @Test
        @DisplayName("offers submit to a draft, release to a document in review and nothing to a released one")
        void shouldOfferTransitions() {
            try (var client = MockClient.start("workshop").login()) {
                for (String id : NOTES) {
                    var read = body(client, doc(id));
                    var transitions = read.path("transitions");
                    switch (read.path("state").asText()) {
                        case "draft" -> assertAll(id,
                                () -> assertEquals(1, transitions.size()),
                                () -> assertEquals("test-note.submit", transitions.get(0).path("id").asText()),
                                () -> assertEquals("in-review", transitions.get(0).path("to").asText()),
                                () -> assertEquals("edit", transitions.get(0).path("right").asText()),
                                () -> assertFalse(transitions.get(0).path("stepUp").asBoolean()),
                                () -> assertFalse(transitions.get(0).has("release")));
                        case "in-review" -> assertAll(id,
                                () -> assertEquals(1, transitions.size()),
                                () -> assertEquals("test-note.release", transitions.get(0).path("id").asText()),
                                () -> assertEquals("released", transitions.get(0).path("to").asText()),
                                () -> assertEquals("approve", transitions.get(0).path("right").asText()),
                                () -> assertTrue(transitions.get(0).path("stepUp").asBoolean()),
                                () -> assertTrue(transitions.get(0).path("release").asBoolean()));
                        default -> assertEquals(0, transitions.size(), id);
                    }
                }
            }
        }

        @Test
        @DisplayName("keeps the own draft of N2 older than nothing and its release request, and N5's by Jordan")
        void shouldCarryDraftAndRequests() {
            try (var client = MockClient.start("workshop").login()) {
                var n2 = body(client, doc(N2));
                var n5 = body(client, doc(N5));
                assertAll(
                        () -> assertEquals(n2.path("parts").path("data").path("blob").asText(),
                                n2.path("draft").path("parts").path("data").path("blob").asText()),
                        () -> assertEquals("2026-11-26T08:30:00Z", n2.path("draft").path("at").asText()),
                        () -> assertEquals("Keep audit evidence for ten years; review it every year.",
                                n2.path("draft").path("parts").path("data").path("fields").path("/summary").asText()),
                        () -> assertTrue(n2.path("draft").path("parts").path("data").path("fields").path("/pinned")
                                .asBoolean()),
                        () -> assertEquals("rr-01JZ8R9B1D3F5H7K9N1Q3S5V7X",
                                n2.path("releaseRequest").path("id").asText()),
                        () -> assertEquals("p-4c1a9e", n2.path("releaseRequest").path("by").path("pseudonym").asText()),
                        () -> assertEquals("p-2b7f10", n5.path("releaseRequest").path("by").path("pseudonym").asText()),
                        () -> assertEquals("Reviewed with the team; ready to release.",
                                n5.path("releaseRequest").path("comment").asText()));
            }
        }

        @Test
        @DisplayName("carries every mark of the form kit in N8")
        void shouldCarryEveryMarkInN8() {
            try (var client = MockClient.start("workshop").login()) {
                var value = body(client, doc(N8)).path("parts").path("data").path("value");
                assertAll(
                        () -> assertEquals("Old decision", value.path("title").asText()),
                        () -> assertEquals("2025-03-02T14:00:00+01:00", value.path("noted").asText()),
                        () -> assertEquals("dropped", value.path("status").asText()),
                        () -> assertEquals("service:ledger", value.path("service").asText()),
                        () -> assertEquals("p-7d52e8", value.path("owner").asText()),
                        () -> assertEquals("isms-register:risk/R-999", value.path("related").asText()),
                        () -> assertEquals("p-0f8a42", value.path("actions").get(0).path("who").asText()),
                        () -> assertEquals("p-3b9d00", value.path("actions").get(1).path("who").asText()));
            }
        }

        @Test
        @DisplayName("shows N3 with two fields only, so a submit is refused")
        void shouldShowN3Incomplete() {
            try (var client = MockClient.start("workshop").login()) {
                var value = body(client, doc(N3)).path("parts").path("data").path("value");
                assertEquals(List.of("title", "summary"), value.properties().stream().map(Map.Entry::getKey).toList());
            }
        }

        @Test
        @DisplayName("answers a plain read to a request with any query, and the revision keys only to theirs")
        void shouldAnswerPlainReadToAnyQuery() {
            try (var client = MockClient.start("workshop").login()) {
                assertAll(
                        () -> assertEquals(N2, body(client, doc(N2) + "?at=v1").path("id").asText()),
                        () -> assertFalse(body(client, doc(N6) + "?at=v1&x=1").path("at").isMissingNode()),
                        () -> assertTrue(body(client, doc(N6) + "?x=1").path("at").isMissingNode()),
                        () -> assertTrue(body(client, doc(N6)).path("at").isMissingNode()));
            }
        }
    }

    @Nested
    @DisplayName("workshop: revisions and diffs")
    class Revisions {

        @ParameterizedTest
        @ValueSource(strings = {N6 + ":v1:released:1", N6 + ":v2:released:2", N6 + ":4be0c3a:in-review:2",
                N6 + ":a3d9f20:draft:1", N7 + ":v2:released:2", N1 + ":v1:released:1"})
        @DisplayName("reads a revision, frozen, without draft, transitions and request, with the member at")
        void shouldReadRevision(String spec) {
            var parts = spec.split(":");
            try (var client = MockClient.start("workshop").login()) {
                var read = body(client, doc(parts[0]) + "?at=" + parts[1]);
                assertAll(spec,
                        () -> assertEquals(parts[2], read.path("state").asText()),
                        () -> assertEquals(Integer.parseInt(parts[3]), read.path("version").asInt()),
                        () -> assertTrue(read.path("frozen").asBoolean()),
                        () -> assertTrue(read.path("draft").isNull()),
                        () -> assertTrue(read.path("releaseRequest").isNull()),
                        () -> assertEquals(0, read.path("transitions").size()),
                        () -> assertEquals(parts[1], read.path("at").path("ref").asText()),
                        () -> assertTrue(read.path("at").has("kind")),
                        () -> assertTrue(read.path("at").has("commit")),
                        () -> assertTrue(read.path("at").has("tag")),
                        () -> assertTrue(read.path("at").has("at")),
                        () -> assertTrue(read.path("at").has("by")),
                        () -> assertEquals(parts[0], read.path("id").asText()));
            }
        }

        @Test
        @DisplayName("gives the revisions of N6 their own values: an earlier summary and status in v1")
        void shouldKeepEarlierValues() {
            try (var client = MockClient.start("workshop").login()) {
                var v1 = body(client, doc(N6) + "?at=v1").path("parts").path("data").path("value");
                var v2 = body(client, doc(N6) + "?at=v2");
                var current = body(client, doc(N6));
                assertAll(
                        () -> assertEquals("open", v1.path("status").asText()),
                        () -> assertTrue(v1.path("summary").asText().length()
                                < current.path("parts").path("data").path("value").path("summary").asText().length()),
                        () -> assertEquals(current.path("parts").path("data").path("value"),
                                v2.path("parts").path("data").path("value")),
                        () -> assertEquals("release", v2.path("at").path("kind").asText()),
                        () -> assertEquals("notes/" + N6 + "/v2", v2.path("at").path("tag").asText()),
                        () -> assertEquals("2026-11-20T14:30:00Z", v2.path("at").path("at").asText()),
                        () -> assertTrue(body(client, doc(N6) + "?at=4be0c3a").path("at").path("tag").isNull()));
            }
        }

        @Test
        @DisplayName("answers 404 NOT_FOUND to an unknown revision and 422 FORMAT to a malformed one")
        void shouldRefuseRevisions() {
            try (var client = MockClient.start("workshop").login()) {
                var unknown = client.get(doc(N6) + "?at=deadbee");
                var malformed = client.get(doc(N6) + "?at=zzz");
                assertAll(
                        () -> assertEquals(404, unknown.statusCode()),
                        () -> assertEquals("NOT_FOUND", json(unknown).path("outcome").asText()),
                        () -> assertEquals(422, malformed.statusCode()),
                        () -> assertEquals("VALIDATION", json(malformed).path("outcome").asText()),
                        () -> assertEquals("/at", json(malformed).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("FORMAT", json(malformed).path("errors").get(0).path("code").asText()));
            }
        }

        @Test
        @DisplayName("lists the five revisions of N6 newest first with the refs of the contract")
        void shouldListRevisionsOfN6() {
            try (var client = MockClient.start("workshop").login()) {
                var revisions = body(client, doc(N6) + "/revisions");
                List<String> refs = new ArrayList<>();
                revisions.path("revisions").forEach(revision -> refs.add(revision.path("ref").asText()));
                var first = revisions.path("revisions").get(0);
                assertAll(
                        () -> assertEquals(List.of("v2", "4be0c3a", "7be21c4", "v1", "a3d9f20"), refs),
                        () -> assertEquals("9d41e07", first.path("commit").asText()),
                        () -> assertEquals("notes/" + N6 + "/v2", first.path("tag").asText()),
                        () -> assertEquals("release", first.path("kind").asText()),
                        () -> assertEquals("c0ffee1", revisions.path("revisions").get(3).path("commit").asText()),
                        () -> assertEquals("p-7d2e58", first.path("by").path("pseudonym").asText()),
                        () -> assertFalse(revisions.path("truncated").asBoolean()),
                        () -> assertEquals(N6, revisions.path("id").asText()));
            }
        }

        @Test
        @DisplayName("lists the revisions of every note, newest first, a release by its v<n> ref")
        void shouldListRevisionsOfEveryNote() {
            try (var client = MockClient.start("workshop").login()) {
                for (String id : ALL) {
                    var revisions = body(client, doc(id) + "/revisions").path("revisions");
                    List<String> times = new ArrayList<>();
                    revisions.forEach(revision -> times.add(revision.path("at").asText()));
                    assertAll(id,
                            () -> assertFalse(revisions.isEmpty()),
                            () -> assertEquals(times.stream().sorted(Comparator.reverseOrder()).toList(),
                                    times),
                            () -> revisions.forEach(revision -> {
                                boolean release = "release".equals(revision.path("kind").asText());
                                assertEquals(release, revision.path("ref").asText().startsWith("v"));
                                assertEquals(release, revision.path("tag").isTextual());
                                assertTrue(revision.path("commit").asText().matches("[0-9a-f]{7}"));
                            }),
                            () -> assertEquals("create", revisions.get(revisions.size() - 1).path("kind").asText()));
                }
            }
        }

        @Test
        @DisplayName("diffs N2, N4 and N9 from nothing, N5 against v1 and N7 against v2")
        void shouldDiff() {
            try (var client = MockClient.start("workshop").login()) {
                var n2 = body(client, doc(N2) + "/diff");
                var n4 = body(client, doc(N4) + "/diff");
                var n9 = body(client, doc(N9) + "/diff");
                var n5 = body(client, doc(N5) + "/diff");
                var n7 = body(client, doc(N7) + "/diff");
                List<String> pointers5 = new ArrayList<>();
                n5.path("sections").get(0).path("changes").forEach(change -> pointers5.add(change.path("pointer").asText()));
                var actions = n2.path("sections").get(0).path("changes");
                assertAll(
                        () -> assertTrue(n2.path("from").isNull()),
                        () -> assertTrue(n4.path("from").isNull()),
                        () -> assertTrue(n9.path("from").isNull()),
                        () -> assertEquals("working", n2.path("to").asText()),
                        () -> assertEquals("data", n2.path("sections").get(0).path("part").asText()),
                        () -> assertTrue(n2.path("sections").get(0).path("changes").get(0).path("before").isNull()),
                        () -> assertEquals("/actions", actions.get(actions.size() - 1).path("pointer").asText()),
                        () -> assertEquals("notes/" + N5 + "/v1", n5.path("from").asText()),
                        () -> assertEquals(List.of("/status", "/summary", "/actions/1/done"), pointers5),
                        () -> assertEquals("notes/" + N7 + "/v2", n7.path("from").asText()),
                        () -> assertEquals(3, n7.path("sections").get(0).path("changes").size()),
                        () -> assertEquals("/actions/2",
                                n7.path("sections").get(0).path("changes").get(2).path("pointer").asText()),
                        () -> assertTrue(n7.path("sections").get(0).path("changes").get(2).path("before").isNull()));
            }
        }
    }

    @Nested
    @DisplayName("workshop: due")
    class Due {

        @Test
        @DisplayName("holds the three items of the lifecycle with their members; the earliest date stays 2026-11-22")
        void shouldHoldThreeLifecycleItems() {
            try (var client = MockClient.start("workshop").login()) {
                var items = body(client, "/api/v1/due").path("items");
                Map<String, JsonNode> byAddress = new HashMap<>();
                items.forEach(item -> byAddress.put(item.path("address").asText(), item));
                List<String> dates = new ArrayList<>();
                items.forEach(item -> dates.add(item.path("due").asText()));
                var review = byAddress.get("/categories/test-note/" + N4 + "/release");
                var requested = byAddress.get("/categories/test-note/" + N5 + "/release");
                var release = byAddress.get("/categories/test-note/" + N2);
                assertAll(
                        () -> assertEquals(10, items.size()),
                        () -> assertEquals("2026-11-22", dates.stream().sorted().findFirst().orElseThrow()),
                        () -> assertEquals("review", review.path("kind").asText()),
                        () -> assertEquals("categories", review.path("lens").asText()),
                        () -> assertEquals("2026-11-30", review.path("due").asText()),
                        () -> assertFalse(review.has("requestId")),
                        () -> assertEquals("review", requested.path("kind").asText()),
                        () -> assertEquals("rr-01JZ8V9C2E4G6J8M0P2R4T6W8Y", requested.path("requestId").asText()),
                        () -> assertEquals("p-2b7f10", requested.path("requestedBy").path("pseudonym").asText()),
                        () -> assertEquals("2026-11-26T07:55:00Z", requested.path("requestedAt").asText()),
                        () -> assertEquals("Reviewed with the team; ready to release.",
                                requested.path("comment").asText()),
                        () -> assertEquals("release", release.path("kind").asText()),
                        () -> assertEquals("rr-01JZ8R9B1D3F5H7K9N1Q3S5V7X", release.path("requestId").asText()),
                        () -> assertEquals("p-4c1a9e", release.path("requestedBy").path("pseudonym").asText()),
                        () -> assertEquals("2026-12-03", release.path("due").asText()));
            }
        }

        @Test
        @DisplayName("keeps the overdue incident first, so that an e2e test can take the first link")
        void shouldKeepTheIncidentFirst() {
            try (var client = MockClient.start("workshop").login()) {
                var items = body(client, "/api/v1/due").path("items");
                var incident = items.get(3);
                assertAll(
                        () -> assertEquals("deadline", incident.path("kind").asText()),
                        () -> assertEquals("2026-11-22", incident.path("due").asText()),
                        () -> assertEquals("samm", items.get(0).path("lens").asText()));
            }
        }
    }

    @Nested
    @DisplayName("the search")
    class Search {

        private List<String> hits(MockClient client, String query) {
            List<String> ids = new ArrayList<>();
            body(client, "/api/v1/search?q=" + query).path("results").forEach(hit -> ids.add(hit.path("id").asText()));
            return ids;
        }

        @Test
        @DisplayName("finds N1 for rotation, with the entry of the contract")
        void shouldFindRotation() {
            try (var client = MockClient.start("workshop").login()) {
                var answer = body(client, "/api/v1/search?q=rotation");
                var hit = answer.path("results").get(0);
                assertAll(
                        () -> assertEquals("rotation", answer.path("query").asText()),
                        () -> assertEquals(1, answer.path("results").size()),
                        () -> assertFalse(answer.path("truncated").asBoolean()),
                        () -> assertEquals(N1, hit.path("id").asText()),
                        () -> assertEquals("test-notes", hit.path("repository").asText()),
                        () -> assertEquals("test-note", hit.path("category").asText()),
                        () -> assertEquals("note", hit.path("kind").asText()),
                        () -> assertEquals("released", hit.path("state").asText()),
                        () -> assertEquals("/categories/test-note/" + N1, hit.path("address").asText()));
            }
        }

        @Test
        @DisplayName("finds the three Payments assessments in workshop, whatever the case, ordered by title")
        void shouldFindPayments() {
            try (var client = MockClient.start("workshop").login()) {
                var answer = body(client, "/api/v1/search?q=PAYMENTS");
                List<String> titles = new ArrayList<>();
                answer.path("results").forEach(hit -> titles.add(hit.path("title").asText()));
                assertAll(
                        () -> assertEquals("PAYMENTS", answer.path("query").asText()),
                        () -> assertEquals(List.of("Payments 2025 Q4", "Payments 2026 Q2", "Payments 2026 Q4"), titles),
                        () -> assertEquals("samm-assessments", answer.path("results").get(0).path("repository").asText()),
                        () -> assertEquals("/samm/payments/2025-q4", answer.path("results").get(0).path("address").asText()),
                        () -> assertEquals("assessment", answer.path("results").get(0).path("kind").asText()));
            }
        }

        @Test
        @DisplayName("trims the query, matches the id too and answers an empty list for no hit")
        void shouldTrimMatchIdAndFindNothing() {
            try (var client = MockClient.start("workshop").login()) {
                assertAll(
                        () -> assertEquals("rotation", body(client, "/api/v1/search?q=%20rotation%20").path("query").asText()),
                        () -> assertEquals(List.of(N6), hits(client, N6.toLowerCase())),
                        () -> assertEquals(List.of(), hits(client, "ZZZZ")),
                        () -> assertEquals(0, body(client, "/api/v1/search?q=ZZZZ").path("results").size()));
            }
        }

        @Test
        @DisplayName("refuses a missing query with REQUIRED, a short one with MIN_LENGTH, a long one with MAX_LENGTH")
        void shouldRefuseQueries() {
            try (var client = MockClient.start("workshop").login()) {
                var missing = client.get("/api/v1/search");
                var shortQuery = client.get("/api/v1/search?q=a");
                var blank = client.get("/api/v1/search?q=%20a%20");
                var longQuery = client.get("/api/v1/search?q=" + "x".repeat(201));
                var longest = client.get("/api/v1/search?q=" + "x".repeat(200));
                assertAll(
                        () -> assertEquals(422, missing.statusCode()),
                        () -> assertEquals("REQUIRED", json(missing).path("errors").get(0).path("code").asText()),
                        () -> assertEquals("/q", json(missing).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("VALIDATION", json(missing).path("outcome").asText()),
                        () -> assertEquals(422, shortQuery.statusCode()),
                        () -> assertEquals("MIN_LENGTH", json(shortQuery).path("errors").get(0).path("code").asText()),
                        () -> assertEquals("MIN_LENGTH", json(blank).path("errors").get(0).path("code").asText()),
                        () -> assertEquals(422, longQuery.statusCode()),
                        () -> assertEquals("MAX_LENGTH", json(longQuery).path("errors").get(0).path("code").asText()),
                        () -> assertEquals(200, longest.statusCode()));
            }
        }

        @Test
        @DisplayName("finds N9 for checklist in read-only, which reads the notes and the assessments")
        void shouldSearchInReadOnly() {
            try (var client = MockClient.start("read-only").login()) {
                assertAll(
                        () -> assertEquals(List.of(N9), hits(client, "checklist")),
                        () -> assertEquals(3, hits(client, "payments").size()));
            }
        }

        @Test
        @DisplayName("keeps working while the Git server is unreachable")
        void shouldSearchWhileGitIsDown() {
            try (var client = MockClient.start("workshop#note-git-unavailable").login()) {
                assertEquals(List.of(N1), hits(client, "rotation"));
            }
        }

        @Test
        @DisplayName("does not find what the rights do not read: a scenario without read on test-notes")
        void shouldNotFindWithoutRead(@TempDir Path directory) throws IOException {
            Path scenario = directory.resolve("no-notes.json");
            Files.writeString(scenario, """
                    {"format_version": 1, "name": "no-notes", "user": {"pseudonym": "p-1", "name": "Alex"},
                     "rights": [{"repository": "samm-assessments", "actions": ["read"]},
                                {"repository": "test-notes", "actions": ["edit"]}],
                     "start": "ready",
                     "routes": {"GET /api/v1/search": {"handler": "search-documents", "data_file": "documents-index.json"}},
                     "states": {"ready": {}}}
                    """);
            try (var client = MockClient.start(scenario.toString()).login()) {
                assertAll(
                        () -> assertEquals(List.of(), hits(client, "rotation")),
                        () -> assertEquals(3, hits(client, "payments").size()));
            }
        }
    }

    @Nested
    @DisplayName("workshop: the writes")
    class Writes {

        @Test
        @DisplayName("creates a note: 201 CREATED with N10, and the list then holds it first")
        void shouldCreate() {
            try (var client = MockClient.start("workshop").login()) {
                var response = client.change("POST", LIST, "{\"kind\":\"note\"}");
                var created = json(response);
                var list = body(client, LIST).path("documents");
                assertAll(
                        () -> assertEquals(201, response.statusCode()),
                        () -> assertEquals("CREATED", created.path("outcome").asText()),
                        () -> assertEquals(N10, created.path("id").asText()),
                        () -> assertEquals("test-notes", created.path("repository").asText()),
                        () -> assertEquals("/categories/test-note/" + N10, created.path("address").asText()),
                        () -> assertEquals("draft", created.path("state").asText()),
                        () -> assertEquals(1, created.path("version").asInt()),
                        () -> assertEquals("e51a7d3", created.path("parts").path("data").path("blob").asText()),
                        () -> assertEquals("p-4c1a9e",
                                created.path("parts").path("data").path("savedBy").path("pseudonym").asText()),
                        () -> assertEquals("note-created", stateOf(client)),
                        () -> assertEquals(10, list.size()),
                        () -> assertEquals(N10, list.get(0).path("id").asText()),
                        () -> assertEquals("Phishing drill notes", list.get(0).path("title").asText()));
            }
        }

        @Test
        @DisplayName("answers a save, a draft and the N10 read in every state")
        void shouldAnswerN10InEveryState() {
            try (var client = MockClient.start("workshop").login()) {
                for (String state : List.of("ready", "note-created")) {
                    goTo(client, state);
                    assertAll(state,
                            () -> assertEquals("Phishing drill notes", body(client, doc(N10)).path("title").asText()),
                            () -> assertEquals(1, body(client, doc(N10) + "/revisions").path("revisions").size()),
                            () -> assertEquals("DRAFT_SAVED",
                                    json(client.change("PUT", draft(N10), "{}")).path("outcome").asText()),
                            () -> assertEquals("SAVED", post(client, save(N10)).path("outcome").asText()));
                }
            }
        }

        @Test
        @DisplayName("saves a draft and a note; the first save after a release names state draft and the next version")
        void shouldSave() {
            try (var client = MockClient.start("workshop").login()) {
                var draftAnswer = json(client.change("PUT", draft(N2), "{}"));
                var plain = post(client, save(N2));
                var after1 = post(client, save(N1));
                var after6 = post(client, save(N6));
                assertAll(
                        () -> assertEquals("DRAFT_SAVED", draftAnswer.path("outcome").asText()),
                        () -> assertEquals("2026-11-26T09:44:00Z", draftAnswer.path("at").asText()),
                        () -> assertEquals("SAVED", plain.path("outcome").asText()),
                        () -> assertEquals("b8c0d41", plain.path("parts").path("data").path("blob").asText()),
                        () -> assertTrue(plain.path("state").isMissingNode()),
                        () -> assertEquals("draft", after1.path("state").asText()),
                        () -> assertEquals(2, after1.path("version").asInt()),
                        () -> assertEquals("draft", after6.path("state").asText()),
                        () -> assertEquals(3, after6.path("version").asInt()));
            }
        }

        @Test
        @DisplayName("answers a draft and a save for every one of N1 to N10")
        void shouldAnswerDraftAndSaveEverywhere() {
            try (var client = MockClient.start("workshop").login()) {
                for (String id : ALL) {
                    var draft = client.change("PUT", draft(id), "{}");
                    var saved = client.change("POST", save(id), "{}");
                    assertAll(id,
                            () -> assertEquals("DRAFT_SAVED", json(draft).path("outcome").asText()),
                            () -> assertEquals("SAVED", json(saved).path("outcome").asText()));
                }
            }
        }

        @Test
        @DisplayName("submits N2, N7 and N8, and refuses N3 with the two empty mandatory fields")
        void shouldSubmit() {
            try (var client = MockClient.start("workshop").login()) {
                var n3 = client.change("POST", submit(N3), "{}");
                var n2 = post(client, submit(N2));
                var n7 = post(client, submit(N7));
                var n8 = post(client, submit(N8));
                assertAll(
                        () -> assertEquals(422, n3.statusCode()),
                        () -> assertEquals("MANDATORY_FIELDS_MISSING", json(n3).path("outcome").asText()),
                        () -> assertEquals(List.of("/noted", "/status"), texts(json(n3).path("missing"))),
                        () -> assertEquals("TRANSITIONED", n2.path("outcome").asText()),
                        () -> assertEquals("in-review", n2.path("state").asText()),
                        () -> assertEquals(1, n2.path("version").asInt()),
                        () -> assertEquals(3, n7.path("version").asInt()),
                        () -> assertEquals("TRANSITIONED", n8.path("outcome").asText()),
                        () -> assertEquals("2026-11-26T09:50:00Z", n2.path("at").asText()));
            }
        }

        @Test
        @DisplayName("releases N4 as v1 and N5 as v2")
        void shouldRelease() {
            try (var client = MockClient.start("workshop").login()) {
                var n4 = post(client, release(N4));
                var n5 = post(client, release(N5));
                assertAll(
                        () -> assertEquals("RELEASED", n4.path("outcome").asText()),
                        () -> assertEquals("notes/" + N4 + "/v1", n4.path("tag").asText()),
                        () -> assertEquals("2026-11-26T10:05:00Z", n4.path("at").asText()),
                        () -> assertEquals("notes/" + N5 + "/v2", n5.path("tag").asText()),
                        () -> assertEquals("2026-11-26T10:05:00Z", n5.path("at").asText()));
            }
        }

        @Test
        @DisplayName("records an act with its query as sent")
        void shouldRecordTheQueryOfAnAct() {
            try (var client = MockClient.start("workshop").login()) {
                client.change("POST", save(N2) + "?force=1", "{}");
                client.change("POST", save(N2), "{}");
                var acts = body(client, "/mock/acts");
                assertAll(
                        () -> assertEquals(save(N2) + "?force=1", acts.get(0).path("path").asText()),
                        () -> assertEquals(save(N2), acts.get(1).path("path").asText()));
            }
        }
    }

    @Nested
    @DisplayName("read-only")
    class ReadOnlyLifecycle {

        @Test
        @DisplayName("reads the notes, the revisions and the diffs")
        void shouldRead() {
            try (var client = MockClient.start("read-only").login()) {
                assertAll(
                        () -> assertEquals(N6, body(client, doc(N6)).path("id").asText()),
                        () -> assertEquals(5, body(client, doc(N6) + "/revisions").path("revisions").size()),
                        () -> assertTrue(body(client, doc(N6) + "?at=v1").path("frozen").asBoolean()),
                        () -> assertEquals(404, client.get(doc(N6) + "?at=deadbee").statusCode()),
                        () -> assertEquals(422, client.get(doc(N6) + "?at=zzz").statusCode()),
                        () -> assertEquals("notes/" + N5 + "/v1", body(client, doc(N5) + "/diff").path("from").asText()),
                        () -> assertEquals("Phishing drill notes", body(client, doc(N10)).path("title").asText()));
            }
        }

        @Test
        @DisplayName("refuses every write with FORBIDDEN")
        void shouldRefuseWrites() {
            try (var client = MockClient.start("read-only").login()) {
                List<String> refused = new ArrayList<>();
                for (String id : ALL) {
                    for (var request : List.of(Map.entry("PUT", draft(id)), Map.entry("POST", save(id)),
                            Map.entry("POST", submit(id)), Map.entry("POST", release(id)))) {
                        var response = client.change(request.getKey(), request.getValue(), "{}");
                        if (response.statusCode() != 403 || !"FORBIDDEN".equals(json(response).path("outcome").asText())) {
                            refused.add(request.getKey() + " " + request.getValue());
                        }
                    }
                }
                var create = client.change("POST", LIST, "{}");
                assertAll(
                        () -> assertEquals(List.of(), refused),
                        () -> assertEquals(403, create.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(create).path("outcome").asText()));
            }
        }
    }

    @Nested
    @DisplayName("workshop: the flow of N9 from ready")
    class Flow {

        @Test
        @DisplayName("submits, releases and reopens N9 through the links of ready, note by note")
        void shouldRunTheFlow() {
            try (var client = MockClient.start("workshop").login()) {
                var submitted = client.change("POST", submit(N9), "{}");
                var inReview = body(client, doc(N9));
                var listInReview = body(client, LIST).path("documents");
                String afterSubmit = stateOf(client);
                var released = client.change("POST", release(N9), "{}");
                var readReleased = body(client, doc(N9));
                String afterRelease = stateOf(client);
                var saved = client.change("POST", save(N9), "{}");
                var reopened = body(client, doc(N9));
                var listReopened = body(client, LIST).path("documents");
                String afterSave = stateOf(client);
                assertAll(
                        () -> assertEquals(200, submitted.statusCode()),
                        () -> assertEquals("TRANSITIONED", json(submitted).path("outcome").asText()),
                        () -> assertEquals("note-submitted", afterSubmit),
                        () -> assertEquals("in-review", inReview.path("state").asText()),
                        () -> assertEquals("test-note.release", inReview.path("transitions").get(0).path("id").asText()),
                        () -> assertEquals("in-review", stateInList(listInReview, N9)),
                        () -> assertEquals("RELEASED", json(released).path("outcome").asText()),
                        () -> assertEquals("notes/" + N9 + "/v1", json(released).path("tag").asText()),
                        () -> assertEquals("note-released", afterRelease),
                        () -> assertEquals("released", readReleased.path("state").asText()),
                        () -> assertEquals(0, readReleased.path("transitions").size()),
                        () -> assertEquals("notes/" + N9 + "/v1", readReleased.path("release").path("tag").asText()),
                        () -> assertEquals("SAVED", json(saved).path("outcome").asText()),
                        () -> assertEquals("draft", json(saved).path("state").asText()),
                        () -> assertEquals(2, json(saved).path("version").asInt()),
                        () -> assertEquals("note-reopened", afterSave),
                        () -> assertEquals("draft", reopened.path("state").asText()),
                        () -> assertEquals(2, reopened.path("version").asInt()),
                        () -> assertEquals("notes/" + N9 + "/v1", reopened.path("release").path("tag").asText()),
                        () -> assertEquals("draft", stateInList(listReopened, N9)),
                        () -> assertEquals(2, versionInList(listReopened, N9)));
            }
        }

        private String stateInList(JsonNode documents, String id) {
            for (var document : documents) {
                if (id.equals(document.path("id").asText())) {
                    return document.path("state").asText();
                }
            }
            return "";
        }

        private int versionInList(JsonNode documents, String id) {
            for (var document : documents) {
                if (id.equals(document.path("id").asText())) {
                    return document.path("version").asInt();
                }
            }
            return -1;
        }

        @Test
        @DisplayName("shows the three N9 states on the stream: document-created, document-transitioned, document-saved")
        void shouldPushTheEvents() throws Exception {
            try (var client = MockClient.start("workshop").login()) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                client.change("POST", LIST, "{}");
                var created = awaitEvent(lines, "document-created");
                goTo(client, "ready");
                client.change("POST", submit(N9), "{}");
                var submitted = awaitEvent(lines, "document-transitioned");
                client.change("POST", release(N9), "{}");
                var releasedEvent = awaitEvent(lines, "document-transitioned");
                goTo(client, "note-saved-by-other");
                var savedEvent = awaitEvent(lines, "document-saved");
                assertAll(
                        () -> assertEquals(N10, created.path("id").asText()),
                        () -> assertEquals("note", created.path("kind").asText()),
                        () -> assertEquals("test-notes", created.path("repository").asText()),
                        () -> assertEquals(N9, submitted.path("id").asText()),
                        () -> assertEquals("in-review", submitted.path("state").asText()),
                        () -> assertEquals(1, submitted.path("version").asInt()),
                        () -> assertEquals("p-4c1a9e", submitted.path("by").path("pseudonym").asText()),
                        () -> assertEquals("released", releasedEvent.path("state").asText()),
                        () -> assertEquals("p-7d2e58", releasedEvent.path("by").path("pseudonym").asText()),
                        () -> assertEquals(N2, savedEvent.path("id").asText()),
                        () -> assertEquals("data", savedEvent.path("part").asText()),
                        () -> assertEquals(List.of("/status", "/body"), texts(savedEvent.path("fields"))),
                        () -> assertEquals("p-2b7f10", savedEvent.path("by").path("pseudonym").asText()));
            }
        }
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

    @Nested
    @DisplayName("workshop: the note states")
    class States {

        @Test
        @DisplayName("note-saved-by-other: N2 reads with the other's blob, other fields than the draft's and one more history line; the draft stays")
        void shouldReadSavedByOther() {
            try (var client = MockClient.start("workshop").login()) {
                var before = body(client, doc(N2));
                goTo(client, "note-saved-by-other");
                var after = body(client, doc(N2));
                var value = after.path("parts").path("data").path("value");
                assertAll(
                        () -> assertNotEqualsText(before.path("parts").path("data").path("blob"),
                                after.path("parts").path("data").path("blob")),
                        () -> assertEquals("p-2b7f10",
                                after.path("parts").path("data").path("savedBy").path("pseudonym").asText()),
                        () -> assertEquals("agreed", value.path("status").asText()),
                        () -> assertTrue(value.path("body").asText().contains("* Backups: 35 days")),
                        () -> assertEquals(before.path("parts").path("data").path("value").path("summary"),
                                value.path("summary"), "the own draft's fields are not the ones that changed"),
                        () -> assertEquals(before.path("parts").path("data").path("value").path("pinned"),
                                value.path("pinned"), "the own draft's fields are not the ones that changed"),
                        () -> assertEquals(before.path("history").size() + 1, after.path("history").size()),
                        () -> assertTrue(after.path("draft").isObject()),
                        () -> assertEquals(before.path("draft"), after.path("draft")),
                        () -> assertTrue(BLOB.matcher(after.path("parts").path("data").path("blob").asText()).matches()));
            }
        }

        private void assertNotEqualsText(JsonNode first, JsonNode second) {
            assertFalse(first.asText().equals(second.asText()), first.asText());
        }

        @Test
        @DisplayName("note-conflict: the first save is 409 with both values, the second is 200 with blob 5d1e9a1")
        void shouldConflictOnceThenAccept() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-conflict");
                var first = client.change("POST", save(N2), "{}");
                String afterFirst = stateOf(client);
                var second = client.change("POST", save(N2), "{}");
                var conflict = json(first).path("conflicts").get(0);
                assertAll(
                        () -> assertEquals(409, first.statusCode()),
                        () -> assertEquals("CONFLICT", json(first).path("outcome").asText()),
                        () -> assertEquals("data", conflict.path("part").asText()),
                        () -> assertEquals("5d1e9a0", conflict.path("blob").asText()),
                        () -> assertEquals("/summary", conflict.path("fields").get(0).path("pointer").asText()),
                        () -> assertEquals("Rotate every 90 days.", conflict.path("fields").get(0).path("own").asText()),
                        () -> assertEquals("Rotate every 60 days.", conflict.path("fields").get(0).path("other").asText()),
                        () -> assertEquals("/status", conflict.path("fields").get(1).path("pointer").asText()),
                        () -> assertEquals("agreed", conflict.path("fields").get(1).path("own").asText()),
                        () -> assertEquals("dropped", conflict.path("fields").get(1).path("other").asText()),
                        () -> assertEquals("Developer", conflict.path("fields").get(0).path("by").path("role").asText()),
                        () -> assertEquals("p-2b7f10", conflict.path("fields").get(1).path("by").path("pseudonym").asText()),
                        () -> assertEquals("note-conflict-resolved", afterFirst),
                        () -> assertEquals(200, second.statusCode()),
                        () -> assertEquals("SAVED", json(second).path("outcome").asText()),
                        () -> assertEquals("5d1e9a1", json(second).path("parts").path("data").path("blob").asText()));
            }
        }

        @Test
        @DisplayName("note-invalid: a save, a draft and a create answer the three per-field errors with their part")
        void shouldRefuseInvalid() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-invalid");
                var saved = client.change("POST", save(N2), "{}");
                var drafted = client.change("PUT", draft(N2), "{}");
                var created = client.change("POST", LIST, "{}");
                for (var response : List.of(saved, drafted, created)) {
                    var errors = json(response).path("errors");
                    assertAll(
                            () -> assertEquals(422, response.statusCode()),
                            () -> assertEquals("VALIDATION", json(response).path("outcome").asText()),
                            () -> assertEquals(3, errors.size()),
                            () -> assertEquals("data", errors.get(0).path("part").asText()),
                            () -> assertEquals("/related", errors.get(0).path("pointer").asText()),
                            () -> assertEquals("REFERENCE_NOT_FOUND", errors.get(0).path("code").asText()),
                            () -> assertEquals("PSEUDONYM_UNKNOWN", errors.get(1).path("code").asText()),
                            () -> assertEquals("/actions/1/what", errors.get(2).path("pointer").asText()),
                            () -> assertEquals("MAX_LENGTH", errors.get(2).path("code").asText()));
                }
            }
        }

        @Test
        @DisplayName("note-released-meanwhile: a save answers 409 DOCUMENT_RELEASED with the tag")
        void shouldRefuseSaveAfterRelease() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-released-meanwhile");
                var response = client.change("POST", save(N2), "{}");
                assertAll(
                        () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("DOCUMENT_RELEASED", json(response).path("outcome").asText()),
                        () -> assertEquals("notes/" + N2 + "/v1", json(response).path("tag").asText()));
            }
        }

        @Test
        @DisplayName("note-rejected: the four writes answer 502 REJECTED")
        void shouldReject() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-rejected");
                for (String path : List.of(save(N2), submit(N2), LIST, release(N4))) {
                    var response = client.change("POST", path, "{}");
                    assertAll(path,
                            () -> assertEquals(502, response.statusCode()),
                            () -> assertEquals("REJECTED", json(response).path("outcome").asText()));
                }
                assertEquals("DRAFT_SAVED", json(client.change("PUT", draft(N2), "{}")).path("outcome").asText());
            }
        }

        @Test
        @DisplayName("note-git-unavailable: the status is degraded with test-notes DOWN, the writes answer 503, the rest works")
        void shouldBeUnavailable() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-git-unavailable");
                var status = body(client, "/api/v1/status");
                Map<String, String> fetch = new HashMap<>();
                status.path("repositories").forEach(repository -> fetch.put(repository.path("alias").asText(),
                        repository.path("fetch").asText()));
                assertAll(
                        () -> assertTrue(status.path("degraded").asBoolean()),
                        () -> assertEquals("DOWN", fetch.get("test-notes")),
                        () -> assertEquals("UP", fetch.get("samm-assessments")),
                        () -> assertEquals(7, fetch.size()),
                        () -> assertEquals("DRAFT_SAVED", json(client.change("PUT", draft(N2), "{}")).path("outcome").asText()),
                        () -> assertEquals(200, client.get(LIST).statusCode()),
                        () -> assertEquals(200, client.get(doc(N6) + "/revisions").statusCode()),
                        () -> assertEquals(200, client.get(doc(N6) + "?at=v1").statusCode()),
                        () -> assertEquals(200, client.get("/api/v1/search?q=rotation").statusCode()));
                for (String path : List.of(save(N2), submit(N2), LIST, release(N4))) {
                    var response = client.change("POST", path, "{}");
                    assertAll(path,
                            () -> assertEquals(503, response.statusCode()),
                            () -> assertEquals("GIT_UNAVAILABLE", json(response).path("outcome").asText()));
                }
            }
        }

        @Test
        @DisplayName("note-submit-step-up, then note-submit-stepped-up: 403 STEP_UP_REQUIRED, then TRANSITIONED")
        void shouldStepUpTheSubmit() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-submit-step-up");
                var first = client.change("POST", submit(N2), "{}");
                String next = stateOf(client);
                var second = client.change("POST", submit(N2), "{}");
                assertAll(
                        () -> assertEquals(403, first.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(first).path("outcome").asText()),
                        () -> assertEquals("/api/v1/auth/login?step-up=mfa", json(first).path("stepUp").asText()),
                        () -> assertEquals("note-submit-stepped-up", next),
                        () -> assertEquals(200, second.statusCode()),
                        () -> assertEquals("TRANSITIONED", json(second).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("note-release-step-up, note-release-stepped-up, note-release-done: the release of N4 after the fresh login")
        void shouldStepUpTheRelease() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-release-step-up");
                var first = client.change("POST", release(N4), "{}");
                String afterFirst = stateOf(client);
                var second = client.change("POST", release(N4), "{}");
                String afterSecond = stateOf(client);
                var read = body(client, doc(N4));
                assertAll(
                        () -> assertEquals("STEP_UP_REQUIRED", json(first).path("outcome").asText()),
                        () -> assertEquals("note-release-stepped-up", afterFirst),
                        () -> assertEquals("RELEASED", json(second).path("outcome").asText()),
                        () -> assertEquals("notes/" + N4 + "/v1", json(second).path("tag").asText()),
                        () -> assertEquals("note-release-done", afterSecond),
                        () -> assertEquals("released", read.path("state").asText()),
                        () -> assertEquals("notes/" + N4 + "/v1", read.path("release").path("tag").asText()),
                        () -> assertEquals("p-7d2e58", read.path("release").path("by").path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("note-release-done pushes the document-transitioned event")
        void shouldPushTheReleaseEvent() throws Exception {
            try (var client = MockClient.start("workshop").login()) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                goTo(client, "note-release-done");
                var event = awaitEvent(lines, "document-transitioned");
                assertAll(
                        () -> assertEquals(N4, event.path("id").asText()),
                        () -> assertEquals("released", event.path("state").asText()),
                        () -> assertEquals("p-7d2e58", event.path("by").path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("note-release-password: the status asks for the password, the release passes, wrong-password refuses")
        void shouldReleaseWithPassword() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-release-password");
                var status = body(client, "/api/v1/status");
                var released = client.change("POST", release(N4), "{\"password\":\"secret\"}");
                String afterRelease = stateOf(client);
                goTo(client, "note-release-wrong-password");
                var wrongStatus = body(client, "/api/v1/status");
                var wrong = client.change("POST", release(N4), "{\"password\":\"nope\"}");
                assertAll(
                        () -> assertEquals("local", status.path("loginProvider").asText()),
                        () -> assertEquals("password", status.path("stepUp").asText()),
                        () -> assertEquals(7, status.path("repositories").size()),
                        () -> assertEquals("RELEASED", json(released).path("outcome").asText()),
                        () -> assertEquals("note-release-done", afterRelease),
                        () -> assertEquals("password", wrongStatus.path("stepUp").asText()),
                        () -> assertEquals(401, wrong.statusCode()),
                        () -> assertEquals("INVALID_CREDENTIALS", json(wrong).path("outcome").asText()),
                        () -> assertEquals("[redacted]", body(client, "/mock/acts").get(0).path("body").path("password")
                                .asText()));
            }
        }

        @Test
        @DisplayName("note-release-changed: the release answers 409, stays refused until the diff is read again, then passes")
        void shouldReportChangeSinceReview() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-release-changed");
                var read = body(client, doc(N4));
                var diff = body(client, doc(N4) + "/diff");
                var refused = client.change("POST", release(N4), "{}");
                String afterRefusal = stateOf(client);
                var refusedAgain = client.change("POST", release(N4), "{}");
                var reread = body(client, doc(N4));
                var stillRefused = client.change("POST", release(N4), "{}");
                var rediff = body(client, doc(N4) + "/diff");
                String afterReview = stateOf(client);
                var accepted = client.change("POST", release(N4), "{}");
                var released = body(client, doc(N4));
                var revisions = body(client, doc(N4) + "/revisions").path("revisions");
                assertAll(
                        () -> assertEquals("p-2b7f10",
                                read.path("parts").path("data").path("savedBy").path("pseudonym").asText()),
                        () -> assertTrue(read.path("parts").path("data").path("value").path("summary").asText()
                                .endsWith("in January.")),
                        () -> assertTrue(diff.path("sections").get(0).path("changes").toString().contains("in January.")),
                        () -> assertEquals(409, refused.statusCode()),
                        () -> assertEquals("CHANGED_SINCE_REVIEW", json(refused).path("outcome").asText()),
                        () -> assertEquals("note-release-changed-refused", afterRefusal),
                        () -> assertEquals(409, refusedAgain.statusCode(), "no review in between: still refused"),
                        () -> assertEquals("1f2e3d4", reread.path("parts").path("data").path("blob").asText()),
                        () -> assertEquals(409, stillRefused.statusCode(), "reading the document is no review"),
                        () -> assertTrue(rediff.path("sections").get(0).path("changes").toString().contains("in January.")),
                        () -> assertEquals("note-release-changed-reviewed", afterReview),
                        () -> assertEquals("RELEASED", json(accepted).path("outcome").asText()),
                        () -> assertEquals("note-release-changed-done", stateOf(client)),
                        () -> assertEquals("released", released.path("state").asText()),
                        () -> assertEquals("1f2e3d4", released.path("parts").path("data").path("blob").asText()),
                        () -> assertEquals("v1", revisions.get(0).path("ref").asText()),
                        () -> assertEquals("1f2e3d4", revisions.get(1).path("ref").asText()));
            }
        }

        @Test
        @DisplayName("note-release-too-many-logins: 503 TOO_MANY_LOGINS with Retry-After")
        void shouldRefuseWithTooManyLogins() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-release-too-many-logins");
                var response = client.change("POST", release(N4), "{}");
                assertAll(
                        () -> assertEquals(503, response.statusCode()),
                        () -> assertEquals("TOO_MANY_LOGINS", json(response).path("outcome").asText()),
                        () -> assertEquals("60", response.headers().firstValue("Retry-After").orElse("")));
            }
        }

        @Test
        @DisplayName("keeps every state of workshop.json reachable by goto, each with a fresh session")
        void shouldReachEveryState() {
            var scenario = REGISTRY.resolve("workshop").orElseThrow().scenario();
            var states = List.copyOf(scenario.states().keySet());
            assertTrue(states.containsAll(List.of("note-created", "note-release-changed", "note-release-changed-refused",
                    "note-release-changed-reviewed", "note-release-changed-done", "saved-by-other", "ready")));
            for (String state : states) {
                try (var client = MockClient.start("workshop").login()) {
                    goTo(client, state);
                    assertEquals(state, stateOf(client));
                    assertEquals(200, client.get("/api/v1/status").statusCode(), state);
                }
            }
        }
    }

    @Nested
    @DisplayName("workshop: the revisions, the search and the lists follow the note states")
    class FollowTheStates {

        private List<String> refs(MockClient client, String id) {
            List<String> refs = new ArrayList<>();
            body(client, doc(id) + "/revisions").path("revisions").forEach(entry -> refs.add(entry.path("ref").asText()));
            return refs;
        }

        @Test
        @DisplayName("note-saved-by-other lists the concurrent save of N2 in its revisions")
        void shouldListTheSaveOfAnother() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-saved-by-other");
                assertEquals(List.of("6c7d8e9", "3f9a1c2", "8d7c6b5", "2c3d4e5"), refs(client, N2));
            }
        }

        @Test
        @DisplayName("lists the submit, the release v1 and the later save of N9 as the note states reach them")
        void shouldListTheHistoryOfN9() {
            try (var client = MockClient.start("workshop").login()) {
                assertEquals(List.of("f1e2d3c", "9a0b1c2"), refs(client, N9));
                goTo(client, "note-submitted");
                assertEquals(List.of("c5d6e7f", "f1e2d3c", "9a0b1c2"), refs(client, N9));
                goTo(client, "note-released");
                assertEquals(List.of("v1", "c5d6e7f", "f1e2d3c", "9a0b1c2"), refs(client, N9));
                goTo(client, "note-reopened");
                assertEquals(List.of("b8c0d41", "v1", "c5d6e7f", "f1e2d3c", "9a0b1c2"), refs(client, N9));
            }
        }

        @Test
        @DisplayName("lists the release v1 of N4 once it is released")
        void shouldListTheReleaseOfN4() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-release-done");
                assertEquals(List.of("v1", "4d5e6f7", "9b8a7c6", "6f7a8b9"), refs(client, N4));
            }
        }

        @Test
        @DisplayName("finds the created note in the search of note-created, and not before")
        void shouldSearchTheCreatedNote() {
            try (var client = MockClient.start("workshop").login()) {
                var before = body(client, "/api/v1/search?q=phishing").path("results");
                goTo(client, "note-created");
                var after = body(client, "/api/v1/search?q=phishing").path("results");
                var found = StreamSupport.stream(after.spliterator(), false)
                        .filter(hit -> N10.equals(hit.path("id").asText())).toList();
                assertAll(
                        () -> assertTrue(StreamSupport.stream(before.spliterator(), false)
                                .noneMatch(hit -> N10.equals(hit.path("id").asText()))),
                        () -> assertEquals(before.size() + 1, after.size()),
                        () -> assertEquals(1, found.size()),
                        () -> assertEquals("draft", found.get(0).path("state").asText()));
            }
        }

        private JsonNode data(String file) {
            try (var stream = CLASS_LOADER.getResourceAsStream("scenarios/data/" + file)) {
                return MockClient.MAPPER.readTree(Objects.requireNonNull(stream, file));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        private List<JsonNode> without(JsonNode array, String field, String id) {
            List<JsonNode> kept = new ArrayList<>();
            array.forEach(node -> {
                if (!id.equals(node.path(field).asText())) {
                    kept.add(node);
                }
            });
            return kept;
        }

        @Test
        @DisplayName("keeps the hand-kept copies of the list and the index equal to the baseline but for the one note they change")
        void shouldNotLetTheCopiesDrift() {
            var list = data("documents-test-notes.json").path("documents");
            var index = data("documents-index.json").path("entries");
            assertAll(
                    () -> assertEquals(without(list, "id", N9), without(data("documents-test-notes-n9-in-review.json")
                            .path("documents"), "id", N9)),
                    () -> assertEquals(without(list, "id", N9), without(data("documents-test-notes-n9-released.json")
                            .path("documents"), "id", N9)),
                    () -> assertEquals(without(list, "id", N9), without(data("documents-test-notes-n9-reopened.json")
                            .path("documents"), "id", N9)),
                    () -> assertEquals(without(list, "id", N10), without(data("documents-test-notes-created.json")
                            .path("documents"), "id", N10)),
                    () -> assertEquals(without(index, "id", N10), without(data("documents-index-created.json")
                            .path("entries"), "id", N10)),
                    () -> assertEquals(without(index, "repository", "meeting-minutes"),
                            without(data("documents-index-minutes.json").path("entries"), "repository",
                                    "meeting-minutes")),
                    () -> assertEquals(index.size() + 2, data("documents-index-minutes.json").path("entries").size()),
                    () -> assertEquals(list.size() + 1, data("documents-test-notes-created.json").path("documents").size()),
                    () -> assertEquals(index.size() + 1, data("documents-index-created.json").path("entries").size()));
        }
    }

    private static final String M1 = "01JZ9B6K8N0Q2S4V6X8Z0B2D4F";
    private static final String M2 = "01JZ9C9M1P3R5T7W9Y1A3C5E7G";
    private static final String MINUTES = "/api/v1/documents/meeting-minutes";

    private static String minutesSubmit(String id) {
        return MINUTES + "/" + id + "/transitions/meeting-minutes.submit";
    }

    @Nested
    @DisplayName("workshop: the release of a request, the server's other release refusals")
    class ReleaseRequests {

        @Test
        @DisplayName("note-release-incomplete: the release answers 422 MANDATORY_FIELDS_MISSING with the pointers")
        void shouldRefuseAnIncompleteRelease() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-release-incomplete");
                var response = client.change("POST", release(N4), "{}");
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("MANDATORY_FIELDS_MISSING", json(response).path("outcome").asText()),
                        () -> assertEquals(List.of("/owner"), texts(json(response).path("missing"))));
            }
        }

        @Test
        @DisplayName("note-release-released-meanwhile: the release answers 409 DOCUMENT_RELEASED, the note reads released")
        void shouldRefuseAReleaseOfAReleasedNote() {
            try (var client = MockClient.start("workshop").login()) {
                assertEquals("in-review", body(client, doc(N4)).path("state").asText());
                goTo(client, "note-release-released-meanwhile");
                var response = client.change("POST", release(N4), "{}");
                var read = body(client, doc(N4));
                assertAll(
                        () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("DOCUMENT_RELEASED", json(response).path("outcome").asText()),
                        () -> assertEquals("notes/" + N4 + "/v1", json(response).path("tag").asText()),
                        () -> assertEquals("released", read.path("state").asText()),
                        () -> assertEquals("v1", body(client, doc(N4) + "/revisions").path("revisions").get(0)
                                .path("ref").asText()));
            }
        }

        @Test
        @DisplayName("note-release-request: N5 is released as v2; it reads released and its request leaves the Due list")
        void shouldReleaseTheRequestedNote() throws Exception {
            try (var client = MockClient.start("workshop").login()) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                var dueBefore = body(client, "/api/v1/due").path("items");
                var diff = body(client, doc(N5) + "/diff");
                goTo(client, "note-release-request");
                var released = client.change("POST", release(N5), "{}");
                String next = stateOf(client);
                var event = awaitEvent(lines, "document-transitioned");
                var read = body(client, doc(N5));
                var revisions = body(client, doc(N5) + "/revisions").path("revisions");
                var dueAfter = body(client, "/api/v1/due").path("items");
                var documents = body(client, "/api/v1/documents/test-notes").path("documents");
                var listed = documents.get(0);
                var indexed = body(client, "/api/v1/search?q=access").path("results");
                var atTag = body(client, doc(N5) + "?at=v2");
                var atCommit = body(client, doc(N5) + "?at=e5f6a7b");
                assertAll(
                        () -> assertEquals("notes/" + N5 + "/v1", diff.path("from").asText()),
                        () -> assertEquals(1, requestsOf(dueBefore, N5)),
                        () -> assertEquals("rr-01JZ8V9C2E4G6J8M0P2R4T6W8Y", requestFor(dueBefore, N5).path("requestId").asText()),
                        () -> assertEquals("RELEASED", json(released).path("outcome").asText()),
                        () -> assertEquals("notes/" + N5 + "/v2", json(released).path("tag").asText()),
                        () -> assertEquals("note-release-request-done", next),
                        () -> assertEquals(N5, event.path("id").asText()),
                        () -> assertEquals(2, event.path("version").asInt()),
                        () -> assertEquals("released", read.path("state").asText()),
                        () -> assertEquals(2, read.path("version").asInt()),
                        () -> assertEquals("notes/" + N5 + "/v2", read.path("release").path("tag").asText()),
                        () -> assertTrue(read.path("releaseRequest").isNull()),
                        () -> assertEquals(0, read.path("transitions").size()),
                        () -> assertEquals(List.of("v2", "b6c7d8e", "d0e1f2a", "v1"), texts(refsOf(revisions)).subList(0, 4)),
                        () -> assertEquals(N5, listed.path("id").asText()),
                        () -> assertEquals("released", listed.path("state").asText()),
                        () -> assertEquals(2, listed.path("version").asInt()),
                        () -> assertEquals("notes/" + N5 + "/v2", listed.path("release").path("tag").asText()),
                        () -> assertFalse(listed.path("requested").asBoolean()),
                        () -> assertEquals("released", indexed.get(0).path("state").asText()),
                        () -> assertTrue(atTag.path("frozen").asBoolean()),
                        () -> assertEquals("v2", atTag.path("at").path("ref").asText()),
                        () -> assertEquals("e5f6a7b", atTag.path("at").path("commit").asText()),
                        () -> assertTrue(atCommit.path("frozen").asBoolean()),
                        () -> assertEquals("e5f6a7b", atCommit.path("at").path("ref").asText()),
                        () -> assertFalse(read.path("frozen").asBoolean()),
                        () -> assertEquals(0, requestsOf(dueAfter, N5)),
                        () -> assertEquals(dueBefore.size() - 1, dueAfter.size()),
                        () -> assertEquals(1, requestsOf(dueAfter, N2)),
                        () -> assertEquals("2026-11-22", dueAfter.get(3).path("due").asText()));
            }
        }

        /** The release request of a note in the Due list, found by the address of its release and not by its position. */
        private JsonNode requestFor(JsonNode items, String id) {
            for (var item : items) {
                if (item.path("requestId").isTextual() && item.path("address").asText().endsWith("/" + id + "/release")) {
                    return item;
                }
            }
            throw new AssertionError("no release request for " + id);
        }

        private int requestsOf(JsonNode items, String id) {
            int count = 0;
            for (var item : items) {
                if (item.path("requestId").isTextual() && item.path("address").asText().contains(id)) {
                    count++;
                }
            }
            return count;
        }

        private JsonNode refsOf(JsonNode revisions) {
            var refs = MockClient.MAPPER.createArrayNode();
            revisions.forEach(entry -> refs.add(entry.path("ref").asText()));
            return refs;
        }
    }

    @Nested
    @DisplayName("workshop: the confirmation by password of a save and a submit")
    class PasswordSteps {

        private JsonNode status(MockClient client) {
            return body(client, "/api/v1/status");
        }

        @Test
        @DisplayName("note-save-password: the first save answers 403 STEP_UP_REQUIRED without an address, the next 200")
        void shouldAskOnceForTheSave() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-save-password");
                var status = status(client);
                var first = client.change("POST", save(N2), "{\"password\":\"\"}");
                String next = stateOf(client);
                var second = client.change("POST", save(N2), "{\"password\":\"secret\"}");
                var third = client.change("POST", save(N2), "{}");
                assertAll(
                        () -> assertEquals("local", status.path("loginProvider").asText()),
                        () -> assertEquals("password", status.path("stepUp").asText()),
                        () -> assertEquals(403, first.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(first).path("outcome").asText()),
                        () -> assertFalse(json(first).has("stepUp"), "no address with local users"),
                        () -> assertEquals("note-save-password-done", next),
                        () -> assertEquals(200, second.statusCode()),
                        () -> assertEquals("SAVED", json(second).path("outcome").asText()),
                        () -> assertEquals(200, third.statusCode()),
                        () -> assertEquals("password", status(client).path("stepUp").asText()));
            }
        }

        @Test
        @DisplayName("note-submit-password: the first submit answers 403 STEP_UP_REQUIRED without an address, the next 200")
        void shouldAskOnceForTheSubmit() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-submit-password");
                var first = client.change("POST", submit(N2), "{}");
                String next = stateOf(client);
                var second = client.change("POST", submit(N2), "{\"password\":\"secret\"}");
                assertAll(
                        () -> assertEquals("password", status(client).path("stepUp").asText()),
                        () -> assertEquals(403, first.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(first).path("outcome").asText()),
                        () -> assertFalse(json(first).has("stepUp")),
                        () -> assertEquals("note-submit-password-done", next),
                        () -> assertEquals("TRANSITIONED", json(second).path("outcome").asText()),
                        () -> assertEquals("[redacted]", body(client, "/mock/acts").get(1).path("body").path("password")
                                .asText()));
            }
        }

        @Test
        @DisplayName("note-submit-password-declared: N2 reads with a submit that declares the confirmation, the submit passes")
        void shouldDeclareTheConfirmation() {
            try (var client = MockClient.start("workshop").login()) {
                var plain = body(client, doc(N2)).path("transitions").get(0);
                goTo(client, "note-submit-password-declared");
                var read = body(client, doc(N2));
                var response = client.change("POST", submit(N2), "{\"password\":\"secret\"}");
                assertAll(
                        () -> assertFalse(plain.path("stepUp").asBoolean()),
                        () -> assertEquals("password", status(client).path("stepUp").asText()),
                        () -> assertEquals("test-note.submit", read.path("transitions").get(0).path("id").asText()),
                        () -> assertTrue(read.path("transitions").get(0).path("stepUp").asBoolean()),
                        () -> assertEquals(1, read.path("transitions").size()),
                        () -> assertEquals(body(client, doc(N2)).path("parts"), read.path("parts")),
                        () -> assertEquals("TRANSITIONED", json(response).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("note-save-wrong-password, note-submit-wrong-password: 401 INVALID_CREDENTIALS, nothing is written")
        void shouldRefuseAWrongPassword() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-save-wrong-password");
                var asked = client.change("POST", save(N2), "{\"password\":\"\"}");
                String next = stateOf(client);
                var save = client.change("POST", save(N2), "{\"password\":\"nope\"}");
                var saveStatus = status(client);
                goTo(client, "note-submit-wrong-password");
                var submit = client.change("POST", submit(N2), "{\"password\":\"nope\"}");
                assertAll(
                        () -> assertEquals(403, asked.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(asked).path("outcome").asText()),
                        () -> assertFalse(json(asked).has("stepUp"), "no address with local users"),
                        () -> assertEquals("note-save-wrong-password-retry", next),
                        () -> assertEquals(401, save.statusCode()),
                        () -> assertEquals("INVALID_CREDENTIALS", json(save).path("outcome").asText()),
                        () -> assertEquals("password", saveStatus.path("stepUp").asText()),
                        () -> assertEquals(401, submit.statusCode()),
                        () -> assertEquals("INVALID_CREDENTIALS", json(submit).path("outcome").asText()),
                        () -> assertEquals("password", status(client).path("stepUp").asText()),
                        () -> assertTrue(body(client, doc(N2)).path("transitions").get(0).path("stepUp").asBoolean()));
            }
        }

        @Test
        @DisplayName("note-save-too-many-logins, note-submit-too-many-logins: 503 TOO_MANY_LOGINS with Retry-After")
        void shouldRefuseWithTooManyLogins() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-save-too-many-logins");
                var save = client.change("POST", save(N2), "{}");
                goTo(client, "note-submit-too-many-logins");
                var submit = client.change("POST", submit(N2), "{}");
                for (var response : List.of(save, submit)) {
                    assertAll(
                            () -> assertEquals(503, response.statusCode()),
                            () -> assertEquals("TOO_MANY_LOGINS", json(response).path("outcome").asText()),
                            () -> assertEquals("60", response.headers().firstValue("Retry-After").orElse("")));
                }
            }
        }
    }

    @Nested
    @DisplayName("workshop: a second generic category, a switched-off one, documents that do not exist, a refused search")
    class MoreCategories {

        @Test
        @DisplayName("category-two: two generic categories, the minutes with their documents, schema and search")
        void shouldListTwoCategories() {
            try (var client = MockClient.start("workshop").login()) {
                assertEquals(0, body(client, "/api/v1/search?q=architecture").path("results").size());
                goTo(client, "category-two");
                var categories = body(client, CATEGORIES).path("categories");
                var list = body(client, MINUTES);
                var draftNote = body(client, MINUTES + "/" + M1);
                var frozen = body(client, MINUTES + "/" + M2);
                var savedFrozen = client.change("POST", MINUTES + "/" + M2 + "/save", "{}");
                var schema = body(client, "/api/v1/categories/meeting-minutes/schema");
                var found = body(client, "/api/v1/search?q=architecture").path("results");
                assertAll(
                        () -> assertEquals(List.of("test-note", "meeting-minutes"),
                                texts(ids(categories))),
                        () -> assertTrue(categories.get(0).path("generic").asBoolean()),
                        () -> assertTrue(categories.get(1).path("generic").asBoolean()),
                        () -> assertFalse(categories.get(1).has("enabled")),
                        () -> assertEquals("meeting-minutes", categories.get(1).path("kinds").get(0).path("repository").asText()),
                        () -> assertEquals(2, list.path("documents").size()),
                        () -> assertEquals("/categories/meeting-minutes/" + M1,
                                list.path("documents").get(0).path("address").asText()),
                        () -> assertEquals("draft", draftNote.path("state").asText()),
                        () -> assertEquals("meeting-minutes.submit", draftNote.path("transitions").get(0).path("id").asText()),
                        () -> assertFalse(draftNote.path("frozen").asBoolean()),
                        () -> assertTrue(frozen.path("frozen").asBoolean()),
                        () -> assertEquals("minutes/" + M2 + "/v1", frozen.path("release").path("tag").asText()),
                        () -> assertEquals("meeting-minutes", schema.path("kinds").get(0).path("repository").asText()),
                        () -> assertEquals(List.of("title", "held"),
                                texts(schema.path("kinds").get(0).path("schema").path("required"))),
                        () -> assertEquals(1, found.size()),
                        () -> assertEquals("/categories/meeting-minutes/" + M1, found.get(0).path("address").asText()),
                        () -> assertEquals("TRANSITIONED", json(client.change("POST", minutesSubmit(M1), "{}"))
                                .path("outcome").asText()),
                        () -> assertEquals("DRAFT_SAVED", json(client.change("PUT",
                                "/api/v1/drafts/meeting-minutes/" + M1, "{}")).path("outcome").asText()),
                        () -> assertEquals(409, savedFrozen.statusCode()),
                        () -> assertEquals("DOCUMENT_RELEASED", json(savedFrozen).path("outcome").asText()),
                        () -> assertEquals("minutes/" + M2 + "/v1", json(savedFrozen).path("tag").asText()));
            }
        }

        private JsonNode ids(JsonNode categories) {
            var ids = MockClient.MAPPER.createArrayNode();
            categories.forEach(category -> ids.add(category.path("id").asText()));
            return ids;
        }

        @Test
        @DisplayName("category-switched-off: enabled false for the minutes, reads and search stay, every write of it is 403")
        void shouldSwitchTheMinutesOff() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "category-switched-off");
                var categories = body(client, CATEGORIES).path("categories");
                assertAll(
                        () -> assertEquals(2, categories.size()),
                        () -> assertFalse(categories.get(0).has("enabled"), "test-note stays on"),
                        () -> assertTrue(categories.get(1).path("generic").asBoolean()),
                        () -> assertTrue(categories.get(1).has("enabled")),
                        () -> assertFalse(categories.get(1).path("enabled").asBoolean()));
                assertMinutesReadableAndReadOnly(client);
                assertEquals("SAVED", json(client.change("POST", save(N2), "{}")).path("outcome").asText(),
                        "the other category stays writable");
            }
        }

        @Test
        @DisplayName("category-only-switched-off: the one listed category is off; its documents stay readable, writes are 403")
        void shouldHaveNothingButASwitchedOffCategory() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "category-only-switched-off");
                var categories = body(client, CATEGORIES).path("categories");
                assertAll(
                        () -> assertEquals(1, categories.size()),
                        () -> assertEquals("meeting-minutes", categories.get(0).path("id").asText()),
                        () -> assertFalse(categories.get(0).path("enabled").asBoolean(true)));
                assertMinutesReadableAndReadOnly(client);
            }
        }

        @Test
        @DisplayName("both switched-off states refuse every write route of the minutes that the scenario level names")
        void shouldRefuseEveryMinutesWriteInTheSwitchedOffStates() throws IOException {
            JsonNode workshop;
            try (var stream = CLASS_LOADER.getResourceAsStream("scenarios/workshop.json")) {
                workshop = MockClient.MAPPER.readTree(Objects.requireNonNull(stream));
            }
            List<String> writes = new ArrayList<>();
            workshop.path("routes").fieldNames().forEachRemaining(key -> {
                if (!key.startsWith("GET ") && key.contains("/meeting-minutes")) {
                    writes.add(key);
                }
            });
            assertFalse(writes.isEmpty(), "the scenario level names write routes of the minutes");
            for (var state : List.of("category-switched-off", "category-only-switched-off")) {
                var routes = workshop.path("states").path(state).path("routes");
                for (var write : writes) {
                    assertEquals(403, routes.path(write).path("status").asInt(),
                            state + " refuses " + write + " with 403 FORBIDDEN");
                    assertEquals("FORBIDDEN", routes.path(write).path("body").path("outcome").asText(), state + " " + write);
                }
            }
        }

        private void assertMinutesReadableAndReadOnly(MockClient client) {
            var schema = client.get("/api/v1/categories/meeting-minutes/schema");
            var found = body(client, "/api/v1/search?q=security%20board").path("results");
            assertAll(
                    () -> assertEquals(200, client.get(MINUTES).statusCode()),
                    () -> assertEquals(200, client.get(MINUTES + "/" + M1).statusCode()),
                    () -> assertEquals(200, client.get(MINUTES + "/" + M2 + "/revisions").statusCode()),
                    () -> assertEquals(200, schema.statusCode()),
                    () -> assertEquals("meeting-minutes", json(schema).path("category").asText()),
                    () -> assertEquals(1, found.size()),
                    () -> assertEquals(M2, found.get(0).path("id").asText()));
            for (var request : List.of(
                    List.of("PUT", "/api/v1/drafts/meeting-minutes/" + M1),
                    List.of("POST", MINUTES + "/" + M1 + "/save"),
                    List.of("POST", MINUTES + "/" + M2 + "/save"),
                    List.of("POST", minutesSubmit(M1)),
                    List.of("POST", MINUTES))) {
                var response = client.change(request.get(0), request.get(1), "{}");
                assertAll(request.toString(),
                        () -> assertEquals(403, response.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(response).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("answers 404 NOT_FOUND for an id the scenario does not know in a repository of the rights, MOCK_NO_ROUTE elsewhere")
        void shouldNotFindUnknownDocuments() {
            String unknown = "01JZ9ZZZZZZZZZZZZZZZZZZZZZ";
            for (String profile : List.of("workshop", "read-only")) {
                try (var client = MockClient.start(profile).login()) {
                    for (String path : List.of(DOCS + "/" + unknown, DOCS + "/" + unknown + "/revisions",
                            DOCS + "/" + unknown + "/diff", DOCS + "/" + unknown + "?at=v1",
                            "/api/v1/documents/samm-assessments/" + unknown)) {
                        var response = client.get(path);
                        assertAll(profile + " " + path,
                                () -> assertEquals(404, response.statusCode()),
                                () -> assertEquals("NOT_FOUND", json(response).path("outcome").asText()));
                    }
                    var elsewhere = client.get("/api/v1/documents/not-a-repository/" + unknown);
                    assertEquals("MOCK_NO_ROUTE", json(elsewhere).path("outcome").asText(), profile);
                }
            }
            try (var client = MockClient.start("workshop").login()) {
                for (var request : List.of(
                        List.of("PUT", "/api/v1/drafts/test-notes/" + unknown),
                        List.of("POST", DOCS + "/" + unknown + "/save"),
                        List.of("POST", DOCS + "/" + unknown + "/transitions/test-note.submit"),
                        List.of("POST", release(unknown)))) {
                    var response = client.change(request.get(0), request.get(1), "{}");
                    assertAll(request.toString(),
                            () -> assertEquals(404, response.statusCode()),
                            () -> assertEquals("NOT_FOUND", json(response).path("outcome").asText()));
                }
                assertEquals("NOT_FOUND", json(client.get(MINUTES + "/" + unknown)).path("outcome").asText());
                assertEquals(200, client.get(doc(N1)).statusCode(), "a known id is answered as before");
            }
        }

        @Test
        @DisplayName("note-search-refused: the search answers 403 FORBIDDEN")
        void shouldRefuseTheSearch() {
            try (var client = MockClient.start("workshop").login()) {
                goTo(client, "note-search-refused");
                var response = client.get("/api/v1/search?q=rotation");
                assertAll(
                        () -> assertEquals(403, response.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(response).path("outcome").asText()));
            }
        }
    }
}
