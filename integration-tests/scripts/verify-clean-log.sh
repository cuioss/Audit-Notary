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
# The application must log no ERROR or SEVERE record during the integration run. Two such records were seen before
# the image configured JGit (doc/specification/deployment.adoc, Volume): JGit failing to write its user config on the
# read-only root file system (org.eclipse.jgit.util.FS$FileStoreAttributes, which takes the directory from
# XDG_CONFIG_HOME), and a background gc failing on the lock file of a clone's staging directory. Reads
# target/compose.log, which stop-integration-stack.sh writes; that script fails when the collection fails.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

LOG="$TARGET_DIR/compose.log"
[ -s "$LOG" ] || { echo "$LOG is missing or empty: the stack log was not written" >&2; exit 1; }
# Compose prefixes each record with the container name (audit-notary-1, audit-notary_1 with the legacy docker-compose); a
# record starts with date, time and level.
# Stack-trace lines and the logs of other services do not match.
errors="$(grep -E '^audit-notary[-_]1 +\| [0-9-]+ [0-9:,]+ (ERROR|SEVERE) ' "$LOG" || true)"
if [ -n "$errors" ]; then
    echo "the audit-notary container logged ERROR/SEVERE records:" >&2
    echo "$errors" >&2
    exit 1
fi
grep -qE '^audit-notary[-_]1 +\| ' "$LOG" || { echo "$LOG holds no record of the audit-notary container" >&2; exit 1; }
echo "the audit-notary container logged no ERROR or SEVERE record"
