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

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import de.cuioss.tools.logging.CuiLogger;
import org.jspecify.annotations.Nullable;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Period;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;

import static de.cuioss.trailhand.TrailhandLogMessages.ERROR;
import static de.cuioss.trailhand.TrailhandLogMessages.INFO;

/**
 * Loads and validates {@code trailhand.yaml} (TRH-CONF-1, TRH-CONF-2).
 * <p>
 * Placeholders are resolved from the environment first; then every rule runs and every violation is collected, so
 * one run names them all. The bootstrap validates the keys the application uses so far ({@code repositories},
 * {@code rights}, {@code oidc}, {@code web}, {@code fetch}); the validation against the bundled JSON Schema follows
 * with the remaining keys.
 */
public class ConfigurationLoader {

    private static final CuiLogger LOGGER = new CuiLogger(ConfigurationLoader.class);

    /** The name of the policy file in the configuration directory. */
    public static final String FILE_NAME = "trailhand.yaml";

    private static final Pattern ALIAS = Pattern.compile("[a-z0-9-]+");
    private static final Set<String> CONFIDENTIALITY = Set.of("public-internal", "restricted", "strongly-restricted");
    private static final List<String> REFERENCE_FORMS = List.of("file:", "vault:");

    private final Function<String, String> environment;

    /**
     * @param environment the environment the placeholders are resolved from
     */
    public ConfigurationLoader(Function<String, String> environment) {
        this.environment = environment;
    }

    /**
     * @return a loader reading the process environment
     */
    public static ConfigurationLoader fromProcessEnvironment() {
        return new ConfigurationLoader(System::getenv);
    }

    /**
     * Loads {@code trailhand.yaml} from a directory and logs one ERROR record per violation.
     *
     * @param directory the configuration directory
     * @return the configuration or the violations
     */
    public ConfigurationResult load(Path directory) {
        var file = directory.resolve(FILE_NAME);
        Object tree;
        try {
            if (!Files.isRegularFile(file)) {
                return report(directory, List.of(new Violation(FILE_NAME, "the file is missing")));
            }
            tree = new ObjectMapper(new YAMLFactory()).readValue(file.toFile(), Object.class);
        } catch (IOException e) {
            return report(directory, List.of(new Violation(FILE_NAME, "the file is no valid YAML")));
        }
        return report(directory, validate(tree));
    }

    /**
     * Validates a parsed tree, without logging.
     *
     * @param tree the YAML content as maps, lists and scalars
     * @return the configuration or the violations
     */
    @SuppressWarnings("unchecked")
    public ConfigurationResult validate(@Nullable Object tree) {
        var violations = new ArrayList<Violation>();
        if (!(tree instanceof Map<?, ?>)) {
            return new ConfigurationResult(null, List.of(new Violation(FILE_NAME, "the document is no mapping")));
        }
        var unresolved = new ArrayList<String>();
        var root = (Map<String, Object>) Placeholders.resolveTree(tree, environment, unresolved);
        for (String name : unresolved) {
            violations.add(new Violation("${" + name + "}", "the placeholder has no value and no default"));
        }
        var reader = new Reader(root, violations);
        var repositories = reader.repositories();
        var aliases = new HashSet<String>();
        repositories.forEach(repository -> aliases.add(repository.alias()));
        var rights = reader.rights(aliases);
        var oidc = reader.oidc();
        var web = reader.web();
        var fetch = reader.duration(reader.map(root, "fetch", false), "fetch.interval", "interval",
                TrailhandConfiguration.DEFAULT_FETCH_INTERVAL);
        if (!violations.isEmpty() || oidc == null || web == null) {
            return new ConfigurationResult(null, violations);
        }
        return new ConfigurationResult(new TrailhandConfiguration(repositories, rights, oidc, web, fetch), List.of());
    }

    private static ConfigurationResult report(Path directory, List<Violation> violations) {
        if (violations.isEmpty()) {
            throw new IllegalStateException("report without violations needs a configuration");
        }
        for (Violation violation : violations) {
            LOGGER.error(ERROR.CONFIGURATION_VIOLATION, violation.key(), violation.rule());
        }
        return new ConfigurationResult(null, violations);
    }

    private ConfigurationResult report(Path directory, ConfigurationResult result) {
        if (result.isValid()) {
            LOGGER.info(INFO.CONFIGURATION_LOADED, directory, result.configuration().repositories().size());
            return result;
        }
        return report(directory, result.violations());
    }

