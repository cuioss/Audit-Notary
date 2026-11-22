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
package de.cuioss.notary.audit.mock.runtime;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.Set;
import java.util.TreeMap;

/**
 * The message catalogue of the web app (doc/specification/web-app.adoc, AUN-WEB-7), read from the class path
 * resources {@code META-INF/audit-notary/messages/messages_<lang>.properties} of the {@code web-app} JAR.
 */
public final class MessageCatalogue {

    /** The languages the catalogue holds. */
    public static final Set<String> LANGUAGES = Set.of("en", "de");

    /** The language of a request without {@code lang}. */
    public static final String DEFAULT_LANGUAGE = "en";

    private static final String RESOURCE = "META-INF/audit-notary/messages/messages_%s.properties";

    private final Map<String, Map<String, String>> byLanguage;

    private MessageCatalogue(Map<String, Map<String, String>> byLanguage) {
        this.byLanguage = Map.copyOf(byLanguage);
    }

    /**
     * Reads both languages from the class path.
     *
     * @param classLoader the class loader that holds the catalogue
     * @return the catalogue
     * @throws IllegalStateException if a language file is missing
     */
    public static MessageCatalogue load(ClassLoader classLoader) {
        Map<String, Map<String, String>> byLanguage = new TreeMap<>();
        for (String language : LANGUAGES) {
            String resource = RESOURCE.formatted(language);
            try (InputStream in = classLoader.getResourceAsStream(resource)) {
                if (in == null) {
                    throw new IllegalStateException("Missing class path resource " + resource
                            + "; the audit-notary-web-app JAR must be on the class path");
                }
                var properties = new Properties();
                properties.load(new InputStreamReader(in, StandardCharsets.UTF_8));
                Map<String, String> messages = new TreeMap<>();
                properties.stringPropertyNames().forEach(key -> messages.put(key, properties.getProperty(key)));
                byLanguage.put(language, Collections.unmodifiableMap(messages));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return new MessageCatalogue(byLanguage);
    }

    /**
     * The messages of a language.
     *
     * @param language {@code en} or {@code de}
     * @return the messages by key, or empty for another language
     */
    public Optional<Map<String, String>> messages(String language) {
        return Optional.ofNullable(byLanguage.get(language));
    }
}
