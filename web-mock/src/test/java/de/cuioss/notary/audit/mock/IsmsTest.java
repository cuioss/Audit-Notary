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

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The lens <em>ISMS</em> (doc/specification/rest-api.adoc, <em>ISMS Requests</em>): the schema, the register of risks, the eight
 * risks and the eight documents with their revisions and reads of a release, the diffs of the release view, the gaps of a scope,
 * the drafts of a risk from an origin, the Due items, the search index and the references. The fixtures are static: this class
 * recomputes every derived figure from the parts and fails when a file drifts from them or from the earlier steps (the profiles
 * answer them: {@link ProfilesTest}).
 */
@DisplayName("The ISMS lens")
class IsmsTest {

    private static final ClassLoader CLASS_LOADER = IsmsTest.class.getClassLoader();
    private static final CanonicalAddresses ADDRESSES = CanonicalAddresses.load(MockClient.MAPPER, CLASS_LOADER);
    private static final Pattern ULID = Pattern.compile("[0-9A-HJKMNP-TV-Z]{26}");
    private static final Pattern RISK_ID = Pattern.compile("R-\\d{3}");
    private static final LocalDate TODAY = LocalDate.parse("2026-11-26");

    /** The eight risks in the order of the register: the id, and the versions that were released. */
    private static final Map<String, List<Integer>> RISKS = new LinkedHashMap<>();
    /** The eight documents: the slug and the id. */
    private static final Map<String, String> DOCUMENTS = new LinkedHashMap<>();
    private static final Map<String, String> COLLECTIONS = Map.of("policy", "policies", "isms-scope", "scope", "audit-report", "audits",
            "management-review", "management-reviews");
    private static final List<String> REPORTS = List.of("now", "2026-03", "2026-06", "audit-2026-03", "management-review-2026-06",
            "before-first", "empty");

    static {
        RISKS.put("R-004", List.of(1, 2, 3));
        RISKS.put("R-007", List.of(1));
        RISKS.put("R-009", List.of(1, 2));
        RISKS.put("R-012", List.of(1, 2));
        RISKS.put("R-015", List.of(1));
        RISKS.put("R-018", List.of(1));
        RISKS.put("R-021", List.of(1));
        RISKS.put("R-042", List.of());
        DOCUMENTS.put("information-security-policy", "01JZB1C3E5G7J9M1P3R5T7W9Y2");
        DOCUMENTS.put("access-control-policy", "01JZB2D4F6H8K0N2Q4S6V8X0Z3");
        DOCUMENTS.put("secure-development-policy", "01JZB3E5G7J9M1P3R5T7W9Y1B4");
        DOCUMENTS.put("isms-scope", "01JZB4F6H8K0N2Q4S6V8X0Z2C5");
        DOCUMENTS.put("internal-audit-2025", "01JZB5G7J9M1P3R5T7W9Y1B3D6");
        DOCUMENTS.put("internal-audit-2026", "01JZB6H8K0N2Q4S6V8X0Z2C4E7");
        DOCUMENTS.put("management-review-2026-h1", "01JZB7J9M1P3R5T7W9Y1B3D5F8");
        DOCUMENTS.put("management-review-2025", "01JZB8K0N2Q4S6V8X0Z2C4E6G9");
    }

    static JsonNode data(String name) {
        return IncidentFixtures.data(name);
    }

    static boolean exists(String name) {
        return ScenarioRegistry.readDataFile(CLASS_LOADER, name).isPresent();
    }

    static String slugOf(String riskId) {
        return riskId.toLowerCase();
    }

    static JsonNode risk(String id) {
        return data("risk-" + slugOf(id) + ".json");
    }

    static JsonNode riskAt(String id, int version) {
        return data("risk-" + slugOf(id) + "-at-v" + version + ".json");
    }

    static JsonNode document(String slug) {
        return data("isms-doc-" + slug + ".json");
    }

    static List<String> texts(JsonNode array) {
        List<String> result = new ArrayList<>();
        array.forEach(item -> result.add(item.asText()));
        return result;
    }

    static List<JsonNode> list(JsonNode array) {
        List<JsonNode> result = new ArrayList<>();
        array.forEach(result::add);
        return result;
    }

    /** The row of the register for a risk id. */
    static JsonNode rowOf(String id) {
        return list(data("isms-register.json").path("risks")).stream().filter(row -> id.equals(row.path("id").asText())).findFirst().orElseThrow();
    }

    /** {@code reviewStatus} of <em>The Register of Risks</em>, small: overdue before today, due soon within 30 days, else ok, none without a date. */
    static String reviewStatus(String due) {
        if (due == null) {
            return "none";
        }
        long days = ChronoUnit.DAYS.between(TODAY, LocalDate.parse(due));
        return days < 0 ? "overdue" : days <= 30 ? "due-soon" : "ok";
    }

    static String text(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull() ? null : node.asText();
    }

    static String encode(String reference) {
        return URLEncoder.encode(reference, StandardCharsets.UTF_8);
    }

    static JsonNode schemaOfRisk(JsonNode schema) {
        return schema.path("kinds").get(4).path("schema");
    }

    @Nested
    @DisplayName("Mirrors: the data files agree with their parts, with one another, with the Reports step and with the contract")
    class Mirrors {

