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
