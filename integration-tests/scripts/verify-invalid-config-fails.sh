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
docker run --rm -v "$INVALID:/cfg:ro" trailhand:it --validate-config /cfg > "$TARGET_DIR/invalid-config-validate.log" 2>&1
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
# One record per violation: the boot must log exactly the violations --validate-config reports for the fixture, as a
# multiset of "key: rule" records, so an added violation of the fixture is expected without a list here.
records() { grep -o 'TRAILHAND-200: Invalid configuration at .*' "$1" | LC_ALL=C sort; }
expected="$(records "$TARGET_DIR/invalid-config-validate.log")"
actual="$(records "$TARGET_DIR/invalid-config-boot.log")"
[ -n "$expected" ] || { echo "--validate-config reported no TRAILHAND-200 record" >&2; exit 1; }
if [ "$expected" != "$actual" ]; then
    echo "the boot logged other violations than --validate-config reports:" >&2
    diff <(echo "$expected") <(echo "$actual") >&2 || true
    exit 1
fi
# The fixture covers every rule group of the bootstrap; each of these keys must be among the records.
for key in 'repositories[0].alias' 'repositories[0].remote' 'repositories[0].confidentiality' \
        'repositories[0].retention' 'rights.assessors[0].repository' 'rights.assessors[0].actions' 'oidc.issuer' \
        'oidc.client-credential-ref' 'web.origin'; do
    grep -qF "Invalid configuration at $key: " <<< "$expected" \
        || { echo "the fixture no longer produces a violation of $key" >&2; exit 1; }
done
echo "an invalid configuration stops the boot ($status) and fails --validate-config"
