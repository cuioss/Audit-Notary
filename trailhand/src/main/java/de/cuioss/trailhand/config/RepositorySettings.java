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
package de.cuioss.trailhand.config;

import org.jspecify.annotations.Nullable;

import java.time.Period;

/**
 * One repository of {@code trailhand.yaml} (TRH-CONF-2).
 *
 * @param alias           the stable alias, {@code [a-z0-9-]+}
 * @param remote          the remote: an {@code https} URL or a {@code file:} URL of a local bare repository
 * @param confidentiality the confidentiality class: {@code public-internal}, {@code restricted} or
 *                        {@code strongly-restricted}
 * @param retention       the retention period; {@code null} for {@code unlimited}
 * @param credentialRef   the reference to the credential of the technical user; {@code null} for a {@code file:}
 *                        remote
 */
public record RepositorySettings(String alias, String remote, String confidentiality, @Nullable Period retention,
@Nullable String credentialRef) {

    /**
     * @return whether the remote is a local bare repository
     */
    public boolean isLocal() {
        return remote.startsWith("file:");
    }
}
