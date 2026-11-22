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
