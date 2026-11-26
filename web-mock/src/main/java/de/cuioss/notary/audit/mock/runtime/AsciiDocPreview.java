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

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The deliberately tiny, deterministic renderer behind the built-in handler {@code render-asciidoc}
 * (doc/specification/rest-api.adoc, <em>Form Kit Requests</em>). It is a mock, not Asciidoctor: the whole source is
 * HTML-escaped first, so a script in the source cannot survive; the answer shows that the preview follows the source.
 * <ul>
 * <li>blocks are separated by blank lines;</li>
 * <li>a block whose every line starts with {@code "* "} is a list, one item per line;</li>
 * <li>a block of one line that starts with {@code "== "} to {@code "====== "} is the heading {@code h2} to
 * {@code h6};</li>
 * <li>every other block is {@code <div><p>} with its lines joined by {@code <br>};</li>
 * <li>inside a block, {@code *x*} is strong, {@code _x_} emphasis and {@code `x`} code; non-greedy, not nested.</li>
 * </ul>
 */
final class AsciiDocPreview {

    /** The longest source the handler renders, in bytes of UTF-8. */
    static final int LIMIT_BYTES = 65_536;

    private static final Pattern BLANK_LINES = Pattern.compile("\n\\s*\n");
    private static final Pattern HEADING = Pattern.compile("(={2,6}) (.*)");
    private static final Pattern INLINE = Pattern.compile("\\*([^*]+?)\\*|_([^_]+?)_|`([^`]+?)`");
    private static final String ITEM = "* ";

    private AsciiDocPreview() {
    }

    /**
     * Renders a source.
     *
     * @param source the AsciiDoc source
     * @return the HTML; empty for an empty source
     */
    static String render(String source) {
        var html = new StringBuilder();
        String text = MockEngine.escapeHtml(source).replace("\r\n", "\n").replace('\r', '\n').strip();
        for (String block : BLANK_LINES.split(text)) {
            if (!block.isBlank()) {
                html.append(renderBlock(block.lines().toList()));
            }
        }
        return html.toString();
    }

    private static String renderBlock(List<String> lines) {
        if (lines.stream().allMatch(line -> line.startsWith(ITEM))) {
            var list = new StringBuilder("<ul>");
            lines.forEach(line -> list.append("<li>").append(inline(line.substring(ITEM.length()))).append("</li>"));
            return list.append("</ul>").toString();
        }
        var heading = lines.size() == 1 ? HEADING.matcher(lines.get(0)) : null;
        if (heading != null && heading.matches()) {
            int level = heading.group(1).length();
            return "<h" + level + ">" + inline(heading.group(2)) + "</h" + level + ">";
        }
        List<String> rendered = new ArrayList<>();
        lines.forEach(line -> rendered.add(inline(line)));
        return "<div><p>" + String.join("<br>", rendered) + "</p></div>";
    }

    private static String inline(String text) {
        return INLINE.matcher(text).replaceAll(match -> {
            String tag;
            String inner;
            if (match.group(1) != null) {
                tag = "strong";
                inner = match.group(1);
            } else if (match.group(2) != null) {
                tag = "em";
                inner = match.group(2);
            } else {
                tag = "code";
                inner = match.group(3);
            }
            return Matcher.quoteReplacement("<" + tag + ">" + inner + "</" + tag + ">");
        });
    }
}
