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
package de.cuioss.trailhand.service;

import de.cuioss.git.document.core.GitOutcome;
import de.cuioss.git.document.core.JGitRepositoryOperations;
import de.cuioss.git.document.core.RemotePolicy;
import de.cuioss.git.document.core.RepositoryOperations;
import de.cuioss.git.document.store.RepositoryRegistry;
import de.cuioss.git.document.store.StoreRepository;
import de.cuioss.tools.logging.CuiLogger;
import de.cuioss.trailhand.config.RepositorySettings;
import org.jspecify.annotations.Nullable;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;

import static de.cuioss.trailhand.TrailhandLogMessages.INFO;
import static de.cuioss.trailhand.TrailhandLogMessages.WARN;

/**
 * Keeps a local bare copy of every configured repository below the data directory and fetches it (TRH-CONF-2,
 * TRH-OPS-2, TRH-GEN-6), through the {@code git-document-repository} libraries only (TRH-GEN-4).
 * <p>
 * A repository is <em>present</em> once a clone exists, whether made now or kept on the volume; a failed fetch later
 * keeps it present and marks only its fetch {@code DOWN}, so readiness stays {@code UP} while reads are served from
 * the last fetched state. Signing, anchoring and saving join with the save operation.
 */
public class RepositoryService {

    private static final CuiLogger LOGGER = new CuiLogger(RepositoryService.class);

    /** The directory below the data directory that holds the bare repositories. */
    public static final String REPOSITORIES_DIR = "repositories";

    private static final List<String> FETCH_SPECS = List.of("+refs/heads/*:refs/heads/*", "+refs/tags/*:refs/tags/*",
            "+refs/notes/*:refs/notes/*");
    private static final List<String> PUSH_SPECS = List.of("refs/heads/main:refs/heads/main");

    private final RepositoryRegistry registry;
    private final RepositoryOperations operations;
    private final Path repositoriesDir;
    /** The fetch state per alias; guarded by the monitor of this service, which is never held during Git transport. */
    private final Map<String, RepositoryState> states = new LinkedHashMap<>();
    /** Keeps refreshes one at a time without blocking the readers of the state. */
    private final ReentrantLock refreshLock = new ReentrantLock();

    /**
     * @param registry      the validated repositories
     * @param operations    the Git operations of the library
     * @param dataDirectory the data directory, {@code /app/data} in the container
     */
    public RepositoryService(RepositoryRegistry registry, RepositoryOperations operations, Path dataDirectory) {
        this.registry = registry;
        this.operations = operations;
        this.repositoriesDir = dataDirectory.resolve(REPOSITORIES_DIR);
        registry.repositories().forEach(repository -> states.put(repository.alias(),
                new RepositoryState(repository.alias(), false, false)));
    }

    /**
     * Builds the registry and the operations for configured repositories.
     *
     * @param settings      the repositories of {@code trailhand.yaml}
     * @param dataDirectory the data directory
     * @return the service, or the library's refusal of the repositories as detail
     */
    public static ServiceResult<RepositoryService> create(List<RepositorySettings> settings, Path dataDirectory) {
        var policy = remotePolicy(settings);
        if (policy.isEmpty()) {
            return ServiceResult.refused("the https remotes must share one origin");
        }
        var repositories = settings.stream()
                .map(entry -> new StoreRepository(entry.alias(), libraryRemote(entry), entry.confidentiality(),
                        entry.retention()))
                .toList();
        var registry = RepositoryRegistry.of(repositories, policy.get());
        var value = registry.value();
        if (!registry.isOk() || value == null) {
            return ServiceResult.refused(String.valueOf(registry.detail()));
        }
        return ServiceResult.ok(new RepositoryService(value, new JGitRepositoryOperations(policy.get()), dataDirectory));
    }

    /**
     * The remote as the library takes it: an {@code https} URL unchanged, a {@code file:} URL as the absolute path of the
     * local bare repository (relative to the working directory).
     *
     * @param settings the repository
     * @return the remote for the library
     */
    static String libraryRemote(RepositorySettings settings) {
        if (!settings.isLocal()) {
            return settings.remote();
        }
        var path = settings.remote().substring("file:".length());
        while (path.startsWith("//")) {
            path = path.substring(1);
        }
        return Path.of(path).toAbsolutePath().normalize().toString();
    }

