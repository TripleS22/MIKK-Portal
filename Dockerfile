# syntax=docker/dockerfile:1
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY db ./db

RUN mkdir -p uploads

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "server/index.js"]
