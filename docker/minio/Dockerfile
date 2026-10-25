# syntax=docker/dockerfile:1
FROM golang:1.21.13-bookworm AS builder

ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOMAXPROCS=2 GOGC=50 MINIO_RELEASE=RELEASE
ENV MINIO_COMMIT=19387cafab76133c2e7642de4aac8c81b9f4f8c7
WORKDIR /src
RUN git init . \
    && git remote add origin https://github.com/minio/minio.git \
    && git fetch --depth=1 origin refs/tags/RELEASE.2024-01-18T22-51-28Z:refs/tags/RELEASE.2024-01-18T22-51-28Z \
    && git checkout --detach "$MINIO_COMMIT" \
    && test "$(git rev-parse HEAD)" = "$MINIO_COMMIT"
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -p 2 -tags kqueue -trimpath -buildvcs=false \
      -ldflags "$(go run buildscripts/gen-ldflags.go 2024-01-18T22:51:28Z)" \
      -o /out/minio . \
    && /out/minio --version | grep 'RELEASE.2024-01-18T22-51-28Z'

FROM debian:bookworm-slim AS runner
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/minio /usr/local/bin/minio
COPY --from=builder /src/LICENSE /usr/share/licenses/minio/LICENSE
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.revision="19387cafab76133c2e7642de4aac8c81b9f4f8c7" \
      org.opencontainers.image.version="RELEASE.2024-01-18T22-51-28Z"
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
