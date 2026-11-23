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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.cuioss.notary.audit.config.AuditNotaryConfiguration;
import de.cuioss.sheriff.token.client.auth.ClientAuthentication;
import de.cuioss.sheriff.token.client.discovery.CachingDiscoveryResolver;
import de.cuioss.sheriff.token.client.discovery.ProviderMetadata;
import de.cuioss.sheriff.token.client.flow.AuthorizationCodeFlow;
import de.cuioss.sheriff.token.client.flow.AuthorizationRequestOptions;
import de.cuioss.sheriff.token.client.flow.CallbackParameters;
import de.cuioss.sheriff.token.client.flow.ParClient;
import de.cuioss.sheriff.token.client.flow.ResponseMode;
import de.cuioss.sheriff.token.client.lifecycle.RevocationClient;
import de.cuioss.sheriff.token.client.lifecycle.StoredToken;
import de.cuioss.sheriff.token.client.lifecycle.TokenLifecycleManager;
import de.cuioss.sheriff.token.client.logout.EndSessionFlow;
import de.cuioss.sheriff.token.client.logout.PostLogoutRedirectValidator;
import de.cuioss.sheriff.token.commons.error.TokenSheriffException;
import de.cuioss.sheriff.token.validation.domain.claim.ClaimValue;
import de.cuioss.sheriff.token.validation.domain.token.IdTokenContent;
import de.cuioss.tools.logging.CuiLogger;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Named;
import org.jspecify.annotations.Nullable;

import java.io.IOException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static de.cuioss.notary.audit.AuditNotaryLogMessages.INFO;
import static de.cuioss.notary.audit.AuditNotaryLogMessages.WARN;

/**
 * The web login of AUN-AUTH-1 on Token Sheriff's confidential client (ADR-0001): authorization code with PKCE
 * {@code S256}, session-bound {@code state} and {@code nonce}, issuer check, and PAR (RFC 9126) when the provider
 * offers it; tokens stay in Token Sheriff's token
 * store under the session id, the browser gets only the session cookie. Logout revokes the held tokens and ends the
 * session at the provider (RP-initiated).
 */
@ApplicationScoped
public class LoginService {

