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
# Builds the native runner of the trailhand module when it is missing or older than its sources, then the image
# trailhand:it. The native build runs in a container (Mandrel, profile native).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

APP_DIR="$REPO_ROOT/trailhand"
RUNNER="$(ls "$APP_DIR"/target/*-runner 2>/dev/null | head -n1 || true)"
if [ -z "$RUNNER" ] || [ -n "$(find "$APP_DIR/src/main" "$APP_DIR/pom.xml" "$REPO_ROOT/web-app/src" -newer "$RUNNER" -type f -print -quit)" ]; then
    echo "building the native runner"
    (cd "$REPO_ROOT" && ./mvnw -q package -Pnative -pl trailhand -am)
else
    echo "native runner is current: $RUNNER"
fi
docker build -q -f "$APP_DIR/src/main/docker/Dockerfile.native" \
    --build-arg APP_VERSION=it --build-arg APP_REVISION="$(git -C "$REPO_ROOT" rev-parse --short HEAD)" \
    -t trailhand:it "$APP_DIR" >/dev/null
echo "image trailhand:it built"
