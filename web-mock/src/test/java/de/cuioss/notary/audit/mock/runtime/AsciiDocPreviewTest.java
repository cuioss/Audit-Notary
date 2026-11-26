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
package de.cuioss.notary.audit.mock.runtime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("The render-asciidoc handler's renderer")
class AsciiDocPreviewTest {

    @Test
    @DisplayName("renders the example of the contract")
    void shouldRenderTheExample() {
        assertEquals("<h2>Decision</h2><div><p>We <strong>agree</strong> to rotate the keys, see "
                + "<code>ops/keys</code>.</p></div>",
                AsciiDocPreview.render("== Decision\n\nWe *agree* to rotate the keys, see `ops/keys`."));
    }

    @ParameterizedTest
    @CsvSource({"'==', 2", "'===', 3", "'====', 4", "'=====', 5", "'======', 6"})
    @DisplayName("maps the number of equals signs to the heading level h2 to h6")
    void shouldRenderHeadings(String marks, int level) {
        assertEquals("<h" + level + ">Title</h" + level + ">", AsciiDocPreview.render(marks + " Title"));
    }

    @Test
    @DisplayName("keeps a single equals sign, seven equals signs and a heading of several lines as paragraphs")
    void shouldNotRenderOtherHeadings() {
        assertEquals("<div><p>= One</p></div><div><p>======= Seven</p></div><div><p>== A<br>B</p></div>",
                AsciiDocPreview.render("= One\n\n======= Seven\n\n== A\nB"));
    }

    @Test
    @DisplayName("renders a block of star lines as a list with inline marks")
    void shouldRenderLists() {
        assertEquals("<ul><li>quarterly</li><li>before <em>every</em> release</li></ul>",
                AsciiDocPreview.render("* quarterly\n* before _every_ release"));
    }

    @Test
    @DisplayName("renders a block that is only partly a list as a paragraph")
    void shouldRenderAMixedBlockAsParagraph() {
        assertEquals("<div><p>* one<br>two</p></div>", AsciiDocPreview.render("* one\ntwo"));
    }

    @Test
    @DisplayName("joins the lines of a paragraph with br and separates blocks by blank lines, also with CRLF")
    void shouldJoinLines() {
        assertEquals("<div><p>a<br>b</p></div><div><p>c</p></div>", AsciiDocPreview.render("a\r\nb\r\n\r\n  \r\nc"));
    }

    @Test
    @DisplayName("escapes the whole source before it marks anything up")
    void shouldEscape() {
        assertEquals("<div><p>&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt; &amp; <strong>&lt;b&gt;</strong></p></div>",
                AsciiDocPreview.render("<img src=\"x\" onerror='y'> & *<b>*"));
    }

    @Test
    @DisplayName("does not nest the inline marks, and leaves a lone mark as it is")
    void shouldNotNest() {
        assertEquals("<div><p><code>a*b*c</code> and 2 * 3 and <em>x</em></p></div>",
                AsciiDocPreview.render("`a*b*c` and 2 * 3 and _x_"));
    }

    @Test
    @DisplayName("renders an empty or blank source as nothing")
    void shouldRenderNothing() {
        assertEquals("", AsciiDocPreview.render(""));
        assertEquals("", AsciiDocPreview.render("  \n\n \n"));
    }
}
