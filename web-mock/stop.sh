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
