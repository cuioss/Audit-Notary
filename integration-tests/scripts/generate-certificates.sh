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
# Generates the TLS material of the stack into target/certificates (never committed): one self-signed key pair
# (PEM) for Keycloak and TrailHand with the names they are reached under, and a PKCS#12 trust store holding the
# certificate, with which TrailHand trusts Keycloak.
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
    -addext "subjectAltName=DNS:localhost,DNS:keycloak,DNS:trailhand,IP:127.0.0.1" \
    -keyout "$CERT_DIR/tls.key" -out "$CERT_DIR/tls.crt" 2>/dev/null
# Read by the containers' non-root users; the material is test-only and lives in target/.
chmod 644 "$CERT_DIR/tls.key" "$CERT_DIR/tls.crt"
rm -f "$CERT_DIR/truststore.p12"
keytool -importcert -noprompt -alias trailhand-it -file "$CERT_DIR/tls.crt" \
    -keystore "$CERT_DIR/truststore.p12" -storetype PKCS12 -storepass trailhand-it >/dev/null
chmod 644 "$CERT_DIR/truststore.p12"
echo "certificates written to $CERT_DIR"
