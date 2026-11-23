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
import de.cuioss.notary.audit.mock.runtime.Timing;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The parsed command line of the web mock.
 *
 * @param scenario the scenario reference ({@code -s}, {@code --scenario}); default {@value WebMock#DEFAULT_SCENARIO}
 * @param port     the port ({@code -p}, {@code --port}); default {@code AUDIT_NOTARY_MOCK_PORT} or
 *                 {@value WebMock#DEFAULT_PORT}; {@code 0} picks a free one
 * @param timing   the timing ({@code -t}, {@code --timing}): {@code realistic} (default) or {@code ordered}
 * @param help     whether {@code -h} or {@code --help} was given
 */
public record CliOptions(String scenario, int port, Timing timing, boolean help) {

    /** The environment variable that sets the default port. */
    public static final String PORT_VARIABLE = "AUDIT_NOTARY_MOCK_PORT";

    /** The usage text. */
    public static final String USAGE = """
            Usage: WebMockCli [-s|--scenario <name|name#state|file.json>] [-p|--port <port>] \
            [-t|--timing realistic|ordered] [-h|--help]
              --scenario  profile to start with (default workshop)
              --port      port on 127.0.0.1 (default $AUDIT_NOTARY_MOCK_PORT or 7420; 0 = any free port)
              --timing    realistic waits for event delays, ordered plays them at once (default realistic)""";

    /**
     * Parses the arguments.
     *
     * @param args        the command-line arguments
     * @param environment the environment, for {@value #PORT_VARIABLE}
     * @return the options, or the reason when an argument is invalid
     */
    public static ParseResult parse(List<String> args, Map<String, String> environment) {
        String scenario = WebMock.DEFAULT_SCENARIO;
        String portText = environment.getOrDefault(PORT_VARIABLE, String.valueOf(WebMock.DEFAULT_PORT));
        String timingText = "realistic";
        boolean help = false;
        var remaining = args.iterator();
        while (remaining.hasNext()) {
            String arg = remaining.next();
            switch (arg) {
                case "-h", "--help" -> help = true;
                case "-s", "--scenario", "-p", "--port", "-t", "--timing" -> {
                    if (!remaining.hasNext()) {
                        return ParseResult.error("Missing value for " + arg);
                    }
                    String value = remaining.next();
                    switch (arg) {
                        case "-s", "--scenario" -> scenario = value;
                        case "-p", "--port" -> portText = value;
                        default -> timingText = value;
                    }
                }
                default -> {
                    return ParseResult.error("Unknown argument " + arg);
                }
            }
        }
        int port;
        try {
            port = Integer.parseInt(portText.trim());
        } catch (NumberFormatException e) {
            return ParseResult.error("Port is no number: " + portText);
        }
        if (port < 0 || port > 65_535) {
            return ParseResult.error("Port out of range: " + port);
        }
        Optional<Timing> timing = Timing.parse(timingText);
        if (timing.isEmpty()) {
            return ParseResult.error("Timing must be realistic or ordered: " + timingText);
        }
        return new ParseResult(Optional.of(new CliOptions(scenario, port, timing.get(), help)), "");
    }

    /**
     * The outcome of {@link #parse(List, Map)}.
     *
     * @param options the options, empty when the arguments are invalid
     * @param error   the reason, empty when the options are present
     */
    public record ParseResult(Optional<CliOptions> options, String error) {

        static ParseResult error(String reason) {
            return new ParseResult(Optional.empty(), reason);
        }
    }
}
