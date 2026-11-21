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
package de.cuioss.trailhand.mock;

import de.cuioss.tools.logging.LogRecord;
import de.cuioss.tools.logging.LogRecordModel;
import lombok.experimental.UtilityClass;

/**
 * The {@link LogRecord} holder of the web mock. Identifiers carry the prefix {@value #PREFIX} and follow the CUI
 * ranges: INFO 1-99, WARN 100-199, ERROR 200-299. The catalogue is {@code web-mock/doc/LogMessages.adoc}.
 */
@UtilityClass
public final class WebMockLogMessages {

    /** The prefix of every identifier of the web mock. */
    public static final String PREFIX = "WEB_MOCK";

    /** Messages at level INFO. */
    @UtilityClass
    public static final class INFO {

        /** The mock listens: the bound address, the scenario reference and the timing. */
        public static final LogRecord STARTED = LogRecordModel.builder()
                .template("Web mock listening on %s with scenario %s, timing %s")
                .prefix(PREFIX)
                .identifier(1)
                .build();

        /** The active scenario was switched: the scenario name and the state. */
        public static final LogRecord SCENARIO_SWITCHED = LogRecordModel.builder()
                .template("Switched to scenario %s in state %s")
                .prefix(PREFIX)
                .identifier(2)
                .build();

        /** The usage of the command line: the usage text. */
        public static final LogRecord USAGE = LogRecordModel.builder()
                .template("%s")
                .prefix(PREFIX)
                .identifier(4)
                .build();

        /** The mock stopped. */
        public static final LogRecord STOPPED = LogRecordModel.builder()
                .template("Web mock stopped")
                .prefix(PREFIX)
                .identifier(3)
                .build();
    }

    /** Messages at level WARN. */
    @UtilityClass
    public static final class WARN {

        /** A control request named an unknown scenario or state: the reference. */
        public static final LogRecord UNKNOWN_REFERENCE = LogRecordModel.builder()
                .template("Unknown scenario or state: %s")
                .prefix(PREFIX)
                .identifier(100)
                .build();

        /** A request body is no valid JSON: the method and the path. */
        public static final LogRecord MALFORMED_BODY = LogRecordModel.builder()
                .template("Request body of %s %s is no valid JSON")
                .prefix(PREFIX)
                .identifier(101)
                .build();

        /** An event stream was closed by a write failure: the subscriber count left. */
        public static final LogRecord STREAM_CLOSED = LogRecordModel.builder()
                .template("Closed an event stream after a write failure, %s left")
                .prefix(PREFIX)
                .identifier(102)
                .build();
    }

    /** Messages at level ERROR. */
    @UtilityClass
    public static final class ERROR {

        /** A request failed with an unexpected fault: the method and the path. */
        public static final LogRecord REQUEST_FAILED = LogRecordModel.builder()
                .template("Request %s %s failed")
                .prefix(PREFIX)
                .identifier(200)
                .build();

        /** A scenario could not be loaded: the reference and the detail. */
        public static final LogRecord SCENARIO_INVALID = LogRecordModel.builder()
                .template("Scenario %s is invalid: %s")
                .prefix(PREFIX)
                .identifier(201)
                .build();

        /** The command line is invalid: the reason. */
        public static final LogRecord INVALID_ARGUMENTS = LogRecordModel.builder()
                .template("Invalid arguments: %s")
                .prefix(PREFIX)
                .identifier(202)
                .build();
    }
}
