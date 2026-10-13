# Mahjong Online — zero-dependency Node.js app.
FROM node:20-alpine

WORKDIR /app

# No runtime dependencies, so copying package.json is enough for metadata.
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

# The server reads PORT from the environment (defaults to 3000).
CMD ["node", "server.js"]
