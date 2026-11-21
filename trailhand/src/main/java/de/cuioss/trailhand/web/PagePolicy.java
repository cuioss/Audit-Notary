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

import jakarta.enterprise.context.ApplicationScoped;
import lombok.Getter;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * The page security of TRH-WEB-8: the Content Security Policy as a header, and the built {@code index.html} of the web
 * app, which every address of the app answers.
 * <p>
 * SvelteKit writes the policy with the hash of its bootstrap script into {@code index.html} as a {@code <meta>} tag;
 * the header repeats that policy and adds {@code frame-ancestors 'none'}, which a {@code <meta>} policy cannot carry.
 */
@ApplicationScoped
public class PagePolicy {

    /** The web app's start page in the {@code web-app} JAR. */
    public static final String INDEX_RESOURCE = "META-INF/resources/index.html";

    /** The policy when the page carries none (no built web app on the class path). */
    static final String FALLBACK_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; "
            + "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'";

    private static final Pattern META_POLICY = Pattern
            .compile("<meta http-equiv=\"content-security-policy\" content=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);

    /** The {@code Content-Security-Policy} header value. */
    @Getter
    private final String policy;

    /** The bytes of {@code index.html}; empty when the web app is not on the class path. */
    private final byte[] index;

    /**
     * Reads {@code index.html} from the class path.
     */
    public PagePolicy() {
        this(readIndex());
    }

    /**
     * @param index the bytes of {@code index.html}
     */
    PagePolicy(byte[] index) {
        this.index = index.clone();
        this.policy = headerPolicy(new String(index, StandardCharsets.UTF_8));
    }

    /**
     * @param html the start page
     * @return the policy of its {@code <meta>} tag with {@code frame-ancestors 'none'}
     */
    static String headerPolicy(String html) {
        var matcher = META_POLICY.matcher(html);
        var base = matcher.find() ? matcher.group(1) : FALLBACK_POLICY;
        return base + "; frame-ancestors 'none'";
    }

    /**
     * @return a copy of {@code index.html}
     */
    public byte[] index() {
        return index.clone();
    }

    /**
     * @return whether the web app is on the class path
     */
    public boolean hasIndex() {
        return index.length > 0;
    }

    private static byte[] readIndex() {
        try (InputStream in = PagePolicy.class.getClassLoader().getResourceAsStream(INDEX_RESOURCE)) {
            return in == null ? new byte[0] : in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
