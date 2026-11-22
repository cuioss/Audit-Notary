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

import java.io.Serial;

/**
 * Stops the boot on an invalid configuration (AUN-CONF-1). The violations themselves were logged one by one.
 */
public class InvalidConfigurationException extends IllegalStateException {

    @Serial
    private static final long serialVersionUID = 1L;

    /**
     * @param violations the number of violations
     */
    public InvalidConfigurationException(int violations) {
        super("Invalid configuration: " + violations + " violation(s), see the log records AUDIT-NOTARY-200");
    }
}
