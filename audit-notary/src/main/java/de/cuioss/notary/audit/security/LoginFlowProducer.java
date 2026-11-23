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
package de.cuioss.notary.audit.security;

import de.cuioss.sheriff.token.client.config.ClientConfiguration;
import de.cuioss.sheriff.token.client.flow.AuthorizationCodeFlow;
import de.cuioss.sheriff.token.client.flow.IssValidator;
import de.cuioss.sheriff.token.client.flow.TokenEndpointClient;
import de.cuioss.sheriff.token.client.token.IdTokenValidationBridge;
import de.cuioss.sheriff.token.client.token.TokenValidationBridge;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Named;

/**
 * Builds the authorization code flow of the web login from Token Sheriff's beans, with Token Sheriff's own request
 * builder; {@link LoginService} asks for {@code response_mode=query} per request (AUN-AUTH-1). Without sender
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
                null);
    }
}
