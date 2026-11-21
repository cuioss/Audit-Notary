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
package de.cuioss.trailhand.config;

/**
 * The web login through Token Sheriff (TRH-AUTH-1): {@code trailhand.yaml} → {@code oidc}.
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
