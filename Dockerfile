FROM node:24-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /repo

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/package.json
COPY shared/package.json shared/package.json
COPY features/agenda/package.json features/agenda/package.json
COPY features/booking/package.json features/booking/package.json
COPY features/conversation/package.json features/conversation/package.json
COPY features/directory/package.json features/directory/package.json
COPY features/inbox/package.json features/inbox/package.json
COPY features/profile/package.json features/profile/package.json
COPY features/reminders/package.json features/reminders/package.json
COPY features/triage/package.json features/triage/package.json
COPY features/vault/package.json features/vault/package.json
COPY features/voice/package.json features/voice/package.json
RUN pnpm install --frozen-lockfile

FROM base AS build

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/app/node_modules ./app/node_modules
COPY --from=deps /repo/shared/node_modules ./shared/node_modules
COPY --from=deps /repo/features ./features
COPY . .
RUN pnpm --filter @steve/app build

FROM node:24-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=build --chown=node:node /repo/app/.next/standalone ./
COPY --from=build --chown=node:node /repo/app/.next/static ./app/.next/static
COPY --from=build --chown=node:node /repo/app/public ./app/public

USER node
EXPOSE 3000

CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node app/server.js"]
