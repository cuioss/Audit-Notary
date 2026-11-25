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
package de.cuioss.notary.audit.mock.scenario;

import java.util.List;
import java.util.Optional;

/**
 * How the login of a scenario works: through the identity provider ({@code oidc}, the mock signs in as the scenario's
 * user without asking) or with local users ({@code local}, the web app's own login page posts a username and a
 * password to {@code /j_security_check}).
 *
 * @param provider the login provider, {@value #OIDC} or {@value #LOCAL}
 * @param users    the local users; empty with {@value #OIDC}
 */
public record ScenarioLogin(String provider, List<LocalUser> users) {

    /** The login provider that signs in without asking. */
    public static final String OIDC = "oidc";

    /** The login provider with a username and a password. */
    public static final String LOCAL = "local";

    /** The login of a scenario that declares none. */
    public static final ScenarioLogin DEFAULT = new ScenarioLogin(OIDC, List.of());

    /**
     * Copies the users.
     *
     * @param provider the provider
     * @param users    the users
     */
    public ScenarioLogin {
        users = List.copyOf(users);
    }

    /**
     * Whether the login is the web app's own page.
     *
     * @return {@code true} for the provider {@value #LOCAL}
     */
    public boolean isLocal() {
        return LOCAL.equals(provider);
    }

    /**
     * Finds the local user a login names.
     *
     * @param username the username
     * @param password the password
     * @return the user when both match, otherwise empty
     */
    public Optional<LocalUser> authenticate(String username, String password) {
        return users.stream().filter(user -> user.username().equals(username) && user.password().equals(password))
                .findFirst();
    }

    /**
     * A local user.
     *
     * @param username the username
     * @param password the password; never written to a log or to the recorded acts
     */
    public record LocalUser(String username, String password) {

        @Override
        public String toString() {
            return "LocalUser[username=" + username + ", password=***]";
        }
    }
}
