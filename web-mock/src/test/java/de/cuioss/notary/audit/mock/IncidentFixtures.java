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
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The incident fixtures of the web mock as the tests read them: the data files, the nine incidents and the derivation of
 * <em>Where the Figures Come From</em> (doc/specification/rest-api.adoc, <em>Incident Report Requests</em>), implemented a
 * second time and small, so that a file that drifts from its parts fails a test and not only the generator.
 */
final class IncidentFixtures {

    static final ClassLoader CLASS_LOADER = IncidentFixtures.class.getClassLoader();
    static final String FIRST_YEAR = "isms-incidents-2026";
    static final String SECOND_YEAR = "isms-incidents-2025";

    /** The nine incidents of the brief, in its order. */
    static final List<String> SLUGS = List.of("card-data", "credential-stuffing", "phishing-link", "notification-outage",
            "archive-access", "wrong-recipient", "suspicious-logins", "lost-laptop", "newsletter-list");
    static final Map<String, String> IDS = Map.of("card-data", "01JZ9T4M6Q8S0V2X4B6D8F0H2K",
            "credential-stuffing", "01JZ9V7P9S1T3W5Y7A9C1E3G5J", "phishing-link", "01JZA2B4D6F8H0K2N4Q6S8V0X2",
            "notification-outage", "01JZ8M3N5P7R9T1V3X5Z7B9D1F", "archive-access", "01JZ8K1M3P5R7T9V1X3Z5B7D9F",
            "wrong-recipient", "01JZ6Q8S0V2X4B6D8F0H2K4M6P", "suspicious-logins", "01JZA6D8F0H2K4M6P8R0T2W4Y6",
            "lost-laptop", "01JZ2A4C6E8G0J2M4P6R8T0W2Y", "newsletter-list", "01JZ3B5D7F9H1K3N5Q7S9V1X3Z");
    static final Set<String> RELEASED = Set.of("notification-outage", "lost-laptop", "newsletter-list");
    static final List<String> STAGES = List.of("triage", "privacy-assessment", "response", "notifications", "review");
    static final List<String> PARTS = List.of("data", "triage", "privacy-assessment", "response", "notifications", "review");
    private static final Map<String, List<String>> AFTER = Map.of("triage", List.of(), "privacy-assessment", List.of("triage"),
            "response", List.of("triage"), "notifications", List.of("triage"), "review", List.of("response"));
    private static final Instant NEVER = null;

    private IncidentFixtures() {
    }

