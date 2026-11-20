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
import de.cuioss.sheriff.token.client.flow.FlowContext;
import de.cuioss.sheriff.token.client.lifecycle.InMemoryTokenStore;
import de.cuioss.sheriff.token.client.lifecycle.RefreshScheduler;
import de.cuioss.sheriff.token.client.lifecycle.RevocationClient;
import de.cuioss.sheriff.token.client.lifecycle.StoredToken;
import de.cuioss.sheriff.token.client.lifecycle.TokenLifecycleManager;
import de.cuioss.sheriff.token.commons.error.ClientProtocolException;
import de.cuioss.sheriff.token.validation.domain.claim.ClaimValue;
import de.cuioss.sheriff.token.validation.domain.token.AccessTokenContent;
import de.cuioss.sheriff.token.validation.domain.token.IdTokenContent;
import de.cuioss.test.juli.LogAsserts;
import de.cuioss.test.juli.TestLogLevel;
import de.cuioss.test.juli.junit5.EnableTestLogger;
import de.cuioss.trailhand.config.OidcSettings;
import de.cuioss.trailhand.config.TrailhandConfiguration;
import de.cuioss.trailhand.config.WebSettings;
import org.easymock.EasyMock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.easymock.EasyMock.anyObject;
import static org.easymock.EasyMock.eq;
import static org.easymock.EasyMock.expect;
import static org.easymock.EasyMock.expectLastCall;
import static org.easymock.EasyMock.replay;
import static org.easymock.EasyMock.verify;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableTestLogger
@DisplayName("LoginService: the web login on Token Sheriff (TRH-AUTH-1)")
class LoginServiceTest {

    private static final String ORIGIN = "https://trailhand.example.org";
    private static final String CALLBACK = ORIGIN + LoginService.CALLBACK_PATH;
    private static final String ISSUER = "https://idp.example.org/realms/trailhand";

    private DiscoveryResolver discovery;
    private AuthorizationCodeFlow flow;
    private RevocationClient revocation;
    private ProviderMetadata metadata;
    private ClientAuthentication clientAuthentication;
    private TokenLifecycleManager tokens;
    private SessionStore sessions;
    private LoginTransactions transactions;
    private LoginService service;

    @BeforeEach
    void setUp() {
        discovery = EasyMock.createMock(DiscoveryResolver.class);
        flow = EasyMock.createMock(AuthorizationCodeFlow.class);
        revocation = EasyMock.createMock(RevocationClient.class);
        metadata = EasyMock.createNiceMock(ProviderMetadata.class);
        clientAuthentication = EasyMock.createNiceMock(ClientAuthentication.class);
        tokens = new TokenLifecycleManager(new InMemoryTokenStore(), new RefreshScheduler());
        sessions = new SessionStore(Duration.ofMinutes(30), Duration.ofHours(8), Clock.systemUTC());
        transactions = new LoginTransactions();
        var configuration = new TrailhandConfiguration(List.of(), Map.of(),
                new OidcSettings(ISSUER, "trailhand-web", "file:/x", "groups"),
                new WebSettings(URI.create(ORIGIN), Duration.ofMinutes(30), Duration.ofHours(8)), Duration.ofMinutes(5));
        service = new LoginService(discovery, flow, clientAuthentication, tokens, revocation, sessions, transactions,
                new ReturnAddresses(), configuration);
    }

    private static IdTokenContent idToken() {
        return new IdTokenContent(Map.of("iss", ClaimValue.forPlainString(ISSUER), "sub", ClaimValue.forPlainString("sub-7"),
                        "name", ClaimValue.forPlainString("Alex Example"),
                        "groups", ClaimValue.forList("[\"assessors\",\"approvers\"]", List.of("assessors", "approvers")),
                        "auth_time", ClaimValue.forPlainString("1795161600"), "acr", ClaimValue.forPlainString("1")),
                "id-token");
    }

    private static AccessTokenContent accessToken() {
        var exp = OffsetDateTime.now().plusMinutes(5);
        return new AccessTokenContent(Map.of("iss", ClaimValue.forPlainString(ISSUER),
                "exp", ClaimValue.forDateTime(String.valueOf(exp.toEpochSecond()), exp)), "access-token");
    }

