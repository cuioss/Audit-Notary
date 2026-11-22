#!/usr/bin/env bash
#
# Copyright © 2026-present CUI-OpenSource-Software (info@cuioss.de)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Starts Keycloak and Audit Notary (docker-compose.yml) and waits until Keycloak is ready and the Audit Notary container
# is ready on its management port and reported healthy by the image's binary health check. A start that fails stops
# the stack again (logs in target/compose.log); a successful one leaves it running for the tests.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Every request is bounded: an endpoint that accepts the connection and never answers cannot stall a loop.
probe() { curl -sf --max-time 5 "$@" >/dev/null 2>&1; }

started=false
cleanup() {
    if [ "$started" != true ]; then
        echo "the stack did not start; stopping it" >&2
        "$SCRIPT_DIR/stop-integration-stack.sh" --clean >&2 || true
    fi
}
trap cleanup EXIT

compose up -d keycloak
for _ in $(seq 1 120); do
    if probe -k https://localhost:1090/health/ready; then break; fi
    sleep 1
done
probe -k https://localhost:1090/health/ready || { echo "Keycloak did not become ready" >&2; exit 1; }
echo "Keycloak is ready"

compose up -d audit-notary
container="$(compose ps -q audit-notary)"
for _ in $(seq 1 120); do
    health="$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || true)"
    if [ "$health" = healthy ] && probe http://localhost:19000/q/health/ready; then
        started=true
        echo "Audit Notary is ready and healthy"
        exit 0
    fi
    sleep 1
done
echo "Audit Notary did not become ready and healthy (health: ${health:-unknown}):" >&2
curl -s --max-time 5 http://localhost:19000/q/health/ready >&2 || true
exit 1
