FROM public.ecr.aws/docker/library/ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Runtime: softhsm2 (the token), opensc (pkcs11-tool), gnutls (p11tool).
# Build:   git/cmake/gcc/libssl-dev to compile pkcs11-proxy from source.
RUN apt-get update && apt-get install -y \
      softhsm2 opensc gnutls-bin \
      git cmake build-essential libssl-dev libseccomp-dev pkg-config \
  && rm -rf /var/lib/apt/lists/*

# ── Build pkcs11-proxy (SUNET fork: maintained, supports TLS-PSK) ─────────────
# Produces /usr/local/bin/pkcs11-daemon (the network server) and
# /usr/local/lib/libpkcs11-proxy.so (the client PKCS#11 module).
RUN git clone --depth 1 https://github.com/SUNET/pkcs11-proxy /tmp/pkcs11-proxy \
  && cd /tmp/pkcs11-proxy \
  && cmake . \
  && make \
  && make install \
  && ldconfig \
  && rm -rf /tmp/pkcs11-proxy

ENV SOFTHSM2_CONF=/etc/softhsm/softhsm2.conf
# The real PKCS#11 module the daemon serves:
ENV PKCS11_MODULE=/usr/lib/softhsm/libsofthsm2.so
# The proxy client module (for reference / in-container testing):
ENV PKCS11_PROXY_CLIENT=/usr/local/lib/libpkcs11-proxy.so

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 5657
CMD ["/usr/local/bin/entrypoint.sh"]
