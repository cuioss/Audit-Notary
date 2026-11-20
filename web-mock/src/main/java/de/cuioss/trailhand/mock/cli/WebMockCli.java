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
package de.cuioss.trailhand.mock.cli;

import de.cuioss.tools.logging.CuiLogger;
import de.cuioss.trailhand.mock.WebMock;
import de.cuioss.trailhand.mock.WebMockLogMessages;
import lombok.experimental.UtilityClass;

import java.io.IOException;
import java.io.PrintStream;
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
        PrintStream out = System.out;
        var parsed = CliOptions.parse(List.of(args), System.getenv());
        if (parsed.options().isEmpty()) {
            LOGGER.error(WebMockLogMessages.ERROR.INVALID_ARGUMENTS, parsed.error());
            out.println(CliOptions.USAGE);
            System.exit(2);
            return;
        }
        var options = parsed.options().get();
        if (options.help()) {
            out.println(CliOptions.USAGE);
            return;
        }
        var mock = WebMock.start(options.scenario(), options.port(), options.timing());
        var stopped = new CountDownLatch(1);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            mock.close();
            stopped.countDown();
        }, "web-mock-shutdown"));
        out.println("web-mock listening on " + mock.baseUrl() + " scenario " + mock.current());
        out.flush();
        stopped.await();
    }
}
