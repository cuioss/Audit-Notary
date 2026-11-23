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
package de.cuioss.notary.audit.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@DisplayName("PagePolicy: the policy header from the page's <meta> (AUN-WEB-8)")
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
