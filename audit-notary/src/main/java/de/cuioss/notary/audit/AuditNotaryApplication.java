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

import io.quarkus.runtime.Quarkus;
import io.quarkus.runtime.annotations.QuarkusMain;

import java.util.Arrays;

/**
 * The entry point: {@code --health-probe} and {@code --validate-config <dir>} run without booting Quarkus; anything
 * else starts the application. This class only routes; the logic is in {@link HealthProbe} and
 * {@link ConfigValidation}.
 */
@QuarkusMain
public class AuditNotaryApplication {

    private AuditNotaryApplication() {
        // entry point only
    }

    /**
     * @param args the command line
     */
    public static void main(String... args) {
        var arguments = Arrays.asList(args);
        if (arguments.contains(HealthProbe.FLAG)) {
            System.exit(HealthProbe.probe(HealthProbe.PORT));
        }
        if (arguments.contains(ConfigValidation.FLAG)) {
            System.exit(ConfigValidation.run(args, System::getenv));
        }
        Quarkus.run(args);
    }
}
