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
import de.cuioss.notary.audit.mock.IncidentFixtures.Deadline;
import de.cuioss.notary.audit.mock.runtime.CanonicalAddresses;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static de.cuioss.notary.audit.mock.IncidentFixtures.IDS;
import static de.cuioss.notary.audit.mock.IncidentFixtures.RELEASED;
import static de.cuioss.notary.audit.mock.IncidentFixtures.SLUGS;
import static de.cuioss.notary.audit.mock.IncidentFixtures.STAGES;
import static de.cuioss.notary.audit.mock.IncidentFixtures.data;
import static de.cuioss.notary.audit.mock.IncidentFixtures.read;
import static de.cuioss.notary.audit.mock.IncidentFixtures.repositoryOf;
import static de.cuioss.notary.audit.mock.IncidentFixtures.text;
import static de.cuioss.notary.audit.mock.IncidentFixtures.texts;
import static de.cuioss.notary.audit.mock.IncidentFixtures.updatedOf;
import static de.cuioss.notary.audit.mock.IncidentFixtures.yearOf;
import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The lens <em>Incident reports</em> (doc/specification/rest-api.adoc, <em>Incident Report Requests</em>): the schema, the
 * years, the lists, the nine incidents with their revisions and reports, the Due items and what the profile workshop answers
 * in its base state. The fixtures are static: the section {@code Mirrors} recomputes every derived figure from the parts and
 * fails when a file drifts from them (the states of workshop are in {@link IncidentStatesTest}).
 */
@DisplayName("The Incident reports lens")
class IncidentsTest {

    private static final Pattern ULID = Pattern.compile("[0-9A-HJKMNP-TV-Z]{26}");
    private static final Pattern HEX7 = Pattern.compile("[0-9a-f]{7}");
    private static final CanonicalAddresses ADDRESSES = CanonicalAddresses.load(MockClient.MAPPER, IncidentFixtures.CLASS_LOADER);
    private static final String ASOF = "2026-11-26T10:00:00Z";
    private static final List<String> HEADINGS = List.of("Summary", "Affected services", "Deadlines", "Notifications", "Triage",
            "Privacy assessment", "Response", "Review", "Course", "Root-cause analysis", "Lessons");

    private static MockClient start(String profile) {
        return MockClient.start(profile).login();
    }

    private static JsonNode get(MockClient client, String path) {
        var response = client.get(path);
        assertEquals(200, response.statusCode(), path);
        return json(response);
    }

    private static JsonNode refusal(MockClient client, String method, String path, int status, String outcome) {
        var response = client.change(method, path, "{}");
        assertEquals(status, response.statusCode(), path);
        var body = json(response);
        assertEquals(outcome, body.path("outcome").asText(), path);
        return body;
    }

    private static String sha7(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(text.getBytes(StandardCharsets.UTF_8)))
                    .substring(0, 7);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String doc(String slug) {
        return "/api/v1/documents/" + repositoryOf(slug) + "/" + IDS.get(slug);
    }

    static String dom(String slug) {
        return "/api/v1/incidents/" + yearOf(slug) + "/" + IDS.get(slug);
    }

    static String stage(String slug, String stage, String act) {
        return doc(slug) + "/stages/" + stage + "/" + act;
    }

    private static List<JsonNode> rows(JsonNode list) {
        List<JsonNode> rows = new ArrayList<>();
        list.path("incidents").forEach(rows::add);
        return rows;
    }

    /** The row of a list for an incident id. */
    static JsonNode rowOf(JsonNode list, String id) {
        return rows(list).stream().filter(row -> id.equals(row.path("id").asText())).findFirst().orElseThrow();
    }

    // ---------------------------------------------------------------------------------------------------------- the data
    @Nested
    @DisplayName("Mirrors: the data files agree with their parts, with one another and with the contract")
    class Mirrors {

        @Test
        @DisplayName("the schema is the block of the register, parses and splits the five stages with a read-only completion")
        void shouldCopyTheSchemaOfTheRegister() throws IOException {
            String adoc = Files.readString(Path.of("../doc/specification/rest-api.adoc"));
            int marker = adoc.indexOf("The schema of the document type, `GET /api/v1/categories/incident-reports/schema`");
            int start = adoc.indexOf("[source,json]\n----\n", marker) + "[source,json]\n----\n".length();
            var block = MockClient.MAPPER.readTree(adoc.substring(start, adoc.indexOf("\n----\n", start)));
            var schema = data("categories-incident-reports-schema.json");
            var properties = schema.path("kinds").get(0).path("schema").path("properties");
            assertAll(
                    () -> assertEquals(block, schema),
                    () -> assertEquals("incident-reports", schema.path("category").asText()),
                    () -> assertEquals("incident", schema.path("kinds").get(0).path("id").asText()),
                    () -> assertEquals(List.of("title"), texts(schema.path("kinds").get(0).path("schema").path("required"))),
                    () -> List.of("risk-assessment", "course", "root-cause-analysis", "lessons").forEach(field -> {
                        var narrative = schema.findValue(field);
                        assertTrue(narrative.path("x-asciidoc").asBoolean() && narrative.path("x-free-text").asBoolean(), field);
                        assertEquals(8000, narrative.path("maxLength").asInt(), field);
                    }),
                    () -> STAGES.forEach(stage -> {
                        assertTrue(properties.path(stage).path("gdr-split").asBoolean(), stage);
                        assertTrue(properties.path(stage).path("properties").path("completion").path("readOnly").asBoolean(), stage);
                    }));
        }

