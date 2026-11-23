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
package de.cuioss.notary.audit.config;

/**
 * One violation of the configuration: where and which rule (AUN-CONF-1).
 *
 * @param key  the key, e.g. {@code repositories[1].alias}
 * @param rule what is wrong, without the value (a value may be a secret's reference or a URL with user information)
 */
public record Violation(String key, String rule) {
}
