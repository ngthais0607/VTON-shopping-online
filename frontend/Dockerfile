# Stage 1: Build dependencies and Next.js bundle
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_IMAGE_HOST=http://localhost:9000
ENV NEXT_PUBLIC_IMAGE_HOST=$NEXT_PUBLIC_IMAGE_HOST
ARG NEXT_PUBLIC_ANALYTICS_ENABLED=false
ENV NEXT_PUBLIC_ANALYTICS_ENABLED=$NEXT_PUBLIC_ANALYTICS_ENABLED
ARG MINIO_INTERNAL_URL=http://localhost:9000
ARG MINIO_BUCKET=product-images
ENV MINIO_INTERNAL_URL=$MINIO_INTERNAL_URL
ENV MINIO_BUCKET=$MINIO_BUCKET

COPY . .
RUN pnpm run build

# Stage 2: Production runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

ARG NEXT_PUBLIC_IMAGE_HOST=http://localhost:9000
ARG MINIO_INTERNAL_URL=http://localhost:9000
ARG MINIO_BUCKET=product-images
ENV NEXT_PUBLIC_IMAGE_HOST=$NEXT_PUBLIC_IMAGE_HOST
ENV MINIO_INTERNAL_URL=$MINIO_INTERNAL_URL
ENV MINIO_BUCKET=$MINIO_BUCKET

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => { if (res.statusCode < 400) process.exit(0); else process.exit(1); }).on('error', () => process.exit(1));"

CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