        @Test
        @DisplayName("the stage descriptors of every read (after, when, narrative, stepUp) are the declaration of The Stages of the register")
        void shouldMirrorTheDeclarationOfTheStages() throws IOException {
            String adoc = Files.readString(Path.of("../doc/specification/rest-api.adoc"));
            int marker = adoc.indexOf("=== The Stages");
            int start = adoc.indexOf("[source,yaml]\n----\n", marker) + "[source,yaml]\n----\n".length();
            List<String> entries = new ArrayList<>();
            for (String line : adoc.substring(start, adoc.indexOf("\n----\n", start)).lines().skip(1).toList()) {
                if (line.startsWith("  - ")) {
                    entries.add(line.substring(4).strip());
                } else {
                    entries.add(entries.remove(entries.size() - 1) + " " + line.strip());
                }
            }
            var declared = MockClient.MAPPER.createArrayNode();
            for (String entry : entries) {
                var stage = declared.addObject();
                stage.put("id", group(entry, "\\bid:\\s*([\\w-]+)"));
                stage.put("part", group(entry, "\\bpart:\\s*([\\w-]+)"));
                var after = stage.putArray("after");
                String afterList = group(entry, "\\bafter:\\s*\\[([^\\]]*)\\]");
                if (afterList != null && !afterList.isBlank()) {
                    for (String id : afterList.split(",")) {
                        after.add(id.strip());
                    }
                }
                String any = group(entry, "\\bwhen:\\s*\\{\\s*any:\\s*\\[([^\\]]*)\\]");
                String single = group(entry, "\\bwhen:\\s*(/[\\w/-]+)");
                if (any != null) {
                    var list = stage.putObject("when").putArray("any");
                    for (String field : any.split(",")) {
                        list.addObject().put("field", field.strip());
                    }
                } else if (single != null) {
                    stage.putObject("when").put("field", single);
                } else {
                    stage.putNull("when");
                }
                var narrative = stage.putArray("narrative");
                String narrativeList = group(entry, "\\bnarrative:\\s*\\[([^\\]]*)\\]");
                if (narrativeList != null) {
                    for (String field : narrativeList.split(",")) {
                        narrative.add(field.strip());
                    }
                }
                stage.put("stepUp", entry.contains("step-up: true"));
            }
            assertEquals(STAGES, texts(declared.findValues("id")));
            declared.forEach(stage -> assertEquals(IncidentFixtures.AFTER.get(stage.path("id").asText()), texts(stage.path("after")),
                    stage.path("id").asText()));
            List<String> files;
            try (Stream<Path> listing = Files.list(Path.of("src/main/resources/scenarios/data"))) {
                files = listing.map(file -> file.getFileName().toString())
                        .filter(name -> name.startsWith("incident-") && name.endsWith(".json")).sorted().toList();
            }
            int checked = 0;
            for (String name : files) {
                var read = data(name);
                if (!read.path("stages").isArray() || !read.path("parts").isObject()) {
                    continue;
                }
                checked++;
                assertEquals(declared.size(), read.path("stages").size(), name);
                for (int i = 0; i < declared.size(); i++) {
                    var want = declared.get(i);
                    var have = read.path("stages").get(i);
                    for (String member : List.of("id", "part", "after", "when", "narrative", "stepUp")) {
                        assertEquals(want.path(member), have.path(member), name + " " + want.path("id").asText() + " " + member);
                    }
                }
            }
            assertTrue(checked >= 20, "the reads that were found: " + checked);
        }

        private static String group(String text, String regex) {
            var matcher = Pattern.compile(regex).matcher(text);
            return matcher.find() ? matcher.group(1) : null;
        }

        @Test
        @DisplayName("the ids are valid unique ULIDs and the address segment of every read and row; every awareness is in its year")
        void shouldHaveValidAddresses() {
            Set<String> seen = new HashSet<>();
            for (String slug : SLUGS) {
                var read = read(slug);
                String id = IDS.get(slug);
                int year = yearOf(slug);
                assertAll(slug,
                        () -> assertTrue(ULID.matcher(id).matches()),
                        () -> assertTrue(seen.add(id)),
                        () -> assertEquals(id, read.path("id").asText()),
                        () -> assertEquals(repositoryOf(slug), read.path("repository").asText()),
                        () -> assertEquals("/incidents/" + year + "/" + id, read.path("address").asText()),
                        () -> assertEquals(year, read.path("year").asInt()),
                        () -> assertTrue(read.path("parts").path("triage").path("value").path("aware-at").asText()
                                .startsWith(String.valueOf(year))),
                        () -> assertEquals(read.path("title"), read.path("parts").path("data").path("value").path("title")));
            }
            for (int year : List.of(2026, 2025)) {
                var list = data("incidents-year-" + year + ".json");
                for (var row : list.path("incidents")) {
                    assertAll(row.path("id").asText(),
                            () -> assertTrue(ULID.matcher(row.path("id").asText()).matches()),
                            () -> assertEquals("/incidents/" + year + "/" + row.path("id").asText(), row.path("address").asText()),
                            () -> assertTrue(row.path("awareAt").asText().startsWith(String.valueOf(year))));
                }
            }
        }

        @Test
        @DisplayName("every read recomputes its stages (status, unanswered, missing, blockedBy, predecessorReopened) from its parts")
        void shouldDeriveTheStages() {
            var schema = data("categories-incident-reports-schema.json");
            List<JsonNode> reads = new ArrayList<>(SLUGS.stream().map(IncidentFixtures::read).toList());
            reads.add(data("incident-notification-outage-at-v1.json"));
            for (var read : reads) {
                var derived = IncidentFixtures.derive(read.path("parts"), schema);
                var stages = read.path("stages");
                assertEquals(STAGES, texts(stages.findValues("id")).stream().distinct().toList(), read.path("id").asText());
                for (int i = 0; i < derived.size(); i++) {
                    var expected = derived.get(i);
                    var stage = stages.get(i);
                    var value = read.path("parts").path(stage.path("part").asText()).path("value");
                    assertAll(read.path("id").asText() + " " + expected.id(),
                            () -> assertEquals(expected.id(), stage.path("id").asText()),
                            () -> assertEquals(expected.status(), stage.path("status").asText()),
                            () -> assertEquals(expected.unanswered(), stage.path("unanswered").asBoolean()),
                            () -> assertEquals(expected.missing(), texts(stage.path("missing"))),
                            () -> assertEquals(expected.blockedBy(), texts(stage.path("blockedBy"))),
                            () -> assertEquals(expected.predecessorReopened(), stage.path("predecessorReopened").asBoolean()),
                            () -> assertEquals("completed".equals(expected.status()), value.has("completion")),
                            () -> assertEquals("completed".equals(expected.status()), !stage.path("completion").isNull()),
                            () -> {
                                if (value.has("completion")) {
                                    assertEquals(value.path("completion").path("at"), stage.path("completion").path("at"));
                                    assertEquals(value.path("completion").path("by"), stage.path("completion").path("by").path("pseudonym"));
                                }
                            });
                }
            }
        }

