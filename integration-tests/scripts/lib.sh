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
# Shared settings of the integration scripts; sourced, not run.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MODULE_DIR/.." && pwd)"
TARGET_DIR="$MODULE_DIR/target"
COMPOSE_FILE="$MODULE_DIR/src/main/docker/docker-compose.yml"
export AUDIT_NOTARY_IT_TARGET="$TARGET_DIR"

# docker compose v2, or the legacy docker-compose.
compose() {
    if docker compose version >/dev/null 2>&1; then
        docker compose -f "$COMPOSE_FILE" -p audit-notary-it "$@"
    else
        docker-compose -f "$COMPOSE_FILE" -p audit-notary-it "$@"
    fi
}
