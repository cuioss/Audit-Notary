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

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("TokenSheriffConfigSourceFactory: Token Sheriff's keys from trailhand.yaml")
class TokenSheriffConfigSourceFactoryTest {

    @Test
    @DisplayName("derives client and issuer keys and reads the client secret from its file")
    void derives(@TempDir Path directory) throws Exception {
        var secret = directory.resolve("client-secret");
        Files.writeString(secret, "s3cret\n");
        Files.writeString(directory.resolve(ConfigurationLoader.FILE_NAME), """
                repositories:
                  - {alias: directory, remote: "file:/srv/directory.git", confidentiality: restricted, retention: unlimited}
                rights: {}
                oidc:
                  issuer: https://idp.example.org/realms/trailhand/
                  client-id: trailhand-web
                  client-credential-ref: file:%s
                web:
                  origin: https://trailhand.example.org:8443
                """.formatted(secret));

        var keys = TokenSheriffConfigSourceFactory.derive(directory, name -> null);

        assertEquals("https://idp.example.org/realms/trailhand/", keys.get("sheriff.client.issuer"));
        assertEquals("trailhand-web", keys.get("sheriff.client.client-id"));
        assertEquals("s3cret", keys.get("sheriff.client.client-secret"));
        assertEquals("https://trailhand.example.org:8443/api/v1/auth/callback", keys.get("sheriff.client.redirect-uri"));
        assertEquals("https://idp.example.org/realms/trailhand/.well-known/openid-configuration",
                keys.get("sheriff.token.issuers.trailhand.jwks.http.well-known-url"));
        assertEquals("trailhand-web", keys.get("sheriff.token.issuers.trailhand.expected-client-id"));
        assertEquals("true", keys.get("sheriff.token.issuers.trailhand.enabled"));
    }

    @Test
    @DisplayName("an explicit JWKS address replaces the well-known discovery")
    void jwksUrl() {
        var keys = new LinkedHashMap<String, String>();
        keys.put("sheriff.token.issuers.trailhand.jwks.http.well-known-url", "https://idp/.well-known");

        TokenSheriffConfigSourceFactory.useJwksUrl(keys, "https://keycloak:8443/certs");

        assertEquals(Map.of("sheriff.token.issuers.trailhand.jwks.http.url", "https://keycloak:8443/certs"),
                keys);
    }

    @Test
    @DisplayName("reads a secret file without one trailing line break and keeps every other character")
    void secretFile(@TempDir Path directory) throws Exception {
        var file = directory.resolve("secret");
        Files.writeString(file, " s3cret \n");
        assertEquals(" s3cret ", TokenSheriffConfigSourceFactory.readSecret("file:" + file).orElseThrow());
        assertEquals("s\n", TokenSheriffConfigSourceFactory.withoutTrailingLineBreak("s\n\r\n"));
        assertEquals("s", TokenSheriffConfigSourceFactory.withoutTrailingLineBreak("s\r"));
        assertEquals("s", TokenSheriffConfigSourceFactory.withoutTrailingLineBreak("s"));
    }

    @Test
    @DisplayName("derives nothing from a missing or invalid file, and no secret from a vault reference")
    void nothing(@TempDir Path directory) throws Exception {
        assertTrue(TokenSheriffConfigSourceFactory.derive(directory, name -> null).isEmpty());
        Files.writeString(directory.resolve(ConfigurationLoader.FILE_NAME), "rights: {}\n");
        assertTrue(TokenSheriffConfigSourceFactory.derive(directory, name -> null).isEmpty());
        assertTrue(TokenSheriffConfigSourceFactory.readSecret("vault:secret/x").isEmpty());
        assertTrue(TokenSheriffConfigSourceFactory.readSecret("file:" + directory.resolve("absent")).isEmpty());
    }
}
