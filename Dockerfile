# syntax=docker/dockerfile:1
FROM node:alpine

COPY ./cadence-brain ./Cadence-Brain
COPY ./cadence-proto  ./cadence-proto
COPY . ./cadence-cron
WORKDIR /Cadence-Brain
RUN npm install --production
WORKDIR /cadence-cron
ENV NODE_ENV=production
RUN npm install --production

CMD ["node", "src/index.js"]