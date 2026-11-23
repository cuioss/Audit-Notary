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
package de.cuioss.notary.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.sheriff.token.client.discovery.ProviderMetadata;
import io.smallrye.config.PropertiesConfigSource;
import io.smallrye.config.SmallRyeConfigBuilder;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.net.URISyntaxException;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The native-image registrations name exactly the classes of the resolved dependencies that need them (AUN-OPS-1),
 * so a dependency update that adds or removes one fails here and not only in the native image.
 */
@DisplayName("Native-image registrations follow the resolved dependencies")
class NativeRegistrationTest {

    private static final Pattern CONVERTER = Pattern.compile("(.*/)_([^/]+)_DslJsonConverter\\.class");
    private static final String JGIT_TEXT = "org.eclipse.jgit.internal.JGitText";
    private static final String TOKEN_CLIENT_REFLECT_CONFIG =
            "META-INF/native-image/de.cuioss.sheriff.token/token-sheriff-client/reflect-config.json";

    @Test
    @DisplayName("Token Sheriff's client registers every DSL-JSON converter and its response type itself (CLIENT-26)")
    void tokenClientConverters() throws Exception {
        var expected = new TreeSet<String>();
        Set<String> registered;
        try (var jar = jarOf(ProviderMetadata.class)) {
            jar.stream().map(JarEntry::getName).map(CONVERTER::matcher).filter(Matcher::matches)
                    .forEach(match -> {
                        var packageName = match.group(1).replace('/', '.');
                        expected.add(packageName + "_" + match.group(2) + "_DslJsonConverter");
                        expected.add(packageName + match.group(2));
                    });
            var entry = jar.getJarEntry(TOKEN_CLIENT_REFLECT_CONFIG);
            assertNotNull(entry, "the client JAR ships its reflect-config.json");
            try (InputStream in = jar.getInputStream(entry)) {
                registered = names(in);
            }
        }

        assertTrue(expected.size() > 1, "the client JAR holds converters");
        assertTrue(registered.containsAll(expected), "not registered by the client: " + difference(expected, registered));
    }

    @Test
    @DisplayName("every enum of the JGit JAR and its message bundle are registered for reflection")
    void jgitEnums() throws Exception {
        var expected = new TreeSet<String>();
        var loader = getClass().getClassLoader();
        try (var jar = jarOf(Class.forName(JGIT_TEXT, false, loader))) {
            for (String name : jar.stream().map(JarEntry::getName).filter(entry -> entry.endsWith(".class"))
                    .map(entry -> entry.substring(0, entry.length() - ".class".length()).replace('/', '.')).toList()) {
                if (isEnum(name, loader)) {
                    expected.add(name);
                }
            }
        }
        expected.add(JGIT_TEXT);

        assertTrue(expected.size() > 1, "the JGit JAR holds enums");
        assertEquals(expected, reflectConfigNames());
    }

    @Test
    @DisplayName("the native build arguments keep the comma inside --enable-url-protocols")
    void buildArguments() throws Exception {
        var properties = NativeRegistrationTest.class.getClassLoader().getResource("application.properties");
        assertNotNull(properties, "application.properties is on the class path");
        var config = new SmallRyeConfigBuilder().withSources(new PropertiesConfigSource(properties)).build();

        var arguments = config.getValues("quarkus.native.additional-build-args", String.class);

        assertTrue(arguments.contains("--enable-url-protocols=https,http"), arguments.toString());
        assertTrue(arguments.contains("--initialize-at-run-time=org.eclipse.jgit"), arguments.toString());
        assertTrue(arguments.stream().noneMatch("http"::equals), arguments.toString());
    }

    private static boolean isEnum(String name, ClassLoader loader) {
        try {
            return Class.forName(name, false, loader).isEnum();
        } catch (ClassNotFoundException | LinkageError e) {
            // A class whose optional dependency is absent cannot be an enum JGit reads at run time here.
            return false;
        }
    }

    private static Set<String> reflectConfigNames() throws IOException {
        try (InputStream in = NativeRegistrationTest.class.getClassLoader()
                     .getResourceAsStream("META-INF/native-image/de.cuioss.notary.audit/audit-notary/reflect-config.json")) {
            assertNotNull(in, "reflect-config.json is on the class path");
            return names(in);
        }
    }

    private static Set<String> names(InputStream reflectConfig) throws IOException {
        var names = new TreeSet<String>();
        new ObjectMapper().readTree(reflectConfig).forEach(entry -> names.add(entry.get("name").asText()));
        return names;
    }

    private static Set<String> difference(Set<String> expected, Set<String> registered) {
        var missing = new TreeSet<>(expected);
        missing.removeAll(registered);
        return missing;
    }

    private static JarFile jarOf(Class<?> type) throws IOException, URISyntaxException {
        return new JarFile(Path.of(type.getProtectionDomain().getCodeSource().getLocation().toURI()).toFile());
    }
}