        @Test
        @DisplayName("the schema is the block of the register, parses, has the five kinds in order and a read-only origin")
        void shouldCopyTheSchemaOfTheRegister() throws IOException {
            String adoc = Files.readString(Path.of("../doc/specification/rest-api.adoc"));
            int marker = adoc.indexOf("=== The Data Shape of an ISMS Document and of a Risk");
            int start = adoc.indexOf("[source,json]\n----\n", marker) + "[source,json]\n----\n".length();
            var block = MockClient.MAPPER.readTree(adoc.substring(start, adoc.indexOf("\n----\n", start)));
            var schema = data("categories-isms-schema.json");
            List<String> kinds = new ArrayList<>();
            schema.path("kinds").forEach(kind -> kinds.add(kind.path("id").asText()));
            assertAll(
                    () -> assertEquals(block, schema),
                    () -> assertEquals("isms", schema.path("category").asText()),
                    () -> assertEquals(List.of("policy", "isms-scope", "audit-report", "management-review", "risk"), kinds),
                    () -> assertTrue(schemaOfRisk(schema).path("properties").path("origin").path("readOnly").asBoolean()),
                    () -> schema.path("kinds").forEach(kind -> {
                        var properties = kind.path("schema").path("properties");
                        kind.path("schema").path("required").forEach(name -> assertTrue(properties.has(name.asText()),
                                kind.path("id").asText() + " requires " + name.asText()));
                        assertEquals("risk".equals(kind.path("id").asText()) ? "isms-register" : "isms-core", kind.path("repository").asText());
                    }));
        }

        @Test
        @DisplayName("the ids are valid and unique, and the addresses of the rows and the reads are canonical")
        void shouldHaveValidIdsAndCanonicalAddresses() {
            Set<String> seen = new HashSet<>();
            RISKS.keySet().forEach(id -> assertTrue(RISK_ID.matcher(id).matches() && seen.add(id), id));
            DOCUMENTS.values().forEach(id -> assertTrue(ULID.matcher(id).matches() && seen.add(id), id));
            List<String> addresses = new ArrayList<>();
            data("isms-register.json").path("risks").forEach(row -> {
                assertEquals("/isms/risks/" + row.path("id").asText().toLowerCase(), row.path("address").asText());
                assertEquals(row.path("id").asText().toLowerCase(), row.path("entry").asText());
                addresses.add(row.path("address").asText());
            });
            data("isms-register-documents.json").path("documents").forEach(row -> {
                assertEquals("/isms/risks/" + row.path("id").asText().toLowerCase(), row.path("address").asText());
                addresses.add(row.path("address").asText());
            });
            data("isms-documents.json").path("documents").forEach(row -> {
                assertEquals("/isms/documents/" + row.path("id").asText(), row.path("address").asText());
                addresses.add(row.path("address").asText());
            });
            for (String reference : List.of("samm-assessments:assessment/payments-2026-q2#sm", "threat-models:threat-model/payment-api-checkout-flow#T-02")) {
                addresses.add("/isms/risks/new?origin=" + encode(reference));
            }
            DOCUMENTS.values().forEach(id -> addresses.add("/isms/documents/" + id + "/compare?from=v1&to=v2"));
            addresses.addAll(List.of("/isms", "/isms/risks", "/isms/risks/new", "/isms/risks/r-004?at=v1", "/isms/documents?kind=policy",
                    "/isms/documents/new?kind=policy", "/isms/documents/" + DOCUMENTS.get("isms-scope") + "?at=v1",
                    "/isms/risks/r-018/release", "/isms/documents/" + DOCUMENTS.get("secure-development-policy") + "/release"));
            addresses.forEach(address -> assertEquals(address, ADDRESSES.checkReturn(address), address));
            assertEquals(8, data("isms-register.json").path("risks").size());
            assertEquals(8, data("isms-documents.json").path("documents").size());
        }

        @Test
        @DisplayName("every release of a risk equals its summary in the Reports files, and its read of the release is frozen without transitions")
        void shouldAgreeWithTheReportsFiles() {
            Set<String> covered = new HashSet<>();
            for (String name : REPORTS) {
                data("reports-risks-" + name + ".json").path("risks").forEach(summary -> {
                    String id = summary.path("id").asText();
                    int version = summary.path("version").asInt();
                    assertTrue(RISKS.get(id).contains(version), id + " v" + version + " is no release");
                    var read = riskAt(id, version);
                    var value = read.path("parts").path("data").path("value");
                    covered.add(id + "/" + version);
                    assertAll(id + " v" + version + " in " + name,
                            () -> assertEquals(summary.path("title").asText(), value.path("title").asText()),
                            () -> assertEquals(summary.path("rating").asText(), value.path("rating").asText()),
                            () -> assertEquals(summary.path("treatment").asText(), value.path("treatment").asText()),
                            () -> assertEquals("team:" + summary.path("owner").path("id").asText(), value.path("owner").asText()),
                            () -> assertEquals(version, read.path("version").asInt()),
                            () -> assertEquals(summary.path("releasedAt").asText(), read.path("release").path("at").asText()),
                            () -> assertEquals(summary.path("reviewDue").asText(), value.path("review-due").asText()),
                            () -> assertEquals(summary.path("reference").isNull() ? null : summary.path("reference").path("ref").asText(),
                                    text(value.path("origin"))),
                            () -> assertTrue(read.path("frozen").asBoolean()),
                            () -> assertEquals("released", read.path("state").asText()),
                            () -> assertEquals(0, read.path("transitions").size()),
                            () -> assertTrue(read.path("draft").isNull()),
                            () -> assertEquals("v" + version, read.path("at").path("ref").asText()),
                            () -> assertEquals("risks/" + id + "/v" + version, read.path("at").path("tag").asText()));
                });
            }
            RISKS.forEach((id, versions) -> versions.forEach(version -> assertTrue(exists("risk-" + slugOf(id) + "-at-v" + version + ".json"), id)));
            assertEquals(11, RISKS.values().stream().mapToInt(List::size).sum());
        }

