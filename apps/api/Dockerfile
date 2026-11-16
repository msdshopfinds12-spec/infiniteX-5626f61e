FROM node:22-alpine AS build
WORKDIR /app
COPY apps/api/package.json ./
RUN npm install --no-audit --no-fund
COPY apps/api/ ./
RUN npm run build
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY apps/api/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node","dist/server.js"]