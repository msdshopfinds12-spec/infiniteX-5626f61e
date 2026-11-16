FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY server/package*.json ./
RUN npm install --no-audit --no-fund

COPY server/ ./
RUN npm run build && npm prune --omit=dev

EXPOSE 3000
CMD ["npm", "start"]
