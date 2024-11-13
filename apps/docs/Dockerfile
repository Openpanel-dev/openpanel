FROM node:18-alpine

WORKDIR /app

COPY apps/docs/package.json package.json
RUN npm install --production
COPY apps/docs/index.js index.js

EXPOSE 3000

CMD ["node", "index.js"]
