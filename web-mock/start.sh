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
# Starts the TrailHand web mock in the background (README.adoc).
#   start.sh [-s <scenario|scenario#state|file.json>] [-p <port>] [-t realistic|ordered] [-f]
#   -f runs it in the foreground instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$SCRIPT_DIR/target"
PID_FILE="$TARGET_DIR/web-mock.pid"
LOG_FILE="$TARGET_DIR/web-mock.log"
CP_FILE="$TARGET_DIR/classpath.txt"
BUILD_STAMP="$TARGET_DIR/.build-stamp"
MAIN_CLASS="de.cuioss.trailhand.mock.cli.WebMockCli"

SCENARIO="workshop"
PORT="${TRAILHAND_MOCK_PORT:-7420}"
TIMING="realistic"
FOREGROUND=false

usage() {
    echo "Usage: $0 [-s scenario] [-p port] [-t realistic|ordered] [-f]" >&2
}

while getopts "s:p:t:fh" option; do
    case "$option" in
        s) SCENARIO="$OPTARG" ;;
        p) PORT="$OPTARG" ;;
        t) TIMING="$OPTARG" ;;
        f) FOREGROUND=true ;;
        h) usage; exit 0 ;;
        *) usage; exit 2 ;;
    esac
done

mkdir -p "$TARGET_DIR"

if [ -f "$PID_FILE" ]; then
    EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
        echo "web-mock is already running (PID $EXISTING_PID); stop it with $SCRIPT_DIR/stop.sh"
        exit 0
    fi
    rm -f "$PID_FILE"
fi

# Newest modification time below the given paths, for BSD and GNU stat.
newest_mtime() {
    if stat -f "%m" "$1" >/dev/null 2>&1; then
        find "$@" -type f -exec stat -f "%m" {} + 2>/dev/null
    else
        find "$@" -type f -exec stat -c "%Y" {} + 2>/dev/null
    fi | sort -nr | head -n1 || true
}

stamp_mtime() {
    stat -f "%m" "$BUILD_STAMP" 2>/dev/null || stat -c "%Y" "$BUILD_STAMP" 2>/dev/null || echo 0
}

BUILD_NEEDED=false
if [ ! -f "$CP_FILE" ] || [ ! -f "$BUILD_STAMP" ] || [ ! -d "$TARGET_DIR/classes" ]; then
    BUILD_NEEDED=true
else
    NEWEST_SOURCE="$(newest_mtime "$SCRIPT_DIR/src/main" "$SCRIPT_DIR/pom.xml" \
        "$REPO_ROOT/web-app/src/main/resources" "$REPO_ROOT/pom.xml")"
    if [ "${NEWEST_SOURCE:-0}" -gt "$(stamp_mtime)" ]; then
        BUILD_NEEDED=true
    fi
fi

if [ "$BUILD_NEEDED" = true ]; then
    echo "Building web-mock (web-app contributes its resources only, no Node build)..."
    TMP_CP="$CP_FILE.tmp.$$"
    trap 'rm -f "$TMP_CP"' EXIT
    (cd "$REPO_ROOT" && ./mvnw -q compile dependency:build-classpath -pl web-mock -am \
        -Dmdep.outputFile="$TMP_CP" -Dmdep.includeScope=runtime \
        -Dskip.npm -Dskip.installnodenpm -Dskip.npm.build=true -Dskip.lint=true -Dskip.typecheck=true \
        -Dskip.spa.check=true)
    mv "$TMP_CP" "$CP_FILE"
    touch "$BUILD_STAMP"
    trap - EXIT
fi

CLASSPATH_VALUE="$TARGET_DIR/classes:$REPO_ROOT/web-app/target/classes:$(cat "$CP_FILE")"
ARGS=(--scenario "$SCENARIO" --port "$PORT" --timing "$TIMING")

if [ "$FOREGROUND" = true ]; then
    exec java -cp "$CLASSPATH_VALUE" "$MAIN_CLASS" "${ARGS[@]}"
fi

if [ "$PORT" != "0" ] && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Error: port $PORT is in use; choose another with -p." >&2
    exit 1
fi

nohup java -cp "$CLASSPATH_VALUE" "$MAIN_CLASS" "${ARGS[@]}" >"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

for _ in $(seq 1 60); do
    if grep -q "web-mock listening on" "$LOG_FILE" 2>/dev/null; then
        grep "web-mock listening on" "$LOG_FILE"
        echo "PID $(cat "$PID_FILE"), log $LOG_FILE, stop with $SCRIPT_DIR/stop.sh"
        exit 0
    fi
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "Error: web-mock exited; see $LOG_FILE" >&2
        tail -n 20 "$LOG_FILE" >&2 || true
        rm -f "$PID_FILE"
        exit 1
    fi
    sleep 0.25
done
echo "Error: web-mock did not report readiness within 15 s; see $LOG_FILE" >&2
exit 1
