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
package de.cuioss.notary.audit.mock.runtime;

/**
 * An emulated web session: the opaque id the cookie carries and the anti-CSRF token of the session
 * (doc/specification/web-app.adoc, AUN-WEB-8).
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
