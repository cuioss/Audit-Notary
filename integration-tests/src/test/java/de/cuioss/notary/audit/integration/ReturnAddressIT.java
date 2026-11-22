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
package de.cuioss.notary.audit.integration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("The return address of the login (AUN-AUTH-1)")
class ReturnAddressIT {

    @ParameterizedTest
    @CsvSource({"/incidents/2026/inc-0007,/incidents/2026/inc-0007", "%2F%2Fevil.example%2Fx,/",
            "https%3A%2F%2Fevil.example,/", "/not/a/view/at/all,/"})
    @DisplayName("only a canonical address is returned to; anything else becomes /")
    void returnAddress(String requested, String expected) {
        var login = Stack.login("alex-assessor", requested);

        assertTrue(login.callback().asString().contains("content=\"0;url=" + expected + "\""),
                login.callback().asString());
    }
}
