# Vokabelgarten: kleiner Node.js-Server, liefert die PWA aus und spricht mit der Claude API.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Abhängigkeiten zuerst (besseres Caching). postinstall kopiert Tesseract und Schriften nach public/vendor.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public
COPY examples ./examples

USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
