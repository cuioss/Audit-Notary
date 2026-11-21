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
# The application must log no ERROR or SEVERE record during the integration run, for example JGit failing to write its
# user config on the read-only root file system. Reads target/compose.log, which stop-integration-stack.sh writes.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

LOG="$TARGET_DIR/compose.log"
[ -s "$LOG" ] || { echo "$LOG is missing or empty: the stack log was not written" >&2; exit 1; }
# Compose prefixes each record with the service name; a record starts with date, time and level.
# Stack-trace lines and the logs of other services do not match.
errors="$(grep -E '^trailhand-1 +\| [0-9-]+ [0-9:,]+ (ERROR|SEVERE) ' "$LOG" || true)"
if [ -n "$errors" ]; then
    echo "the trailhand container logged ERROR/SEVERE records:" >&2
    echo "$errors" >&2
    exit 1
fi
grep -qE '^trailhand-1 +\| ' "$LOG" || { echo "$LOG holds no record of the trailhand container" >&2; exit 1; }
echo "the trailhand container logged no ERROR or SEVERE record"
