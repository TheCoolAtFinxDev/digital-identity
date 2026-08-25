FROM public.ecr.aws/docker/library/node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
# Optional cache key for source-only rebuilds. This preserves the expensive
# dependency layer while allowing callers to invalidate COPY/build explicitly:
#   podman build --build-arg PORTAL_SOURCE_VERSION=<value> ...
ARG PORTAL_SOURCE_VERSION=local
COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/nginx:alpine
COPY --from=build /app/dist/portal/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
