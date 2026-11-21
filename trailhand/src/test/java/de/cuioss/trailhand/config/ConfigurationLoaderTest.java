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
package de.cuioss.trailhand.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import de.cuioss.test.juli.LogAsserts;
import de.cuioss.test.juli.TestLogLevel;
import de.cuioss.test.juli.junit5.EnableTestLogger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Period;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableTestLogger
@DisplayName("ConfigurationLoader: trailhand.yaml and the boot rules (TRH-CONF-1, TRH-CONF-2)")
class ConfigurationLoaderTest {

    private static final String VALID = """
            repositories:
              - alias: samm-assessments
                remote: https://git.example.org/security/samm.git
                confidentiality: restricted
                retention: P10Y
                credential-ref: file:/run/secrets/git/token
              - alias: directory
                remote: file:/srv/git/directory.git
                confidentiality: strongly-restricted
                retention: unlimited
            rights:
              assessors:
                - repository: samm-assessments
                  actions: [read, edit]
              catalog-admins:
                - repository: directory
                  actions: [administer-catalogs]
            oidc:
              issuer: ${IDP_ISSUER:-https://idp.example.org/realms/trailhand}
              client-id: ${CLIENT_ID}
              client-credential-ref: file:/run/secrets/oidc/client-secret
            web:
              origin: https://trailhand.example.org
            """;

    private final ConfigurationLoader loader = new ConfigurationLoader(Map.of("CLIENT_ID", "trailhand-web")::get);

    private static Object yaml(String text) throws IOException {
        return new ObjectMapper(new YAMLFactory()).readValue(text, Object.class);
    }

    private ConfigurationResult validate(String text) throws IOException {
        return loader.validate(yaml(text));
    }

    private static boolean hasViolation(ConfigurationResult result, String key) {
        return result.violations().stream().anyMatch(violation -> violation.key().equals(key));
    }

    @Test
    @DisplayName("reads a valid configuration with placeholders and defaults")
    void valid() throws Exception {
        var result = validate(VALID);

        assertTrue(result.isValid(), result.violations().toString());
        var configuration = result.configuration();
        assertNotNull(configuration);
        assertEquals(2, configuration.repositories().size());
        assertEquals(Period.ofYears(10), configuration.repositories().getFirst().retention());
        assertNull(configuration.repositories().get(1).retention());
        assertTrue(configuration.repositories().get(1).isLocal());
        assertEquals("https://idp.example.org/realms/trailhand", configuration.oidc().issuer());
        assertEquals("trailhand-web", configuration.oidc().clientId());
        assertEquals("groups", configuration.oidc().groupsClaim());
        assertEquals(Duration.ofMinutes(30), configuration.web().idleTimeout());
        assertEquals(Duration.ofHours(8), configuration.web().maxLifetime());
        assertEquals("https://trailhand.example.org", configuration.web().originHeaderValue());
        assertEquals(Duration.ofMinutes(5), configuration.fetchInterval());
        assertEquals(Set.of(Action.ADMINISTER_CATALOGS),
                configuration.rights().get("catalog-admins").getFirst().actions());
    }

