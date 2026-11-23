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
