/*
 * Copyright © 2026-present CUI-OpenSource-Software (info@cuioss.de)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package de.cuioss.notary.audit.integration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The web app served by the native image (AUN-WEB-1, AUN-WEB-3, AUN-WEB-8)")
class WebAppServingIT {

    @ParameterizedTest
    @ValueSource(strings = {"/", "/samm/payments/2026-q4/sm", "/incidents/2026/inc-0007/release", "/no/such/view/x"})
    @DisplayName("every address answers the start page with the page security headers")
    void appPage(String address) {
        var page = Stack.request().accept("text/html").get(Stack.BASE + address);

        assertEquals(200, page.statusCode());
        assertTrue(page.asString().contains("/theme-init.js"));
        var policy = page.header("Content-Security-Policy");
        assertTrue(policy.contains("script-src 'self' 'sha256-"), policy);
        assertTrue(policy.contains("frame-ancestors 'none'"), policy);
        assertFalse(policy.contains("unsafe-inline"), policy);
        assertEquals("nosniff", page.header("X-Content-Type-Options"));
        assertEquals("no-referrer", page.header("Referrer-Policy"));
    }

    @ParameterizedTest
    @CsvSource({"/theme-init.js,javascript,audit_notary_theme", "/brand-mark.svg,image/svg+xml,<svg",
            "/fonts/InterVariable.woff2,font/woff2,wOF2"})
    @DisplayName("the files of the web app come from the application itself, not the start-page fallback")
    void files(String path, String mediaType, String signature) {
        var file = Stack.request().get(Stack.BASE + path);

        assertEquals(200, file.statusCode());
        assertTrue(file.contentType().contains(mediaType), path + ": " + file.contentType());
        var head = new String(file.asByteArray(), 0, Math.min(file.asByteArray().length, 4096), StandardCharsets.ISO_8859_1);
        assertTrue(head.contains(signature), path + " does not start like the file it names");
        assertFalse(head.contains("<!doctype html") || head.contains("<!DOCTYPE html"), path + " answered the start page");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/messages?lang=en", "/api/v1/messages?lang=de"})
    @DisplayName("the catalogue answers both languages")
    void messages(String path) {
        var messages = Stack.request().get(Stack.BASE + path);
        assertEquals(200, messages.statusCode());
        assertEquals("Audit Notary", messages.jsonPath().getString("'brand.name'"));
    }
}
