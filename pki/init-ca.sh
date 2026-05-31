#!/usr/bin/env bash
set -euo pipefail

DIR=/opt/ee-ca

mkdir -p $DIR/{certs,newcerts,crl,csr,private}
touch $DIR/index.txt

if [ ! -f "$DIR/serial" ]; then
  echo 1000 > $DIR/serial
fi

if [ ! -f "$DIR/crlnumber" ]; then
  echo 1000 > $DIR/crlnumber
fi

chmod 700 $DIR/private

if [ ! -f "$DIR/private/intermediate.key.pem" ]; then
  openssl genrsa -out $DIR/private/intermediate.key.pem 4096
  chmod 600 $DIR/private/intermediate.key.pem
fi

if [ ! -f "$DIR/certs/intermediate.cert.pem" ]; then
  openssl req -config $DIR/openssl.cnf \
    -key $DIR/private/intermediate.key.pem \
    -new -sha256 \
    -out $DIR/csr/intermediate.csr.pem

  # Self-signed intermediate CA for development only.
  # In production this CSR should be signed by an offline root or EJBCA.
  openssl x509 -req -sha256 -days 1825 \
    -in  $DIR/csr/intermediate.csr.pem \
    -signkey $DIR/private/intermediate.key.pem \
    -extfile $DIR/openssl.cnf \
    -extensions v3_intermediate_ca \
    -out $DIR/certs/intermediate.cert.pem
fi

echo "CA bootstrap complete."
