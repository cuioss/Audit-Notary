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
package de.cuioss.notary.audit.config;

/**
 * The web login through Token Sheriff (AUN-AUTH-1): {@code audit-notary.yaml} → {@code oidc}.
 *
 * @param issuer              the issuer of the identity provider, an absolute {@code https} URI
 * @param clientId            the client id of the confidential client
 * @param clientCredentialRef the reference to the client secret
 * @param groupsClaim         the claim the groups are read from, default {@code groups}
 */
public record OidcSettings(String issuer, String clientId, String clientCredentialRef, String groupsClaim) {

    /** The default of {@code groups-claim}. */
    public static final String DEFAULT_GROUPS_CLAIM = "groups";
}
