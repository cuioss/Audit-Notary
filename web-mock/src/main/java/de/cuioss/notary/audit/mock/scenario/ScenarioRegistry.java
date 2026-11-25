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
package de.cuioss.notary.audit.mock.scenario;

import org.jspecify.annotations.Nullable;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Resolves scenario references.
 * <p>
 * A reference is a name ({@code workshop}), a name with a state ({@code workshop#saved-by-other}), or the path of a
 * JSON file, optionally with a state ({@code ./my-profile.json#ready}). A name is looked up as the class path
 * resource {@code scenarios/<name>.json}, so a test module can add its own profiles under
 * {@code src/test/resources/scenarios/}. The primary profiles are listed in {@value #PRIMARY_LIST}.
 */
public final class ScenarioRegistry {

    /** The class path folder of the scenario files. */
    public static final String FOLDER = "scenarios/";

    /** The class path folder of the data files a {@code body_file} names. */
    public static final String DATA_FOLDER = FOLDER + "data/";

    /** The class path resource that lists the primary profiles, one name per line. */
    public static final String PRIMARY_LIST = FOLDER + "primary.txt";

    private static final Pattern NAME = Pattern.compile("[a-z0-9][a-z0-9-]*");

    private final ScenarioLoader loader;
    private final ClassLoader classLoader;

    /**
     * Creates a registry.
     *
     * @param loader      the loader that checks every file
     * @param classLoader the class loader that holds the scenario resources
     */
    public ScenarioRegistry(ScenarioLoader loader, ClassLoader classLoader) {
        this.loader = loader;
        this.classLoader = classLoader;
    }

    /**
     * Resolves the data file a {@code body_file} names, below {@value #DATA_FOLDER}; the loader validated the name.
     *
     * @param classLoader the class loader that holds the scenario resources
     * @param name        the file name
     * @return its text, or empty when the class path holds no such file
     */
    public static Optional<String> readDataFile(ClassLoader classLoader, String name) {
        return readResource(classLoader, DATA_FOLDER + name);
    }

    /**
     * Resolves a reference.
     *
     * @param reference a name, a file path, each optionally followed by {@code #state}
     * @return the scenario and its start state, or empty when no scenario of that name or path exists
     * @throws ScenarioValidationException if the file breaks a rule of the format or the state is unknown
     */
    public Optional<ScenarioReference> resolve(String reference) {
        int hash = reference.indexOf('#');
        String target = hash < 0 ? reference : reference.substring(0, hash);
        @Nullable String state = hash < 0 ? null : reference.substring(hash + 1);
        var scenario = load(target.trim());
        if (scenario.isEmpty()) {
            return Optional.empty();
        }
        var found = scenario.get();
        String start = state == null || state.isBlank() ? found.start() : state.trim();
        if (found.state(start).isEmpty()) {
            throw new ScenarioValidationException(reference, "#" + start, "names no state of " + found.name());
        }
        return Optional.of(new ScenarioReference(found, start));
    }

    /**
     * The names of the primary profiles, in the order of {@value #PRIMARY_LIST}.
     *
     * @return the names; blank lines and lines starting with {@code #} are skipped
     */
    public List<String> primaryNames() {
        return readResource(PRIMARY_LIST).map(text -> text.lines().map(String::strip)
                .filter(line -> !line.isEmpty() && !line.startsWith("#")).toList()).orElse(List.of());
    }

    private Optional<Scenario> load(String target) {
        if (NAME.matcher(target).matches()) {
            String resource = FOLDER + target + ".json";
            return readResource(resource).map(text -> loader.parse(resource, text));
        }
        var file = Path.of(target);
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return Optional.of(loader.parse(file.toString(), Files.readString(file)));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private Optional<String> readResource(String resource) {
        return readResource(classLoader, resource);
    }

    private static Optional<String> readResource(ClassLoader classLoader, String resource) {
        try (InputStream in = classLoader.getResourceAsStream(resource)) {
            if (in == null) {
                return Optional.empty();
            }
            return Optional.of(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
