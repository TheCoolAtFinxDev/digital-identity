# Pull the pkcs11-proxy CLIENT module from the already-built HSM image so we
# don't recompile it here. certsvc loads this to reach the network HSM.
FROM localhost/digital-identity_softhsm:latest AS hsmclient

FROM public.ecr.aws/docker/library/ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# openssl + opensc (pkcs11-tool) + libengine-pkcs11-openssl (OpenSSL pkcs11 engine)
# + libseccomp2 (runtime dep of the proxy client lib) make certsvc an HSM client.
RUN apt-get update && apt-get install -y \
    curl ca-certificates gnupg build-essential openssl \
    opensc libengine-pkcs11-openssl libseccomp2 \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
     | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
     > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update && apt-get install -y nodejs \
  # Pinned to the npm major that supports Node 20 — `npm@latest` now resolves to
  # npm 12, which requires Node >= 22 and fails the build.
  && npm i -g npm@10 \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# pkcs11-proxy client module from the HSM image (built there from source)
COPY --from=hsmclient /usr/local/lib/libpkcs11-proxy.so /usr/local/lib/libpkcs11-proxy.so
RUN ldconfig

WORKDIR /app

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# NOTE: In rootless Podman (this deployment), UID 0 inside the container maps
# to the host developer user (UID 1001), which owns the PKI bind mount.
# A proper non-root user requires UID coordination between ca-bootstrap and
# certsvc — tracked as a Phase 2 pre-production task.

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