        @Test
        @DisplayName("the register agrees with the generic list, with the list of the Reports step and with the summary of its counts")
        void shouldAgreeWithTheOtherLists() {
            var register = data("isms-register.json");
            var generic = data("isms-register-documents.json");
            var now = data("reports-risks-now.json").path("risks");
            Map<String, JsonNode> genericById = new LinkedHashMap<>();
            generic.path("documents").forEach(row -> genericById.put(row.path("id").asText(), row));
            List<String> ids = new ArrayList<>();
            register.path("risks").forEach(row -> ids.add(row.path("id").asText()));
            assertAll(
                    () -> assertEquals("2026-11-26", register.path("today").asText()),
                    () -> assertFalse(register.path("truncated").asBoolean()),
                    () -> assertEquals(List.copyOf(RISKS.keySet()), ids),
                    () -> assertEquals(new HashSet<>(ids), genericById.keySet()),
                    () -> register.path("risks").forEach(row -> {
                        String id = row.path("id").asText();
                        var generic1 = genericById.get(id);
                        var read = risk(id);
                        var value = read.path("parts").path("data").path("value");
                        assertEquals(read.path("state"), row.path("state"), id);
                        assertEquals(read.path("version"), row.path("version"), id);
                        assertEquals(generic1.path("state"), row.path("state"), id);
                        assertEquals(generic1.path("version"), row.path("version"), id);
                        assertEquals(generic1.path("updatedAt"), row.path("updatedAt"), id);
                        assertEquals(generic1.path("release"), row.path("release"), id);
                        assertEquals(value.path("title"), row.path("title"), id);
                        assertEquals(value.path("rating"), row.path("rating"), id);
                        assertEquals(text(value.path("treatment")), text(row.path("treatment")), id);
                        assertEquals(text(value.path("review-due")), text(row.path("reviewDue")), id);
                        assertEquals(reviewStatus(text(row.path("reviewDue"))), row.path("reviewStatus").asText(), id);
                        assertEquals("team:" + row.path("owner").path("id").asText(), value.path("owner").asText(), id);
                        assertEquals(text(value.path("origin")), row.path("origin").isNull() ? null : row.path("origin").path("ref").asText(), id);
                        assertEquals(read.path("history").get(0).path("at"), row.path("updatedAt"), id);
                        assertEquals(read.path("history").get(0).path("by"), row.path("updatedBy"), id);
                    }),
                    () -> now.forEach(summary -> {
                        // the as-of list of now is the last release: the register has it as it is, except for the entry in review
                        var row = rowOf(summary.path("id").asText());
                        if ("released".equals(row.path("state").asText())) {
                            assertEquals(summary.path("version"), row.path("version"), summary.path("id").asText());
                            assertEquals(summary.path("title"), row.path("title"));
                            assertEquals(summary.path("rating"), row.path("rating"));
                            assertEquals(summary.path("treatment"), row.path("treatment"));
                            assertEquals(summary.path("owner"), row.path("owner"));
                            assertEquals(summary.path("reviewDue"), row.path("reviewDue"));
                            assertEquals(summary.path("reference"), row.path("origin"));
                            assertEquals(summary.path("address"), row.path("address"));
                            assertEquals(summary.path("releasedAt"), row.path("release").path("at"));
                        } else {
                            assertEquals("R-018", summary.path("id").asText());
                            assertEquals(1, summary.path("version").asInt());
                            assertEquals(2, row.path("version").asInt());
                        }
                    }),
                    () -> assertEquals(7, now.size()),
                    () -> assertEquals(List.of("ok", "overdue", "ok", "due-soon", "ok", "ok", "ok", "none"),
                            list(register.path("risks")).stream().map(row -> row.path("reviewStatus").asText()).toList()));
        }

