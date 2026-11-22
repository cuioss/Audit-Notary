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
