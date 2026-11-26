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
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import de.cuioss.notary.audit.mock.runtime.CanonicalAddresses;
import de.cuioss.notary.audit.mock.scenario.Requirement;
import de.cuioss.notary.audit.mock.scenario.Route;
import de.cuioss.notary.audit.mock.scenario.ScenarioLoader;
import de.cuioss.notary.audit.mock.scenario.ScenarioRegistry;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The directory and the catalogs of the profiles workshop, read-only, catalog-admin, empty and first-login
 * (doc/specification/rest-api.adoc, <em>Directory and Catalog Requests</em>).
 */
@DisplayName("The directory and the catalogs")
class DirectoryAndCatalogsTest {

    private static final Pattern SCHEMA_ROUTE = Pattern.compile("GET /api/v1/catalogs/([a-z]+)/schema");
    private static final Map<String, Integer> COUNTS = Map.of("team", 5, "role", 6, "service", 8, "system", 3,
            "external", 4);
    private static final Map<String, List<String>> RETIRED = Map.of("team", List.of("legacy-billing"),
            "role", List.of("release-manager"), "service", List.of("ledger"), "system", List.of("legacy-erp"),
            "external", List.of("old-sms-gateway"));
    private static final String CATALOG = "/api/v1/catalogs/";
    private static final String DIRECTORY = "/api/v1/directory/";
    private static final String IMPORT = CATALOG + "import/backstage";
    private static final List<String> LENS_PROFILES = List.of("workshop", "read-only", "catalog-admin");

    private static final ClassLoader CLASS_LOADER = DirectoryAndCatalogsTest.class.getClassLoader();
    private static final ScenarioRegistry REGISTRY = new ScenarioRegistry(
            new ScenarioLoader(MockClient.MAPPER, name -> ScenarioRegistry.readDataFile(CLASS_LOADER, name)), CLASS_LOADER);

    /** The catalogs, read from the schema routes of the workshop scenario: the scenario is the single definition. */
    private static final List<String> CATALOGS = REGISTRY.resolve("workshop").orElseThrow().scenario().routes().keySet()
            .stream().map(SCHEMA_ROUTE::matcher).filter(Matcher::matches)
            .map(matcher -> matcher.group(1)).sorted().toList();

    /**
     * The ids a catalog entry may not take: the literal segment after the catalog in the canonical addresses of the web
     * app ({@code /catalogs/{catalog}/new}) and in the routes of the workshop scenario
     * ({@code /api/v1/catalogs/team/schema}).
     */
    private static final Set<String> RESERVED_IDS = reservedIds();

    private static Set<String> reservedIds() {
        Set<String> reserved = new TreeSet<>();
        Pattern web = Pattern.compile("/catalogs/\\{catalog}/([a-z0-9-]+)");
        Pattern api = Pattern.compile("[A-Z]+ /api/v1/catalogs/(?:" + String.join("|", CATALOGS) + ")/([a-z0-9-]+)");
        try (var in = CLASS_LOADER.getResourceAsStream(CanonicalAddresses.RESOURCE)) {
            MockClient.MAPPER.readTree(in).path("addresses").forEach(route -> {
                var matcher = web.matcher(route.path("pattern").asText());
                if (matcher.matches()) {
                    reserved.add(matcher.group(1));
                }
            });
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        REGISTRY.resolve("workshop").orElseThrow().scenario().routes().keySet().forEach(key -> {
            var matcher = api.matcher(key);
            if (matcher.matches()) {
                reserved.add(matcher.group(1));
            }
        });
        return reserved;
    }

    static Stream<String> lensProfiles() {
        return LENS_PROFILES.stream();
    }

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

    private static List<String> ids(JsonNode entries) {
        List<String> ids = new ArrayList<>();
        entries.forEach(entry -> ids.add(entry.path("id").asText()));
        return ids;
    }

    private static List<String> texts(JsonNode array) {
        List<String> result = new ArrayList<>();
        array.forEach(node -> result.add(node.asText()));
        return result;
    }

    /** A light check of a value against a catalog schema: type, required, enum, pattern, maxLength, maxItems. */
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
            case "string" -> {
                boolean bad = !value.isTextual() || value.asText().length() > schema.path("maxLength").asInt(Integer.MAX_VALUE)
                        || schema.has("enum") && !texts(schema.path("enum")).contains(value.asText())
                        || schema.has("pattern") && !Pattern.compile(schema.path("pattern").asText()).matcher(value.asText()).find();
                if (bad) {
                    problems.add(pointer + " no valid string");
                }
            }
            default -> problems.add(pointer + " unknown type");
        }
        return problems;
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
    @DisplayName("the five catalogs of workshop, read-only and catalog-admin")
    class Catalogs {

        @ParameterizedTest
        @MethodSource("de.cuioss.notary.audit.mock.DirectoryAndCatalogsTest#lensProfiles")
        @DisplayName("list the entries of the five catalogs with the retired ones marked, as the same set in every profile")
        void shouldListTheCatalogs(String profile) {
            try (var client = start(profile)) {
                for (String catalog : CATALOGS) {
                    var entries = get(client, CATALOG + catalog).path("entries");
                    List<String> retired = new ArrayList<>();
                    entries.forEach(entry -> {
                        if (entry.path("retired").asBoolean()) {
                            retired.add(entry.path("id").asText());
                        }
                        assertTrue(!entry.has("retired") || entry.path("retired").asBoolean(), catalog);
                    });
                    assertAll(profile + " " + catalog,
                            () -> assertEquals(COUNTS.get(catalog), entries.size()),
                            () -> assertEquals(RETIRED.get(catalog), retired));
                }
            }
        }

        @Test
        @DisplayName("hold the same lists in workshop, read-only and catalog-admin")
        void shouldHoldTheSameLists() {
            Map<String, Map<String, JsonNode>> byProfile = new LinkedHashMap<>();
            for (String profile : LENS_PROFILES) {
                try (var client = start(profile)) {
                    Map<String, JsonNode> lists = new LinkedHashMap<>();
                    CATALOGS.forEach(catalog -> lists.put(catalog, get(client, CATALOG + catalog)));
                    byProfile.put(profile, lists);
                }
            }
            assertAll(
                    () -> assertEquals(byProfile.get("workshop"), byProfile.get("read-only")),
                    () -> assertEquals(byProfile.get("workshop"), byProfile.get("catalog-admin")));
        }

        @Test
        @DisplayName("keep the four teams and the four roles of the profiles first, in their order, and append the new ones")
        void shouldKeepTheOrderOfTheOldEntries() {
            try (var client = start("workshop")) {
                var teams = ids(get(client, CATALOG + "team").path("entries"));
                var roles = ids(get(client, CATALOG + "role").path("entries"));
                assertAll(
                        () -> assertEquals(List.of("payments", "identity", "mobile", "security-office"), teams.subList(0, 4)),
                        () -> assertEquals(List.of("developer", "product-owner", "security-champion", "ciso"),
                                roles.subList(0, 4)));
            }
        }

        @Test
        @DisplayName("serve the services of the table, without the service the create flow adds")
        void shouldListTheServices() {
            try (var client = start("workshop")) {
                assertEquals(List.of("payment-api", "customer-portal", "identity-provider", "customer-db", "reporting",
                                "report-scheduler", "ledger", "notification-service"),
                        ids(get(client, CATALOG + "service").path("entries")));
            }
        }

        @ParameterizedTest
        @MethodSource("de.cuioss.notary.audit.mock.DirectoryAndCatalogsTest#lensProfiles")
        @DisplayName("serve a schema for every catalog: it parses, requires id and name, and keeps the reserved ids out")
        void shouldServeTheSchemas(String profile) {
            try (var client = start(profile)) {
                for (String catalog : CATALOGS) {
                    var answer = get(client, CATALOG + catalog + "/schema");
                    var schema = answer.path("schema");
                    var id = schema.path("properties").path("id").path("pattern").asText();
                    var required = texts(schema.path("required"));
                    assertAll(profile + " " + catalog,
                            () -> assertEquals(catalog, answer.path("catalog").asText()),
                            () -> assertEquals("https://json-schema.org/draft/2020-12/schema", schema.path("$schema").asText()),
                            () -> assertEquals("object", schema.path("type").asText()),
                            () -> assertTrue(required.containsAll(List.of("id", "name")), required.toString()),
                            () -> assertEquals(120, schema.path("properties").path("name").path("maxLength").asInt()),
                            () -> assertTrue(schema.path("properties").path("description").path("x-free-text").asBoolean()),
                            () -> assertTrue(Pattern.matches(id, "payment-api")),
                            () -> assertTrue(RESERVED_IDS.containsAll(List.of("new", "schema")), RESERVED_IDS.toString()),
                            () -> assertEquals(List.of(), RESERVED_IDS.stream().filter(reserved -> Pattern.matches(id, reserved)).toList()),
                            () -> assertTrue(Pattern.matches(id, "newer")));
                }
            }
        }

        @Test
        @DisplayName("write the service schema out, and the further properties of team and external")
        void shouldWriteTheSchemasOut() {
            try (var client = start("workshop")) {
                var service = get(client, CATALOG + "service/schema").path("schema");
                var team = get(client, CATALOG + "team/schema").path("schema").path("properties");
                var external = get(client, CATALOG + "external/schema").path("schema").path("properties");
                assertAll(
                        () -> assertEquals(List.of("id", "name", "lifecycle", "owner", "protection-needs"),
                                texts(service.path("required"))),
                        () -> assertEquals(List.of("planned", "active", "deprecated"),
                                texts(service.path("properties").path("lifecycle").path("enum"))),
                        () -> assertEquals("system", service.path("properties").path("system").path("x-catalog").asText()),
                        () -> assertEquals(List.of("service", "external"),
                                texts(service.path("properties").path("dependsOn").path("items").path("x-catalog"))),
                        () -> assertTrue(service.path("properties").path("dependsOn").path("uniqueItems").asBoolean()),
                        () -> assertEquals(List.of("normal", "high", "very-high"), texts(service.path("properties")
                                .path("protection-needs").path("properties").path("integrity").path("enum"))),
                        () -> assertEquals("team", team.path("parent").path("x-catalog").asText()),
                        () -> assertEquals(List.of("supplier", "provider", "other"), texts(external.path("kind").path("enum"))),
                        () -> assertFalse(get(client, CATALOG + "role/schema").path("schema").path("properties").has("parent")));
            }
        }