        @Test
        @DisplayName("the state and the version of every entry follow its history, and the releases carry the tag of their collection")
        void shouldFollowTheHistoryAndTheTags() {
            List<JsonNode> entries = new ArrayList<>();
            RISKS.keySet().forEach(id -> entries.add(risk(id)));
            DOCUMENTS.keySet().forEach(slug -> entries.add(document(slug)));
            for (var read : entries) {
                String id = read.path("id").asText();
                boolean isRisk = "risk".equals(read.path("kind").asText());
                String prefix = isRisk ? "risks/" + id : COLLECTIONS.get(read.path("kind").asText()) + "/" + id;
                var history = list(read.path("history"));
                int releases = (int) history.stream().filter(item -> "release".equals(item.path("kind").asText())).count();
                String last = history.get(0).path("kind").asText();
                String state = "release".equals(last) ? "released" : "submit".equals(last) ? "in-review" : "draft";
                int version = "release".equals(last) ? releases : releases + 1;
                assertAll(id,
                        () -> assertEquals(state, read.path("state").asText()),
                        () -> assertEquals(version, read.path("version").asInt()),
                        () -> assertEquals("create", history.get(history.size() - 1).path("kind").asText()),
                        () -> assertTrue(history.size() <= 20),
                        () -> assertEquals(releases == 0, read.path("release").isNull()),
                        () -> assertEquals("released".equals(state) ? 0 : 1, read.path("transitions").size()),
                        () -> assertEquals("released".equals(state) ? null : "draft".equals(state) ? "isms.submit" : "isms.release",
                                text(read.path("transitions").path(0).path("id"))),
                        () -> assertEquals("in-review".equals(state), read.path("transitions").path(0).path("release").asBoolean()),
                        () -> assertFalse(read.path("frozen").asBoolean()),
                        () -> assertTrue(read.path("releaseRequest").isNull()));
                if (releases > 0) {
                    var tags = history.stream().filter(item -> "release".equals(item.path("kind").asText())).map(item -> item.path("tag").asText()).toList();
                    var newest = read.path("release");
                    assertAll(id,
                            () -> assertEquals(prefix + "/v" + releases, newest.path("tag").asText()),
                            () -> assertEquals(tags.get(0), newest.path("tag").asText()),
                            () -> assertEquals(history.stream().filter(item -> "release".equals(item.path("kind").asText())).findFirst().orElseThrow().path("at"),
                                    newest.path("at")),
                            () -> assertEquals("p-7d2e58", newest.path("by").path("pseudonym").asText()));
                }
                var revisions = data(isRisk ? "risk-" + slugOf(id) + "-revisions.json" : "isms-doc-" + slugOfDocument(id) + "-revisions.json");
                var newestRelease = list(revisions.path("revisions")).stream().filter(item -> "release".equals(item.path("kind").asText())).findFirst();
                assertAll(id,
                        () -> assertEquals(id, revisions.path("id").asText()),
                        () -> assertEquals(releases == 0, newestRelease.isEmpty()),
                        () -> newestRelease.ifPresent(release -> {
                            assertEquals(read.path("release").path("tag"), release.path("tag"));
                            assertEquals(read.path("release").path("at"), release.path("at"));
                            assertEquals("v" + releases, release.path("ref").asText());
                        }),
                        () -> assertEquals(history.size(), revisions.path("revisions").size()),
                        () -> assertEquals(history.get(0).path("at"), revisions.path("revisions").get(0).path("at")),
                        () -> assertTrue(revisions.path("revisions").get(0).path("ref").asText().matches("v\\d+|[0-9a-f]{7}")));
            }
        }

        private String slugOfDocument(String id) {
            return DOCUMENTS.entrySet().stream().filter(entry -> entry.getValue().equals(id)).findFirst().orElseThrow().getKey();
        }

        @Test
        @DisplayName("the lists of the documents are the reads: the generic list holds every document, newest change first, with its release")
        void shouldAgreeTheDocumentList() {
            var list = data("isms-documents.json");
            List<String> updated = new ArrayList<>();
            list.path("documents").forEach(row -> updated.add(row.path("updatedAt").asText()));
            assertAll(
                    () -> assertEquals(updated.stream().sorted(java.util.Comparator.reverseOrder()).toList(), updated),
                    () -> assertEquals(new HashSet<>(DOCUMENTS.values()), new HashSet<>(list(list.path("documents")).stream().map(row -> row.path("id").asText()).toList())),
                    () -> list.path("documents").forEach(row -> {
                        var read = data("isms-doc-" + slugOfDocument(row.path("id").asText()) + ".json");
                        assertEquals(read.path("title"), row.path("title"));
                        assertEquals(read.path("kind"), row.path("kind"));
                        assertEquals(read.path("state"), row.path("state"));
                        assertEquals(read.path("version"), row.path("version"));
                        assertEquals(read.path("history").get(0).path("at"), row.path("updatedAt"));
                        assertEquals(read.path("history").get(0).path("by"), row.path("updatedBy"));
                        assertEquals(read.path("release").isNull() ? null : read.path("release").path("tag").asText(),
                                row.path("release").isNull() ? null : row.path("release").path("tag").asText());
                        assertFalse(row.path("requested").asBoolean());
                        assertEquals(read.path("parts").path("data").path("value").path("title"), read.path("title"));
                    }),
                    () -> assertEquals(1, list(list.path("documents")).stream().filter(row -> "draft".equals(row.path("state").asText())).count()),
                    () -> assertNull(text(list(list.path("documents")).stream()
                            .filter(row -> "draft".equals(row.path("state").asText())).findFirst().orElseThrow().path("release").path("tag"))));
        }

