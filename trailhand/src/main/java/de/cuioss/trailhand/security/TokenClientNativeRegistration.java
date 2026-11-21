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
package de.cuioss.trailhand.security;

import de.cuioss.sheriff.token.client.discovery.ProviderMetadata;
import de.cuioss.sheriff.token.client.discovery._ProviderMetadata_DslJsonConverter;
import de.cuioss.sheriff.token.client.flow.ParResponse;
import de.cuioss.sheriff.token.client.flow._ParResponse_DslJsonConverter;
import de.cuioss.sheriff.token.client.internal.AccessTokenConfirmation;
import de.cuioss.sheriff.token.client.internal._AccessTokenConfirmation$Confirmation_DslJsonConverter;
import de.cuioss.sheriff.token.client.internal._AccessTokenConfirmation$JsonObjectProbe_DslJsonConverter;
import de.cuioss.sheriff.token.client.internal._AccessTokenConfirmation_DslJsonConverter;
import de.cuioss.sheriff.token.client.token.TokenErrorResponse;
import de.cuioss.sheriff.token.client.token.TokenResponse;
import de.cuioss.sheriff.token.client.token.UserInfoResponse;
import de.cuioss.sheriff.token.client.token._TokenErrorResponse_DslJsonConverter;
import de.cuioss.sheriff.token.client.token._TokenResponse_DslJsonConverter;
import de.cuioss.sheriff.token.client.token._UserInfoResponse_DslJsonConverter;
import io.quarkus.runtime.annotations.RegisterForReflection;

/**
 * Registers the response types of Token Sheriff's client and their generated DSL-JSON converters for reflection, so
 * the client can read the provider's answers (discovery, token, error, PAR, user info, confirmation) in the native
 * image (TRH-OPS-1). DSL-JSON finds a converter by name and instantiates it reflectively; without the registration the
 * native image answers "Unable to find reader for provided type". The same registration as API Sheriff's
 * {@code TokenClientDslJsonReflection}; naming the classes by symbol makes a rename in the client fail the build.
 */
@RegisterForReflection(targets = {
        _ProviderMetadata_DslJsonConverter.class,
        _ParResponse_DslJsonConverter.class,
        _TokenResponse_DslJsonConverter.class,
        _TokenErrorResponse_DslJsonConverter.class,
        _UserInfoResponse_DslJsonConverter.class,
        _AccessTokenConfirmation_DslJsonConverter.class,
        _AccessTokenConfirmation$Confirmation_DslJsonConverter.class,
        _AccessTokenConfirmation$JsonObjectProbe_DslJsonConverter.class,
        ProviderMetadata.class,
        ParResponse.class,
        TokenResponse.class,
        TokenErrorResponse.class,
        UserInfoResponse.class,
        AccessTokenConfirmation.class,
        AccessTokenConfirmation.Confirmation.class,
        AccessTokenConfirmation.JsonObjectProbe.class
})
public final class TokenClientNativeRegistration {

    private TokenClientNativeRegistration() {
        // registration holder
    }
}