    /** Reads typed values from the tree and records a violation for every problem. */
    private static final class Reader {

        private final Map<String, Object> root;
        private final List<Violation> violations;

        Reader(Map<String, Object> root, List<Violation> violations) {
            this.root = root;
            this.violations = violations;
        }

        @SuppressWarnings("unchecked")
        @Nullable
        Map<String, Object> map(@Nullable Map<String, Object> parent, String key, boolean required) {
            var value = parent == null ? null : parent.get(key);
            if (value instanceof Map<?, ?> map) {
                return (Map<String, Object>) map;
            }
            if (value != null || required) {
                violations.add(new Violation(key, value == null ? "is required" : "must be a mapping"));
            }
            return null;
        }

        @Nullable
        String text(@Nullable Map<String, Object> parent, String path, String key, boolean required) {
            var value = parent == null ? null : parent.get(key);
            if (value instanceof String text && !text.isBlank()) {
                return text.trim();
            }
            if (value != null || required) {
                violations.add(new Violation(path, value == null ? "is required" : "must be a non-empty string"));
            }
            return null;
        }

        Duration duration(@Nullable Map<String, Object> parent, String path, String key, Duration fallback) {
            var text = text(parent, path, key, false);
            if (text == null) {
                return fallback;
            }
            try {
                var duration = Duration.parse(text);
                if (duration.isNegative() || duration.isZero()) {
                    violations.add(new Violation(path, "must be a positive ISO 8601 duration"));
                    return fallback;
                }
                return duration;
            } catch (DateTimeParseException e) {
                violations.add(new Violation(path, "must be an ISO 8601 duration such as PT5M"));
                return fallback;
            }
        }

        @SuppressWarnings("unchecked")
        List<RepositorySettings> repositories() {
            var value = root.get("repositories");
            if (!(value instanceof List<?> list) || list.isEmpty()) {
                violations.add(new Violation("repositories", "must be a non-empty list"));
                return List.of();
            }
            var result = new ArrayList<RepositorySettings>();
            var seen = new HashSet<String>();
            for (int index = 0; index < list.size(); index++) {
                var path = "repositories[" + index + "]";
                if (!(list.get(index) instanceof Map<?, ?> entry)) {
                    violations.add(new Violation(path, "must be a mapping"));
                    continue;
                }
                var repository = repository((Map<String, Object>) entry, path, seen);
                if (repository != null) {
                    result.add(repository);
                }
            }
            return result;
        }

        @Nullable
        private RepositorySettings repository(Map<String, Object> entry, String path, Set<String> seen) {
            int before = violations.size();
            var alias = text(entry, path + ".alias", "alias", true);
            if (alias != null && !ALIAS.matcher(alias).matches()) {
                violations.add(new Violation(path + ".alias", "must match [a-z0-9-]+"));
            } else if (alias != null && !seen.add(alias)) {
                violations.add(new Violation(path + ".alias", "is used by another repository"));
            }
            var remote = text(entry, path + ".remote", "remote", true);
            if (remote != null && !remote.startsWith("https://") && !remote.startsWith("file:")) {
                violations.add(new Violation(path + ".remote", "must be an https or a file: URL"));
            }
            var confidentiality = text(entry, path + ".confidentiality", "confidentiality", true);
            if (confidentiality != null && !CONFIDENTIALITY.contains(confidentiality)) {
                violations.add(new Violation(path + ".confidentiality",
                        "must be public-internal, restricted or strongly-restricted"));
            }
            var retention = retention(text(entry, path + ".retention", "retention", true), path + ".retention");
            var credentialRef = text(entry, path + ".credential-ref", "credential-ref", false);
            if (remote != null && remote.startsWith("https://") && credentialRef == null) {
                violations.add(new Violation(path + ".credential-ref", "is required for an https remote"));
            }
            reference(credentialRef, path + ".credential-ref");
            if (violations.size() > before || alias == null || remote == null || confidentiality == null) {
                return null;
            }
            return new RepositorySettings(alias, remote, confidentiality, retention, credentialRef);
        }

        @Nullable
        private Period retention(@Nullable String text, String path) {
            if (text == null || "unlimited".equals(text)) {
                return null;
            }
            try {
                return Period.parse(text);
            } catch (DateTimeParseException e) {
                violations.add(new Violation(path, "must be unlimited or an ISO 8601 period such as P10Y"));
                return null;
            }
        }

