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

import de.cuioss.sheriff.token.client.auth.ClientAuthentication;
import de.cuioss.sheriff.token.client.discovery.DiscoveryResolver;
import de.cuioss.sheriff.token.client.discovery.ProviderMetadata;
import de.cuioss.sheriff.token.client.flow.AuthorizationCodeFlow;
import de.cuioss.sheriff.token.client.flow.CallbackParameters;
import de.cuioss.sheriff.token.client.lifecycle.RevocationClient;
import de.cuioss.sheriff.token.client.lifecycle.StoredToken;
import de.cuioss.sheriff.token.client.lifecycle.TokenLifecycleManager;
import de.cuioss.sheriff.token.client.logout.EndSessionFlow;
import de.cuioss.sheriff.token.client.logout.PostLogoutRedirectValidator;
import de.cuioss.sheriff.token.commons.error.TokenSheriffException;
import de.cuioss.sheriff.token.validation.domain.claim.ClaimValue;
import de.cuioss.sheriff.token.validation.domain.token.IdTokenContent;
import de.cuioss.tools.logging.CuiLogger;
import de.cuioss.trailhand.config.TrailhandConfiguration;
import jakarta.enterprise.context.ApplicationScoped;
import org.jspecify.annotations.Nullable;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static de.cuioss.trailhand.TrailhandLogMessages.INFO;
import static de.cuioss.trailhand.TrailhandLogMessages.WARN;

/**
 * The web login of TRH-AUTH-1 on Token Sheriff's confidential client (ADR-0001): authorization code with PKCE
 * {@code S256}, session-bound {@code state} and {@code nonce}, issuer check; tokens stay in Token Sheriff's token
 * store under the session id, the browser gets only the session cookie. Logout revokes the held tokens and ends the
 * session at the provider (RP-initiated).
 */
@ApplicationScoped
public class LoginService {

    private static final CuiLogger LOGGER = new CuiLogger(LoginService.class);

    /** The path of the callback below the origin. */
    public static final String CALLBACK_PATH = "/api/v1/auth/callback";

    private final DiscoveryResolver discovery;
    private final AuthorizationCodeFlow flow;
    private final ClientAuthentication clientAuthentication;
    private final TokenLifecycleManager tokens;
    private final RevocationClient revocation;
    private final SessionStore sessions;
    private final LoginTransactions transactions;
    private final ReturnAddresses returnAddresses;
    private final TrailhandConfiguration configuration;
    private volatile @Nullable ProviderMetadata metadata;

    /**
     * @param discovery            Token Sheriff's discovery
     * @param flow                 the authorization code flow
     * @param clientAuthentication the client authentication
     * @param tokens               the token store of the sessions
     * @param revocation           the revocation client
     * @param sessions             the sessions
     * @param transactions         the login transactions
     * @param returnAddresses      the return check
     * @param configuration        the configuration
     */
    @SuppressWarnings("java:S107") // the collaborators of the flow; grouping them would only hide them
    public LoginService(DiscoveryResolver discovery, AuthorizationCodeFlow flow,
            ClientAuthentication clientAuthentication, TokenLifecycleManager tokens, RevocationClient revocation,
            SessionStore sessions, LoginTransactions transactions, ReturnAddresses returnAddresses,
            TrailhandConfiguration configuration) {
        this.discovery = discovery;
        this.flow = flow;
        this.clientAuthentication = clientAuthentication;
        this.tokens = tokens;
        this.revocation = revocation;
        this.sessions = sessions;
        this.transactions = transactions;
        this.returnAddresses = returnAddresses;
        this.configuration = configuration;
    }

    /**
     * The provider's metadata, read once: the resolver of Token Sheriff fetches on every call.
     *
     * @return the metadata
     */
    ProviderMetadata metadata() {
        var current = metadata;
        if (current == null) {
            current = discovery.resolve();
            metadata = current;
        }
        return current;
    }

    /**
     * Starts a login.
     *
     * @param requestedReturn the {@code return} of the request
     * @return the authorization address and the transaction reference for the cookie
     * @throws TokenSheriffException if the provider cannot be reached or refuses the flow
     */
    public LoginStart start(@Nullable String requestedReturn) {
        var redirect = flow.authorize(metadata());
        var reference = transactions.begin(redirect.context(), returnAddresses.check(requestedReturn));
        return new LoginStart(redirect.authorizationUrl(), reference);
    }

    /**
     * Completes a login from the provider's form post.
     *
     * @param transactionReference the reference from the transaction cookie, or {@code null} when it is missing
     * @param formBody             the {@code application/x-www-form-urlencoded} body of the callback
     * @return the new session and the return address, or empty when the login cannot be completed
     */
    public Optional<LoginCompletion> complete(@Nullable String transactionReference, String formBody) {
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
            var callback = CallbackParameters.parse(formBody);
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
        var groups = groups(claims.get(configuration.oidc().groupsClaim()));
        var authTime = Optional.ofNullable(claims.get("auth_time")).map(ClaimValue::getOriginalString)
                .flatMap(LoginService::epochSeconds).orElse(null);
        var acr = Optional.ofNullable(claims.get("acr")).map(ClaimValue::getOriginalString).orElse(null);
        var name = idToken.getDisplayName().orElse(subject);
        return new LoginIdentity(idToken.getIssuer(), subject, name, groups, authTime, acr);
    }

    static List<String> groups(@Nullable ClaimValue value) {
        if (value == null) {
            return List.of();
        }
        var list = value.getAsList();
        if (list != null && !list.isEmpty()) {
            return List.copyOf(list);
        }
        var text = value.getOriginalString();
        if (text == null || text.isBlank()) {
            return List.of();
        }
        return Arrays.stream(text.replace("[", "").replace("]", "").split(",")).map(String::trim)
                .filter(entry -> !entry.isEmpty()).toList();
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
        if (endSession.isEmpty() || held.get().idToken() == null) {
            return home;
        }
        LOGGER.info(INFO.LOGOUT_COMPLETED);
        return new EndSessionFlow(new PostLogoutRedirectValidator(Set.of(home)))
                .buildLogoutRedirect(endSession.get(), held.get().idToken(), home, SessionStore.randomToken());
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
}
