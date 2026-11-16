# Local Jenkins controller with the toolchain this repo's CI needs
# (Python 3.12 via uv, Node 22, pnpm via corepack). Build from repo root:
#   docker build -t jenkins-truelook docker/jenkins
FROM jenkins/jenkins:lts-jdk21

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg git \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && corepack enable \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python
RUN uv python install 3.12 && chmod -R a+rX /opt/uv-python

# Docker CLI only (talks to the host daemon through the mounted socket);
# used by the MariaDB integration stage to start a disposable database.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker

USER jenkins
