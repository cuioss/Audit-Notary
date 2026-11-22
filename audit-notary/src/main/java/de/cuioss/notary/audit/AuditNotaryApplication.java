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
