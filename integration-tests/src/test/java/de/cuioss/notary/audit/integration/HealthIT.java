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
package de.cuioss.notary.audit.integration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("Management interface of the native image (AUN-OPS-2, AUN-GEN-5, AUN-GEN-6)")
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
