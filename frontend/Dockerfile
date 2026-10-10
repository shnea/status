ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /source
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /source/.next/standalone ./
COPY --from=build --chown=node:node /source/.next/static ./.next/static
COPY --from=build --chown=node:node /source/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
