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
# Builds the native runner of the trailhand module unless the one in target/ was built from the same inputs, then the
# image trailhand:it. The native build runs in a container (Mandrel, profile native). The inputs are fingerprinted by
# path and content: the build files of the reactor (dependency versions included), the sources and resources of
# trailhand and web-app, and the web app's package lock. An added, changed or deleted file rebuilds.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

APP_DIR="$REPO_ROOT/trailhand"
STAMP="$APP_DIR/target/native-inputs.sha256"
fingerprint() {
    (cd "$REPO_ROOT" && find pom.xml .mvn trailhand/pom.xml trailhand/src/main web-app/pom.xml web-app/package.json \
        web-app/package-lock.json web-app/vite.config.ts web-app/tsconfig.json web-app/src web-app/static \
        -type f -not -path '*/node_modules/*' -print0 2>/dev/null \
        | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
}
RUNNER="$(ls "$APP_DIR"/target/*-runner 2>/dev/null | head -n1 || true)"
INPUTS="$(fingerprint)"
if [ -z "$RUNNER" ] || [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$INPUTS" ]; then
    echo "building the native runner"
    (cd "$REPO_ROOT" && ./mvnw -q package -Pnative -pl trailhand -am)
    echo "$INPUTS" > "$STAMP"
else
    echo "native runner is current: $RUNNER"
fi
docker build -q -f "$APP_DIR/src/main/docker/Dockerfile.native" \
    --build-arg APP_VERSION=it --build-arg APP_REVISION="$(git -C "$REPO_ROOT" rev-parse --short HEAD)" \
    -t trailhand:it "$APP_DIR" >/dev/null
echo "image trailhand:it built"
