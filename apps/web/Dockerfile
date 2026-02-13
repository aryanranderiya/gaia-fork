FROM node:24-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# ===================================
# Stage 1: Dependencies
# ===================================
FROM base AS deps
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/cli/package.json ./packages/cli/

# Install dependencies
RUN pnpm install --frozen-lockfile

# ===================================
# Stage 2: Builder
# ===================================
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy source files
COPY . .

# Build argument for Next.js public env var (baked into static build)
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1/

ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Build the web app with standalone output
WORKDIR /app/apps/web
RUN pnpm build

# ===================================
# Stage 3: Runner
# ===================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

# Start Next.js server using standalone output
CMD ["node", "apps/web/server.js"]