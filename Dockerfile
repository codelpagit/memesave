# Multi-stage build: React build + Node.js server
FROM node:18-alpine AS build

# Frontend build stage
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Backend + Frontend serve stage
FROM node:18-alpine AS production

WORKDIR /app

# Backend dependencies
COPY server/package*.json ./
RUN npm ci --only=production

# Backend kodu
COPY server/ ./

# Frontend build dosyalarını kopyala
COPY --from=build /app/client/build ./client/build

# Assets'ı kopyala (meme-templates + sounds)
COPY assets ./assets

# Assets klasörü için placeholder (varsa sorun olmaz)
RUN mkdir -p assets/meme-templates assets/sounds

# Port expose
EXPOSE 8080

# Production ortamı ayarla
ENV NODE_ENV=production

# Sunucuyu başlat
CMD ["npm", "start"]