    private static final CuiLogger LOGGER = new CuiLogger(LoginService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * The options of every authorization request: {@code response_mode=query}, so the callback is a top-level
     * {@code GET} that carries the {@code SameSite=Lax} transaction cookie (AUN-AUTH-1; Token Sheriff CLIENT-27).
     */
    static final AuthorizationRequestOptions AUTHORIZATION_OPTIONS = AuthorizationRequestOptions.builder()
            .responseMode(ResponseMode.QUERY).build();

    private final CachingDiscoveryResolver discovery;
    private final AuthorizationCodeFlow flow;
    private final ParClient par;
    private final ClientAuthentication clientAuthentication;
    private final TokenLifecycleManager tokens;
    private final RevocationClient revocation;
    private final SessionStore sessions;
    private final LoginTransactions transactions;
    private final ReturnAddresses returnAddresses;
    private final AuditNotaryConfiguration configuration;

    /**
     * @param discovery            Token Sheriff's caching discovery (CLIENT-29)
     * @param flow                 the authorization code flow
     * @param par                  the client of the pushed-authorization-request endpoint
     * @param clientAuthentication the client authentication
     * @param tokens               the token store of the sessions
     * @param revocation           the revocation client
     * @param sessions             the sessions
     * @param transactions         the login transactions
     * @param returnAddresses      the return check
     * @param configuration        the configuration
     */
    @SuppressWarnings("java:S107") // the collaborators of the flow; grouping them would only hide them
    public LoginService(CachingDiscoveryResolver discovery, @Named(LoginFlowProducer.WEB_LOGIN) AuthorizationCodeFlow flow,
            ParClient par, ClientAuthentication clientAuthentication, TokenLifecycleManager tokens, RevocationClient revocation,
            SessionStore sessions, LoginTransactions transactions, ReturnAddresses returnAddresses,
            AuditNotaryConfiguration configuration) {
        this.discovery = discovery;
        this.flow = flow;
        this.par = par;
        this.clientAuthentication = clientAuthentication;
        this.tokens = tokens;
        this.revocation = revocation;
        this.sessions = sessions;
        this.transactions = transactions;
        this.returnAddresses = returnAddresses;
        this.configuration = configuration;
    }

    /**
     * The provider's metadata from Token Sheriff's discovery cache, which refreshes it once its time to live has passed
     * and serves the last document for the grace period while the provider cannot be reached
     * ({@code sheriff.client.discovery-cache.*} in {@code application.properties}).
     *
     * @return the metadata
     */
    ProviderMetadata metadata() {
        return discovery.resolve();
    }

    /**
     * Starts a login. When the provider offers PAR, the authorization parameters are pushed to it and the browser
     * goes to the provider with {@code client_id} and {@code request_uri} only.
     *
     * @param requestedReturn the {@code return} of the request
     * @return the authorization address and the transaction reference for the cookie
     * @throws TokenSheriffException     if the provider cannot be reached or refuses the flow
     * @throws TooManyLoginsException    if {@value LoginTransactions#MAX_PENDING} logins are pending
     */
    public LoginStart start(@Nullable String requestedReturn) {
        var metadataNow = metadata();
        var redirect = flow.authorize(metadataNow, AUTHORIZATION_OPTIONS);
        var reference = transactions.begin(redirect.context(), returnAddresses.check(requestedReturn))
                .orElseThrow(TooManyLoginsException::new);
        var started = false;
        try {
            var start = new LoginStart(authorizationAddress(metadataNow, redirect.authorizationUrl()), reference);
            started = true;
            return start;
        } finally {
            if (!started) {
                // The reference never reaches the browser: free its place at once instead of waiting for its expiry.
                transactions.take(reference);
            }
        }
    }

    /**
     * @param metadataNow the provider's metadata
     * @param direct      the authorization address with every parameter in its query
     * @return the direct address, or with PAR the authorization endpoint with {@code client_id} and
     *         {@code request_uri}
     */
    String authorizationAddress(ProviderMetadata metadataNow, String direct) {
        var endpoint = metadataNow.getPushedAuthorizationRequestEndpoint();
        var queryStart = direct.indexOf('?');
        if (endpoint.isEmpty() || queryStart < 0) {
            return direct;
        }
        var parameters = queryParameters(direct.substring(queryStart + 1));
        var clientId = parameters.get("client_id");
        var requestUri = par.pushAuthorizationRequest(endpoint.get(), parameters, clientAuthentication).getRequestUri()
                .orElseThrow(() -> new IllegalStateException("PAR answer without request_uri"));
        return direct.substring(0, queryStart) + "?client_id=" + encode(clientId == null ? "" : clientId)
                + "&request_uri=" + encode(requestUri);
    }

    static Map<String, String> queryParameters(String query) {
        var parameters = new LinkedHashMap<String, String>();
        for (String pair : query.split("&")) {
            if (pair.isEmpty()) {
                continue;
            }
            var separator = pair.indexOf('=');
            var name = separator < 0 ? pair : pair.substring(0, separator);
            var value = separator < 0 ? "" : pair.substring(separator + 1);
            parameters.put(URLDecoder.decode(name, StandardCharsets.UTF_8),
                    URLDecoder.decode(value, StandardCharsets.UTF_8));
        }
        return parameters;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    /**
     * Completes a login from the provider's answer.
     *
     * @param transactionReference the reference from the transaction cookie, or {@code null} when it is missing
     * @param callbackQuery        the raw query of the callback ({@code code}, {@code state}, {@code iss})
     * @return the new session and the return address, or empty when the login cannot be completed
     */
    public Optional<LoginCompletion> complete(@Nullable String transactionReference, String callbackQuery) {
        if (transactionReference == null) {
            LOGGER.warn(WARN.LOGIN_FAILED, "no login transaction cookie");
            return Optional.empty();
        }
        var transaction = transactions.take(transactionReference);
        if (transaction.isEmpty()) {
            LOGGER.warn(WARN.LOGIN_FAILED, "unknown or expired login transaction");
            return Optional.empty();
        }
        try {
            var callback = CallbackParameters.parse(callbackQuery);
            var result = flow.exchange(metadata(), transaction.get().context(), callback, clientAuthentication);
            var identity = identity(result.idToken());
            var session = sessions.open(identity);
            tokens.store(session.id(), new StoredToken(result.accessToken().getRawToken(), result.refreshToken(),
                    result.idToken().getRawToken(), null, result.accessToken().getExpirationDateTime().toInstant(),
                    identity.subject()));
            LOGGER.info(INFO.LOGIN_COMPLETED, identity.issuer());
            return Optional.of(new LoginCompletion(session, transaction.get().returnAddress()));
        } catch (TokenSheriffException | IllegalArgumentException | IllegalStateException e) {
            LOGGER.warn(WARN.LOGIN_FAILED, e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private LoginIdentity identity(IdTokenContent idToken) {
        var subject = idToken.getSubject().orElseThrow(() -> new IllegalStateException("ID token without sub"));
        var claims = idToken.getClaims();
        var groups = groups(idToken.getRawToken(), configuration.oidc().groupsClaim());
        var authTime = Optional.ofNullable(claims.get("auth_time")).map(ClaimValue::getOriginalString)
                .flatMap(LoginService::epochSeconds).orElse(null);
        var acr = Optional.ofNullable(claims.get("acr")).map(ClaimValue::getOriginalString).orElse(null);
        var name = idToken.getDisplayName().orElse(subject);
        return new LoginIdentity(idToken.getIssuer(), subject, name, groups, authTime, acr);
    }

    /**
     * Reads the groups from the JSON payload of the validated ID token: an array yields its strings, a single string
     * one group, anything else none. The claim is read as the provider wrote it, so a group name that contains a comma
     * stays one group.
     *
     * @param rawToken the validated ID token (a JWS)
     * @param claim    the name of the group claim
     * @return the groups, empty when the claim is missing or the token cannot be read
     */
    static List<String> groups(String rawToken, String claim) {
        var parts = rawToken.split("\\.");
        if (parts.length != 3) {
            return List.of();
        }
        try {
            var value = JSON.readTree(Base64.getUrlDecoder().decode(parts[1])).get(claim);
            return groups(value);
        } catch (IOException | IllegalArgumentException e) {
            LOGGER.warn(WARN.LOGIN_FAILED, "unreadable group claim");
            return List.of();
        }
    }

    private static List<String> groups(@Nullable JsonNode value) {
        if (value == null) {
            return List.of();
        }
        if (value.isTextual()) {
            return value.asText().isBlank() ? List.of() : List.of(value.asText());
        }
        var groups = new ArrayList<String>();
        if (value.isArray()) {
            value.forEach(entry -> {
                if (entry.isTextual() && !entry.asText().isBlank()) {
                    groups.add(entry.asText());
                }
            });
        }
        return List.copyOf(groups);
    }

    static Optional<Instant> epochSeconds(@Nullable String text) {
        try {
            return text == null ? Optional.empty() : Optional.of(Instant.ofEpochSecond(Long.parseLong(text.trim())));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    /**
     * Ends a session: revokes the held tokens, then builds the RP-initiated logout address of the provider.
     *
     * @param sessionId the session id
     * @return the address the browser navigates to: the provider's end-session address, or the own origin when the
     *         provider has none
     */
    public String logout(String sessionId) {
        sessions.close(sessionId);
        var held = tokens.revokeAndClear(sessionId);
        var home = configuration.web().originHeaderValue() + "/";
        if (held.isEmpty()) {
            return home;
        }
        var metadataNow = metadata();
        revoke(metadataNow, held.get().refreshToken(), "refresh_token");
        revoke(metadataNow, held.get().accessToken(), "access_token");
        var endSession = metadataNow.getEndSessionEndpoint();
        var idToken = held.get().idToken();
        if (endSession.isEmpty() || idToken == null) {
            return home;
        }
        LOGGER.info(INFO.LOGOUT_COMPLETED);
        return new EndSessionFlow(new PostLogoutRedirectValidator(Set.of(home)))
                .buildLogoutRedirect(endSession.get(), idToken, home, SessionStore.randomToken());
    }

    private void revoke(ProviderMetadata metadataNow, @Nullable String token, String hint) {
        var endpoint = metadataNow.getRevocationEndpoint();
        if (token == null || endpoint.isEmpty()) {
            return;
        }
        try {
            revocation.revoke(endpoint.get(), token, hint, clientAuthentication);
        } catch (TokenSheriffException e) {
            LOGGER.warn(WARN.REVOCATION_FAILED, e.getClass().getSimpleName());
        }
    }

    /**
     * The start of a login.
     *
     * @param authorizationUrl     where the browser goes
     * @param transactionReference the value of the transaction cookie
     */
    public record LoginStart(String authorizationUrl, String transactionReference) {
    }

    /**
     * A completed login.
     *
     * @param session       the new session
     * @param returnAddress the checked return address
     */
    public record LoginCompletion(UserSession session, String returnAddress) {
    }

    /** Thrown when the login cannot start because {@value LoginTransactions#MAX_PENDING} logins are pending. */
    public static final class TooManyLoginsException extends RuntimeException {

        private static final long serialVersionUID = 1L;

        TooManyLoginsException() {
            super("too many pending logins");
        }
    }
}
