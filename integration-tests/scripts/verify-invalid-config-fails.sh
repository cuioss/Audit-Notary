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
# TRH-NFR-5, second half: the native image must refuse to boot with an invalid configuration, and
# --validate-config must report it with exit code 1.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INVALID="$MODULE_DIR/src/main/docker/trailhand-config-invalid"
set +e
docker run --rm -v "$INVALID:/cfg:ro" trailhand:it --validate-config /cfg
validate=$?
container="$(docker run -d -v "$INVALID:/app/config:ro" trailhand:it)"
status=""
for _ in $(seq 1 30); do
    status="$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' "$container")"
    case "$status" in exited*) break ;; esac
    sleep 1
done
docker logs "$container" > "$TARGET_DIR/invalid-config-boot.log" 2>&1
docker rm -f "$container" >/dev/null
set -e
if [ "$validate" -ne 1 ]; then
    echo "--validate-config answered $validate for an invalid configuration, expected 1" >&2
    exit 1
fi
case "$status" in
    "exited 0" | running* | "") echo "the boot with an invalid configuration did not fail: $status" >&2; exit 1 ;;
esac
grep -q "TRAILHAND-200" "$TARGET_DIR/invalid-config-boot.log" || { echo "no TRAILHAND-200 record in the boot log" >&2; exit 1; }
echo "an invalid configuration stops the boot ($status) and fails --validate-config"
