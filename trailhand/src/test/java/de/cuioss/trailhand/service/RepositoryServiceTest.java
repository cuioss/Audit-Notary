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

import de.cuioss.git.document.testing.LocalRemote;
import de.cuioss.git.document.testing.Remote;
import de.cuioss.test.juli.LogAsserts;
import de.cuioss.test.juli.TestLogLevel;
import de.cuioss.test.juli.junit5.EnableTestLogger;
import de.cuioss.trailhand.config.RepositorySettings;
import org.easymock.EasyMock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnableTestLogger
@DisplayName("RepositoryService: local copies, fetch and readiness (TRH-CONF-2, TRH-OPS-2, TRH-GEN-6)")
class RepositoryServiceTest {

    private static RepositorySettings local(String alias, String remote) {
        return new RepositorySettings(alias, remote, "restricted", null, null);
    }

    private static RepositorySettings https(String alias, String remote) {
        return new RepositorySettings(alias, remote, "restricted", null, "file:/run/secrets/git");
    }

    @Test
    @DisplayName("clones a local remote, stays present when the remote vanishes and reports the failed fetch")
    void cloneFetchDegrade(@Remote LocalRemote remote, @TempDir Path data) throws Exception {
        var remoteDir = Path.of(remote.uri().getPath());
        var created = RepositoryService.create(List.of(local("samm", "file:" + remoteDir)), data);
        var service = created.value();
        assertNotNull(service, created.detail());
        assertFalse(service.allPresent());

        service.refresh();

        assertTrue(service.allPresent());
        assertFalse(service.degraded());
        assertTrue(Files.isDirectory(service.gitDirectory("samm").orElseThrow()));
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.INFO, "TRAILHAND-2");

        deleteTree(remoteDir);
        service.refresh();

        assertTrue(service.allPresent(), "a failed fetch keeps the local copy");
        assertTrue(service.degraded());
        assertEquals(List.of(new RepositoryState("samm", true, false)), service.states());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "TRAILHAND-100");
    }

    @Test
    @DisplayName("keeps an unreachable repository absent and tries again")
    void unreachable(@TempDir Path data) {
        var service = RepositoryService.create(List.of(local("gone", "file:" + data.resolve("nowhere.git"))), data)
                .value();
        assertNotNull(service);

        service.refresh();

        assertFalse(service.allPresent());
        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "TRAILHAND-101");
    }

    @Test
    @DisplayName("admits local remotes and one https origin, and refuses a second origin")
    void policy() {
        assertTrue(RepositoryService.remotePolicy(List.of(local("a", "file:/x"))).isPresent());
        assertTrue(RepositoryService.remotePolicy(
                List.of(https("a", "https://git.example.org/a.git"), https("b", "https://git.example.org/b.git")))
                .isPresent());
        assertTrue(RepositoryService.remotePolicy(
                List.of(https("a", "https://git.example.org/a.git"), https("b", "https://other.example.org/b.git")))
                .isEmpty());
        assertNotNull(RepositoryService.create(List.of(https("a", "https://git.example.org/a.git"),
                https("b", "https://other.example.org/b.git")), Path.of("target")).detail());
    }

    @Test
    @DisplayName("hands file: remotes to the library as absolute paths")
    void libraryRemote() {
        assertEquals(Path.of("/srv/x.git").toString(),
                RepositoryService.libraryRemote(local("x", "file:///srv/x.git")));
        assertEquals(Path.of("rel.git").toAbsolutePath().toString(),
                RepositoryService.libraryRemote(local("x", "file:rel.git")));
        assertEquals("https://git.example.org/a.git",
                RepositoryService.libraryRemote(https("a", "https://git.example.org/a.git")));
    }

    @Test
    @DisplayName("a failing refresh is logged and does not end the periodic fetch")
    void refreshSafely() {
        RepositoryService service = EasyMock.createMock(RepositoryService.class);
        service.refresh();
        EasyMock.expectLastCall().andThrow(new IllegalStateException("broken"));
        EasyMock.replay(service);

        RepositoryLifecycle.refreshSafely(service);

        LogAsserts.assertLogMessagePresentContaining(TestLogLevel.WARN, "TRAILHAND-105");
        EasyMock.verify(service);
    }

    private static void deleteTree(Path root) throws IOException {
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }
}
