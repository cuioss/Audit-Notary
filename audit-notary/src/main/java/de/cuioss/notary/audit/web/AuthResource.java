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
package de.cuioss.notary.audit.web;

import de.cuioss.notary.audit.security.LoginService;
import de.cuioss.notary.audit.security.LoginTransactions;
import de.cuioss.notary.audit.security.UserSession;
import de.cuioss.sheriff.token.commons.error.TokenSheriffException;
import io.vertx.ext.web.RoutingContext;
import jakarta.ws.rs.CookieParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.jspecify.annotations.Nullable;

import java.net.URI;
import java.util.Map;

/**
 * The login endpoints of AUN-AUTH-1: {@code GET /api/v1/auth/login?return=}, the provider's redirect back to
 * {@code GET /api/v1/auth/callback} ({@code response_mode=query}), and {@code POST /api/v1/auth/logout}.
 * <p>
 * The callback answers a small same-origin page that navigates to the checked {@code return} by
 * {@code <meta http-equiv="refresh">}, not a redirect: the navigation it starts is same-site and carries the
 * {@code SameSite=Strict} session cookie (AUN-AUTH-1, AUN-WEB-9).
 */
@Path(AuthResource.PATH)
public class AuthResource {

    /** The root of the login requests. */
    public static final String PATH = "/api/v1/auth";

    /** The start of the login, below {@link #PATH}; public. */
    public static final String LOGIN_PATH = "/login";

    /** The provider's return, below {@link #PATH}; public. */
    public static final String CALLBACK_PATH = "/callback";

    private static final String SET_COOKIE = "Set-Cookie";
    private static final String CACHE_CONTROL = "Cache-Control";
    private static final String NO_STORE = "no-store";

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
     * @return a redirect to the provider with the login-transaction cookie, {@code 502} when the provider cannot be
     *         used, or {@code 503} when too many logins are pending
     */
    @GET
    @Path(LOGIN_PATH)
    public Response start(@QueryParam("return") @Nullable String returnAddress) {
        try {
            var started = login.start(returnAddress);
            return Response.status(302).location(URI.create(started.authorizationUrl()))
                    .header(SET_COOKIE, Cookies.loginCookie(started.transactionReference(), LoginTransactions.LIFETIME))
                    .header(CACHE_CONTROL, NO_STORE).build();
        } catch (LoginService.TooManyLoginsException e) {
            return Response.status(503).type(MediaType.APPLICATION_JSON).header("Retry-After", "60")
                    .header(CACHE_CONTROL, NO_STORE).entity(Map.of("outcome", "TOO_MANY_LOGINS")).build();
        } catch (TokenSheriffException | IllegalArgumentException | IllegalStateException e) {
            return Response.status(502).type(MediaType.APPLICATION_JSON)
                    .entity(Map.of("outcome", "IDENTITY_PROVIDER_UNAVAILABLE")).build();
        }
    }

    /**
     * Completes the login from the provider's redirect.
     *
     * @param transaction the login-transaction cookie
     * @param uriInfo     the request address with {@code code}, {@code state} and {@code iss}
     * @return the page that navigates to the return address with the session cookie, or a page that offers a new
     *         login
     */
    @GET
    @Path(CALLBACK_PATH)
    @Produces(MediaType.TEXT_HTML)
    public Response callback(@CookieParam(Cookies.LOGIN) @Nullable String transaction, @Context UriInfo uriInfo) {
        var query = uriInfo.getRequestUri().getRawQuery();
        var completed = login.complete(transaction, query == null ? "" : query);
        var clearLogin = Cookies.expired(Cookies.LOGIN, "Lax");
        if (completed.isEmpty()) {
            var page = page(null, messages.english("auth.callback.failed"), "/api/v1/auth/login?return=/",
                    messages.english("auth.callback.retry"));
            return Response.status(400).entity(page).header(SET_COOKIE, clearLogin)
                    .header(CACHE_CONTROL, NO_STORE).build();
        }
        var target = completed.get().returnAddress();
        var page = page(target, null, target, messages.english("auth.callback.continue"));
        return Response.ok(page).header(SET_COOKIE, clearLogin)
                .header(SET_COOKIE, Cookies.sessionCookie(completed.get().session().id()))
                .header(CACHE_CONTROL, NO_STORE).build();
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
        return Response.ok(Map.of("redirect", redirect)).header(SET_COOKIE, Cookies.expired(Cookies.SESSION, "Strict"))
                .header(CACHE_CONTROL, NO_STORE).build();
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
