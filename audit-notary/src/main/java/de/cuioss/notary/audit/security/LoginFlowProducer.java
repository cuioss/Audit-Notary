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
package de.cuioss.notary.audit.security;

import de.cuioss.sheriff.token.client.config.ClientConfiguration;
import de.cuioss.sheriff.token.client.flow.AuthorizationCodeFlow;
import de.cuioss.sheriff.token.client.flow.CallbackHandler;
import de.cuioss.sheriff.token.client.flow.IssValidator;
import de.cuioss.sheriff.token.client.flow.TokenEndpointClient;
import de.cuioss.sheriff.token.client.token.IdTokenValidationBridge;
import de.cuioss.sheriff.token.client.token.TokenValidationBridge;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Named;

/**
 * Builds the authorization code flow of the web login from Token Sheriff's beans, with the
 * {@link QueryResponseModeRequestBuilder} in place of the built-in request builder (AUN-AUTH-1). Without sender
 * constraint: the tokens stay on the server.
 */
@ApplicationScoped
public class LoginFlowProducer {

    /** The qualifier of the web login's flow. */
    public static final String WEB_LOGIN = "audit-notary-web-login";

    /**
     * @param configuration        the client configuration
     * @param tokenEndpoint        the token endpoint client
     * @param accessTokenBridge    the access-token validation
     * @param idTokenBridge        the ID-token validation
     * @param issValidator         the issuer check of the authorization response (RFC 9207)
     * @return the flow
     */
    @Produces
    @ApplicationScoped
    @Named(WEB_LOGIN)
    AuthorizationCodeFlow webLoginFlow(ClientConfiguration configuration, TokenEndpointClient tokenEndpoint,
            TokenValidationBridge accessTokenBridge, IdTokenValidationBridge idTokenBridge, IssValidator issValidator) {
        return new AuthorizationCodeFlow(configuration, tokenEndpoint, accessTokenBridge, idTokenBridge, issValidator,
                new QueryResponseModeRequestBuilder(), new CallbackHandler(), null);
    }
}
