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
# Starts Keycloak and TrailHand (docker-compose.yml) and waits until Keycloak is ready and the TrailHand container
# reports healthy through its binary probe and ready on its management port.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

compose up -d keycloak
for _ in $(seq 1 120); do
    if curl -sfk https://localhost:1090/health/ready >/dev/null 2>&1; then break; fi
    sleep 1
done
curl -sfk https://localhost:1090/health/ready >/dev/null || { echo "Keycloak did not become ready" >&2; exit 1; }
echo "Keycloak is ready"

compose up -d trailhand
for _ in $(seq 1 90); do
    if curl -sf http://localhost:19000/q/health/ready >/dev/null 2>&1; then
        echo "TrailHand is ready"
        exit 0
    fi
    sleep 1
done
echo "TrailHand did not become ready:" >&2
curl -s http://localhost:19000/q/health/ready >&2 || true
compose logs trailhand >&2 || true
exit 1