        @Test
        @DisplayName("every field of a value is in the schema of its kind, the required fields are there, and the owners are teams and roles of the catalogs")
        void shouldKeepTheValuesInTheSchema() {
            var schema = data("categories-isms-schema.json");
            Set<String> teams = new HashSet<>();
            data("catalog-team-entries.json").path("entries").forEach(entry -> teams.add(entry.path("id").asText()));
            Set<String> roles = new HashSet<>();
            data("catalog-role-entries.json").path("entries").forEach(entry -> roles.add(entry.path("id").asText()));
            List<JsonNode> reads = new ArrayList<>();
            RISKS.keySet().forEach(id -> {
                reads.add(risk(id));
                RISKS.get(id).forEach(version -> reads.add(riskAt(id, version)));
            });
            DOCUMENTS.keySet().forEach(slug -> reads.add(document(slug)));
            for (var read : reads) {
                String kind = read.path("kind").asText();
                var kindSchema = list(schema.path("kinds")).stream().filter(k -> kind.equals(k.path("id").asText())).findFirst().orElseThrow().path("schema");
                var value = read.path("parts").path("data").path("value");
                List<String> order = new ArrayList<>();
                kindSchema.path("properties").fieldNames().forEachRemaining(order::add);
                List<String> names = new ArrayList<>();
                value.fieldNames().forEachRemaining(names::add);
                String label = read.path("id").asText() + " v" + read.path("version").asInt();
                assertAll(label,
                        () -> assertTrue(order.containsAll(names), label + " " + names),
                        () -> assertEquals(names.stream().sorted(java.util.Comparator.comparingInt(order::indexOf)).toList(), names, "the order of the schema"),
                        () -> assertEquals(value.path("title"), read.path("title")),
                        () -> assertTrue(value.has("title")),
                        () -> assertEquals(1, read.path("parts").size()),
                        () -> assertEquals(7, read.path("parts").path("data").path("blob").asText().length()),
                        () -> {
                            // the two drafts are what the refused submit names: R-042 has no treatment, the audit 2026 no conclusion
                            if (!Set.of("R-042", DOCUMENTS.get("internal-audit-2026")).contains(read.path("id").asText())) {
                                kindSchema.path("required").forEach(name -> assertTrue(value.has(name.asText()), label + " lacks " + name.asText()));
                            }
                        },
                        () -> {
                            var owner = text(value.path("owner"));
                            if (owner != null) {
                                String[] parts = owner.split(":");
                                assertTrue("risk".equals(kind) ? "team".equals(parts[0]) && teams.contains(parts[1]) : "role".equals(parts[0]) && roles.contains(parts[1]), owner);
                            }
                            var role = text(value.path("owner-role"));
                            if (role != null) {
                                assertTrue(roles.contains(role.split(":")[1]), role);
                            }
                        });
            }
            assertFalse(document("internal-audit-2026").path("parts").path("data").path("value").has("conclusion"));
            assertFalse(risk("R-042").path("parts").path("data").path("value").has("treatment"));
            assertFalse(risk("R-042").path("parts").path("data").path("value").has("review-due"));
            assertNull(text(risk("R-042").path("release")));
        }
    }

    @Nested
    @DisplayName("Diffs: the release views name the revisions and agree with the values")
    class Diffs {

        private void assertDiff(JsonNode diff, JsonNode from, String fromTag, JsonNode to, String toTag) {
            var changes = list(diff.path("sections").path(0).path("changes"));
            assertAll(diff.path("id").asText(),
                    () -> assertEquals(fromTag, text(diff.path("from"))),
                    () -> assertEquals(toTag, text(diff.path("to"))),
                    () -> assertEquals("data", diff.path("sections").path(0).path("part").asText()),
                    () -> assertFalse(changes.isEmpty()),
                    () -> changes.forEach(change -> {
                        String pointer = change.path("pointer").asText();
                        var after = to.at(pointer);
                        assertFalse(after.isMissingNode(), pointer + " is no field of the value it names");
                        assertEquals(after, change.path("after"), pointer);
                        var before = from == null ? null : from.at(pointer);
                        assertEquals(from == null || before.isMissingNode() ? null : before, change.path("before").isNull() ? null : change.path("before"), pointer);
                        assertFalse(change.path("before").equals(change.path("after")), pointer);
                    }),
                    () -> {
                        // every field that differs is listed, and no other
                        List<String> names = new ArrayList<>();
                        to.fieldNames().forEachRemaining(names::add);
                        if (from != null) {
                            from.fieldNames().forEachRemaining(name -> {
                                if (!names.contains(name)) {
                                    names.add(name);
                                }
                            });
                        }
                        List<String> differing = names.stream().filter(name -> from == null || !from.path(name).equals(to.path(name))).map(name -> "/" + name).toList();
                        assertEquals(differing.stream().sorted().toList(), changes.stream().map(change -> change.path("pointer").asText()).sorted().toList());
                    });
        }

        @Test
        @DisplayName("R-018 against its release: description, review date and issues; R-042 and the audit 2026 are all additions")
        void shouldDiffTheRisks() {
            var r18 = risk("R-018");
            assertDiff(data("isms-diff-r-018-released.json"), riskAt("R-018", 1).path("parts").path("data").path("value"), "risks/R-018/v1",
                    r18.path("parts").path("data").path("value"), "working");
            assertEquals("risks/R-018/v1", r18.path("release").path("tag").asText());
            var r42 = risk("R-042");
            assertDiff(data("isms-diff-r-042-released.json"), null, null, r42.path("parts").path("data").path("value"), "working");
            assertEquals(r42.path("parts").path("data").path("value").size(),
                    data("isms-diff-r-042-released.json").path("sections").path(0).path("changes").size());
            var audit = document("internal-audit-2026");
            assertDiff(data("isms-diff-internal-audit-2026-released.json"), null, null, audit.path("parts").path("data").path("value"), "working");
        }

