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
package de.cuioss.trailhand.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@DisplayName("PagePolicy: the policy header from the page's <meta> (TRH-WEB-8)")
class PagePolicyTest {

    @Test
    @DisplayName("repeats the page's policy and adds frame-ancestors")
    void fromMeta() {
        var html = "<meta http-equiv=\"content-security-policy\" content=\"default-src 'self'; script-src 'self' 'sha256-abc'\">";

        var policy = new PagePolicy(html.getBytes(StandardCharsets.UTF_8));

        assertEquals("default-src 'self'; script-src 'self' 'sha256-abc'; frame-ancestors 'none'", policy.getPolicy());
    }

    @Test
    @DisplayName("falls back to the strict policy without a page")
    void fallback() {
        var policy = new PagePolicy(new byte[0]);

        assertFalse(policy.hasIndex());
        assertEquals(PagePolicy.FALLBACK_POLICY + "; frame-ancestors 'none'", policy.getPolicy());
        assertEquals("&lt;a href=&quot;x&quot;&gt;&amp;&#39;", AuthResource.escape("<a href=\"x\">&'"));
    }
}