        @ParameterizedTest
        @MethodSource("de.cuioss.notary.audit.mock.DirectoryAndCatalogsTest#lensProfiles")
        @DisplayName("read every listed entry through the handler, equal to its list entry and valid against its schema")
        void shouldReadEveryEntry(String profile) {
            try (var client = start(profile)) {
                for (String catalog : CATALOGS) {
                    var schema = get(client, CATALOG + catalog + "/schema").path("schema");
                    for (var listed : get(client, CATALOG + catalog).path("entries")) {
                        String id = listed.path("id").asText();
                        var response = client.get(CATALOG + catalog + "/" + id);
                        var entry = json(response);
                        assertAll(profile + " " + catalog + "/" + id,
                                () -> assertEquals(200, response.statusCode()),
                                () -> assertEquals(catalog, entry.path("catalog").asText()),
                                () -> assertEquals(id, entry.path("id").asText()),
                                () -> assertEquals(listed.path("name"), entry.path("name")),
                                () -> assertEquals(listed.path("retired").asBoolean(), entry.path("retired").asBoolean()),
                                () -> assertEquals(List.of(), problems(schema, entry.path("value"), "")),
                                () -> assertEquals(id, entry.path("value").path("id").asText()),
                                () -> assertFalse(entry.path("value").path("description").asText().isBlank()),
                                () -> assertFalse(entry.path("value").has("retired")),
                                () -> assertEquals(entry.path("history").get(0).path("at"), entry.path("at")),
                                () -> assertEquals("create", entry.path("history")
                                        .get(entry.path("history").size() - 1).path("kind").asText()),
                                () -> assertEquals("p-7d2e58", entry.path("history").get(0).path("by").path("pseudonym").asText()),
                                () -> assertEquals("Noor Haddad", entry.path("history").get(0).path("by").path("name").asText()),
                                () -> assertEquals(!"service".equals(catalog), entry.path("effective").isNull()));
                    }
                }
            }
        }

        @ParameterizedTest
        @MethodSource("de.cuioss.notary.audit.mock.DirectoryAndCatalogsTest#lensProfiles")
        @DisplayName("answer an unknown id and the reserved ones with 404 NOT_FOUND")
        void shouldAnswerAnUnknownId(String profile) {
            try (var client = start(profile)) {
                for (String catalog : CATALOGS) {
                    for (String id : List.of("no-such-entry", "new")) {
                        var response = client.get(CATALOG + catalog + "/" + id);
                        assertAll(profile + " " + catalog + "/" + id,
                                () -> assertEquals(404, response.statusCode()),
                                () -> assertEquals("NOT_FOUND", json(response).path("outcome").asText()));
                    }
                }
            }
        }

        @Test
        @DisplayName("hold the history of an entry newest first: create always, save for the Payment API and the Identity Provider, retire for a retired one")
        void shouldKeepTheHistory() {
            try (var client = start("workshop")) {
                var pay = get(client, CATALOG + "service/payment-api");
                var provider = get(client, CATALOG + "service/identity-provider");
                var ledger = get(client, CATALOG + "service/ledger");
                var legacy = get(client, CATALOG + "team/legacy-billing");
                var team = get(client, CATALOG + "team/payments");
                List<String> payKinds = new ArrayList<>();
                pay.path("history").forEach(line -> payKinds.add(line.path("kind").asText()));
                assertAll(
                        () -> assertEquals(List.of("save", "create"), payKinds),
                        () -> assertEquals("2026-10-02T09:12:00Z", pay.path("at").asText()),
                        () -> assertEquals("2026-02-11T13:40:00Z", pay.path("history").get(1).path("at").asText()),
                        () -> assertEquals("save", provider.path("history").get(0).path("kind").asText()),
                        () -> assertEquals("retire", ledger.path("history").get(0).path("kind").asText()),
                        () -> assertEquals("retire", legacy.path("history").get(0).path("kind").asText()),
                        () -> assertEquals("team:payments", legacy.path("value").path("parent").asText()),
                        () -> assertEquals(1, team.path("history").size()));
            }
        }
    }

    @Nested
    @DisplayName("the effective protection needs of a service")
    class Effective {

        private JsonNode effective(MockClient client, String id) {
            return get(client, CATALOG + "service/" + id).path("effective");
        }

        private List<String> refs(JsonNode effective) {
            List<String> refs = new ArrayList<>();
            effective.path("dependencies").forEach(dependency -> refs.add(dependency.path("ref").asText()
                    + "(" + dependency.path("depth").asInt() + ")"));
            return refs;
        }

        @Test
        @DisplayName("payment-api: very-high confidentiality by the customer database, very-high integrity by the identity provider, high availability by itself")
        void shouldComputePaymentApi() {
            try (var client = start("workshop")) {
                var effective = effective(client, "payment-api");
                var needs = effective.path("protectionNeeds");
                var decided = effective.path("decidedBy");
                var deep = effective.path("dependencies").get(3);
                assertAll(
                        () -> assertEquals("very-high", needs.path("confidentiality").asText()),
                        () -> assertEquals("very-high", needs.path("integrity").asText()),
                        () -> assertEquals("high", needs.path("availability").asText()),
                        () -> assertEquals("service:customer-db", decided.path("confidentiality").asText()),
                        () -> assertEquals("service:identity-provider", decided.path("integrity").asText()),
                        () -> assertEquals("service:payment-api", decided.path("availability").asText()),
                        () -> assertEquals(List.of("external:psp-provider(1)", "service:customer-db(1)",
                                "service:identity-provider(1)", "external:cloud-hosting(2)"), refs(effective)),
                        () -> assertEquals("service:customer-db", deep.path("via").asText()),
                        () -> assertEquals("Cloud hosting", deep.path("name").asText()),
                        () -> assertTrue(effective.path("cycle").isNull()),
                        () -> assertFalse(effective.path("dependencies").get(0).path("counts").asBoolean()),
                        () -> assertTrue(effective.path("dependencies").get(0).path("protectionNeeds").isNull()),
                        () -> assertTrue(effective.path("dependencies").get(1).path("counts").asBoolean()),
                        () -> assertEquals("very-high", effective.path("dependencies").get(1).path("protectionNeeds")
                                .path("confidentiality").asText()),
                        () -> assertEquals("service:payment-api", effective.path("dependencies").get(1).path("via").asText()));
            }
        }

        @Test
        @DisplayName("customer-portal: very-high confidentiality and integrity by the identity provider, high availability by itself")
        void shouldComputeCustomerPortal() {
            try (var client = start("workshop")) {
                var effective = effective(client, "customer-portal");
                assertAll(
                        () -> assertEquals("very-high", effective.path("protectionNeeds").path("confidentiality").asText()),
                        () -> assertEquals("very-high", effective.path("protectionNeeds").path("integrity").asText()),
                        () -> assertEquals("high", effective.path("protectionNeeds").path("availability").asText()),
                        () -> assertEquals("service:identity-provider", effective.path("decidedBy").path("confidentiality").asText()),
                        () -> assertEquals("service:identity-provider", effective.path("decidedBy").path("integrity").asText()),
                        () -> assertEquals("service:customer-portal", effective.path("decidedBy").path("availability").asText()),
                        () -> assertEquals(List.of("service:identity-provider(1)", "service:payment-api(1)",
                                "external:cloud-hosting(2)", "external:psp-provider(2)", "service:customer-db(2)"),
                                refs(effective)),
                        () -> assertTrue(effective.path("cycle").isNull()));
            }
        }

        @Test
        @DisplayName("identity-provider: decided by itself, one dependency")
        void shouldComputeIdentityProvider() {
            try (var client = start("workshop")) {
                var effective = effective(client, "identity-provider");
                assertAll(
                        () -> assertEquals("very-high", effective.path("protectionNeeds").path("confidentiality").asText()),
                        () -> assertEquals("very-high", effective.path("protectionNeeds").path("integrity").asText()),
                        () -> assertEquals("high", effective.path("protectionNeeds").path("availability").asText()),
                        () -> assertEquals(List.of("service:identity-provider", "service:identity-provider",
                                        "service:identity-provider"),
                                List.of(effective.path("decidedBy").path("confidentiality").asText(),
                                        effective.path("decidedBy").path("integrity").asText(),
                                        effective.path("decidedBy").path("availability").asText())),
                        () -> assertEquals(List.of("external:cloud-hosting(1)"), refs(effective)));
            }
        }

