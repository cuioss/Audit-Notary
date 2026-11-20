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

import de.cuioss.trailhand.config.Action;
import de.cuioss.trailhand.security.RightsMapper;
import de.cuioss.trailhand.security.UserSession;
import io.vertx.ext.web.RoutingContext;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import org.jspecify.annotations.Nullable;

import java.util.List;

/**
 * {@code GET /api/v1/session} (TRH-WEB-9): the user, the rights and the anti-CSRF token. The pseudonym comes with the
 * person directory (TRH-DIR-2); until it is built the first login is not required and the pseudonym is {@code null}.
 */
@Path("/api/v1/session")
public class SessionResource {

    private final RightsMapper rights;

    /**
     * @param rights the rights mapping
     */
    public SessionResource(RightsMapper rights) {
        this.rights = rights;
    }

    /**
     * @param context the routing context holding the session the gate found
     * @return the session
     */
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public SessionBody session(@Context RoutingContext context) {
        UserSession session = context.get(RequestGate.SESSION_KEY);
        var mapped = rights.rightsOf(session.groups()).entrySet().stream()
                .map(entry -> new RightBody(entry.getKey(), entry.getValue().stream().map(Action::wireName).toList()))
                .toList();
        return new SessionBody(new UserBody(null, session.name()), mapped, session.csrfToken(), false);
    }

    /**
     * The body of the session.
     *
     * @param user               the user
     * @param rights             the rights per repository
     * @param csrfToken          the anti-CSRF token
     * @param firstLoginRequired whether the own directory entry must be saved first
     */
    public record SessionBody(UserBody user, List<RightBody> rights, String csrfToken, boolean firstLoginRequired) {
    }

    /**
     * The user.
     *
     * @param pseudonym the pseudonym, {@code null} until the directory entry exists
     * @param name      the display name
     */
    public record UserBody(@Nullable String pseudonym, String name) {
    }

    /**
     * The actions on one repository.
     *
     * @param repository the alias
     * @param actions    the actions
     */
    public record RightBody(String repository, List<String> actions) {
    }
}
