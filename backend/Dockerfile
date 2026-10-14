# Stage 1: Build dependencies
FROM python:3.11-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Production runtime
FROM python:3.11-slim AS runner

WORKDIR /app

# Create non-root user and group
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --gid 1001 appuser

# Copy installed python dependencies from builder
COPY --from=builder /root/.local /home/appuser/.local

# Copy application source
COPY . .

# Ensure app directory permissions
RUN chown -R appuser:appgroup /app /home/appuser

USER appuser
ENV PATH="/home/appuser/.local/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
ENV FORWARDED_ALLOW_IPS=""

CMD ["sh", "-c", "if [ -n \"$FORWARDED_ALLOW_IPS\" ]; then exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"$FORWARDED_ALLOW_IPS\"; else exec uvicorn app.main:app --host 0.0.0.0 --port 8000; fi"]
