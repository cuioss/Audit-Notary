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

import de.cuioss.notary.audit.config.AuditNotaryConfiguration;
import de.cuioss.notary.audit.config.OidcSettings;
import de.cuioss.notary.audit.config.WebSettings;
import de.cuioss.sheriff.token.client.auth.ClientAuthentication;
import de.cuioss.sheriff.token.client.discovery.CachingDiscoveryResolver;
import de.cuioss.sheriff.token.client.discovery.ProviderMetadata;
import de.cuioss.sheriff.token.client.flow.AuthorizationCodeFlow;
import de.cuioss.sheriff.token.client.flow.CallbackParameters;
import de.cuioss.sheriff.token.client.flow.FlowContext;
import de.cuioss.sheriff.token.client.flow.ParClient;
import de.cuioss.sheriff.token.client.flow.ParResponse;
import de.cuioss.sheriff.token.client.flow.ResponseMode;
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
import org.easymock.EasyMock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableTestLogger
@DisplayName("LoginService: the web login on Token Sheriff (AUN-AUTH-1)")
class LoginServiceTest {

    private static final String ORIGIN = "https://audit-notary.example.org";
    private static final String CALLBACK = ORIGIN + "/api/v1/auth/callback";
    private static final String ISSUER = "https://idp.example.org/realms/audit-notary";

    private CachingDiscoveryResolver discovery;
    private AuthorizationCodeFlow flow;
    private ParClient par;
    private RevocationClient revocation;
    private ProviderMetadata metadata;
    private ClientAuthentication clientAuthentication;
    private TokenLifecycleManager tokens;
    private SessionStore sessions;
    private LoginTransactions transactions;
    private LoginService service;

    @BeforeEach
    void setUp() {
        discovery = EasyMock.createMock(CachingDiscoveryResolver.class);
        flow = EasyMock.createMock(AuthorizationCodeFlow.class);
        par = EasyMock.createMock(ParClient.class);
        revocation = EasyMock.createMock(RevocationClient.class);
        metadata = EasyMock.createNiceMock(ProviderMetadata.class);
        clientAuthentication = EasyMock.createNiceMock(ClientAuthentication.class);
        tokens = new TokenLifecycleManager(new InMemoryTokenStore(), new RefreshScheduler());
        sessions = new SessionStore(Duration.ofMinutes(30), Duration.ofHours(8), Clock.systemUTC());
        transactions = new LoginTransactions();
        service = service(transactions);
    }

    private LoginService service(LoginTransactions pending) {
        var configuration = new AuditNotaryConfiguration(List.of(), Map.of(),
                new OidcSettings(ISSUER, "audit-notary-web", "file:/x", "groups"),
                new WebSettings(URI.create(ORIGIN), Duration.ofMinutes(30), Duration.ofHours(8)), Duration.ofMinutes(5));
        return new LoginService(discovery, flow, par, clientAuthentication, tokens, revocation, sessions, pending,
                new ReturnAddresses(), configuration);
    }