    /**
     * The policy of the library admits local repositories and at most one HTTPS origin.
     *
     * @param settings the repositories
     * @return the policy, or empty when the HTTPS remotes name more than one origin
     */
    static Optional<RemotePolicy> remotePolicy(List<RepositorySettings> settings) {
        var origins = settings.stream().filter(entry -> !entry.isLocal()).map(entry -> URI.create(entry.remote()))
                .map(uri -> URI.create("https://" + uri.getRawAuthority())).distinct().toList();
        if (origins.isEmpty()) {
            return Optional.of(RemotePolicy.localOnly());
        }
        return origins.size() == 1 ? Optional.of(RemotePolicy.httpsOrigin(origins.getFirst())) : Optional.empty();
    }

    /**
     * Makes sure every repository has a local copy: an existing one is opened, a missing one is cloned. A repository
     * whose clone fails stays absent; the next refresh tries again. Refreshes run one at a time; the state stays
     * readable while a clone or fetch waits for the remote.
     */
    public void refresh() {
        refreshLock.lock();
        try {
            for (StoreRepository repository : registry.repositories()) {
                var gitDir = repositoriesDir.resolve(repository.alias() + ".git");
                if (isPresent(repository.alias())) {
                    fetch(repository, gitDir);
                } else {
                    cloneOrOpen(repository, gitDir);
                }
            }
        } finally {
            refreshLock.unlock();
        }
    }

    private synchronized boolean isPresent(String alias) {
        var known = states.get(alias);
        return known != null && known.present();
    }

    private synchronized void recordState(RepositoryState state) {
        states.put(state.alias(), state);
    }

    private void cloneOrOpen(StoreRepository repository, Path gitDir) {
        var existed = Files.isDirectory(gitDir);
        var result = operations.cloneIfMissing(
                new RepositoryOperations.CloneInput(gitDir, repository.remote(), PUSH_SPECS, null));
        if (result.outcome() == GitOutcome.OK) {
            LOGGER.info(INFO.REPOSITORY_READY, repository.alias());
            // A fresh clone has reached the remote; an existing one is opened without it, so its fetch state stays
            // DOWN until the fetch below succeeds.
            recordState(new RepositoryState(repository.alias(), true, !existed));
            fetch(repository, gitDir);
        } else {
            LOGGER.warn(WARN.CLONE_FAILED, repository.alias(), result.outcome(), result.detail());
            recordState(new RepositoryState(repository.alias(), false, false));
        }
    }

    private void fetch(StoreRepository repository, Path gitDir) {
        var result = operations.fetch(new RepositoryOperations.FetchInput(gitDir, "origin", FETCH_SPECS, null));
        boolean up = result.outcome() == GitOutcome.OK;
        if (!up) {
            LOGGER.warn(WARN.FETCH_FAILED, repository.alias(), result.outcome(), result.detail());
        }
        recordState(new RepositoryState(repository.alias(), true, up));
    }

    /**
     * @return the state of every repository, in configuration order
     */
    public synchronized List<RepositoryState> states() {
        return new ArrayList<>(states.values());
    }

    /**
     * @return whether every repository has a local copy (the readiness check {@code repositories})
     */
    public boolean allPresent() {
        return allPresent(states());
    }

    /**
     * @return whether a repository's last fetch failed (the degraded state of TRH-GEN-6)
     */
    public boolean degraded() {
        return degraded(states());
    }

    /**
     * @param snapshot the states from one call of {@link #states()}
     * @return whether every repository of the snapshot has a local copy
     */
    public static boolean allPresent(List<RepositoryState> snapshot) {
        return snapshot.stream().allMatch(RepositoryState::present);
    }

    /**
     * @param snapshot the states from one call of {@link #states()}
     * @return whether a repository of the snapshot failed its last fetch
     */
    public static boolean degraded(List<RepositoryState> snapshot) {
        return snapshot.stream().anyMatch(state -> !state.fetchUp());
    }

    /**
     * @param alias an alias
     * @return the local git directory of a configured repository
     */
    public Optional<Path> gitDirectory(String alias) {
        return registry.find(alias).map(repository -> repositoriesDir.resolve(repository.alias() + ".git"));
    }

    /**
     * The result of {@link #create(List, Path)}.
     *
     * @param value  the service, or {@code null} when refused
     * @param detail the reason of a refusal
     * @param <V>    the value type
     */
    public record ServiceResult<V>(@Nullable V value, @Nullable String detail) {

        static <V> ServiceResult<V> ok(V value) {
            return new ServiceResult<>(value, null);
        }

        static <V> ServiceResult<V> refused(String detail) {
            return new ServiceResult<>(null, detail);
        }
    }
}