        @Test
        @DisplayName("every deadline is recomputed from the parts and asOf, the six rules of the contract")
        void shouldRecomputeTheDeadlines() {
            for (String slug : SLUGS) {
                var read = read(slug);
                var expected = IncidentFixtures.deadlines(read.path("parts"), Instant.parse(read.path("asOf").asText()));
                assertEquals(expected, IncidentFixtures.deadlinesOf(read), slug);
                var released = RELEASED.contains(slug);
                assertEquals(released ? read.path("release").path("at").asText() : ASOF, read.path("asOf").asText(), slug);
            }
        }

        @Test
        @DisplayName("the figures of the brief: a missed and a late one, a progress report, a deadline without a date")
        void shouldHoldTheFiguresOfTheBrief() {
            var card = IncidentFixtures.deadlinesOf(read("card-data"));
            var archive = IncidentFixtures.deadlinesOf(read("archive-access"));
            var newsletter = IncidentFixtures.deadlinesOf(read("newsletter-list"));
            assertAll(
                    () -> assertEquals(List.of("MISSED", "MET", "MISSED", "OPEN"), card.stream().map(Deadline::status).toList()),
                    () -> assertNull(card.get(0).sentAt()),
                    () -> assertEquals("2026-11-22T10:20:00Z", card.get(2).sentAt()),
                    () -> assertEquals("2026-12-22T10:20:00Z", card.get(3).due()),
                    () -> assertEquals(List.of("MET", "MET", "MET", "OPEN"), archive.stream().map(Deadline::status).toList()),
                    () -> assertEquals("2026-11-06T10:00:00Z", archive.get(2).sentAt()),
                    () -> assertNull(archive.get(3).due()),
                    () -> assertEquals("MISSED", newsletter.get(0).status()),
                    () -> assertEquals("2025-09-12T09:00:00Z", newsletter.get(0).sentAt()),
                    () -> assertEquals(List.of(), IncidentFixtures.deadlinesOf(read("credential-stuffing"))),
                    () -> assertEquals(List.of(), IncidentFixtures.deadlinesOf(read("suspicious-logins"))),
                    () -> assertEquals(List.of("completed", "completed", "completed", "completed", "completed"),
                            texts(read("lost-laptop").path("stages").findValues("status"))),
                    () -> assertEquals("2026-11-26T08:30:00Z", read("suspicious-logins").path("parts").path("triage").path("value")
                            .path("aware-at").asText()));
        }

        @Test
        @DisplayName("the protection is the maximum of the effective needs of the affected services, the first service decides")
        void shouldDeriveTheProtection() {
            var services = data("catalog-service-entries.json");
            for (String slug : SLUGS) {
                var read = read(slug);
                var expected = IncidentFixtures.protection(read.path("parts").path("triage").path("value"), services);
                assertEquals(MockClient.MAPPER.valueToTree(expected), read.path("protection"), slug);
                assertNotNull(expected, slug);
            }
        }

        @Test
        @DisplayName("the blob ids are the first seven hex digits of the hash of the id, the part and the number of its writes")
        void shouldHaveBlobIds() {
            for (String slug : SLUGS) {
                var read = read(slug);
                var history = read.path("history");
                for (String part : IncidentFixtures.PARTS) {
                    var node = read.path("parts").path(part);
                    int writes = "data".equals(part) || "triage".equals(part) ? 1 : 0;
                    for (var entry : history) {
                        switch (entry.path("kind").asText()) {
                            case "save" -> writes += part.equals(entry.path("part").asText()) ? entry.path("count").asInt() : 0;
                            case "complete", "reopen" -> writes += part.equals(entry.path("stage").asText()) ? 1 : 0;
                            default -> {
                            }
                        }
                    }
                    if (node.path("blob").isNull()) {
                        assertAll(slug + " " + part, () -> assertTrue(node.path("savedAt").isNull()), () -> assertTrue(node.path("savedBy").isNull()),
                                () -> assertTrue(node.path("value").isEmpty()));
                    } else {
                        assertEquals(sha7(IDS.get(slug) + "/" + part + "/" + writes), node.path("blob").asText(), slug + " " + part);
                        assertTrue(HEX7.matcher(node.path("blob").asText()).matches());
                    }
                }
            }
        }

        @Test
        @DisplayName("the history is newest first, at most twenty entries, and the transitions follow the state")
        void shouldKeepTheHistory() {
            for (String slug : SLUGS) {
                var read = read(slug);
                List<String> times = new ArrayList<>();
                read.path("history").forEach(entry -> times.add(entry.path("at").asText()));
                var sorted = new ArrayList<>(times);
                sorted.sort(java.util.Comparator.reverseOrder());
                String state = read.path("state").asText();
                assertAll(slug,
                        () -> assertEquals(sorted, times),
                        () -> assertTrue(times.size() <= 20),
                        () -> assertEquals("create", read.path("history").get(times.size() - 1).path("kind").asText()),
                        () -> assertEquals(RELEASED.contains(slug) ? "released" : "draft", state),
                        () -> assertEquals(RELEASED.contains(slug), read.path("frozen").asBoolean()),
                        () -> assertEquals(RELEASED.contains(slug) ? List.of() : List.of("incident.submit"),
                                texts(read.path("transitions").findValues("id"))),
                        () -> assertEquals(RELEASED.contains(slug), !read.path("release").isNull()),
                        () -> assertEquals(1, read.path("version").asInt()),
                        () -> assertTrue(read.path("draft").isNull()),
                        () -> assertEquals(updatedOf(read), times.get(0)));
            }
        }

