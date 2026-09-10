FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY src ./src
RUN mkdir -p /data/sessions

EXPOSE 5050

CMD ["node", "src/server.js"]
