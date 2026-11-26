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

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The catalog-entry handler, over a tiny data file")
class CatalogEntryHandlerTest {

    private static final String ENTRY = "/api/v1/catalogs/service/";

    @TempDir
    Path directory;

    private MockClient client;

    @BeforeEach
    void startMock() throws IOException {
        Path scenario = directory.resolve("tiny.json");
        Files.writeString(scenario, """
                {"format_version": 1, "name": "tiny", "user": {"pseudonym": "p-1", "name": "Alex"},
                 "rights": [{"repository": "directory", "actions": ["read"]}],
                 "start": "ready",
                 "routes": {
                   "GET /api/v1/catalogs/service/{id}": {"handler": "catalog-entry", "data_file": "catalog-tiny-entries.json"},
                   "PUT /api/v1/catalogs/service/{id}": {"handler": "catalog-entry", "data_file": "catalog-tiny-entries.json"},
                   "POST /api/v1/catalogs/service/{id}/retirement": {"handler": "catalog-entry",
                                                                      "data_file": "catalog-tiny-entries.json"},
                   "GET /api/v1/catalogs/service/schema": {"body": {"which": "schema"}}},
                 "states": {"ready": {}}}
                """);
        client = MockClient.start(scenario.toString()).login();
    }

    @AfterEach
    void stopMock() {
        client.close();
    }

    @Test
    @DisplayName("reads an entry as the file holds it: catalog, id, name, retired, value, effective, at and history")
    void shouldReadAnEntry() {
        var response = client.get(ENTRY + "alpha");
        var entry = json(response);
        assertAll(
                () -> assertEquals(200, response.statusCode()),
                () -> assertEquals("service", entry.path("catalog").asText()),
                () -> assertEquals("alpha", entry.path("id").asText()),
                () -> assertEquals("Alpha", entry.path("name").asText()),
                () -> assertEquals(false, entry.path("retired").asBoolean(true)),
                () -> assertEquals("alpha", entry.path("value").path("id").asText()),
                () -> assertTrue(entry.path("effective").isNull()),
                () -> assertEquals("2026-01-01T00:00:00Z", entry.path("at").asText()),
                () -> assertEquals("create", entry.path("history").get(0).path("kind").asText()));
    }

    @Test
    @DisplayName("reads a retired entry as retired, with its effective member")
    void shouldReadARetiredEntry() {
        var entry = json(client.get(ENTRY + "beta"));
        assertAll(
                () -> assertTrue(entry.path("retired").asBoolean()),
                () -> assertTrue(entry.path("effective").has("cycle")));
    }

    @Test
    @DisplayName("answers an unknown id with 404 NOT_FOUND on every request it serves")
    void shouldAnswerAnUnknownIdWithNotFound() {
        var read = client.get(ENTRY + "gamma");
        var save = client.change("PUT", ENTRY + "gamma", "{}");
        var retire = client.change("POST", ENTRY + "gamma/retirement", null);
        assertAll(
                () -> assertEquals(404, read.statusCode()),
                () -> assertEquals("NOT_FOUND", json(read).path("outcome").asText()),
                () -> assertEquals(404, save.statusCode()),
                () -> assertEquals("NOT_FOUND", json(save).path("outcome").asText()),
                () -> assertEquals(404, retire.statusCode()),
                () -> assertEquals("NOT_FOUND", json(retire).path("outcome").asText()));
    }

    @Test
    @DisplayName("answers a save with SAVED, catalog, id and the time of the mock")
    void shouldAnswerASave() {
        var response = client.change("PUT", ENTRY + "alpha", "{\"id\":\"alpha\",\"name\":\"Alpha\"}");
        var body = json(response);
        assertAll(
                () -> assertEquals(200, response.statusCode()),
                () -> assertEquals("SAVED", body.path("outcome").asText()),
                () -> assertEquals("service", body.path("catalog").asText()),
                () -> assertEquals("alpha", body.path("id").asText()),
                () -> assertEquals("2026-11-26T09:30:00Z", body.path("at").asText()));
    }

    @Test
    @DisplayName("refuses the save of a retired entry with 409 RETIRED")
    void shouldRefuseTheSaveOfARetiredEntry() {
        var response = client.change("PUT", ENTRY + "beta", "{}");
        assertAll(
                () -> assertEquals(409, response.statusCode()),
                () -> assertEquals("RETIRED", json(response).path("outcome").asText()));
    }

    @Test
    @DisplayName("answers a retirement with RETIRED, also for an entry that is retired")
    void shouldAnswerARetirement() {
        var alpha = json(client.change("POST", ENTRY + "alpha/retirement", null));
        var beta = client.change("POST", ENTRY + "beta/retirement", null);
        assertAll(
                () -> assertEquals("RETIRED", alpha.path("outcome").asText()),
                () -> assertEquals("service", alpha.path("catalog").asText()),
                () -> assertEquals("alpha", alpha.path("id").asText()),
                () -> assertEquals("2026-11-26T09:35:00Z", alpha.path("at").asText()),
                () -> assertEquals(200, beta.statusCode()),
                () -> assertEquals("RETIRED", json(beta).path("outcome").asText()));
    }

    @Test
    @DisplayName("lets an exact route win over the template, so schema is no entry id")
    void shouldLetTheExactRouteWin() {
        assertEquals("schema", json(client.get(ENTRY + "schema")).path("which").asText());
    }

    @Test
    @DisplayName("records the retirement as sent, with the id in the path")
    void shouldRecordTheRetirementAsAnAct() {
        client.change("POST", ENTRY + "alpha/retirement", null);
        var acts = json(client.get("/mock/acts"));
        assertAll(
                () -> assertEquals(1, acts.size()),
                () -> assertEquals(ENTRY + "alpha/retirement", acts.get(0).path("path").asText()),
                () -> assertEquals("POST", acts.get(0).path("method").asText()));
    }
}