        @Test
        @DisplayName("the rows of the lists equal the reads: stages, deadline counts, next, the classification and the time")
        void shouldMatchTheRowsToTheReads() {
            for (int year : List.of(2026, 2025)) {
                var list = data("incidents-year-" + year + ".json");
                assertAll("list " + year,
                        () -> assertEquals("2026-11-26", list.path("today").asText()),
                        () -> assertEquals(ASOF, list.path("asOf").asText()),
                        () -> assertEquals(year, list.path("year").asInt()),
                        () -> assertEquals("isms-incidents-" + year, list.path("repository").asText()),
                        () -> assertFalse(list.path("truncated").asBoolean()));
                List<String> awareness = new ArrayList<>();
                rows(list).forEach(row -> awareness.add(row.path("awareAt").asText()));
                var newestFirst = new ArrayList<>(awareness);
                newestFirst.sort(java.util.Comparator.reverseOrder());
                assertEquals(newestFirst, awareness, "newest awareness first, " + year);
            }
            for (String slug : SLUGS) {
                IncidentFixtures.assertRow(rowOf(data("incidents-year-" + yearOf(slug) + ".json"), IDS.get(slug)), read(slug));
            }
        }

        @Test
        @DisplayName("the years count the rows of the lists; the generic lists equal the domain lists, newest change first")
        void shouldCountTheYears() {
            var years = data("incidents-years.json");
            for (var year : years.path("years")) {
                int number = year.path("year").asInt();
                var list = data("incidents-year-" + number + ".json");
                var generic = data("incidents-documents-" + number + ".json");
                long open = rows(list).stream().filter(row -> !"released".equals(row.path("state").asText())).count();
                long missed = rows(list).stream().filter(row -> row.path("deadlines").path("missed").asInt() > 0).count();
                assertAll("year " + number,
                        () -> assertEquals(rows(list).size(), year.path("incidents").asInt()),
                        () -> assertEquals(open, year.path("open").asLong()),
                        () -> assertEquals(missed, year.path("withMissedDeadline").asLong()),
                        () -> assertEquals(number == 2026, year.path("current").asBoolean()),
                        () -> assertEquals((number + 5) + "-12-31", year.path("retentionEnd").asText()),
                        () -> assertEquals("/incidents/" + number, year.path("address").asText()),
                        () -> assertEquals("isms-incidents-" + number, year.path("repository").asText()),
                        () -> assertEquals("isms-incidents-" + number, generic.path("repository").asText()),
                        () -> assertEquals(rows(list).size(), generic.path("documents").size()));
                List<String> updated = new ArrayList<>();
                for (var entry : generic.path("documents")) {
                    var row = rowOf(list, entry.path("id").asText());
                    updated.add(entry.path("updatedAt").asText());
                    assertAll(entry.path("id").asText(),
                            () -> assertEquals("incident", entry.path("kind").asText()),
                            () -> assertEquals(row.path("title"), entry.path("title")),
                            () -> assertEquals(row.path("state"), entry.path("state")),
                            () -> assertEquals(row.path("version"), entry.path("version")),
                            () -> assertEquals(row.path("updatedAt"), entry.path("updatedAt")),
                            () -> assertEquals(row.path("updatedBy"), entry.path("updatedBy")),
                            () -> assertEquals(row.path("release"), entry.path("release")),
                            () -> assertEquals(row.path("address"), entry.path("address")),
                            () -> assertFalse(entry.path("requested").asBoolean()));
                }
                var sorted = new ArrayList<>(updated);
                sorted.sort(java.util.Comparator.reverseOrder());
                assertEquals(sorted, updated);
            }
            assertAll(
                    () -> assertEquals(List.of(2026, 2025), years.path("years").findValues("year").stream().map(JsonNode::asInt).toList()),
                    () -> assertEquals("2026-11-26", years.path("today").asText()),
                    () -> assertEquals(List.of(2025), data("incidents-years-no-current.json").path("years").findValues("year").stream()
                            .map(JsonNode::asInt).toList()),
                    () -> assertFalse(data("incidents-years-no-current.json").path("years").get(0).path("current").asBoolean()));
        }

