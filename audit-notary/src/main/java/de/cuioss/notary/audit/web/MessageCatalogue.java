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
