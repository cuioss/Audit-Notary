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
package de.cuioss.notary.audit.web;

import lombok.experimental.UtilityClass;

/**
 * The JSON bodies of the refusals of AUN-WEB-9, written by the request gate before any resource runs.
 */
@UtilityClass
public class ApiAnswers {

    /** The login address a {@code 401} names. */
    public static final String LOGIN_ADDRESS = "/api/v1/auth/login";

    /** {@code 401 UNAUTHENTICATED}. */
    public static final String UNAUTHENTICATED = "{\"outcome\":\"UNAUTHENTICATED\",\"login\":\"" + LOGIN_ADDRESS + "\"}";

    /** {@code 403 CSRF_REJECTED}. */
    public static final String CSRF_REJECTED = "{\"outcome\":\"CSRF_REJECTED\"}";
}
