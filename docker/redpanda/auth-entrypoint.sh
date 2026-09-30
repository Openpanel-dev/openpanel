#!/usr/bin/env bash
# Standalone Redpanda that REQUIRES SASL, for verifying the TLS/SASL support in
# packages/queue against a real broker. Not part of the default stack:
#
#   pnpm dock:kafka-auth          # start (compose profile "kafka-auth")
#   pnpm vitest run packages/queue/src/kafka.integration.test.ts
#
# Listeners (both require SASL):
#   localhost:19093  plaintext
#   localhost:19094  TLS, self-signed CA written to docker/data/op-rp-auth-certs
# Users: op512 (SCRAM-SHA-512), op256 (SCRAM-SHA-256); PLAIN works with both.
set -euo pipefail

CERT_DIR=/certs
SASL_PORT=19093
TLS_PORT=19094

gen_certs() {
  if [[ -f "$CERT_DIR/ca.crt" && -f "$CERT_DIR/broker.crt" && -f "$CERT_DIR/broker.key" ]]; then
    return
  fi
  echo "generating self-signed TLS certs in $CERT_DIR"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.crt" \
    -days 3650 -subj "/CN=openpanel-dev-ca" 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -keyout "$CERT_DIR/broker.key" -out "$CERT_DIR/broker.csr" \
    -subj "/CN=localhost" 2>/dev/null
  printf "subjectAltName=DNS:localhost,IP:127.0.0.1\n" > "$CERT_DIR/san.ext"
  openssl x509 -req -in "$CERT_DIR/broker.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial -out "$CERT_DIR/broker.crt" -days 3650 -extfile "$CERT_DIR/san.ext" 2>/dev/null
  chmod 644 "$CERT_DIR"/*.crt "$CERT_DIR"/*.key
}

configure_cluster() {
  for _ in $(seq 1 60); do
    if rpk cluster health -X admin.hosts=localhost:9644 >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  rpk cluster config set enable_sasl true -X admin.hosts=localhost:9644
  rpk cluster config set sasl_mechanisms '["SCRAM","PLAIN"]' -X admin.hosts=localhost:9644
  rpk cluster config set superusers '["op512","op256"]' -X admin.hosts=localhost:9644
  # Redpanda stores one SCRAM mechanism per user; PLAIN works against either.
  rpk security user create op512 -p op512-secret --mechanism SCRAM-SHA-512 -X admin.hosts=localhost:9644 || true
  rpk security user create op256 -p op256-secret --mechanism SCRAM-SHA-256 -X admin.hosts=localhost:9644 || true
  echo "kafka-auth broker ready"
}

gen_certs
configure_cluster &

exec rpk redpanda start \
  --smp=1 \
  --memory=512M \
  --overprovisioned \
  --mode=dev-container \
  --default-log-level=warn \
  --kafka-addr="sasl://0.0.0.0:$SASL_PORT,tls://0.0.0.0:$TLS_PORT" \
  --advertise-kafka-addr="sasl://localhost:$SASL_PORT,tls://localhost:$TLS_PORT" \
  --set "redpanda.kafka_api_tls=[{\"name\":\"tls\",\"enabled\":true,\"cert_file\":\"$CERT_DIR/broker.crt\",\"key_file\":\"$CERT_DIR/broker.key\",\"truststore_file\":\"$CERT_DIR/ca.crt\",\"require_client_auth\":false}]"
