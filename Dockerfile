FROM node:22-bookworm-slim

# ffmpeg for video processing (sharp ships its own libvips binaries)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production PORT=3000 FFMPEG_PATH=/usr/bin/ffmpeg

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && mkdir -p /app/uploads

# Uploaded media lives outside the container. The database is PostgreSQL (DATABASE_URL).
VOLUME ["/app/uploads"]
EXPOSE 3000
CMD ["npm", "start"]
