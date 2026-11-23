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
package de.cuioss.notary.audit.mock.scenario;

/**
 * A timed transition of a state, taken without a request.
 *
 * @param afterMs the delay after entering the state, in milliseconds
 * @param next    the id of the state to move to
 */
public record AutoTransition(long afterMs, String next) {
}
