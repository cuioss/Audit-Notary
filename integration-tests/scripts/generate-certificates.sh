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
# Generates the TLS material of the stack into target/certificates (never committed): one self-signed key pair
# (PEM) for Keycloak and Audit Notary with the names they are reached under, and a PKCS#12 trust store holding the
# certificate, with which Audit Notary trusts Keycloak.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

CERT_DIR="$TARGET_DIR/certificates"
# A complete set is reused; a missing file regenerates all of them, so key, certificate and trust store match.
if [ -f "$CERT_DIR/tls.key" ] && [ -f "$CERT_DIR/tls.crt" ] && [ -f "$CERT_DIR/truststore.p12" ]; then
    echo "certificates present in $CERT_DIR"
    exit 0
fi
mkdir -p "$CERT_DIR"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -sha256 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:keycloak,DNS:audit-notary,IP:127.0.0.1" \
    -keyout "$CERT_DIR/tls.key" -out "$CERT_DIR/tls.crt" 2>/dev/null
# Read by the containers' non-root users; the material is test-only and lives in target/.
chmod 644 "$CERT_DIR/tls.key" "$CERT_DIR/tls.crt"
rm -f "$CERT_DIR/truststore.p12"
keytool -importcert -noprompt -alias audit-notary-it -file "$CERT_DIR/tls.crt" \
    -keystore "$CERT_DIR/truststore.p12" -storetype PKCS12 -storepass audit-notary-it >/dev/null
chmod 644 "$CERT_DIR/truststore.p12"
echo "certificates written to $CERT_DIR"
