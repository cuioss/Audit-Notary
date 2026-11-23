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
# Creates the bare repositories the stack uses as file: remotes (AUN-CONF-2, a single-server setup) in
# target/remotes, each with one initial commit on main. The aliases are the file:/srv/remotes/<alias>.git remotes of the
# stack's audit-notary.yaml. A repository is built in a temporary directory and moved into place only once its main
# branch is pushed, so a run that stops halfway leaves nothing that a later run would take as complete.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

REMOTES="$TARGET_DIR/remotes"
CONFIG="$MODULE_DIR/src/main/docker/audit-notary-config/audit-notary.yaml"
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
    printf 'Repository %s of the Audit Notary integration tests.\n' "$alias" > "$work/README.adoc"
    git -C "$work" add README.adoc
    git -C "$work" -c user.name=audit-notary-it -c user.email=it@audit-notary.invalid commit -q -m "Initial commit"
    git -C "$work" push -q "$bare.partial" main
    rm -rf "$work"
    mv "$bare.partial" "$bare"
done
chmod -R a+rX "$REMOTES"
echo "remotes in $REMOTES"
