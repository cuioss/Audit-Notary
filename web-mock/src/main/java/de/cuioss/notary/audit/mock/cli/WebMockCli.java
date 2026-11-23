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
package de.cuioss.notary.audit.mock.cli;

import de.cuioss.notary.audit.mock.WebMock;
import de.cuioss.notary.audit.mock.WebMockLogMessages;
import de.cuioss.tools.logging.CuiLogger;
import lombok.experimental.UtilityClass;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CountDownLatch;

/**
 * The command line of the web mock: starts a {@link WebMock} and runs until the process is stopped.
 * <p>
 * On start it prints one line {@code web-mock listening on http://127.0.0.1:<port> scenario <name#state>} to
 * standard output, which {@code start.sh} and the end-to-end setup wait for.
 */
@UtilityClass
public class WebMockCli {

    private static final CuiLogger LOGGER = new CuiLogger(WebMockCli.class);

    /**
     * Runs the web mock.
     *
     * @param args see {@link CliOptions#USAGE}
     * @throws IOException          if the port cannot be bound
     * @throws InterruptedException if the main thread is interrupted while waiting
     */
    public static void main(String[] args) throws IOException, InterruptedException {
        var parsed = CliOptions.parse(List.of(args), System.getenv());
        if (parsed.options().isEmpty()) {
            LOGGER.error(WebMockLogMessages.ERROR.INVALID_ARGUMENTS, parsed.error());
            LOGGER.info(WebMockLogMessages.INFO.USAGE, CliOptions.USAGE);
            System.exit(2);
            return;
        }
        var options = parsed.options().get();
        if (options.help()) {
            LOGGER.info(WebMockLogMessages.INFO.USAGE, CliOptions.USAGE);
            return;
        }
        var mock = WebMock.start(options.scenario(), options.port(), options.timing());
        var stopped = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            mock.close();
            stopped.countDown();
        }, "web-mock-shutdown"));
        stopped.await();
    }
}
