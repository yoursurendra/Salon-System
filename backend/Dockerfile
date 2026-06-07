FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache optimization)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
