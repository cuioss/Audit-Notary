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

import lombok.experimental.UtilityClass;

import java.time.Duration;

/**
 * The two cookies of AUN-AUTH-1. Both carry the {@code __Host-} prefix: {@code Secure}, {@code Path=/}, no
 * {@code Domain}.
 */
@UtilityClass
public class Cookies {

    /** The session cookie. */
    public static final String SESSION = "__Host-audit-notary-session";

    /** The login-transaction cookie. */
    public static final String LOGIN = "__Host-audit-notary-login";

    /**
     * @param sessionId the session id
     * @return the {@code Set-Cookie} value of the session: {@code SameSite=Strict}
     */
    public static String sessionCookie(String sessionId) {
        return SESSION + "=" + sessionId + "; Path=/; Secure; HttpOnly; SameSite=Strict";
    }

    /**
     * The login-transaction cookie: {@code SameSite=Lax}, because the browser sends no {@code Strict} cookie with the
     * cross-site navigation back from the identity provider, and the callback is such a navigation by {@code GET}
     * ({@code response_mode=query}). It carries only an opaque reference, lives ten minutes and is deleted by the
     * callback.
     *
     * @param reference the transaction reference
     * @param maxAge    the lifetime
     * @return the {@code Set-Cookie} value
     */
    public static String loginCookie(String reference, Duration maxAge) {
        return LOGIN + "=" + reference + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + maxAge.toSeconds();
    }

    /**
     * @param name a cookie name of this class
     * @param sameSite the {@code SameSite} value it was set with
     * @return the {@code Set-Cookie} value that deletes it
     */
    public static String expired(String name, String sameSite) {
        return name + "=; Path=/; Secure; HttpOnly; SameSite=" + sameSite + "; Max-Age=0";
    }
}