    @Test
    @DisplayName("writes the own origin as the browser sends it: lower case, without the default port")
    void originForm() throws Exception {
        var result = validate(VALID.replace("origin: https://trailhand.example.org",
                "origin: HTTPS://TrailHand.Example.org:443"));

        assertTrue(result.isValid(), result.violations().toString());
        assertEquals("https://trailhand.example.org", result.configuration().web().originHeaderValue());
        var custom = validate(VALID.replace("origin: https://trailhand.example.org", "origin: https://Example.org:8443"));
        assertEquals("https://example.org:8443", custom.configuration().web().originHeaderValue());
        var ipv6 = validate(VALID.replace("origin: https://trailhand.example.org",
                "origin: 'https://[0:0:0:0:0:0:0:1]:443'"));
        assertEquals("https://[::1]", ipv6.configuration().web().originHeaderValue());
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"[0:0:0:0:0:0:0:1],[::1]", "[2001:DB8:0:0:1:0:0:1],[2001:db8::1:0:0:1]",
            "[2001:db8:0:1:1:1:1:1],[2001:db8:0:1:1:1:1:1]", "[::],[::]", "[1:0:0:0:0:0:0:0],[1::]",
            "[0:0:1:0:0:0:2:3],[0:0:1::2:3]", "[::ffff:192.0.2.1],[::ffff:c000:201]", "Example.ORG,example.org",
            "192.0.2.1,192.0.2.1"})
    @DisplayName("writes a host as the browser serializes it (URL Standard, IPv6 serializer)")
    void browserHost(String host, String expected) {
        assertEquals(expected, WebSettings.browserHost(host));
    }

    @Test
    @DisplayName("an unresolved placeholder without default is a violation")
    void unresolvedPlaceholder() throws Exception {
        var result = new ConfigurationLoader(name -> null).validate(yaml(VALID));

        assertFalse(result.isValid());
        assertTrue(hasViolation(result, "${CLIENT_ID}"));
    }

    @Nested
    @DisplayName("refuses")
    class Refusals {

        @ParameterizedTest(name = "{0}")
        @CsvSource(delimiter = '|', value = {
                "an alias outside [a-z0-9-]|alias: samm-assessments|alias: Samm_Assessments|repositories[0].alias",
                "a second repository with one alias|alias: directory|alias: samm-assessments|repositories[1].alias",
                "an ssh remote|remote: https://git.example.org/security/samm.git|remote: ssh://git@x/y.git|repositories[0].remote",
                "an unknown confidentiality|confidentiality: restricted|confidentiality: secret|repositories[0].confidentiality",
                "a retention that is no period|retention: P10Y|retention: ten years|repositories[0].retention",
                "an https remote without credential|credential-ref: file:/run/secrets/git/token|credential-ref:|repositories[0].credential-ref",
                "a secret value instead of a reference|credential-ref: file:/run/secrets/git/token|credential-ref: hunter2|repositories[0].credential-ref",
                "a right on an unknown repository|- repository: samm-assessments|- repository: nowhere|rights.assessors[0].repository",
                "an unknown action|actions: [read, edit]|actions: [read, delete]|rights.assessors[0].actions",
                "an issuer that is no https URI|issuer: ${IDP_ISSUER:-https://idp.example.org/realms/trailhand}|issuer: http://idp|oidc.issuer",
                "an origin with a path|origin: https://trailhand.example.org|origin: https://trailhand.example.org/app|web.origin",
                "a vault reference before the Vault adapter|client-credential-ref: file:/run/secrets/oidc/client-secret|client-credential-ref: vault:secret/trailhand/oidc|oidc.client-credential-ref",
                "a placeholder that names no environment variable|client-id: ${CLIENT_ID}|client-id: ${client.id}|${client.id}"})
        void rule(String name, String original, String replacement, String key) throws Exception {
            assertTrue(VALID.contains(original), name);

            var result = validate(VALID.replace(original, replacement));

            assertFalse(result.isValid(), name);
            assertTrue(hasViolation(result, key), name + ": " + result.violations());
        }

        @Test
        @DisplayName("a document without the required sections, naming each")
        void missingSections() throws Exception {
            var result = validate("fetch:\n  interval: nonsense\n");

            assertFalse(result.isValid());
            for (String key : new String[]{"repositories", "rights", "oidc", "web", "fetch.interval"}) {
                assertTrue(hasViolation(result, key), key + ": " + result.violations());
            }
        }

        @Test
        @DisplayName("an idle timeout longer than the session lifetime")
        void idleLongerThanLifetime() throws Exception {
            var result = validate(VALID + "  session:\n    idle-timeout: PT9H\n    max-lifetime: PT8H\n");

            assertTrue(hasViolation(result, "web.session.idle-timeout"));
        }

        @Test
        @DisplayName("a document that is no mapping")
        void noMapping() throws Exception {
            assertFalse(validate("- just\n- a list\n").isValid());
            assertFalse(loader.validate(null).isValid());
        }
    }

    @Nested
    @DisplayName("loads from a directory")
    class Loading {

        @Test
        @DisplayName("and logs one ERROR record per violation")
        void logsViolations(@TempDir Path directory) throws Exception {
            Files.writeString(directory.resolve(ConfigurationLoader.FILE_NAME), "repositories: []\n");

            var result = loader.load(directory);

            assertFalse(result.isValid());
            LogAsserts.assertLogMessagePresentContaining(TestLogLevel.ERROR, "TRAILHAND-200");
        }

        @Test
        @DisplayName("reports a missing file and invalid YAML")
        void missingAndBroken(@TempDir Path directory) throws Exception {
            assertTrue(hasViolation(loader.load(directory), ConfigurationLoader.FILE_NAME));
            Files.writeString(directory.resolve(ConfigurationLoader.FILE_NAME), "a: [unclosed\n");
            assertTrue(hasViolation(loader.load(directory), ConfigurationLoader.FILE_NAME));
        }

        @Test
        @DisplayName("and logs the loaded configuration")
        void logsSuccess(@TempDir Path directory) throws Exception {
            Files.writeString(directory.resolve(ConfigurationLoader.FILE_NAME), VALID);

            assertTrue(loader.load(directory).isValid());
            LogAsserts.assertLogMessagePresentContaining(TestLogLevel.INFO, "TRAILHAND-1");
        }
    }
}
