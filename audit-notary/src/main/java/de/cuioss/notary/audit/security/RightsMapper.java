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
package de.cuioss.notary.audit.security;

import de.cuioss.notary.audit.config.Action;
import de.cuioss.notary.audit.config.AuditNotaryConfiguration;
import de.cuioss.notary.audit.config.RightSettings;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Derives the rights of a user from the identity-provider groups through {@code audit-notary.yaml} → {@code rights}
 * (AUN-AUTH-2). Deny by default: a group without mapping grants nothing, and nothing else grants a right.
 */
@ApplicationScoped
public class RightsMapper {

    private final Map<String, List<RightSettings>> rights;

    /**
     * @param configuration the configuration
     */
    @Inject
    public RightsMapper(AuditNotaryConfiguration configuration) {
        this(configuration.rights());
    }

    /**
     * @param rights the mapping group → rights
     */
    RightsMapper(Map<String, List<RightSettings>> rights) {
        this.rights = Map.copyOf(rights);
    }

    /**
     * @param groups the user's groups
     * @return the actions per repository alias, in alias order; repositories without a right are absent
     */
    public Map<String, Set<Action>> rightsOf(Collection<String> groups) {
        var result = new TreeMap<String, Set<Action>>();
        for (String group : groups) {
            for (RightSettings right : rights.getOrDefault(group, List.of())) {
                result.computeIfAbsent(right.repository(), alias -> EnumSet.noneOf(Action.class))
                        .addAll(right.actions());
            }
        }
        return result;
    }

    /**
     * @param groups     the user's groups
     * @param repository the repository alias
     * @param action     the action
     * @return whether one of the groups maps the action on the repository
     */
    public boolean permits(Collection<String> groups, String repository, Action action) {
        return rightsOf(groups).getOrDefault(repository, Set.of()).contains(action);
    }
}
