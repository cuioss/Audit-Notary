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

import com.fasterxml.jackson.databind.JsonNode;

/**
 * A transition of a state: a request with the given method and path moves the scenario to {@code next} and is
 * answered with {@code status} and {@code body}.
 *
 * @param name   the name of the link inside its state
 * @param method the HTTP method
 * @param path   the request path, without query
 * @param next   the id of the state the request moves to; the own state to stay
 * @param status the HTTP status of the answer
 * @param body   the JSON body of the answer
 */
public record Link(String name, String method, String path, String next, int status, JsonNode body) {

    /**
     * Whether a request matches this link.
     *
     * @param requestMethod the method of the request
     * @param requestPath   the path of the request, without query
     * @return {@code true} when method and path are equal
     */
    public boolean matches(String requestMethod, String requestPath) {
        return method.equals(requestMethod) && path.equals(requestPath);
    }
}
