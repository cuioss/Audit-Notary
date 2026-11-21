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
