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
