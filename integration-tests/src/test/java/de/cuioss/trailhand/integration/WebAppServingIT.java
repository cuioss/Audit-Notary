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
package de.cuioss.trailhand.integration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The web app served by the native image (TRH-WEB-1, TRH-WEB-3, TRH-WEB-8)")
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
    @ValueSource(strings = {"/theme-init.js", "/fonts/InterVariable.woff2", "/brand-mark.svg"})
    @DisplayName("the files of the web app come from the application itself")
    void files(String path) {
        assertEquals(200, Stack.request().get(Stack.BASE + path).statusCode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/messages?lang=en", "/api/v1/messages?lang=de"})
    @DisplayName("the catalogue answers both languages")
    void messages(String path) {
        var messages = Stack.request().get(Stack.BASE + path);
        assertEquals(200, messages.statusCode());
        assertEquals("TrailHand", messages.jsonPath().getString("'brand.name'"));
    }
}