        @Test
        @DisplayName("the revisions end with the release v1 of a released incident, the diff of the credential stuffing is additions")
        void shouldKeepTheRevisions() {
            for (String slug : SLUGS) {
                var read = read(slug);
                var revisions = data("incident-" + slug + "-revisions.json");
                var list = revisions.path("revisions");
                assertAll(slug,
                        () -> assertEquals(read.path("id"), revisions.path("id")),
                        () -> assertEquals(read.path("repository"), revisions.path("repository")),
                        () -> assertEquals(read.path("history").size(), list.size()),
                        () -> assertEquals(read.path("history").get(0).path("at"), list.get(0).path("at")),
                        () -> assertEquals(RELEASED.contains(slug), "v1".equals(list.get(0).path("ref").asText())),
                        () -> list.forEach(revision -> assertTrue(HEX7.matcher(revision.path("commit").asText()).matches())),
                        () -> {
                            if (RELEASED.contains(slug)) {
                                assertEquals(read.path("release").path("tag"), list.get(0).path("tag"));
                                assertEquals(read.path("release").path("at"), list.get(0).path("at"));
                                assertEquals("release", list.get(0).path("kind").asText());
                            }
                        });
            }
            var atTag = data("incident-notification-outage-at-v1.json");
            var base = read("notification-outage");
            var diff = data("incident-credential-stuffing-diff.json");
            assertAll(
                    () -> assertTrue(atTag.path("frozen").asBoolean()),
                    () -> assertTrue(atTag.path("draft").isNull()),
                    () -> assertEquals(0, atTag.path("transitions").size()),
                    () -> assertEquals("v1", atTag.path("at").path("ref").asText()),
                    () -> assertEquals(base.path("release").path("tag"), atTag.path("at").path("tag")),
                    () -> assertEquals(base.path("stages"), atTag.path("stages")),
                    () -> assertEquals(base.path("deadlines"), atTag.path("deadlines")),
                    () -> assertEquals(base.path("parts"), atTag.path("parts")),
                    () -> assertTrue(diff.path("from").isNull()),
                    () -> assertEquals("working", diff.path("to").asText()),
                    () -> assertEquals(List.of("data", "triage", "response", "review"), texts(diff.path("sections").findValues("part"))),
                    () -> diff.path("sections").forEach(section -> {
                        var value = read("credential-stuffing").path("parts").path(section.path("part").asText()).path("value");
                        Set<String> pointers = new HashSet<>();
                        for (var change : section.path("changes")) {
                            String name = change.path("pointer").asText().substring(1);
                            pointers.add(name);
                            assertTrue(change.path("before").isNull());
                            if (!"completion".equals(name)) {
                                assertEquals(value.path(name), change.path("after"), name);
                            }
                        }
                        pointers.remove("completion");
                        Set<String> fields = new HashSet<>();
                        value.fieldNames().forEachRemaining(fields::add);
                        fields.remove("completion");
                        assertEquals(fields, pointers);
                    }));
        }

        @Test
        @DisplayName("the reports: the headings in order, every MISSED deadline in the table with its due time, committed exactly for a release")
        void shouldHaveTheReports() {
            var names = data("directory-persons.json").path("persons");
            List<String> people = new ArrayList<>();
            names.forEach(person -> {
                people.add(person.path("name").asText());
                people.add(person.path("name").asText().split(" ")[0]);
            });
            for (String slug : SLUGS) {
                var read = read(slug);
                var report = data("incident-" + slug + "-report.json");
                String adoc = report.path("adoc").asText();
                List<String> headings = adoc.lines().filter(line -> line.startsWith("== ")).map(line -> line.substring(3)).toList();
                var positions = headings.stream().map(HEADINGS::indexOf).toList();
                assertAll(slug,
                        () -> assertEquals(read.path("id"), report.path("id")),
                        () -> assertEquals(read.path("repository"), report.path("repository")),
                        () -> assertEquals(read.path("title"), report.path("title")),
                        () -> assertEquals(RELEASED.contains(slug) ? "committed" : "generated", report.path("source").asText()),
                        () -> assertEquals(read.path("asOf"), report.path("asOf")),
                        () -> assertTrue(adoc.startsWith("= " + read.path("title").asText() + "\n")),
                        () -> assertEquals(HEADINGS.subList(0, 4), headings.subList(0, 4)),
                        () -> assertTrue(positions.stream().noneMatch(p -> p < 0), headings.toString()),
                        () -> assertEquals(positions.stream().sorted().toList(), positions),
                        () -> assertTrue(adoc.getBytes(StandardCharsets.UTF_8).length <= 8192),
                        () -> assertEquals(IncidentFixtures.deadlinesOf(read).isEmpty(), adoc.contains("No deadline applies.")),
                        () -> IncidentFixtures.deadlinesOf(read).stream().filter(d -> "MISSED".equals(d.status())).forEach(d -> assertTrue(
                                adoc.lines().anyMatch(line -> line.startsWith("|") && line.contains("|" + d.due() + " |*MISSED* |")),
                                d.rule() + " " + d.due())),
                        () -> assertEquals(IncidentFixtures.deadlinesOf(read).stream().filter(d -> "MISSED".equals(d.status())).count(),
                                adoc.lines().filter(line -> line.contains("*MISSED*")).count()),
                        () -> people.forEach(person -> assertFalse(Pattern.compile("\\b" + Pattern.quote(person) + "\\b").matcher(adoc).find(), person)),
                        () -> assertFalse(adoc.contains("<script")));
            }
            assertTrue(data("incident-newsletter-list-report.json").path("adoc").asText().contains("*MISSED*"));
        }

        @Test
        @DisplayName("the Due items are the deadlines that are still a duty, derived from the reads, and no placeholder is left")
        void shouldDeriveTheDueItems() {
            List<String> expected = new ArrayList<>();
            for (String slug : SLUGS) {
                var read = read(slug);
                if (RELEASED.contains(slug)) {
                    continue;
                }
                for (var d : IncidentFixtures.deadlinesOf(read)) {
                    if (("OPEN".equals(d.status()) && d.due() != null) || ("MISSED".equals(d.status()) && d.sentAt() == null)) {
                        expected.add(read.path("title").asText() + ": " + d.rule() + "|" + read.path("address").asText()
                                + "?stage=notifications|" + d.due().substring(0, 10) + "|" + d.status());
                    }
                }
            }
            expected.sort(java.util.Comparator.comparing(item -> item.split("\\|")[2]));
            for (String name : List.of("due-workshop-lifecycle.json", "due-workshop-lifecycle-n5-released.json")) {
                List<String> found = new ArrayList<>();
                for (var item : data(name).path("items")) {
                    if ("incidents".equals(item.path("lens").asText())) {
                        found.add(item.path("title").asText() + "|" + item.path("address").asText() + "|" + item.path("due").asText()
                                + "|" + item.path("deadline").path("status").asText());
                        assertAll(name, () -> assertEquals("deadline", item.path("kind").asText()),
                                () -> assertEquals(item.path("title").asText().substring(item.path("title").asText().indexOf(": ") + 2),
                                        item.path("deadline").path("rule").asText()),
                                () -> assertEquals(item.path("address").asText(), ADDRESSES.checkReturn(item.path("address").asText())));
                    }
                    assertFalse(item.toString().contains("inc-0007"), name);
                }
                assertEquals(expected, found, name);
            }
            assertEquals(3, expected.size());
            assertEquals("2026-11-22", expected.get(0).split("\\|")[2]);
        }

