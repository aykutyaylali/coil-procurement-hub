# ==========================================================================
# Coil Procurement Hub - Üretim Dockerfile (çok aşamalı)
# NOT: PostgreSQL kullanmak için prisma/schema.prisma içindeki
#   datasource db { provider = "postgresql" }
# olmalı ve DATABASE_URL PostgreSQL'e işaret etmelidir (bkz. docs/deployment.md).
# ==========================================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Docker/deploy build'i standalone çıktı üretir (server.js). Lokal `next start` etkilenmez.
ENV NEXT_OUTPUT_STANDALONE=true
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Next.js standalone çıktısı
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma şeması ve motoru (migrate/generate için)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
