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
package de.cuioss.trailhand.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("QueryResponseModeRequestBuilder: response_mode=query (TRH-AUTH-1)")
class QueryResponseModeRequestBuilderTest {

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "replaces form_post in place|https://idp/auth?client_id=a&response_mode=form_post&state=s|https://idp/auth?client_id=a&response_mode=query&state=s",
            "adds the parameter|https://idp/auth?client_id=a&state=s|https://idp/auth?client_id=a&state=s&response_mode=query",
            "adds a query|https://idp/auth|https://idp/auth?response_mode=query",
            "fills an empty query|https://idp/auth?|https://idp/auth?response_mode=query",
            "is idempotent|https://idp/auth?response_mode=query|https://idp/auth?response_mode=query",
            "keeps a similar name|https://idp/auth?response_modes=x|https://idp/auth?response_modes=x&response_mode=query"})
    void rewrites(String name, String url, String expected) {
        assertEquals(expected, QueryResponseModeRequestBuilder.withQueryResponseMode(url), name);
    }
}
