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
package de.cuioss.trailhand.web;

import de.cuioss.sheriff.token.commons.error.TokenSheriffException;
import de.cuioss.trailhand.security.LoginService;
import de.cuioss.trailhand.security.LoginTransactions;
import de.cuioss.trailhand.security.UserSession;
import io.vertx.ext.web.RoutingContext;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.CookieParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jspecify.annotations.Nullable;

import java.net.URI;
import java.util.Map;

/**
 * The login endpoints of TRH-AUTH-1: {@code GET /api/v1/auth/login?return=}, the provider's form post to
 * {@code POST /api/v1/auth/callback}, and {@code POST /api/v1/auth/logout}.
 * <p>
 * The callback answers a small same-origin page that navigates to the checked {@code return} by
 * {@code <meta http-equiv="refresh">}, not a redirect: the navigation it starts is same-site and carries the
 * {@code SameSite=Strict} session cookie (TRH-AUTH-1, TRH-WEB-9).
 */
@Path("/api/v1/auth")
public class AuthResource {

    private final LoginService login;
    private final MessageCatalogue messages;

    /**
     * @param login    the login service
     * @param messages the catalogue for the callback page
     */
    public AuthResource(LoginService login, MessageCatalogue messages) {
        this.login = login;
        this.messages = messages;
    }

    /**
     * Starts the login.
     *
     * @param returnAddress the address to return to
     * @return a redirect to the provider with the login-transaction cookie, or {@code 502} when the provider cannot
     *         be used
     */
    @GET
    @Path("/login")
    public Response start(@QueryParam("return") @Nullable String returnAddress) {
        try {
            var started = login.start(returnAddress);
            return Response.status(302).location(URI.create(started.authorizationUrl()))
                    .header("Set-Cookie", Cookies.login(started.transactionReference(), LoginTransactions.LIFETIME))
                    .header("Cache-Control", "no-store").build();
        } catch (TokenSheriffException | IllegalArgumentException | IllegalStateException e) {
            return Response.status(502).type(MediaType.APPLICATION_JSON)
                    .entity(Map.of("outcome", "IDENTITY_PROVIDER_UNAVAILABLE")).build();
        }
    }

    /**
     * Completes the login from the provider's form post.
     *
     * @param transaction the login-transaction cookie
     * @param body        the form body
     * @return the page that navigates to the return address with the session cookie, or a page that offers a new
     *         login
     */
    @POST
    @Path("/callback")
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    @Produces(MediaType.TEXT_HTML)
    public Response callback(@CookieParam(Cookies.LOGIN) @Nullable String transaction, String body) {
        var completed = login.complete(transaction, body);
        var clearLogin = Cookies.expired(Cookies.LOGIN, "None");
        if (completed.isEmpty()) {
            var page = page(null, messages.english("auth.callback.failed"), "/api/v1/auth/login?return=/",
                    messages.english("auth.callback.retry"));
            return Response.status(400).entity(page).header("Set-Cookie", clearLogin)
                    .header("Cache-Control", "no-store").build();
        }
        var target = completed.get().returnAddress();
        var page = page(target, null, target, messages.english("auth.callback.continue"));
        return Response.ok(page).header("Set-Cookie", clearLogin)
                .header("Set-Cookie", Cookies.session(completed.get().session().id()))
                .header("Cache-Control", "no-store").build();
    }

    /**
     * Ends the session (RP-initiated logout); the gate has checked the anti-CSRF header.
     *
     * @param context the routing context with the session
     * @return the address the web app navigates to
     */
    @POST
    @Path("/logout")
    @Produces(MediaType.APPLICATION_JSON)
    public Response logout(@Context RoutingContext context) {
        UserSession session = context.get(RequestGate.SESSION_KEY);
        var redirect = login.logout(session.id());
        return Response.ok(Map.of("redirect", redirect)).header("Set-Cookie", Cookies.expired(Cookies.SESSION, "Strict"))
                .header("Cache-Control", "no-store").build();
    }

    private String page(@Nullable String refreshTo, @Nullable String text, String link, String linkText) {
        var refresh = refreshTo == null ? ""
                : "<meta http-equiv=\"refresh\" content=\"0;url=" + escape(refreshTo) + "\">";
        var paragraph = text == null ? "" : "<p>" + escape(text) + "</p>";
        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" + refresh + "<title>"
                + escape(messages.english("auth.callback.title")) + "</title></head><body>" + paragraph
                + "<p><a href=\"" + escape(link) + "\">" + escape(linkText) + "</a></p></body></html>";
    }

    static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
