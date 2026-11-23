#!/usr/bin/env bash
#
# Copyright © 2026-present Oliver Wolff
#
# SPDX-License-Identifier: FSL-1.1-ALv2
#
# Licensed under the Functional Source License, Version 1.1, ALv2 Future License
# (the "License"); you may not use this file except in compliance with the License.
# The License is in the file LICENSE.md at the root of this repository and at
# https://github.com/cuioss/Audit-Notary/blob/main/LICENSE.md.
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
