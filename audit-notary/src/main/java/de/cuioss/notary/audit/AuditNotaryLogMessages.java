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

import de.cuioss.tools.logging.LogRecord;
import de.cuioss.tools.logging.LogRecordModel;
import lombok.experimental.UtilityClass;

/**
 * The {@link LogRecord}s of the application (AUN-GEN-5). Identifiers carry the prefix {@value #PREFIX} and follow the
 * CUI ranges: INFO 1-99, WARN 100-199, ERROR 200-299. The catalogue is {@code audit-notary/doc/LogMessages.adoc}. No
 * record carries a token, a session id, a secret, a credential or a person's name.
 */
@UtilityClass
public final class AuditNotaryLogMessages {

    /** The prefix of every identifier. */
    public static final String PREFIX = "AUDIT-NOTARY";

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
                .template("Refresh of the repositories failed: %s: %s")
                .prefix(PREFIX)
                .identifier(105)
                .build();

        /**
         * The provider's metadata could not be read at logout, so the held tokens were not revoked and the provider's
         * session was not ended: the exception type.
         */
        public static final LogRecord LOGOUT_WITHOUT_PROVIDER = LogRecordModel.builder()
                .template("Logout without the identity provider, its metadata cannot be read: %s")
                .prefix(PREFIX)
                .identifier(106)
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
