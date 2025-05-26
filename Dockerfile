FROM selenium/node-chrome:103.0-20250515

USER root
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

RUN npm install -g typescript

WORKDIR /app

COPY package*.json ./

RUN npm install --force

COPY . .

RUN npx tsc

CMD [ "node", "dist/main.js" ]
