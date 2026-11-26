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
import org.jspecify.annotations.Nullable;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A transition of a state: a request with the given method and path moves the scenario to {@code next} and is
 * answered with {@code status} and {@code body}.
 *
 * @param name   the name of the link inside its state
 * @param method the HTTP method
 * @param path   the request path, without query
 * @param query  the query parameters the request must carry, possibly none (a link with a query is the more specific)
 * @param next   the id of the state the request moves to; the own state to stay
 * @param status the HTTP status of the answer
 * @param body   the JSON body of the answer
 * @param requires the right the user must hold for the link to answer and move on, or {@code null}
 */
public record Link(String name, String method, String path, Map<String, String> query, String next, int status,
JsonNode body, @Nullable Requirement requires) {

    /**
     * Copies the query in its order.
     *
     * @param name   the link name
     * @param method the method
     * @param path   the path, without query
     * @param query  the query parameters the request must carry, possibly empty
     * @param next   the state the link leads to
     * @param status the HTTP status
     * @param body   the JSON body
     * @param requires the right the user must hold for the link to answer and move on, or {@code null}
     */
    public Link {
        query = Collections.unmodifiableMap(new LinkedHashMap<>(query));
    }

    /**
     * Whether a request matches this link.
     *
     * @param requestMethod the method of the request
     * @param requestPath   the path of the request, without query
     * @param requestQuery  the decoded parameters of the request
     * @return {@code true} when method and path are equal and the request carries every parameter of the link
     */
    public boolean matches(String requestMethod, String requestPath, Map<String, String> requestQuery) {
        return key().matches(requestMethod, requestPath, requestQuery);
    }

    /**
     * What the link names.
     *
     * @return method, path and query as a route key
     */
    public RouteKey key() {
        return new RouteKey(method, path, query);
    }
}