    @Test
    @DisplayName("starts with the provider's authorization address and a transaction for the checked return")
    void start() {
        var context = FlowContext.create(CALLBACK);
        expect(discovery.resolve()).andReturn(metadata).once();
        expect(flow.authorize(metadata))
                .andReturn(new AuthorizationCodeFlow.AuthorizationRedirect("https://idp/auth?x", context)).times(2);
        replay(discovery, flow);

        var first = service.start("/samm/payments");
        service.start("//evil.example");

        assertEquals("https://idp/auth?x", first.authorizationUrl());
        assertEquals("/samm/payments", transactions.take(first.transactionReference()).orElseThrow().returnAddress());
        verify(discovery, flow);
    }

    @Test
    @DisplayName("completes a login into a session with the identity values and keeps the tokens server-side")
    void complete() {
        var context = FlowContext.create(CALLBACK);
        var reference = transactions.begin(context, "/incidents");
        expect(discovery.resolve()).andReturn(metadata);
        expect(flow.exchange(eq(metadata), eq(context), anyObject(CallbackParameters.class), eq(clientAuthentication)))
                .andReturn(new AuthorizationCodeFlow.AuthenticationResult(accessToken(), idToken(), "refresh-token"));
        replay(discovery, flow);

        var completed = service.complete(reference, "code=abc&state=" + context.state()).orElseThrow();

        var session = completed.session();
        assertEquals("/incidents", completed.returnAddress());
        assertEquals(ISSUER, session.issuer());
        assertEquals("sub-7", session.subject());
        assertEquals("Alex Example", session.name());
        assertEquals(List.of("assessors", "approvers"), session.groups());
        assertEquals(Instant.ofEpochSecond(1795161600L), session.authTime());
        assertEquals("1", session.acr());
        assertEquals("refresh-token", tokens.get(session.id()).orElseThrow().refreshToken());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.INFO, "TRAILHAND-3");
        assertTrue(transactions.take(reference).isEmpty(), "a transaction completes once");
    }

    @Test
    @DisplayName("refuses a callback without cookie, with an unknown transaction or with a refused exchange")
    void refusals() {
        var context = FlowContext.create(CALLBACK);
        var reference = transactions.begin(context, "/");
        expect(discovery.resolve()).andReturn(metadata);
        expect(flow.exchange(anyObject(), anyObject(), anyObject(), anyObject()))
                .andThrow(new ClientProtocolException("state mismatch"));
        replay(discovery, flow);

        assertTrue(service.complete(null, "code=a").isEmpty());
        assertTrue(service.complete("unknown", "code=a").isEmpty());
        assertTrue(service.complete(reference, "code=a&state=wrong").isEmpty());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "TRAILHAND-103");
    }

    @Test
    @DisplayName("logs out: revokes both tokens and leads to the provider's end-session address")
    void logout() {
        var session = sessions.open(new LoginIdentity(ISSUER, "sub-7", "Alex", List.of(), null, null));
        tokens.store(session.id(), new StoredToken("access-token",
                "refresh-token", "id-token", null, Instant.now().plusSeconds(300), "sub-7"));
        ProviderMetadata endpoints = EasyMock.createMock(ProviderMetadata.class);
        expect(endpoints.getRevocationEndpoint()).andReturn(Optional.of("https://idp/revoke")).anyTimes();
        expect(endpoints.getEndSessionEndpoint()).andReturn(Optional.of("https://idp/logout")).anyTimes();
        expect(discovery.resolve()).andReturn(endpoints);
        revocation.revoke("https://idp/revoke", "refresh-token", "refresh_token", clientAuthentication);
        revocation.revoke("https://idp/revoke", "access-token", "access_token", clientAuthentication);
        expectLastCall().andThrow(new ClientProtocolException("revocation refused"));
        replay(discovery, endpoints, revocation);

        var redirect = service.logout(session.id());

        assertTrue(redirect.startsWith("https://idp/logout?"), redirect);
        assertTrue(redirect.contains("id_token_hint=id-token"), redirect);
        assertTrue(sessions.use(session.id()).isEmpty());
        assertTrue(tokens.get(session.id()).isEmpty());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "TRAILHAND-104");
        verify(revocation);
    }

    @Test
    @DisplayName("logs out a session without tokens to the own origin")
    void logoutWithoutTokens() {
        assertEquals(ORIGIN + "/", service.logout("unknown"));
    }

    @Test
    @DisplayName("reads groups from a list or a text claim, and auth_time as epoch seconds")
    void claims() {
        assertEquals(List.of("a", "b"), LoginService.groups(ClaimValue.forPlainString("[a, b]")));
        assertEquals(List.of(), LoginService.groups(null));
        assertEquals(Optional.empty(), LoginService.epochSeconds("not a number"));
        assertEquals(Optional.empty(), LoginService.epochSeconds(null));
    }
}
