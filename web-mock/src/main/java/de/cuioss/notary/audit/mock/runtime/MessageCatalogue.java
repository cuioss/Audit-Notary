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
 * resources {@code META-INF/audit-notary/messages/messages_<lang>.properties} of the {@code web-app} JAR, plus the
 * fixture messages of the mock ({@code scenarios/messages/messages_<lang>.properties}, see {@link #FIXTURE_DIRECTORY}).
 */
public final class MessageCatalogue {

    /** The languages the catalogue holds. */
    public static final Set<String> LANGUAGES = Set.of("en", "de");

    /** The language of a request without {@code lang}. */
    public static final String DEFAULT_LANGUAGE = "en";

    private static final String RESOURCE = "META-INF/audit-notary/messages/messages_%s.properties";

    /** The directory of the optional fixture messages of the mock, on top of the web app catalogue. */
    public static final String FIXTURE_DIRECTORY = "scenarios/messages";

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
        return load(classLoader, FIXTURE_DIRECTORY);
    }

    /**
     * Reads both languages from the class path and merges the optional fixture messages on top: the class path
     * resources {@code <fixtureDirectory>/messages_<lang>.properties} (UTF-8), which hold the labels of the fixture
     * categories of the mock.
     *
     * @param classLoader      the class loader that holds the catalogue
     * @param fixtureDirectory the class path directory of the fixture messages
     * @return the catalogue
     * @throws IllegalStateException if a language file is missing, or a fixture key already exists in the web app
     *                               catalogue
     */
    public static MessageCatalogue load(ClassLoader classLoader, String fixtureDirectory) {
        Map<String, Map<String, String>> byLanguage = new TreeMap<>();
        for (String language : LANGUAGES) {
            String resource = RESOURCE.formatted(language);
            Map<String, String> messages = read(classLoader, resource).orElseThrow(() -> new IllegalStateException(
                    "Missing class path resource " + resource
                            + "; the audit-notary-web-app JAR must be on the class path"));
            String fixtureResource = fixtureDirectory + "/messages_" + language + ".properties";
            read(classLoader, fixtureResource).ifPresent(fixture -> fixture.forEach((key, value) -> {
                if (messages.putIfAbsent(key, value) != null) {
                    throw new IllegalStateException("The fixture message " + key + " of " + fixtureResource
                            + " already exists in the web app catalogue " + resource
                            + "; a fixture key must be new");
                }
            }));
            byLanguage.put(language, Collections.unmodifiableMap(messages));
        }
        return new MessageCatalogue(byLanguage);
    }

    private static Optional<Map<String, String>> read(ClassLoader classLoader, String resource) {
        try (InputStream in = classLoader.getResourceAsStream(resource)) {
            if (in == null) {
                return Optional.empty();
            }
            var properties = new Properties();
            properties.load(new InputStreamReader(in, StandardCharsets.UTF_8));
            Map<String, String> messages = new TreeMap<>();
            properties.stringPropertyNames().forEach(key -> messages.put(key, properties.getProperty(key)));
            return Optional.of(messages);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
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
