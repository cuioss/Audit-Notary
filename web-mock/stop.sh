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
# Stops the web mock started by start.sh. Refuses a PID whose command line is not the web mock.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/target/web-mock.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "web-mock is not running (no $PID_FILE)."
    exit 0
fi

PID="$(cat "$PID_FILE")"
if ! kill -0 "$PID" 2>/dev/null; then
    echo "web-mock is not running (stale PID $PID)."
    rm -f "$PID_FILE"
    exit 0
fi

COMMAND="$(ps -p "$PID" -o command= 2>/dev/null || true)"
case "$COMMAND" in
    *WebMockCli*) ;;
    *)
        echo "Error: PID $PID is not the web mock ($COMMAND); not stopping it." >&2
        exit 1
        ;;
esac

kill -TERM "$PID"
for _ in $(seq 1 20); do
    if ! kill -0 "$PID" 2>/dev/null; then
        rm -f "$PID_FILE"
        echo "web-mock stopped (PID $PID)."
        exit 0
    fi
    sleep 0.25
done
kill -KILL "$PID" 2>/dev/null || true
rm -f "$PID_FILE"
echo "web-mock killed after 5 s (PID $PID)."
