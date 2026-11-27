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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.xml.sax.InputSource;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.Period;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The lens <em>Threat models</em> of the profiles workshop, read-only, release, empty, degraded and local
 * (doc/specification/rest-api.adoc, <em>Threat Model Requests</em>): the schema, the recipes, the six models with their
 * revisions, the pages of the nine services, the lifecycle and wizard states of workshop and what each profile refuses.
 * The fixtures are static: the section {@code Mirrors} reads the data files and checks that they still agree with one
 * another and with the evaluation and the summary of the Reports lens.
 */
@DisplayName("The Threat models lens")
class ThreatModelsTest {

    private static final String TM = "/api/v1/threat-models/";
    private static final String DOCS = "/api/v1/documents/threat-models/";
    private static final String CATEGORY = "/api/v1/categories/threat-models/";
    private static final String CHECKOUT = "payment-api-checkout-flow";
    private static final String CHECKOUT_ADDRESS = TM + "payment-api/checkout-flow";
    private static final String NOTIFICATIONS = "notification-service-notification-flows";
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 26);
    private static final Pattern HEX7 = Pattern.compile("[0-9a-f]{7}");
    private static final ClassLoader CLASS_LOADER = ThreatModelsTest.class.getClassLoader();
    private static final CanonicalAddresses ADDRESSES = CanonicalAddresses.load(MockClient.MAPPER, CLASS_LOADER);

    /** The six documents, their service and the model (the address segment), in the order of the brief. */
    private static final List<List<String>> MODELS = List.of(
            List.of(CHECKOUT, "payment-api", "checkout-flow"),
            List.of("identity-provider-login-flow", "identity-provider", "login-flow"),
            List.of("customer-portal-portal", "customer-portal", "portal"),
            List.of("customer-db-storage", "customer-db", "storage"),
            List.of("reporting-report-generation", "reporting", "report-generation"),
            List.of(NOTIFICATIONS, "notification-service", "notification-flows"));
    /** total, open, untreated, mitigated, accepted, transferred. */
    private static final Map<String, List<Integer>> FIGURES = Map.of(
            CHECKOUT, List.of(9, 3, 2, 4, 2, 1), "identity-provider-login-flow", List.of(7, 4, 3, 3, 0, 0),
            "customer-portal-portal", List.of(6, 2, 2, 3, 1, 0), "customer-db-storage", List.of(5, 1, 0, 3, 1, 0),
            "reporting-report-generation", List.of(4, 0, 0, 3, 1, 0), NOTIFICATIONS, List.of(3, 3, 3, 0, 0, 0));
    private static final List<String> SERVICES = List.of("payment-api", "customer-portal", "identity-provider",
            "customer-db", "reporting", "notification-service", "report-scheduler", "notification-gateway", "ledger");

    private static MockClient start(String profile) {
        return MockClient.start(profile).login();
    }

    private static JsonNode get(MockClient client, String path) {
        var response = client.get(path);
        assertEquals(200, response.statusCode(), path);
        return json(response);
    }

    private static void goTo(MockClient client, String state) {
        assertEquals(200, client.send("POST", "/mock/goto/" + state, null, Map.of()).statusCode(), state);
    }

    private static int status(MockClient client, String method, String path) {
        return client.change(method, path, "{}").statusCode();
    }

    private static JsonNode data(String name) {
        try {
            return MockClient.MAPPER.readTree(ScenarioRegistry.readDataFile(CLASS_LOADER, name).orElseThrow());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static JsonNode modelFile(String doc) {
        return data("threat-model-" + doc + ".json");
    }

    private static List<String> column(JsonNode array, String name) {
        List<String> result = new ArrayList<>();
        array.forEach(item -> result.add(item.path(name).asText()));
        return result;
    }

    private static List<String> fieldNames(JsonNode object) {
        List<String> names = new ArrayList<>();
        object.fieldNames().forEachRemaining(names::add);
        return names;
    }

    private static String sha7(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(text.getBytes(StandardCharsets.UTF_8)))
                    .substring(0, 7);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The counts of a model file: total, open, untreated, mitigated, accepted, transferred, derived from the threats. */
    private static List<Integer> figures(JsonNode threats, JsonNode mitigations) {
        Set<String> named = new HashSet<>();
        mitigations.forEach(mitigation -> named.add(mitigation.path("attributes").path("threat").asText()));
        int open = 0;
        int untreated = 0;
        int mitigated = 0;
        int accepted = 0;
        int transferred = 0;
        for (var threat : threats) {
            var attributes = threat.path("attributes");
            boolean carries = attributes.has("transferred");
            transferred += carries ? 1 : 0;
            switch (attributes.path("status").asText()) {
                case "open" -> {
                    open++;
                    untreated += !named.contains(threat.path("id").asText()) && !carries ? 1 : 0;
                }
                case "mitigated" -> mitigated++;
                case "accepted" -> accepted++;
                default -> throw new IllegalStateException(threat.path("id").asText());
            }
        }
        return List.of(threats.size(), open, untreated, mitigated, accepted, transferred);
    }

    private static List<Integer> figures(JsonNode read) {
        var model = read.path("parts").path("model").path("value");
        return figures(model.path("threats"), model.path("mitigations"));
    }

    private static List<Integer> countsOf(JsonNode threats) {
        return List.of(threats.path("total").asInt(), threats.path("open").asInt(), threats.path("untreated").asInt(),
                threats.path("transferred").asInt());
    }

    private static JsonNode find(JsonNode array, String field, String value) {
        for (var item : array) {
            if (value.equals(item.path(field).asText())) {
                return item;
            }
        }
        throw new IllegalStateException(field + "=" + value);
    }

    private static List<String> requiredOf(JsonNode schema) {
        List<String> required = new ArrayList<>();
        schema.path("required").forEach(item -> required.add(item.asText()));
        return required;
    }

    /** The row of the evaluation of a model, by the service and the model segment: the address of a model is both. */
    private static JsonNode row(JsonNode evaluation, String service, String model) {
        for (var row : evaluation.path("models")) {
            if (service.equals(row.path("service").path("id").asText()) && model.equals(row.path("model").asText())) {
                return row;
            }
        }
        throw new IllegalStateException(service + "/" + model);
    }

    /** Decodes the data URL of a diagram into a well-formed XML document (no DOCTYPE, no external entity). */
    private static Document svgOf(JsonNode diagram) {
        String url = diagram.path("dataUrl").asText();
        assertTrue(url.startsWith("data:image/svg+xml;base64,"), url);
        String svg = new String(Base64.getDecoder().decode(url.substring(url.indexOf(',') + 1)), StandardCharsets.UTF_8);
        assertTrue(svg.getBytes(StandardCharsets.UTF_8).length <= 8192, "at most 8 KB");
        try {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            return factory.newDocumentBuilder().parse(new InputSource(new StringReader(svg)));
        } catch (Exception e) {
            throw new IllegalStateException("the diagram is no well-formed XML", e);
        }
    }

    /** The attributes of the document that link to something: an {@code href}, with or without a namespace. */
    private static List<String> linkingAttributes(Element element) {
        List<String> found = new ArrayList<>();
        var attributes = element.getAttributes();
        for (int i = 0; i < attributes.getLength(); i++) {
            var attribute = attributes.item(i);
            String local = attribute.getLocalName() != null ? attribute.getLocalName() : attribute.getNodeName();
            if (local.equalsIgnoreCase("href") || attribute.getNodeName().toLowerCase(Locale.ROOT).endsWith(":href")) {
                found.add(element.getTagName() + "@" + attribute.getNodeName());
            }
        }
        var children = element.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            if (children.item(i) instanceof Element child) {
                found.addAll(linkingAttributes(child));
            }
        }
        return found;
    }

    private static void assertDiagram(JsonNode read) {
        var diagram = read.path("diagram");
        Document svg = svgOf(diagram);
        Element root = svg.getDocumentElement();
        List<String> texts = new ArrayList<>();
        var nodes = svg.getElementsByTagName("text");
        for (int i = 0; i < nodes.getLength(); i++) {
            texts.add(nodes.item(i).getTextContent());
        }
        var forbidden = List.of("script", "a", "image", "foreignObject", "use");
        assertAll(
                () -> assertEquals("image/svg+xml", diagram.path("mediaType").asText()),
                () -> assertEquals(Integer.parseInt(root.getAttribute("width")), diagram.path("width").asInt()),
                () -> assertEquals(Integer.parseInt(root.getAttribute("height")), diagram.path("height").asInt()),
                () -> read.path("parts").path("model").path("value").path("components").forEach(component -> assertEquals(
                        1, texts.stream().filter(component.path("name").asText()::equals).count(),
                        read.path("id").asText() + " " + component.path("name").asText())),
                () -> forbidden.forEach(tag -> assertEquals(0, svg.getElementsByTagName(tag).getLength(), tag)),
                () -> assertEquals(List.of(), linkingAttributes(root)));
    }

    private static void assertCanonical(String address) {
        assertEquals(address, ADDRESSES.checkReturn(address), address);
    }

    /** The node of a schema a JSON Pointer {@code fills} names, reached through {@code properties} and {@code items} only. */
    private static JsonNode schemaNode(JsonNode modelSchema, String fills) {
        JsonNode node = modelSchema;
        for (String segment : fills.substring(1).split("/")) {
            node = node.path("properties").path(segment);
            if (node.path("type").asText().equals("array")) {
                assertTrue(node.has("items"), fills);
            }
        }
        return node;
    }

    // ---------------------------------------------------------------------------------------------------------- the data
    @Nested
    @DisplayName("Mirrors: the data files agree with one another and with the Reports lens")
    class Mirrors {

        @Test
        @DisplayName("the six models carry the figures of the brief, which the evaluation rows and the summary repeat")
        void shouldCarryTheFiguresOfTheEvaluation() {
            var evaluation = data("reports-threat-evaluation.json");
            var summary = data("reports-summary-workshop.json").path("threatModels");
            int open = 0;
            int untreated = 0;
            for (var entry : MODELS) {
                var read = modelFile(entry.get(0));
                var figures = figures(read);
                var evaluated = row(evaluation, entry.get(1), entry.get(2));
                open += figures.get(1);
                untreated += figures.get(2);
                assertAll(entry.get(0),
                        () -> assertEquals(FIGURES.get(entry.get(0)), figures),
                        () -> assertEquals(figures.get(0), figures.get(1) + figures.get(3) + figures.get(4)),
                        () -> assertEquals(List.of(figures.get(0), figures.get(1), figures.get(2), figures.get(5)),
                                countsOf(evaluated.path("threats"))),
                        () -> assertEquals(read.path("threats"), evaluated.path("threats")),
                        () -> assertEquals(entry.get(1), evaluated.path("service").path("id").asText()),
                        () -> assertEquals(read.path("address").asText(), evaluated.path("address").asText()),
                        () -> assertEquals(read.path("state").asText(), evaluated.path("state").asText()));
            }
            assertAll(
                    () -> assertEquals(6, evaluation.path("models").size()),
                    () -> assertEquals(13, summary.path("openThreats").asInt()),
                    () -> assertEquals(10, summary.path("untreatedThreats").asInt()));
            assertEquals(13, open);
            assertEquals(10, untreated);
        }

        @Test
        @DisplayName("the dates of the review are recomputed from the last release and the interval of the service")
        void shouldRecomputeTheDates() {
            var evaluation = data("reports-threat-evaluation.json");
            for (var entry : MODELS) {
                var read = modelFile(entry.get(0));
                var review = read.path("review");
                var page = data("threat-model-service-" + entry.get(1) + ".json");
                var interval = Period.parse(review.path("reviewInterval").asText());
                var shown = row(evaluation, entry.get(1), entry.get(2));
                assertEquals(page.path("service").path("reviewInterval").asText(), review.path("reviewInterval").asText());
                assertEquals(review.path("reviewInterval"), shown.path("reviewInterval"));
                if (review.path("lastReview").isNull()) {
                    assertAll(entry.get(0),
                            () -> assertEquals("unreleased", review.path("status").asText()),
                            () -> assertTrue(review.path("reviewDue").isNull()),
                            () -> assertTrue(read.path("release").isNull()));
                    continue;
                }
                var last = LocalDate.parse(review.path("lastReview").asText());
                var due = last.plus(interval);
                long since = ChronoUnit.DAYS.between(last, TODAY);
                long dueIn = ChronoUnit.DAYS.between(TODAY, due);
                String expected = dueIn < 0 ? "overdue" : dueIn <= 30 ? "due-soon" : "ok";
                assertAll(entry.get(0),
                        () -> assertEquals("2026-11-26", review.path("today").asText()),
                        () -> assertEquals(since, review.path("daysSinceReview").asLong()),
                        () -> assertEquals(due.toString(), review.path("reviewDue").asText()),
                        () -> assertEquals(dueIn, review.path("dueInDays").asLong()),
                        () -> assertEquals(expected, review.path("status").asText()),
                        () -> assertEquals(List.of(review.path("lastReview"), review.path("daysSinceReview"), review.path("reviewDue"),
                                review.path("dueInDays"), review.path("status")), List.of(shown.path("lastReview"),
                                shown.path("daysSinceReview"), shown.path("reviewDue"), shown.path("dueInDays"), shown.path("status"))),
                        () -> assertEquals(last.toString(), read.path("parts").path("data").path("value").path("last-review")
                                .asText()));
            }
        }

        @Test
        @DisplayName("the ids are unique, T-nn and M-nn, every countermeasure names a threat of its file, and the issues are of the key")
        void shouldKeepTheIdsConsistent() {
            Map<String, String> keys = Map.of(CHECKOUT, "PAY", "identity-provider-login-flow", "ID",
                    "customer-portal-portal", "WEB", "customer-db-storage", "DB", "reporting-report-generation", "REP");
            for (var entry : MODELS) {
                var model = modelFile(entry.get(0)).path("parts").path("model").path("value");
                Set<String> threats = new HashSet<>(column(model.path("threats"), "id"));
                assertEquals(model.path("threats").size(), threats.size(), entry.get(0));
                assertEquals(model.path("mitigations").size(), new HashSet<>(column(model.path("mitigations"), "id")).size());
                threats.forEach(id -> assertTrue(id.matches("T-\\d{2}"), id));
                for (var mitigation : model.path("mitigations")) {
                    var threat = mitigation.path("attributes").path("threat").asText();
                    assertTrue(threats.contains(threat), entry.get(0) + " " + mitigation.path("id").asText());
                    assertEquals("M-" + threat.substring(2), mitigation.path("id").asText());
                    mitigation.path("attributes").path("issues").forEach(issue -> assertTrue(
                            issue.asText().startsWith(keys.get(entry.get(0)) + "-"), issue.asText()));
                    for (var field : List.of("riskReduction")) {
                        int value = mitigation.path(field).asInt(-1);
                        assertTrue(value >= 0 && value <= 100, field);
                    }
                }
                for (var threat : model.path("threats")) {
                    int likelihood = threat.path("risk").path("likelihood").asInt(-1);
                    int impact = threat.path("risk").path("impact").asInt(-1);
                    assertTrue(likelihood >= 0 && likelihood <= 100 && impact >= 0 && impact <= 100, threat.path("id").asText());
                    assertTrue(threat.path("categories").size() >= 1);
                }
                var zones = new HashSet<>(column(model.path("trustZones"), "id"));
                var components = new HashSet<>(column(model.path("components"), "id"));
                model.path("components").forEach(component -> assertTrue(
                        zones.contains(component.path("parent").path("trustZone").asText()), component.path("id").asText()));
                model.path("dataflows").forEach(flow -> assertTrue(components.contains(flow.path("source").asText())
                        && components.contains(flow.path("destination").asText()), flow.path("id").asText()));
            }
        }

        @Test
        @DisplayName("only T-07 of the checkout flow is transferred, and it is the origin of the risk R-009, which names it back")
        void shouldTransferOnlyT07() {
            List<String> transferred = new ArrayList<>();
            for (var entry : MODELS) {
                modelFile(entry.get(0)).path("parts").path("model").path("value").path("threats").forEach(threat -> {
                    if (threat.path("attributes").has("transferred")) {
                        transferred.add(entry.get(0) + "#" + threat.path("id").asText() + "="
                                + threat.path("attributes").path("transferred").asText());
                    }
                });
            }
            var risk = find(data("reports-risks-now.json").path("risks"), "id", "R-009");
            var reference = risk.path("reference");
            var resolved = find(data("references-resolve.json").path("references"), "ref", reference.path("ref").asText());
            assertAll(
                    () -> assertEquals(List.of(CHECKOUT + "#T-07=isms-register:risk/R-009"), transferred),
                    () -> assertEquals("threat-models:threat-model/" + CHECKOUT + "#T-07", reference.path("ref").asText()),
                    () -> assertEquals("Payment API, checkout flow: T-07", reference.path("title").asText()),
                    () -> assertTrue(resolved.path("found").asBoolean()),
                    () -> assertEquals(reference.path("title"), resolved.path("title")),
                    () -> assertEquals(reference.path("address"), resolved.path("address")),
                    () -> assertEquals("/threat-models/payment-api/checkout-flow", resolved.path("address").asText()));
        }

        @Test
        @DisplayName("project.id is the address segment, every address is canonical (also with ?at=), the blobs are the first 7 hex of sha1")
        void shouldKeepTheAddressesAndTheBlobs() {
            for (var entry : MODELS) {
                var read = modelFile(entry.get(0));
                assertAll(entry.get(0),
                        () -> assertEquals(entry.get(2), read.path("parts").path("model").path("value").path("project").path("id")
                                .asText()),
                        () -> assertEquals(entry.get(2), read.path("model").asText()),
                        () -> assertEquals(entry.get(1), read.path("service").path("id").asText()),
                        () -> assertEquals("/threat-models/" + entry.get(1) + "/" + entry.get(2), read.path("address").asText()),
                        () -> assertEquals(entry.get(0), entry.get(1) + "-" + entry.get(2)),
                        () -> assertEquals("service:" + entry.get(1), read.path("parts").path("data").path("value")
                                .path("service").asText()),
                        () -> assertEquals("role:service-owner", read.path("parts").path("data").path("value").path("owner")
                                .asText()),
                        () -> assertEquals("0.2.0", read.path("parts").path("model").path("value").path("otmVersion").asText()),
                        () -> assertEquals(List.of("otmVersion", "project", "trustZones", "components", "dataflows", "threats",
                                "mitigations"), fieldNames(read.path("parts").path("model").path("value"))));
                assertCanonical(read.path("address").asText());
                assertCanonical(read.path("address").asText() + "?at=v1");
                for (var part : List.of("data", "model")) {
                    var blob = read.path("parts").path(part).path("blob").asText();
                    assertTrue(HEX7.matcher(blob).matches(), blob);
                    assertEquals(sha7(entry.get(0) + "/" + part + "/" + read.path("version").asInt()), blob);
                }
            }
            for (var service : SERVICES) {
                assertCanonical("/threat-models/" + service);
            }
            assertCanonical("/threat-models/report-scheduler/new?recipe=quick-start");
            assertCanonical("/threat-models/report-scheduler/scheduler-overview");
            assertCanonical("/threat-models/payment-api/checkout-flow/release");
        }

        @Test
        @DisplayName("the diagrams decode to well-formed SVG, one text per component, no script, link or image, at most 8 KB")
        void shouldDrawTheDiagrams() {
            List<String> files = new ArrayList<>();
            MODELS.forEach(entry -> files.add("threat-model-" + entry.get(0) + ".json"));
            for (var suffix : List.of("reopened", "in-review", "released", "at-v1", "at-v2", "at-v3", "at-v4")) {
                files.add("threat-model-" + CHECKOUT + "-" + suffix + ".json");
            }
            files.add("threat-model-identity-provider-login-flow-at-v1.json");
            files.add("threat-model-report-scheduler-scheduler-overview.json");
            files.forEach(name -> assertDiagram(data(name)));
        }

        @Test
        @DisplayName("the revisions: the last release of the file is the release of the read, v1 and v2 are frozen without transitions")
        void shouldAgreeOnTheRevisions() {
            for (var entry : MODELS) {
                var read = modelFile(entry.get(0));
                var revisions = data("threat-model-" + entry.get(0) + "-revisions.json").path("revisions");
                var newest = revisions.get(0);
                assertAll(entry.get(0),
                        () -> assertEquals(read.path("release").isNull() ? "save" : "release", newest.path("kind").asText()),
                        () -> assertEquals(read.path("history").get(0).path("at").asText(), newest.path("at").asText()),
                        () -> assertFalse(data("threat-model-" + entry.get(0) + "-revisions.json").path("truncated").asBoolean()),
                        () -> revisions.forEach(revision -> assertTrue(revision.path("kind").asText().equals("release")
                                ? revision.path("ref").asText().matches("v\\d+")
                                : HEX7.matcher(revision.path("ref").asText()).matches(), revision.path("ref").asText())));
                if (!read.path("release").isNull()) {
                    assertAll(entry.get(0),
                            () -> assertEquals(read.path("release").path("tag"), newest.path("tag")),
                            () -> assertEquals(read.path("release").path("at"), newest.path("at")),
                            () -> assertEquals("v" + read.path("version").asInt(), newest.path("ref").asText()),
                            () -> assertEquals("models/" + entry.get(0) + "/v" + read.path("version").asInt(),
                                    read.path("release").path("tag").asText()));
                }
            }
            for (var name : List.of("threat-model-" + CHECKOUT + "-at-v1.json", "threat-model-" + CHECKOUT + "-at-v2.json",
                    "threat-model-" + CHECKOUT + "-at-v3.json", "threat-model-identity-provider-login-flow-at-v1.json")) {
                var at = data(name);
                var counted = figures(at);
                assertAll(name,
                        () -> assertTrue(at.path("frozen").asBoolean()),
                        () -> assertTrue(at.path("draft").isNull()),
                        () -> assertEquals(0, at.path("transitions").size()),
                        () -> assertEquals(at.path("release").path("tag"), at.path("at").path("tag")),
                        () -> assertEquals("released", at.path("state").asText()),
                        () -> assertEquals(List.of(counted.get(0), counted.get(1), counted.get(2), counted.get(5)),
                                countsOf(at.path("threats"))));
            }
            assertAll(
                    () -> assertEquals(List.of("T-01", "T-02", "T-03", "T-04", "T-05"), column(
                            data("threat-model-" + CHECKOUT + "-at-v1.json").path("parts").path("model").path("value")
                                    .path("threats"), "id")),
                    () -> assertEquals(8, data("threat-model-" + CHECKOUT + "-at-v2.json").path("threats").path("total").asInt()),
                    () -> assertEquals(modelFile(CHECKOUT).path("parts").path("model").path("blob"),
                            data("threat-model-" + CHECKOUT + "-at-v3.json").path("parts").path("model").path("blob")));
        }

        @Test
        @DisplayName("the pages of the services: a row is the row of the evaluation, every service of the catalog that is not retired has one")
        void shouldAgreeOnThePagesOfTheServices() {
            var evaluation = data("reports-threat-evaluation.json");
            var entries = data("catalog-service-entries.json").path("entries");
            Set<String> catalog = new HashSet<>();
            for (var entry : entries) {
                catalog.add(entry.path("id").asText());
                var page = data("threat-model-service-" + entry.path("id").asText() + ".json");
                var service = page.path("service");
                assertAll(entry.path("id").asText(),
                        () -> assertEquals(entry.path("name").asText(), service.path("name").asText()),
                        () -> assertEquals(entry.path("retired").asBoolean(), service.path("retired").asBoolean()),
                        () -> assertEquals(entry.path("value").path("lifecycle").asText(), service.path("lifecycle").asText()),
                        () -> assertEquals(entry.path("value").path("owner").path("team").asText(), "team:"
                                + service.path("owner").path("id").asText()),
                        () -> assertEquals("2026-11-26", page.path("today").asText()),
                        () -> assertEquals(0, page.path("drafts").size()),
                        () -> assertEquals(List.of("very-high", "high", "normal"), fieldNames(page.path("reviewIntervals"))));
            }
            assertEquals(new HashSet<>(SERVICES), catalog);
            assertTrue(data("threat-model-service-ledger.json").path("service").path("retired").asBoolean());
            assertEquals("deprecated", data("threat-model-service-ledger.json").path("service").path("lifecycle").asText());
            for (var entry : MODELS) {
                var page = data("threat-model-service-" + entry.get(1) + ".json");
                var shown = page.path("models").get(0);
                var evaluated = row(evaluation, entry.get(1), entry.get(2));
                assertEquals(1, page.path("models").size());
                for (var name : List.of("address", "state", "version", "lastReview", "daysSinceReview", "reviewDue", "dueInDays",
                        "status", "threats")) {
                    assertEquals(evaluated.path(name), shown.path(name), entry.get(0) + " " + name);
                }
                assertAll(entry.get(0),
                        () -> assertEquals(entry.get(0), shown.path("document").asText()),
                        () -> assertEquals(modelFile(entry.get(0)).path("title"), shown.path("title")),
                        () -> assertFalse(shown.path("requested").asBoolean()),
                        () -> assertEquals(modelFile(entry.get(0)).path("history").get(0).path("at"), shown.path("updatedAt")),
                        () -> assertEquals(evaluated.path("protectionNeed"), page.path("service").path("protectionNeed")),
                        () -> assertEquals(evaluated.path("reviewInterval"), page.path("service").path("reviewInterval")));
            }
            for (var service : List.of("report-scheduler", "notification-gateway", "ledger")) {
                assertEquals(0, data("threat-model-service-" + service + ".json").path("models").size());
            }
        }

        @Test
        @DisplayName("the list: six documents, newest change first, each counted like its read")
        void shouldAgreeOnTheList() {
            var list = data("threat-models-index.json");
            var documents = list.path("documents");
            assertEquals(List.of(NOTIFICATIONS, "customer-db-storage", CHECKOUT, "identity-provider-login-flow",
                    "customer-portal-portal", "reporting-report-generation"), column(documents, "id"));
            String previous = "9";
            for (var item : documents) {
                assertListed(item, modelFile(item.path("id").asText()));
                assertTrue(item.path("updatedAt").asText().compareTo(previous) <= 0);
                previous = item.path("updatedAt").asText();
            }
            assertEquals(7, data("threat-models-index-created.json").path("documents").size());
        }

        @Test
        @DisplayName("the list names every model of the data files and no other, and the lists of the states agree with the read of their state")
        void shouldAgreeOnTheListsOfTheStates() throws IOException {
            Set<String> reads = new HashSet<>();
            try (var stream = Files.list(Path.of("src/main/resources/scenarios/data"))) {
                for (var name : stream.map(path -> path.getFileName().toString()).toList()) {
                    var matcher = Pattern.compile("threat-model-(.+)\\.json").matcher(name);
                    if (matcher.matches() && data(name).path("id").asText().equals(matcher.group(1))
                            && data(name).path("parts").has("model")) {
                        reads.add(matcher.group(1));
                    }
                }
            }
            Set<String> listed = new HashSet<>(column(data("threat-models-index.json").path("documents"), "id"));
            listed.add("report-scheduler-scheduler-overview");
            assertEquals(listed, reads);
            for (var variant : List.of("in-review", "released", "reopened")) {
                for (var item : data("threat-models-index-" + variant + ".json").path("documents")) {
                    String id = item.path("id").asText();
                    assertListed(item, modelFile(CHECKOUT.equals(id) ? CHECKOUT + "-" + variant : id));
                }
            }
            for (var item : data("threat-models-index-created.json").path("documents")) {
                assertListed(item, modelFile(item.path("id").asText()));
            }
        }

        private static void assertListed(JsonNode item, JsonNode read) {
            assertAll(item.path("id").asText(),
                    () -> assertEquals("threat-model", item.path("kind").asText()),
                    () -> assertEquals(read.path("title"), item.path("title")),
                    () -> assertEquals(read.path("state"), item.path("state")),
                    () -> assertEquals(read.path("version"), item.path("version")),
                    () -> assertEquals(read.path("history").get(0).path("at"), item.path("updatedAt")),
                    () -> assertEquals(read.path("history").get(0).path("by"), item.path("updatedBy")),
                    () -> assertEquals(read.path("address"), item.path("address")),
                    () -> assertFalse(item.path("requested").asBoolean()),
                    () -> assertEquals(read.path("release").isNull() ? null : read.path("release").path("tag").asText(),
                            item.path("release").isNull() ? null : item.path("release").path("tag").asText()),
                    () -> assertEquals(read.path("release").isNull() ? null : read.path("release").path("at").asText(),
                            item.path("release").isNull() ? null : item.path("release").path("at").asText()));
        }

        @Test
        @DisplayName("the files of the states: the evaluation rows and the summaries follow the model of the state")
        void shouldFollowTheModelInTheStates() {
            var summaryBase = data("reports-summary-workshop.json");
            for (var stage : List.of("reopened", "in-review", "released")) {
                var read = data("threat-model-" + CHECKOUT + "-" + stage + ".json");
                var evaluation = data(stage.equals("released") ? "reports-threat-evaluation-reviewed.json"
                        : "reports-threat-evaluation-" + stage + ".json");
                var shown = row(evaluation, "payment-api", "checkout-flow");
                var summary = data(stage.equals("released") ? "reports-summary-tm-released.json" : "reports-summary-tm-saved.json")
                        .path("threatModels");
                int sumOpen = 0;
                int sumUntreated = 0;
                int sumOverdue = 0;
                int sumDueSoon = 0;
                for (var item : evaluation.path("models")) {
                    sumOpen += item.path("threats").path("open").asInt();
                    sumUntreated += item.path("threats").path("untreated").asInt();
                    sumOverdue += item.path("status").asText().equals("overdue") ? 1 : 0;
                    sumDueSoon += item.path("status").asText().equals("due-soon") ? 1 : 0;
                }
                final int open = sumOpen;
                final int untreated = sumUntreated;
                final int overdue = sumOverdue;
                final int dueSoon = sumDueSoon;
                assertAll(stage,
                        () -> assertEquals(read.path("threats"), shown.path("threats")),
                        () -> assertEquals(List.of(9, 2, 2, 1), List.of(read.path("threats").path("total").asInt(),
                                read.path("threats").path("open").asInt(), read.path("threats").path("untreated").asInt(),
                                read.path("threats").path("transferred").asInt())),
                        () -> assertEquals(List.of(9, 2, 2), figures(read).subList(0, 3)),
                        () -> assertEquals(read.path("review").path("lastReview"), shown.path("lastReview")),
                        () -> assertEquals(read.path("review").path("reviewDue"), shown.path("reviewDue")),
                        () -> assertEquals(stage.equals("released") ? "released" : stage.equals("in-review") ? "in-review" : "draft",
                                shown.path("state").asText()),
                        () -> assertEquals(stage.equals("released") ? 4 : 3, shown.path("version").asInt()),
                        () -> assertEquals(12, summary.path("openThreats").asInt()),
                        () -> assertEquals(10, summary.path("untreatedThreats").asInt()),
                        () -> assertEquals(overdue, summary.path("overdue").asInt()),
                        () -> assertEquals(dueSoon, summary.path("dueSoon").asInt()));
                assertEquals(summaryBase.path("samm"), data(stage.equals("released") ? "reports-summary-tm-released.json"
                        : "reports-summary-tm-saved.json").path("samm"));
                assertEquals(summaryBase.path("risks"), data(stage.equals("released") ? "reports-summary-tm-released.json"
                        : "reports-summary-tm-saved.json").path("risks"));
                assertEquals(open, summary.path("openThreats").asInt());
                assertEquals(untreated, summary.path("untreatedThreats").asInt());
            }
            var released = data("threat-model-" + CHECKOUT + "-released.json");
            assertAll(
                    () -> assertEquals("models/" + CHECKOUT + "/v4", released.path("release").path("tag").asText()),
                    () -> assertEquals("2026-11-26", released.path("review").path("lastReview").asText()),
                    () -> assertEquals("2027-05-26", released.path("review").path("reviewDue").asText()),
                    () -> assertEquals(181, released.path("review").path("dueInDays").asInt()),
                    () -> assertEquals("ok", released.path("review").path("status").asText()),
                    () -> assertEquals(List.of("portal", "login-flow", "report-generation", "storage", "checkout-flow",
                            "notification-flows"), column(data("reports-threat-evaluation-reviewed.json").path("models"), "model")));
            var created = data("reports-threat-evaluation-created.json");
            var summary = data("reports-summary-tm-created.json").path("threatModels");
            assertAll(
                    () -> assertEquals(7, created.path("models").size()),
                    () -> assertEquals("scheduler-overview", created.path("models").get(6).path("model").asText()),
                    () -> assertEquals("unreleased", created.path("models").get(6).path("status").asText()),
                    () -> assertEquals("notification-gateway", created.path("withoutModel").get(0).path("service").path("id")
                            .asText()),
                    () -> assertEquals(1, created.path("withoutModel").size()),
                    () -> assertEquals(7, summary.path("withModel").asInt()),
                    () -> assertEquals(1, summary.path("withoutModel").asInt()),
                    () -> assertEquals(13, summary.path("openThreats").asInt()));
            var createdRead = data("threat-model-report-scheduler-scheduler-overview.json");
            assertAll(
                    () -> assertEquals(List.of(0, 0, 0, 0, 0, 0), figures(createdRead)),
                    () -> assertEquals("unreleased", createdRead.path("review").path("status").asText()),
                    () -> assertEquals("quick-start", createdRead.path("parts").path("data").path("value").path("recipe").asText()),
                    () -> assertEquals("2026-11-26", createdRead.path("parts").path("data").path("value").path("last-review")
                            .asText()),
                    () -> assertEquals(1, createdRead.path("parts").path("model").path("value").path("components").size()),
                    () -> assertEquals(createdRead.path("threats"), created.path("models").get(6).path("threats")));
        }

        @Test
        @DisplayName("the search finds the six models with the category and the address of the read; the references hold T-07")
        void shouldIndexTheModels() {
            for (var name : List.of("documents-index.json", "documents-index-created.json", "documents-index-n5-released.json",
                    "documents-index-minutes.json")) {
                List<String> found = new ArrayList<>();
                for (var entry : data(name).path("entries")) {
                    if (!"threat-models".equals(entry.path("repository").asText())) {
                        continue;
                    }
                    var read = modelFile(entry.path("id").asText());
                    found.add(entry.path("id").asText());
                    assertAll(name + " " + entry.path("id").asText(),
                            () -> assertEquals("threat-models", entry.path("category").asText()),
                            () -> assertEquals("threat-model", entry.path("kind").asText()),
                            () -> assertEquals(read.path("title"), entry.path("title")),
                            () -> assertEquals(read.path("state"), entry.path("state")),
                            () -> assertEquals(read.path("address"), entry.path("address")));
                }
                assertEquals(MODELS.stream().map(entry -> entry.get(0)).toList(), found, name);
            }
        }
    }

    // ----------------------------------------------------------------------------------------- the schema and the recipes
    @Nested
    @DisplayName("the schema and the recipes")
    class SchemaAndRecipes {

        @Test
        @DisplayName("the schema is the category threat-models with the kind threat-model and a split on model")
        void shouldReadTheSchema() {
            var schema = data("categories-threat-models-schema.json");
            var kind = schema.path("kinds").get(0);
            var properties = kind.path("schema").path("properties");
            assertAll(
                    () -> assertEquals("threat-models", schema.path("category").asText()),
                    () -> assertEquals(1, schema.path("kinds").size()),
                    () -> assertEquals("threat-model", kind.path("id").asText()),
                    () -> assertEquals("threat-models", kind.path("repository").asText()),
                    () -> assertTrue(properties.path("model").path("gdr-split").asBoolean()),
                    () -> assertEquals(List.of("service", "owner", "last-review", "recipe", "model"), fieldNames(properties)),
                    () -> assertEquals(List.of("service", "owner", "last-review", "model"), requiredOf(kind.path("schema"))));
        }

        @Test
        @DisplayName("every step fills a node of the schema of the part model: an array or an object; English and German agree")
        void shouldFillNodesOfTheSchema() {
            var model = data("categories-threat-models-schema.json").path("kinds").get(0).path("schema").path("properties")
                    .path("model");
            for (var recipe : List.of("quick-start", "stride")) {
                var english = data("threat-model-recipe-" + recipe + ".json");
                var german = data("threat-model-recipe-" + recipe + "-de.json");
                assertEquals(column(english.path("steps"), "id"), column(german.path("steps"), "id"), recipe);
                assertEquals(column(english.path("steps"), "fills"), column(german.path("steps"), "fills"), recipe);
                assertEquals(recipe, english.path("id").asText());
                assertEquals(recipe, german.path("id").asText());
                for (var step : english.path("steps")) {
                    var node = schemaNode(model, step.path("fills").asText());
                    assertTrue(node.path("type").asText().equals("array") || node.path("type").asText().equals("object"),
                            recipe + " " + step.path("fills").asText());
                    if (node.path("type").asText().equals("array")) {
                        assertEquals("object", node.path("items").path("type").asText(), recipe + " " + step.path("fills").asText());
                    }
                    assertFalse(step.path("title").asText().isBlank());
                    assertFalse(step.path("guidance").asText().isBlank());
                }
                for (var step : german.path("steps")) {
                    assertFalse(step.path("title").asText().isBlank());
                    assertFalse(step.path("guidance").asText().isBlank());
                }
                assertFalse(english.path("steps").toString().equals(german.path("steps").toString()), recipe);
            }
            assertAll(
                    () -> assertEquals(List.of("project", "zones", "components", "threats"),
                            column(data("threat-model-recipe-quick-start.json").path("steps"), "id")),
                    () -> assertEquals(List.of("/project", "/trustZones", "/components", "/threats"),
                            column(data("threat-model-recipe-quick-start.json").path("steps"), "fills")),
                    () -> assertEquals(List.of("project", "zones", "components", "dataflows", "threats", "mitigations"),
                            column(data("threat-model-recipe-stride.json").path("steps"), "id")),
                    () -> assertEquals(List.of("/project", "/trustZones", "/components", "/dataflows", "/threats", "/mitigations"),
                            column(data("threat-model-recipe-stride.json").path("steps"), "fills")));
        }

        @Test
        @DisplayName("the lists name the two recipes in both languages with the number of steps of the recipe")
        void shouldCountTheStepsInTheLists() {
            for (var suffix : List.of("", "-de")) {
                var list = data("threat-model-recipes" + suffix + ".json").path("recipes");
                assertEquals(List.of("quick-start", "stride"), column(list, "id"));
                for (var item : list) {
                    var recipe = data("threat-model-recipe-" + item.path("id").asText() + suffix + ".json");
                    assertAll(item.path("id").asText() + suffix,
                            () -> assertEquals(recipe.path("steps").size(), item.path("steps").asInt()),
                            () -> assertEquals(recipe.path("title"), item.path("title")),
                            () -> assertEquals(recipe.path("description"), item.path("description")),
                            () -> assertEquals(List.of("id", "title", "description", "steps"), fieldNames(item)));
                }
            }
            assertEquals(List.of(4, 6), List.of(data("threat-model-recipes.json").path("recipes").get(0).path("steps").asInt(),
                    data("threat-model-recipes.json").path("recipes").get(1).path("steps").asInt()));
            assertEquals("Schnellstart", data("threat-model-recipes-de.json").path("recipes").get(0).path("title").asText());
        }
    }

    // --------------------------------------------------------------------------------------------------- the behaviour
    private static final String SCHEDULER = TM + "report-scheduler";
    private static final String SAVE = DOCS + CHECKOUT + "/save";
    private static final String SUBMIT = DOCS + CHECKOUT + "/transitions/threat-model.submit";
    private static final String RELEASE = "/api/v1/releases/threat-models/" + CHECKOUT;
    private static final String EVALUATION = "/api/v1/reports/threat-evaluation";
    private static final String SUMMARY = "/api/v1/reports/summary";

    private static String stateOf(MockClient client) {
        return get(client, "/mock/state").path("state").asText();
    }

    private static String outcome(MockClient client, String method, String path) {
        return json(client.change(method, path, "{}")).path("outcome").asText();
    }

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
    @DisplayName("workshop: the reads")
    class WorkshopReads {

        @Test
        @DisplayName("a model is read at its address and at its document, with its revisions, its page and the list")
        void shouldReadTheSixModels() {
            try (var client = start("workshop")) {
                for (var entry : MODELS) {
                    var file = modelFile(entry.get(0));
                    assertAll(entry.get(0),
                            () -> assertEquals(file, get(client, TM + entry.get(1) + "/" + entry.get(2))),
                            () -> assertEquals(file, get(client, DOCS + entry.get(0))),
                            () -> assertEquals(data("threat-model-" + entry.get(0) + "-revisions.json"),
                                    get(client, DOCS + entry.get(0) + "/revisions")),
                            () -> assertEquals(data("threat-model-service-" + entry.get(1) + ".json"), get(client, TM + entry.get(1))));
                }
                for (var service : List.of("report-scheduler", "notification-gateway", "ledger")) {
                    assertEquals(data("threat-model-service-" + service + ".json"), get(client, TM + service));
                }
                assertAll(
                        () -> assertEquals(data("threat-models-index.json"), get(client, "/api/v1/documents/threat-models")),
                        () -> assertEquals(data("categories-threat-models-schema.json"), get(client, CATEGORY + "schema")),
                        () -> assertEquals(data("reports-threat-evaluation.json"), get(client, EVALUATION)),
                        () -> assertEquals(data("reports-summary-workshop.json"), get(client, SUMMARY)));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"threat-models/payment-api/checkout-flow", "documents/threat-models/payment-api-checkout-flow"})
        @DisplayName("a revision is frozen without transitions; an unknown revision is 404 and a malformed one 422 FORMAT")
        void shouldReadTheRevisions(String address) {
            try (var client = start("workshop")) {
                String path = "/api/v1/" + address;
                var v1 = get(client, path + "?at=v1");
                var v2 = get(client, path + "?at=v2");
                var v3 = get(client, path + "?at=v3");
                var missing = client.get(path + "?at=v9");
                var malformed = client.get(path + "?at=zzz");
                var login = get(client, TM + "identity-provider/login-flow?at=v1");
                assertAll(
                        () -> assertTrue(v1.path("frozen").asBoolean()),
                        () -> assertEquals(5, v1.path("threats").path("total").asInt()),
                        () -> assertEquals(8, v2.path("threats").path("total").asInt()),
                        () -> assertEquals(List.of("v1", "v2", "v3"), List.of(v1.path("at").path("ref").asText(),
                                v2.path("at").path("ref").asText(), v3.path("at").path("ref").asText())),
                        () -> assertEquals(0, v1.path("transitions").size()),
                        () -> assertTrue(v1.path("draft").isNull()),
                        () -> assertEquals(data("threat-model-" + CHECKOUT + "-at-v3.json"), v3),
                        () -> assertEquals(404, missing.statusCode()),
                        () -> assertEquals("NOT_FOUND", json(missing).path("outcome").asText()),
                        () -> assertEquals(422, malformed.statusCode()),
                        () -> assertEquals("/at", json(malformed).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("FORMAT", json(malformed).path("errors").get(0).path("code").asText()),
                        () -> assertEquals(5, login.path("threats").path("total").asInt()),
                        () -> assertTrue(login.path("frozen").asBoolean()));
            }
        }

        @Test
        @DisplayName("what does not exist is NOT_FOUND: a service, a model, a document")
        void shouldRefuseWhatDoesNotExist() {
            try (var client = start("workshop")) {
                for (var path : List.of(TM + "nope", TM + "payment-api/nope", DOCS + "nope", DOCS + "nope?at=v1",
                        CATEGORY + "recipes/nope", CATEGORY + "recipes/nope?lang=de", TM + "report-scheduler/scheduler-overview")) {
                    var response = client.get(path);
                    assertEquals(404, response.statusCode(), path);
                    assertEquals("NOT_FOUND", json(response).path("outcome").asText(), path);
                }
            }
        }

        @Test
        @DisplayName("the recipes: English without lang and with lang=en, German with lang=de, any other lang is 400 on the pointer /lang")
        void shouldReadTheRecipes() {
            try (var client = start("workshop")) {
                var english = data("threat-model-recipes.json");
                var german = data("threat-model-recipes-de.json");
                var refused = client.get(CATEGORY + "recipes?lang=fr");
                assertAll(
                        () -> assertEquals(english, get(client, CATEGORY + "recipes")),
                        () -> assertEquals(english, get(client, CATEGORY + "recipes?lang=en")),
                        () -> assertEquals(german, get(client, CATEGORY + "recipes?lang=de")),
                        () -> assertEquals(400, refused.statusCode()),
                        () -> assertEquals("VALIDATION", json(refused).path("outcome").asText()),
                        () -> assertEquals("/lang", json(refused).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("ENUM", json(refused).path("errors").get(0).path("code").asText()));
                for (var recipe : List.of("quick-start", "stride")) {
                    assertAll(recipe,
                            () -> assertEquals(data("threat-model-recipe-" + recipe + ".json"), get(client, CATEGORY + "recipes/" + recipe)),
                            () -> assertEquals(data("threat-model-recipe-" + recipe + ".json"),
                                    get(client, CATEGORY + "recipes/" + recipe + "?lang=en")),
                            () -> assertEquals(data("threat-model-recipe-" + recipe + "-de.json"),
                                    get(client, CATEGORY + "recipes/" + recipe + "?lang=de")),
                            () -> assertEquals(400, client.get(CATEGORY + "recipes/" + recipe + "?lang=fr").statusCode()));
                }
            }
        }

        @Test
        @DisplayName("a recipe draft is none for the six services and the two without a model; other services have no route")
        void shouldAnswerNoDraft() {
            try (var client = start("workshop")) {
                for (var service : List.of("payment-api", "customer-portal", "identity-provider", "customer-db", "reporting",
                        "notification-service", "report-scheduler", "notification-gateway")) {
                    for (var recipe : List.of("quick-start", "stride")) {
                        var draft = get(client, TM + service + "/drafts/" + recipe);
                        assertEquals(service, draft.path("service").asText());
                        assertEquals(recipe, draft.path("recipe").asText());
                        assertTrue(draft.path("draft").isNull(), service);
                    }
                }
                assertEquals(404, client.get(TM + "ledger/drafts/stride").statusCode());
                assertEquals("MOCK_NO_ROUTE", json(client.get(TM + "ledger/drafts/stride")).path("outcome").asText());
            }
        }

        @Test
        @DisplayName("the search finds the checkout flow; T-07 resolves with its title and its address")
        void shouldSearchAndResolve() {
            try (var client = start("workshop")) {
                var hits = get(client, "/api/v1/search?q=checkout%20flow").path("results");
                var login = get(client, "/api/v1/search?q=login%20flow").path("results");
                var resolved = get(client, "/api/v1/references/resolve?ref=threat-models:threat-model/" + CHECKOUT + "%23T-07");
                var reference = find(resolved.path("references"), "ref", "threat-models:threat-model/" + CHECKOUT + "#T-07");
                var entry = hits.get(0);
                assertAll(
                        () -> assertEquals(1, hits.size()),
                        () -> assertEquals("threat-models", entry.path("repository").asText()),
                        () -> assertEquals(CHECKOUT, entry.path("id").asText()),
                        () -> assertEquals("threat-models", entry.path("category").asText()),
                        () -> assertEquals("threat-model", entry.path("kind").asText()),
                        () -> assertEquals("Payment API, checkout flow", entry.path("title").asText()),
                        () -> assertEquals("released", entry.path("state").asText()),
                        () -> assertEquals("/threat-models/payment-api/checkout-flow", entry.path("address").asText()),
                        () -> assertEquals(List.of("identity-provider-login-flow"), column(login, "id")),
                        () -> assertTrue(reference.path("found").asBoolean()),
                        () -> assertEquals("Payment API, checkout flow: T-07", reference.path("title").asText()),
                        () -> assertEquals("/threat-models/payment-api/checkout-flow", reference.path("address").asText()));
            }
        }

        @Test
        @DisplayName("the writes without a state: the drafts answer 200, a retired service is 409, an unknown one 404, the rights are asked")
        void shouldAnswerTheStaticWrites() {
            try (var client = start("workshop")) {
                var draft = client.change("PUT", TM + "report-scheduler/drafts/stride", "{}");
                var documentDraft = client.change("PUT", "/api/v1/drafts/threat-models/" + CHECKOUT, "{}");
                assertAll(
                        () -> assertEquals("DRAFT_SAVED", json(draft).path("outcome").asText()),
                        () -> assertEquals("2026-11-26T09:20:00Z", json(draft).path("at").asText()),
                        () -> assertEquals("DRAFT_SAVED", json(documentDraft).path("outcome").asText()),
                        () -> assertEquals("DRAFT_SAVED", outcome(client, "PUT", TM + "notification-gateway/drafts/quick-start")),
                        () -> assertEquals(409, client.change("POST", TM + "ledger", "{}").statusCode()),
                        () -> assertEquals("SERVICE_RETIRED", outcome(client, "POST", TM + "ledger")),
                        () -> assertEquals(404, client.change("POST", TM + "nope", "{}").statusCode()),
                        () -> assertEquals("NOT_FOUND", outcome(client, "POST", TM + "nope")),
                        () -> assertEquals("workshop#ready", client.mock().current()));
            }
        }

        @Test
        @DisplayName("the rights of workshop on threat-models are read, edit and approve; Kim keeps read; Noor of release has none")
        void shouldGiveTheRights() {
            Map<String, List<String>> expected = Map.of("workshop", List.of("read", "edit", "approve"), "read-only", List.of("read"),
                    "release", List.of(), "degraded", List.of("read", "edit"));
            for (var profile : expected.keySet()) {
                try (var client = start(profile)) {
                    List<String> actions = new ArrayList<>();
                    json(client.get("/api/v1/session")).path("rights").forEach(right -> {
                        if ("threat-models".equals(right.path("repository").asText())) {
                            right.path("actions").forEach(action -> actions.add(action.asText()));
                        }
                    });
                    assertEquals(expected.get(profile), actions, profile);
                }
            }
        }
    }

    @Nested
    @DisplayName("workshop: the lifecycle of the checkout flow")
    class WorkshopLifecycle {

        @Test
        @DisplayName("save, submit and release walk the model through draft 4, in-review and released 4; the evaluation and the summary follow")
        void shouldWalkTheChain() {
            try (var client = start("workshop")) {
                var before = get(client, EVALUATION);
                var saved = client.change("POST", SAVE, "{}");
                var reopened = get(client, CHECKOUT_ADDRESS);
                var reopenedEvaluation = get(client, EVALUATION);
                var reopenedSummary = get(client, SUMMARY).path("threatModels");
                var reopenedPage = get(client, TM + "payment-api");
                var reopenedList = get(client, "/api/v1/documents/threat-models");
                var reopenedAt = get(client, CHECKOUT_ADDRESS + "?at=v1");
                var reopenedState = stateOf(client);
                var submitted = client.change("POST", SUBMIT, "{}");
                var inReview = get(client, CHECKOUT_ADDRESS);
                var diff = get(client, DOCS + CHECKOUT + "/diff");
                var inReviewEvaluation = get(client, EVALUATION);
                var inReviewState = stateOf(client);
                var released = client.change("POST", RELEASE, "{}");
                var after = get(client, CHECKOUT_ADDRESS);
                var afterEvaluation = get(client, EVALUATION);
                var afterSummary = get(client, SUMMARY).path("threatModels");
                var afterAt = get(client, DOCS + CHECKOUT + "?at=v4");
                var afterPage = get(client, TM + "payment-api");
                var afterList = get(client, "/api/v1/documents/threat-models");
                var releasedRow = row(afterEvaluation, "payment-api", "checkout-flow");
                assertAll(
                        () -> assertEquals("released", row(before, "payment-api", "checkout-flow").path("state").asText()),
                        () -> assertEquals(200, saved.statusCode()),
                        () -> assertEquals("SAVED", json(saved).path("outcome").asText()),
                        () -> assertEquals("draft", json(saved).path("state").asText()),
                        () -> assertEquals(4, json(saved).path("version").asInt()),
                        () -> assertEquals(reopened.path("parts").path("model").path("blob"),
                                json(saved).path("parts").path("model").path("blob")),
                        () -> assertEquals(reopened.path("parts").path("data").path("blob"),
                                json(saved).path("parts").path("data").path("blob")),
                        () -> assertEquals("threat-model-reopened", reopenedState),
                        () -> assertEquals("draft", reopened.path("state").asText()),
                        () -> assertEquals(4, reopened.path("version").asInt()),
                        () -> assertEquals("2026-11-26", reopened.path("parts").path("data").path("value").path("last-review").asText()),
                        () -> assertEquals("models/" + CHECKOUT + "/v3", reopened.path("release").path("tag").asText()),
                        () -> assertEquals("2026-06-01", reopened.path("review").path("lastReview").asText()),
                        () -> assertEquals("threat-model.submit", reopened.path("transitions").get(0).path("id").asText()),
                        () -> assertEquals(List.of("draft", 3), List.of(row(reopenedEvaluation, "payment-api", "checkout-flow").path("state").asText(),
                                row(reopenedEvaluation, "payment-api", "checkout-flow").path("version").asInt())),
                        () -> assertEquals(List.of(9, 2, 2, 1), countsOf(row(reopenedEvaluation, "payment-api", "checkout-flow").path("threats"))),
                        () -> assertEquals(reopened.path("threats"), row(reopenedEvaluation, "payment-api", "checkout-flow").path("threats")),
                        () -> assertEquals(List.of(12, 10, 2, 1), List.of(reopenedSummary.path("openThreats").asInt(),
                                reopenedSummary.path("untreatedThreats").asInt(), reopenedSummary.path("overdue").asInt(),
                                reopenedSummary.path("dueSoon").asInt())),
                        () -> assertEquals("draft", reopenedPage.path("models").get(0).path("state").asText()),
                        () -> assertEquals(CHECKOUT, reopenedList.path("documents").get(0).path("id").asText()),
                        () -> assertTrue(reopenedAt.path("frozen").asBoolean()),
                        () -> assertEquals(5, reopenedAt.path("threats").path("total").asInt()),
                        () -> assertEquals(200, submitted.statusCode()),
                        () -> assertEquals("TRANSITIONED", json(submitted).path("outcome").asText()),
                        () -> assertEquals("in-review", json(submitted).path("state").asText()),
                        () -> assertEquals("threat-model-in-review", inReviewState),
                        () -> assertEquals("in-review", inReview.path("state").asText()),
                        () -> assertEquals("threat-model.release", inReview.path("transitions").get(0).path("id").asText()),
                        () -> assertTrue(inReview.path("transitions").get(0).path("release").asBoolean()),
                        () -> assertEquals("in-review", row(inReviewEvaluation, "payment-api", "checkout-flow").path("state").asText()),
                        () -> assertEquals("models/" + CHECKOUT + "/v3", diff.path("from").asText()),
                        () -> assertEquals("working", diff.path("to").asText()),
                        () -> assertEquals(List.of("data", "model"), column(diff.path("sections"), "part")),
                        () -> assertEquals("/last-review", diff.path("sections").get(0).path("changes").get(0).path("pointer").asText()),
                        () -> assertEquals(List.of("/threats", "/mitigations"),
                                column(diff.path("sections").get(1).path("changes"), "pointer")),
                        () -> assertEquals(200, released.statusCode()),
                        () -> assertEquals("RELEASED", json(released).path("outcome").asText()),
                        () -> assertEquals("models/" + CHECKOUT + "/v4", json(released).path("tag").asText()),
                        () -> assertEquals("2026-11-26T10:05:00Z", json(released).path("at").asText()),
                        () -> assertEquals("threat-model-released", stateOf(client)),
                        () -> assertEquals("released", after.path("state").asText()),
                        () -> assertEquals(4, after.path("version").asInt()),
                        () -> assertEquals("p-7d2e58", after.path("release").path("by").path("pseudonym").asText()),
                        () -> assertEquals(List.of("released", 4, "2026-11-26", 0, "2027-05-26", 181, "ok"),
                                List.of(releasedRow.path("state").asText(), releasedRow.path("version").asInt(),
                                        releasedRow.path("lastReview").asText(), releasedRow.path("daysSinceReview").asInt(),
                                        releasedRow.path("reviewDue").asText(), releasedRow.path("dueInDays").asInt(),
                                        releasedRow.path("status").asText())),
                        () -> assertEquals(List.of("portal", "login-flow", "report-generation", "storage", "checkout-flow",
                                "notification-flows"), column(afterEvaluation.path("models"), "model")),
                        () -> assertEquals(List.of(12, 10, 2, 0), List.of(afterSummary.path("openThreats").asInt(),
                                afterSummary.path("untreatedThreats").asInt(), afterSummary.path("overdue").asInt(),
                                afterSummary.path("dueSoon").asInt())),
                        () -> assertTrue(afterAt.path("frozen").asBoolean()),
                        () -> assertEquals(4, afterAt.path("version").asInt()),
                        () -> assertEquals("2027-05-26", afterPage.path("models").get(0).path("reviewDue").asText()),
                        () -> assertEquals("released", afterList.path("documents").get(0).path("state").asText()),
                        () -> assertEquals("p-7d2e58", afterList.path("documents").get(0).path("updatedBy").path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("the save, the submit and the release push document-saved, document-transitioned (in-review) and document-transitioned (released)")
        void shouldPushTheEvents() throws Exception {
            try (var client = start("workshop")) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                client.change("POST", SAVE, "{}");
                var saved = awaitEvent(lines, "document-saved");
                client.change("POST", SUBMIT, "{}");
                var submitted = awaitEvent(lines, "document-transitioned");
                client.change("POST", RELEASE, "{}");
                var released = awaitEvent(lines, "document-transitioned");
                assertAll(
                        () -> assertEquals("threat-models", saved.path("repository").asText()),
                        () -> assertEquals(CHECKOUT, saved.path("id").asText()),
                        () -> assertEquals("model", saved.path("part").asText()),
                        () -> assertEquals("p-4c1a9e", saved.path("by").path("pseudonym").asText()),
                        () -> assertEquals("in-review", submitted.path("state").asText()),
                        () -> assertEquals(4, submitted.path("version").asInt()),
                        () -> assertEquals("released", released.path("state").asText()),
                        () -> assertEquals("p-7d2e58", released.path("by").path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("saved-by-other: the save answers CONFLICT per list with the whole list of each side, differing in T-01")
        void shouldConflictPerList() {
            try (var client = start("workshop")) {
                goTo(client, "threat-model-saved-by-other");
                var response = client.change("POST", SAVE, "{}");
                var conflict = json(response).path("conflicts").get(0);
                var field = conflict.path("fields").get(0);
                assertAll(
                        () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("CONFLICT", json(response).path("outcome").asText()),
                        () -> assertEquals("model", conflict.path("part").asText()),
                        () -> assertEquals(modelFile(CHECKOUT).path("parts").path("model").path("blob"), conflict.path("blob")),
                        () -> assertEquals("/threats", field.path("pointer").asText()),
                        () -> assertEquals(column(modelFile(CHECKOUT).path("parts").path("model").path("value").path("threats"), "id"),
                                column(field.path("own"), "id")),
                        () -> assertEquals(column(field.path("own"), "id"), column(field.path("other"), "id")),
                        () -> assertEquals(modelFile(CHECKOUT).path("parts").path("model").path("value").path("threats"), field.path("own")),
                        () -> assertEquals("open", field.path("own").get(0).path("attributes").path("status").asText()),
                        () -> assertEquals("mitigated", field.path("other").get(0).path("attributes").path("status").asText()),
                        () -> assertEquals("Jordan Weber", field.path("by").path("name").asText()),
                        () -> assertEquals("Developer", field.path("by").path("role").asText()));
            }
        }

        @Test
        @DisplayName("invalid: the save and the draft answer three per-field errors with the part and the pointer into it")
        void shouldRefuseInvalidFields() {
            try (var client = start("workshop")) {
                goTo(client, "threat-model-invalid");
                var save = client.change("POST", SAVE, "{}");
                var draft = client.change("PUT", "/api/v1/drafts/threat-models/" + CHECKOUT, "{}");
                List<String> expected = List.of("model /mitigations/0/attributes/threat REFERENCE_NOT_FOUND",
                        "model /threats/0/risk/impact MAXIMUM", "data /owner REFERENCE_NOT_FOUND");
                for (var response : List.of(save, draft)) {
                    List<String> errors = new ArrayList<>();
                    json(response).path("errors").forEach(error -> errors.add(error.path("part").asText() + " "
                            + error.path("pointer").asText() + " " + error.path("code").asText()));
                    assertEquals(422, response.statusCode());
                    assertEquals("VALIDATION", json(response).path("outcome").asText());
                    assertEquals(expected, errors);
                }
            }
        }

        @Test
        @DisplayName("git-unavailable: the status is degraded with threat-models DOWN; save, create, submit and release are 503; the reads and the recipe draft stay 200")
        void shouldRefuseWritesWhileGitIsDown() {
            try (var client = start("workshop")) {
                goTo(client, "threat-model-git-unavailable");
                var status = get(client, "/api/v1/status");
                assertEquals("DOWN", find(status.path("repositories"), "alias", "threat-models").path("fetch").asText());
                assertTrue(status.path("degraded").asBoolean());
                for (var request : List.of(List.of("POST", SAVE), List.of("POST", SUBMIT), List.of("POST", RELEASE),
                        List.of("POST", SCHEDULER), List.of("POST", DOCS + NOTIFICATIONS + "/save"))) {
                    var response = client.change(request.get(0), request.get(1), "{}");
                    assertEquals(503, response.statusCode(), request.toString());
                    assertEquals("GIT_UNAVAILABLE", json(response).path("outcome").asText(), request.toString());
                }
                assertAll(
                        () -> assertEquals(modelFile(CHECKOUT), get(client, CHECKOUT_ADDRESS)),
                        () -> assertEquals(200, client.change("PUT", TM + "report-scheduler/drafts/quick-start", "{}").statusCode()),
                        () -> assertEquals(200, client.change("PUT", "/api/v1/drafts/threat-models/" + CHECKOUT, "{}").statusCode()),
                        () -> assertEquals(200, client.get(EVALUATION).statusCode()));
            }
        }

        @Test
        @DisplayName("submit-incomplete: the submit answers MANDATORY_FIELDS_MISSING with the project name; the model reads as reopened")
        void shouldAskForTheMissingFields() {
            try (var client = start("workshop")) {
                goTo(client, "threat-model-submit-incomplete");
                var response = client.change("POST", SUBMIT, "{}");
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("MANDATORY_FIELDS_MISSING", json(response).path("outcome").asText()),
                        () -> assertEquals("/model/project/name", json(response).path("missing").get(0).asText()),
                        () -> assertEquals(1, json(response).path("missing").size()),
                        () -> assertEquals("draft", get(client, CHECKOUT_ADDRESS).path("state").asText()));
            }
        }

        @Test
        @DisplayName("release-step-up asks for a fresh login, then the same request is released and the mock reads released")
        void shouldWalkTheStepUp() {
            try (var client = start("workshop")) {
                goTo(client, "threat-model-release-step-up");
                var before = get(client, CHECKOUT_ADDRESS).path("state").asText();
                var asked = client.change("POST", RELEASE, "{}");
                var stateAfterAsk = stateOf(client);
                var released = client.change("POST", RELEASE, "{}");
                assertAll(
                        () -> assertEquals("in-review", before),
                        () -> assertEquals(403, asked.statusCode()),
                        () -> assertEquals("STEP_UP_REQUIRED", json(asked).path("outcome").asText()),
                        () -> assertEquals("/api/v1/auth/login?step-up=mfa", json(asked).path("stepUp").asText()),
                        () -> assertEquals("threat-model-release-stepped-up", stateAfterAsk),
                        () -> assertEquals(200, released.statusCode()),
                        () -> assertEquals("RELEASED", json(released).path("outcome").asText()),
                        () -> assertEquals("threat-model-released", stateOf(client)),
                        () -> assertEquals("released", get(client, CHECKOUT_ADDRESS).path("state").asText()));
            }
        }

        @Test
        @DisplayName("release-changed answers CHANGED_SINCE_REVIEW, stays refused until the diff is read, then passes; release-released-meanwhile DOCUMENT_RELEASED with the tag")
        void shouldRefuseTheRelease() {
            try (var client = start("workshop")) {
                goTo(client, "threat-model-release-changed");
                var changed = client.change("POST", RELEASE, "{}");
                var afterRefusal = stateOf(client);
                var again = client.change("POST", RELEASE, "{}");
                var diff = get(client, DOCS + CHECKOUT + "/diff");
                var afterReview = stateOf(client);
                var state = get(client, CHECKOUT_ADDRESS).path("state").asText();
                var passed = client.change("POST", RELEASE, "{}");
                var afterRelease = stateOf(client);
                goTo(client, "threat-model-release-released-meanwhile");
                var meanwhile = client.change("POST", RELEASE, "{}");
                assertAll(
                        () -> assertEquals(409, changed.statusCode()),
                        () -> assertEquals("CHANGED_SINCE_REVIEW", json(changed).path("outcome").asText()),
                        () -> assertEquals("threat-model-release-changed-refused", afterRefusal),
                        () -> assertEquals(409, again.statusCode()),
                        () -> assertEquals("threat-model-release-changed-reviewed", afterReview),
                        () -> assertEquals(200, passed.statusCode()),
                        () -> assertEquals("RELEASED", json(passed).path("outcome").asText()),
                        () -> assertEquals("threat-model-released", afterRelease),
                        () -> assertEquals("in-review", state),
                        () -> assertEquals("working", diff.path("to").asText()),
                        () -> assertEquals(409, meanwhile.statusCode()),
                        () -> assertEquals("DOCUMENT_RELEASED", json(meanwhile).path("outcome").asText()),
                        () -> assertEquals("models/" + CHECKOUT + "/v4", json(meanwhile).path("tag").asText()),
                        () -> assertEquals("released", get(client, CHECKOUT_ADDRESS).path("state").asText()));
            }
        }
    }

    @Nested
    @DisplayName("workshop: the wizard and the services without a model")
    class WorkshopWizard {

        @Test
        @DisplayName("recipe-draft-saved: the draft of quick-start is at step 2 with the project and one zone, the page lists it, the others stay none")
        void shouldKeepTheRecipeDraft() {
            try (var client = start("workshop")) {
                assertTrue(get(client, SCHEDULER + "/drafts/quick-start").path("draft").isNull());
                assertEquals(0, get(client, SCHEDULER).path("drafts").size());
                goTo(client, "recipe-draft-saved");
                var draft = get(client, SCHEDULER + "/drafts/quick-start").path("draft");
                var fields = draft.path("parts").path("model").path("fields");
                var page = get(client, SCHEDULER);
                assertAll(
                        () -> assertEquals(2, draft.path("step").asInt()),
                        () -> assertEquals("2026-11-26T09:20:00Z", draft.path("at").asText()),
                        () -> assertEquals(List.of("/project", "/trustZones"), fieldNames(fields)),
                        () -> assertEquals("Scheduler overview", fields.path("/project").path("name").asText()),
                        () -> assertEquals("internal", fields.path("/trustZones").get(0).path("id").asText()),
                        () -> assertEquals(80, fields.path("/trustZones").get(0).path("risk").path("trustRating").asInt()),
                        () -> assertEquals(1, page.path("drafts").size()),
                        () -> assertEquals("quick-start", page.path("drafts").get(0).path("recipe").asText()),
                        () -> assertEquals(2, page.path("drafts").get(0).path("step").asInt()),
                        () -> assertTrue(get(client, SCHEDULER + "/drafts/stride").path("draft").isNull()),
                        () -> assertEquals(0, page.path("models").size()));
            }
        }

        @Test
        @DisplayName("the create moves to threat-model-created: the model reads, the page, the list, the evaluation and the summary follow")
        void shouldCreateTheModel() throws Exception {
            try (var client = start("workshop")) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                var response = client.change("POST", SCHEDULER, "{}");
                var created = awaitEvent(lines, "document-created");
                var read = get(client, SCHEDULER + "/scheduler-overview");
                var byDocument = get(client, DOCS + "report-scheduler-scheduler-overview");
                var revisions = get(client, DOCS + "report-scheduler-scheduler-overview/revisions");
                var page = get(client, SCHEDULER);
                var list = get(client, "/api/v1/documents/threat-models");
                var evaluation = get(client, EVALUATION);
                var summary = get(client, SUMMARY).path("threatModels");
                assertAll(
                        () -> assertEquals(201, response.statusCode()),
                        () -> assertEquals("CREATED", json(response).path("outcome").asText()),
                        () -> assertEquals("scheduler-overview", json(response).path("model").asText()),
                        () -> assertEquals("report-scheduler-scheduler-overview", json(response).path("document").asText()),
                        () -> assertEquals("/threat-models/report-scheduler/scheduler-overview",
                                json(response).path("address").asText()),
                        () -> assertEquals(1, json(response).path("version").asInt()),
                        () -> assertEquals("2026-11-26T09:41:00Z", json(response).path("at").asText()),
                        () -> assertEquals(read.path("parts").path("model").path("blob"),
                                json(response).path("parts").path("model").path("blob")),
                        () -> assertEquals("threat-model-created", stateOf(client)),
                        () -> assertEquals("report-scheduler-scheduler-overview", created.path("id").asText()),
                        () -> assertEquals("threat-model", created.path("kind").asText()),
                        () -> assertEquals("threat-models", created.path("repository").asText()),
                        () -> assertEquals(read, byDocument),
                        () -> assertEquals("draft", read.path("state").asText()),
                        () -> assertEquals("unreleased", read.path("review").path("status").asText()),
                        () -> assertNotNull(read.path("diagram").path("dataUrl")),
                        () -> assertEquals(1, revisions.path("revisions").size()),
                        () -> assertEquals("create", revisions.path("revisions").get(0).path("kind").asText()),
                        () -> assertEquals(1, page.path("models").size()),
                        () -> assertEquals("unreleased", page.path("models").get(0).path("status").asText()),
                        () -> assertEquals(0, page.path("drafts").size()),
                        () -> assertEquals(7, list.path("documents").size()),
                        () -> assertEquals("report-scheduler-scheduler-overview", list.path("documents").get(0).path("id").asText()),
                        () -> assertEquals(7, evaluation.path("models").size()),
                        () -> assertEquals("scheduler-overview", evaluation.path("models").get(6).path("model").asText()),
                        () -> assertEquals(List.of(0, 0, 0, 0), countsOf(evaluation.path("models").get(6).path("threats"))),
                        () -> assertEquals(List.of("notification-gateway"), List.of(
                                evaluation.path("withoutModel").get(0).path("service").path("id").asText())),
                        () -> assertEquals(1, evaluation.path("withoutModel").size()),
                        () -> assertEquals(List.of(7, 1), List.of(summary.path("withModel").asInt(), summary.path("withoutModel").asInt())));
            }
        }

        @Test
        @DisplayName("create-invalid refuses the create with REQUIRED on /project/name; recipes-none lists no recipe in any language")
        void shouldRefuseAndShipNoRecipe() {
            try (var client = start("workshop")) {
                goTo(client, "threat-model-create-invalid");
                var response = client.change("POST", SCHEDULER, "{}");
                var error = json(response).path("errors").get(0);
                goTo(client, "threat-model-recipes-none");
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("model", error.path("part").asText()),
                        () -> assertEquals("/project/name", error.path("pointer").asText()),
                        () -> assertEquals("REQUIRED", error.path("code").asText()),
                        () -> assertEquals(0, get(client, CATEGORY + "recipes").path("recipes").size()),
                        () -> assertEquals(0, get(client, CATEGORY + "recipes?lang=de").path("recipes").size()),
                        () -> assertEquals(0, get(client, CATEGORY + "recipes?lang=en").path("recipes").size()),
                        () -> assertEquals(404, client.get(CATEGORY + "recipes/stride").statusCode()),
                        () -> assertEquals(404, client.get(CATEGORY + "recipes/stride?lang=de").statusCode()),
                        () -> assertEquals(404, client.get(CATEGORY + "recipes/quick-start?lang=en").statusCode()));
            }
        }

        @Test
        @DisplayName("no-threat-models: the page of the Payment API lists no model, the other pages keep the base")
        void shouldListNoModelOfThePaymentApi() {
            try (var client = start("workshop")) {
                goTo(client, "no-threat-models");
                assertAll(
                        () -> assertEquals(data("threat-model-service-payment-api-none.json"), get(client, TM + "payment-api")),
                        () -> assertEquals(0, get(client, TM + "payment-api").path("models").size()),
                        () -> assertEquals(data("threat-model-service-identity-provider.json"), get(client, TM + "identity-provider")),
                        () -> assertEquals(0, get(client, EVALUATION).path("models").size()));
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ the other profiles
    @Nested
    @DisplayName("the other profiles")
    class OtherProfiles {

        @Test
        @DisplayName("read-only reads everything of the step and answers FORBIDDEN to every write")
        void shouldReadAndRefuseTheWrites() {
            try (var client = start("read-only")) {
                for (var entry : MODELS) {
                    assertEquals(modelFile(entry.get(0)), get(client, TM + entry.get(1) + "/" + entry.get(2)));
                    assertEquals(modelFile(entry.get(0)), get(client, DOCS + entry.get(0)));
                }
                for (var service : SERVICES) {
                    assertEquals(data("threat-model-service-" + service + ".json"), get(client, TM + service));
                }
                assertAll(
                        () -> assertEquals(data("categories-threat-models-schema.json"), get(client, CATEGORY + "schema")),
                        () -> assertEquals(data("threat-model-recipes-de.json"), get(client, CATEGORY + "recipes?lang=de")),
                        () -> assertEquals(data("threat-models-index.json"), get(client, "/api/v1/documents/threat-models")),
                        () -> assertEquals("Payment API, checkout flow", get(client, "/api/v1/search?q=checkout%20flow").path("results")
                                .get(0).path("title").asText()),
                        () -> assertEquals(5, get(client, CHECKOUT_ADDRESS + "?at=v1").path("threats").path("total").asInt()));
                for (var request : List.of(List.of("POST", SAVE), List.of("PUT", "/api/v1/drafts/threat-models/" + CHECKOUT),
                        List.of("POST", SUBMIT), List.of("POST", RELEASE), List.of("POST", SCHEDULER),
                        List.of("PUT", TM + "report-scheduler/drafts/stride"), List.of("POST", TM + "ledger"))) {
                    var response = client.change(request.get(0), request.get(1), "{}");
                    assertEquals(403, response.statusCode(), request.toString());
                    assertEquals("FORBIDDEN", json(response).path("outcome").asText(), request.toString());
                }
            }
        }

        @Test
        @DisplayName("release: Noor has no right on threat-models, the schema, the recipes, the page and the model answer FORBIDDEN")
        void shouldRefuseTheReleaseProfile() {
            try (var client = start("release")) {
                for (var path : List.of(CATEGORY + "schema", CATEGORY + "recipes", TM + "payment-api", CHECKOUT_ADDRESS,
                        DOCS + CHECKOUT)) {
                    var response = client.get(path);
                    assertEquals(403, response.statusCode(), path);
                    assertEquals("FORBIDDEN", json(response).path("outcome").asText(), path);
                }
            }
        }

        @Test
        @DisplayName("empty: no service, so the page is NOT_FOUND and no model; the recipes and the schema are the installation's")
        void shouldHaveNoServiceInEmpty() {
            try (var client = start("empty")) {
                for (var path : List.of(TM + "payment-api", TM + "payment-api/checkout-flow", TM + "report-scheduler")) {
                    var response = client.get(path);
                    assertEquals(404, response.statusCode(), path);
                    assertEquals("NOT_FOUND", json(response).path("outcome").asText(), path);
                }
                assertAll(
                        () -> assertEquals(0, get(client, "/api/v1/documents/threat-models").path("documents").size()),
                        () -> assertEquals(data("categories-threat-models-schema.json"), get(client, CATEGORY + "schema")),
                        () -> assertEquals(data("threat-model-recipes.json"), get(client, CATEGORY + "recipes")),
                        () -> assertEquals(data("threat-model-recipes-de.json"), get(client, CATEGORY + "recipes?lang=de")),
                        () -> assertEquals(data("threat-model-recipe-stride-de.json"),
                                get(client, CATEGORY + "recipes/stride?lang=de")),
                        () -> assertEquals(0, get(client, EVALUATION).path("models").size()));
            }
        }

        @Test
        @DisplayName("degraded: unreachable refuses a save, a create and a submit with 503 (the release is 403: no approve) and keeps the drafts and the reads; recovered writes")
        void shouldRefuseWritesWhileUnreachable() {
            try (var client = start("degraded")) {
                assertEquals(modelFile(CHECKOUT), get(client, CHECKOUT_ADDRESS));
                assertEquals(data("threat-model-service-payment-api.json"), get(client, TM + "payment-api"));
                for (var request : List.of(List.of("POST", SAVE), List.of("POST", SCHEDULER), List.of("POST", SUBMIT))) {
                    var response = client.change(request.get(0), request.get(1), "{}");
                    assertEquals(503, response.statusCode(), request.toString());
                    assertEquals("GIT_UNAVAILABLE", json(response).path("outcome").asText(), request.toString());
                }
                assertEquals(403, client.change("POST", RELEASE, "{}").statusCode(), "Alex has no approve in degraded");
                assertEquals("DRAFT_SAVED", outcome(client, "PUT", TM + "report-scheduler/drafts/stride"));
                goTo(client, "recovered");
                assertAll(
                        () -> assertEquals("SAVED", outcome(client, "POST", SAVE)),
                        () -> assertEquals("CREATED", outcome(client, "POST", SCHEDULER)),
                        () -> assertEquals(modelFile(CHECKOUT), get(client, CHECKOUT_ADDRESS)),
                        () -> assertEquals("Payment API, checkout flow", get(client, "/api/v1/search?q=checkout%20flow").path("results")
                                .get(0).path("title").asText()));
            }
        }

        @Test
        @DisplayName("local reads the models, the pages, the recipes and the schema; its rights hold no approve and it has no write route")
        void shouldReadInLocal() {
            try (var client = MockClient.start("local").loginLocal("alex", "local-password")) {
                assertAll(
                        () -> assertEquals(modelFile(CHECKOUT), get(client, CHECKOUT_ADDRESS)),
                        () -> assertEquals(data("threat-model-service-reporting.json"), get(client, TM + "reporting")),
                        () -> assertEquals(data("threat-model-recipes-de.json"), get(client, CATEGORY + "recipes?lang=de")),
                        () -> assertEquals(data("categories-threat-models-schema.json"), get(client, CATEGORY + "schema")),
                        () -> assertEquals(data("threat-models-index.json"), get(client, "/api/v1/documents/threat-models")),
                        () -> assertEquals(404, client.change("POST", SAVE, "{}").statusCode()),
                        () -> assertEquals(404, client.change("POST", SCHEDULER, "{}").statusCode()));
            }
        }
    }
}