    /** A JWS-shaped token with the given payload; the signature is irrelevant, Token Sheriff validated it. */
    private static String jws(String payloadJson) {
        var encoder = Base64.getUrlEncoder().withoutPadding();
        return encoder.encodeToString("{\"alg\":\"RS256\"}".getBytes(StandardCharsets.UTF_8)) + "."
                + encoder.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8)) + ".c2ln";
    }

    private static IdTokenContent idToken() {
        return new IdTokenContent(Map.of("iss", ClaimValue.forPlainString(ISSUER), "sub", ClaimValue.forPlainString("sub-7"),
                        "name", ClaimValue.forPlainString("Alex Example"),
                        "groups", ClaimValue.forList("[\"assessors\",\"approvers\"]", List.of("assessors", "approvers")),
                        "auth_time", ClaimValue.forPlainString("1795161600"), "acr", ClaimValue.forPlainString("1")),
                jws("{\"sub\":\"sub-7\",\"groups\":[\"assessors\",\"approvers\"]}"));
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
        expect(discovery.resolve()).andReturn(metadata).anyTimes();
        expect(metadata.getPushedAuthorizationRequestEndpoint()).andReturn(Optional.empty()).anyTimes();
        expect(flow.authorize(metadata, LoginService.authorizationOptions()))
                .andReturn(new AuthorizationCodeFlow.AuthorizationRedirect("https://idp/auth?x", context)).times(2);
        replay(discovery, flow, metadata);

        var first = service.start("/samm/payments");
        service.start("//evil.example");

        assertEquals("https://idp/auth?x", first.authorizationUrl());
        assertEquals("/samm/payments", transactions.take(first.transactionReference()).orElseThrow().returnAddress());
        verify(discovery, flow);
    }

    @Test
    @DisplayName("asks for response_mode=query through Token Sheriff's request options (AUN-AUTH-1)")
    void queryResponseMode() {
        assertEquals(ResponseMode.QUERY, LoginService.authorizationOptions().getResponseMode());
    }

    @Test
    @DisplayName("pushes the authorization parameters when the provider offers PAR and sends only the request_uri")
    void startWithPar() {
        var context = FlowContext.create(CALLBACK);
        expect(discovery.resolve()).andReturn(metadata).anyTimes();
        expect(metadata.getPushedAuthorizationRequestEndpoint()).andReturn(Optional.of("https://idp/par")).anyTimes();
        expect(flow.authorize(metadata, LoginService.authorizationOptions())).andReturn(new AuthorizationCodeFlow.AuthorizationRedirect(
                "https://idp/auth?client_id=audit-notary-web&state=s%201&response_mode=query&flag", context));
        var pushed = new LinkedHashMap<String, String>();
        pushed.put("client_id", "audit-notary-web");
        pushed.put("state", "s 1");
        pushed.put("response_mode", "query");
        pushed.put("flag", "");
        var answer = new ParResponse();
        answer.requestUri = "urn:ietf:params:oauth:request_uri:abc";
        expect(par.pushAuthorizationRequest("https://idp/par", pushed, clientAuthentication)).andReturn(answer);
        replay(discovery, flow, metadata, par);

        var started = service.start("/");

        assertEquals("https://idp/auth?client_id=audit-notary-web&request_uri=urn%3Aietf%3Aparams%3Aoauth%3Arequest_uri%3Aabc",
                started.authorizationUrl());
        verify(par);
    }

    @Test
    @DisplayName("refuses a PAR answer without request_uri and a start while too many logins are pending")
    void startRefusals() {
        var context = FlowContext.create(CALLBACK);
        expect(discovery.resolve()).andReturn(metadata).anyTimes();
        expect(metadata.getPushedAuthorizationRequestEndpoint()).andReturn(Optional.of("https://idp/par")).anyTimes();
        expect(flow.authorize(metadata, LoginService.authorizationOptions())).andReturn(
                new AuthorizationCodeFlow.AuthorizationRedirect("https://idp/auth?client_id=c", context)).times(2);
        expect(par.pushAuthorizationRequest(anyObject(), anyObject(), anyObject())).andReturn(new ParResponse());
        replay(discovery, flow, metadata, par);

        assertThrows(IllegalStateException.class, () -> service.start("/"));
        var full = service(new LoginTransactions(Clock.systemUTC(), 0));
        assertThrows(LoginService.TooManyLoginsException.class, () -> full.start("/"));
    }

    @Test
    @DisplayName("frees the place of a login whose PAR request fails, so the next login can start")
    void parFailureFreesCapacity() {
        var context = FlowContext.create(CALLBACK);
        var single = service(new LoginTransactions(Clock.systemUTC(), 1));
        expect(discovery.resolve()).andReturn(metadata).anyTimes();
        expect(metadata.getPushedAuthorizationRequestEndpoint()).andReturn(Optional.of("https://idp/par")).anyTimes();
        expect(flow.authorize(metadata, LoginService.authorizationOptions())).andReturn(
                new AuthorizationCodeFlow.AuthorizationRedirect("https://idp/auth?client_id=c", context)).times(2);
        var answer = new ParResponse();
        answer.requestUri = "urn:x";
        expect(par.pushAuthorizationRequest(anyObject(), anyObject(), anyObject()))
                .andThrow(new ClientProtocolException("PAR refused")).andReturn(answer);
        replay(discovery, flow, metadata, par);

        assertThrows(ClientProtocolException.class, () -> single.start("/"));

        assertEquals("https://idp/auth?client_id=c&request_uri=urn%3Ax", single.start("/").authorizationUrl());
    }

    @Test
    @DisplayName("completes a login into a session with the identity values and keeps the tokens server-side")
    void complete() {
        var context = FlowContext.create(CALLBACK);
        var reference = transactions.begin(context, "/incidents").orElseThrow();
        expect(discovery.resolve()).andReturn(metadata).anyTimes();
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
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.INFO, "AUDIT-NOTARY-3");
        assertTrue(transactions.take(reference).isEmpty(), "a transaction completes once");
    }

    @Test
    @DisplayName("refuses a callback without cookie, with an unknown transaction or with a refused exchange")
    void refusals() {
        var context = FlowContext.create(CALLBACK);
        var reference = transactions.begin(context, "/").orElseThrow();
        expect(discovery.resolve()).andReturn(metadata).anyTimes();
        expect(flow.exchange(anyObject(), anyObject(), anyObject(), anyObject()))
                .andThrow(new ClientProtocolException("state mismatch"));
        replay(discovery, flow);

        assertTrue(service.complete(null, "code=a").isEmpty());
        assertTrue(service.complete("unknown", "code=a").isEmpty());
        assertTrue(service.complete(reference, "code=a&state=wrong").isEmpty());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "AUDIT-NOTARY-103");
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
        expect(discovery.resolve()).andReturn(endpoints).anyTimes();
        revocation.revoke("https://idp/revoke", "refresh-token", "refresh_token", clientAuthentication);
        revocation.revoke("https://idp/revoke", "access-token", "access_token", clientAuthentication);
        expectLastCall().andThrow(new ClientProtocolException("revocation refused"));
        replay(discovery, endpoints, revocation);

        var redirect = service.logout(session.id());

        assertTrue(redirect.startsWith("https://idp/logout?"), redirect);
        assertTrue(redirect.contains("id_token_hint=id-token"), redirect);
        assertTrue(sessions.use(session.id()).isEmpty());
        assertTrue(tokens.get(session.id()).isEmpty());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "AUDIT-NOTARY-104");
        verify(revocation);
    }

    @Test
    @DisplayName("completes the logout to the own origin when the provider's metadata cannot be read")
    void logoutWithoutProvider() {
        var session = sessions.open(new LoginIdentity(ISSUER, "sub-8", "Kim", List.of(), null, null));
        tokens.store(session.id(), new StoredToken("access-token",
                "refresh-token", "id-token", null, Instant.now().plusSeconds(300), "sub-8"));
        expect(discovery.resolve()).andThrow(new ClientProtocolException("metadata expired")).anyTimes();
        replay(discovery, revocation);

        var redirect = service.logout(session.id());

        assertEquals(ORIGIN + "/", redirect);
        assertTrue(sessions.use(session.id()).isEmpty());
        assertTrue(tokens.get(session.id()).isEmpty());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "AUDIT-NOTARY-106");
        verify(revocation);
    }

    @Test
    @DisplayName("logs out a session without tokens to the own origin")
    void logoutWithoutTokens() {
        assertEquals(ORIGIN + "/", service.logout("unknown"));
    }

    @Test
    @DisplayName("reads the groups as the provider wrote them: a comma inside a group name keeps it one group")
    void groups() {
        assertEquals(List.of("auditors,admins", "readers"),
                LoginService.groups(jws("{\"memberOf\":[\"auditors,admins\",\"readers\",7,\" \"]}"), "memberOf"));
        assertEquals(List.of("auditors,admins"), LoginService.groups(jws("{\"memberOf\":\"auditors,admins\"}"), "memberOf"));
        assertEquals(List.of(), LoginService.groups(jws("{\"memberOf\":{\"a\":1}}"), "memberOf"));
        assertEquals(List.of(), LoginService.groups(jws("{\"memberOf\":\" \"}"), "memberOf"));
        assertEquals(List.of(), LoginService.groups(jws("{}"), "memberOf"));
    }

    @Test
    @DisplayName("grants no group from a token it cannot read")
    void unreadableGroups() {
        assertEquals(List.of(), LoginService.groups("not-a-jws", "groups"));
        assertEquals(List.of(), LoginService.groups("a.%%%.c", "groups"));
        assertEquals(List.of(), LoginService.groups("a." + Base64.getUrlEncoder().encodeToString("[".getBytes(
                StandardCharsets.UTF_8)) + ".c", "groups"));
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "AUDIT-NOTARY-103");
    }

    @Test
    @DisplayName("reads auth_time as epoch seconds and splits a query into its decoded parameters")
    void parsing() {
        assertEquals(Optional.empty(), LoginService.epochSeconds("not a number"));
        assertEquals(Optional.empty(), LoginService.epochSeconds(null));
        assertEquals(Map.of("a", "1 2", "b", ""), LoginService.queryParameters("a=1+2&&b"));
    }
}
