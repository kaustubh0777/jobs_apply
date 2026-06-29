# Stage 1: Build the frontend static files
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Create the lightweight production container
FROM node:20-slim
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled frontend from Stage 1
COPY --from=builder /app/dist ./dist

# Copy backend scripts, data, and server entrypoint
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/data ./src/data
COPY server.js ./

# Set environment defaults
EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server.js"]
