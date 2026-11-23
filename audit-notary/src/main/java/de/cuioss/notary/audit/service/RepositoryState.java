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
package de.cuioss.notary.audit.service;

/**
 * The fetch state of one repository as the status request and the health checks report it (AUN-OPS-2, AUN-GEN-6).
 *
 * @param alias   the alias
 * @param present whether a valid local repository exists (fetched now or kept from an earlier fetch)
 * @param fetchUp whether the last fetch succeeded
 */
public record RepositoryState(String alias, boolean present, boolean fetchUp) {
}
