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

import com.fasterxml.jackson.databind.JsonNode;

/**
 * A state-changing request the web app sent, recorded for tests ({@code GET /mock/acts}).
 *
 * @param method the HTTP method
 * @param path   the path
 * @param state  the state the scenario was in when the request arrived
 * @param body   the request body as JSON; a text node when it was no JSON, a null node when it was empty
 */
public record Act(String method, String path, String state, JsonNode body) {
}
