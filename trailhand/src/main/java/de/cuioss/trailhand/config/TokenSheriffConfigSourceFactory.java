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
import io.smallrye.config.ConfigSourceContext;
import io.smallrye.config.ConfigSourceFactory;
import io.smallrye.config.common.MapBackedConfigSource;
import org.eclipse.microprofile.config.spi.ConfigSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.function.UnaryOperator;

/**
 * Derives the configuration of Token Sheriff's client and validation extensions from {@code trailhand.yaml} →
 * {@code oidc} and {@code web.origin}, so the operator maintains one policy file (TRH-CONF-1):
 * {@code sheriff.client.*} (issuer, client id, client secret from its {@code file:} reference, redirect address, scopes)
 * and the issuer {@code sheriff.token.issuers.trailhand.*} that validates the tokens of the login.
 * <p>
 * The source has the ordinal {@value #ORDINAL}: above {@code application.properties}, below the environment. An
 * invalid {@code trailhand.yaml} yields no values; the boot then stops in {@link ConfigurationProducer} with every
 * violation logged. Transport settings that depend on the deployment (egress hosts, loopback) stay in the
 * environment.
 */
public class TokenSheriffConfigSourceFactory implements ConfigSourceFactory {

    /** The ordinal of the derived source. */
    public static final int ORDINAL = 260;

    /**
     * The optional key of the JWKS address, for a deployment that reaches the provider under another origin than the
     * issuer's (split horizon): it replaces the discovery of the keys through the issuer's well-known document.
     */
    public static final String JWKS_URL = "trailhand.oidc.jwks-url";

    /** The name of the issuer configuration that validates the login's tokens. */
    public static final String ISSUER_NAME = "trailhand";

    @Override
    public Iterable<ConfigSource> getConfigSources(ConfigSourceContext context) {
        var dirValue = context.getValue("trailhand.config.dir");
        var directory = Path.of(dirValue == null || dirValue.getValue() == null ? "config" : dirValue.getValue());
        var keys = new LinkedHashMap<>(derive(directory, System::getenv));
        var jwksUrl = context.getValue(JWKS_URL);
        if (!keys.isEmpty() && jwksUrl != null && jwksUrl.getValue() != null && !jwksUrl.getValue().isBlank()) {
            useJwksUrl(keys, jwksUrl.getValue().trim());
        }
        return List.of(new MapBackedConfigSource("trailhand.yaml (oidc)", keys, ORDINAL) {
        });
    }

    @Override
    public OptionalInt getPriority() {
        return OptionalInt.of(ORDINAL);
    }

    /**
     * @param directory   the configuration directory
     * @param environment the environment of the placeholders
     * @return the derived keys; empty when {@code trailhand.yaml} is missing or invalid
     */
    static Map<String, String> derive(Path directory, UnaryOperator<String> environment) {
        var file = directory.resolve(ConfigurationLoader.FILE_NAME);
        if (!Files.isRegularFile(file)) {
            return Map.of();
        }
        try {
            var tree = new ObjectMapper(new YAMLFactory()).readValue(file.toFile(), Object.class);
            var result = new ConfigurationLoader(environment).validate(tree);
            var configuration = result.configuration();
            if (!result.isValid() || configuration == null) {
                return Map.of();
            }
            return derive(configuration);
        } catch (IOException e) {
            return Map.of();
        }
    }

    /**
     * @param configuration a valid configuration
     * @return the derived keys
     */
    static Map<String, String> derive(TrailhandConfiguration configuration) {
        var oidc = configuration.oidc();
        var keys = new LinkedHashMap<String, String>();
        keys.put("sheriff.client.issuer", oidc.issuer());
        keys.put("sheriff.client.client-id", oidc.clientId());
        readSecret(oidc.clientCredentialRef()).ifPresent(secret -> keys.put("sheriff.client.client-secret", secret));
        keys.put("sheriff.client.redirect-uri",
                configuration.web().originHeaderValue() + "/api/v1/auth/callback");
        keys.put("sheriff.client.scopes", "openid,profile,email");
        var issuer = "sheriff.token.issuers." + ISSUER_NAME + ".";
        keys.put(issuer + "enabled", "true");
        keys.put(issuer + "issuer-identifier", oidc.issuer());
        keys.put(issuer + "jwks.http.well-known-url", stripSlash(oidc.issuer()) + "/.well-known/openid-configuration");
        keys.put(issuer + "expected-client-id", oidc.clientId());
        // Access and ID token are validated by this one issuer configuration: the ID token's audience is the client,
        // an access token's audience is the resource the provider names; the client id (azp) is checked for both.
        keys.put(issuer + "audience-validation-disabled", "true");
        return keys;
    }

    /**
     * @param keys    the derived keys
     * @param jwksUrl the JWKS address
     */
    static void useJwksUrl(Map<String, String> keys, String jwksUrl) {
        var issuer = "sheriff.token.issuers." + ISSUER_NAME + ".";
        keys.remove(issuer + "jwks.http.well-known-url");
        keys.put(issuer + "jwks.http.url", jwksUrl);
    }

    static String withoutTrailingLineBreak(String content) {
        if (content.endsWith("\r\n")) {
            return content.substring(0, content.length() - 2);
        }
        if (content.endsWith("\n") || content.endsWith("\r")) {
            return content.substring(0, content.length() - 1);
        }
        return content;
    }

    private static String stripSlash(String issuer) {
        return issuer.endsWith("/") ? issuer.substring(0, issuer.length() - 1) : issuer;
    }

    /**
     * Resolves a {@code file:} reference, the only form the loader accepts until the Vault adapter is built.
     *
     * @param reference the reference
     * @return the secret: the file's content without one trailing line break; every other character is kept
     */
    static Optional<String> readSecret(String reference) {
        if (!reference.startsWith("file:")) {
            return Optional.empty();
        }
        try {
            var content = Files.readString(Path.of(reference.substring("file:".length())));
            return Optional.of(withoutTrailingLineBreak(content));
        } catch (IOException e) {
            return Optional.empty();
        }
    }
}