        @Test
        @DisplayName("reporting: all normal by itself, the retired ledger does not count, and the cycle with the scheduler")
        void shouldComputeReporting() {
            try (var client = start("workshop")) {
                var effective = effective(client, "reporting");
                var ledger = effective.path("dependencies").get(0);
                assertAll(
                        () -> assertEquals("normal", effective.path("protectionNeeds").path("confidentiality").asText()),
                        () -> assertEquals("normal", effective.path("protectionNeeds").path("integrity").asText()),
                        () -> assertEquals("normal", effective.path("protectionNeeds").path("availability").asText()),
                        () -> assertEquals("service:reporting", effective.path("decidedBy").path("integrity").asText()),
                        () -> assertEquals(List.of("service:ledger(1)", "service:report-scheduler(1)"), refs(effective)),
                        () -> assertTrue(ledger.path("retired").asBoolean()),
                        () -> assertFalse(ledger.path("counts").asBoolean()),
                        () -> assertEquals("high", ledger.path("protectionNeeds").path("confidentiality").asText()),
                        () -> assertEquals("very-high", ledger.path("protectionNeeds").path("integrity").asText()),
                        () -> assertEquals("normal", ledger.path("protectionNeeds").path("availability").asText()),
                        () -> assertEquals(List.of("service:reporting", "service:report-scheduler"),
                                texts(effective.path("cycle"))),
                        () -> assertEquals(List.of("service:report-scheduler", "service:reporting"),
                                texts(effective(client, "report-scheduler").path("cycle"))));
            }
        }

        @Test
        @DisplayName("notification-gateway: all normal by itself, one dependency, in catalog-admin and read as created")
        void shouldComputeNotificationGateway() {
            try (var client = start("catalog-admin")) {
                var effective = effective(client, "notification-gateway");
                assertAll(
                        () -> assertEquals("normal", effective.path("protectionNeeds").path("availability").asText()),
                        () -> assertEquals("service:notification-gateway", effective.path("decidedBy").path("availability").asText()),
                        () -> assertEquals(List.of("service:notification-service(1)"), refs(effective)),
                        () -> assertTrue(effective.path("cycle").isNull()));
            }
        }

        @Test
        @DisplayName("gives a retired service the effective needs it has as an entry of its own, and no other catalog any")
        void shouldKeepTheRetiredOnesOutOfTheMaximum() {
            try (var client = start("workshop")) {
                var ledger = effective(client, "ledger");
                assertAll(
                        () -> assertEquals("high", ledger.path("protectionNeeds").path("confidentiality").asText()),
                        () -> assertEquals("very-high", ledger.path("protectionNeeds").path("integrity").asText()),
                        () -> assertEquals(0, ledger.path("dependencies").size()),
                        () -> assertTrue(get(client, CATALOG + "system/webshop").path("effective").isNull()),
                        () -> assertTrue(get(client, CATALOG + "external/psp-provider").path("effective").isNull()));
            }
        }
    }

    @Nested
    @DisplayName("the writes of a user without the right administer-catalogs")
    class WithoutTheRight {

        private static final Pattern TEMPLATE_SEGMENT = Pattern.compile("\\{[^}]+}");

        /**
         * The writes that require {@code administer-catalogs}, read from the routes of the scenario and the links and
         * routes of its start state; a path template gets a sample id, as the refusal comes before any route.
         */
        private static List<String[]> protectedWrites(String profile) {
            var reference = REGISTRY.resolve(profile).orElseThrow();
            var scenario = reference.scenario();
            var start = scenario.state(reference.state()).orElseThrow();
            Map<String, Route> routes = new LinkedHashMap<>(scenario.routes());
            routes.putAll(start.routes());
            List<String[]> writes = new ArrayList<>();
            routes.forEach((key, route) -> {
                if (!key.startsWith("GET ") && needsTheRight(route.requires())) {
                    int space = key.indexOf(' ');
                    writes.add(new String[]{key.substring(0, space),
                            TEMPLATE_SEGMENT.matcher(key.substring(space + 1)).replaceAll("sample-id")});
                }
            });
            start.links().values().forEach(link -> {
                if (!"GET".equals(link.method()) && needsTheRight(link.requires())) {
                    writes.add(new String[]{link.method(), TEMPLATE_SEGMENT.matcher(link.path()).replaceAll("sample-id")});
                }
            });
            return writes;
        }

        private static boolean needsTheRight(@Nullable Requirement requires) {
            return requires != null && "administer-catalogs".equals(requires.action());
        }

        @ParameterizedTest
        @ValueSource(strings = {"workshop", "read-only"})
        @DisplayName("answer 403 FORBIDDEN before any route, and the reads stay 200")
        void shouldRefuseEveryWrite(String profile) {
            try (var client = start(profile)) {
                var writes = protectedWrites(profile);
                assertFalse(writes.isEmpty(), profile + " declares no protected write");
                for (String[] write : writes) {
                    var response = client.change(write[0], write[1], "{}");
                    assertAll(profile + " " + write[0] + " " + write[1],
                            () -> assertEquals(403, response.statusCode()),
                            () -> assertEquals("FORBIDDEN", json(response).path("outcome").asText()));
                }
                assertAll(profile,
                        () -> assertEquals(200, client.get(CATALOG + "service").statusCode()),
                        () -> assertEquals(200, client.get(CATALOG + "service/payment-api").statusCode()),
                        () -> assertEquals(200, client.get(DIRECTORY + "persons").statusCode()),
                        () -> assertEquals("ready", stateOf(client)));
            }
        }

        @Test
        @DisplayName("keep the right out of the session of workshop and read-only, and in the one of catalog-admin and empty")
        void shouldHoldTheRightOnlyWhereItIsGranted() {
            for (var expectation : Map.of("workshop", false, "read-only", false, "catalog-admin", true, "empty", true).entrySet()) {
                try (var client = start(expectation.getKey())) {
                    boolean held = false;
                    for (var right : get(client, "/api/v1/session").path("rights")) {
                        if ("directory".equals(right.path("repository").asText())
                                && texts(right.path("actions")).contains("administer-catalogs")) {
                            held = true;
                        }
                    }
                    assertEquals(expectation.getValue(), held, expectation.getKey());
                }
            }
        }
    }

    @Nested
    @DisplayName("the persons of the directory")
    class Persons {

        @Test
        @DisplayName("workshop and read-only keep their five persons; catalog-admin lists eight, three of them unbound")
        void shouldListThePersons() {
            try (var admin = start("catalog-admin"); var workshop = start("workshop")) {
                var persons = get(admin, DIRECTORY + "persons");
                List<String> unbound = new ArrayList<>();
                persons.path("persons").forEach(person -> {
                    if ("unbound".equals(person.path("state").asText())) {
                        unbound.add(person.path("pseudonym").asText());
                    }
                });
                assertAll(
                        () -> assertEquals(5, get(workshop, DIRECTORY + "persons").path("persons").size()),
                        () -> assertEquals(List.of("p-4c1a9e", "p-2b7f10", "p-61c0d4", "p-7d52e8", "p-9e33a1", "p-7d2e58",
                                "p-b3f1c7", "p-e08a52"), pseudonyms(persons)),
                        () -> assertEquals(List.of("p-7d52e8", "p-b3f1c7", "p-e08a52"), unbound),
                        () -> assertFalse(persons.path("truncated").asBoolean(true)),
                        () -> assertEquals("team:security-office", persons.path("persons").get(5).path("memberships")
                                .get(0).path("team").asText()),
                        () -> assertEquals("role:ciso", persons.path("persons").get(5).path("memberships").get(0)
                                .path("role").asText()));
            }
        }

        private List<String> pseudonyms(JsonNode persons) {
            List<String> pseudonyms = new ArrayList<>();
            persons.path("persons").forEach(person -> pseudonyms.add(person.path("pseudonym").asText()));
            return pseudonyms;
        }

        @Test
        @DisplayName("keep every listed person equal to its read in catalog-admin")
        void shouldKeepTheListAndTheReadsConsistent() {
            try (var client = start("catalog-admin")) {
                for (var entry : get(client, DIRECTORY + "persons").path("persons")) {
                    var person = get(client, DIRECTORY + "persons/" + entry.path("pseudonym").asText());
                    assertAll(entry.path("pseudonym").asText(),
                            () -> assertEquals(entry.path("name"), person.path("name")),
                            () -> assertEquals(entry.path("state"), person.path("state")),
                            () -> assertEquals(entry.path("memberships"), person.path("memberships")));
                }
            }
        }

        @Test
        @DisplayName("read the five new persons, and still the old ones and the unknown one in catalog-admin")
        void shouldReadThePersons() {
            try (var client = start("catalog-admin")) {
                for (String pseudonym : List.of("p-7d2e58", "p-b3f1c7", "p-e08a52", "p-5c2d19", "p-a7e341", "p-4c1a9e",
                        "p-2b7f10", "p-61c0d4", "p-9e33a1", "p-7d52e8", "p-0f8a42")) {
                    assertEquals(pseudonym, get(client, DIRECTORY + "persons/" + pseudonym).path("pseudonym").asText());
                }
                assertAll(
                        () -> assertEquals("Priya Raman", get(client, DIRECTORY + "persons/p-b3f1c7").path("name").asText()),
                        () -> assertEquals("team:identity", get(client, DIRECTORY + "persons/p-e08a52").path("memberships")
                                .get(0).path("team").asText()),
                        () -> assertEquals("unbound", get(client, DIRECTORY + "persons/p-5c2d19").path("state").asText()),
                        () -> assertTrue(get(client, DIRECTORY + "persons/p-a7e341").path("erasedOn").isNull()),
                        () -> assertEquals(404, client.get(DIRECTORY + "persons/p-3b9d00").statusCode()));
            }
        }