        @Test
        @DisplayName("the policy in review against its release: the statements and the teams it applies to")
        void shouldDiffThePolicyInReview() {
            var read = document("secure-development-policy");
            var diff = data("isms-diff-secure-development-policy-released.json");
            String tag = read.path("release").path("tag").asText();
            assertEquals(tag, diff.path("from").asText());
            assertEquals("policies/" + DOCUMENTS.get("secure-development-policy") + "/v1", tag);
            assertEquals(List.of("/statements", "/applies-to"), list(diff.path("sections").path(0).path("changes")).stream()
                    .map(change -> change.path("pointer").asText()).toList());
            var before = "isms-doc-secure-development-policy-at-v1.json";
            var value = read.path("parts").path("data").path("value");
            if (exists(before)) {
                assertDiff(diff, data(before).path("parts").path("data").path("value"), tag, value, "working");
            } else {
                // the read of the release v1 is not in the base files: the values after the change are still the working ones
                diff.path("sections").path(0).path("changes").forEach(change -> assertEquals(value.at(change.path("pointer").asText()), change.path("after")));
            }
        }
    }

    @Nested
    @DisplayName("Gaps, drafts, Due, search and references")
    class Derived {

        private final JsonNode model = data("samm-model-v2.2.0.json");

        private List<String> practices() {
            List<String> ids = new ArrayList<>();
            model.path("functions").forEach(function -> function.path("practices").forEach(practice -> ids.add(practice.path("id").asText())));
            return ids;
        }

        private String functionOf(String practice) {
            for (var function : model.path("functions")) {
                for (var candidate : function.path("practices")) {
                    if (practice.equals(candidate.path("id").asText())) {
                        return function.path("id").asText();
                    }
                }
            }
            throw new IllegalArgumentException(practice);
        }

        @Test
        @DisplayName("the gaps of a scope are recomputed from its targets and the last point of its trend; risk is the entry that names the gap")
        void shouldRecomputeTheGaps() {
            Map<String, Integer> counts = Map.of("payments", 15, "shop", 15, "organisation", 14);
            counts.forEach((scope, count) -> {
                var gaps = data("isms-gaps-" + scope + ".json");
                var targets = data("samm-scope-" + scope + ".json");
                var point = list(data("samm-trend-" + scope + ".json").path("points")).stream().reduce((a, b) -> b).orElseThrow();
                var assessment = list(targets.path("assessments")).stream().filter(a -> point.path("assessment").asText().equals(a.path("id").asText())).findFirst().orElseThrow();
                List<String> expected = new ArrayList<>();
                for (String practice : practices()) {
                    var target = targets.path("targets").path(practice);
                    if (!target.isMissingNode() && point.path("practices").path(practice).asDouble() < target.path("target").asDouble()) {
                        expected.add(practice);
                    }
                }
                List<JsonNode> rows = list(gaps.path("gaps"));
                assertAll(scope,
                        () -> assertEquals(count, rows.size()),
                        () -> assertEquals(expected, rows.stream().map(row -> row.path("practice").asText()).toList()),
                        () -> assertEquals(scope, gaps.path("scope").asText()),
                        () -> assertEquals("2026-11-26", gaps.path("today").asText()),
                        () -> assertEquals(assessment.path("document").asText(), gaps.path("assessment").path("document").asText()),
                        () -> assertEquals(assessment.path("title").asText(), gaps.path("assessment").path("title").asText()),
                        () -> assertEquals(assessment.path("release").path("tag").asText(), gaps.path("assessment").path("release").path("tag").asText()),
                        () -> assertEquals(point.path("date").asText(), gaps.path("assessment").path("date").asText()),
                        () -> rows.forEach(row -> {
                            String practice = row.path("practice").asText();
                            double score = point.path("practices").path(practice).asDouble();
                            double target = targets.path("targets").path(practice).path("target").asDouble();
                            String reference = "samm-assessments:assessment/" + assessment.path("document").asText() + "#" + practice;
                            assertEquals(score, row.path("score").asDouble(), practice);
                            assertEquals(target, row.path("target").asDouble(), practice);
                            assertEquals(target - score, row.path("gap").asDouble(), practice);
                            assertEquals(functionOf(practice), row.path("function").asText(), practice);
                            assertEquals(reference, row.path("reference").asText(), practice);
                            assertEquals(text(targets.path("targets").path(practice).path("due")), text(row.path("due")), practice);
                            var named = list(data("isms-register.json").path("risks")).stream()
                                    .filter(risk -> !risk.path("origin").isNull() && reference.equals(risk.path("origin").path("ref").asText())).toList();
                            if (named.isEmpty()) {
                                assertTrue(row.path("risk").isNull(), practice);
                            } else {
                                assertEquals(named.get(0).path("id").asText(), row.path("risk").path("id").asText(), practice);
                                assertEquals(named.get(0).path("title"), row.path("risk").path("title"));
                                assertEquals(named.get(0).path("address"), row.path("risk").path("address"));
                            }
                        }));
            });
            var payments = list(data("isms-gaps-payments.json").path("gaps"));
            assertEquals(List.of("st"), payments.stream().filter(row -> !row.path("risk").isNull()).map(row -> row.path("practice").asText()).toList());
            assertFalse(list(data("isms-gaps-organisation.json").path("gaps")).stream().anyMatch(row -> "sb".equals(row.path("practice").asText())));
        }

