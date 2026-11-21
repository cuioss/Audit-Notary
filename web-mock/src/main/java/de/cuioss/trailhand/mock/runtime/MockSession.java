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
package de.cuioss.trailhand.mock.runtime;

/**
 * An emulated web session: the opaque id the cookie carries and the anti-CSRF token of the session
 * (doc/specification/web-app.adoc, TRH-WEB-8).
 *
 * @param id        the session id, the value of {@link MockEngine#SESSION_COOKIE}
 * @param csrfToken the token every state-changing request must carry in {@code X-CSRF-Token}
 */
public record MockSession(String id, String csrfToken) {

    @Override
    public String toString() {
        return "MockSession[id=***, csrfToken=***]";
    }
}
