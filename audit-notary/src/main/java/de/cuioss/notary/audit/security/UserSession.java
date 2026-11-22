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

import org.jspecify.annotations.Nullable;

import java.time.Instant;
import java.util.List;

/**
 * A server-side web session (AUN-AUTH-1): the identity values of the login, the anti-CSRF token and the lifetimes.
 * The browser holds only the opaque session id in a cookie; tokens stay in Token Sheriff's token store under the
 * same id.
 *
 * @param id           the opaque session id, the cookie value
 * @param issuer       {@code iss}
 * @param subject      {@code sub}
 * @param name         the display name from the token
 * @param groups       the groups the rights are mapped from
 * @param authTime     {@code auth_time}, or {@code null} when the token carries none
 * @param acr          {@code acr}, or {@code null}
 * @param csrfToken    the anti-CSRF token of AUN-WEB-8
 * @param created      when the session began
 * @param lastAccess   when the session was last used
 */
public record UserSession(String id, String issuer, String subject, String name, List<String> groups,
@Nullable Instant authTime, @Nullable String acr, String csrfToken, Instant created, Instant lastAccess) {

    /**
     * Copies the groups.
     *
     * @param id         the id
     * @param issuer     the issuer
     * @param subject    the subject
     * @param name       the name
     * @param groups     the groups
     * @param authTime   the authentication time
     * @param acr        the authentication context class
     * @param csrfToken  the anti-CSRF token
     * @param created    the start
     * @param lastAccess the last use
     */
    public UserSession {
        groups = List.copyOf(groups);
    }

    /**
     * @param now the time of the access
     * @return this session, used at {@code now}
     */
    public UserSession touched(Instant now) {
        return new UserSession(id, issuer, subject, name, groups, authTime, acr, csrfToken, created, now);
    }

    @Override
    public String toString() {
        return "UserSession[issuer=" + issuer + ", created=" + created + "]";
    }
}
