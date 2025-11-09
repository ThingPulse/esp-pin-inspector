# Stage 1: Build the Angular application
FROM node:18-alpine AS builder

# Build arguments for cache busting
ARG BUILD_DATE
ARG GIT_COMMIT
ENV BUILD_DATE=$BUILD_DATE
ENV GIT_COMMIT=$GIT_COMMIT

WORKDIR /app

# Install system dependencies for native modules (canvas, puppeteer)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    git

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Ensure optional dependencies are installed (needed for @rollup/rollup-linux-x64-musl)
ENV npm_config_optional=true

# Copy package files
COPY package*.json ./

# Install dependencies with progress output
# Use npm install instead of npm ci to ensure optional deps are installed
RUN npm install --legacy-peer-deps --progress=true --loglevel=warn

# Explicitly install rollup platform packages for Alpine (workaround for npm bug)
# Install for both amd64 and arm64 architectures
RUN npm install @rollup/rollup-linux-x64-musl @rollup/rollup-linux-arm64-musl --save-optional --legacy-peer-deps --progress=true || true

# Copy source code
COPY . .

# Build the application in production mode
# Using --configuration production ensures proper optimization and cache busting
RUN npm run build -- --configuration production

# Verify the dist folder was created and contains files
RUN ls -la dist/esp-pin-inspector/ && \
    test -f dist/esp-pin-inspector/index.html || (echo "ERROR: Build failed - dist folder missing or incomplete" && exit 1)

# Stage 2: Serve with nginx
FROM nginx:alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder /app/dist/esp-pin-inspector /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

