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
 * The identity values a completed login yields (AUN-AUTH-3: issuer, subject, authentication time and context).
 *
 * @param issuer   {@code iss}
 * @param subject  {@code sub}
 * @param name     the display name
 * @param groups   the groups of the configured claim
 * @param authTime {@code auth_time}, or {@code null}
 * @param acr      {@code acr}, or {@code null}
 */
public record LoginIdentity(String issuer, String subject, String name, List<String> groups,
@Nullable Instant authTime, @Nullable String acr) {

    /**
     * Copies the groups.
     *
     * @param issuer   the issuer
     * @param subject  the subject
     * @param name     the name
     * @param groups   the groups
     * @param authTime the authentication time
     * @param acr      the authentication context class
     */
    public LoginIdentity {
        groups = List.copyOf(groups);
    }
}
