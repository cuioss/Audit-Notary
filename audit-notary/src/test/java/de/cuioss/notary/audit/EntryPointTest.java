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
package de.cuioss.notary.audit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("The command-line modes of the binary (AUN-OPS-1, AUN-CONF-1)")
class EntryPointTest {

    @Test
    @DisplayName("--health-probe answers 0 for a listening port and 1 for a closed one")
    void healthProbe() throws Exception {
        int port;
        try (var server = new ServerSocket(0)) {
            port = server.getLocalPort();
            assertEquals(0, HealthProbe.probe(port));
        }
        assertEquals(1, HealthProbe.probe(port));
    }

    @Test
    @DisplayName("--validate-config answers 0, 1, or 2 without a directory")
    void validateConfig(@TempDir Path directory) throws Exception {
        assertEquals(2, ConfigValidation.run(new String[]{ConfigValidation.FLAG}, name -> null));
        assertEquals(1, ConfigValidation.run(new String[]{ConfigValidation.FLAG, directory.toString()}, name -> null));
        Files.copy(Path.of("src/test/resources/config/audit-notary.yaml"), directory.resolve("audit-notary.yaml"));
        assertEquals(0, ConfigValidation.run(new String[]{ConfigValidation.FLAG, directory.toString()}, name -> null));
    }
}
