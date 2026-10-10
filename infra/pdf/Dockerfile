FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server.mjs ./
USER pwuser
EXPOSE 3001
CMD ["node", "server.mjs"]
