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
package de.cuioss.notary.audit.web;

import de.cuioss.notary.audit.config.AuditNotaryConfiguration;
import de.cuioss.notary.audit.security.SessionStore;
import de.cuioss.notary.audit.security.UserSession;
import de.cuioss.tools.logging.CuiLogger;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.http.HttpMethod;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import org.jspecify.annotations.Nullable;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

import static de.cuioss.notary.audit.AuditNotaryLogMessages.WARN;

/**
 * The gate in front of every request (AUN-AUTH-1, AUN-WEB-1, AUN-WEB-8):
 * <ul>
 * <li>the security headers on every answer: the Content Security Policy, {@code nosniff}, {@code no-referrer};</li>
 * <li>for {@code /api/v1}: the session from its cookie, {@code 401 UNAUTHENTICATED} without one except for the public
 * requests, and for every state-changing request the anti-CSRF header and the {@code Origin} check, else
 * {@code 403 CSRF_REJECTED};</li>
 * <li>for every other {@code GET} that names no file of the web app: the web app's {@code index.html}, so a canonical
 * address can be reloaded (AUN-WEB-3).</li>
 * </ul>
 */
@ApplicationScoped
public class RequestGate {

    private static final CuiLogger LOGGER = new CuiLogger(RequestGate.class);

    /** The key of the session in the routing context. */
    public static final String SESSION_KEY = "audit-notary.session";

    /** The anti-CSRF header. */
    public static final String CSRF_HEADER = "X-CSRF-Token";

    /** The requests answered without a session; each path is the constant its resource declares itself under. */
    private static final Set<String> PUBLIC_GET = Set.of(StatusResource.PATH, MessagesResource.PATH,
            AuthResource.PATH + AuthResource.LOGIN_PATH, AuthResource.PATH + AuthResource.CALLBACK_PATH);
    private static final String STATIC_ROOT = "META-INF/resources";

    private final SessionStore sessions;
    private final PagePolicy pagePolicy;
    private final String ownOrigin;

    /**
     * @param sessions      the sessions
     * @param pagePolicy    the policy and the start page
     * @param configuration the configuration with the own origin
     */
    public RequestGate(SessionStore sessions, PagePolicy pagePolicy, AuditNotaryConfiguration configuration) {
        this.sessions = sessions;
        this.pagePolicy = pagePolicy;
        this.ownOrigin = configuration.web().originHeaderValue();
    }

    void register(@Observes Router router) {
        router.route().order(-200).handler(this::headers);
        router.route("/api/v1/*").order(-150).handler(this::api);
        router.get().order(-100).handler(this::appPage);
    }

    void headers(RoutingContext context) {
        context.addHeadersEndHandler(handler -> {
            var headers = context.response().headers();
            headers.set("Content-Security-Policy", pagePolicy.getPolicy());
            headers.set("X-Content-Type-Options", "nosniff");
            headers.set("Referrer-Policy", "no-referrer");
        });
        context.next();
    }

    void api(RoutingContext context) {
        var path = context.normalizedPath();
        var method = context.request().method();
        var session = session(context);
        if (session != null) {
            context.put(SESSION_KEY, session);
        }
        if (method == HttpMethod.GET && PUBLIC_GET.contains(path)) {
            context.next();
            return;
        }
        if (session == null) {
            refuse(context, 401, ApiAnswers.UNAUTHENTICATED);
            return;
        }
        if (method != HttpMethod.GET && method != HttpMethod.HEAD && !csrfValid(context, session)) {
            LOGGER.warn(WARN.CSRF_REJECTED, method, path);
            refuse(context, 403, ApiAnswers.CSRF_REJECTED);
            return;
        }
        context.next();
    }

    private boolean csrfValid(RoutingContext context, UserSession session) {
        var origin = context.request().getHeader("Origin");
        if (origin != null && !ownOrigin.equals(origin)) {
            return false;
        }
        var token = context.request().getHeader(CSRF_HEADER);
        return token != null && MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),
                session.csrfToken().getBytes(StandardCharsets.UTF_8));
    }

    @Nullable
    private UserSession session(RoutingContext context) {
        var cookie = context.request().getCookie(Cookies.SESSION);
        return cookie == null ? null : sessions.use(cookie.getValue()).orElse(null);
    }

    private static void refuse(RoutingContext context, int status, String body) {
        context.response().setStatusCode(status).putHeader("Content-Type", "application/json")
                .putHeader("Cache-Control", "no-store").end(body);
    }

    void appPage(RoutingContext context) {
        var path = context.normalizedPath();
        if (!pagePolicy.hasIndex() || path.startsWith("/api/") || path.startsWith("/q/") || isWebAppFile(path)) {
            context.next();
            return;
        }
        context.response().putHeader("Content-Type", "text/html; charset=utf-8").putHeader("Cache-Control", "no-cache")
                .end(Buffer.buffer(pagePolicy.index()));
    }

    private static boolean isWebAppFile(String path) {
        if ("/".equals(path) || path.endsWith("/") || path.contains("..")) {
            return false;
        }
        return RequestGate.class.getClassLoader().getResource(STATIC_ROOT + path) != null;
    }
}
