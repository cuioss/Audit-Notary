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
package de.cuioss.trailhand.integration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("Management interface of the native image (TRH-OPS-2, TRH-GEN-5, TRH-GEN-6)")
class HealthIT {

    @Test
    @DisplayName("liveness and readiness are UP once the repositories are cloned")
    void ready() {
        assertEquals(200, Stack.request().get(Stack.MANAGEMENT + "/q/health/live").statusCode());
        var ready = Stack.request().get(Stack.MANAGEMENT + "/q/health/ready");
        assertEquals(200, ready.statusCode(), ready.asString());
        assertEquals("UP", ready.jsonPath().getString("checks.find { it.name == 'repositories' }.status"));
        assertEquals("UP", ready.jsonPath().getString("checks.find { it.name == 'repositories' }.data.directory"));
    }

    @Test
    @DisplayName("the fetch state is UP and the metrics are on the management port, not on 8443")
    void gitRemoteAndMetrics() {
        assertEquals("UP", Stack.request().get(Stack.MANAGEMENT + "/q/health/group/git-remote").jsonPath()
                .getString("status"));
        var metrics = Stack.request().get(Stack.MANAGEMENT + "/q/metrics");
        assertEquals(200, metrics.statusCode());
        assertTrue(metrics.asString().contains("jvm_") || metrics.asString().contains("process_"));
        assertTrue(Stack.request().get(Stack.BASE + "/q/metrics").statusCode() >= 300);
    }

    @Test
    @DisplayName("the status answers without login and is not degraded")
    void status() {
        var status = Stack.request().get(Stack.BASE + "/api/v1/status");
        assertEquals(200, status.statusCode());
        assertFalse(status.jsonPath().getBoolean("degraded"));
        assertEquals(2, status.jsonPath().getList("repositories").size());
    }
}
