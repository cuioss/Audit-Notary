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
package de.cuioss.trailhand;

import de.cuioss.tools.logging.LogRecord;
import de.cuioss.tools.logging.LogRecordModel;
import lombok.experimental.UtilityClass;

/**
 * The {@link LogRecord}s of the application (TRH-GEN-5). Identifiers carry the prefix {@value #PREFIX} and follow the
 * CUI ranges: INFO 1-99, WARN 100-199, ERROR 200-299. The catalogue is {@code trailhand/doc/LogMessages.adoc}. No
 * record carries a token, a session id, a secret, a credential or a person's name.
 */
@UtilityClass
public final class TrailhandLogMessages {

    /** The prefix of every identifier. */
    public static final String PREFIX = "TRAILHAND";

    /** Messages at level INFO. */
    @UtilityClass
    public static final class INFO {

        /** The configuration is valid: the directory and the number of repositories. */
        public static final LogRecord CONFIGURATION_LOADED = LogRecordModel.builder()
                .template("Configuration loaded from %s with %s repositories")
                .prefix(PREFIX)
                .identifier(1)
                .build();

        /** A repository has a valid local copy: the alias. */
        public static final LogRecord REPOSITORY_READY = LogRecordModel.builder()
                .template("Repository %s is present locally")
                .prefix(PREFIX)
                .identifier(2)
                .build();

        /** A user signed in: the issuer. */
        public static final LogRecord LOGIN_COMPLETED = LogRecordModel.builder()
                .template("Login completed for a user of issuer %s")
                .prefix(PREFIX)
                .identifier(3)
                .build();

        /** A user signed out. */
        public static final LogRecord LOGOUT_COMPLETED = LogRecordModel.builder()
                .template("Logout completed")
                .prefix(PREFIX)
                .identifier(4)
                .build();
    }

    /** Messages at level WARN. */
    @UtilityClass
    public static final class WARN {

        /** The fetch of a repository failed: the alias, the library's outcome and its detail (the remote without credentials). */
        public static final LogRecord FETCH_FAILED = LogRecordModel.builder()
                .template("Fetch of repository %s failed: %s (%s)")
                .prefix(PREFIX)
                .identifier(100)
                .build();

        /** The first clone of a repository failed: the alias, the library's outcome and its detail (the remote without credentials). */
        public static final LogRecord CLONE_FAILED = LogRecordModel.builder()
                .template("Clone of repository %s failed: %s (%s)")
                .prefix(PREFIX)
                .identifier(101)
                .build();

        /** A state-changing request was refused by the anti-CSRF or Origin check: the method and the path. */
        public static final LogRecord CSRF_REJECTED = LogRecordModel.builder()
                .template("Refused %s %s: anti-CSRF token or Origin not valid")
                .prefix(PREFIX)
                .identifier(102)
                .build();

        /** A login callback could not be completed: the reason. */
        public static final LogRecord LOGIN_FAILED = LogRecordModel.builder()
                .template("Login could not be completed: %s")
                .prefix(PREFIX)
                .identifier(103)
                .build();

        /** The revocation of a token at logout failed: the reason. */
        public static final LogRecord REVOCATION_FAILED = LogRecordModel.builder()
                .template("Token revocation at logout failed: %s")
                .prefix(PREFIX)
                .identifier(104)
                .build();

        /** A refresh of the repositories ended with an unexpected failure: the exception type and its message. */
        public static final LogRecord REFRESH_FAILED = LogRecordModel.builder()
                .template("Refresh of the repositories failed: %s")
                .prefix(PREFIX)
                .identifier(105)
                .build();
    }

    /** Messages at level ERROR. */
    @UtilityClass
    public static final class ERROR {

        /** One violation of the configuration: the key and the rule. */
        public static final LogRecord CONFIGURATION_VIOLATION = LogRecordModel.builder()
                .template("Invalid configuration at %s: %s")
                .prefix(PREFIX)
                .identifier(200)
                .build();

        /** The boot stops because the configuration is invalid: the number of violations. */
        public static final LogRecord BOOT_STOPPED = LogRecordModel.builder()
                .template("Boot stopped: the configuration has %s violation(s)")
                .prefix(PREFIX)
                .identifier(201)
                .build();
    }
}
