#!/bin/sh
if [ -d /opt/custom-certificates ]; then
  echo "Trusting custom certificates from /opt/custom-certificates."
  export NODE_OPTIONS="--use-openssl-ca $NODE_OPTIONS"
  export SSL_CERT_DIR=/opt/custom-certificates
  c_rehash /opt/custom-certificates
fi

DEFAULT_CREDS_DIR="${N8N_DEFAULT_CREDENTIALS_DIR:-/home/node/default_credentials}"
if [ -d "$DEFAULT_CREDS_DIR" ]; then
  echo "Running setup scripts in $DEFAULT_CREDS_DIR..."
  for f in "$DEFAULT_CREDS_DIR"/*.sh; do
    if [ -x "$f" ]; then
      echo "Running $f..."
      "$f" || echo "Error running $f"
    fi
  done
fi

if [ "$#" -gt 0 ]; then
  # Got started with arguments
  exec n8n "$@"
else
  # Got started without arguments
  exec n8n
fi