        @Test
        @DisplayName("every origin of a risk resolves, and the threat that is transferred names the risk whose origin it is")
        void shouldResolveTheOrigins() {
            Map<String, JsonNode> references = new LinkedHashMap<>();
            data("references-resolve.json").path("references").forEach(reference -> references.put(reference.path("ref").asText(), reference));
            data("isms-register.json").path("risks").forEach(row -> {
                if (!row.path("origin").isNull()) {
                    var origin = row.path("origin");
                    var resolved = references.get(origin.path("ref").asText());
                    assertNotNull(resolved, origin.path("ref").asText());
                    assertTrue(resolved.path("found").asBoolean());
                    assertEquals(resolved.path("title"), origin.path("title"));
                    assertEquals(resolved.path("address"), origin.path("address"));
                }
            });
            var model = data("threat-model-payment-api-checkout-flow.json");
            for (var threat : model.path("parts").path("model").path("value").path("threats")) {
                var transferred = text(threat.path("attributes").path("transferred"));
                if (transferred != null) {
                    String id = transferred.substring(transferred.lastIndexOf('/') + 1);
                    assertEquals("threat-models:threat-model/" + model.path("id").asText() + "#" + threat.path("id").asText(),
                            risk(id).path("parts").path("data").path("value").path("origin").asText());
                }
            }
            assertEquals("isms-register:risk/R-009", references.get("isms-register:risk/R-009").path("ref").asText());
            assertAll(
                    () -> assertTrue(references.get("isms-register:risk/R-009").path("found").asBoolean()),
                    () -> assertTrue(references.get("isms-register:risk/R-015").path("found").asBoolean()),
                    () -> assertFalse(references.get("isms-register:risk/R-043").path("found").asBoolean(), "the number is not assigned in the base"),
                    () -> assertEquals("/isms/documents/" + DOCUMENTS.get("information-security-policy"),
                            references.get("isms-core:policy/" + DOCUMENTS.get("information-security-policy")).path("address").asText()),
                    () -> assertEquals("Unpatched build agents", references.get("isms-register:risk/R-042").path("title").asText()),
                    () -> assertEquals("Payment API, checkout flow: T-02",
                            references.get("threat-models:threat-model/payment-api-checkout-flow#T-02").path("title").asText()),
                    () -> assertEquals("/samm/payments/2026-q2/sm",
                            references.get("samm-assessments:assessment/payments-2026-q2#sm").path("address").asText()));
            // the references a value names resolve, the reference files of the earlier steps stay
            List<JsonNode> reads = new ArrayList<>();
            RISKS.keySet().forEach(id -> reads.add(risk(id)));
            DOCUMENTS.keySet().forEach(slug -> reads.add(document(slug)));
            for (var read : reads) {
                var value = read.path("parts").path("data").path("value");
                for (String name : List.of("related", "applies-to")) {
                    value.path(name).forEach(reference -> {
                        if (!"organisation".equals(reference.asText())) {
                            assertTrue(references.containsKey(reference.asText()) && references.get(reference.asText()).path("found").asBoolean(),
                                    read.path("id").asText() + " names " + reference.asText());
                        }
                    });
                }
            }
        }

        @Test
        @DisplayName("the drafts of a risk from an origin: the fields are in the schema, the owner is a team, the numbers are those of the gap")
        void shouldKeepTheDrafts() {
            var schema = schemaOfRisk(data("categories-isms-schema.json")).path("properties");
            Set<String> teams = new HashSet<>();
            data("catalog-team-entries.json").path("entries").forEach(entry -> teams.add(entry.path("id").asText()));
            var gap = data("isms-draft-gap-sm.json");
            var t02 = data("isms-draft-threat-t02.json");
            var t09 = data("isms-draft-threat-t09.json");
            for (var draft : List.of(gap, t02, t09)) {
                draft.path("fields").fieldNames().forEachRemaining(pointer -> assertTrue(schema.has(pointer.substring(1)), pointer));
                assertFalse(draft.path("fields").has("/rating"), "the rating is never prefilled");
                assertTrue(teams.contains(draft.path("fields").path("/owner").asText().substring(5)));
                assertTrue(draft.path("origin").path("address").asText().startsWith("/"));
                assertEquals(draft.path("origin").path("address"), draft.path("origin").path("address"));
                assertEquals(draft.path("origin").path("address").asText(), ADDRESSES.checkReturn(draft.path("origin").path("address").asText()));
            }
            var sm = list(data("isms-gaps-payments.json").path("gaps")).stream().filter(row -> "sm".equals(row.path("practice").asText())).findFirst().orElseThrow();
            var threat = list(data("threat-model-payment-api-checkout-flow.json").path("parts").path("model").path("value").path("threats")).stream()
                    .collect(java.util.stream.Collectors.toMap(item -> item.path("id").asText(), item -> item));
            assertAll(
                    () -> assertEquals("samm-gap", gap.path("origin").path("kind").asText()),
                    () -> assertEquals(sm.path("reference").asText(), gap.path("origin").path("ref").asText()),
                    () -> assertEquals("mitigate", gap.path("fields").path("/treatment").asText()),
                    () -> assertTrue(gap.path("fields").path("/description").asText().contains(sm.path("score").asText())),
                    () -> assertTrue(gap.path("fields").path("/description").asText().contains(sm.path("target").asText())),
                    () -> assertEquals("threat", t02.path("origin").path("kind").asText()),
                    () -> assertEquals(threat.get("T-02").path("name").asText(), t02.path("fields").path("/title").asText()),
                    () -> assertEquals(threat.get("T-02").path("description").asText(), t02.path("fields").path("/description").asText()),
                    () -> assertFalse(t02.path("fields").has("/treatment"), "an open threat has no treatment"),
                    () -> assertEquals("open", threat.get("T-02").path("attributes").path("status").asText()),
                    () -> assertEquals("accept", t09.path("fields").path("/treatment").asText()),
                    () -> assertEquals("accepted", threat.get("T-09").path("attributes").path("status").asText()),
                    () -> assertEquals(threat.get("T-09").path("name").asText(), t09.path("fields").path("/title").asText()));
        }

