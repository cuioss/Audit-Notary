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

import de.cuioss.sheriff.token.client.config.ClientConfiguration;
import de.cuioss.sheriff.token.client.discovery.ProviderMetadata;
import de.cuioss.sheriff.token.client.flow.AuthorizationRequestBuilder;
import de.cuioss.sheriff.token.client.flow.FlowContext;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Drives the authorization request with {@code response_mode=query} instead of Token Sheriff's built-in
 * {@code response_mode=form_post} (TRH-AUTH-1).
 * <p>
 * With {@code form_post} the provider answers with a cross-site {@code POST} to the callback, with which a browser
 * sends no {@code SameSite=Lax} cookie, so the login-transaction cookie would not arrive. With {@code query} the
 * callback is a top-level {@code GET} navigation, which carries it. The cookie keeps {@code SameSite=Lax}; the
 * alternative {@code SameSite=None} would weaken the binding the cookie exists for. The same decision and reasoning as
 * API Sheriff's {@code QueryResponseModeAuthorizationRequestBuilder}.
 * <p>
 * Accepted trade-off: the code travels in the callback's query string. It is bounded by PKCE (the code cannot be
 * redeemed without the verifier, which stays on the server), by the single use of the code, by the login transaction
 * with {@code state}, and by {@code Referrer-Policy: no-referrer} on every answer. The rewrite touches only
 * {@code response_mode} and keeps every other parameter in its order and encoding.
 */
public class QueryResponseModeRequestBuilder extends AuthorizationRequestBuilder {

    private static final String RESPONSE_MODE = "response_mode";
    private static final String QUERY_PAIR = RESPONSE_MODE + "=query";

    @Override
    public String build(ClientConfiguration configuration, ProviderMetadata metadata, FlowContext context) {
        return withQueryResponseMode(super.build(configuration, metadata, context));
    }

    /**
     * @param authorizationUrl an authorization address
     * @return the address with {@code response_mode=query}, added or replacing the existing value
     */
    static String withQueryResponseMode(String authorizationUrl) {
        Objects.requireNonNull(authorizationUrl, "authorizationUrl");
        int queryStart = authorizationUrl.indexOf('?');
        if (queryStart < 0) {
            return authorizationUrl + '?' + QUERY_PAIR;
        }
        var prefix = authorizationUrl.substring(0, queryStart + 1);
        var query = authorizationUrl.substring(queryStart + 1);
        if (query.isEmpty()) {
            return prefix + QUERY_PAIR;
        }
        List<String> pairs = new ArrayList<>();
        boolean rewritten = false;
        for (String pair : query.split("&", -1)) {
            int separator = pair.indexOf('=');
            var name = separator < 0 ? pair : pair.substring(0, separator);
            if (RESPONSE_MODE.equals(name)) {
                pairs.add(QUERY_PAIR);
                rewritten = true;
            } else {
                pairs.add(pair);
            }
        }
        if (!rewritten) {
            pairs.add(QUERY_PAIR);
        }
        return prefix + String.join("&", pairs);
    }
}
