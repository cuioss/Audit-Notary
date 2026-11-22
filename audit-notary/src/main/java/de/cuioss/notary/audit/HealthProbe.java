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

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * The health check of the distroless image (AUN-OPS-1): {@code /app/application --health-probe} connects to the own
 * management port on the loopback interface and exits {@code 0} or {@code 1} before Quarkus boots. The image has no
 * shell or other program to check with.
 */
final class HealthProbe {

    /** The flag that selects the probe. */
    static final String FLAG = "--health-probe";

    /** The management port (AUN-OPS-2). */
    static final int PORT = 9000;

    private static final int CONNECT_TIMEOUT_MILLIS = 2000;

    private HealthProbe() {
        // utility
    }

    /**
     * @param port the port
     * @return {@code 0} when the port accepts a connection, {@code 1} otherwise
     */
    static int probe(int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), CONNECT_TIMEOUT_MILLIS);
            return 0;
        } catch (IOException e) {
            return 1;
        }
    }
}