    static JsonNode data(String name) {
        try {
            return MockClient.MAPPER.readTree(ScenarioRegistry.readDataFile(CLASS_LOADER, name).orElseThrow());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static int yearOf(String slug) {
        return RELEASED.contains(slug) && !"notification-outage".equals(slug) ? 2025 : 2026;
    }

    static String repositoryOf(String slug) {
        return "isms-incidents-" + yearOf(slug);
    }

    static JsonNode read(String slug) {
        return data("incident-" + slug + ".json");
    }

    static String text(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull() ? null : node.asText();
    }

    static List<String> texts(JsonNode array) {
        List<String> result = new ArrayList<>();
        array.forEach(item -> result.add(item.asText()));
        return result;
    }

    static List<String> texts(List<JsonNode> nodes) {
        return nodes.stream().map(JsonNode::asText).toList();
    }

    // ------------------------------------------------------------------------------------------------ the stages
    /** What the derivation says about one stage. */
    record Derived(String id, String status, boolean unanswered, List<String> missing, List<String> blockedBy,
                   boolean predecessorReopened) {
    }

    private static boolean truthy(JsonNode value) {
        return value.isBoolean() ? value.asBoolean() : !value.isMissingNode() && !value.isNull();
    }

    private static boolean applies(String stage, JsonNode triage) {
        return switch (stage) {
            case "privacy-assessment" -> truthy(triage.path("personal-data-affected"));
            case "notifications" -> truthy(triage.path("personal-data-affected")) || truthy(triage.path("nis2-significant"));
            default -> true;
        };
    }

    private static boolean unanswered(String stage, JsonNode triage) {
        return switch (stage) {
            case "privacy-assessment" -> !triage.has("personal-data-affected");
            case "notifications" -> !triage.has("personal-data-affected") && !triage.has("nis2-significant");
            default -> false;
        };
    }

    private static Set<String> ancestors(String stage) {
        Set<String> found = new HashSet<>();
        List<String> todo = new ArrayList<>(AFTER.get(stage));
        while (!todo.isEmpty()) {
            String next = todo.remove(0);
            if (found.add(next)) {
                todo.addAll(AFTER.get(next));
            }
        }
        return found;
    }

    /** The stages of a read, derived from its parts and from the {@code required} of the schema. */
    static List<Derived> derive(JsonNode parts, JsonNode schema) {
        var properties = schema.path("kinds").get(0).path("schema").path("properties");
        var triage = parts.path("triage").path("value");
        java.util.LinkedHashMap<String, String> status = new java.util.LinkedHashMap<>();
        for (String stage : STAGES) {
            var value = parts.path(stage).path("value");
            status.put(stage, !applies(stage, triage) ? "not-applicable" : value.has("completion") ? "completed" : "open");
        }
        List<Derived> out = new ArrayList<>();
        for (String stage : STAGES) {
            var value = parts.path(stage).path("value");
            boolean open = "open".equals(status.get(stage));
            List<String> missing = new ArrayList<>();
            if (open) {
                properties.path(stage).path("required").forEach(field -> {
                    if (!value.has(field.asText())) {
                        missing.add("/" + stage + "/" + field.asText());
                    }
                });
            }
            List<String> blocked = open ? AFTER.get(stage).stream().filter(a -> "open".equals(status.get(a))).toList() : List.of();
            boolean reopened = "completed".equals(status.get(stage))
                    && ancestors(stage).stream().anyMatch(a -> "open".equals(status.get(a)));
            out.add(new Derived(stage, status.get(stage), "not-applicable".equals(status.get(stage)) && unanswered(stage, triage),
                    missing, blocked, reopened));
        }
        return out;
    }

    // -------------------------------------------------------------------------------------------------- the deadlines
    /** One deadline as the read states it. */
    record Deadline(String rule, Integer element, String startedAt, String due, String status, String sentAt, String metBy) {
    }

    private static Instant instant(JsonNode value) {
        return value.isMissingNode() || value.isNull() ? NEVER : Instant.parse(value.asText());
    }

    private static String format(Instant value) {
        return value == null ? null : DateTimeFormatter.ISO_INSTANT.format(value);
    }

    private static Instant plusMonth(Instant value) {
        return ZonedDateTime.ofInstant(value, ZoneOffset.UTC).plusMonths(1).toInstant();
    }

    private static Deadline deadline(String rule, Integer element, Instant started, Instant due, Instant sent, Instant asOf,
                                     String metBy) {
        String status = due == null ? "OPEN" : sent != null && !sent.isAfter(due) ? "MET" : asOf.isAfter(due) ? "MISSED" : "OPEN";
        return new Deadline(rule, element, format(started), format(due), status, format(sent), metBy);
    }

    /** The six rules of the contract over the parts of a read at {@code asOf}. */
    static List<Deadline> deadlines(JsonNode parts, Instant asOf) {
        var triage = parts.path("triage").path("value");
        var notifications = parts.path("notifications").path("value");
        Instant resolved = instant(parts.path("response").path("value").path("resolved-at"));
        Instant aware = instant(triage.path("aware-at"));
        List<Deadline> out = new ArrayList<>();
        if (triage.path("personal-data-affected").asBoolean(false)) {
            out.add(deadline("gdpr-art33", null, aware, aware == null ? null : aware.plusSeconds(72 * 3600L),
                    instant(notifications.path("supervisory-authority").path("sent-at")), asOf,
                    "/notifications/supervisory-authority"));
        }
        if (triage.path("nis2-significant").asBoolean(false)) {
            out.add(deadline("nis2-early-warning", null, aware, aware == null ? null : aware.plusSeconds(24 * 3600L),
                    instant(notifications.path("nis2-early-warning").path("sent-at")), asOf, "/notifications/nis2-early-warning"));
            out.add(deadline("nis2-notification", null, aware, aware == null ? null : aware.plusSeconds(72 * 3600L),
                    instant(notifications.path("nis2-notification").path("sent-at")), asOf, "/notifications/nis2-notification"));
        }
        var intermediate = notifications.path("nis2-intermediate-reports");
        for (int i = 0; i < intermediate.size(); i++) {
            out.add(deadline("nis2-intermediate-report", i, null, instant(intermediate.get(i).path("due")),
                    instant(intermediate.get(i).path("sent-at")), asOf, "/notifications/nis2-intermediate-reports/" + i));
        }
        Instant notified = instant(notifications.path("nis2-notification").path("sent-at"));
        if (notified != null) {
            Instant due = plusMonth(notified);
            Instant finalSent = instant(notifications.path("nis2-final-report").path("sent-at"));
            Instant progress = instant(notifications.path("nis2-progress-report").path("sent-at"));
            Instant sent = finalSent;
            if (progress != null && (resolved == null || resolved.isAfter(due)) && (sent == null || progress.isBefore(sent))) {
                sent = progress;
            }
            out.add(deadline("nis2-final-report", null, notified, due, sent, asOf, "/notifications/nis2-final-report"));
            if (asOf.isAfter(due) && (resolved == null || resolved.isAfter(due))) {
                out.add(deadline("nis2-final-report-after-handling", null, resolved, resolved == null ? null : plusMonth(resolved),
                        finalSent, asOf, "/notifications/nis2-final-report"));
            }
        }
        return out;
    }

    static List<Deadline> deadlinesOf(JsonNode read) {
        List<Deadline> out = new ArrayList<>();
        read.path("deadlines").forEach(node -> out.add(new Deadline(node.path("rule").asText(),
                node.path("element").isNull() ? null : node.path("element").asInt(), text(node.path("startedAt")),
                text(node.path("due")), node.path("status").asText(), text(node.path("sentAt")), node.path("metBy").asText())));
        return out;
    }

    /** The protection of a read: per dimension the highest effective need of the affected services and the first that decides. */
    static Map<String, Map<String, String>> protection(JsonNode triage, JsonNode services) {
        var rank = List.of("normal", "high", "very-high");
        Map<String, String> needs = new java.util.LinkedHashMap<>();
        Map<String, String> decided = new java.util.LinkedHashMap<>();
        for (String dimension : List.of("confidentiality", "integrity", "availability")) {
            String best = null;
            String by = null;
            for (var reference : triage.path("affected-services")) {
                String id = reference.asText().substring("service:".length());
                for (var entry : services.path("entries")) {
                    if (id.equals(entry.path("id").asText())) {
                        String need = entry.path("effective").path("protectionNeeds").path(dimension).asText();
                        if (best == null || rank.indexOf(need) > rank.indexOf(best)) {
                            best = need;
                            by = reference.asText();
                        }
                    }
                }
            }
            if (best != null) {
                needs.put(dimension, best);
                decided.put(dimension, by);
            }
        }
        return needs.isEmpty() ? null : Map.of("needs", needs, "decidedBy", decided);
    }

    /** The newest write of a read: the newest {@code savedAt} of its parts and the release. */
    static String updatedOf(JsonNode read) {
        String newest = "";
        for (var part : read.path("parts")) {
            String at = text(part.path("savedAt"));
            if (at != null && at.compareTo(newest) > 0) {
                newest = at;
            }
        }
        return read.path("release").isNull() || read.path("release").path("at").asText().compareTo(newest) <= 0 ? newest
                : read.path("release").path("at").asText();
    }

    /** The row of a list equals the read it summarises: classification, stages, deadline counts, next, time and release. */
    static void assertRow(JsonNode row, JsonNode read) {
        var triage = read.path("parts").path("triage").path("value");
        var deadlines = deadlinesOf(read);
        var next = deadlines.stream().filter(d -> "OPEN".equals(d.status()) && d.due() != null).min(Comparator.comparing(Deadline::due));
        org.junit.jupiter.api.Assertions.assertAll(read.path("id").asText(),
                () -> assertEquals(read.path("title"), row.path("title")),
                () -> assertEquals(read.path("address"), row.path("address")),
                () -> assertEquals(read.path("state"), row.path("state")),
                () -> assertEquals(read.path("version"), row.path("version")),
                () -> assertEquals(read.path("frozen"), row.path("frozen")),
                () -> assertEquals(text(triage.path("severity")), text(row.path("severity"))),
                () -> assertEquals(texts(triage.path("categories")), texts(row.path("categories"))),
                () -> assertEquals(text(triage.path("personal-data-affected")), text(row.path("personalDataAffected"))),
                () -> assertEquals(text(triage.path("nis2-significant")), text(row.path("nis2Significant"))),
                () -> assertEquals(text(triage.path("aware-at")), text(row.path("awareAt"))),
                () -> assertEquals(text(read.path("parts").path("response").path("value").path("resolved-at")), text(row.path("resolvedAt"))),
                () -> assertEquals(STAGES, texts(row.path("stages").findValues("id"))),
                () -> assertEquals(texts(read.path("stages").findValues("status")), texts(row.path("stages").findValues("status"))),
                () -> assertEquals(deadlines.stream().filter(d -> "OPEN".equals(d.status())).count(), row.path("deadlines").path("open").asLong()),
                () -> assertEquals(deadlines.stream().filter(d -> "MET".equals(d.status())).count(), row.path("deadlines").path("met").asLong()),
                () -> assertEquals(deadlines.stream().filter(d -> "MISSED".equals(d.status())).count(),
                        row.path("deadlines").path("missed").asLong()),
                () -> assertEquals(next.map(Deadline::rule).orElse(null), text(row.path("deadlines").path("next").path("rule"))),
                () -> assertEquals(next.map(Deadline::due).orElse(null), text(row.path("deadlines").path("next").path("due"))),
                () -> assertEquals(false, row.path("requested").asBoolean()),
                () -> assertEquals(updatedOf(read), row.path("updatedAt").asText()),
                () -> assertEquals(read.path("history").get(0).path("by"), row.path("updatedBy")),
                () -> assertEquals(read.path("release").isNull() ? null : read.path("release").path("tag").asText(),
                        text(row.path("release").path("tag"))));
    }
}