        private void reference(@Nullable String reference, String path) {
            if (reference != null && REFERENCE_FORMS.stream().noneMatch(reference::startsWith)) {
                violations.add(new Violation(path, "must be a reference: file:<path> or vault:<path>"));
            }
        }

        @SuppressWarnings("unchecked")
        Map<String, List<RightSettings>> rights(Set<String> aliases) {
            var rights = map(root, "rights", true);
            var result = new LinkedHashMap<String, List<RightSettings>>();
            if (rights == null) {
                return result;
            }
            rights.forEach((group, value) -> {
                var path = "rights." + group;
                if (!(value instanceof List<?> list)) {
                    violations.add(new Violation(path, "must be a list"));
                    return;
                }
                var entries = new ArrayList<RightSettings>();
                for (int index = 0; index < list.size(); index++) {
                    var entryPath = path + "[" + index + "]";
                    if (!(list.get(index) instanceof Map<?, ?> entry)) {
                        violations.add(new Violation(entryPath, "must be a mapping"));
                        continue;
                    }
                    var right = right((Map<String, Object>) entry, entryPath, aliases);
                    if (right != null) {
                        entries.add(right);
                    }
                }
                result.put(group, entries);
            });
            return result;
        }

        @Nullable
        private RightSettings right(Map<String, Object> entry, String path, Set<String> aliases) {
            var repository = text(entry, path + ".repository", "repository", true);
            if (repository != null && !aliases.contains(repository)) {
                violations.add(new Violation(path + ".repository", "names no configured repository"));
            }
            var actions = EnumSet.noneOf(Action.class);
            if (!(entry.get("actions") instanceof List<?> list) || list.isEmpty()) {
                violations.add(new Violation(path + ".actions", "must be a non-empty list"));
                return null;
            }
            for (Object action : list) {
                var parsed = action instanceof String name ? Action.fromWireName(name) : Optional.<Action>empty();
                if (parsed.isEmpty()) {
                    violations.add(new Violation(path + ".actions",
                            "must hold read, edit, approve or administer-catalogs"));
                } else {
                    actions.add(parsed.get());
                }
            }
            return repository == null ? null : new RightSettings(repository, actions);
        }

        @Nullable
        OidcSettings oidc() {
            var oidc = map(root, "oidc", true);
            if (oidc == null) {
                return null;
            }
            var issuer = text(oidc, "oidc.issuer", "issuer", true);
            if (issuer != null && httpsUri(issuer, false) == null) {
                violations.add(new Violation("oidc.issuer", "must be an absolute https URI"));
            }
            var clientId = text(oidc, "oidc.client-id", "client-id", true);
            var credential = text(oidc, "oidc.client-credential-ref", "client-credential-ref", true);
            reference(credential, "oidc.client-credential-ref");
            var groups = text(oidc, "oidc.groups-claim", "groups-claim", false);
            if (issuer == null || clientId == null || credential == null) {
                return null;
            }
            return new OidcSettings(issuer, clientId, credential,
                    groups == null ? OidcSettings.DEFAULT_GROUPS_CLAIM : groups);
        }

        @Nullable
        WebSettings web() {
            var web = map(root, "web", true);
            if (web == null) {
                return null;
            }
            var originText = text(web, "web.origin", "origin", true);
            var origin = originText == null ? null : httpsUri(originText, true);
            if (originText != null && origin == null) {
                violations.add(new Violation("web.origin", "must be an https origin without path, query or fragment"));
            }
            var session = map(web, "session", false);
            var idle = duration(session, "web.session.idle-timeout", "idle-timeout", WebSettings.DEFAULT_IDLE_TIMEOUT);
            var max = duration(session, "web.session.max-lifetime", "max-lifetime", WebSettings.DEFAULT_MAX_LIFETIME);
            if (idle.compareTo(max) > 0) {
                violations.add(new Violation("web.session.idle-timeout", "must not exceed web.session.max-lifetime"));
            }
            return origin == null ? null : new WebSettings(origin, idle, max);
        }

        @Nullable
        private static URI httpsUri(String text, boolean originOnly) {
            try {
                var uri = new URI(text);
                if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getFragment() != null
                        || uri.getUserInfo() != null) {
                    return null;
                }
                if (originOnly && ((uri.getRawPath() != null && !uri.getRawPath().isEmpty()
                        && !"/".equals(uri.getRawPath())) || uri.getQuery() != null)) {
                    return null;
                }
                return uri;
            } catch (URISyntaxException e) {
                return null;
            }
        }
    }
}
