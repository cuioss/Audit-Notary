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
package de.cuioss.notary.audit.web;

import jakarta.enterprise.context.ApplicationScoped;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * The message catalogue of AUN-WEB-7, read from {@code META-INF/audit-notary/messages/messages_<lang>.properties} of the
 * {@code web-app} JAR (UTF-8). The languages are the catalogue files: a language is served when its file exists, so a
 * new language needs no list here. Each file is read once.
 */
@ApplicationScoped
public class MessageCatalogue {

    private static final String LOCATION = "META-INF/audit-notary/messages/messages_%s.properties";
    /** A language code as the catalogue files name it; anything else is never looked up. */
    private static final Pattern LANGUAGE = Pattern.compile("[a-z]{2}");
    private static final String ENGLISH = "en";

    private final Map<String, Optional<Map<String, String>>> catalogues = new ConcurrentHashMap<>();

    /**
     * @param language a language code, such as {@code en} or {@code de}
     * @return the catalogue, or empty when no catalogue file exists for the language
     */
    public Optional<Map<String, String>> catalogue(String language) {
        if (!LANGUAGE.matcher(language).matches()) {
            return Optional.empty();
        }
        return catalogues.computeIfAbsent(language, MessageCatalogue::read);
    }

    /**
     * @param key a message key
     * @return the English text, or the key when the catalogue lacks it
     */
    public String english(String key) {
        return catalogue(ENGLISH).map(messages -> messages.getOrDefault(key, key)).orElse(key);
    }

    private static Optional<Map<String, String>> read(String language) {
        var resource = LOCATION.formatted(language);
        try (InputStream in = MessageCatalogue.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                return Optional.empty();
            }
            var properties = new Properties();
            properties.load(new InputStreamReader(in, StandardCharsets.UTF_8));
            var result = new TreeMap<String, String>();
            properties.stringPropertyNames().forEach(key -> result.put(key, properties.getProperty(key)));
            return Optional.of(Map.copyOf(result));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
