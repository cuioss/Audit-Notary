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
package de.cuioss.notary.audit.config;

import org.jspecify.annotations.Nullable;

import java.util.List;

/**
 * The result of loading {@code audit-notary.yaml}: the configuration, or every violation.
 *
 * @param configuration the configuration; {@code null} when there is a violation
 * @param violations    the violations, empty for a valid configuration
 */
public record ConfigurationResult(@Nullable AuditNotaryConfiguration configuration, List<Violation> violations) {

    /**
     * Copies the violations.
     *
     * @param configuration the configuration
     * @param violations    the violations
     */
    public ConfigurationResult {
        violations = List.copyOf(violations);
    }

    /**
     * @return whether the configuration is valid
     */
    public boolean isValid() {
        return configuration != null && violations.isEmpty();
    }
}