        @Test
        @DisplayName("the references of the risks resolve in the register; the search index holds the nine incidents in every copy")
        void shouldResolveTheReferencesAndIndex() {
            var risks = data("reports-risks-now.json").path("risks");
            Set<String> known = new HashSet<>();
            risks.forEach(risk -> known.add("isms-register:risk/" + risk.path("id").asText()));
            for (String slug : List.of("notification-outage", "lost-laptop")) {
                var refs = read(slug).path("parts").path("review").path("value").path("risks");
                assertFalse(refs.isEmpty(), slug);
                refs.forEach(ref -> assertTrue(known.contains(ref.asText()), ref.asText()));
            }
            assertEquals("isms-register:risk/R-004", read("notification-outage").path("parts").path("review").path("value").path("risks")
                    .get(0).asText());
            assertEquals("isms-register:risk/R-021", read("lost-laptop").path("parts").path("review").path("value").path("risks")
                    .get(0).asText());
            List<String> indexes;
            try (Stream<Path> files = Files.list(Path.of("src/main/resources/scenarios/data"))) {
                indexes = files.map(file -> file.getFileName().toString())
                        .filter(name -> name.startsWith("documents-index") && name.endsWith(".json")).sorted().toList();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            assertTrue(indexes.contains("documents-index.json") && indexes.contains("documents-index-incident-created.json"), indexes.toString());
            for (String name : indexes) {
                List<JsonNode> entries = new ArrayList<>();
                data(name).path("entries").forEach(entry -> {
                    if ("incident-reports".equals(entry.path("category").asText())) {
                        entries.add(entry);
                    }
                });
                boolean created = name.contains("incident-created");
                assertEquals(created ? 10 : 9, entries.size(), name);
                for (var entry : entries) {
                    String id = entry.path("id").asText();
                    String slug = SLUGS.stream().filter(s -> IDS.get(s).equals(id)).findFirst().orElse("suspicious-vpn");
                    var read = "suspicious-vpn".equals(slug) ? data("incident-suspicious-vpn.json") : read(slug);
                    assertAll(name + " " + slug,
                            () -> assertTrue(created || !"suspicious-vpn".equals(slug), "only the index of the created state holds the VPN incident"),
                            () -> assertEquals(read.path("id").asText(), id),
                            () -> assertEquals(read.path("repository"), entry.path("repository")),
                            () -> assertEquals("incident", entry.path("kind").asText()),
                            () -> assertEquals(read.path("title"), entry.path("title")),
                            () -> assertEquals(read.path("state").asText(), entry.path("state").asText()),
                            () -> assertEquals(read.path("address"), entry.path("address")));
                }
            }
            var resolved = data("references-resolve.json").path("references");
            var card = IDS.get("card-data");
            boolean found = false;
            for (var ref : resolved) {
                if (("isms-incidents-2026:incident/" + card).equals(ref.path("ref").asText())) {
                    found = true;
                    assertEquals("Card data exposed in the checkout log", ref.path("title").asText());
                    assertEquals("/incidents/2026/" + card, ref.path("address").asText());
                    assertTrue(ref.path("found").asBoolean());
                }
            }
            assertTrue(found);
        }

        @Test
        @DisplayName("no scenario or data file mentions the placeholder incident any more")
        void shouldLeaveNoPlaceholder() throws IOException {
            try (Stream<Path> files = Files.walk(Path.of("src/main/resources/scenarios"))) {
                for (Path file : files.filter(Files::isRegularFile).toList()) {
                    assertFalse(Files.readString(file).contains("inc-0007"), file.toString());
                }
            }
        }
    }

    // ---------------------------------------------------------------------------------------------- workshop, the base
    @Nested
    @DisplayName("workshop: the base state")
    class Workshop {

        @Test
        @DisplayName("grants read, edit and approve on the year of today and read on the year before")
        void shouldGrantTheRights() {
            try (var client = start("workshop")) {
                List<String> first = new ArrayList<>();
                List<String> second = new ArrayList<>();
                get(client, "/api/v1/session").path("rights").forEach(right -> {
                    if ("isms-incidents-2026".equals(right.path("repository").asText())) {
                        right.path("actions").forEach(action -> first.add(action.asText()));
                    }
                    if ("isms-incidents-2025".equals(right.path("repository").asText())) {
                        right.path("actions").forEach(action -> second.add(action.asText()));
                    }
                });
                assertAll(() -> assertEquals(List.of("read", "edit", "approve"), first), () -> assertEquals(List.of("read"), second));
            }
        }

        @Test
        @DisplayName("serves the years, both lists, the generic lists, the schema and the nine incidents at both addresses")
        void shouldServeTheReads() {
            try (var client = start("workshop")) {
                assertAll(
                        () -> assertEquals(data("incidents-years.json"), get(client, "/api/v1/incidents")),
                        () -> assertEquals(data("incidents-year-2026.json"), get(client, "/api/v1/incidents/2026")),
                        () -> assertEquals(data("incidents-year-2025.json"), get(client, "/api/v1/incidents/2025")),
                        () -> assertEquals(data("incidents-documents-2026.json"), get(client, "/api/v1/documents/isms-incidents-2026")),
                        () -> assertEquals(data("incidents-documents-2025.json"), get(client, "/api/v1/documents/isms-incidents-2025")),
                        () -> assertEquals(data("categories-incident-reports-schema.json"),
                                get(client, "/api/v1/categories/incident-reports/schema")));
                for (String slug : SLUGS) {
                    assertAll(slug,
                            () -> assertEquals(read(slug), get(client, dom(slug))),
                            () -> assertEquals(read(slug), get(client, doc(slug))),
                            () -> assertEquals(data("incident-" + slug + "-revisions.json"), get(client, doc(slug) + "/revisions")),
                            () -> assertEquals(data("incident-" + slug + "-report.json"), get(client, dom(slug) + "/report")));
                }
            }
        }

