FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace backend --include-workspace-root=false
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate --schema prisma/schema.postgres.prisma
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/index.js"]
