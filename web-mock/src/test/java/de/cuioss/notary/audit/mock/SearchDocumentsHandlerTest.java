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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static de.cuioss.notary.audit.mock.MockClient.json;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The search-documents handler, over a tiny index")
class SearchDocumentsHandlerTest {

    @TempDir
    Path directory;

    private MockClient client;

    @BeforeEach
    void startMock() throws IOException {
        Path scenario = directory.resolve("tiny.json");
        Files.writeString(scenario, """
                {"format_version": 1, "name": "tiny", "user": {"pseudonym": "p-1", "name": "Alex"},
                 "rights": [{"repository": "docs", "actions": ["read"]}, {"repository": "other", "actions": ["edit"]}],
                 "start": "ready",
                 "routes": {"GET /api/v1/search": {"handler": "search-documents", "data_file": "search-tiny-index.json"}},
                 "states": {"ready": {}}}
                """);
        client = MockClient.start(scenario.toString()).login();
    }

    @AfterEach
    void stopMock() {
        client.close();
    }

    private JsonNode search(String query) {
        return json(client.get("/api/v1/search?q=" + query));
    }

    private static List<String> titles(JsonNode answer) {
        List<String> titles = new ArrayList<>();
        answer.path("results").forEach(hit -> titles.add(hit.path("title").asText()));
        return titles;
    }

    @Test
    @DisplayName("answers at most 20 hits and says that it truncated")
    void shouldTruncateAtTwenty() {
        var answer = search("item");
        assertAll(
                () -> assertEquals(20, answer.path("results").size()),
                () -> assertTrue(answer.path("truncated").asBoolean()),
                () -> assertEquals("item", answer.path("query").asText()));
    }

    @Test
    @DisplayName("orders by title regardless of case")
    void shouldOrderByTitleIgnoringCase() {
        assertEquals(List.of("ZZ-a", "zz-b", "zz-C"), titles(search("zz")));
    }

    @Test
    @DisplayName("matches the id as well as the title, in any case")
    void shouldMatchTheId() {
        var answer = search("QX-7");
        assertAll(
                () -> assertEquals(List.of("Zebra"), titles(answer)),
                () -> assertFalse(answer.path("truncated").asBoolean()),
                () -> assertEquals("QX-7", answer.path("query").asText()));
    }

    @Test
    @DisplayName("leaves out the repositories the rights grant no read on")
    void shouldLeaveOutRepositoriesWithoutRead() {
        assertAll(
                () -> assertEquals(List.of(), titles(search("hidden"))),
                () -> assertEquals(List.of("Item 01"), titles(search("item%2001"))));
    }

    @Test
    @DisplayName("applies the rules of the query in order: REQUIRED, MIN_LENGTH, MAX_LENGTH")
    void shouldCheckTheQuery() {
        var missing = json(client.get("/api/v1/search"));
        var blank = json(client.get("/api/v1/search?q="));
        var one = json(client.get("/api/v1/search?q=%20x%20"));
        var tooLong = json(client.get("/api/v1/search?q=" + "x".repeat(201)));
        assertAll(
                () -> assertEquals("REQUIRED", missing.path("errors").get(0).path("code").asText()),
                () -> assertEquals("MIN_LENGTH", blank.path("errors").get(0).path("code").asText()),
                () -> assertEquals("MIN_LENGTH", one.path("errors").get(0).path("code").asText()),
                () -> assertEquals("MAX_LENGTH", tooLong.path("errors").get(0).path("code").asText()),
                () -> assertEquals("/q", tooLong.path("errors").get(0).path("pointer").asText()));
    }
}