        @Test
        @DisplayName("an unknown year, incident, revision and stage is 404, a malformed revision 422")
        void shouldRefuseWhatDoesNotExist() {
            try (var client = start("workshop")) {
                String outage = dom("notification-outage");
                var malformed = json(client.get(outage + "?at=zzz"));
                assertAll(
                        () -> assertEquals(404, client.get("/api/v1/incidents/2024").statusCode()),
                        () -> assertEquals("NOT_FOUND", json(client.get("/api/v1/incidents/2024")).path("outcome").asText()),
                        () -> assertEquals(404, client.get("/api/v1/incidents/2026/nope").statusCode()),
                        () -> assertEquals(404, client.get("/api/v1/documents/isms-incidents-2026/nope").statusCode()),
                        () -> assertEquals("NOT_FOUND", json(client.get("/api/v1/documents/isms-incidents-2026/nope")).path("outcome")
                                .asText()),
                        () -> assertEquals(404, client.get(outage + "?at=v9").statusCode()),
                        () -> assertEquals(404, client.get(doc("notification-outage") + "?at=v9").statusCode()),
                        () -> assertEquals(422, client.get(outage + "?at=zzz").statusCode()),
                        () -> assertEquals("/at", malformed.path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("FORMAT", malformed.path("errors").get(0).path("code").asText()),
                        () -> assertEquals(data("incident-notification-outage-at-v1.json"), get(client, outage + "?at=v1")),
                        () -> assertEquals(data("incident-notification-outage-at-v1.json"),
                                get(client, doc("notification-outage") + "?at=v1")));
            }
        }

        @Test
        @DisplayName("the diff of the credential stuffing is served for from=released; no other release has one")
        void shouldServeTheDiff() {
            try (var client = start("workshop")) {
                String diff = doc("credential-stuffing") + "/diff";
                assertAll(
                        () -> assertEquals(data("incident-credential-stuffing-diff.json"), get(client, diff + "?from=released")),
                        () -> assertEquals(data("incident-credential-stuffing-diff.json"), get(client, diff)),
                        () -> assertEquals(404, client.get(doc("card-data") + "/diff?from=released").statusCode()),
                        () -> assertEquals("NOT_FOUND", json(client.get(doc("card-data") + "/diff?from=released")).path("outcome")
                                .asText()));
            }
        }

        @Test
        @DisplayName("refuses completing a stage with the missing fields and the open predecessors; other refusals by outcome")
        void shouldRefuseTheStages() {
            try (var client = start("workshop")) {
                var triage = refusal(client, "POST", stage("suspicious-logins", "triage", "complete"), 422, "STAGE_NOT_COMPLETABLE");
                var response = refusal(client, "POST", stage("suspicious-logins", "response", "complete"), 422, "STAGE_NOT_COMPLETABLE");
                var review = refusal(client, "POST", stage("suspicious-logins", "review", "complete"), 422, "STAGE_NOT_COMPLETABLE");
                var privacy = refusal(client, "POST", stage("card-data", "privacy-assessment", "complete"), 422, "STAGE_NOT_COMPLETABLE");
                var cardReview = refusal(client, "POST", stage("card-data", "review", "complete"), 422, "STAGE_NOT_COMPLETABLE");
                var phishing = refusal(client, "POST", stage("phishing-link", "response", "complete"), 422, "STAGE_NOT_COMPLETABLE");
                var wrong = refusal(client, "POST", stage("wrong-recipient", "review", "complete"), 422, "STAGE_NOT_COMPLETABLE");
                var inapplicable = refusal(client, "POST", stage("suspicious-logins", "privacy-assessment", "complete"), 409,
                        "STAGE_NOT_APPLICABLE");
                var completed = refusal(client, "POST", stage("phishing-link", "triage", "complete"), 409, "STAGE_STATE");
                var open = refusal(client, "POST", stage("card-data", "privacy-assessment", "reopen"), 409, "STAGE_STATE");
                assertAll(
                        () -> assertEquals(List.of("/triage/severity", "/triage/personal-data-affected", "/triage/nis2-significant"),
                                texts(triage.path("missing"))),
                        () -> assertEquals(0, triage.path("open").size()),
                        () -> assertEquals(List.of("/response/actions", "/response/resolved-at"), texts(response.path("missing"))),
                        () -> assertEquals(List.of("triage"), texts(response.path("open"))),
                        () -> assertEquals(5, review.path("missing").size()),
                        () -> assertEquals(List.of("response"), texts(review.path("open"))),
                        () -> assertEquals(4, privacy.path("missing").size()),
                        () -> assertEquals(0, privacy.path("open").size()),
                        () -> assertEquals(5, cardReview.path("missing").size()),
                        () -> assertEquals(List.of("response"), texts(cardReview.path("open"))),
                        () -> assertEquals(List.of("/response/resolved-at"), texts(phishing.path("missing"))),
                        () -> assertEquals(5, wrong.path("missing").size()),
                        () -> assertEquals(0, wrong.path("open").size()),
                        () -> assertEquals("privacy-assessment", inapplicable.path("stage").asText()),
                        () -> assertEquals("completed", completed.path("status").asText()),
                        () -> assertEquals("open", open.path("status").asText()),
                        () -> assertEquals(404, client.change("POST", doc("credential-stuffing") + "/stages/nope/complete", "{}")
                                .statusCode()));
                // the missing fields are those of the read
                var card = read("card-data");
                assertEquals(texts(card.path("stages").get(1).path("missing")), texts(privacy.path("missing")));
                assertEquals(texts(card.path("stages").get(4).path("missing")), texts(cardReview.path("missing")));
            }
        }

        @Test
        @DisplayName("every stage of the released incident refuses with DOCUMENT_RELEASED and its tag, so do the save and the draft")
        void shouldRefuseTheReleased() {
            try (var client = start("workshop")) {
                String tag = "incidents/" + IDS.get("notification-outage") + "/v1";
                for (String stage : STAGES) {
                    for (String act : List.of("complete", "reopen")) {
                        assertEquals(tag, refusal(client, "POST", stage("notification-outage", stage, act), 409, "DOCUMENT_RELEASED")
                                .path("tag").asText(), stage + " " + act);
                    }
                }
                assertEquals(tag, refusal(client, "POST", doc("notification-outage") + "/save", 409, "DOCUMENT_RELEASED").path("tag").asText());
                assertEquals(tag, refusal(client, "PUT", "/api/v1/drafts/isms-incidents-2026/" + IDS.get("notification-outage"), 409,
                        "DOCUMENT_RELEASED").path("tag").asText());
            }
        }

        @Test
        @DisplayName("the submit lists every applicable stage that is not completed: STAGES_OPEN with the missing fields")
        void shouldRefuseTheSubmit() {
            try (var client = start("workshop")) {
                var stuffing = refusal(client, "POST", doc("credential-stuffing") + "/transitions/incident.submit", 422, "STAGES_OPEN");
                var card = refusal(client, "POST", doc("card-data") + "/transitions/incident.submit", 422, "STAGES_OPEN");
                assertAll(
                        () -> assertEquals(List.of("review"), texts(stuffing.path("stages").findValues("stage"))),
                        () -> assertEquals(0, stuffing.path("stages").get(0).path("missing").size()),
                        () -> assertEquals(List.of("privacy-assessment", "response", "notifications", "review"),
                                texts(card.path("stages").findValues("stage"))),
                        () -> assertEquals(4, card.path("stages").get(0).path("missing").size()),
                        () -> assertEquals(0, card.path("stages").get(1).path("missing").size()),
                        () -> assertEquals(0, card.path("stages").get(2).path("missing").size()),
                        () -> assertEquals(5, card.path("stages").get(3).path("missing").size()));
            }
        }

        @Test
        @DisplayName("a save and a draft of an open incident answer 200 without a state change; the year before is read-only for Alex")
        void shouldAnswerTheSavesAndDrafts() {
            try (var client = start("workshop")) {
                for (String slug : List.of("card-data", "credential-stuffing", "archive-access", "wrong-recipient", "suspicious-logins")) {
                    assertAll(slug,
                            () -> assertEquals("SAVED", refusalFree(client, "POST", doc(slug) + "/save")),
                            () -> assertEquals("DRAFT_SAVED", refusalFree(client, "PUT", "/api/v1/drafts/isms-incidents-2026/" + IDS.get(slug))));
                }
                assertEquals("DRAFT_SAVED", refusalFree(client, "PUT", "/api/v1/drafts/isms-incidents-2026/" + IDS.get("phishing-link")));
                for (String slug : List.of("lost-laptop", "newsletter-list")) {
                    assertEquals(403, client.change("POST", doc(slug) + "/save", "{}").statusCode(), slug);
                    assertEquals(403, client.change("PUT", "/api/v1/drafts/isms-incidents-2025/" + IDS.get(slug), "{}").statusCode(), slug);
                }
                assertEquals("ready", json(client.get("/mock/state")).path("state").asText());
            }
        }

        private String refusalFree(MockClient client, String method, String path) {
            var response = client.change(method, path, "{}");
            assertEquals(200, response.statusCode(), path);
            return json(response).path("outcome").asText();
        }

        @Test
        @DisplayName("the search finds the card data by its title; the reference to an incident resolves with its address")
        void shouldSearchAndResolve() {
            try (var client = start("workshop")) {
                var hits = get(client, "/api/v1/search?q=card").path("results");
                var resolved = get(client, "/api/v1/references/resolve?ref=isms-incidents-2026:incident/" + IDS.get("card-data"));
                JsonNode reference = null;
                for (var candidate : resolved.path("references")) {
                    if (("isms-incidents-2026:incident/" + IDS.get("card-data")).equals(candidate.path("ref").asText())) {
                        reference = candidate;
                    }
                }
                var found = reference;
                assertAll(
                        () -> assertEquals(1, hits.size()),
                        () -> assertEquals(IDS.get("card-data"), hits.get(0).path("id").asText()),
                        () -> assertEquals("incident-reports", hits.get(0).path("category").asText()),
                        () -> assertEquals("/incidents/2026/" + IDS.get("card-data"), hits.get(0).path("address").asText()),
                        () -> assertNotNull(found),
                        () -> assertEquals("Card data exposed in the checkout log", found.path("title").asText()),
                        () -> assertEquals("/incidents/2026/" + IDS.get("card-data"), found.path("address").asText()));
            }
        }

        @Test
        @DisplayName("the Due list holds the three deadlines of the incidents, the first of them missed")
        void shouldListTheDeadlines() {
            try (var client = start("workshop")) {
                List<String> rules = new ArrayList<>();
                List<String> statuses = new ArrayList<>();
                get(client, "/api/v1/due").path("items").forEach(item -> {
                    if ("incidents".equals(item.path("lens").asText())) {
                        rules.add(item.path("deadline").path("rule").asText());
                        statuses.add(item.path("deadline").path("status").asText());
                    }
                });
                assertEquals(List.of("gdpr-art33", "gdpr-art33", "nis2-final-report"), rules);
                assertEquals(List.of("MISSED", "OPEN", "OPEN"), statuses);
            }
        }
    }
}
