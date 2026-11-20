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

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.TreeMap;

/**
 * The message catalogue of TRH-WEB-7, read once from {@code META-INF/trailhand/messages/messages_<lang>.properties} of
 * the {@code web-app} JAR (UTF-8).
 */
@ApplicationScoped
public class MessageCatalogue {

    private static final String LOCATION = "META-INF/trailhand/messages/messages_%s.properties";

    private final Map<String, Map<String, String>> catalogues = new TreeMap<>();

    /** Reads English and German. */
    public MessageCatalogue() {
        for (String language : new String[]{"en", "de"}) {
            catalogues.put(language, read(language));
        }
    }

    /**
     * @param language {@code en} or {@code de}
     * @return the catalogue, or empty for another language
     */
    public Optional<Map<String, String>> catalogue(String language) {
        return Optional.ofNullable(catalogues.get(language));
    }

    /**
     * @param key a message key
     * @return the English text, or the key when the catalogue lacks it
     */
    public String english(String key) {
        return catalogues.get("en").getOrDefault(key, key);
    }

    private static Map<String, String> read(String language) {
        var resource = LOCATION.formatted(language);
        try (InputStream in = MessageCatalogue.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                return Map.of();
            }
            var properties = new Properties();
            properties.load(new InputStreamReader(in, StandardCharsets.UTF_8));
            var result = new TreeMap<String, String>();
            properties.stringPropertyNames().forEach(key -> result.put(key, properties.getProperty(key)));
            return Map.copyOf(result);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
