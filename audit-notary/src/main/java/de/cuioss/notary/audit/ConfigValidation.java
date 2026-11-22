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