        @Test
        @DisplayName("the Due items are the reviews of the released entries within 30 days or overdue, in every list, and the old item is gone")
        void shouldDeriveTheDueItems() {
            List<JsonNode> expected = new ArrayList<>();
            List<JsonNode> entries = new ArrayList<>();
            RISKS.keySet().forEach(id -> entries.add(risk(id)));
            DOCUMENTS.keySet().forEach(slug -> entries.add(document(slug)));
            for (var read : entries) {
                var value = read.path("parts").path("data").path("value");
                String due = text(value.path("review-due"));
                if ("released".equals(read.path("state").asText()) && due != null && ChronoUnit.DAYS.between(TODAY, LocalDate.parse(due)) <= 30) {
                    boolean isRisk = "risk".equals(read.path("kind").asText());
                    var item = MockClient.MAPPER.createObjectNode().put("kind", "review").put("lens", "isms")
                            .put("title", isRisk ? "Risk " + read.path("id").asText() + ": " + read.path("title").asText() : read.path("title").asText())
                            .put("address", isRisk ? "/isms/risks/" + read.path("id").asText().toLowerCase() : "/isms/documents/" + read.path("id").asText())
                            .put("due", due);
                    expected.add(item);
                }
            }
            expected.sort(java.util.Comparator.comparing(item -> item.path("due").asText()));
            assertEquals(4, expected.size());
            for (String name : List.of("due-workshop-lifecycle.json", "due-workshop-lifecycle-n5-released.json", "due-incident-clock.json", "due-incident-recorded.json")) {
                var items = list(data(name).path("items"));
                var isms = items.stream().filter(item -> "isms".equals(item.path("lens").asText())).toList();
                assertAll(name,
                        () -> assertEquals(expected, isms),
                        () -> assertFalse(items.stream().anyMatch(item -> item.path("title").asText().contains("supplier access")), "the old title"),
                        () -> assertEquals(items.indexOf(isms.get(0)) + 3, items.indexOf(isms.get(3))));
                isms.forEach(item -> assertEquals(item.path("address").asText(), ADDRESSES.checkReturn(item.path("address").asText())));
            }
            var due = list(data("due-workshop-lifecycle.json").path("items"));
            assertEquals(List.of("samm", "samm", "threat-models", "incidents", "incidents", "incidents", "isms", "isms", "isms", "isms", "categories"),
                    due.stream().map(item -> item.path("lens").asText()).limit(11).toList());
        }

        @Test
        @DisplayName("the search index holds the eight documents and the eight risks in every variant, with the title and the state of the reads")
        void shouldIndexTheSixteenEntries() {
            for (String name : List.of("documents-index.json", "documents-index-created.json", "documents-index-incident-created.json",
                    "documents-index-minutes.json", "documents-index-n5-released.json")) {
                var entries = list(data(name).path("entries")).stream().filter(entry -> entry.path("category").asText().equals("isms")).toList();
                assertEquals(16, entries.size(), name);
                for (var entry : entries) {
                    boolean isRisk = "isms-register".equals(entry.path("repository").asText());
                    var read = isRisk ? risk(entry.path("id").asText()) : document(DOCUMENTS.entrySet().stream()
                            .filter(candidate -> candidate.getValue().equals(entry.path("id").asText())).findFirst().orElseThrow().getKey());
                    assertAll(name + " " + entry.path("id").asText(),
                            () -> assertEquals(read.path("title"), entry.path("title")),
                            () -> assertEquals(read.path("state"), entry.path("state")),
                            () -> assertEquals(read.path("kind"), entry.path("kind")),
                            () -> assertEquals(isRisk ? "/isms/risks/" + entry.path("id").asText().toLowerCase() : "/isms/documents/" + entry.path("id").asText(),
                                    entry.path("address").asText()));
                }
                Set<String> repositories = new HashSet<>();
                list(data(name).path("entries")).forEach(entry -> repositories.add(entry.path("repository").asText()));
                assertTrue(repositories.containsAll(Set.of("isms-register", "isms-core", "threat-models", "samm-assessments", "test-notes")), name);
            }
        }
    }
}