        @Test
        @DisplayName("prefill: 201 with the two persons, and the table lists them after the link moved to persons-added")
        void shouldPrefillPersons() {
            try (var client = start("catalog-admin")) {
                var response = client.change("POST", DIRECTORY + "persons", "{\"persons\": []}");
                var created = json(response);
                var table = get(client, DIRECTORY + "persons").path("persons");
                assertAll(
                        () -> assertEquals(201, response.statusCode()),
                        () -> assertEquals("CREATED", created.path("outcome").asText()),
                        () -> assertEquals(List.of("p-5c2d19", "p-a7e341"), List.of(
                                created.path("persons").get(0).path("pseudonym").asText(),
                                created.path("persons").get(1).path("pseudonym").asText())),
                        () -> assertEquals("Nadia Kovac", created.path("persons").get(0).path("name").asText()),
                        () -> assertEquals("unbound", created.path("persons").get(1).path("state").asText()),
                        () -> assertEquals("team:mobile", created.path("persons").get(1).path("memberships").get(0)
                                .path("team").asText()),
                        () -> assertEquals("persons-added", stateOf(client)),
                        () -> assertEquals(10, table.size()),
                        () -> assertEquals("p-5c2d19", table.get(8).path("pseudonym").asText()),
                        () -> assertEquals("p-a7e341", table.get(9).path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("erase: 200 with the pseudonym and the date, then the table lacks Jordan Weber and the read is a former person")
        void shouldErasePerson() {
            try (var client = start("catalog-admin")) {
                var response = client.change("POST", DIRECTORY + "erasures", "{\"pseudonym\":\"p-2b7f10\"}");
                var former = get(client, DIRECTORY + "persons/p-2b7f10");
                var table = get(client, DIRECTORY + "persons").path("persons");
                var pseudonyms = new ArrayList<String>();
                table.forEach(person -> pseudonyms.add(person.path("pseudonym").asText()));
                assertAll(
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertEquals("ERASED", json(response).path("outcome").asText()),
                        () -> assertEquals("p-2b7f10", json(response).path("pseudonym").asText()),
                        () -> assertEquals("2026-11-26", json(response).path("erasedOn").asText()),
                        () -> assertEquals("person-erased", stateOf(client)),
                        () -> assertEquals(7, table.size()),
                        () -> assertFalse(pseudonyms.contains("p-2b7f10")),
                        () -> assertEquals("former", former.path("state").asText()),
                        () -> assertTrue(former.path("name").isNull()),
                        () -> assertEquals("2026-11-26", former.path("erasedOn").asText()),
                        () -> assertEquals("role:developer", former.path("memberships").get(0).path("role").asText()));
            }
        }

        @Test
        @DisplayName("erase-managed-by-source: the erasure and the prefill answer 409 MANAGED_BY_SOURCE and change nothing")
        void shouldRefuseWhenManagedBySource() {
            try (var client = start("catalog-admin#erase-managed-by-source")) {
                var erase = client.change("POST", DIRECTORY + "erasures", "{\"pseudonym\":\"p-2b7f10\"}");
                var prefill = client.change("POST", DIRECTORY + "persons", "{}");
                assertAll(
                        () -> assertEquals(409, erase.statusCode()),
                        () -> assertEquals("MANAGED_BY_SOURCE", json(erase).path("outcome").asText()),
                        () -> assertEquals("managed-by-source", json(erase).path("type").asText()),
                        () -> assertEquals(409, prefill.statusCode()),
                        () -> assertEquals("MANAGED_BY_SOURCE", json(prefill).path("outcome").asText()),
                        () -> assertEquals("erase-managed-by-source", stateOf(client)),
                        () -> assertEquals(8, get(client, DIRECTORY + "persons").path("persons").size()));
            }
        }

        @Test
        @DisplayName("persons-invalid: the prefill answers 422 with the pointer into the second person")
        void shouldRefuseInvalidPersons() {
            try (var client = start("catalog-admin#persons-invalid")) {
                var response = client.change("POST", DIRECTORY + "persons", "{}");
                var error = json(response).path("errors").get(0);
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("VALIDATION", json(response).path("outcome").asText()),
                        () -> assertEquals("/persons/1/memberships/0/team", error.path("pointer").asText()),
                        () -> assertEquals("REFERENCE_NOT_FOUND", error.path("code").asText()),
                        () -> assertEquals(8, get(client, DIRECTORY + "persons").path("persons").size()));
            }
        }
    }

    @Nested
    @DisplayName("the profile catalog-admin")
    class CatalogAdmin {

        @Test
        @DisplayName("is Noor Haddad with the right administer-catalogs, a read right on the SAMM assessments, nothing due, and no primary profile")
        void shouldBeTheAdministrator() {
            try (var client = start("catalog-admin")) {
                var session = get(client, "/api/v1/session");
                var status = get(client, "/api/v1/status");
                List<String> repositories = new ArrayList<>();
                session.path("rights").forEach(right -> repositories.add(right.path("repository").asText() + ":"
                        + String.join(",", texts(right.path("actions")))));
                List<String> up = new ArrayList<>();
                status.path("repositories").forEach(repository -> up.add(repository.path("alias").asText() + ":"
                        + repository.path("fetch").asText()));
                assertAll(
                        () -> assertEquals("p-7d2e58", session.path("user").path("pseudonym").asText()),
                        () -> assertEquals("Noor Haddad", session.path("user").path("name").asText()),
                        () -> assertEquals(List.of("directory:read,edit,approve,administer-catalogs", "samm-assessments:read"),
                                repositories),
                        () -> assertFalse(session.path("firstLoginRequired").asBoolean(true)),
                        () -> assertFalse(session.path("directoryConfirmationDue").asBoolean(true)),
                        () -> assertTrue(up.contains("directory:UP")),
                        () -> assertTrue(up.contains("samm-assessments:UP")),
                        () -> assertFalse(status.path("degraded").asBoolean(true)),
                        () -> assertEquals(0, get(client, "/api/v1/due").path("items").size()),
                        () -> assertEquals("ready", stateOf(client)));
            }
        }

        @Test
        @DisplayName("answers no document request: the profile has no right on a document repository")
        void shouldAnswerNoDocumentRequest() {
            try (var client = start("catalog-admin")) {
                assertAll(
                        () -> assertEquals(404, client.get("/api/v1/documents/test-notes").statusCode()),
                        () -> assertEquals("MOCK_NO_ROUTE", get(client, "/api/v1/documents/test-notes").path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("saves an entry with SAVED, refuses a retired one with 409 RETIRED and retires with RETIRED")
        void shouldSaveAndRetireThroughTheHandler() {
            try (var client = start("catalog-admin")) {
                var save = client.change("PUT", CATALOG + "service/payment-api", "{}");
                var other = client.change("PUT", CATALOG + "team/payments", "{}");
                var retired = client.change("PUT", CATALOG + "service/ledger", "{}");
                var retire = client.change("POST", CATALOG + "role/developer/retirement", null);
                var again = client.change("POST", CATALOG + "team/legacy-billing/retirement", null);
                var unknown = client.change("PUT", CATALOG + "service/no-such", "{}");
                assertAll(
                        () -> assertEquals(200, save.statusCode()),
                        () -> assertEquals("SAVED", json(save).path("outcome").asText()),
                        () -> assertEquals("service", json(save).path("catalog").asText()),
                        () -> assertEquals("payment-api", json(save).path("id").asText()),
                        () -> assertEquals("2026-11-26T09:30:00Z", json(save).path("at").asText()),
                        () -> assertEquals("team", json(other).path("catalog").asText()),
                        () -> assertEquals(409, retired.statusCode()),
                        () -> assertEquals("RETIRED", json(retired).path("outcome").asText()),
                        () -> assertEquals(200, retire.statusCode()),
                        () -> assertEquals("RETIRED", json(retire).path("outcome").asText()),
                        () -> assertEquals("role", json(retire).path("catalog").asText()),
                        () -> assertEquals("2026-11-26T09:35:00Z", json(retire).path("at").asText()),
                        () -> assertEquals(200, again.statusCode()),
                        () -> assertEquals(404, unknown.statusCode()),
                        () -> assertEquals("ready", stateOf(client)));
            }
        }

        @Test
        @DisplayName("creates a service through the link of ready: 201 CREATED, then the state service-created lists it")
        void shouldCreateAService() {
            try (var client = start("catalog-admin")) {
                var response = client.change("POST", CATALOG + "service", "{}");
                var created = json(response);
                var list = get(client, CATALOG + "service").path("entries");
                assertAll(
                        () -> assertEquals(201, response.statusCode()),
                        () -> assertEquals("CREATED", created.path("outcome").asText()),
                        () -> assertEquals("notification-gateway", created.path("id").asText()),
                        () -> assertEquals("/catalogs/service/notification-gateway", created.path("address").asText()),
                        () -> assertEquals("2026-11-26T09:30:00Z", created.path("at").asText()),
                        () -> assertEquals("service-created", stateOf(client)),
                        () -> assertEquals(9, list.size()),
                        () -> assertEquals("notification-gateway", list.get(8).path("id").asText()),
                        () -> assertEquals(200, client.get(CATALOG + "service/notification-gateway").statusCode()));
            }
        }

        @Test
        @DisplayName("creates an entry of the four other catalogs with its fixed id and address, without a state change")
        void shouldCreateInTheOtherCatalogs() {
            Map<String, String> ids = Map.of("team", "platform", "role", "auditor", "system", "mobile-apps",
                    "external", "audit-firm");
            try (var client = start("catalog-admin")) {
                for (var entry : ids.entrySet()) {
                    var response = client.change("POST", CATALOG + entry.getKey(), "{}");
                    var created = json(response);
                    assertAll(entry.getKey(),
                            () -> assertEquals(201, response.statusCode()),
                            () -> assertEquals("CREATED", created.path("outcome").asText()),
                            () -> assertEquals(entry.getKey(), created.path("catalog").asText()),
                            () -> assertEquals(entry.getValue(), created.path("id").asText()),
                            () -> assertEquals("/catalogs/" + entry.getKey() + "/" + entry.getValue(),
                                    created.path("address").asText()),
                            () -> assertEquals("ready", stateOf(client)),
                            () -> assertEquals(404, client.get(CATALOG + entry.getKey() + "/" + entry.getValue()).statusCode()));
                }
            }
        }

        @Test
        @DisplayName("retires the Customer Portal through the exact link of ready, which beats the template, and moves to service-retired")
        void shouldRetireTheCustomerPortal() {
            try (var client = start("catalog-admin")) {
                var other = client.change("POST", CATALOG + "service/payment-api/retirement", null);
                var stateAfterOther = stateOf(client);
                var response = client.change("POST", CATALOG + "service/customer-portal/retirement", null);
                var list = get(client, CATALOG + "service").path("entries");
                var entry = get(client, CATALOG + "service/customer-portal");
                var save = client.change("PUT", CATALOG + "service/customer-portal", "{}");
                var portal = new ArrayList<String>();
                list.forEach(item -> portal.add(item.path("id").asText() + ":" + item.path("retired").asBoolean()));
                assertAll(
                        () -> assertEquals("RETIRED", json(other).path("outcome").asText()),
                        () -> assertEquals("ready", stateAfterOther),
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertEquals("RETIRED", json(response).path("outcome").asText()),
                        () -> assertEquals("customer-portal", json(response).path("id").asText()),
                        () -> assertEquals("service-retired", stateOf(client)),
                        () -> assertTrue(portal.contains("customer-portal:true")),
                        () -> assertTrue(portal.contains("ledger:true")),
                        () -> assertEquals(8, list.size()),
                        () -> assertTrue(entry.path("retired").asBoolean()),
                        () -> assertEquals("retire", entry.path("history").get(0).path("kind").asText()),
                        () -> assertEquals("create", entry.path("history").get(1).path("kind").asText()),
                        () -> assertEquals(409, save.statusCode()),
                        () -> assertEquals("RETIRED", json(save).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("the import preview and the import answer the register's example: 3 created, 2 updated, 4 unchanged, 5 left out")
        void shouldAnswerTheImport() {
            try (var client = start("catalog-admin")) {
                var preview = json(client.change("POST", IMPORT + "/preview", "{\"documents\":[]}"));
                var result = json(client.change("POST", IMPORT, "{\"documents\":[]}"));
                var reasons = new ArrayList<String>();
                result.path("leftOut").forEach(item -> reasons.add(item.path("reason").asText()));
                assertAll(
                        () -> assertEquals("PREVIEW", preview.path("outcome").asText()),
                        () -> assertEquals("IMPORTED", result.path("outcome").asText()),
                        () -> assertEquals(3, result.path("created").size()),
                        () -> assertEquals(2, result.path("updated").size()),
                        () -> assertEquals(4, result.path("unchanged").asInt()),
                        () -> assertEquals(5, result.path("leftOut").size()),
                        () -> assertEquals(preview.path("created"), result.path("created")),
                        () -> assertEquals(preview.path("leftOut"), result.path("leftOut")),
                        () -> assertEquals(List.of("LIFECYCLE_UNMAPPED", "DEFAULTS_MISSING", "NAMESPACE_NOT_DEFAULT",
                                "REFERENCE_KIND_NOT_SUPPORTED", "KIND_NOT_SUPPORTED"), reasons),
                        () -> assertEquals("checkout-ui", result.path("created").get(0).path("id").asText()),
                        () -> assertEquals(List.of("lifecycle", "owner.team", "dependsOn"),
                                texts(result.path("updated").get(0).path("changed"))),
                        () -> assertEquals("spec.dependsOn[2]", result.path("leftOut").get(3).path("field").asText()),
                        () -> assertTrue(result.path("leftOut").get(1).path("field").isNull()),
                        () -> assertEquals("component:ops/legacy-export", result.path("leftOut").get(2).path("entity").asText()),
                        () -> assertEquals("ready", stateOf(client)));
            }
        }

        @Test
        @DisplayName("import-nothing-new: nothing created or updated, eleven unchanged, the first three items left out")
        void shouldAnswerARepeatedImport() {
            try (var client = start("catalog-admin#import-nothing-new")) {
                var preview = json(client.change("POST", IMPORT + "/preview", "{}"));
                var result = json(client.change("POST", IMPORT, "{}"));
                assertAll(
                        () -> assertEquals("PREVIEW", preview.path("outcome").asText()),
                        () -> assertEquals("IMPORTED", result.path("outcome").asText()),
                        () -> assertEquals(0, result.path("created").size()),
                        () -> assertEquals(0, result.path("updated").size()),
                        () -> assertEquals(11, result.path("unchanged").asInt()),
                        () -> assertEquals(3, result.path("leftOut").size()),
                        () -> assertEquals(11, preview.path("unchanged").asInt()),
                        () -> assertEquals("LIFECYCLE_UNMAPPED", result.path("leftOut").get(0).path("reason").asText()));
            }
        }

        @Test
        @DisplayName("import-invalid and import-too-large refuse the preview and the import")
        void shouldRefuseTheImport() {
            try (var client = start("catalog-admin#import-invalid")) {
                var preview = client.change("POST", IMPORT + "/preview", "{}");
                var result = client.change("POST", IMPORT, "{}");
                assertAll(
                        () -> assertEquals(422, preview.statusCode()),
                        () -> assertEquals(422, result.statusCode()),
                        () -> assertEquals("/documents/0/content", json(result).path("errors").get(0).path("pointer").asText()),
                        () -> assertEquals("FORMAT", json(result).path("errors").get(0).path("code").asText()));
            }
            try (var client = start("catalog-admin#import-too-large")) {
                var preview = client.change("POST", IMPORT + "/preview", "{}");
                var result = client.change("POST", IMPORT, "{}");
                assertAll(
                        () -> assertEquals(413, preview.statusCode()),
                        () -> assertEquals(413, result.statusCode()),
                        () -> assertEquals("TOO_LARGE", json(result).path("outcome").asText()),
                        () -> assertEquals(2_097_152, json(result).path("limit").asInt()));
            }
        }

        @Test
        @DisplayName("catalog-invalid: creating a service and changing the Payment API answer 422 with three errors, the others stay")
        void shouldRefuseInvalidServices() {
            try (var client = start("catalog-admin#catalog-invalid")) {
                var create = client.change("POST", CATALOG + "service", "{}");
                var save = client.change("PUT", CATALOG + "service/payment-api", "{}");
                var other = client.change("PUT", CATALOG + "service/customer-portal", "{}");
                var errors = json(create).path("errors");
                assertAll(
                        () -> assertEquals(422, create.statusCode()),
                        () -> assertEquals(422, save.statusCode()),
                        () -> assertEquals("VALIDATION", json(create).path("outcome").asText()),
                        () -> assertEquals(List.of("/owner/team", "/dependsOn/1", "/name"), List.of(
                                errors.get(0).path("pointer").asText(), errors.get(1).path("pointer").asText(),
                                errors.get(2).path("pointer").asText())),
                        () -> assertEquals(List.of("REFERENCE_NOT_FOUND", "REFERENCE_NOT_FOUND", "REQUIRED"), List.of(
                                errors.get(0).path("code").asText(), errors.get(1).path("code").asText(),
                                errors.get(2).path("code").asText())),
                        () -> assertEquals(json(create), json(save)),
                        () -> assertEquals(200, other.statusCode()),
                        () -> assertEquals("catalog-invalid", stateOf(client)));
            }
        }

        @Test
        @DisplayName("catalog-id-taken: creating a service answers 409 ID_TAKEN")
        void shouldRefuseATakenId() {
            try (var client = start("catalog-admin#catalog-id-taken")) {
                var response = client.change("POST", CATALOG + "service", "{}");
                assertAll(
                        () -> assertEquals(409, response.statusCode()),
                        () -> assertEquals("ID_TAKEN", json(response).path("outcome").asText()),
                        () -> assertEquals("catalog-id-taken", stateOf(client)));
            }
        }

        @Test
        @DisplayName("catalog-rejected: the create, the change of the Payment API and the retirement of the Customer Portal answer 502 REJECTED")
        void shouldAnswerRejected() {
            try (var client = start("catalog-admin#catalog-rejected")) {
                var create = client.change("POST", CATALOG + "service", "{}");
                var save = client.change("PUT", CATALOG + "service/payment-api", "{}");
                var retire = client.change("POST", CATALOG + "service/customer-portal/retirement", null);
                var other = client.change("POST", CATALOG + "service/payment-api/retirement", null);
                assertAll(
                        () -> assertEquals(502, create.statusCode()),
                        () -> assertEquals("REJECTED", json(create).path("outcome").asText()),
                        () -> assertEquals(502, save.statusCode()),
                        () -> assertEquals(502, retire.statusCode()),
                        () -> assertEquals(200, other.statusCode()),
                        () -> assertEquals("catalog-rejected", stateOf(client)));
            }
        }

        @Test
        @DisplayName("catalog-changed-elsewhere: the Payment API reads with the description Jordan Weber saved and one more history line")
        void shouldReadTheChangedEntry() {
            try (var client = start("catalog-admin")) {
                var before = get(client, CATALOG + "service/payment-api");
                goTo(client, "catalog-changed-elsewhere");
                var after = get(client, CATALOG + "service/payment-api");
                assertAll(
                        () -> assertNotEqualsText(before.path("value").path("description"), after.path("value").path("description")),
                        () -> assertEquals(before.path("history").size() + 1, after.path("history").size()),
                        () -> assertEquals("save", after.path("history").get(0).path("kind").asText()),
                        () -> assertEquals("2026-11-26T09:20:00Z", after.path("history").get(0).path("at").asText()),
                        () -> assertEquals("p-2b7f10", after.path("history").get(0).path("by").path("pseudonym").asText()),
                        () -> assertEquals("2026-11-26T09:20:00Z", after.path("at").asText()),
                        () -> assertEquals(before.path("effective"), after.path("effective")));
            }
        }

        private void assertNotEqualsText(JsonNode first, JsonNode second) {
            assertFalse(first.asText().equals(second.asText()), first.asText());
        }

        @Test
        @DisplayName("git-unavailable: the status is degraded with the directory down, every write answers 503 GIT_UNAVAILABLE, the reads and the preview stay")
        void shouldAnswerGitUnavailable() {
            try (var client = start("catalog-admin#git-unavailable")) {
                var status = get(client, "/api/v1/status");
                List<String> writes = new ArrayList<>();
                for (String catalog : CATALOGS) {
                    writes.add("POST " + CATALOG + catalog);
                    writes.add("PUT " + CATALOG + catalog + "/payments");
                    writes.add("POST " + CATALOG + catalog + "/payments/retirement");
                }
                writes.addAll(List.of("POST " + IMPORT, "POST " + DIRECTORY + "persons", "POST " + DIRECTORY + "erasures",
                        "POST " + DIRECTORY + "me/confirmation", "PUT " + DIRECTORY + "me"));
                List<String> directory = new ArrayList<>();
                status.path("repositories").forEach(repository -> directory.add(repository.path("alias").asText() + ":"
                        + repository.path("fetch").asText()));
                for (String write : writes) {
                    var response = client.change(write.substring(0, write.indexOf(' ')), write.substring(write.indexOf(' ') + 1), "{}");
                    assertAll(write,
                            () -> assertEquals(503, response.statusCode()),
                            () -> assertEquals("GIT_UNAVAILABLE", json(response).path("outcome").asText()));
                }
                assertAll(
                        () -> assertTrue(status.path("degraded").asBoolean()),
                        () -> assertTrue(directory.contains("directory:DOWN")),
                        () -> assertTrue(directory.contains("samm-assessments:UP")),
                        () -> assertEquals(200, client.change("POST", IMPORT + "/preview", "{}").statusCode()),
                        () -> assertEquals(200, client.get(CATALOG + "service/payment-api").statusCode()),
                        () -> assertEquals(8, get(client, CATALOG + "service").path("entries").size()),
                        () -> assertEquals(8, get(client, DIRECTORY + "persons").path("persons").size()),
                        () -> assertEquals("git-unavailable", stateOf(client)));
            }
        }

        @Test
        @DisplayName("reads and saves the own entry as Noor Haddad, and confirms it")
        void shouldReadAndSaveTheOwnEntry() {
            try (var client = start("catalog-admin")) {
                var me = get(client, DIRECTORY + "me");
                var save = json(client.change("PUT", DIRECTORY + "me", "{}"));
                var confirmation = json(client.change("POST", DIRECTORY + "me/confirmation", null));
                assertAll(
                        () -> assertEquals("Noor Haddad", me.path("name").asText()),
                        () -> assertEquals(List.of("security-office"), texts(me.path("teams"))),
                        () -> assertEquals("p-7d2e58", me.path("entry").path("pseudonym").asText()),
                        () -> assertEquals("team:security-office", me.path("entry").path("memberships").get(0).path("team").asText()),
                        () -> assertEquals("role:ciso", me.path("entry").path("memberships").get(0).path("role").asText()),
                        () -> assertEquals("2026-02-10", me.path("entry").path("confirmedAt").asText()),
                        () -> assertFalse(me.path("entry").path("confirmationDue").asBoolean(true)),
                        () -> assertEquals("SAVED", save.path("outcome").asText()),
                        () -> assertEquals("p-7d2e58", save.path("pseudonym").asText()),
                        () -> assertEquals("2026-11-26", save.path("confirmedAt").asText()),
                        () -> assertEquals("CONFIRMED", confirmation.path("outcome").asText()),
                        () -> assertEquals("2026-11-26", confirmation.path("confirmedAt").asText()));
            }
        }

        @Test
        @DisplayName("pushes catalog-changed to an open stream in service-created, service-retired and catalog-changed-elsewhere")
        void shouldPushCatalogChanged() throws Exception {
            try (var client = start("catalog-admin")) {
                var lines = client.events().body().iterator();
                assertEquals(": connected", lines.next());
                goTo(client, "service-created");
                var created = awaitEvent(lines, "catalog-changed");
                goTo(client, "service-retired");
                var retired = awaitEvent(lines, "catalog-changed");
                goTo(client, "catalog-changed-elsewhere");
                var elsewhere = awaitEvent(lines, "catalog-changed");
                assertAll(
                        () -> assertEquals("service", created.path("catalog").asText()),
                        () -> assertEquals("notification-gateway", created.path("id").asText()),
                        () -> assertEquals("p-7d2e58", created.path("by").path("pseudonym").asText()),
                        () -> assertEquals("Noor Haddad", created.path("by").path("name").asText()),
                        () -> assertEquals("customer-portal", retired.path("id").asText()),
                        () -> assertEquals("p-7d2e58", retired.path("by").path("pseudonym").asText()),
                        () -> assertEquals("payment-api", elsewhere.path("id").asText()),
                        () -> assertEquals("p-2b7f10", elsewhere.path("by").path("pseudonym").asText()),
                        () -> assertEquals("Jordan Weber", elsewhere.path("by").path("name").asText()));
            }
        }

        @Test
        @DisplayName("describes every state, and the start state stays ready")
        void shouldDescribeEveryState() {
            var scenario = REGISTRY.resolve("catalog-admin").orElseThrow().scenario();
            assertAll(
                    () -> assertEquals("ready", scenario.start()),
                    () -> assertEquals(List.of("ready", "service-created", "service-retired", "catalog-invalid", "catalog-id-taken",
                                    "catalog-rejected", "catalog-changed-elsewhere", "import-invalid", "import-too-large",
                                    "import-nothing-new", "persons-invalid", "persons-added", "person-erased",
                                    "erase-managed-by-source", "git-unavailable"),
                            new ArrayList<>(scenario.states().keySet())),
                    () -> scenario.states().values().forEach(state ->
                            assertFalse(state.description().isBlank(), state.id())),
                    () -> assertFalse(REGISTRY.primaryNames().contains("catalog-admin")));
        }
    }

    @Nested
    @DisplayName("the own entry and the reconfirmation in workshop and read-only")
    class OwnEntry {

        @Test
        @DisplayName("workshop reads Alex with an entry that needs no confirmation, saves and confirms")
        void shouldReadTheOwnEntry() {
            try (var client = start("workshop")) {
                var me = get(client, DIRECTORY + "me");
                var save = json(client.change("PUT", DIRECTORY + "me", "{}"));
                var confirmation = json(client.change("POST", DIRECTORY + "me/confirmation", null));
                assertAll(
                        () -> assertEquals("Alex Example", me.path("name").asText()),
                        () -> assertEquals(List.of("payments"), texts(me.path("teams"))),
                        () -> assertEquals("p-4c1a9e", me.path("entry").path("pseudonym").asText()),
                        () -> assertEquals("role:security-champion", me.path("entry").path("memberships").get(0).path("role").asText()),
                        () -> assertEquals("2026-01-14", me.path("entry").path("confirmedAt").asText()),
                        () -> assertFalse(me.path("entry").path("confirmationDue").asBoolean(true)),
                        () -> assertFalse(me.path("informationText").asText().isBlank()),
                        () -> assertEquals("SAVED", save.path("outcome").asText()),
                        () -> assertEquals("p-4c1a9e", save.path("pseudonym").asText()),
                        () -> assertEquals("2026-11-26", save.path("confirmedAt").asText()),
                        () -> assertEquals("CONFIRMED", confirmation.path("outcome").asText()),
                        () -> assertFalse(get(client, "/api/v1/session").path("directoryConfirmationDue").asBoolean(true)));
            }
        }

        @Test
        @DisplayName("workshop answers the information text the first-login profile shows")
        void shouldKeepTheInformationText() {
            try (var workshop = start("workshop"); var first = start("first-login")) {
                assertEquals(get(first, DIRECTORY + "me").path("informationText"),
                        get(workshop, DIRECTORY + "me").path("informationText"));
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"read-only#ready", "read-only#preview-hostile", "read-only#preview-unavailable"})
        @DisplayName("read-only refuses saving and confirming with 403 in every state, not only in ready")
        void shouldRefuseTheWritesOfAReaderInEveryState(String reference) {
            try (var client = start(reference)) {
                var save = client.change("PUT", DIRECTORY + "me", "{}");
                var confirmation = client.change("POST", DIRECTORY + "me/confirmation", null);
                assertAll(reference,
                        () -> assertEquals(403, save.statusCode()),
                        () -> assertEquals(403, confirmation.statusCode()));
            }
        }

        @Test
        @DisplayName("read-only reads Kim with an entry, and refuses saving and confirming with 403")
        void shouldRefuseTheWritesOfAReader() {
            try (var client = start("read-only")) {
                var me = get(client, DIRECTORY + "me");
                var save = client.change("PUT", DIRECTORY + "me", "{}");
                var confirmation = client.change("POST", DIRECTORY + "me/confirmation", null);
                assertAll(
                        () -> assertEquals("p-71d0c3", me.path("entry").path("pseudonym").asText()),
                        () -> assertEquals("team:identity", me.path("entry").path("memberships").get(0).path("team").asText()),
                        () -> assertEquals("role:product-owner", me.path("entry").path("memberships").get(0).path("role").asText()),
                        () -> assertEquals(List.of("readers"), texts(me.path("teams"))),
                        () -> assertEquals("2026-03-03", me.path("entry").path("confirmedAt").asText()),
                        () -> assertEquals(403, save.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(save).path("outcome").asText()),
                        () -> assertEquals(403, confirmation.statusCode()),
                        () -> assertEquals("FORBIDDEN", json(confirmation).path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("confirmation-due: the session and the entry say that the confirmation is due; confirming moves to confirmation-done")
        void shouldConfirmWhenDue() {
            try (var client = start("workshop#confirmation-due")) {
                var sessionBefore = get(client, "/api/v1/session");
                var meBefore = get(client, DIRECTORY + "me");
                var response = client.change("POST", DIRECTORY + "me/confirmation", null);
                var sessionAfter = get(client, "/api/v1/session");
                var meAfter = get(client, DIRECTORY + "me");
                assertAll(
                        () -> assertTrue(sessionBefore.path("directoryConfirmationDue").asBoolean()),
                        () -> assertTrue(meBefore.path("entry").path("confirmationDue").asBoolean()),
                        () -> assertEquals("2025-10-02", meBefore.path("entry").path("confirmedAt").asText()),
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertEquals("CONFIRMED", json(response).path("outcome").asText()),
                        () -> assertEquals("2026-11-26", json(response).path("confirmedAt").asText()),
                        () -> assertEquals("confirmation-done", stateOf(client)),
                        () -> assertFalse(sessionAfter.path("directoryConfirmationDue").asBoolean(true)),
                        () -> assertFalse(meAfter.path("entry").path("confirmationDue").asBoolean(true)),
                        () -> assertEquals("2026-11-26", meAfter.path("entry").path("confirmedAt").asText()));
            }
        }

        @Test
        @DisplayName("confirmation-due: saving the entry confirms it as well and moves to confirmation-done")
        void shouldConfirmBySaving() {
            try (var client = start("workshop#confirmation-due")) {
                var response = client.change("PUT", DIRECTORY + "me", "{}");
                assertAll(
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertEquals("SAVED", json(response).path("outcome").asText()),
                        () -> assertEquals("2026-11-26", json(response).path("confirmedAt").asText()),
                        () -> assertEquals("confirmation-done", stateOf(client)),
                        () -> assertFalse(get(client, "/api/v1/session").path("directoryConfirmationDue").asBoolean(true)));
            }
        }

        @Test
        @DisplayName("lists the flag in /mock/state and carries it in the session of every profile")
        void shouldCarryTheFlagInEveryProfile() {
            // The primary profiles come from primary.txt; the others are named, as they are no primary profile.
            List<String> profiles = new ArrayList<>(REGISTRY.primaryNames());
            profiles.addAll(List.of("release", "login-trouble#recovered", "catalog-admin"));
            for (String profile : profiles) {
                try (var client = start(profile)) {
                    assertAll(profile,
                            () -> assertTrue(get(client, "/api/v1/session").has("directoryConfirmationDue")),
                            () -> assertFalse(get(client, "/api/v1/session").path("directoryConfirmationDue").asBoolean(true)));
                }
            }
            try (var client = start("workshop#confirmation-due")) {
                assertTrue(get(client, "/mock/state").path("directory_confirmation_due").asBoolean());
            }
        }

        @Test
        @DisplayName("entry-invalid: saving answers 422 with the pointer into the membership")
        void shouldRefuseAnInvalidEntry() {
            try (var client = start("workshop#entry-invalid")) {
                var response = client.change("PUT", DIRECTORY + "me", "{}");
                var error = json(response).path("errors").get(0);
                assertAll(
                        () -> assertEquals(422, response.statusCode()),
                        () -> assertEquals("/memberships/0/team", error.path("pointer").asText()),
                        () -> assertEquals("REFERENCE_NOT_FOUND", error.path("code").asText()),
                        () -> assertEquals("CONFIRMED", json(client.change("POST", DIRECTORY + "me/confirmation", null))
                                .path("outcome").asText()));
            }
        }

        @Test
        @DisplayName("entry-git-unavailable: saving and confirming answer 503 GIT_UNAVAILABLE, the read stays")
        void shouldAnswerGitUnavailable() {
            try (var client = start("workshop#entry-git-unavailable")) {
                var save = client.change("PUT", DIRECTORY + "me", "{}");
                var confirmation = client.change("POST", DIRECTORY + "me/confirmation", null);
                assertAll(
                        () -> assertEquals(503, save.statusCode()),
                        () -> assertEquals("GIT_UNAVAILABLE", json(save).path("outcome").asText()),
                        () -> assertEquals(503, confirmation.statusCode()),
                        () -> assertEquals(200, client.get(DIRECTORY + "me").statusCode()));
            }
        }

        @Test
        @DisplayName("lets the degraded profile keep refusing the save with 503")
        void shouldKeepDegraded() {
            try (var client = start("degraded")) {
                assertEquals(503, client.change("PUT", DIRECTORY + "me", "{}").statusCode());
            }
        }

        @Test
        @DisplayName("describes the four new workshop states")
        void shouldDescribeTheStates() {
            var scenario = REGISTRY.resolve("workshop").orElseThrow().scenario();
            for (String state : List.of("confirmation-due", "confirmation-done", "entry-invalid", "entry-git-unavailable")) {
                assertFalse(scenario.state(state).orElseThrow().description().isBlank(), state);
            }
        }
    }

    @Nested
    @DisplayName("the first login with candidates")
    class FirstLogin {

        @Test
        @DisplayName("reads Robin Newcomer without an entry")
        void shouldReadWithoutAnEntry() {
            try (var client = start("first-login")) {
                var me = get(client, DIRECTORY + "me");
                assertAll(
                        () -> assertTrue(me.has("entry")),
                        () -> assertTrue(me.path("entry").isNull()),
                        () -> assertEquals("Robin Newcomer", me.path("name").asText()));
            }
        }

        @Test
        @DisplayName("candidates: the first save answers 409 with the two candidates, the second binds p-3d7a15 and registers")
        void shouldOfferCandidates() {
            try (var client = start("first-login#candidates")) {
                var first = client.change("PUT", DIRECTORY + "me", "{\"name\":\"Robin Newcomer\"}");
                var candidates = json(first).path("candidates");
                var second = client.change("PUT", DIRECTORY + "me", "{\"binding\":\"p-3d7a15\"}");
                var session = get(client, "/api/v1/session");
                var me = get(client, DIRECTORY + "me");
                assertAll(
                        () -> assertEquals(409, first.statusCode()),
                        () -> assertEquals("BINDING_CANDIDATES", json(first).path("outcome").asText()),
                        () -> assertEquals(2, candidates.size()),
                        () -> assertEquals("p-3d7a15", candidates.get(0).path("pseudonym").asText()),
                        () -> assertEquals("Robin Newcomer", candidates.get(0).path("name").asText()),
                        () -> assertEquals("p-8e2b40", candidates.get(1).path("pseudonym").asText()),
                        () -> assertEquals("Rowan Newman", candidates.get(1).path("name").asText()),
                        () -> assertEquals("team:payments", candidates.get(1).path("memberships").get(0).path("team").asText()),
                        () -> assertEquals("role:developer", candidates.get(1).path("memberships").get(0).path("role").asText()),
                        () -> assertEquals(200, second.statusCode()),
                        () -> assertEquals("SAVED", json(second).path("outcome").asText()),
                        () -> assertEquals("p-3d7a15", json(second).path("pseudonym").asText()),
                        () -> assertEquals("registered-bound", stateOf(client)),
                        () -> assertFalse(session.path("firstLoginRequired").asBoolean(true)),
                        () -> assertEquals("p-3d7a15", me.path("entry").path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("candidates-not-bindable: 409 with the candidates, then 409 NOT_BINDABLE, then 200 and registered-bound")
        void shouldRefuseTheChoice() {
            try (var client = start("first-login#candidates-not-bindable")) {
                var first = client.change("PUT", DIRECTORY + "me", "{}");
                var second = client.change("PUT", DIRECTORY + "me", "{\"binding\":\"p-0b0b0b\"}");
                var stateAfterRefusal = stateOf(client);
                var third = client.change("PUT", DIRECTORY + "me", "{\"binding\":\"p-3d7a15\"}");
                assertAll(
                        () -> assertEquals(409, first.statusCode()),
                        () -> assertEquals("BINDING_CANDIDATES", json(first).path("outcome").asText()),
                        () -> assertEquals(409, second.statusCode()),
                        () -> assertEquals("NOT_BINDABLE", json(second).path("outcome").asText()),
                        () -> assertEquals("candidates-chosen", stateAfterRefusal),
                        () -> assertEquals(200, third.statusCode()),
                        () -> assertEquals("p-3d7a15", json(third).path("pseudonym").asText()),
                        () -> assertEquals("registered-bound", stateOf(client)));
            }
        }

        @Test
        @DisplayName("keeps the form, invalid-team and registered, and describes the five new states")
        void shouldKeepTheOldStates() {
            var scenario = REGISTRY.resolve("first-login").orElseThrow().scenario();
            assertAll(
                    () -> assertEquals("form", scenario.start()),
                    () -> assertEquals(List.of("form", "invalid-team", "registered", "registered-bound", "candidates", "candidates-chosen",
                            "candidates-not-bindable", "candidates-refused"), new ArrayList<>(scenario.states().keySet())),
                    () -> scenario.states().values().forEach(state -> assertFalse(state.description().isBlank(), state.id())));
            try (var client = start("first-login")) {
                var response = client.change("PUT", DIRECTORY + "me", "{}");
                assertAll(
                        () -> assertEquals(200, response.statusCode()),
                        () -> assertEquals("p-9b7e21", json(response).path("pseudonym").asText()),
                        () -> assertEquals("registered", stateOf(client)),
                        () -> assertEquals("p-9b7e21", get(client, DIRECTORY + "me").path("entry").path("pseudonym").asText()));
            }
        }

        @Test
        @DisplayName("keeps every other request closed to the user without an entry, the confirmation included")
        void shouldRefuseTheRest() {
            try (var client = start("first-login#candidates")) {
                assertAll(
                        () -> assertEquals(403, client.change("POST", DIRECTORY + "me/confirmation", null).statusCode()),
                        () -> assertEquals(403, client.get(CATALOG + "service").statusCode()),
                        () -> assertEquals(200, client.get(CATALOG + "team").statusCode()));
            }
        }
    }

    @Nested
    @DisplayName("the profile empty")
    class Empty {

        @Test
        @DisplayName("lists nothing in the services, systems and externals, nor any person, and has nothing to read")
        void shouldListNothing() {
            try (var client = start("empty")) {
                for (String catalog : List.of("service", "system", "external")) {
                    assertEquals(0, get(client, CATALOG + catalog).path("entries").size(), catalog);
                }
                assertAll(
                        () -> assertEquals(4, get(client, CATALOG + "team").path("entries").size()),
                        () -> assertEquals(4, get(client, CATALOG + "role").path("entries").size()),
                        () -> assertEquals(0, get(client, DIRECTORY + "persons").path("persons").size()),
                        () -> assertFalse(get(client, DIRECTORY + "persons").path("truncated").asBoolean(true)));
                for (String catalog : CATALOGS) {
                    assertEquals(404, client.get(CATALOG + catalog + "/payments").statusCode(), catalog);
                }
            }
        }

        @Test
        @DisplayName("serves the five schemas and lets Sam Firstuser write: the right is held")
        void shouldServeTheSchemasAndAnswerTheWrites() {
            try (var client = start("empty")) {
                for (String catalog : CATALOGS) {
                    assertEquals(catalog, get(client, CATALOG + catalog + "/schema").path("catalog").asText());
                }
                var create = client.change("POST", CATALOG + "service", "{}");
                var save = client.change("PUT", CATALOG + "team/payments", "{}");
                var retire = client.change("POST", CATALOG + "role/developer/retirement", "{}");
                var imported = client.change("POST", IMPORT, "{}");
                var persons = client.change("POST", DIRECTORY + "persons", "{}");
                var erase = client.change("POST", DIRECTORY + "erasures", "{}");
                assertAll(
                        () -> assertEquals(201, create.statusCode()),
                        () -> assertEquals("notification-gateway", json(create).path("id").asText()),
                        () -> assertEquals(404, save.statusCode()),
                        () -> assertEquals(404, retire.statusCode()),
                        () -> assertEquals("IMPORTED", json(imported).path("outcome").asText()),
                        () -> assertEquals("PREVIEW", json(client.change("POST", IMPORT + "/preview", "{}")).path("outcome").asText()),
                        () -> assertEquals(201, persons.statusCode()),
                        () -> assertEquals(200, erase.statusCode()),
                        () -> assertEquals("ready", stateOf(client)));
            }
        }

        @Test
        @DisplayName("reads the own entry of Sam Firstuser, saves and confirms it")
        void shouldReadTheOwnEntry() {
            try (var client = start("empty")) {
                var me = get(client, DIRECTORY + "me");
                var save = json(client.change("PUT", DIRECTORY + "me", "{}"));
                assertAll(
                        () -> assertEquals("p-0a11ce", me.path("entry").path("pseudonym").asText()),
                        () -> assertEquals("team:security-office", me.path("entry").path("memberships").get(0).path("team").asText()),
                        () -> assertEquals("role:ciso", me.path("entry").path("memberships").get(0).path("role").asText()),
                        () -> assertEquals("2026-04-01", me.path("entry").path("confirmedAt").asText()),
                        () -> assertEquals("p-0a11ce", save.path("pseudonym").asText()),
                        () -> assertEquals("CONFIRMED", json(client.change("POST", DIRECTORY + "me/confirmation", null))
                                .path("outcome").asText()));
            }
        }
    }

    @Nested
    @DisplayName("the data files that mirror one another")
    class Mirrors {

        private static JsonNode data(String name) {
            try {
                return MockClient.MAPPER.readTree(ScenarioRegistry.readDataFile(CLASS_LOADER, name).orElseThrow());
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        private static Map<String, String> namesById(JsonNode entries) {
            Map<String, String> names = new LinkedHashMap<>();
            entries.forEach(entry -> names.put(entry.path("id").asText(), entry.path("name").asText()));
            return names;
        }

        @Test
        @DisplayName("the catalogs of the scenario are the ones the tests expect")
        void shouldNameTheFiveCatalogs() {
            assertEquals(COUNTS.keySet(), Set.copyOf(CATALOGS));
        }

        @Test
        @DisplayName("the list of a catalog names the same ids, names and retirements as the entries behind it")
        void shouldListWhatTheEntriesHold() {
            for (String catalog : CATALOGS) {
                var list = data("catalogs-" + catalog + ".json").path("entries");
                var entries = data("catalog-" + catalog + "-entries.json").path("entries");
                if ("service".equals(catalog)) {
                    // notification-gateway is created in the state service-created, so the baseline list lacks it
                    var created = data("catalogs-service-created.json").path("entries");
                    assertEquals(namesById(entries), namesById(created));
                    var withoutGateway = MockClient.MAPPER.createArrayNode();
                    entries.forEach(entry -> {
                        if (!"notification-gateway".equals(entry.path("id").asText())) {
                            withoutGateway.add(entry);
                        }
                    });
                    entries = withoutGateway;
                }
                var expected = entries;
                Map<String, Boolean> retiredByList = new LinkedHashMap<>();
                list.forEach(entry -> retiredByList.put(entry.path("id").asText(), entry.path("retired").asBoolean(false)));
                Map<String, Boolean> retiredByEntry = new LinkedHashMap<>();
                expected.forEach(entry -> retiredByEntry.put(entry.path("id").asText(), entry.path("retired").asBoolean(false)));
                assertAll(catalog,
                        () -> assertEquals(namesById(expected), namesById(list)),
                        () -> assertEquals(retiredByEntry, retiredByList));
            }
        }

        @Test
        @DisplayName("the service lists of service-created and service-retired are the baseline plus their one change")
        void shouldDeriveTheServiceStatesFromTheBaseline() {
            var baseline = data("catalogs-service.json").path("entries");
            var created = data("catalogs-service-created.json").path("entries");
            var retired = data("catalogs-service-retired.json").path("entries");
            var expectedCreated = new ArrayList<JsonNode>();
            baseline.forEach(expectedCreated::add);
            var withoutGateway = new ArrayList<JsonNode>();
            created.forEach(entry -> {
                if (!"notification-gateway".equals(entry.path("id").asText())) {
                    withoutGateway.add(entry);
                }
            });
            var expectedRetired = new ArrayList<JsonNode>();
            baseline.forEach(entry -> {
                var copy = entry.deepCopy();
                if ("customer-portal".equals(entry.path("id").asText())) {
                    ((ObjectNode) copy).put("retired", true);
                }
                expectedRetired.add(copy);
            });
            var actualRetired = new ArrayList<JsonNode>();
            retired.forEach(actualRetired::add);
            assertAll(
                    () -> assertEquals(expectedCreated, withoutGateway),
                    () -> assertEquals(expectedRetired, actualRetired));
        }

        @Test
        @DisplayName("the retired customer-portal reports the dependency graph of the entry it was before")
        void shouldKeepTheGraphOfTheRetiredService() {
            var retired = data("catalog-service-customer-portal-retired.json");
            JsonNode found = null;
            for (var entry : data("catalog-service-entries.json").path("entries")) {
                if ("customer-portal".equals(entry.path("id").asText())) {
                    found = entry;
                }
            }
            var before = found;
            var graph = before.path("effective").path("dependencies");
            Map<String, String> beforeRefs = new LinkedHashMap<>();
            graph.forEach(dependency -> beforeRefs.put(dependency.path("ref").asText(), dependency.path("via").asText()));
            Map<String, String> retiredRefs = new LinkedHashMap<>();
            retired.path("effective").path("dependencies")
                    .forEach(dependency -> retiredRefs.put(dependency.path("ref").asText(), dependency.path("via").asText()));
            assertAll(
                    () -> assertEquals(before.path("value").path("dependsOn"), retired.path("value").path("dependsOn")),
                    () -> assertEquals(beforeRefs, retiredRefs));
        }

        @Test
        @DisplayName("git-unavailable refuses every write of catalog-admin that reaches the Git server")
        void shouldRefuseEveryWriteWhileTheDirectoryIsDown() {
            var scenario = REGISTRY.resolve("catalog-admin").orElseThrow().scenario();
            var down = scenario.state("git-unavailable").orElseThrow().routes();
            List<String> missing = new ArrayList<>();
            scenario.routes().forEach((key, route) -> {
                // The import preview only reads the pasted file; it writes nothing.
                if (!key.startsWith("GET ") && !key.endsWith("/import/backstage/preview")) {
                    var refusal = down.get(key);
                    if (refusal == null || refusal.status() != 503) {
                        missing.add(key);
                    }
                }
            });
            assertEquals(List.of(), missing);
        }
    }

    @Test
    @DisplayName("answers the addresses of created entries and every linked address as canonical addresses")
    void shouldAnswerCanonicalAddresses() {
        var addresses = CanonicalAddresses.load(MockClient.MAPPER, CLASS_LOADER);
        try (var client = start("catalog-admin")) {
            for (String catalog : CATALOGS) {
                var address = json(client.change("POST", CATALOG + catalog, "{}")).path("address").asText();
                assertTrue(addresses.isCanonical(address), address);
            }
        }
        assertAll(
                () -> assertTrue(addresses.isCanonical("/directory/import")),
                () -> assertTrue(addresses.isCanonical("/directory/persons")),
                () -> assertTrue(addresses.isCanonical("/settings/profile")),
                () -> assertTrue(addresses.isCanonical("/catalogs/service/new")));
    }
}
