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

import de.cuioss.notary.audit.config.ConfigurationLoader;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.function.UnaryOperator;
import java.util.logging.ConsoleHandler;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * {@code --validate-config <dir>} (AUN-CONF-1): validates {@code audit-notary.yaml} offline with the boot rules; every
 * violation is logged as one ERROR record. Exit code {@code 0} for a valid, {@code 1} for an invalid configuration,
 * {@code 2} for a missing directory argument.
 */
final class ConfigValidation {

    /** The flag that selects the validation. */
    static final String FLAG = "--validate-config";

    private ConfigValidation() {
        // utility
    }

    /**
     * @param args        the command line, starting with the flag
     * @param environment the environment of the placeholders
     * @return the exit code
     */
    static int run(String[] args, UnaryOperator<String> environment) {
        int index = Arrays.asList(args).indexOf(FLAG);
        if (index < 0 || index + 1 >= args.length) {
            return 2;
        }
        ensureConsoleLogging();
        var result = new ConfigurationLoader(environment).load(Path.of(args[index + 1]));
        return result.isValid() ? 0 : 1;
    }

    /**
     * The validation runs without booting Quarkus, so no handler writes the records yet, in the native image in
     * particular; the records of the violations go to the console.
     */
    static void ensureConsoleLogging() {
        var root = Logger.getLogger("");
        // The native image carries Quarkus' delayed handler, which holds records until the boot that never comes.
        if (Arrays.stream(root.getHandlers()).noneMatch(ConsoleHandler.class::isInstance)) {
            var handler = new ConsoleHandler();
            handler.setLevel(Level.INFO);
            root.addHandler(handler);
            root.setLevel(Level.INFO);
        }
    }
}
