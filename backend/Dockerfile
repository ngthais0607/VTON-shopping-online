# Stage 1: Build dependencies
FROM python:3.12-slim AS builder

WORKDIR /build

COPY requirements-lock.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir --require-hashes -r requirements-lock.txt && /opt/venv/bin/pip check

# Stage 2: Production runtime
FROM python:3.12-slim AS runner

WORKDIR /app

# Create non-root user and group
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --gid 1001 appuser

# Copy installed python dependencies from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application source
COPY . .

# Ensure app directory permissions
RUN chown -R appuser:appgroup /app

USER appuser
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
ENV FORWARDED_ALLOW_IPS=""

CMD ["sh", "-c", "if [ -n \"$FORWARDED_ALLOW_IPS\" ]; then exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"$FORWARDED_ALLOW_IPS\"; else exec uvicorn app.main:app --host 0.0.0.0 --port 8000; fi"]
