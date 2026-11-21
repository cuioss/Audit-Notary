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
# Creates the bare repositories the stack uses as file: remotes (TRH-CONF-2, a single-server setup) in
# target/remotes, each with one initial commit on main. The aliases are the file:/srv/remotes/<alias>.git remotes of the
# stack's trailhand.yaml. A repository is built in a temporary directory and moved into place only once its main
# branch is pushed, so a run that stops halfway leaves nothing that a later run would take as complete.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

REMOTES="$TARGET_DIR/remotes"
CONFIG="$MODULE_DIR/src/main/docker/trailhand-config/trailhand.yaml"
ALIASES="$(sed -n 's#^[[:space:]]*remote:[[:space:]]*file:/srv/remotes/\([a-z0-9-]*\)\.git[[:space:]]*$#\1#p' "$CONFIG")"
[ -n "$ALIASES" ] || { echo "no file:/srv/remotes/ remote in $CONFIG" >&2; exit 1; }
mkdir -p "$REMOTES"
for alias in $ALIASES; do
    bare="$REMOTES/$alias.git"
    if git --git-dir="$bare" rev-parse -q --verify refs/heads/main >/dev/null 2>&1; then
        continue
    fi
    rm -rf "$bare" "$bare.partial"
    git init -q --bare -b main "$bare.partial"
    work="$(mktemp -d)"
    git -C "$work" init -q -b main
    printf 'Repository %s of the TrailHand integration tests.\n' "$alias" > "$work/README.adoc"
    git -C "$work" add README.adoc
    git -C "$work" -c user.name=trailhand-it -c user.email=it@trailhand.invalid commit -q -m "Initial commit"
    git -C "$work" push -q "$bare.partial" main
    rm -rf "$work"
    mv "$bare.partial" "$bare"
done
chmod -R a+rX "$REMOTES"
echo "remotes in $REMOTES"
