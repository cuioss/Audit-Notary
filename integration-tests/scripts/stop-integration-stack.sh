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
# Writes the container logs to target/ and stops the stack; --clean also removes the volumes.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mkdir -p "$TARGET_DIR"
# The stack is removed in every case; a failed log collection is reported afterwards, so a partial log is never read
# as a complete one by verify-clean-log.sh.
logs_status=0
compose logs --no-color > "$TARGET_DIR/compose.log" 2>&1 || logs_status=$?
if [ "${1:-}" = "--clean" ]; then
    compose down --remove-orphans --volumes
else
    compose down --remove-orphans
fi
if [ "$logs_status" -ne 0 ]; then
    echo "collecting the container logs failed with exit code $logs_status" >&2
    exit "$logs_status"
fi
